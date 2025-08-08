/**
 * MediaPipe Accuracy-Optimized Configuration
 * 
 * Based on MediaPipe documentation research and optimal parameters for:
 * - Multiple face detection (max_num_faces support)
 * - Accurate gaze tracking using iris landmarks
 * - Object detection for phones/devices
 * - GPU acceleration for better performance
 * - Improved people counting and detection
 * 
 * Research Sources:
 * - MediaPipe Face Detection: Supports multiple faces with max_num_faces
 * - MediaPipe Holistic: model_complexity=2 for best accuracy
 * - MediaPipe Objectron: For phone/device detection
 * - GPU acceleration: Available for most models
 * - Iris landmarks: For precise gaze tracking (refine_landmarks=true)
 */

export interface MediaPipeAccuracyConfig {
  // Model Configuration (Accuracy-optimized)
  model: {
    // Use highest complexity for best accuracy
    modelComplexity: 0 | 1 | 2;           // 2 for best accuracy
    smoothLandmarks: boolean;          // Enable smoothing
    enableSegmentation: boolean;       // Enable for people detection
    smoothSegmentation: boolean;       // Smooth segmentation
    refineFaceLandmarks: boolean;      // Enable iris landmarks for gaze
    minDetectionConfidence: number;    // Lowered for better detection
    minTrackingConfidence: number;     // Optimized tracking
  };

  // GPU Acceleration (Critical for performance)
  gpu: {
    enabled: boolean;                  // Enable GPU acceleration
    preferredBackend: string;          // 'webgl' for web
    forceGPU: boolean;                // Force GPU usage
  };

  // Multi-Face Detection (Fixed issue)
  faceDetection: {
    maxNumFaces: number;              // Support multiple faces
    modelSelection: 0 | 1;            // 0=short range, 1=full range (5m)
    minDetectionConfidence: number;    // Lowered for better detection
    staticImageMode: boolean;         // False for video streams
  };

  // Accurate Gaze Tracking with Iris
  gazeTracking: {
    useIrisLandmarks: boolean;        // Use iris for precise gaze
    deviationThreshold: number;       // More sensitive for accuracy
    smoothingFrames: number;          // Smoothing window
    calibrationFrames: number;        // Baseline frames
  };

  // Object Detection for Phones/Devices
  objectDetection: {
    enabled: boolean;                 // Enable object detection
    modelPath: string;               // EfficientDet model for phones
    minDetectionConfidence: number;   // Confidence threshold
    maxNumObjects: number;           // Max objects to detect
    targetObjects: string[];         // Phone, tablet, laptop
  };

  // Enhanced People Detection
  peopleDetection: {
    usePoseAndFace: boolean;         // Combine pose + face for accuracy
    maxNumPeople: number;            // Support multiple people
    enableSegmentation: boolean;      // Use segmentation for counting
    confirmationFrames: number;       // Frames to confirm detection
  };

  // Hand Analysis for Object Holding
  handAnalysis: {
    maxNumHands: number;             // Detect multiple hands
    modelComplexity: 0 | 1;          // Hand model complexity
    minDetectionConfidence: number;   // Hand detection threshold
    analyzeGestures: boolean;         // Analyze holding gestures
  };

  // Performance vs Accuracy Balance
  performance: {
    processEveryNthFrame: number;     // Reduced for accuracy
    maxProcessingWidth: number;       // Higher resolution
    maxProcessingHeight: number;      // Higher resolution
    enableMultiThreading: boolean;    // Use multiple threads
  };
}

/**
 * Research-backed accuracy-optimized configuration
 * Based on MediaPipe documentation and best practices
 */
