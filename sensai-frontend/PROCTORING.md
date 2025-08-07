# Proctoring System

This system provides AI-powered proctoring capabilities for online assessments, detecting potential integrity violations during tests.

## Features

- ✅ Face detection and tracking
- 👀 Gaze direction monitoring
- 👄 Mouth movement detection (talking)
- 👥 Multiple person detection
- 📝 Activity logging with timestamps
- 🚦 Real-time alerts for suspicious activities

## Setup

1. **Install Dependencies**

   ```bash
   npm install face-api.js
   ```

2. **Download Models**

   Run the following command to download the required machine learning models:

   ```bash
   node public/models/download-models.js
   ```

   This will download the necessary model files to the `public/models` directory.

3. **Environment Variables**

   No additional environment variables are required for basic functionality.

## Usage

1. **Initialize the Proctoring Service**

   ```typescript
   import { ProctoringService } from '@/lib/proctoring/proctoringService';
   
   const proctoringService = new ProctoringService({
     onEvent: (event) => {
       console.log('Proctoring event:', event);
     },
     detectionInterval: 1000, // Check every second
     gazeThreshold: 0.4, // Sensitivity for gaze detection
     mouthOpenThreshold: 0.5, // Sensitivity for mouth open detection
   });
   
   // Initialize with video element
   await proctoringService.initialize(videoElement);
   ```

2. **Start/Stop Monitoring**

   ```typescript
   // Start monitoring
   proctoringService.startMonitoring();
   
   // Stop monitoring
   proctoringService.stopMonitoring();
   ```

3. **Handle Events**

   The `onEvent` callback will be called with events like:
   - `face_detected`: When a face is detected
   - `face_not_detected`: When no face is detected
   - `multiple_faces`: When multiple faces are detected
   - `gaze_direction`: When the user looks away from the screen
   - `mouth_open`: When the user is talking
   - `device_detected`: When a potential unauthorized device is detected

## Integration with Assessment Flow

1. Add a proctoring setup step before starting the assessment
2. Request camera permissions and initialize the proctoring service
3. Show real-time feedback to the user about monitoring status
4. Log all proctoring events for review
5. Provide options to pause/resume monitoring if needed

## Customization

You can customize the sensitivity of detections by adjusting:

- `detectionInterval`: How often to check for violations (in ms)
- `gazeThreshold`: Lower values make gaze detection more sensitive
- `mouthOpenThreshold`: Lower values make mouth movement detection more sensitive

## Browser Support

The proctoring system works in modern browsers with WebRTC support:
- Chrome 60+
- Firefox 52+
- Edge 79+
- Safari 12.2+

## Privacy Considerations

- All processing happens in the browser
- No video or images are stored or transmitted to any server
- Only detection events are logged
- Users must explicitly grant camera permissions

## Troubleshooting

### Camera Access Issues
- Ensure the browser has camera permissions
- Make sure no other application is using the camera
- Try a different browser if issues persist

### Model Loading Issues
- Ensure all model files are downloaded to `public/models`
- Check browser console for any loading errors
- Verify CORS headers if loading from a different domain

## License

This project is licensed under the MIT License.
