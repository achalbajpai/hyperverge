import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { AlertTriangle, Eye, Shield, CheckCircle } from 'lucide-react';
import { MEDIAPIPE_SOLUTIONS_CONFIG } from '../config/mediapipe-solutions-config';

// MediaPipe Solutions imports
import { 
  FaceDetector, 
  FaceLandmarker, 
  type FaceLandmarkerResult
} from '@mediapipe/tasks-vision';

interface ViolationLog {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
  description: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

interface CalibrationData {
  userEARBaseline: { left: number; right: number };
  gazeBaseline: { x: number; y: number };
  isCalibrated: boolean;
  calibrationProgress: number;
}

interface MediaPipeSolutionsProctoringProps {
  isActive: boolean;
  sessionId: string;
  userId: number;
  onViolationDetected: (violation: ViolationLog) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  showCalibration?: boolean;
  onCalibrationComplete?: (data: CalibrationData) => void;
}

export default function MediaPipeSolutionsProctoring({
  isActive,
  onViolationDetected,
  videoRef,
  showCalibration = true,
  onCalibrationComplete
}: MediaPipeSolutionsProctoringProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processingRef = useRef<boolean>(false);
  
  // MediaPipe Solutions instances
  const [faceDetector, setFaceDetector] = useState<FaceDetector | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Performance tracking
  const [performanceMetrics, setPerformanceMetrics] = useState({
    averageProcessingTime: 0,
    frameProcessingRate: 0,
    lastProcessingTime: 0,
  });

  // Violation throttling
  const lastViolationTime = useRef<Record<string, { time: number; count: number }>>({});

  // Calibration state
  const [calibration, setCalibration] = useState<CalibrationData>({
    userEARBaseline: { left: 0.25, right: 0.25 },
    gazeBaseline: { x: 0, y: 0 },
    isCalibrated: false,
    calibrationProgress: 0,
  });

  // Face detection state
  const [faceDetectionStats, setFaceDetectionStats] = useState({
    isPresent: false,
    confidence: 0,
    position: { x: 0, y: 0 },
    size: 0,
    lastDetectionTime: 0,
  });

  /**
   * Initialize MediaPipe Solutions
   */
  const initializeMediaPipe = useCallback(async () => {
    try {
      const { FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        MEDIAPIPE_SOLUTIONS_CONFIG.models.wasmPath
      );

      // Initialize Face Detector
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SOLUTIONS_CONFIG.models.faceDetectorPath
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetector.minDetectionConfidence,
        minSuppressionThreshold: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetector.minSuppressionThreshold
      });

      // Initialize Face Landmarker
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SOLUTIONS_CONFIG.models.faceLandmarkerPath
        },
        runningMode: 'VIDEO',
        minFaceDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFaceDetectionConfidence,
        minFacePresenceConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFacePresenceConfidence,
        minTrackingConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minTrackingConfidence,
        outputFaceBlendshapes: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.outputFaceBlendshapes,
        outputFacialTransformationMatrixes: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.outputFacialTransformationMatrixes,
        numFaces: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces
      });

      setFaceDetector(detector);
      setFaceLandmarker(landmarker);
      setIsInitialized(true);

      console.log('✅ MediaPipe Solutions initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MediaPipe Solutions:', error);
    }
  }, []);

  /**
   * Get throttle config key from violation type
   */
  const getThrottleConfigKey = (violationType: string): keyof typeof MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling => {
    const typeMapping: Record<string, keyof typeof MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling> = {
      'face_detection': 'faceDetection',
      'face_not_found': 'faceDetection',
      'multiple_faces': 'multiplePeople',
      'gaze_deviation': 'gazeTracking',
      'gaze_tracking': 'gazeTracking',
      'eye_movement': 'eyeMovement',
      'eye_tracking': 'eyeMovement',
      'unauthorized_object': 'unauthorizedObject',
    };
    
    return typeMapping[violationType] || 'faceDetection';
  };

  /**
   * Create a throttled violation with progressive throttling
   */
  const createThrottledViolation = useCallback((
    type: string,
    severity: 'low' | 'medium' | 'high',
    description: string,
    confidence: number,
    evidence: Record<string, unknown>
  ) => {
    const now = Date.now();
    const violationKey = `${type}_${severity}`;
    
    // Check if violation is throttled
    const lastViolation = lastViolationTime.current[violationKey];
    const throttleConfigKey = getThrottleConfigKey(type);
    const throttleTime = MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling[throttleConfigKey];
    
    if (lastViolation && now - lastViolation.time < throttleTime * Math.pow(MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling.progressiveMultiplier, Math.min(lastViolation.count, MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling.maxProgressiveMultiplier))) {
      return; // Still throttled
    }
    
    // Check minimum confidence
    if (confidence < MEDIAPIPE_SOLUTIONS_CONFIG.confidence.violationMinimumConfidence) {
      return; // Confidence too low
    }

    // Create violation
    const violation: ViolationLog = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      timestamp: new Date().toISOString(),
      description,
      confidence,
      evidence
    };

    // Update throttling
    lastViolationTime.current[violationKey] = {
      time: now,
      count: lastViolation ? lastViolation.count + 1 : 1
    };

    // Send violation
    onViolationDetected(violation);
  }, [onViolationDetected]);

  /**
   * Process frame for analysis
   */
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processingRef.current || !isInitialized) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || !faceLandmarker || !faceDetector) {
      return;
    }

    // Check if video is ready
    if (video.readyState < 2) {
      return;
    }

    processingRef.current = true;
    const startTime = performance.now();

    try {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Process face landmarker results
      const faceLandmarkerResults = await faceLandmarker.detectForVideo(video, performance.now());
      await processFaceLandmarkerResults(faceLandmarkerResults, ctx);

      // Update performance metrics
      const processingTime = performance.now() - startTime;
      setPerformanceMetrics(prev => ({
        ...prev,
        lastProcessingTime: processingTime,
        averageProcessingTime: (prev.averageProcessingTime * 0.9) + (processingTime * 0.1)
      }));

    } catch (error) {
      console.error('Error processing frame:', error);
    } finally {
      processingRef.current = false;
    }
  }, [videoRef, isInitialized, faceLandmarker, faceDetector]);

  /**
   * Process face landmarker results
   */
  const processFaceLandmarkerResults = useCallback(async (
    results: FaceLandmarkerResult, 
    ctx: CanvasRenderingContext2D
  ) => {
    // Check face detection
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      await handleNoFaceDetected();
      return;
    }

    if (results.faceLandmarks.length > 1) {
      createThrottledViolation(
        'multiple_faces',
        'high',
        `Multiple faces detected: ${results.faceLandmarks.length}`,
        0.9,
        { faceCount: results.faceLandmarks.length }
      );
      return;
    }

    const faceLandmarks = results.faceLandmarks[0];
    
    // Update face detection stats
    setFaceDetectionStats({
      isPresent: true,
      confidence: 0.9,
      position: { x: faceLandmarks[1].x, y: faceLandmarks[1].y },
      size: calculateFaceSize(faceLandmarks),
      lastDetectionTime: Date.now(),
    });

    // Perform calibration if needed
    if (!calibration.isCalibrated && showCalibration) {
      await handleCalibrationPhase(faceLandmarks);
      return;
    }

    // Process gaze tracking
    await processGazeTracking(faceLandmarks);

    // Process eye tracking
    await processEyeTracking(faceLandmarks);

    // Draw face landmarks
    drawFaceLandmarks(faceLandmarks, ctx);

  }, [calibration.isCalibrated, showCalibration, createThrottledViolation]);

  /**
   * Handle no face detected
   */
  const handleNoFaceDetected = useCallback(async () => {
    setFaceDetectionStats(prev => ({
      ...prev,
      isPresent: false,
      confidence: 0,
      lastDetectionTime: Date.now(),
    }));

    createThrottledViolation(
      'face_not_found',
      'high',
      'No face detected in frame',
      0.8,
      { timestamp: Date.now() }
    );
  }, [createThrottledViolation]);

  /**
   * Calculate face size from landmarks
   */
  const calculateFaceSize = useCallback((landmarks: Array<{x: number, y: number}>) => {
    const leftEye = landmarks[33];
    const rightEye = landmarks[362];
    const noseTip = landmarks[1];
    const chinBottom = landmarks[175];
    
    const faceWidth = Math.abs(rightEye.x - leftEye.x);
    const faceHeight = Math.abs(chinBottom.y - noseTip.y);
    
    return Math.sqrt(faceWidth * faceWidth + faceHeight * faceHeight);
  }, []);

  /**
   * Handle calibration phase
   */
  const handleCalibrationPhase = useCallback(async (faceLandmarks: Array<{x: number, y: number}>) => {
    const progress = Math.min(calibration.calibrationProgress + 2, 100);
    
    if (progress >= 100) {
      const calibrationData: CalibrationData = {
        userEARBaseline: {
          left: calculateEyeAspectRatio(faceLandmarks, 'left'),
          right: calculateEyeAspectRatio(faceLandmarks, 'right')
        },
        gazeBaseline: calculateGazeDirection(faceLandmarks),
        isCalibrated: true,
        calibrationProgress: 100
      };

      setCalibration(calibrationData);
      onCalibrationComplete?.(calibrationData);
    } else {
      setCalibration(prev => ({ ...prev, calibrationProgress: progress }));
    }
  }, [calibration.calibrationProgress, onCalibrationComplete]);

  /**
   * Calculate Eye Aspect Ratio
   */
  const calculateEyeAspectRatio = useCallback((landmarks: Array<{x: number, y: number}>, eye: 'left' | 'right') => {
    const eyePoints = eye === 'left' ? [33, 7, 163, 144, 145, 153] : [362, 382, 381, 380, 374, 373];
    
    const p1 = landmarks[eyePoints[1]];
    const p2 = landmarks[eyePoints[5]];
    const p3 = landmarks[eyePoints[2]];
    const p4 = landmarks[eyePoints[4]];
    const p5 = landmarks[eyePoints[0]];
    const p6 = landmarks[eyePoints[3]];

    const ear = (Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) + 
                 Math.sqrt(Math.pow(p4.x - p3.x, 2) + Math.pow(p4.y - p3.y, 2))) / 
                (2 * Math.sqrt(Math.pow(p6.x - p5.x, 2) + Math.pow(p6.y - p5.y, 2)));

    return ear;
  }, []);

  /**
   * Calculate gaze direction
   */
  const calculateGazeDirection = useCallback((landmarks: Array<{x: number, y: number}>) => {
    const leftEye = landmarks[33];
    const rightEye = landmarks[362];
    const noseTip = landmarks[1];
    
    const eyeCenter = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2
    };
    
    return {
      x: noseTip.x - eyeCenter.x,
      y: noseTip.y - eyeCenter.y
    };
  }, []);

  /**
   * Process gaze tracking
   */
  const processGazeTracking = useCallback(async (faceLandmarks: Array<{x: number, y: number}>) => {
    const currentGaze = calculateGazeDirection(faceLandmarks);
    const deviation = Math.sqrt(
      Math.pow(currentGaze.x - calibration.gazeBaseline.x, 2) + 
      Math.pow(currentGaze.y - calibration.gazeBaseline.y, 2)
    );

    if (deviation > MEDIAPIPE_SOLUTIONS_CONFIG.gazeTracking.deviationThreshold) {
      createThrottledViolation(
        'gaze_deviation',
        deviation > 0.4 ? 'high' : 'medium',
        `Gaze deviation detected: ${deviation.toFixed(3)}`,
        Math.min(deviation / 0.4, 1.0),
        { 
          deviation,
          currentGaze,
          baseline: calibration.gazeBaseline
        }
      );
    }
  }, [calibration.gazeBaseline, createThrottledViolation, calculateGazeDirection]);

  /**
   * Process eye tracking
   */
  const processEyeTracking = useCallback(async (faceLandmarks: Array<{x: number, y: number}>) => {
    const leftEAR = calculateEyeAspectRatio(faceLandmarks, 'left');
    const rightEAR = calculateEyeAspectRatio(faceLandmarks, 'right');

    const leftDeviation = Math.abs(leftEAR - calibration.userEARBaseline.left);
    const rightDeviation = Math.abs(rightEAR - calibration.userEARBaseline.right);

    if (leftDeviation > MEDIAPIPE_SOLUTIONS_CONFIG.eyeTracking.movementThreshold || 
        rightDeviation > MEDIAPIPE_SOLUTIONS_CONFIG.eyeTracking.movementThreshold) {
      
      const maxDeviation = Math.max(leftDeviation, rightDeviation);
      createThrottledViolation(
        'eye_movement',
        maxDeviation > 0.06 ? 'high' : 'medium',
        `Significant eye movement detected: ${maxDeviation.toFixed(3)}`,
        Math.min(maxDeviation / 0.06, 1.0),
        {
          leftEAR,
          rightEAR,
          baseline: calibration.userEARBaseline,
          deviations: { left: leftDeviation, right: rightDeviation }
        }
      );
    }
  }, [calibration.userEARBaseline, createThrottledViolation, calculateEyeAspectRatio]);

  /**
   * Draw face landmarks on canvas
   */
  const drawFaceLandmarks = useCallback((landmarks: Array<{x: number, y: number}>, ctx: CanvasRenderingContext2D) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    
    // Draw face outline
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    // Draw key facial features
    const keyPoints = [33, 362, 1, 175]; // Left eye, right eye, nose tip, chin
    keyPoints.forEach((pointIndex, index) => {
      const point = landmarks[pointIndex];
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      // Draw point
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    ctx.stroke();
  }, []);

  /**
   * Animation loop
   */
  const animate = useCallback(() => {
    if (!isActive) return;

    // Process frame based on frame skip configuration
    if (Date.now() % MEDIAPIPE_SOLUTIONS_CONFIG.performance.processEveryNthFrame === 0) {
      processFrame();
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isActive, processFrame]);

  // Initialize MediaPipe on mount
  useEffect(() => {
    if (isActive) {
      initializeMediaPipe();
    }
  }, [isActive, initializeMediaPipe]);

  // Start/stop animation loop
  useEffect(() => {
    if (isActive && isInitialized) {
      animate();
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isActive, isInitialized, animate]);

  return (
    <div className="space-y-4">
      {/* Canvas for MediaPipe visualization */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 pointer-events-none z-10"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Initialization Status */}
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            {isInitialized ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
            <div>
              <p className="text-sm font-medium">MediaPipe</p>
              <p className="text-xs text-gray-500">
                {isInitialized ? 'Ready' : 'Initializing...'}
              </p>
            </div>
          </div>
        </Card>

        {/* Face Detection Status */}
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            {faceDetectionStats.isPresent ? (
              <Eye className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className="text-sm font-medium">Face Detection</p>
              <p className="text-xs text-gray-500">
                {faceDetectionStats.isPresent ? 
                  `Confidence: ${(faceDetectionStats.confidence * 100).toFixed(0)}%` : 
                  'No face detected'
                }
              </p>
            </div>
          </div>
        </Card>

        {/* Calibration Status */}
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            {calibration.isCalibrated ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Shield className="h-5 w-5 text-blue-500" />
            )}
            <div>
              <p className="text-sm font-medium">Calibration</p>
              <p className="text-xs text-gray-500">
                {calibration.isCalibrated ? 
                  'Complete' : 
                  `${calibration.calibrationProgress}%`
                }
              </p>
            </div>
          </div>
        </Card>

        {/* Performance Status */}
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium">Performance</p>
              <p className="text-xs text-gray-500">
                {performanceMetrics.lastProcessingTime.toFixed(1)}ms
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Calibration Progress */}
      {showCalibration && !calibration.isCalibrated && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium">Calibrating MediaPipe Proctoring...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${calibration.calibrationProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Please look directly at the camera for accurate calibration
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