export const MEDIAPIPE_ACCURACY_CONFIG: MediaPipeAccuracyConfig = {
  // High accuracy model settings
  model: {
    modelComplexity: 2,                    // Highest accuracy (was 0)
    smoothLandmarks: true,                 // Reduce jitter
    enableSegmentation: true,              // Enable for people detection
    smoothSegmentation: true,              // Smooth segmentation
    refineFaceLandmarks: true,             // CRITICAL: Enable iris landmarks
    minDetectionConfidence: 0.3,           // Lower for better detection (was 0.7)
    minTrackingConfidence: 0.3             // Lower for better tracking (was 0.7)
  },

  // GPU acceleration for performance
  gpu: {
    enabled: true,                         // Enable GPU
    preferredBackend: 'webgl',             // Web GPU backend
    forceGPU: true                         // Force GPU usage
  },

  // Multi-face detection (FIXED)
  faceDetection: {
    maxNumFaces: 5,                        // Support up to 5 faces (was 1)
    modelSelection: 1,                     // Full range model (5m range)
    minDetectionConfidence: 0.3,           // Lower threshold for detection
    staticImageMode: false                 // Video stream mode
  },

  // Accurate gaze tracking with iris
  gazeTracking: {
    useIrisLandmarks: true,                // Use iris for precision gaze
    deviationThreshold: 0.15,              // More sensitive (was 0.25)
    smoothingFrames: 3,                    // Reduced smoothing for accuracy
    calibrationFrames: 30                  // Baseline establishment
  },

  // Object detection for phones/devices (NEW)
  objectDetection: {
    enabled: true,                         // Enable object detection
    modelPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
    minDetectionConfidence: 0.4,           // Detection threshold
    maxNumObjects: 10,                     // Detect up to 10 objects
    targetObjects: ['cell phone', 'laptop', 'book', 'remote']
  },

  // Enhanced people detection (FIXED)
  peopleDetection: {
    usePoseAndFace: true,                  // Combine detection methods
    maxNumPeople: 10,                      // Support multiple people
    enableSegmentation: true,              // Use segmentation for counting
    confirmationFrames: 5                  // Quick confirmation
  },

  // Hand analysis for object holding
  handAnalysis: {
    maxNumHands: 4,                        // Multiple hands (2 people)
    modelComplexity: 1,                    // High accuracy hands
    minDetectionConfidence: 0.3,           // Lower threshold
    analyzeGestures: true                  // Analyze holding patterns
  },

  // Performance settings (optimized for accuracy)
  performance: {
    processEveryNthFrame: 1,               // Process every frame for accuracy
    maxProcessingWidth: 1280,              // Higher resolution
    maxProcessingHeight: 720,              // Higher resolution
    enableMultiThreading: true             // Use multiple threads
  }
};

/**
 * Iris landmark indices for precise gaze tracking
 * MediaPipe Face Mesh provides 478 landmarks including iris
 */
export const IRIS_LANDMARKS = {
  LEFT_IRIS: [474, 475, 476, 477],         // Left iris landmarks
  RIGHT_IRIS: [469, 470, 471, 472],        // Right iris landmarks
  LEFT_EYE_CENTER: 468,                    // Left eye center
  RIGHT_EYE_CENTER: 473                    // Right eye center
};

/**
 * Enhanced eye landmark indices for accurate EAR calculation
 */
export const ENHANCED_EYE_LANDMARKS = {
  LEFT_EYE: {
    OUTER: 33, INNER: 133,
    TOP: [159, 158, 157, 173],
    BOTTOM: [144, 145, 153, 154]
  },
  RIGHT_EYE: {
    OUTER: 362, INNER: 263, 
    TOP: [386, 387, 388, 466],
    BOTTOM: [374, 380, 381, 382]
  }
};

/**
 * Object detection class mappings for COCO dataset
 * EfficientDet can detect 80+ object classes
 */
export const OBJECT_CLASSES = {
  ELECTRONIC_DEVICES: {
    'cell phone': 77,
    'laptop': 73,
    'remote': 75,
    'keyboard': 76,
    'mouse': 74
  },
  PROHIBITED_ITEMS: {
    'book': 84,
    'bottle': 44,
    'cup': 47,
    'bowl': 51
  }
};

/**
 * Violation severity mapping for accuracy-based detection
 */
export const ACCURACY_VIOLATION_MAPPING = {
  multiple_faces: {
    threshold: 2,                          // 2+ faces = violation
    confidence: 0.9,                       // High confidence required
    severity: 'critical'
  },
  gaze_deviation: {
    threshold: 0.15,                       // More sensitive threshold
    confidence: 0.7,                       // Medium confidence
    severity: 'medium'
  },
  object_detection: {
    confidence: 0.4,                       // Lower for better detection
    severity: 'high',
    prohibited: ['cell phone', 'laptop', 'book']
  },
  no_person: {
    confirmationFrames: 10,                // 10 frames to confirm
    confidence: 0.8,
    severity: 'critical'
  }
};

export default MEDIAPIPE_ACCURACY_CONFIG;
