import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { AlertTriangle, Eye, Users, Camera, Smartphone, Shield, Cpu } from 'lucide-react';
import { 
  MEDIAPIPE_ACCURACY_CONFIG, 
  IRIS_LANDMARKS, 
  ENHANCED_EYE_LANDMARKS,
  OBJECT_CLASSES,
  ACCURACY_VIOLATION_MAPPING,
  MediaPipeAccuracyConfig 
} from '../config/mediapipe-accuracy-config';

// Enhanced interfaces for multiple detection
interface DetectionResults {
  faces: Array<{
    landmarks: any[];
    bbox: any;
    keypoints: any[];
    confidence: number;
  }>;
  poses: Array<{
    landmarks: any[];
    confidence: number;
  }>;
  hands: Array<{
    landmarks: any[];
    handedness: string;
    confidence: number;
  }>;
  objects: Array<{
    bbox: any;
    class: string;
    confidence: number;
  }>;
  segmentationMask?: ImageData;
}

interface ViolationLog {
  id: string;
  type: 'multiple_faces' | 'gaze_tracking' | 'eye_movement' | 'multiple_people' | 'unauthorized_object' | 'no_person';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  description: string;
  confidence: number;
  evidence: any;
  count?: number;
}

interface EnhancedMediaPipeProctoringProps {
  isActive: boolean;
  sessionId: string | null;
  userId: string | number;
  onViolationDetected: (violation: ViolationLog) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export default function EnhancedMediaPipeProctoringInterface({
  isActive,
  sessionId,
  userId,
  onViolationDetected,
  videoRef
}: EnhancedMediaPipeProctoringProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [detectionStats, setDetectionStats] = useState({
    facesDetected: 0,
    peopleDetected: 0,
    objectsDetected: 0,
    gazeViolations: 0,
    processingFPS: 0,
    gpuAccelerated: false
  });

  // Enhanced MediaPipe models
  const [faceDetection, setFaceDetection] = useState<any>(null);
  const [faceMesh, setFaceMesh] = useState<any>(null);
  const [holistic, setHolistic] = useState<any>(null);
  const [objectDetector, setObjectDetector] = useState<any>(null);
  const [hands, setHands] = useState<any>(null);
  
  // Tracking state with improved accuracy
  const lastViolationTime = useRef<{[key: string]: number}>({});
  const gazeBaseline = useRef<{x: number, y: number} | null>(null);
  const processingStartTime = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const detectionHistory = useRef<{
    faces: number[];
    people: number[];
    objects: string[];
  }>({
    faces: [],
    people: [],
    objects: []
  });

  // GPU acceleration check
  const checkGPUSupport = useCallback(async () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const hasGPU = !!gl;
      
      setDetectionStats(prev => ({
        ...prev,
        gpuAccelerated: hasGPU
      }));
      
      console.log('🎯 GPU Support:', hasGPU ? 'Available' : 'Not Available');
      return hasGPU;
    } catch (error) {
      console.warn('GPU detection failed:', error);
      return false;
    }
  }, []);

  // Load enhanced MediaPipe models with GPU support
  useEffect(() => {
    const loadEnhancedMediaPipe = async () => {
      try {
        console.log('🚀 Loading enhanced MediaPipe models...');
        
        const hasGPU = await checkGPUSupport();
        
        // Import MediaPipe modules dynamically
        const { FaceDetection } = await import('@mediapipe/face_detection');
        const { FaceMesh } = await import('@mediapipe/face_mesh');
        const { Holistic } = await import('@mediapipe/holistic');
        const { Hands } = await import('@mediapipe/hands');
        const { Camera } = await import('@mediapipe/camera_utils');

        // Enhanced Face Detection for multiple faces
        const faceDetectionModel = new FaceDetection({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        faceDetectionModel.setOptions({
          model: MEDIAPIPE_ACCURACY_CONFIG.faceDetection.modelSelection === 0 ? 'short' : 'full',
          minDetectionConfidence: MEDIAPIPE_ACCURACY_CONFIG.faceDetection.minDetectionConfidence
        });

        faceDetectionModel.onResults(onFaceDetectionResults);
        setFaceDetection(faceDetectionModel);

        // Enhanced Face Mesh with iris landmarks for gaze
        const faceMeshModel = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMeshModel.setOptions({
          maxNumFaces: MEDIAPIPE_ACCURACY_CONFIG.faceDetection.maxNumFaces,
          refineLandmarks: MEDIAPIPE_ACCURACY_CONFIG.model.refineFaceLandmarks, // Enables iris landmarks
          minDetectionConfidence: MEDIAPIPE_ACCURACY_CONFIG.model.minDetectionConfidence,
          minTrackingConfidence: MEDIAPIPE_ACCURACY_CONFIG.model.minTrackingConfidence
        });

        faceMeshModel.onResults(onFaceMeshResults);
        setFaceMesh(faceMeshModel);

        // Enhanced Holistic for full body detection
        const holisticModel = new Holistic({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
        });

        holisticModel.setOptions({
          modelComplexity: MEDIAPIPE_ACCURACY_CONFIG.model.modelComplexity,
          smoothLandmarks: MEDIAPIPE_ACCURACY_CONFIG.model.smoothLandmarks,
          enableSegmentation: MEDIAPIPE_ACCURACY_CONFIG.model.enableSegmentation,
          smoothSegmentation: MEDIAPIPE_ACCURACY_CONFIG.model.smoothSegmentation,
          refineFaceLandmarks: MEDIAPIPE_ACCURACY_CONFIG.model.refineFaceLandmarks,
          minDetectionConfidence: MEDIAPIPE_ACCURACY_CONFIG.model.minDetectionConfidence,
          minTrackingConfidence: MEDIAPIPE_ACCURACY_CONFIG.model.minTrackingConfidence
        });

        holisticModel.onResults(onHolisticResults);
        setHolistic(holisticModel);

        // Enhanced Hands for object holding detection
        const handsModel = new Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsModel.setOptions({
          maxNumHands: MEDIAPIPE_ACCURACY_CONFIG.handAnalysis.maxNumHands,
          modelComplexity: MEDIAPIPE_ACCURACY_CONFIG.handAnalysis.modelComplexity,
          minDetectionConfidence: MEDIAPIPE_ACCURACY_CONFIG.handAnalysis.minDetectionConfidence,
          minTrackingConfidence: 0.5
        });

        handsModel.onResults(onHandsResults);
        setHands(handsModel);

        // Initialize object detection
        await initializeObjectDetection();

        console.log('✅ Enhanced MediaPipe models loaded successfully');
        console.log(`🎯 Configuration: ${JSON.stringify({
          maxFaces: MEDIAPIPE_ACCURACY_CONFIG.faceDetection.maxNumFaces,
          modelComplexity: MEDIAPIPE_ACCURACY_CONFIG.model.modelComplexity,
          irisLandmarks: MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.useIrisLandmarks,
          gpuEnabled: hasGPU
        }, null, 2)}`);

      } catch (error) {
        console.error('❌ Failed to load enhanced MediaPipe:', error);
      }
    };

    if (isActive) {
      loadEnhancedMediaPipe();
    }

    return () => {
      // Cleanup
      if (faceDetection) faceDetection.close();
      if (faceMesh) faceMesh.close();
      if (holistic) holistic.close();
      if (hands) hands.close();
    };
  }, [isActive]);

  // Initialize object detection with EfficientDet
  const initializeObjectDetection = async () => {
    try {
      // This would use MediaPipe Tasks ObjectDetector
      // For now, using simplified implementation
      console.log('🔍 Object detection initialized for:', MEDIAPIPE_ACCURACY_CONFIG.objectDetection.targetObjects);
    } catch (error) {
      console.error('Failed to initialize object detection:', error);
    }
  };

  // Start enhanced processing pipeline
  useEffect(() => {
    const startEnhancedProcessing = async () => {
      if (!isActive || !videoRef.current) return;

      try {
        const { Camera } = await import('@mediapipe/camera_utils');
        
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && frameCount.current % MEDIAPIPE_ACCURACY_CONFIG.performance.processEveryNthFrame === 0) {
              // Process with multiple models for comprehensive detection
              if (faceDetection) await faceDetection.send({ image: videoRef.current });
              if (faceMesh) await faceMesh.send({ image: videoRef.current });
              if (holistic) await holistic.send({ image: videoRef.current });
              if (hands) await hands.send({ image: videoRef.current });
              
              // Calculate FPS
              const now = performance.now();
              if (frameCount.current === 0) {
                processingStartTime.current = now;
              }
              
              if (frameCount.current > 0 && frameCount.current % 30 === 0) {
                const fps = 30000 / (now - processingStartTime.current);
                setDetectionStats(prev => ({ ...prev, processingFPS: Math.round(fps) }));
                processingStartTime.current = now;
              }
            }
            frameCount.current++;
          },
          width: MEDIAPIPE_ACCURACY_CONFIG.performance.maxProcessingWidth,
          height: MEDIAPIPE_ACCURACY_CONFIG.performance.maxProcessingHeight
        });
        
        await camera.start();
        console.log('🎥 Enhanced processing pipeline started');
        
      } catch (error) {
        console.error('Failed to start enhanced processing:', error);
      }
    };

    startEnhancedProcessing();
  }, [isActive, faceDetection, faceMesh, holistic, hands, videoRef]);

  // Enhanced face detection results handler
  const onFaceDetectionResults = useCallback((results: any) => {
    if (!canvasRef.current || !results.detections) return;

    const faceCount = results.detections.length;
    setDetectionStats(prev => ({ ...prev, facesDetected: faceCount }));

    // Track face count history
    detectionHistory.current.faces.push(faceCount);
    if (detectionHistory.current.faces.length > 10) {
      detectionHistory.current.faces.shift();
    }

    // Multiple faces violation
    if (faceCount > ACCURACY_VIOLATION_MAPPING.multiple_faces.threshold) {
      createEnhancedViolation('multiple_faces', 'critical', 
        `${faceCount} people detected in camera view - only 1 person allowed`, 
        ACCURACY_VIOLATION_MAPPING.multiple_faces.confidence, {
        faceCount,
        detectedFaces: results.detections.map((det: any) => ({
          bbox: det.boundingBox,
          keypoints: det.landmarks,
          confidence: det.score
        }))
      });
    }

    // No face detected
    if (faceCount === 0) {
      const recentHistory = detectionHistory.current.faces.slice(-5);
      const noFaceFrames = recentHistory.filter(count => count === 0).length;
      
      if (noFaceFrames >= ACCURACY_VIOLATION_MAPPING.no_person.confirmationFrames) {
        createEnhancedViolation('no_person', 'critical', 
          'No person detected in camera view - student may have left', 
          ACCURACY_VIOLATION_MAPPING.no_person.confidence, {
          noFaceFrames,
          history: recentHistory
        });
      }
    }

    drawFaceDetections(results.detections);
  }, []);

  // Enhanced face mesh results with iris gaze tracking
  const onFaceMeshResults = useCallback((results: any) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

    // Process each detected face
    results.multiFaceLandmarks.forEach((faceLandmarks: any[], faceIndex: number) => {
      if (MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.useIrisLandmarks) {
        processIrisGazeTracking(faceLandmarks, faceIndex);
      }
      
      drawFaceMesh(faceLandmarks, faceIndex);
    });
  }, []);

  // Enhanced holistic results for people counting
  const onHolisticResults = useCallback((results: any) => {
    let peopleCount = 0;

    // Count people using multiple indicators
    if (results.poseLandmarks) peopleCount++;
    if (results.faceLandmarks && results.poseLandmarks) {
      // Confirmed person with both face and pose
      peopleCount = 1;
    }

    // Use segmentation for additional people detection
    if (results.segmentationMask && MEDIAPIPE_ACCURACY_CONFIG.peopleDetection.enableSegmentation) {
      // Analyze segmentation mask for multiple person silhouettes
      const additionalPeople = analyzeSegmentationForPeople(results.segmentationMask);
      peopleCount += additionalPeople;
    }

    setDetectionStats(prev => ({ ...prev, peopleDetected: peopleCount }));

    // Track people count
    detectionHistory.current.people.push(peopleCount);
    if (detectionHistory.current.people.length > 10) {
      detectionHistory.current.people.shift();
    }

    // Multiple people violation
    if (peopleCount > 1) {
      createEnhancedViolation('multiple_people', 'critical', 
        `${peopleCount} people detected - only 1 person allowed`, 
        0.9, {
        peopleCount,
        detectionMethods: ['pose', 'segmentation'],
        confidence: 0.9
      });
    }

    drawPoseLandmarks(results);
  }, []);

  // Enhanced hands results for object detection
  const onHandsResults = useCallback((results: any) => {
    if (!results.multiHandLandmarks) return;

    results.multiHandLandmarks.forEach((handLandmarks: any[], handIndex: number) => {
      const handedness = results.multiHandedness[handIndex]?.label || 'unknown';
      
      // Analyze hand pose for object holding
      const objectAnalysis = analyzeHandForObjects(handLandmarks, handedness);
      
      if (objectAnalysis.isHoldingObject) {
        createEnhancedViolation('unauthorized_object', 'high', 
          `Potential ${objectAnalysis.objectType} detected in ${handedness} hand`, 
          objectAnalysis.confidence, {
          handSide: handedness,
          objectType: objectAnalysis.objectType,
          confidence: objectAnalysis.confidence,
          gestureAnalysis: objectAnalysis.gesture
        });
        
        setDetectionStats(prev => ({ ...prev, objectsDetected: prev.objectsDetected + 1 }));
      }
      
      drawHandLandmarks(handLandmarks, handedness);
    });
  }, []);

  // Enhanced iris-based gaze tracking
  const processIrisGazeTracking = (faceLandmarks: any[], faceIndex: number) => {
    try {
      if (!faceLandmarks || faceLandmarks.length < 478) return;

      // Get iris landmarks (landmarks 468-477)
      const leftIris = IRIS_LANDMARKS.LEFT_IRIS.map(i => faceLandmarks[i]);
      const rightIris = IRIS_LANDMARKS.RIGHT_IRIS.map(i => faceLandmarks[i]);
      const leftCenter = faceLandmarks[IRIS_LANDMARKS.LEFT_EYE_CENTER];
      const rightCenter = faceLandmarks[IRIS_LANDMARKS.RIGHT_EYE_CENTER];

      if (!leftCenter || !rightCenter) return;

      // Calculate precise gaze direction using iris position
      const gazeVector = calculateIrisGazeDirection(leftIris, rightIris, leftCenter, rightCenter);
      
      // Establish baseline during first 30 frames
      if (!gazeBaseline.current && frameCount.current > 30) {
        gazeBaseline.current = { x: gazeVector.x, y: gazeVector.y };
        console.log('🎯 Gaze baseline established:', gazeBaseline.current);
        return;
      }

      if (!gazeBaseline.current) return;

      // Calculate deviation from baseline
      const deviation = Math.sqrt(
        Math.pow(gazeVector.x - gazeBaseline.current.x, 2) +
        Math.pow(gazeVector.y - gazeBaseline.current.y, 2)
      );

      // Check for gaze violation with enhanced sensitivity
      if (deviation > MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.deviationThreshold) {
        const direction = getGazeDirection(gazeVector);
        
        createEnhancedViolation('gaze_tracking', 'medium', 
          `Gaze deviation detected: looking ${direction}`, 
          ACCURACY_VIOLATION_MAPPING.gaze_deviation.confidence, {
          deviation: Math.round(deviation * 100) / 100,
          direction,
          gazeVector,
          baseline: gazeBaseline.current,
          threshold: MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.deviationThreshold,
          faceIndex,
          irisTracking: true
        });

        setDetectionStats(prev => ({ ...prev, gazeViolations: prev.gazeViolations + 1 }));
      }

      // Draw iris gaze indicators
      drawIrisGazeIndicators(leftIris, rightIris, gazeVector, deviation);

    } catch (error) {
      console.warn('Iris gaze tracking error:', error);
    }
  };

  // Enhanced iris-based gaze calculation
  const calculateIrisGazeDirection = (leftIris: any[], rightIris: any[], leftCenter: any, rightCenter: any) => {
    if (leftIris.length === 0 || rightIris.length === 0) {
      return { x: 0, y: 0 };
    }

    // Calculate iris centers
    const leftIrisCenter = leftIris.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });
    leftIrisCenter.x /= leftIris.length;
    leftIrisCenter.y /= leftIris.length;

    const rightIrisCenter = rightIris.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });
    rightIrisCenter.x /= rightIris.length;
    rightIrisCenter.y /= rightIris.length;

    // Calculate gaze vector relative to eye centers
    const leftGaze = {
      x: leftIrisCenter.x - leftCenter.x,
      y: leftIrisCenter.y - leftCenter.y
    };

    const rightGaze = {
      x: rightIrisCenter.x - rightCenter.x,
      y: rightIrisCenter.y - rightCenter.y
    };

    // Average gaze from both eyes
    return {
      x: (leftGaze.x + rightGaze.x) / 2,
      y: (leftGaze.y + rightGaze.y) / 2
    };
  };

  // Analyze segmentation mask for multiple people
  const analyzeSegmentationForPeople = (segmentationMask: ImageData): number => {
    if (!segmentationMask) return 0;

    try {
      // Simple connected component analysis for multiple person silhouettes
      // This is a simplified implementation - production would use more sophisticated algorithms
      const threshold = 0.5;
      const data = segmentationMask.data;
      let personRegions = 0;

      // Sample analysis - count distinct person regions
      // This would need proper connected component analysis in production
      let currentRegionSize = 0;
      
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255.0;
        if (alpha > threshold) {
          currentRegionSize++;
        } else if (currentRegionSize > 1000) { // Minimum size for person
          personRegions++;
          currentRegionSize = 0;
        }
      }

      // Conservative estimate: if large segmentation area, likely multiple people
      const totalPixels = data.length / 4;
      const segmentedRatio = currentRegionSize / totalPixels;
      
      if (segmentedRatio > 0.4) { // More than 40% of frame
        return Math.min(Math.floor(segmentedRatio / 0.2), 3); // Max 3 additional people
      }

      return 0;
    } catch (error) {
      console.warn('Segmentation analysis error:', error);
      return 0;
    }
  };

  // Analyze hand pose for object holding
  const analyzeHandForObjects = (handLandmarks: any[], handedness: string) => {
    try {
      // Get key hand landmarks
      const wrist = handLandmarks[0];
      const thumb = handLandmarks[4];
      const index = handLandmarks[8];
      const middle = handLandmarks[12];
      const ring = handLandmarks[16];
      const pinky = handLandmarks[20];

      // Calculate finger distances for grip analysis
      const thumbIndexDistance = calculateDistance(thumb, index);
      const thumbMiddleDistance = calculateDistance(thumb, middle);
      const fingerSpread = calculateFingerSpread(handLandmarks);

      // Phone holding pattern: thumb and fingers in grip position
      const isPhoneGrip = thumbIndexDistance < 0.1 && thumbMiddleDistance < 0.12 && fingerSpread < 0.3;
      
      // Book/paper holding: flatter hand position
      const isBookGrip = fingerSpread > 0.4 && thumbIndexDistance > 0.15;

      if (isPhoneGrip) {
        return {
          isHoldingObject: true,
          objectType: 'phone',
          confidence: 0.8,
          gesture: 'grip'
        };
      }

      if (isBookGrip) {
        return {
          isHoldingObject: true,
          objectType: 'book/paper',
          confidence: 0.7,
          gesture: 'flat_hold'
        };
      }

      return {
        isHoldingObject: false,
        objectType: 'none',
        confidence: 0.0,
        gesture: 'open'
      };

    } catch (error) {
      console.warn('Hand analysis error:', error);
      return {
        isHoldingObject: false,
        objectType: 'none',
        confidence: 0.0,
        gesture: 'unknown'
      };
    }
  };

  // Helper functions
  const calculateDistance = (point1: any, point2: any) => {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
  };

  const calculateFingerSpread = (handLandmarks: any[]) => {
    const tips = [4, 8, 12, 16, 20]; // Finger tip landmarks
    let totalSpread = 0;
    
    for (let i = 0; i < tips.length - 1; i++) {
      totalSpread += calculateDistance(handLandmarks[tips[i]], handLandmarks[tips[i + 1]]);
    }
    
    return totalSpread / 4; // Average spread
  };

  const getGazeDirection = (gazeVector: {x: number, y: number}) => {
    const threshold = 0.05;
    
    if (Math.abs(gazeVector.x) > Math.abs(gazeVector.y)) {
      return gazeVector.x > threshold ? 'right' : gazeVector.x < -threshold ? 'left' : 'center';
    } else {
      return gazeVector.y > threshold ? 'down' : gazeVector.y < -threshold ? 'up' : 'center';
    }
  };

  // Enhanced violation creation with throttling
  const createEnhancedViolation = (
    type: ViolationLog['type'],
    severity: ViolationLog['severity'],
    description: string,
    confidence: number,
    evidence: any
  ) => {
    const now = Date.now();
    const lastTime = lastViolationTime.current[type] || 0;
    const throttleTime = getThrottleTime(type);

    if (now - lastTime < throttleTime) {
      return; // Throttled
    }

    lastViolationTime.current[type] = now;

    const violation: ViolationLog = {
      id: `${type}_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      timestamp: new Date().toISOString(),
      description,
      confidence,
      evidence: {
        ...evidence,
        accuracyConfig: true,
        gpuAccelerated: detectionStats.gpuAccelerated,
        processingFPS: detectionStats.processingFPS
      }
    };

    setViolations(prev => [violation, ...prev.slice(0, 49)]);
    onViolationDetected(violation);

    console.log(`🚨 Enhanced violation detected: ${type}`, violation);
  };

  const getThrottleTime = (type: string): number => {
    const baseTime = {
      multiple_faces: 3000,
      gaze_tracking: 2000,
      eye_movement: 5000,
      multiple_people: 3000,
      unauthorized_object: 4000,
      no_person: 5000
    }[type] || 3000;

    return baseTime;
  };

  // Enhanced drawing functions
  const drawFaceDetections = (detections: any[]) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;

    detections.forEach((detection, index) => {
      const bbox = detection.boundingBox;
      const x = bbox.xMin * ctx.canvas.width;
      const y = bbox.yMin * ctx.canvas.height;
      const width = bbox.width * ctx.canvas.width;
      const height = bbox.height * ctx.canvas.height;

      // Draw bounding box
      ctx.strokeRect(x, y, width, height);
      
      // Draw face number
      ctx.fillStyle = '#00FF00';
      ctx.font = '16px Arial';
      ctx.fillText(`Face ${index + 1}`, x, y - 5);

      // Draw confidence
      ctx.fillText(`${Math.round(detection.score * 100)}%`, x, y + height + 20);
    });
  };

  const drawFaceMesh = (faceLandmarks: any[], faceIndex: number) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Draw face mesh outline
    ctx.strokeStyle = faceIndex === 0 ? '#FF0000' : '#0000FF';
    ctx.lineWidth = 1;
    ctx.fillStyle = faceIndex === 0 ? '#FF0000' : '#0000FF';

    // Draw key landmarks
    const keyPoints = [10, 151, 9, 8]; // Nose, chin, etc.
    keyPoints.forEach(index => {
      if (faceLandmarks[index]) {
        const x = faceLandmarks[index].x * ctx.canvas.width;
        const y = faceLandmarks[index].y * ctx.canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  };

  const drawIrisGazeIndicators = (leftIris: any[], rightIris: any[], gazeVector: any, deviation: number) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Draw iris centers
    [leftIris, rightIris].forEach(iris => {
      if (iris.length > 0) {
        const center = iris.reduce((acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y
        }), { x: 0, y: 0 });
        center.x = (center.x / iris.length) * ctx.canvas.width;
        center.y = (center.y / iris.length) * ctx.canvas.height;

        ctx.fillStyle = deviation > MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.deviationThreshold ? '#FF0000' : '#00FFFF';
        ctx.beginPath();
        ctx.arc(center.x, center.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Draw gaze direction vector
    ctx.strokeStyle = deviation > MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.deviationThreshold ? '#FF0000' : '#FFFF00';
    ctx.lineWidth = 3;
    
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const vectorLength = 100;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + gazeVector.x * vectorLength,
      centerY + gazeVector.y * vectorLength
    );
    ctx.stroke();
  };

  const drawPoseLandmarks = (results: any) => {
    if (!canvasRef.current || !results.poseLandmarks) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#FFFF00';
    ctx.fillStyle = '#FFFF00';
    ctx.lineWidth = 2;

    // Draw key pose landmarks
    const keyPoints = [0, 11, 12, 23, 24]; // Nose, shoulders, hips
    keyPoints.forEach(index => {
      if (results.poseLandmarks[index]) {
        const x = results.poseLandmarks[index].x * ctx.canvas.width;
        const y = results.poseLandmarks[index].y * ctx.canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  };

  const drawHandLandmarks = (handLandmarks: any[], handedness: string) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = handedness === 'Left' ? '#FF00FF' : '#00FFFF';
    ctx.fillStyle = handedness === 'Left' ? '#FF00FF' : '#00FFFF';
    ctx.lineWidth = 2;

    // Draw hand landmarks
    handLandmarks.forEach((landmark, index) => {
      const x = landmark.x * ctx.canvas.width;
      const y = landmark.y * ctx.canvas.height;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw hand label
    if (handLandmarks[0]) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px Arial';
      ctx.fillText(
        handedness,
        handLandmarks[0].x * ctx.canvas.width,
        handLandmarks[0].y * ctx.canvas.height - 10
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Enhanced Detection Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Enhanced MediaPipe Proctoring
          </h3>
          <div className="flex items-center gap-2">
            <Cpu className={`h-4 w-4 ${detectionStats.gpuAccelerated ? 'text-green-500' : 'text-red-500'}`} />
            <span className="text-sm">
              {detectionStats.gpuAccelerated ? 'GPU' : 'CPU'}
            </span>
            <span className="text-sm text-gray-600">
              {detectionStats.processingFPS} FPS
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-sm font-medium">Faces</div>
              <div className="text-lg">{detectionStats.facesDetected}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-green-500" />
            <div>
              <div className="text-sm font-medium">People</div>
              <div className="text-lg">{detectionStats.peopleDetected}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-orange-500" />
            <div>
              <div className="text-sm font-medium">Objects</div>
              <div className="text-lg">{detectionStats.objectsDetected}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <div>
              <div className="text-sm font-medium">Gaze Issues</div>
              <div className="text-lg">{detectionStats.gazeViolations}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Enhanced Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-auto pointer-events-none z-10 border-2 border-blue-500 rounded-lg"
          style={{ maxHeight: '400px' }}
        />
      </div>

      {/* Configuration Info */}
      <Card className="p-3">
        <h4 className="font-semibold mb-2">Enhanced Configuration</h4>
        <div className="text-xs space-y-1 text-gray-600">
          <div>Max Faces: {MEDIAPIPE_ACCURACY_CONFIG.faceDetection.maxNumFaces}</div>
          <div>Model Complexity: {MEDIAPIPE_ACCURACY_CONFIG.model.modelComplexity}</div>
          <div>Iris Tracking: {MEDIAPIPE_ACCURACY_CONFIG.gazeTracking.useIrisLandmarks ? 'Enabled' : 'Disabled'}</div>
          <div>Object Detection: {MEDIAPIPE_ACCURACY_CONFIG.objectDetection.enabled ? 'Enabled' : 'Disabled'}</div>
          <div>GPU Acceleration: {detectionStats.gpuAccelerated ? 'Active' : 'Unavailable'}</div>
        </div>
      </Card>

      {/* Recent Violations */}
      {violations.length > 0 && (
        <Card className="p-3">
          <h4 className="font-semibold mb-2">Recent Enhanced Detections</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {violations.slice(0, 3).map((violation) => (
              <div
                key={violation.id}
                className={`text-xs p-2 rounded ${
                  violation.severity === 'critical'
                    ? 'bg-red-100 text-red-800'
                    : violation.severity === 'high'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                <div className="font-medium">{violation.description}</div>
                <div className="opacity-75">
                  Confidence: {Math.round(violation.confidence * 100)}% | 
                  {violation.evidence?.faceCount && ` Faces: ${violation.evidence.faceCount} |`}
                  {violation.evidence?.peopleCount && ` People: ${violation.evidence.peopleCount} |`}
                  {violation.evidence?.irisTracking && ` Iris Tracking |`}
                  {violation.evidence?.gpuAccelerated && ` GPU Accelerated`}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
