# Visual Proctoring System Setup Guide

This guide provides comprehensive instructions for setting up and using the enhanced real-time visual proctoring module for assessments.

## 🚀 Features Implemented

✅ **Face Detection** - Detects face presence and flags when no face is visible for >3 seconds
✅ **Face Movement & Direction** - Tracks head pose, detects not facing forward or head tilt
✅ **Eye Tracking (Gaze Detection)** - Monitors gaze vector, flags when eyes are off-screen >5 seconds
✅ **Mouth Movement Detection** - Detects lip movement as proxy for speaking
✅ **Multiple People Detection** - Flags when >1 face is detected
✅ **Unauthorized Object Detection** - Uses YOLO to detect phones, tablets, books
✅ **Live Overlay Display** - Shows current flags in top-left corner of webcam preview
✅ **Real-time Logging** - All events logged to `/test-integrity` system with timestamp and event type

## 🏗️ Architecture

### Backend (Python + FastAPI)
- **Location**: `sensai-ai/src/api/routes/visual_proctoring.py`
- **Models**: MediaPipe (face mesh, landmarks), OpenCV, YOLOv8 (object detection)
- **WebSocket**: Real-time frame processing and flag communication
- **Integration**: Connected to existing `/test-integrity` logging system

### Frontend (React + Next.js)
- **Component**: `sensai-frontend/src/components/VisualProctoringInterface.tsx`
- **Test Page**: `sensai-frontend/src/app/test-visual-proctoring/page.tsx`
- **Features**: Live video preview, real-time flag overlay, statistics dashboard

## 📦 Installation & Setup

### 1. Backend Dependencies

Install visual proctoring dependencies:

```bash
cd sensai-ai
pip install -r requirements-visual-proctoring.txt
```

Required packages:
- opencv-python==4.8.1.78
- mediapipe==0.10.7  
- ultralytics==8.0.200 (for YOLO object detection)
- torch>=2.0.0
- Pillow==10.0.1

### 2. YOLO Model Download (Optional but Recommended)

The system will automatically download YOLOv8 nano model on first use:

```python
# This happens automatically when the service starts
from ultralytics import YOLO
model = YOLO('yolov8n.pt')  # Downloads ~6MB model
```

### 3. Start Backend Server

```bash
cd sensai-ai
# Activate virtual environment
venv/Scripts/activate  # Windows
# or
source venv/bin/activate  # Linux/Mac

# Start server on port 8001
cd src
uvicorn api.main:app --reload --port 8001
```

### 4. Frontend Setup

The visual proctoring interface is already integrated. No additional setup needed for React components.

## 🔧 Configuration

### Proctoring Thresholds (Configurable)

Located in `ProctoringConfig` class in `visual_proctoring.py`:

```python
class ProctoringConfig:
    NO_FACE_TIMEOUT = 3.0          # seconds before flagging no face
    HEAD_TURN_THRESHOLD = 0.3      # head pose deviation threshold  
    HEAD_TILT_THRESHOLD = 0.25     # head tilt threshold
    GAZE_OFF_SCREEN_THRESHOLD = 0.4  # gaze deviation threshold
    GAZE_OFF_SCREEN_TIMEOUT = 5.0    # seconds before flagging gaze
    MOUTH_OPEN_THRESHOLD = 0.02      # mouth aspect ratio for talking
    DEVICE_DETECTION_CONFIDENCE = 0.5 # YOLO confidence threshold
```

### Detected Object Classes

```python
DEVICE_CLASSES = ['cell phone', 'laptop', 'tablet', 'book']
```

## 🚦 Usage

### 1. Testing the System

Visit the test page: http://localhost:3000/test-visual-proctoring

### 2. Integration with Assessments

Add the component to any assessment page:

```tsx
import VisualProctoringInterface from '@/components/VisualProctoringInterface';

// In your assessment component
<VisualProctoringInterface
    sessionId={sessionId}
    userId={userId}
    onFlagDetected={(flag) => console.log('Flag detected:', flag)}
    minimized={true}  // For minimal overlay during test
    autoStart={true}
/>
```

### 3. Backend API Endpoints

#### WebSocket (Real-time)
- `ws://localhost:8001/visual-proctoring/live/{session_id}?user_id={user_id}`

#### HTTP Endpoints
- `GET /visual-proctoring/health` - Health check
- `GET /visual-proctoring/config` - Get configuration
- `POST /visual-proctoring/analyze-frame` - Single frame analysis (testing)

## 📊 Detection Types & Logging

All detections are automatically logged to the integrity system:

### 1. Face Detection
- **Type**: `no_face_detected`
- **Trigger**: No face visible for >3 seconds
- **Severity**: High
- **Logged to**: `IntegrityEventType.CAMERA_TAMPERING`

### 2. Head Movement
- **Types**: `head_turned`, `head_tilted`
- **Trigger**: Head not facing screen or tilted beyond threshold
- **Severity**: Medium
- **Logged to**: `IntegrityEventType.SUSPICIOUS_BEHAVIOR`

### 3. Gaze Tracking
- **Type**: `eyes_off_screen`
- **Trigger**: Eyes looking away from screen >5 seconds
- **Severity**: Medium
- **Logged to**: `IntegrityEventType.FOCUS_LOSS`

