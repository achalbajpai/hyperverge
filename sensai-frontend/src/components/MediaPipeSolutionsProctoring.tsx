import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { AlertTriangle, Eye, Shield, CheckCircle } from 'lucide-react';
import { 
  MEDIAPIPE_SOLUTIONS_CONFIG,
  type FaceTrackingData,
  type MultipleFaceDetectionResult,
  type PrimaryPersonSelectionStrategy
} from '../config/mediapipe-solutions-config';

// MediaPipe Solutions imports
import { 
  FaceDetector, 
  FaceLandmarker, 
  PoseLandmarker,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult
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

  // Enhanced face tracking state for multiple people support
  const [faceTrackingData, setFaceTrackingData] = useState<FaceTrackingData[]>([]);
  const [primaryFaceId, setPrimaryFaceId] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<MultipleFaceDetectionResult>({
    faces: [],
    primaryFaceId: null,
    totalFacesDetected: 0,
    detectionQuality: 0,
    stabilityMetrics: {
      averageStability: 0,
      primaryFaceStability: 0,
      faceTrackingContinuity: 0
    }
  });

  // Error recovery and adaptive threshold state
  const [adaptiveThresholds, setAdaptiveThresholds] = useState({
    faceDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.confidenceThreshold,
    stabilityThreshold: MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.stabilityThreshold,
    errorRecoveryAttempts: 0,
    lastSuccessfulDetection: Date.now()
  });

  const [errorRecoveryState, setErrorRecoveryState] = useState({
    consecutiveFailures: 0,
    isRecovering: false,
    lastErrorType: null as string | null,
    recoveryStrategies: [] as string[]
  });

  /**
   * Adaptive threshold adjustment based on detection performance
   */
  const adjustAdaptiveThresholds = useCallback((detectionSuccess: boolean, detectionQuality: number) => {
    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    
    if (!config.adaptiveConfidence) return;
    
    setAdaptiveThresholds(prev => {
      let newConfidence = prev.faceDetectionConfidence;
      let newStability = prev.stabilityThreshold;
      let newAttempts = prev.errorRecoveryAttempts;
      
      if (detectionSuccess && detectionQuality > 0.7) {
        // Successful detection with good quality - can be more strict
        newConfidence = Math.min(config.confidenceThreshold + 0.1, newConfidence + 0.02);
        newStability = Math.min(config.stabilityThreshold + 0.1, newStability + 0.01);
        newAttempts = Math.max(0, newAttempts - 1); // Reduce recovery attempts
      } else if (!detectionSuccess || detectionQuality < 0.4) {
        // Poor or no detection - be more lenient
        newConfidence = Math.max(config.confidenceThreshold - 0.2, newConfidence - 0.03);
        newStability = Math.max(config.stabilityThreshold - 0.2, newStability - 0.02);
        newAttempts = Math.min(10, newAttempts + 1); // Increase recovery attempts
      }
      
      return {
        faceDetectionConfidence: newConfidence,
        stabilityThreshold: newStability,
        errorRecoveryAttempts: newAttempts,
        lastSuccessfulDetection: detectionSuccess ? Date.now() : prev.lastSuccessfulDetection
      };
    });
  }, []);

  /**
   * Error recovery mechanism with multiple strategies
   */
  const attemptErrorRecovery = useCallback(async (errorType: string, errorDetails: any) => {
    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    
    if (config.debugMode) {
      console.log(`🔧 ATTEMPTING ERROR RECOVERY for ${errorType}:`, errorDetails);
    }
    
    setErrorRecoveryState(prev => {
      const newFailures = prev.consecutiveFailures + 1;
      const strategies = [...prev.recoveryStrategies];
      
      // Add recovery strategy based on error type
      if (errorType === 'no_face_detection' && newFailures > 3) {
        strategies.push('lower_confidence_threshold');
      } else if (errorType === 'poor_stability' && newFailures > 5) {
        strategies.push('reset_tracking_state');
      } else if (errorType === 'initialization_failure') {
        strategies.push('reinitialize_mediapipe');
      }
      
      return {
        consecutiveFailures: newFailures,
        isRecovering: newFailures > 2,
        lastErrorType: errorType,
        recoveryStrategies: strategies
      };
    });

    // Execute recovery strategies
    if (errorRecoveryState.consecutiveFailures > 2) {
      // Strategy 1: Lower detection thresholds
      if (errorType === 'no_face_detection') {
        adjustAdaptiveThresholds(false, 0.2);
      }
      
      // Strategy 2: Reset tracking state
      if (errorType === 'poor_stability') {
        setFaceTrackingData([]);
        setPrimaryFaceId(null);
      }
      
      // Strategy 3: Reinitialize MediaPipe (last resort)
      if (errorRecoveryState.consecutiveFailures > 8 && faceLandmarker) {
        if (config.debugMode) {
          console.log('🔄 REINITIALIZING MEDIAPIPE - last resort recovery');
        }
        faceLandmarker.close();
        await initializeMediaPipe();
      }
    }
  }, [errorRecoveryState.consecutiveFailures, adjustAdaptiveThresholds, faceLandmarker, initializeMediaPipe]);

  /**
   * Reset error recovery state on successful detection
   */
  const resetErrorRecoveryState = useCallback(() => {
    setErrorRecoveryState({
      consecutiveFailures: 0,
      isRecovering: false,
      lastErrorType: null,
      recoveryStrategies: []
    });
  }, []);

  /**
   * Initialize MediaPipe Solutions with error handling
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
      const faceLandmarkerOptions = {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SOLUTIONS_CONFIG.models.faceLandmarkerPath
        },
        runningMode: 'VIDEO' as const,
        minFaceDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFaceDetectionConfidence,
        minFacePresenceConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFacePresenceConfidence,
        minTrackingConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minTrackingConfidence,
        outputFaceBlendshapes: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.outputFaceBlendshapes,
        outputFacialTransformationMatrixes: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.outputFacialTransformationMatrixes,
        numFaces: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces
      };

      // ✅ CRITICAL DEBUG STEP: Log the options to be 100% sure
      console.log("🔍 INITIALIZING FACELANDMARKER WITH OPTIONS:", faceLandmarkerOptions);
      console.log("🎯 numFaces setting:", MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces);

      const landmarker = await FaceLandmarker.createFromOptions(vision, faceLandmarkerOptions);

      setFaceDetector(detector);
      setFaceLandmarker(landmarker);
      setIsInitialized(true);

      console.log('✅ MediaPipe Solutions initialized successfully');
      resetErrorRecoveryState(); // Reset error state on successful initialization
    } catch (error) {
      console.error('❌ Failed to initialize MediaPipe Solutions:', error);
      await attemptErrorRecovery('initialization_failure', error);
    }
  }, [resetErrorRecoveryState, attemptErrorRecovery]);

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
   * Enhanced face tracking with stability scoring and continuity
   */
  const trackFacesWithStability = useCallback((
    currentLandmarks: Array<Array<{x: number, y: number}>>,
    timestamp: number
  ): MultipleFaceDetectionResult => {
    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    const newFaces: FaceTrackingData[] = [];
    
    if (config.debugMode) {
      console.log("🎯 TRACKING FACES WITH STABILITY:", {
        inputFaceCount: currentLandmarks.length,
        existingTrackedFaces: faceTrackingData.length,
        timestamp: timestamp,
        configMinSize: config.minFaceSize,
        configMaxSize: config.maxFaceSize
      });
    }
    
    // Process each detected face
    currentLandmarks.forEach((landmarks, index) => {
      const facePosition = { x: landmarks[1]?.x || 0.5, y: landmarks[1]?.y || 0.5 };
      const faceSize = calculateFaceSize(landmarks);
      
      if (config.debugMode) {
        console.log(`🔍 PROCESSING FACE ${index + 1}:`, {
          facePosition: {
            x: facePosition.x.toFixed(3),
            y: facePosition.y.toFixed(3)
          },
          faceSize: faceSize.toFixed(3),
          minSizeThreshold: config.minFaceSize,
          maxSizeThreshold: config.maxFaceSize,
          passesSizeFilter: faceSize >= config.minFaceSize && faceSize <= config.maxFaceSize
        });
      }

      // Skip faces that are too small or too large
      if (faceSize < config.minFaceSize || faceSize > config.maxFaceSize) {
        if (config.debugMode) {
          console.log(`🚫 FACE ${index + 1} FILTERED OUT: size ${faceSize.toFixed(3)} outside range [${config.minFaceSize}, ${config.maxFaceSize}]`);
        }
        return;
      }
      
      // Try to match with existing tracked faces
      let matchedFace: FaceTrackingData | null = null;
      let minDistance = Number.MAX_VALUE;
      
      for (const existingFace of faceTrackingData) {
        const distance = Math.sqrt(
          Math.pow(facePosition.x - existingFace.position.x, 2) +
          Math.pow(facePosition.y - existingFace.position.y, 2)
        );
        
        // Match if within reasonable distance threshold
        if (distance < 0.1 && distance < minDistance) {
          minDistance = distance;
          matchedFace = existingFace;
        }
      }
      
      let faceId: string;
      let stabilityScore: number;
      let framesSinceDetection: number;
      
      if (matchedFace) {
        // Update existing face
        faceId = matchedFace.id;
        framesSinceDetection = 0;
        
        // Calculate stability based on position consistency
        const positionStability = Math.max(0, 1 - (minDistance * 10));
        const sizeStability = Math.max(0, 1 - Math.abs(faceSize - matchedFace.size) * 5);
        stabilityScore = (positionStability + sizeStability) / 2;
        
        // Smooth the stability score
        stabilityScore = (matchedFace.stabilityScore * 0.7) + (stabilityScore * 0.3);
      } else {
        // New face detected
        faceId = `face_${timestamp}_${index}`;
        stabilityScore = 0.5; // Initial stability
        framesSinceDetection = 0;
        
        if (config.debugMode) {
          console.log(`🆕 NEW FACE DETECTED: ${faceId} at position (${facePosition.x.toFixed(3)}, ${facePosition.y.toFixed(3)})`);
        }
      }
      
      newFaces.push({
        id: faceId,
        landmarks,
        confidence: 0.8, // Base confidence, could be enhanced with actual detection confidence
        position: facePosition,
        size: faceSize,
        stabilityScore,
        framesSinceDetection,
        isPrimary: false, // Will be set later
        lastSeen: timestamp
      });
    });
    
    // Age existing faces that weren't detected
    const maxMissingFrames = 10;
    faceTrackingData.forEach(existingFace => {
      const wasDetected = newFaces.some(face => face.id === existingFace.id);
      if (!wasDetected && existingFace.framesSinceDetection < maxMissingFrames) {
        // Keep tracking temporarily missing faces
        newFaces.push({
          ...existingFace,
          framesSinceDetection: existingFace.framesSinceDetection + 1,
          stabilityScore: existingFace.stabilityScore * 0.9 // Decay stability
        });
      }
    });
    
    // Select primary face based on strategy
    let selectedPrimaryId: string | null = null;
    if (newFaces.length > 0) {
      selectedPrimaryId = selectPrimaryFace(newFaces, config.primaryPersonSelection);
      
      // Mark primary face
      newFaces.forEach(face => {
        face.isPrimary = face.id === selectedPrimaryId;
      });
    }
    
    // Calculate stability metrics
    const averageStability = newFaces.length > 0 
      ? newFaces.reduce((sum, face) => sum + face.stabilityScore, 0) / newFaces.length 
      : 0;
    const primaryFace = newFaces.find(face => face.isPrimary);
    const primaryFaceStability = primaryFace?.stabilityScore || 0;
    
    // Face tracking continuity (what percentage of faces were successfully tracked from previous frame)
    const continuityScore = faceTrackingData.length > 0
      ? newFaces.filter(face => faceTrackingData.some(old => old.id === face.id)).length / Math.max(faceTrackingData.length, newFaces.length)
      : 1;
    
    if (config.debugMode) {
      console.log("📊 FACE TRACKING COMPLETE:", {
        inputFaces: currentLandmarks.length,
        processedFaces: newFaces.length,
        selectedPrimaryId: selectedPrimaryId,
        detectionQuality: averageStability.toFixed(3),
        continuityScore: continuityScore.toFixed(3),
        faceDetails: newFaces.map(face => ({
          id: face.id.substring(0, 12) + '...',
          isPrimary: face.isPrimary,
          stability: face.stabilityScore.toFixed(3),
          size: face.size.toFixed(3)
        }))
      });
    }

    return {
      faces: newFaces,
      primaryFaceId: selectedPrimaryId,
      totalFacesDetected: currentLandmarks.length,
      detectionQuality: averageStability,
      stabilityMetrics: {
        averageStability,
        primaryFaceStability,
        faceTrackingContinuity: continuityScore
      }
    };
  }, [faceTrackingData, calculateFaceSize, selectPrimaryFace]);

  /**
   * Smart primary face selection with multiple strategies
   */
  const selectPrimaryFace = useCallback((
    faces: FaceTrackingData[], 
    strategy: PrimaryPersonSelectionStrategy
  ): string | null => {
    if (faces.length === 0) return null;
    if (faces.length === 1) return faces[0].id;
    
    // Filter out faces that haven't been stable enough
    const stableFaces = faces.filter(face => 
      face.stabilityScore >= MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.stabilityThreshold
    );
    
    const candidateFaces = stableFaces.length > 0 ? stableFaces : faces;
    
    switch (strategy) {
      case 'largest': {
        return candidateFaces.reduce((largest, face) => 
          face.size > largest.size ? face : largest
        ).id;
      }
      
      case 'center': {
        const centerPoint = { x: 0.5, y: 0.5 };
        return candidateFaces.reduce((closest, face) => {
          const faceDistance = Math.sqrt(
            Math.pow(face.position.x - centerPoint.x, 2) + 
            Math.pow(face.position.y - centerPoint.y, 2)
          );
          const closestDistance = Math.sqrt(
            Math.pow(closest.position.x - centerPoint.x, 2) + 
            Math.pow(closest.position.y - centerPoint.y, 2)
          );
          return faceDistance < closestDistance ? face : closest;
        }).id;
      }
      
      case 'most_stable': {
        return candidateFaces.reduce((mostStable, face) => 
          face.stabilityScore > mostStable.stabilityScore ? face : mostStable
        ).id;
      }
      
      case 'first':
      default:
        return candidateFaces[0].id;
    }
  }, []);

  /**
   * Process face landmarker results with enhanced multiple people support
   */
  const processFaceLandmarkerResults = useCallback((
    results: FaceLandmarkerResult, 
    ctx: CanvasRenderingContext2D
  ) => {
    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    const timestamp = Date.now();

    // Enhanced debug logging with detailed detection info
    if (config.debugMode) {
      console.log("🔍 ENHANCED FACE DETECTION RESULTS:", {
        faceLandmarksCount: results.faceLandmarks?.length || 0,
        hasDetections: !!(results.faceLandmarks && results.faceLandmarks.length > 0),
        configNumFaces: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces,
        currentTrackedFaces: faceTrackingData.length,
        primaryFaceId: primaryFaceId,
        rawResults: {
          faceLandmarksArray: results.faceLandmarks ? results.faceLandmarks.map((landmarks, idx) => ({
            faceIndex: idx,
            landmarkCount: landmarks?.length,
            firstLandmark: landmarks?.[0],
            noseTipLandmark: landmarks?.[1] // Key landmark for face center
          })) : [],
          hasBlendshapes: !!results.faceBlendshapes,
          blendshapesCount: results.faceBlendshapes?.length || 0
        }
      });

      // Log each detected face separately for detailed analysis
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        results.faceLandmarks.forEach((landmarks, index) => {
          const faceCenter = landmarks[1] || { x: 0.5, y: 0.5 };
          console.log(`👤 DETECTED FACE ${index + 1}:`, {
            landmarkCount: landmarks.length,
            faceCenter: {
              x: faceCenter.x?.toFixed(3),
              y: faceCenter.y?.toFixed(3)
            },
            sampleLandmarks: landmarks.slice(0, 5).map(l => ({ 
              x: l.x?.toFixed(3), 
              y: l.y?.toFixed(3) 
            }))
          });
        });
      }
    }

    // Handle no face detection case with error recovery
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      if (config.debugMode) {
        console.log("⚠️ NO FACES DETECTED - DETAILED ANALYSIS:", {
          hasResults: !!results,
          hasFaceLandmarks: !!results.faceLandmarks,
          faceLandmarksLength: results.faceLandmarks?.length || 0,
          configuredNumFaces: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces,
          currentAdaptiveConfidence: adaptiveThresholds.faceDetectionConfidence,
          originalConfidence: config.confidenceThreshold,
          mediapipeMinDetectionConfidence: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.minFaceDetectionConfidence,
          consecutiveFailures: errorRecoveryState.consecutiveFailures,
          isRecovering: errorRecoveryState.isRecovering
        });
      }
      
      // Age existing faces and check if we should trigger no face violation
      const agedFaces = faceTrackingData.map(face => ({
        ...face,
        framesSinceDetection: face.framesSinceDetection + 1
      })).filter(face => face.framesSinceDetection < 20); // Keep for 20 frames max
      
      setFaceTrackingData(agedFaces);
      
      if (agedFaces.length === 0) {
        setFaceDetectionStats(prev => ({
          ...prev,
          isPresent: false,
          confidence: 0,
          lastDetectionTime: timestamp
        }));
        
        // Trigger error recovery for no face detection (non-blocking)
        attemptErrorRecovery('no_face_detection', {
          timestamp,
          consecutiveFailures: errorRecoveryState.consecutiveFailures + 1,
          adaptiveThresholds: adaptiveThresholds
        });
        
        // Adjust adaptive thresholds for poor detection
        adjustAdaptiveThresholds(false, 0.1);
        
        handleNoFaceDetected();
      }
      return;
    }

    // Track faces with stability scoring
    const trackingResult = trackFacesWithStability(results.faceLandmarks, timestamp);
    
    // Update state
    setFaceTrackingData(trackingResult.faces);
    setPrimaryFaceId(trackingResult.primaryFaceId);
    setDetectionResult(trackingResult);

    // Enhanced debug logging for tracking results
    if (config.debugMode) {
      console.log("🎯 FACE TRACKING RESULTS:", {
        totalDetected: trackingResult.totalFacesDetected,
        totalTracked: trackingResult.faces.length,
        primaryFaceId: trackingResult.primaryFaceId,
        averageStability: trackingResult.stabilityMetrics.averageStability.toFixed(3),
        continuity: trackingResult.stabilityMetrics.faceTrackingContinuity.toFixed(3),
        adaptiveThresholds: adaptiveThresholds,
        errorRecoveryActive: errorRecoveryState.isRecovering
      });
    }

    // Reset error recovery on successful detection with good quality
    if (trackingResult.detectionQuality > 0.6) {
      resetErrorRecoveryState();
    }

    // Adjust adaptive thresholds based on detection success
    adjustAdaptiveThresholds(
      trackingResult.faces.length > 0,
      trackingResult.detectionQuality
    );

    // Check for poor stability and attempt recovery if needed (non-blocking)
    if (trackingResult.stabilityMetrics.averageStability < 0.3 && trackingResult.faces.length > 0) {
      attemptErrorRecovery('poor_stability', {
        averageStability: trackingResult.stabilityMetrics.averageStability,
        primaryFaceStability: trackingResult.stabilityMetrics.primaryFaceStability,
        continuity: trackingResult.stabilityMetrics.faceTrackingContinuity
      });
    }

    // Update face detection stats with primary face or best available face
    const primaryFace = trackingResult.faces.find(face => face.isPrimary) || trackingResult.faces[0];
    
    if (primaryFace) {
      setFaceDetectionStats({
        isPresent: true,
        confidence: primaryFace.confidence,
        position: primaryFace.position,
        size: primaryFace.size,
        lastDetectionTime: timestamp,
      });

      // Handle multiple people violation if configured
      if (trackingResult.totalFacesDetected > 1 && config.treatMultipleAsViolation) {
        createThrottledViolation(
          'multiple_faces',
          'high',
          `Multiple faces detected: ${trackingResult.totalFacesDetected}`,
          0.9,
          { 
            faceCount: trackingResult.totalFacesDetected,
            trackedFaces: trackingResult.faces.length,
            stabilityMetrics: trackingResult.stabilityMetrics
          }
        );
      }

      // Process calibration if needed
      if (!calibration.isCalibrated && showCalibration) {
        handleCalibrationPhase(primaryFace.landmarks);
        drawEnhancedFaceLandmarks(trackingResult.faces, ctx);
        return;
      }

      // Process gaze and eye tracking with primary face (non-blocking)
      processGazeTracking(primaryFace.landmarks);
      processEyeTracking(primaryFace.landmarks);
    }

    // Draw all tracked faces with enhanced visualization
    drawEnhancedFaceLandmarks(trackingResult.faces, ctx);

  }, [
    calibration.isCalibrated, 
    showCalibration, 
    createThrottledViolation,
    faceTrackingData,
    primaryFaceId,
    trackFacesWithStability,
    adaptiveThresholds,
    adjustAdaptiveThresholds,
    attemptErrorRecovery,
    errorRecoveryState.consecutiveFailures,
    resetErrorRecoveryState
  ]);

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
      if (MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.debugMode) {
        console.log("⚠️ PROCESS FRAME EARLY EXIT:", {
          hasVideo: !!videoRef.current,
          hasCanvas: !!canvasRef.current,
          isProcessing: processingRef.current,
          isInitialized: isInitialized,
          hasContext: !!ctx,
          hasFaceLandmarker: !!faceLandmarker,
          hasFaceDetector: !!faceDetector
        });
      }
      return;
    }

    // Check if video is ready
    if (video.readyState < 2) {
      if (MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.debugMode) {
        console.log("⚠️ VIDEO NOT READY:", {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
      }
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

      // Enhanced debug logging before detection
      if (MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.debugMode) {
        console.log("🚀 STARTING FACE DETECTION:", {
          timestamp: performance.now(),
          videoReady: video.readyState >= 2,
          videoSize: `${video.videoWidth}x${video.videoHeight}`,
          canvasSize: `${canvas.width}x${canvas.height}`,
          faceLandmarkerReady: !!faceLandmarker,
          configuredNumFaces: MEDIAPIPE_SOLUTIONS_CONFIG.faceLandmarker.numFaces,
          currentTrackedFaces: faceTrackingData.length,
          adaptiveConfidence: adaptiveThresholds.faceDetectionConfidence
        });
      }

      // Process face landmarker results
      const faceLandmarkerResults = await faceLandmarker.detectForVideo(video, performance.now());
      
      // Enhanced debug logging after detection
      if (MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection.debugMode) {
        console.log("📊 RAW MEDIAPIPE DETECTION RESULTS:", {
          faceLandmarksLength: faceLandmarkerResults.faceLandmarks?.length || 0,
          hasBlendshapes: !!faceLandmarkerResults.faceBlendshapes,
          resultKeys: Object.keys(faceLandmarkerResults),
          firstFewLandmarks: faceLandmarkerResults.faceLandmarks?.[0]?.slice(0, 3)
        });
      }
      
      processFaceLandmarkerResults(faceLandmarkerResults, ctx);

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
  }, [videoRef, isInitialized, faceLandmarker, faceDetector, processFaceLandmarkerResults]);

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
   * Draw enhanced face landmarks for multiple faces with proper color coding
   */
  const drawEnhancedFaceLandmarks = useCallback((faces: FaceTrackingData[], ctx: CanvasRenderingContext2D) => {
    if (!canvasRef.current || faces.length === 0) return;

    const canvas = canvasRef.current;
    const config = MEDIAPIPE_SOLUTIONS_CONFIG.multiplePeopleDetection;
    
    faces.forEach((face) => {
      const { landmarks, isPrimary, stabilityScore, id } = face;
      
      // Determine color based on face status
      let strokeColor: string;
      let fillColor: string;
      let lineWidth: number;
      
      if (isPrimary) {
        strokeColor = config.colorCoding.primary;
        fillColor = config.colorCoding.primary;
        lineWidth = 3;
      } else {
        strokeColor = config.colorCoding.secondary;
        fillColor = config.colorCoding.secondary;
        lineWidth = 2;
      }
      
      // Adjust opacity based on stability
      const alpha = Math.max(0.5, stabilityScore);
      const strokeColorWithAlpha = strokeColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
      const fillColorWithAlpha = fillColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
      
      ctx.strokeStyle = strokeColorWithAlpha;
      ctx.fillStyle = fillColorWithAlpha;
      ctx.lineWidth = lineWidth;
      
      // Draw face bounding box
      const faceCenter = { x: landmarks[1]?.x || 0.5, y: landmarks[1]?.y || 0.5 };
      const faceSize = calculateFaceSize(landmarks);
      const boxSize = faceSize * canvas.width * 0.8;
      const boxX = (faceCenter.x * canvas.width) - (boxSize / 2);
      const boxY = (faceCenter.y * canvas.height) - (boxSize / 2);
      
      ctx.strokeRect(boxX, boxY, boxSize, boxSize);
      
      // Draw key facial landmarks
      const keyPoints = [33, 362, 1, 175]; // Left eye, right eye, nose tip, chin
      keyPoints.forEach((pointIndex) => {
        if (landmarks[pointIndex]) {
          const point = landmarks[pointIndex];
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, isPrimary ? 4 : 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
      
      // Draw face ID and stability indicator
      if (config.debugMode) {
        const textX = (faceCenter.x * canvas.width) + (boxSize / 2) + 5;
        const textY = (faceCenter.y * canvas.height) - (boxSize / 2);
        
        ctx.font = isPrimary ? 'bold 14px Arial' : '12px Arial';
        ctx.fillStyle = strokeColor;
        ctx.fillText(`${isPrimary ? '👑' : ''} ${id.split('_')[0]}`, textX, textY);
        ctx.fillText(`${(stabilityScore * 100).toFixed(0)}%`, textX, textY + 15);
      }
      
      // Draw primary indicator
      if (isPrimary) {
        const crownX = (faceCenter.x * canvas.width);
        const crownY = (faceCenter.y * canvas.height) - (boxSize / 2) - 10;
        
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = config.colorCoding.primary;
        ctx.fillText('👑', crownX, crownY);
        ctx.textAlign = 'left';
      }
    });
    
    // Draw tracking statistics in top-left corner
    if (config.debugMode && faces.length > 0) {
      const stats = detectionResult;
      ctx.font = '12px monospace';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(10, 10, 200, 80);
      
      ctx.fillStyle = 'white';
      ctx.fillText(`Faces: ${stats.totalFacesDetected}`, 15, 25);
      ctx.fillText(`Tracked: ${stats.faces.length}`, 15, 40);
      ctx.fillText(`Primary: ${stats.primaryFaceId?.split('_')[0] || 'None'}`, 15, 55);
      ctx.fillText(`Quality: ${(stats.detectionQuality * 100).toFixed(0)}%`, 15, 70);
      ctx.fillText(`Continuity: ${(stats.stabilityMetrics.faceTrackingContinuity * 100).toFixed(0)}%`, 15, 85);
    }
  }, [calculateFaceSize, detectionResult]);


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
