import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { AlertTriangle, Eye, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { 
  MEDIAPIPE_SOLUTIONS_CONFIG, 
  VIOLATION_SEVERITY_MAPPING, 
  EYE_LANDMARKS,
  FACE_LANDMARKS,
  type ViolationType,
  type ViolationSeverity,
  type FaceTrackingData,
  type MultipleFaceDetectionResult,
  type PrimaryPersonSelectionStrategy
} from '../config/mediapipe-solutions-config';

// MediaPipe Solutions imports
import type { 
  FaceDetector, 
  FaceLandmarker, 
  PoseLandmarker,
  FaceLandmarkerResult,
  PoseLandmarkerResult 
} from '@mediapipe/tasks-vision';

interface ViolationLog {
  id: string;
  type: ViolationType;
  severity: ViolationSeverity;
  timestamp: string;
  description: string;
  confidence: number;
  evidence: any;
  throttledUntil?: number;
}

interface CalibrationData {
  userEARBaseline: { left: number; right: number } | null;
  gazeBaseline: { x: number; y: number } | null;
  isCalibrated: boolean;
  calibrationProgress: number;
  calibrationFrames: number;
}

interface ProctoringStats {
  facesDetected: number;
  gazeViolations: number;
  eyeMovementViolations: number;
  multiplePeopleViolations: number;
  objectViolations: number;
  totalViolations: number;
  sessionDuration: number;
  performanceMetrics: {
    averageProcessingTime: number;
    framesProcessed: number;
    skippedFrames: number;
  };
}

interface MediaPipeSolutionsProctoringInterfaceProps {
  isActive: boolean;
  sessionId: string | null;
  userId: string | number;
  onViolationDetected: (violation: ViolationLog) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  showCalibration?: boolean;
  onCalibrationComplete?: (calibrationData: CalibrationData) => void;
}

export default function MediaPipeSolutionsProctoringInterface({
  isActive,
  sessionId,
  userId,
  onViolationDetected,
  videoRef,
  showCalibration = true,
  onCalibrationComplete
}: MediaPipeSolutionsProctoringInterfaceProps) {
  // Refs for canvas and processing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processingRef = useRef<boolean>(false);
  
  // MediaPipe Solutions instances
  const [vision, setVision] = useState<any>(null);
  const [faceDetector, setFaceDetector] = useState<FaceDetector | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // State management
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [stats, setStats] = useState<ProctoringStats>({
    facesDetected: 0,
    gazeViolations: 0,
    eyeMovementViolations: 0,
    multiplePeopleViolations: 0,
    objectViolations: 0,
    totalViolations: 0,
    sessionDuration: 0,
    performanceMetrics: {
      averageProcessingTime: 0,
      framesProcessed: 0,
      skippedFrames: 0
    }
  });

  // Calibration state
  const [calibration, setCalibration] = useState<CalibrationData>({
    userEARBaseline: null,
    gazeBaseline: null,
    isCalibrated: false,
    calibrationProgress: 0,
    calibrationFrames: 0
  });

  // Violation tracking and throttling
  const lastViolationTime = useRef<{[key: string]: { time: number; count: number }}>({});
  const violationConfirmation = useRef<{[key: string]: number}>({});
  
  // Processing optimization
  const frameProcessingCounter = useRef<number>(0);
  const performanceMetrics = useRef<{
    processingTimes: number[];
    startTime: number;
  }>({
    processingTimes: [],
    startTime: Date.now()
  });

  // Smoothing and history tracking
  const gazeHistory = useRef<{x: number, y: number}[]>([]);
  const faceDetectionHistory = useRef<boolean[]>([]);
  const eyePositionHistory = useRef<{left: {x: number, y: number}, right: {x: number, y: number}}[]>([]);

  /**
   * Initialize MediaPipe Solutions components
   */
  const initializeMediaPipe = useCallback(async () => {
    try {
      console.log('🚀 Initializing MediaPipe Solutions...');
      
      // Import MediaPipe Solutions dynamically
      const { FilesetResolver, FaceDetector, FaceLandmarker, PoseLandmarker } = 
        await import('@mediapipe/tasks-vision');

      // Initialize FilesetResolver with WASM path
      const visionInstance = await FilesetResolver.forVisionTasks(
        MEDIAPIPE_SOLUTIONS_CONFIG.models.wasmPath
      );
      setVision(visionInstance);

      // Initialize Face Detector with optimal configuration
      const faceDetectorInstance = await FaceDetector.createFromOptions(visionInstance, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SOLUTIONS_CONFIG.models.faceDetectorPath,
          delegate: 'GPU' // Use GPU acceleration when available
        },
        runningMode: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetector.runningMode,
        minDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetector.minDetectionConfidence,
        minSuppressionThreshold: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetector.minSuppressionThreshold
      });
      setFaceDetector(faceDetectorInstance);

      // Initialize Face Landmarker with optimal configuration
      const faceLandmarkerOptions = {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SOLUTIONS_CONFIG.models.faceLandmarkerPath,
          delegate: 'GPU' as const
        },
        runningMode: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.runningMode,
        numFaces: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces,
        minFaceDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFaceDetectionConfidence,
        minFacePresenceConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFacePresenceConfidence,
        minTrackingConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minTrackingConfidence,
        outputFaceBlendshapes: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.outputFaceBlendshapes,
        outputFacialTransformationMatrixes: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.outputFacialTransformationMatrixes
      };

      // ✅ CRITICAL DEBUG STEP: Log the options to be 100% sure
      console.log("🔍 INTERFACE INITIALIZING FACELANDMARKER WITH OPTIONS:", faceLandmarkerOptions);
      console.log("🎯 Interface numFaces setting:", MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces);

      const faceLandmarkerInstance = await FaceLandmarker.createFromOptions(visionInstance, faceLandmarkerOptions);
      setFaceLandmarker(faceLandmarkerInstance);

      // Initialize Pose Landmarker with optimal configuration
      const poseLandmarkerInstance = await PoseLandmarker.createFromOptions(visionInstance, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SOLUTIONS_CONFIG.models.poseLandmarkerPath,
          delegate: 'GPU'
        },
        runningMode: MEDIAPIPE_SOLUTIONS_CONFIG.poseLandmarker.runningMode,
        numPoses: MEDIAPIPE_SOLUTIONS_CONFIG.poseLandmarker.numPoses,
        minPoseDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.poseLandmarker.minPoseDetectionConfidence,
        minPosePresenceConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.poseLandmarker.minPosePresenceConfidence,
        minTrackingConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.poseLandmarker.minTrackingConfidence,
        outputSegmentationMasks: MEDIAPIPE_SOLUTIONS_CONFIG.poseLandmarker.outputSegmentationMasks
      });
      setPoseLandmarker(poseLandmarkerInstance);

      setIsInitialized(true);
      console.log('✅ MediaPipe Solutions initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize MediaPipe Solutions:', error);
      setIsInitialized(false);
    }
  }, []);

  /**
   * Start MediaPipe processing loop
   */
  const startProcessing = useCallback(() => {
    if (!isActive || !isInitialized || !videoRef.current || processingRef.current) {
      return;
    }

    console.log('🎬 Starting MediaPipe processing...');
    processingRef.current = true;
    performanceMetrics.current.startTime = Date.now();

    const processFrame = async () => {
      if (!processingRef.current || !videoRef.current || !isActive) {
        return;
      }

      const processingStartTime = performance.now();

      try {
        // Performance optimization: Process every Nth frame
        frameProcessingCounter.current++;
        if (frameProcessingCounter.current % MEDIAPIPE_SOLUTIONS_CONFIG.performance.processEveryNthFrame !== 0) {
          setStats(prev => ({
            ...prev,
            performanceMetrics: {
              ...prev.performanceMetrics,
              skippedFrames: prev.performanceMetrics.skippedFrames + 1
            }
          }));
          animationFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const video = videoRef.current;
        const currentTime = performance.now();

        // Process with Face Landmarker (primary detection)
        if (faceLandmarker) {
          const faceLandmarkerResults = await faceLandmarker.detectForVideo(video, currentTime);
          await processFaceLandmarkerResults(faceLandmarkerResults);
        }

        // Process with Pose Landmarker (multiple people detection)
        if (poseLandmarker) {
          const poseLandmarkerResults = await poseLandmarker.detectForVideo(video, currentTime);
          await processPoseLandmarkerResults(poseLandmarkerResults);
        }

        // Update performance metrics
        const processingTime = performance.now() - processingStartTime;
        performanceMetrics.current.processingTimes.push(processingTime);
        
        // Keep only last 100 measurements
        if (performanceMetrics.current.processingTimes.length > 100) {
          performanceMetrics.current.processingTimes.shift();
        }

        const averageProcessingTime = performanceMetrics.current.processingTimes.reduce((a, b) => a + b, 0) / 
                                    performanceMetrics.current.processingTimes.length;

        setStats(prev => ({
          ...prev,
          sessionDuration: Date.now() - performanceMetrics.current.startTime,
          performanceMetrics: {
            ...prev.performanceMetrics,
            averageProcessingTime,
            framesProcessed: prev.performanceMetrics.framesProcessed + 1
          }
        }));

      } catch (error) {
        console.error('Error processing frame:', error);
      }

      // Schedule next frame
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();
  }, [isActive, isInitialized, videoRef]);

  /**
   * Process Face Landmarker results with calibration and smoothing
   */
  const processFaceLandmarkerResults = useCallback(async (results: FaceLandmarkerResult) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    const video = videoRef.current;
    canvas.width = Math.min(video.videoWidth || 640, MEDIAPIPE_SOLUTIONS_CONFIG.performance.maxProcessingWidth);
    canvas.height = Math.min(video.videoHeight || 480, MEDIAPIPE_SOLUTIONS_CONFIG.performance.maxProcessingHeight);

    // Clear canvas and draw video frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Check for face detection
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      await handleNoFaceDetected(ctx);
      return;
    }

    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    
    // Handle multiple faces detection
    if (results.faceLandmarks.length > 1) {
      if (config.debugMode) {
        console.log(`🎯 INTERFACE: Multiple faces detected (${results.faceLandmarks.length}), treatMultipleAsViolation: ${config.treatMultipleAsViolation}`);
      }
      
      // Update face count in stats
      setStats(prev => ({ ...prev, facesDetected: results.faceLandmarks.length }));
      
      // Only treat as violation if configured to do so
      if (config.treatMultipleAsViolation) {
        await createThrottledViolation(
          'multiple_people',
          'high',
          `Multiple faces detected: ${results.faceLandmarks.length}`,
          0.9,
          {
            faceCount: results.faceLandmarks.length,
            configuredAsViolation: true,
            timestamp: new Date().toISOString()
          }
        );
        
        setStats(prev => ({ 
          ...prev, 
          multiplePeopleViolations: prev.multiplePeopleViolations + 1 
        }));
      }
    } else {
      // Single face detected
      setStats(prev => ({ ...prev, facesDetected: 1 }));
    }

    // Handle calibration phase (use first/primary face)
    if (!calibration.isCalibrated) {
      await handleCalibrationPhase(results, ctx);
      return;
    }

    // Process face landmarks for violations (use primary/first face)
    const faceLandmarks = results.faceLandmarks[0]; // Process primary face
    
    // Face positioning and size validation
    await validateFacePosition(faceLandmarks, ctx);
    
    // Gaze tracking with smoothing
    await processGazeTracking(faceLandmarks, ctx);
    
    // Eye movement and blink detection
    await processEyeTracking(faceLandmarks, ctx);

    // Expression analysis (if blendshapes available)
    if (results.faceBlendshapes && results.faceBlendshapes[0]) {
      await processExpressionAnalysis(results.faceBlendshapes[0].categories, ctx);
    }

    // Draw face landmarks (performance optimized)
    drawFaceLandmarks(faceLandmarks, ctx);
    
    // Update face detection history
    faceDetectionHistory.current.push(true);
    if (faceDetectionHistory.current.length > MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.stabilizationFrames) {
      faceDetectionHistory.current.shift();
    }

    setStats(prev => ({ ...prev, facesDetected: 1 }));

  }, [calibration.isCalibrated]);

  /**
   * Process Pose Landmarker results for multiple people detection
   */
  const processPoseLandmarkerResults = useCallback(async (results: PoseLandmarkerResult) => {
    if (!results.landmarks) return;

    const poseCount = results.landmarks.length;
    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    
    if (poseCount > 1) {
      // Only treat as violation if configured to do so
      if (config.treatMultipleAsViolation) {
        await createThrottledViolation(
          'multiple_people',
          'high',
          `${poseCount} people detected in camera view`,
          0.9,
          {
            poseCount,
            landmarks: results.landmarks.map(pose => pose.length),
            timestamp: new Date().toISOString(),
            configuredAsViolation: true
          }
        );
        
        setStats(prev => ({ 
          ...prev, 
          multiplePeopleViolations: prev.multiplePeopleViolations + 1 
        }));
      } else {
        // Multiple people allowed - just log for information
        if (config.debugMode) {
          console.log(`ℹ️ MULTIPLE PEOPLE ALLOWED: ${poseCount} people detected (not a violation)`);
        }
        
        // Update stats but don't increment violations
        setStats(prev => ({ 
          ...prev, 
          facesDetected: poseCount // Update face count to reflect multiple people
        }));
      }
    }
  }, [createThrottledViolation]);

  /**
   * Handle calibration phase with progress tracking
   */
  const handleCalibrationPhase = useCallback(async (results: FaceLandmarkerResult, ctx: CanvasRenderingContext2D) => {
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) return;

    const faceLandmarks = results.faceLandmarks[0];
    
    // Collect baseline EAR values
    const leftEyePoints = EYE_LANDMARKS.LEFT_EYE_EAR.map(idx => faceLandmarks[idx]);
    const rightEyePoints = EYE_LANDMARKS.RIGHT_EYE_EAR.map(idx => faceLandmarks[idx]);
    
    if (leftEyePoints.every(p => p) && rightEyePoints.every(p => p)) {
      const leftEAR = calculateEyeAspectRatio(leftEyePoints);
      const rightEAR = calculateEyeAspectRatio(rightEyePoints);
      
      // Update baseline calibration
      setCalibration(prev => {
        const newFrames = prev.calibrationFrames + 1;
        const progress = Math.min(100, (newFrames / MEDIAPIPE_SOLUTIONS_CONFIG.calibration.calibrationDurationFrames) * 100);
        
        let newUserEARBaseline = prev.userEARBaseline;
        let newGazeBaseline = prev.gazeBaseline;
        
        // Update EAR baseline
        if (!newUserEARBaseline) {
          newUserEARBaseline = { left: leftEAR, right: rightEAR };
        } else {
          newUserEARBaseline = {
            left: (newUserEARBaseline.left + leftEAR) / 2,
            right: (newUserEARBaseline.right + rightEAR) / 2
          };
        }
        
        // Calculate gaze baseline
        const gazeVector = calculateGazeDirection(faceLandmarks);
        if (!newGazeBaseline) {
          newGazeBaseline = { x: gazeVector.x, y: gazeVector.y };
        } else {
          newGazeBaseline = {
            x: (newGazeBaseline.x + gazeVector.x) / 2,
            y: (newGazeBaseline.y + gazeVector.y) / 2
          };
        }
        
        // Check if calibration is complete
        const isComplete = newFrames >= MEDIAPIPE_SOLUTIONS_CONFIG.calibration.calibrationDurationFrames;
        
        const newCalibrationData = {
          userEARBaseline: newUserEARBaseline,
          gazeBaseline: newGazeBaseline,
          isCalibrated: isComplete,
          calibrationProgress: progress,
          calibrationFrames: newFrames
        };
        
        if (isComplete && onCalibrationComplete) {
          onCalibrationComplete(newCalibrationData);
          console.log('🎯 Calibration completed:', newCalibrationData);
        }
        
        return newCalibrationData;
      });
    }

    // Draw calibration UI
    drawCalibrationUI(ctx, calibration.calibrationProgress);
    
  }, [calibration.calibrationProgress, onCalibrationComplete]);

  /**
   * Handle no face detected with stabilization
   */
  const handleNoFaceDetected = useCallback(async (ctx: CanvasRenderingContext2D) => {
    faceDetectionHistory.current.push(false);
    if (faceDetectionHistory.current.length > MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.absenceConfirmationFrames) {
      faceDetectionHistory.current.shift();
    }
    
    // Require consecutive frames without face to trigger violation
    const noFaceFrames = faceDetectionHistory.current.filter(detected => !detected).length;
    
    setStats(prev => ({ ...prev, facesDetected: 0 }));
    
    if (noFaceFrames >= MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.absenceConfirmationFrames) {
      await createThrottledViolation(
        'face_detection',
        'high',
        'No face detected in camera view',
        MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.confidenceThreshold,
        {
          facesDetected: 0,
          confirmationFrames: noFaceFrames,
          timestamp: new Date().toISOString(),
          recommendation: 'Please ensure your face is visible in the camera'
        }
      );
    }

    // Draw no face detected warning
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No Face Detected', ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.fillText('Please position yourself in the camera', ctx.canvas.width / 2, ctx.canvas.height / 2 + 40);
    
  }, []);

  /**
   * Validate face position and size
   */
  const validateFacePosition = useCallback(async (faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (!faceLandmarks || faceLandmarks.length === 0) return;

    // Calculate face center and size
    const faceCenter = getFaceCenter(faceLandmarks);
    const faceSize = calculateFaceSize(faceLandmarks);
    const canvasCenter = { x: 0.5, y: 0.5 };
    
    // Position validation
    const distance = Math.sqrt(
      Math.pow(faceCenter.x - canvasCenter.x, 2) +
      Math.pow(faceCenter.y - canvasCenter.y, 2)
    );

    if (distance > MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.positionThreshold) {
      await createThrottledViolation(
        'face_detection',
        'medium',
        'Face not properly centered in camera view',
        MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.confidenceThreshold,
        {
          distance: Math.round(distance * 100) / 100,
          facePosition: faceCenter,
          canvasCenter,
          recommendation: 'Please center your face in the camera view',
          threshold: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.positionThreshold
        }
      );
    }

    // Size validation
    if (faceSize < MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.faceSizeMin) {
      await createThrottledViolation(
        'face_detection',
        'medium',
        'Face too far from camera - move closer',
        0.75,
        {
          faceSize: Math.round(faceSize * 100) / 100,
          recommendation: 'Please move closer to the camera',
          minThreshold: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.faceSizeMin
        }
      );
    } else if (faceSize > MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.faceSizeMax) {
      await createThrottledViolation(
        'face_detection',
        'medium',
        'Face too close to camera - move back',
        0.75,
        {
          faceSize: Math.round(faceSize * 100) / 100,
          recommendation: 'Please move back from the camera',
          maxThreshold: MEDIAPIPE_SOLUTIONS_CONFIG.faceDetection.faceSizeMax
        }
      );
    }
  }, []);

  /**
   * Process gaze tracking with smoothing and calibration
   */
  const processGazeTracking = useCallback(async (faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (!faceLandmarks || !calibration.gazeBaseline) return;

    const gazeVector = calculateGazeDirection(faceLandmarks);
    
    // Apply smoothing with configurable window
    gazeHistory.current.push(gazeVector);
    if (gazeHistory.current.length > MEDIAPIPE_SOLUTIONS_CONFIG.gazeTracking.smoothingWindowFrames) {
      gazeHistory.current.shift();
    }

    // Calculate smoothed gaze
    const smoothedGaze = gazeHistory.current.reduce((acc, gaze) => ({
      x: acc.x + gaze.x,
      y: acc.y + gaze.y
    }), { x: 0, y: 0 });
    
    smoothedGaze.x /= gazeHistory.current.length;
    smoothedGaze.y /= gazeHistory.current.length;

    // Draw gaze indicator
    drawGazeIndicator(smoothedGaze, faceLandmarks, ctx);

    // Only calculate deviation if we have sufficient history
    if (gazeHistory.current.length < MEDIAPIPE_SOLUTIONS_CONFIG.gazeTracking.smoothingWindowFrames) return;

    // Calculate deviation from baseline
    const deviation = Math.sqrt(
      Math.pow(smoothedGaze.x - calibration.gazeBaseline.x, 2) +
      Math.pow(smoothedGaze.y - calibration.gazeBaseline.y, 2)
    );

    // Check for significant gaze deviation (67% less sensitive)
    if (deviation > MEDIAPIPE_SOLUTIONS_CONFIG.gazeTracking.deviationThreshold) {
      const direction = getGazeDirection(smoothedGaze, calibration.gazeBaseline);
      
      await createThrottledViolation(
        'gaze_tracking',
        'medium',
        `Looking ${direction} - please focus on the screen`,
        Math.min(0.9, 0.5 + deviation),
        {
          deviation: Math.round(deviation * 100) / 100,
          direction,
          smoothedGaze,
          baseline: calibration.gazeBaseline,
          threshold: MEDIAPIPE_SOLUTIONS_CONFIG.gazeTracking.deviationThreshold
        }
      );
      
      setStats(prev => ({ 
        ...prev, 
        gazeViolations: prev.gazeViolations + 1 
      }));
    }
  }, [calibration.gazeBaseline]);

  /**
   * Process eye tracking with user-calibrated thresholds
   */
  const processEyeTracking = useCallback(async (faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (!faceLandmarks || !calibration.userEARBaseline) return;

    // Get eye landmark points
    const leftEyePoints = EYE_LANDMARKS.LEFT_EYE_EAR.map(idx => faceLandmarks[idx]);
    const rightEyePoints = EYE_LANDMARKS.RIGHT_EYE_EAR.map(idx => faceLandmarks[idx]);
    
    if (!leftEyePoints.every(p => p) || !rightEyePoints.every(p => p)) return;

    // Calculate current EAR
    const currentLeftEAR = calculateEyeAspectRatio(leftEyePoints);
    const currentRightEAR = calculateEyeAspectRatio(rightEyePoints);

    // Apply user-calibrated thresholds
    const leftThreshold = calibration.userEARBaseline.left * MEDIAPIPE_SOLUTIONS_CONFIG.eyeTracking.blinkThreshold;
    const rightThreshold = calibration.userEARBaseline.right * MEDIAPIPE_SOLUTIONS_CONFIG.eyeTracking.blinkThreshold;

    // Detect prolonged eye closure
    const leftClosed = currentLeftEAR < leftThreshold;
    const rightClosed = currentRightEAR < rightThreshold;
    
    if (leftClosed || rightClosed) {
      await createThrottledViolation(
        'eye_movement',
        'low',
        'Prolonged eye closure detected',
        0.7,
        {
          leftEAR: Math.round(currentLeftEAR * 1000) / 1000,
          rightEAR: Math.round(currentRightEAR * 1000) / 1000,
          leftThreshold: Math.round(leftThreshold * 1000) / 1000,
          rightThreshold: Math.round(rightThreshold * 1000) / 1000,
          userBaseline: calibration.userEARBaseline
        }
      );
      
      setStats(prev => ({ 
        ...prev, 
        eyeMovementViolations: prev.eyeMovementViolations + 1 
      }));
    }

    // Draw eye tracking indicators
    drawEyeTrackingIndicators(leftEyePoints, rightEyePoints, currentLeftEAR, currentRightEAR, ctx);
    
  }, [calibration.userEARBaseline]);

  /**
   * Process expression analysis from blendshapes
   */
  const processExpressionAnalysis = useCallback(async (blendshapes: any[], ctx: CanvasRenderingContext2D) => {
    // Look for suspicious expressions that might indicate cheating
    const suspiciousExpressions = blendshapes.filter((blendshape: any) => {
      const category = blendshape.categoryName;
      const score = blendshape.score;
      
      // Check for mouth movements that might indicate talking
      return (category.includes('mouth') || category.includes('jaw')) && score > 0.7;
    });

    if (suspiciousExpressions.length > 0) {
      await createThrottledViolation(
        'mouth_movement',
        'low',
        'Mouth movement detected - possible verbal communication',
        0.6,
        {
          expressions: suspiciousExpressions.map((exp: any) => ({
            category: exp.categoryName,
            score: Math.round(exp.score * 100) / 100
          })),
          timestamp: new Date().toISOString()
        }
      );
    }
  }, []);

  /**
   * Helper function to get throttle config key from violation type
   */
  const getThrottleConfigKey = (violationType: ViolationType): keyof typeof MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling => {
    const typeMapping: Record<ViolationType, keyof typeof MEDIAPIPE_SOLUTIONS_CONFIG.violationThrottling> = {
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
  const createThrottledViolation = useCallback(async (
    type: ViolationType,
    severity: ViolationSeverity,
    description: string,
    confidence: number,
    evidence: any
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

    // Add violation to state
    setViolations(prev => [violation, ...prev.slice(0, 49)]); // Keep last 50
    setStats(prev => ({ ...prev, totalViolations: prev.totalViolations + 1 }));
    
    // Notify parent component
    onViolationDetected(violation);

  }, [onViolationDetected]);

  /**
   * Utility functions
   */
  const calculateEyeAspectRatio = useCallback((eyePoints: any[]): number => {
    if (eyePoints.length < 6) return 0;
    
    // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    const p1 = eyePoints[0], p2 = eyePoints[1], p3 = eyePoints[2];
    const p4 = eyePoints[3], p5 = eyePoints[4], p6 = eyePoints[5];
    
    const vertical1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
    const vertical2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
    const horizontal = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));
    
    return (vertical1 + vertical2) / (2.0 * horizontal);
  }, []);

  const calculateGazeDirection = useCallback((faceLandmarks: any[]) => {
    // Simplified gaze calculation using nose tip and face center
    const noseTip = faceLandmarks[FACE_LANDMARKS.NOSE_TIP];
    const faceCenter = faceLandmarks[FACE_LANDMARKS.FACE_CENTER];
    
    if (!noseTip || !faceCenter) return { x: 0, y: 0 };
    
    return {
      x: noseTip.x - faceCenter.x,
      y: noseTip.y - faceCenter.y
    };
  }, []);

  const getFaceCenter = useCallback((faceLandmarks: any[]) => {
    // Calculate face center from key landmarks
    const noseTip = faceLandmarks[FACE_LANDMARKS.NOSE_TIP];
    const chin = faceLandmarks[FACE_LANDMARKS.CHIN];
    
    if (!noseTip || !chin) return { x: 0.5, y: 0.5 };
    
    return {
      x: (noseTip.x + chin.x) / 2,
      y: (noseTip.y + chin.y) / 2
    };
  }, []);

  const calculateFaceSize = useCallback((faceLandmarks: any[]) => {
    // Calculate face size based on key landmarks
    const leftMouth = faceLandmarks[FACE_LANDMARKS.LEFT_MOUTH];
    const rightMouth = faceLandmarks[FACE_LANDMARKS.RIGHT_MOUTH];
    const noseTip = faceLandmarks[FACE_LANDMARKS.NOSE_TIP];
    const chin = faceLandmarks[FACE_LANDMARKS.CHIN];
    
    if (!leftMouth || !rightMouth || !noseTip || !chin) return 0.3;
    
    const width = Math.abs(rightMouth.x - leftMouth.x);
    const height = Math.abs(chin.y - noseTip.y);
    
    return Math.sqrt(width * width + height * height);
  }, []);

  const getGazeDirection = useCallback((currentGaze: {x: number, y: number}, baseline: {x: number, y: number}) => {
    const dx = currentGaze.x - baseline.x;
    const dy = currentGaze.y - baseline.y;
    
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }, []);

  /**
   * Drawing functions
   */
  const drawCalibrationUI = useCallback((ctx: CanvasRenderingContext2D, progress: number) => {
    // Draw calibration overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw calibration instructions
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Calibrating...', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    
    ctx.font = '16px Arial';
    ctx.fillText('Please look directly at the screen', ctx.canvas.width / 2, ctx.canvas.height / 2 - 30);
    ctx.fillText('and keep your eyes open', ctx.canvas.width / 2, ctx.canvas.height / 2);
    
    // Draw progress bar
    const barWidth = 300;
    const barHeight = 20;
    const barX = (ctx.canvas.width - barWidth) / 2;
    const barY = ctx.canvas.height / 2 + 40;
    
    ctx.strokeStyle = 'white';
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = '#10b981';
    ctx.fillRect(barX, barY, (barWidth * progress) / 100, barHeight);
    
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(`${Math.round(progress)}%`, ctx.canvas.width / 2, barY + barHeight + 25);
  }, []);

  const drawFaceLandmarks = useCallback((faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    // Draw key landmarks only for performance
    ctx.fillStyle = '#10b981';
    const keyLandmarks = [FACE_LANDMARKS.NOSE_TIP, FACE_LANDMARKS.LEFT_MOUTH, FACE_LANDMARKS.RIGHT_MOUTH];
    
    keyLandmarks.forEach(index => {
      if (faceLandmarks[index]) {
        const landmark = faceLandmarks[index];
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }, []);

  const drawGazeIndicator = useCallback((gazeVector: {x: number, y: number}, faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    const faceCenter = getFaceCenter(faceLandmarks);
    const startX = faceCenter.x * ctx.canvas.width;
    const startY = faceCenter.y * ctx.canvas.height;
    const endX = startX + (gazeVector.x * 100);
    const endY = startY + (gazeVector.y * 100);
    
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Draw arrow head
    const angle = Math.atan2(endY - startY, endX - startX);
    const arrowLength = 10;
    
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrowLength * Math.cos(angle - Math.PI / 6), endY - arrowLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrowLength * Math.cos(angle + Math.PI / 6), endY - arrowLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }, [getFaceCenter]);

  const drawEyeTrackingIndicators = useCallback((leftEye: any[], rightEye: any[], leftEAR: number, rightEAR: number, ctx: CanvasRenderingContext2D) => {
    // Draw eye regions
    ctx.strokeStyle = leftEAR < MEDIAPIPE_SOLUTIONS_CONFIG.eyeTracking.blinkThreshold ? '#ef4444' : '#10b981';
    ctx.lineWidth = 2;
    
    // Left eye
    if (leftEye.length > 0) {
      ctx.beginPath();
      leftEye.forEach((point, index) => {
        const x = point.x * ctx.canvas.width;
        const y = point.y * ctx.canvas.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    
    // Right eye
    ctx.strokeStyle = rightEAR < MEDIAPIPE_SOLUTIONS_CONFIG.eyeTracking.blinkThreshold ? '#ef4444' : '#10b981';
    if (rightEye.length > 0) {
      ctx.beginPath();
      rightEye.forEach((point, index) => {
        const x = point.x * ctx.canvas.width;
        const y = point.y * ctx.canvas.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }, []);

  /**
   * Effects
   */
  useEffect(() => {
    if (isActive) {
      initializeMediaPipe();
    }

    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      processingRef.current = false;
      
      if (faceDetector) faceDetector.close();
      if (faceLandmarker) faceLandmarker.close();
      if (poseLandmarker) poseLandmarker.close();
    };
  }, [isActive, initializeMediaPipe]);

  useEffect(() => {
    if (isInitialized && isActive) {
      startProcessing();
    }

    return () => {
      processingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isInitialized, isActive, startProcessing]);

  /**
   * Render
   */
  return (
    <Card className="p-4 bg-white border-2 border-blue-200">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <h3 className="text-lg font-semibold">MediaPipe Solutions Proctoring</h3>
          </div>
          <div className="flex items-center gap-2">
            {isInitialized ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-600" />
            )}
            <span className={`text-sm ${isInitialized ? 'text-green-600' : 'text-yellow-600'}`}>
              {isInitialized ? 'Ready' : 'Initializing...'}
            </span>
          </div>
        </div>

        {/* Calibration Status */}
        {showCalibration && !calibration.isCalibrated && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Calibration Required</span>
            </div>
            <div className="text-xs text-blue-600">
              Progress: {Math.round(calibration.calibrationProgress)}%
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 mt-1">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${calibration.calibrationProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Enhanced Stats Display */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-600">Faces</div>
            <div className={`font-bold text-lg ${stats.facesDetected > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.facesDetected}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-600">Gaze</div>
            <div className={`font-bold text-lg ${stats.gazeViolations === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
              {stats.gazeViolations}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-600">Eyes</div>
            <div className={`font-bold text-lg ${stats.eyeMovementViolations === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
              {stats.eyeMovementViolations}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-600">People</div>
            <div className={`font-bold text-lg ${stats.multiplePeopleViolations === 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.multiplePeopleViolations}
            </div>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="text-xs text-gray-500">Total Violations</div>
            <div className={`font-semibold ${stats.totalViolations === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
              {stats.totalViolations}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Objects</div>
            <div className={`font-semibold ${stats.objectViolations === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
              {stats.objectViolations}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Performance</div>
            <div className="font-semibold text-blue-600">
              {Math.round(stats.performanceMetrics.averageProcessingTime)}ms
            </div>
          </div>
        </div>

        {/* Canvas for visualization */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full border border-gray-300 rounded-lg"
            style={{ maxHeight: '300px' }}
          />
        </div>

        {/* Recent violations */}
        {violations.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Recent Violations</div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {violations.slice(0, 5).map((violation) => (
                <div 
                  key={violation.id} 
                  className="flex items-center gap-2 p-2 text-sm rounded"
                  style={{ 
                    backgroundColor: `${VIOLATION_SEVERITY_MAPPING[violation.severity].color}15`,
                    borderLeft: `3px solid ${VIOLATION_SEVERITY_MAPPING[violation.severity].color}`
                  }}
                >
                  <AlertTriangle 
                    className="w-4 h-4 flex-shrink-0" 
                    style={{ color: VIOLATION_SEVERITY_MAPPING[violation.severity].color }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{violation.description}</div>
                    <div className="text-xs text-gray-500">
                      Confidence: {Math.round(violation.confidence * 100)}% • 
                      {new Date(violation.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Performance metrics */}
        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div>Frames: {stats.performanceMetrics.framesProcessed}</div>
              <div>Skipped: {stats.performanceMetrics.skippedFrames}</div>
            </div>
            <div>
              <div>Avg Time: {Math.round(stats.performanceMetrics.averageProcessingTime)}ms</div>
              <div>Session: {Math.round(stats.sessionDuration / 1000)}s</div>
            </div>
            <div>
              <div>Calibrated: {calibration.isCalibrated ? '✅' : '❌'}</div>
              <div>Models: {isInitialized ? '✅' : '⏳'}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