### 4. Mouth Movement
- **Type**: `mouth_movement_detected`
- **Trigger**: Sustained mouth opening (talking)
- **Severity**: Medium
- **Logged to**: `IntegrityEventType.AUDIO_ANOMALY`

### 5. Multiple People
- **Type**: `multiple_people_detected`
- **Trigger**: >1 face detected simultaneously
- **Severity**: Critical
- **Logged to**: `IntegrityEventType.UNAUTHORIZED_ASSISTANCE`

### 6. Unauthorized Devices
- **Type**: `unauthorized_device_detected`
- **Trigger**: Phone/tablet/laptop detected by YOLO
- **Severity**: Critical
- **Logged to**: `IntegrityEventType.DEVICE_SWITCHING`

## 🎯 Live Overlay Display

The system shows real-time status in the top-left corner of the video feed:

- **"NO FACE DETECTED"** - Red warning when no face is visible
- **"MULTIPLE PEOPLE (2)"** - Critical alert for multiple faces
- **"LOOKING LEFT/RIGHT/UP/DOWN"** - Gaze direction status
- **"SPEAKING DETECTED"** - Mouth movement indicator
- **"QUIET"** - Normal mouth status

## 📈 Performance & Optimization

### Frame Processing
- **Rate**: ~10 FPS (every 3rd frame processed)
- **Resolution**: 640x480 for optimal performance
- **Format**: JPEG compression at 80% quality

### Resource Usage
- **CPU**: MediaPipe is optimized for real-time processing
- **Memory**: ~200MB additional for models
- **Network**: ~50KB/s for frame transmission

## 🔍 Troubleshooting

### Common Issues

1. **Camera Access Denied**
   - Ensure browser permissions for camera access
   - Try HTTPS instead of HTTP for stricter browsers

2. **WebSocket Connection Failed**
   - Check backend server is running on port 8001
   - Verify firewall settings

3. **YOLO Model Not Loading**
   - Check internet connection for initial download
   - Manually download: `pip install ultralytics && python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"`

4. **Poor Detection Accuracy**
   - Ensure good lighting conditions
   - Position camera at eye level
   - Adjust thresholds in `ProctoringConfig`

### Debug Mode

Enable detailed logging:

```python
import logging
logging.getLogger('visual_proctoring').setLevel(logging.DEBUG)
```

## 📚 Integration Examples

### Minimal Integration (Existing Assessment Pages)

```tsx
// Add to existing assessment page
import VisualProctoringInterface from '@/components/VisualProctoringInterface';

// Inside your component
const handleProctoringFlag = (flag) => {
    // Handle detected violations
    console.log(`Proctoring violation: ${flag.message}`);
    // Could show warning to user, pause test, etc.
};

// In render
<VisualProctoringInterface
    sessionId={proctoringSessionId}
    userId={currentUserId}
    onFlagDetected={handleProctoringFlag}
    minimized={true}
    autoStart={true}
/>
```

### Full Integration (New Assessment)

See `src/app/test-visual-proctoring/page.tsx` for complete example with:
- Statistics dashboard
- Real-time flag display
- Test instructions
- Performance metrics

## 🔐 Security Considerations

1. **Data Privacy**: No video frames are stored, only metadata logged
2. **Secure WebSocket**: Use WSS in production
3. **Authentication**: User authentication required via session/JWT
4. **Rate Limiting**: Frame processing throttled to prevent abuse

## 📋 Database Schema Integration

The system uses existing integrity tables:

```sql
-- Events logged to existing table
INSERT INTO integrity_events (
    user_id, session_id, event_type, event_data, 
    confidence_score, created_at
);

-- High-severity flags create integrity flags  
INSERT INTO integrity_flags (
    user_id, session_id, flag_type, severity, 
    confidence_score, evidence_data, ai_analysis
);
```

## 🚀 Deployment Notes

### Production Checklist
- [ ] Use WSS instead of WS
- [ ] Configure proper CORS origins
- [ ] Set up SSL certificates
- [ ] Monitor resource usage
- [ ] Set up log rotation
- [ ] Configure firewall rules
- [ ] Test camera permissions on target browsers

### Scaling Considerations
- Use Redis for session state if scaling horizontally
- Consider GPU acceleration for YOLO in high-volume scenarios
- Implement connection pooling for WebSocket endpoints

## 📞 Support

For issues or questions:
1. Check logs in `sensai-ai/logs/`
2. Test individual components using health endpoints
3. Use the test page at `/test-visual-proctoring` for debugging

---

## 🎯 Testing Guide

### Manual Testing Scenarios

1. **Face Detection Test**:
   - Move away from camera → Should trigger "No face detected"
   - Return to camera → Should clear flag

2. **Head Movement Test**:
   - Turn head left/right → Should trigger "Head turned"
   - Tilt head up/down → Should trigger "Head tilted"

3. **Gaze Test**:
   - Look away from screen for 6+ seconds → Should trigger "Eyes off screen"

4. **Mouth Test**:
   - Speak or open mouth → Should trigger "Speaking detected"

5. **Multiple People Test**:
   - Have someone join you → Should trigger "Multiple people"
   - Show photo of person → May trigger detection

6. **Device Test**:
   - Show phone to camera → Should trigger "Unauthorized device"
   - Hold up tablet/laptop → Should trigger detection

The system is now ready for production use! 🎉
