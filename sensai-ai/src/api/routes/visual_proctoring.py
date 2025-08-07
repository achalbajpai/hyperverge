"""
Real-time Visual Proctoring Module for Assessment Integrity
Detects: Face presence, face movement, eye tracking, mouth movement, multiple people, unauthorized devices
"""
import asyncio
import base64
import cv2
import mediapipe as mp
import numpy as np
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query
from pydantic import BaseModel
import logging
import torch
from ultralytics import YOLO
import io
from PIL import Image

# Import existing integrity system
from api.db.integrity import create_integrity_event, create_integrity_flag
from api.models import (
    CreateIntegrityEventRequest, 
    CreateIntegrityFlagRequest,
    IntegrityEventType,
    IntegrityFlagType,
    IntegritySeverity
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize MediaPipe components
mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

class ProctoringConfig:
    """Configuration for proctoring thresholds and parameters"""
    
    # Face detection thresholds
    NO_FACE_TIMEOUT = 3.0  # seconds before flagging no face
    MULTIPLE_FACE_CONFIDENCE = 0.5  # Lower threshold for better detection
    
    # Head movement thresholds  
    HEAD_TURN_THRESHOLD = 0.3  # normalized head pose threshold
    HEAD_TILT_THRESHOLD = 0.25
    
    # Gaze tracking thresholds
    GAZE_OFF_SCREEN_THRESHOLD = 0.4  # eye gaze deviation threshold
    GAZE_OFF_SCREEN_TIMEOUT = 5.0  # seconds before flagging
    
    # Mouth movement detection - improved thresholds
    MOUTH_ASPECT_RATIO_THRESHOLD = 0.025  # More accurate MAR threshold
    MOUTH_OPEN_THRESHOLD = 0.03  # Legacy threshold for compatibility
    MOUTH_OPEN_FRAMES_THRESHOLD = 10  # Number of consecutive frames
    TALKING_DURATION_THRESHOLD = 2.0  # sustained mouth movement
    
    # Object detection (YOLOv8) - improved
    DEVICE_DETECTION_CONFIDENCE = 0.25  # Lower for better detection
    DEVICE_CLASSES = [
        'cell phone', 'laptop', 'tablet', 'book', 'remote', 'mouse', 'keyboard',
        'tv', 'monitor', 'computer', 'smartphone', 'phone', 'ipad', 'macbook',
        'notebook', 'calculator', 'watch', 'headphones', 'earbuds'
    ]
    # COCO class IDs for devices we want to detect
    COCO_DEVICE_IDS = [67, 72, 73, 74, 76, 77, 78]  # cell phone, tv, laptop, mouse, remote, keyboard, book
    YOLO_MODEL_PATH = 'yolov8s.pt'  # Small model for better accuracy

class DetectionState:
    """Maintains state for temporal detection logic"""
    def __init__(self):
        self.last_face_time = datetime.now()
        self.no_face_start = None
        self.gaze_off_start = None  
        self.mouth_open_start = None
        self.last_head_pose = None
        self.detection_history = []
        
    def update_face_detected(self):
        self.last_face_time = datetime.now()
        self.no_face_start = None
        
    def update_no_face(self):
        if self.no_face_start is None:
            self.no_face_start = datetime.now()
            
    def get_no_face_duration(self) -> float:
        if self.no_face_start:
            return (datetime.now() - self.no_face_start).total_seconds()
        return 0.0
        
    def update_gaze_off(self):
        if self.gaze_off_start is None:
            self.gaze_off_start = datetime.now()
            
    def update_gaze_on(self):
        self.gaze_off_start = None
        
    def get_gaze_off_duration(self) -> float:
        if self.gaze_off_start:
            return (datetime.now() - self.gaze_off_start).total_seconds()
        return 0.0

class ProctoringService:
    """Enhanced real-time proctoring service with comprehensive detection"""
    
    def __init__(self):
        # MediaPipe models
        self.face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=3,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.face_detection = mp_face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.7
        )
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # Try to load YOLO model for object detection
        try:
            self.yolo_model = YOLO('yolov8n.pt')  # nano version for speed
            self.yolo_available = True
            logger.info("YOLO model loaded successfully")
        except Exception as e:
            logger.warning(f"YOLO model not available: {e}")
            self.yolo_model = None
            self.yolo_available = False
            
        self.config = ProctoringConfig()
        
    async def process_frame(self, frame_data: str, session_id: str, user_id: int) -> Dict[str, Any]:
        """
        Process a single video frame and return detection results
        """
        try:
            # Decode base64 image
            img_data = base64.b64decode(frame_data.split(',')[1] if ',' in frame_data else frame_data)
            img = Image.open(io.BytesIO(img_data))
            frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            
            results = {
                'timestamp': datetime.now().isoformat(),
                'session_id': session_id,
                'flags': [],
                'overlay_data': {}
            }
            
            # 1. Face Detection and Analysis
            face_results = await self._detect_faces(frame)
            results['flags'].extend(face_results['flags'])
            results['overlay_data'].update(face_results['overlay_data'])
            
            # 2. Object Detection (unauthorized devices)
            if self.yolo_available:
                object_results = await self._detect_unauthorized_objects(frame)
                results['flags'].extend(object_results['flags'])
                results['overlay_data'].update(object_results['overlay_data'])
            
            # Log significant events to integrity system
            for flag in results['flags']:
                if flag['severity'] in ['medium', 'high', 'critical']:
                    await self._log_integrity_event(flag, session_id, user_id)
                    
            return results
            
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            return {'error': str(e), 'flags': [], 'overlay_data': {}}
    
    async def _detect_faces(self, frame) -> Dict[str, Any]:
        """Comprehensive face detection and analysis"""
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = frame.shape[:2]
        
        results = {'flags': [], 'overlay_data': {'faces': []}}
        
        # Face detection using MediaPipe
        face_detections = self.face_detection.process(rgb_frame)
        
        if not face_detections.detections:
            # No face detected
            results['flags'].append({
                'type': 'no_face_detected',
                'severity': 'high',
                'confidence': 0.95,
                'message': 'No face detected in frame',
                'timestamp': datetime.now().isoformat()
            })
            results['overlay_data']['status'] = 'NO FACE DETECTED'
            return results
        
        num_faces = len(face_detections.detections)
        
        # Multiple faces detected
        if num_faces > 1:
            results['flags'].append({
                'type': 'multiple_people_detected', 
                'severity': 'critical',
                'confidence': 0.9,
                'message': f'Multiple people detected ({num_faces} faces)',
                'face_count': num_faces,
                'timestamp': datetime.now().isoformat()
            })
            results['overlay_data']['status'] = f'MULTIPLE PEOPLE ({num_faces})'
        
        # Analyze each face
        for i, detection in enumerate(face_detections.detections):
            face_data = await self._analyze_single_face(rgb_frame, detection, h, w)
            results['flags'].extend(face_data['flags'])
            results['overlay_data']['faces'].append(face_data['face_info'])
            
        # Face mesh analysis for detailed landmarks
        mesh_results = self.face_mesh.process(rgb_frame)
        if mesh_results.multi_face_landmarks:
            for i, face_landmarks in enumerate(mesh_results.multi_face_landmarks):
                face_analysis = await self._analyze_face_landmarks(face_landmarks, h, w)
                results['flags'].extend(face_analysis['flags'])
                
                if i == 0:  # Primary face
                    results['overlay_data'].update(face_analysis['overlay_data'])
        
        return results
    
    async def _analyze_single_face(self, rgb_frame, detection, h, w) -> Dict[str, Any]:
        """Analyze individual face for positioning and orientation"""
        bbox = detection.location_data.relative_bounding_box
        
        # Convert to pixel coordinates
        x = int(bbox.xmin * w)
        y = int(bbox.ymin * h)
        width = int(bbox.width * w) 
        height = int(bbox.height * h)
        
        # Center of face
        center_x = x + width // 2
        center_y = y + height // 2
        
        # Frame center
        frame_center_x = w // 2
        frame_center_y = h // 2
        
        flags = []
        
        # Check if face is centered (not facing screen properly)
        x_deviation = abs(center_x - frame_center_x) / (w / 2)  # normalized 0-1
        y_deviation = abs(center_y - frame_center_y) / (h / 2)
        
        if x_deviation > self.config.HEAD_TURN_THRESHOLD:
            direction = "right" if center_x > frame_center_x else "left"
            flags.append({
                'type': 'head_turned',
                'severity': 'medium',
                'confidence': min(0.9, x_deviation * 2),
                'message': f'Head turned {direction}',
                'direction': direction,
                'deviation': x_deviation,
                'timestamp': datetime.now().isoformat()
            })
            
        if y_deviation > self.config.HEAD_TILT_THRESHOLD:
            direction = "down" if center_y > frame_center_y else "up"  
            flags.append({
                'type': 'head_tilted',
                'severity': 'medium', 
                'confidence': min(0.9, y_deviation * 2),
                'message': f'Head tilted {direction}',
                'direction': direction,
                'deviation': y_deviation,
                'timestamp': datetime.now().isoformat()
            })
        
        face_info = {
            'bbox': [x, y, width, height],
            'center': [center_x, center_y],
            'confidence': detection.score[0] if detection.score else 0.5,
            'x_deviation': x_deviation,
            'y_deviation': y_deviation
        }
        
        return {
            'flags': flags,
            'face_info': face_info
        }
    
    async def _analyze_face_landmarks(self, face_landmarks, h, w) -> Dict[str, Any]:
        """Detailed analysis using face landmarks for gaze and mouth detection"""
        landmarks = face_landmarks.landmark
        flags = []
        overlay_data = {}
        
        # Convert landmarks to pixel coordinates
        points = np.array([(int(lm.x * w), int(lm.y * h)) for lm in landmarks])
        
        # Eye gaze estimation (simplified)
        gaze_analysis = self._estimate_gaze_direction(points)
        if gaze_analysis['off_screen']:
            flags.append({
                'type': 'eyes_off_screen',
                'severity': 'medium',
                'confidence': gaze_analysis['confidence'],
                'message': f'Gaze direction off screen: {gaze_analysis["direction"]}',
                'gaze_vector': gaze_analysis['gaze_vector'],
                'timestamp': datetime.now().isoformat()
            })
            overlay_data['gaze_status'] = f'LOOKING {gaze_analysis["direction"].upper()}'
        else:
            overlay_data['gaze_status'] = 'LOOKING AT SCREEN'
        
        # Mouth movement detection
        mouth_analysis = self._analyze_mouth_movement(points)
        if mouth_analysis['is_talking']:
            flags.append({
                'type': 'mouth_movement_detected',
                'severity': 'medium',
                'confidence': mouth_analysis['confidence'],
                'message': 'Speaking/mouth movement detected',
                'mouth_openness': mouth_analysis['openness'],
                'timestamp': datetime.now().isoformat()
            })
            overlay_data['mouth_status'] = 'SPEAKING DETECTED'
        else:
            overlay_data['mouth_status'] = 'QUIET'
            
        return {
            'flags': flags,
            'overlay_data': overlay_data
        }
    
    def _estimate_gaze_direction(self, points) -> Dict[str, Any]:
        """Estimate gaze direction using eye landmarks"""
        try:
            # Eye landmarks (MediaPipe face mesh indices)
            left_eye_indices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
            right_eye_indices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
            
            # Get eye centers
            left_eye_points = points[left_eye_indices]
            right_eye_points = points[right_eye_indices]
            
            left_eye_center = np.mean(left_eye_points, axis=0)
            right_eye_center = np.mean(right_eye_points, axis=0)
            
            # Calculate eye center
            eye_center = (left_eye_center + right_eye_center) / 2
            
            # Use nose tip as reference (index 1)
            nose_tip = points[1]
            
            # Calculate gaze vector (simplified)
            gaze_x = (eye_center[0] - nose_tip[0]) / 100  # normalize
            gaze_y = (eye_center[1] - nose_tip[1]) / 100
            
            # Determine if looking off screen
            threshold = self.config.GAZE_OFF_SCREEN_THRESHOLD
            off_screen = abs(gaze_x) > threshold or abs(gaze_y) > threshold
            
            # Determine direction
            direction = "center"
            if abs(gaze_x) > abs(gaze_y):
                direction = "right" if gaze_x > 0 else "left"
            else:
                direction = "down" if gaze_y > 0 else "up"
                
            return {
                'off_screen': off_screen,
                'gaze_vector': [float(gaze_x), float(gaze_y)],
                'direction': direction,
                'confidence': min(0.9, max(abs(gaze_x), abs(gaze_y)) / threshold)
            }
            
        except Exception as e:
            logger.error(f"Gaze estimation error: {e}")
            return {'off_screen': False, 'confidence': 0.0, 'direction': 'unknown', 'gaze_vector': [0, 0]}
    
    def _analyze_mouth_movement(self, points) -> Dict[str, Any]:
        """Analyze mouth movement to detect speaking using accurate MediaPipe landmarks"""
        try:
            # MediaPipe face mesh mouth landmarks (more accurate indices)
            # Upper lip: [13, 82, 81, 80, 78]
            # Lower lip: [14, 87, 86, 85, 84]
            # Mouth corners: [61, 291]
            
            # Key mouth landmarks for accurate detection
            upper_lip_top = points[13]      # Top center of upper lip
            upper_lip_bottom = points[12]   # Bottom center of upper lip 
            lower_lip_top = points[15]      # Top center of lower lip
            lower_lip_bottom = points[17]   # Bottom center of lower lip
            
            mouth_left = points[61]         # Left mouth corner
            mouth_right = points[291]       # Right mouth corner
            
            # Calculate vertical mouth opening (inner distance)
            inner_mouth_height = np.linalg.norm(upper_lip_bottom - lower_lip_top)
            
            # Calculate mouth width
            mouth_width = np.linalg.norm(mouth_left - mouth_right)
            
            # Calculate outer mouth height (for reference)
            outer_mouth_height = np.linalg.norm(upper_lip_top - lower_lip_bottom)
            
            # Mouth Aspect Ratio (MAR) - more accurate method
            mouth_aspect_ratio = inner_mouth_height / mouth_width if mouth_width > 0 else 0
            
            # Improved speaking detection using multiple criteria
            mar_threshold = self.config.MOUTH_ASPECT_RATIO_THRESHOLD
            
            # Additional check: mouth opening relative to face size
            # Calculate average distance between eye landmarks for scale reference
            try:
                left_eye_center = np.mean([points[33], points[133]], axis=0)
                right_eye_center = np.mean([points[362], points[263]], axis=0)
                eye_distance = np.linalg.norm(left_eye_center - right_eye_center)
                
                # Normalized mouth opening relative to face size
                normalized_opening = inner_mouth_height / eye_distance if eye_distance > 0 else 0
                
                # Speaking detected if:
                # 1. MAR is above threshold AND
                # 2. Normalized opening is significant relative to face size
                is_talking = (mouth_aspect_ratio > mar_threshold and normalized_opening > 0.02)
                
                # Calculate confidence based on how much above threshold
                confidence = 0.0
                if is_talking:
                    mar_confidence = min(0.9, (mouth_aspect_ratio - mar_threshold) / mar_threshold)
                    norm_confidence = min(0.9, normalized_opening / 0.02)
                    confidence = (mar_confidence + norm_confidence) / 2
                
            except Exception:
                # Fallback to basic MAR if eye detection fails
                is_talking = mouth_aspect_ratio > mar_threshold
                confidence = min(0.9, mouth_aspect_ratio / mar_threshold) if is_talking else 0.0
                normalized_opening = mouth_aspect_ratio
            
            return {
                'is_talking': is_talking,
                'openness': float(mouth_aspect_ratio),
                'normalized_opening': float(normalized_opening),
                'confidence': confidence,
                'mouth_width': float(mouth_width),
                'inner_height': float(inner_mouth_height)
            }
            
        except Exception as e:
            logger.error(f"Mouth analysis error: {e}")
            return {'is_talking': False, 'openness': 0.0, 'confidence': 0.0, 'normalized_opening': 0.0}
    
    async def _detect_unauthorized_objects(self, frame) -> Dict[str, Any]:
        """Enhanced device detection using YOLO with improved phone and device recognition"""
        results = {'flags': [], 'overlay_data': {'objects': []}}
        
        if not self.yolo_available:
            logger.warning("YOLO model not available for device detection")
            return results
            
        try:
            # Resize frame for better detection while maintaining aspect ratio
            h, w = frame.shape[:2]
            if max(h, w) > 640:
                scale = 640 / max(h, w)
                new_h, new_w = int(h * scale), int(w * scale)
                resized_frame = cv2.resize(frame, (new_w, new_h))
            else:
                resized_frame = frame
                scale = 1.0
            
            # Run YOLO detection with enhanced settings
            detections = self.yolo_model(resized_frame, verbose=False, conf=self.config.DEVICE_DETECTION_CONFIDENCE)
            
            logger.info(f"YOLO detected {len(detections[0].boxes) if detections[0].boxes is not None else 0} objects")
            
            for detection in detections:
                boxes = detection.boxes
                if boxes is not None:
                    for box in boxes:
                        # Get class ID, name and confidence
                        class_id = int(box.cls[0])
                        class_name = self.yolo_model.names[class_id]
                        confidence = float(box.conf[0])
                        
                        logger.info(f"Detected object: {class_name} (ID: {class_id}) with confidence: {confidence:.3f}")
                        
                        # Enhanced device detection using both COCO IDs and name matching
                        is_device = False
                        device_severity = 'medium'
                        
                        # Check by COCO class ID (more reliable)
                        if class_id in self.config.COCO_DEVICE_IDS:
                            is_device = True
                            if class_id == 67:  # cell phone
                                device_severity = 'critical'
                                class_name = 'cell phone'  # Ensure consistent naming
                        
                        # Also check by name (backup method)
                        elif any(device_class.lower() in class_name.lower() or class_name.lower() in device_class.lower() 
                               for device_class in self.config.DEVICE_CLASSES):
                            is_device = True
                            # Phones and communication devices are most critical
                            if any(phone_term in class_name.lower() 
                                  for phone_term in ['phone', 'cell', 'mobile', 'smartphone']):
                                device_severity = 'critical'
                            else:
                                device_severity = 'high'
                        
                        if is_device and confidence > self.config.DEVICE_DETECTION_CONFIDENCE:
                            # Scale coordinates back to original frame size
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            if scale != 1.0:
                                x1, y1, x2, y2 = x1/scale, y1/scale, x2/scale, y2/scale
                            
                            # Calculate device area for context
                            device_area = (x2 - x1) * (y2 - y1)
                            frame_area = h * w
                            relative_size = device_area / frame_area
                            
                            flag_data = {
                                'type': 'unauthorized_device_detected',
                                'severity': device_severity,
                                'confidence': confidence,
                                'message': f'🚨 UNAUTHORIZED {class_name.upper()} DETECTED - This is a serious violation!',
                                'device_type': class_name,
                                'coco_class_id': class_id,
                                'bbox': [int(x1), int(y1), int(x2-x1), int(y2-y1)],
                                'relative_size': relative_size,
                                'timestamp': datetime.now().isoformat()
                            }
                            
                            results['flags'].append(flag_data)
                            logger.warning(f"🚨 CRITICAL VIOLATION: {class_name} detected with {confidence:.1%} confidence!")
                            
                            results['overlay_data']['objects'].append({
                                'type': class_name,
                                'confidence': confidence,
                                'bbox': [int(x1), int(y1), int(x2-x1), int(y2-y1)],
                                'severity': device_severity
                            })
                        else:
                            # Log non-device detections for debugging
                            if confidence > 0.5:  # Only log high-confidence non-devices
                                logger.debug(f"Non-device detected: {class_name} (confidence: {confidence:.3f})")
                            
        except Exception as e:
            logger.error(f"Enhanced object detection error: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            
        return results
    
    async def _log_integrity_event(self, flag: Dict, session_id: str, user_id: int):
        """Log significant detection events to the integrity system"""
        try:
            logger.info(f"Logging integrity event: {flag['type']} for user {user_id}, session {session_id}")
            
            # Map flag type to integrity event type
            event_type_mapping = {
                'no_face_detected': IntegrityEventType.CAMERA_TAMPERING,
                'multiple_people_detected': IntegrityEventType.UNAUTHORIZED_ASSISTANCE,
                'head_turned': IntegrityEventType.SUSPICIOUS_BEHAVIOR,
                'head_tilted': IntegrityEventType.SUSPICIOUS_BEHAVIOR,  
                'eyes_off_screen': IntegrityEventType.FOCUS_LOSS,
                'mouth_movement_detected': IntegrityEventType.AUDIO_ANOMALY,
                'unauthorized_device_detected': IntegrityEventType.DEVICE_SWITCHING
            }
            
            event_type = event_type_mapping.get(flag['type'], IntegrityEventType.SUSPICIOUS_BEHAVIOR)
            
            # Create integrity event with proper error handling
            try:
                event_request = CreateIntegrityEventRequest(
                    session_id=session_id,
                    event_type=event_type,
                    event_data=flag,
                    confidence_score=flag['confidence'],
                    question_id=None,
                    task_id=None
                )
                
                integrity_event = await create_integrity_event(user_id, event_request)
                logger.info(f"Successfully created integrity event: {integrity_event.id}")
                
            except Exception as e:
                logger.error(f"Failed to create integrity event: {e}")
                # Continue to try creating flags even if event creation fails
            
            # ALWAYS create integrity flag for ALL detections (for visibility in test-integrity)
            flag_type_mapping = {
                'no_face_detected': IntegrityFlagType.PROCTORING_VIOLATION,
                'multiple_people_detected': IntegrityFlagType.PROCTORING_VIOLATION,
                'unauthorized_device_detected': IntegrityFlagType.DEVICE_USAGE,
                'eyes_off_screen': IntegrityFlagType.BEHAVIORAL_ANOMALY,
                'mouth_movement_detected': IntegrityFlagType.BEHAVIORAL_ANOMALY,
                'head_turned': IntegrityFlagType.BEHAVIORAL_ANOMALY,
                'head_tilted': IntegrityFlagType.BEHAVIORAL_ANOMALY
            }
            
            severity_mapping = {
                'low': IntegritySeverity.LOW,
                'medium': IntegritySeverity.MEDIUM, 
                'high': IntegritySeverity.HIGH,
                'critical': IntegritySeverity.CRITICAL
            }
            
            # Create comprehensive flag with all detection data
            try:
                flag_request = CreateIntegrityFlagRequest(
                    session_id=session_id,
                    flag_type=flag_type_mapping.get(flag['type'], IntegrityFlagType.PROCTORING_VIOLATION),
                    severity=severity_mapping[flag['severity']],
                    confidence_score=flag['confidence'],
                    evidence_data={
                        **flag,
                        'detection_time': datetime.now().isoformat(),
                        'visual_proctoring_version': '2.0',
                        'detection_source': 'MediaPipe + YOLO'
                    },
                    ai_analysis=f"🎥 VISUAL PROCTORING ALERT: {flag['message']}\n" +
                                f"Confidence: {flag['confidence']:.2f}\n" +
                                f"Severity: {flag['severity'].upper()}\n" +
                                f"Session: {session_id}\n" +
                                f"Timestamp: {flag['timestamp']}",
                    question_id=None,
                    task_id=None
                )
                
                integrity_flag = await create_integrity_flag(user_id, flag_request)
                logger.info(f"Successfully created integrity flag: {integrity_flag.id} for {flag['type']}")
                
            except Exception as e:
                logger.error(f"Failed to create integrity flag for {flag['type']}: {e}")
                # Log the exact error details
                import traceback
                logger.error(f"Full traceback: {traceback.format_exc()}")
                
        except Exception as e:
            logger.error(f"Critical error in _log_integrity_event: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")

# Initialize the proctoring service
proctoring_service = ProctoringService()

# WebSocket endpoint for real-time video processing
@router.websocket("/live/{session_id}")
async def websocket_proctoring_endpoint(websocket: WebSocket, session_id: str, user_id: int = Query(...)):
    """
    WebSocket endpoint for real-time video frame processing
    Client sends base64 encoded frames, server responds with detection results
    """
    await websocket.accept()
    logger.info(f"Proctoring WebSocket connected for session {session_id}, user {user_id}")
    
    detection_state = DetectionState()
    frame_count = 0
    
    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_text()
            frame_data = json.loads(data)
            
            if frame_data.get('type') == 'frame':
                frame_count += 1
                
                # Process every nth frame to reduce load (adjust as needed)
                if frame_count % 3 == 0:  # Process every 3rd frame
                    try:
                        # Process the frame
                        results = await proctoring_service.process_frame(
                            frame_data['data'], 
                            session_id, 
                            user_id
                        )
                        
                        # Send results back to client
                        await websocket.send_text(json.dumps({
                            'type': 'detection_results',
                            'data': results,
                            'frame_count': frame_count
                        }))
                        
                    except Exception as e:
                        logger.error(f"Frame processing error: {e}")
                        await websocket.send_text(json.dumps({
                            'type': 'error',
                            'message': str(e)
                        }))
                        
            elif frame_data.get('type') == 'heartbeat':
                # Respond to heartbeat
                await websocket.send_text(json.dumps({
                    'type': 'heartbeat_ack',
                    'timestamp': datetime.now().isoformat()
                }))
                
    except WebSocketDisconnect:
        logger.info(f"Proctoring WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass

# HTTP endpoint for single frame analysis (testing/debug)
class FrameAnalysisRequest(BaseModel):
    frame_data: str  # base64 encoded image
    session_id: str
    user_id: int

@router.post("/analyze-frame")
async def analyze_single_frame(request: FrameAnalysisRequest):
    """
    Analyze a single frame for testing purposes
    """
    try:
        results = await proctoring_service.process_frame(
            request.frame_data,
            request.session_id, 
            request.user_id
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@router.get("/health")
async def proctoring_health_check():
    """Health check for proctoring service"""
    return {
        "status": "healthy",
        "service": "visual_proctoring",
        "models": {
            "mediapipe_face_mesh": True,
            "mediapipe_face_detection": True, 
            "mediapipe_hands": True,
            "yolo": proctoring_service.yolo_available
        },
        "timestamp": datetime.now().isoformat()
    }

# Get proctoring configuration
@router.get("/config")
async def get_proctoring_config():
    """Get current proctoring configuration"""
    return {
        "thresholds": {
            "no_face_timeout": ProctoringConfig.NO_FACE_TIMEOUT,
            "head_turn_threshold": ProctoringConfig.HEAD_TURN_THRESHOLD,
            "gaze_off_screen_threshold": ProctoringConfig.GAZE_OFF_SCREEN_THRESHOLD,
            "gaze_off_screen_timeout": ProctoringConfig.GAZE_OFF_SCREEN_TIMEOUT,
            "mouth_open_threshold": ProctoringConfig.MOUTH_OPEN_THRESHOLD,
            "device_detection_confidence": ProctoringConfig.DEVICE_DETECTION_CONFIDENCE
        },
        "detection_classes": ProctoringConfig.DEVICE_CLASSES
    }
