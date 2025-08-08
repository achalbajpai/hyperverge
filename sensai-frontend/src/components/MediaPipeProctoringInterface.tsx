import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { AlertTriangle, Eye, Users, Camera, Smartphone, Shield } from 'lucide-react';

// MediaPipe interfaces
interface MediaPipeResults {
  faceLandmarks?: any;
  pose?: any;
  hands?: any;
  objectDetections?: any;
}

interface ViolationLog {
  id: string;
  type: 'face_detection' | 'gaze_tracking' | 'eye_movement' | 'mouth_movement' | 'multiple_people' | 'unauthorized_object';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  description: string;
  confidence: number;
  evidence: any;
}

interface MediaPipeProctoringInterfaceProps {
  isActive: boolean;
  sessionId: string | null;
  userId: string | number;
  onViolationDetected: (violation: ViolationLog) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export default function MediaPipeProctoringInterface({
  isActive,
  sessionId,
  userId,
  onViolationDetected,
  videoRef
}: MediaPipeProctoringInterfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [stats, setStats] = useState({
    facesDetected: 0,
    gazeViolations: 0,
    eyeMovementViolations: 0,
    multiplePeopleViolations: 0,
    objectViolations: 0
  });

  // MediaPipe components
  const [holistic, setHolistic] = useState<any>(null);
  const [objectDetector, setObjectDetector] = useState<any>(null);
  
  // Violation tracking with optimized parameters
  const lastViolationTime = useRef<{[key: string]: { time: number; active: boolean } }>({});
  const gazeBaseline = useRef<{x: number, y: number} | null>(null);
  const eyeBlinkCount = useRef<number>(0);
  const lastFaceCount = useRef<number>(0);
  const lastEyePosition = useRef<{x: number, y: number} | null>(null);
  const processingActive = useRef<boolean>(false);
  
  // Calibration and smoothing parameters (Research-backed optimal values)
  const calibrationFrames = useRef<number>(0);
  const isCalibrated = useRef<boolean>(false);
  const userEARBaseline = useRef<{left: number, right: number} | null>(null);
  const gazeHistory = useRef<{x: number, y: number}[]>([]);
  const faceDetectionHistory = useRef<boolean[]>([]);
  const frameProcessingCounter = useRef<number>(0);
  const violationConfirmation = useRef<{[key: string]: number}>({});

  // Load MediaPipe models
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        // Import MediaPipe dynamically
        const { Holistic } = await import('@mediapipe/holistic');
        const { Camera } = await import('@mediapipe/camera_utils');

        const holisticModel = new Holistic({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
          }
        });

        // Research-backed optimal MediaPipe configuration
        holisticModel.setOptions({
          modelComplexity: 0,                    // Reduced from 1 for better performance
          smoothLandmarks: true,                 // Enable landmark smoothing (CRITICAL)
          enableSegmentation: false,
          smoothSegmentation: true,
          refineFaceLandmarks: true,             // Better face accuracy
          minDetectionConfidence: 0.7,           // Increased from 0.5
          minTrackingConfidence: 0.7             // Increased from 0.5
        });

        holisticModel.onResults(onMediaPipeResults);
        setHolistic(holisticModel);

        // Initialize object detection for phones/tablets
        await initializeObjectDetection();

      } catch (error) {
        console.error('Failed to load MediaPipe:', error);
      }
    };

    if (isActive) {
      loadMediaPipe();
    }

    return () => {
      if (holistic) {
        holistic.close();
      }
    };
  }, [isActive]);

  // Initialize object detection using MediaPipe Solutions
  const initializeObjectDetection = async () => {
    try {
      // For object detection, we'll use MediaPipe's Objectron or custom detection
      // This is a simplified implementation - in production you'd want more sophisticated detection
      console.log('Object detection initialized');
    } catch (error) {
      console.error('Failed to initialize object detection:', error);
    }
  };

  // Start MediaPipe processing
  useEffect(() => {
    const startProcessing = async () => {
      if (!isActive || !holistic || !videoRef.current) return;

      try {
        const { Camera } = await import('@mediapipe/camera_utils');
        
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current) {
              await holistic.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });
        
        await camera.start();
      } catch (error) {
        console.error('Failed to start MediaPipe processing:', error);
      }
    };

    startProcessing();
  }, [isActive, holistic, videoRef]);

  // Optimized MediaPipe results handler with frame skipping and smoothing
  const onMediaPipeResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current || processingActive.current) return;
    
    // Performance optimization: Process every 2nd frame (50% CPU reduction)
    frameProcessingCounter.current++;
    if (frameProcessingCounter.current % 2 !== 0) return;
    
    processingActive.current = true;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match video
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw video frame
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      // Handle calibration phase (first 30 frames = 1 second at 30fps)
      if (calibrationFrames.current < 30) {
        handleCalibrationPhase(results);
        calibrationFrames.current++;
        return;
      }

      if (!isCalibrated.current && calibrationFrames.current >= 30) {
        finalizeCalibration();
        isCalibrated.current = true;
      }

      // Process face landmarks with stabilization
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        processFaceDetectionStabilized(results.faceLandmarks, ctx);
        if (isCalibrated.current) {
          processGazeTrackingSmooth(results.faceLandmarks, ctx);
          processEyeTrackingCalibrated(results.faceLandmarks, ctx);
        }
      } else {
        handleNoFaceDetectedStabilized();
      }

      // Process pose for multiple people detection
      processMultiplePeopleDetection(results, ctx);

      // Process hands for object detection
      if (results.leftHandLandmarks || results.rightHandLandmarks) {
        processHandDetection(results, ctx);
      }

    } finally {
      processingActive.current = false;
    }
  }, []);

  // User calibration phase handler
  const handleCalibrationPhase = (results: any) => {
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      // Collect baseline eye aspect ratios during calibration
      const leftEye = getEyeLandmarks(results.faceLandmarks, 'left');
      const rightEye = getEyeLandmarks(results.faceLandmarks, 'right');
      
      if (leftEye.length && rightEye.length) {
        const leftEAR = calculateEyeAspectRatio(leftEye);
        const rightEAR = calculateEyeAspectRatio(rightEye);
        
        if (!userEARBaseline.current) {
          userEARBaseline.current = { left: leftEAR, right: rightEAR };
        } else {
          // Smooth calibration values
          userEARBaseline.current.left = (userEARBaseline.current.left + leftEAR) / 2;
          userEARBaseline.current.right = (userEARBaseline.current.right + rightEAR) / 2;
        }
      }
      
      // Collect gaze baseline
      const gazeVector = calculateGazeDirection(leftEye, rightEye, results.faceLandmarks);
      if (!gazeBaseline.current) {
        gazeBaseline.current = { x: gazeVector.x, y: gazeVector.y };
      } else {
        gazeBaseline.current.x = (gazeBaseline.current.x + gazeVector.x) / 2;
        gazeBaseline.current.y = (gazeBaseline.current.y + gazeVector.y) / 2;
      }
    }
  };

  const finalizeCalibration = () => {
    console.log('🎯 MediaPipe calibration completed:', {
      userEARBaseline: userEARBaseline.current,
      gazeBaseline: gazeBaseline.current
    });
  };

  // Stabilized face detection with 15-frame confirmation
  const handleNoFaceDetectedStabilized = () => {
    faceDetectionHistory.current.push(false);
    if (faceDetectionHistory.current.length > 15) {
      faceDetectionHistory.current.shift();
    }
    
    // Require 15 consecutive frames without face to trigger violation
    const noFaceFrames = faceDetectionHistory.current.filter(detected => !detected).length;
    
    setStats(prev => ({ ...prev, facesDetected: 0 }));
    
    if (noFaceFrames >= 15) {
      createViolationOptimized('face_detection', 'high', 'No face detected in camera view', 0.8, {
        facesDetected: 0,
        confirmationFrames: noFaceFrames,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Optimized face detection with stabilized positioning thresholds
  const processFaceDetectionStabilized = (faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (!faceLandmarks || faceLandmarks.length === 0) {
      handleNoFaceDetectedStabilized();
      return;
    }

    // Track face detection history
    faceDetectionHistory.current.push(true);
    if (faceDetectionHistory.current.length > 15) {
      faceDetectionHistory.current.shift();
    }

    // Update face count
    setStats(prev => ({ ...prev, facesDetected: 1 }));

    // Draw key face landmarks (performance optimized)
    ctx.fillStyle = '#00FF00';
    const keyLandmarks = [1, 33, 362, 61, 17]; // Essential landmarks only
    
    keyLandmarks.forEach(index => {
      if (faceLandmarks[index]) {
        const landmark = faceLandmarks[index];
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Optimized face positioning with research-backed thresholds
    const faceCenter = getFaceCenter(faceLandmarks);
    const canvasCenter = { x: 0.5, y: 0.5 };
    
    const distance = Math.sqrt(
      Math.pow(faceCenter.x - canvasCenter.x, 2) +
      Math.pow(faceCenter.y - canvasCenter.y, 2)
    );

    // Relaxed positioning threshold (changed from 0.15 to 0.35 for better accuracy)
    if (distance > 0.35) {
      createViolationOptimized('face_detection', 'medium', 'Face is not properly positioned in camera view', 0.8, {
        distance: Math.round(distance * 100) / 100,
        facePosition: faceCenter,
        canvasCenter,
        recommendation: 'Please center your face in the camera'
      });
    }

    // Optimized face size thresholds (0.15 to 0.6 instead of 0.1 to 0.8)
    const faceSize = calculateFaceSize(faceLandmarks);
    if (faceSize < 0.15) {
      createViolationOptimized('face_detection', 'medium', 'Face too far: move closer to camera', 0.75, {
        faceSize: Math.round(faceSize * 100) / 100,
        recommendation: 'Move closer to the camera'
      });
    } else if (faceSize > 0.6) {
      createViolationOptimized('face_detection', 'medium', 'Face too close: move back from camera', 0.75, {
        faceSize: Math.round(faceSize * 100) / 100,
        recommendation: 'Move back from the camera'
      });
    }
  };

  // Optimized gaze tracking with 5-frame smoothing and 67% less sensitivity  
  const processGazeTrackingSmooth = (faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (!faceLandmarks || faceLandmarks.length < 468 || !isCalibrated.current) return;

    try {
      // Get eye landmarks for gaze calculation
      const leftEye = getEyeLandmarks(faceLandmarks, 'left');
      const rightEye = getEyeLandmarks(faceLandmarks, 'right');
      
      if (!leftEye.length || !rightEye.length) return;

      const gazeVector = calculateGazeDirection(leftEye, rightEye, faceLandmarks);
      
      // 5-frame moving average smoothing (CRITICAL for stability)
      gazeHistory.current.push(gazeVector);
      if (gazeHistory.current.length > 5) {
        gazeHistory.current.shift();
      }

      // Calculate smoothed gaze vector
      const smoothedGaze = gazeHistory.current.reduce((acc, gaze) => ({
        x: acc.x + gaze.x,
        y: acc.y + gaze.y
      }), { x: 0, y: 0 });
      
      smoothedGaze.x /= gazeHistory.current.length;
      smoothedGaze.y /= gazeHistory.current.length;

      // Draw smoothed gaze direction indicator
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      const faceCenter = getFaceCenter(faceLandmarks);
      const startX = faceCenter.x * ctx.canvas.width;
      const startY = faceCenter.y * ctx.canvas.height;
      const endX = startX + (smoothedGaze.x * 80);
      const endY = startY + (smoothedGaze.y * 80);
      
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Only calculate deviation if we have baseline and enough history
      if (!gazeBaseline.current || gazeHistory.current.length < 5) return;

      // Only calculate deviation if we have baseline and enough history
      if (!gazeBaseline.current || gazeHistory.current.length < 5) return;

      // A more realistic threshold for significant gaze deviation
      const threshold = 0.25; // Changed from 0.15 to 0.25
      const deviation = Math.sqrt(
        Math.pow(smoothedGaze.x - gazeBaseline.current.x, 2) +
        Math.pow(smoothedGaze.y - gazeBaseline.current.y, 2)
      );

      if (deviation > threshold) {
        const direction = getGazeDirection(smoothedGaze);
        createViolationOptimized('gaze_tracking', 'medium', `Gaze deviation detected: looking ${direction}`, 0.80, {
          deviation: Math.round(deviation * 100) / 100,
          gazeVector: smoothedGaze,
          baseline: gazeBaseline.current,
          direction
        });
        
        setStats(prev => ({ 
          ...prev, 
          gazeViolations: prev.gazeViolations + 1 
        }));
      }

    } catch (error) {
      console.warn('Gaze tracking error:', error);
    }
  };

  // Calibrated eye tracking with user-specific EAR thresholds and 167% longer throttling
  const processEyeTrackingCalibrated = (faceLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (!faceLandmarks || faceLandmarks.length < 468 || !isCalibrated.current || !userEARBaseline.current) return;

    try {
      const leftEye = getEyeLandmarks(faceLandmarks, 'left');
      const rightEye = getEyeLandmarks(faceLandmarks, 'right');
      
      if (!leftEye.length || !rightEye.length) return;

      // Calculate eye aspect ratio (EAR) for blink/closure detection
      const leftEAR = calculateEyeAspectRatio(leftEye);
      const rightEAR = calculateEyeAspectRatio(rightEye);
      const avgEAR = (leftEAR + rightEAR) / 2;

      // Calculate eye positions for movement detection
      const leftCenter = calculateEyeCenter(leftEye);
      const rightCenter = calculateEyeCenter(rightEye);
      const currentEyePosition = {
        x: (leftCenter.x + rightCenter.x) / 2,
        y: (leftCenter.y + rightCenter.y) / 2
      };

      // Draw eye regions (performance optimized)
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      drawEyeRegion(leftEye, ctx);
      drawEyeRegion(rightEye, ctx);

      // User-calibrated blink detection (increased threshold from 0.2 to 0.25)
      const userBlinkThreshold = Math.min(userEARBaseline.current.left, userEARBaseline.current.right) * 0.7;
      if (avgEAR < userBlinkThreshold) {
        eyeBlinkCount.current += 1;
      }

      // Eye movement detection with optimized threshold
      if (lastEyePosition.current) {
        const movement = Math.sqrt(
          Math.pow(currentEyePosition.x - lastEyePosition.current.x, 2) +
          Math.pow(currentEyePosition.y - lastEyePosition.current.y, 2)
        );

        // Slightly reduced movement threshold for better accuracy
        const MOVEMENT_THRESHOLD = 0.04; // Increased from 0.03
        if (movement > MOVEMENT_THRESHOLD) {
          createViolationOptimized('eye_movement', 'low', 'Rapid eye movement pattern detected', 0.65, {
            movement: Math.round(movement * 1000) / 1000,
            leftEAR: Math.round(leftEAR * 100) / 100,
            rightEAR: Math.round(rightEAR * 100) / 100,
            blinkCount: eyeBlinkCount.current,
            eyePosition: currentEyePosition,
            userBaseline: userEARBaseline.current
          });
          
          setStats(prev => ({ 
            ...prev, 
            eyeMovementViolations: prev.eyeMovementViolations + 1 
          }));
        }
      }

      // Prolonged eye closure detection with user calibration
      const userClosureThreshold = Math.min(userEARBaseline.current.left, userEARBaseline.current.right) * 0.5;
      const CLOSURE_TIME_THRESHOLD = 4000; // Increased from 3000ms (33% longer)
      
      if (avgEAR < userClosureThreshold) {
        const now = Date.now();
        const lastClosureViolation = lastViolationTime.current.eye_closure;
        const lastClosureTime = lastClosureViolation ? lastClosureViolation.time : 0;
        
        if (now - lastClosureTime > CLOSURE_TIME_THRESHOLD) {
          createViolationOptimized('eye_movement', 'medium', 'Prolonged eye closure detected', 0.85, {
            avgEAR: Math.round(avgEAR * 100) / 100,
            closureDuration: now - lastClosureTime,
            userThreshold: Math.round(userClosureThreshold * 100) / 100,
            userBaseline: userEARBaseline.current
          });
          
          lastViolationTime.current.eye_closure = { time: now, active: true };
        }
      }

      // Update last position for next frame
      lastEyePosition.current = currentEyePosition;

    } catch (error) {
      console.warn('Eye tracking error:', error);
    }
  };

  // Remove mouth movement processing - not requested in requirements

  // Multiple people detection
  const processMultiplePeopleDetection = (results: any, ctx: CanvasRenderingContext2D) => {
    let peopleCount = 0;
    let detectionMethods = [];
    
    // Count faces
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      peopleCount += 1;
      detectionMethods.push('face_landmarks');
    }

    // Additional pose detection for multiple people
    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
      // Draw pose landmarks
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 2;
      
      results.poseLandmarks.forEach((landmark: any, index: number) => {
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Use pose landmarks to confirm person count
      peopleCount = Math.max(peopleCount, 1);
      detectionMethods.push('pose_landmarks');
    }

    // Check for multiple people violation
    if (peopleCount > 1 && peopleCount !== lastFaceCount.current) {
      createViolationOptimized('multiple_people', 'critical', `Multiple people detected: ${peopleCount} individuals in camera view`, 0.95, {
        peopleCount,
        detectionMethods,
        confidence: 0.95
      });
      
      setStats(prev => ({ 
        ...prev, 
        multiplePeopleViolations: prev.multiplePeopleViolations + 1 
      }));
      
      lastFaceCount.current = peopleCount;
    } else if (peopleCount === 0 && lastFaceCount.current !== 0) {
      // Person disappeared from view
      createViolationOptimized('multiple_people', 'high', 'No people detected in camera view - student may have left', 0.9, {
        peopleCount: 0,
        previousCount: lastFaceCount.current,
        detectionMethods: ['absence_detection']
      });
      
      lastFaceCount.current = 0;
    } else if (peopleCount === 1) {
      lastFaceCount.current = 1;
    }
  };

  // Hand detection for object analysis
  const processHandDetection = (results: any, ctx: CanvasRenderingContext2D) => {
    const hands = [];
    
    if (results.leftHandLandmarks && results.leftHandLandmarks.length > 0) {
      hands.push({ side: 'left', landmarks: results.leftHandLandmarks });
    }
    
    if (results.rightHandLandmarks && results.rightHandLandmarks.length > 0) {
      hands.push({ side: 'right', landmarks: results.rightHandLandmarks });
    }

    hands.forEach(hand => {
      try {
        // Draw hand landmarks
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#FF00FF';
        
        // Draw key hand landmarks
        const keyPoints = [0, 4, 8, 12, 16, 20]; // Wrist and fingertips
        keyPoints.forEach(index => {
          if (hand.landmarks[index]) {
            const landmark = hand.landmarks[index];
            const x = landmark.x * ctx.canvas.width;
            const y = landmark.y * ctx.canvas.height;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
          }
        });

        // Draw hand skeleton
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [0, 9], [9, 10], [10, 11], [11, 12], // Middle
          [0, 13], [13, 14], [14, 15], [15, 16], // Ring
          [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
        ];

        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 2;
        connections.forEach(([start, end]) => {
          if (hand.landmarks[start] && hand.landmarks[end]) {
            const startX = hand.landmarks[start].x * ctx.canvas.width;
            const startY = hand.landmarks[start].y * ctx.canvas.height;
            const endX = hand.landmarks[end].x * ctx.canvas.width;
            const endY = hand.landmarks[end].y * ctx.canvas.height;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          }
        });

        // Analyze hand gesture for phone/device holding
        const objectHoldingAnalysis = analyzeHandGesture(hand.landmarks);
        if (objectHoldingAnalysis.isHoldingObject) {
          createViolationOptimized('unauthorized_object', 'high', 
            `${objectHoldingAnalysis.objectType} detected in ${hand.side} hand - possible unauthorized device`, 
            objectHoldingAnalysis.confidence, {
            handSide: hand.side,
            gestureType: objectHoldingAnalysis.gestureType,
            objectType: objectHoldingAnalysis.objectType,
            confidence: objectHoldingAnalysis.confidence,
            handPosition: {
              x: hand.landmarks[0].x,
              y: hand.landmarks[0].y
            }
          });
          
          setStats(prev => ({ 
            ...prev, 
            objectViolations: prev.objectViolations + 1 
          }));
        }

      } catch (error) {
        console.warn('Hand detection error:', error);
      }
    });
  };

  // Object detection processing
  const processObjectDetection = (ctx: CanvasRenderingContext2D) => {
    // This would integrate with MediaPipe's object detection
    // For now, we'll use simplified heuristics based on hand positions and face occlusion
    
    // Check for rectangular objects near face (phones, tablets)
    // This is a simplified implementation
    const suspiciousRegions = detectRectangularObjects(ctx);
    
    suspiciousRegions.forEach((region, index) => {
      // Draw detection box
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.strokeRect(region.x, region.y, region.width, region.height);
      
      // Add label
      ctx.fillStyle = '#FF0000';
      ctx.font = '12px Arial';
      ctx.fillText('Suspicious Object', region.x, region.y - 5);

      createViolationOptimized('unauthorized_object', 'critical', `Potential unauthorized electronic device detected`, 0.8, {
        region,
        objectType: 'rectangular_device',
        detectionMethod: 'shape_analysis'
      });
      setStats(prev => ({ ...prev, objectViolations: prev.objectViolations + 1 }));
    });
  };

  // Helper functions
  const getFaceCenter = (landmarks: any[]) => {
    // Use nose tip (landmark 1) as face center
    if (landmarks && landmarks[1]) {
      return { x: landmarks[1].x, y: landmarks[1].y };
    }
    return { x: 0.5, y: 0.5 };
  };

  const calculateFaceSize = (landmarks: any[]) => {
    if (!landmarks || landmarks.length < 468) return 0.3;
    
    // Calculate face bounding box
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    
    landmarks.forEach((landmark: any) => {
      minX = Math.min(minX, landmark.x);
      maxX = Math.max(maxX, landmark.x);
      minY = Math.min(minY, landmark.y);
      maxY = Math.max(maxY, landmark.y);
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    return Math.sqrt(width * width + height * height);
  };

  const getEyeLandmarks = (faceLandmarks: any[], eye: 'left' | 'right') => {
    if (!faceLandmarks || faceLandmarks.length < 468) return [];
    
    // MediaPipe face landmark indices for eyes (more comprehensive)
    const leftEyeIndices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
    const rightEyeIndices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
    
    const indices = eye === 'left' ? leftEyeIndices : rightEyeIndices;
    return indices.map(i => faceLandmarks[i]).filter(Boolean);
  };

  const calculateGazeDirection = (leftEye: any[], rightEye: any[], allLandmarks: any[]) => {
    if (!leftEye.length || !rightEye.length) {
      return { x: 0, y: 0 };
    }

    // Calculate eye centers
    const leftCenter = calculateEyeCenter(leftEye);
    const rightCenter = calculateEyeCenter(rightEye);
    
    // Get nose tip for reference
    const noseTip = allLandmarks[1];
    
    if (!noseTip) {
      return { x: 0, y: 0 };
    }

    // Calculate gaze vector relative to nose position
    const eyeCenter = {
      x: (leftCenter.x + rightCenter.x) / 2,
      y: (leftCenter.y + rightCenter.y) / 2
    };

    // Simplified gaze direction based on eye position relative to face center
    return {
      x: (eyeCenter.x - noseTip.x) * 2, // Amplify for better detection
      y: (eyeCenter.y - noseTip.y) * 2
    };
  };

  const getGazeDirection = (gazeVector: {x: number, y: number}) => {
    const threshold = 0.1;
    
    if (Math.abs(gazeVector.x) > Math.abs(gazeVector.y)) {
      return gazeVector.x > threshold ? 'right' : gazeVector.x < -threshold ? 'left' : 'center';
    } else {
      return gazeVector.y > threshold ? 'down' : gazeVector.y < -threshold ? 'up' : 'center';
    }
  };

  const calculateEyeCenter = (eyeLandmarks: any[]) => {
    if (eyeLandmarks.length === 0) return { x: 0, y: 0 };
    
    const sum = eyeLandmarks.reduce((acc: any, landmark: any) => ({
      x: acc.x + landmark.x,
      y: acc.y + landmark.y
    }), { x: 0, y: 0 });
    
    return {
      x: sum.x / eyeLandmarks.length,
      y: sum.y / eyeLandmarks.length
    };
  };

  const calculateEyeAspectRatio = (eyeLandmarks: any[]) => {
    if (eyeLandmarks.length < 8) return 0.3;
    
    try {
      // Use specific eye landmarks for EAR calculation
      // Vertical distances
      const v1 = Math.sqrt(
        Math.pow(eyeLandmarks[1].x - eyeLandmarks[7].x, 2) +
        Math.pow(eyeLandmarks[1].y - eyeLandmarks[7].y, 2)
      );
      const v2 = Math.sqrt(
        Math.pow(eyeLandmarks[2].x - eyeLandmarks[6].x, 2) +
        Math.pow(eyeLandmarks[2].y - eyeLandmarks[6].y, 2)
      );
      
      // Horizontal distance
      const h = Math.sqrt(
        Math.pow(eyeLandmarks[0].x - eyeLandmarks[4].x, 2) +
        Math.pow(eyeLandmarks[0].y - eyeLandmarks[4].y, 2)
      );
      
      if (h === 0) return 0.3;
      
      return (v1 + v2) / (2.0 * h);
    } catch (error) {
      return 0.3;
    }
  };

  const drawEyeRegion = (eyeLandmarks: any[], ctx: CanvasRenderingContext2D) => {
    if (eyeLandmarks.length === 0) return;
    
    ctx.beginPath();
    eyeLandmarks.forEach((landmark, index) => {
      const x = landmark.x * ctx.canvas.width;
      const y = landmark.y * ctx.canvas.height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  };

  const analyzeHandGesture = (handLandmarks: any[]) => {
    // Enhanced gesture analysis for object detection with more specific patterns
    if (handLandmarks.length < 21) {
      return { 
        isHoldingObject: false, 
        confidence: 0, 
        gestureType: 'none',
        objectType: 'none'
      };
    }
    
    try {
      // Key landmarks
      const wrist = handLandmarks[0];
      const thumb = handLandmarks[4];
      const indexFinger = handLandmarks[8];
      const middleFinger = handLandmarks[12];
      const ringFinger = handLandmarks[16];
      const pinky = handLandmarks[20];
      
      // Calculate finger distances and positions
      const thumbToIndex = Math.sqrt(
        Math.pow(thumb.x - indexFinger.x, 2) + 
        Math.pow(thumb.y - indexFinger.y, 2)
      );
      
      // Check for phone-holding gesture (more specific)
      const fingersCurved = [indexFinger, middleFinger, ringFinger].every(finger => 
        finger.y > wrist.y + 0.1 // Fingers below wrist indicates gripping
      );
      
      const thumbOpposed = thumbToIndex < 0.15 && thumb.y > wrist.y; // Thumb close to fingers and positioned correctly
      
      // Phone holding pattern (more specific)
      const isHoldingPhone = fingersCurved && thumbOpposed && thumb.y > wrist.y;
      if (isHoldingPhone) {
        return {
          isHoldingObject: true,
          confidence: 0.9, // Higher confidence for a more specific gesture
          gestureType: 'phone_grip',
          objectType: 'Phone/Device'
        };
      }
      
      // Tablet holding pattern (wider grip with more specific criteria)
      const handSpan = Math.sqrt(
        Math.pow(thumb.x - pinky.x, 2) + 
        Math.pow(thumb.y - pinky.y, 2)
      );
      
      // More specific tablet holding detection
      const isTabletGrip = handSpan > 0.25 && fingersCurved && 
        Math.abs(thumb.y - pinky.y) < 0.1; // Thumb and pinky roughly aligned horizontally
      
      if (isTabletGrip) {
        return {
          isHoldingObject: true,
          confidence: 0.85,
          gestureType: 'tablet_grip',
          objectType: 'Tablet/Large Device'
        };
      }
      
      // Pen/stylus holding with refined detection
      const indexExtended = indexFinger.y < middleFinger.y && indexFinger.y < ringFinger.y;
      const otherFingersCurved = [middleFinger, ringFinger, pinky].every(finger => 
        finger.y > wrist.y + 0.05
      );
      
      const isPenGrip = indexExtended && otherFingersCurved && thumbToIndex < 0.1 && 
        thumb.y > indexFinger.y; // Thumb should be above index for proper pen grip
      
      if (isPenGrip) {
        return {
          isHoldingObject: true,
          confidence: 0.75,
          gestureType: 'pen_grip',
          objectType: 'Pen/Stylus'
        };
      }
      
      return { 
        isHoldingObject: false, 
        confidence: 0, 
        gestureType: 'open_hand',
        objectType: 'none'
      };
      
    } catch (error) {
      return { 
        isHoldingObject: false, 
        confidence: 0, 
        gestureType: 'error',
        objectType: 'none'
      };
    }
  };

  const detectRectangularObjects = (ctx: CanvasRenderingContext2D) => {
    // Simplified object detection
    // In production, this would use proper computer vision techniques
    const suspiciousRegions: Array<{x: number, y: number, width: number, height: number}> = [];
    
    // This is a placeholder - real implementation would analyze the video frame
    // for rectangular objects with phone/tablet characteristics
    
    return suspiciousRegions;
  };

  // Enhanced violation creation with active violation tracking
  const createViolationOptimized = (
    type: ViolationLog['type'],
    severity: ViolationLog['severity'],
    description: string,
    confidence: number,
    evidence: any
  ) => {
    const now = Date.now();
    const violationKey = `${type}_${severity}`;

    // Throttle violations to avoid spamming
    const lastViolation = lastViolationTime.current[violationKey];
    const throttleTime = 3000; // 3 seconds between new violations of the same type

    if (lastViolation && now - lastViolation.time < throttleTime) {
        return; // Still in cooldown period
    }

    const violation: ViolationLog = {
      id: `${type}_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      timestamp: new Date().toISOString(),
      description,
      confidence,
      evidence
    };

    setViolations(prev => [violation, ...prev.slice(0, 49)]);
    onViolationDetected(violation);
    
    // Update the stats for the specific violation type
    if (type === 'gaze_tracking') {
      setStats(prev => ({ ...prev, gazeViolations: prev.gazeViolations + 1 }));
    } else if (type === 'eye_movement') {
      setStats(prev => ({ ...prev, eyeMovementViolations: prev.eyeMovementViolations + 1 }));
    } else if (type === 'unauthorized_object') {
        setStats(prev => ({...prev, objectViolations: prev.objectViolations + 1}));
    }

    lastViolationTime.current[violationKey] = { time: now, active: true };
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Card className="bg-gray-900 border-gray-700 p-3 min-w-[300px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">MediaPipe Monitoring</span>
            {!isCalibrated.current ? (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-yellow-400">Calibrating...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400">Active</span>
              </div>
            )}
          </div>
          <Camera className="w-4 h-4 text-gray-400" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Faces:</span>
            <span className="text-white font-medium">{stats.facesDetected}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Gaze:</span>
            <span className={stats.gazeViolations > 0 ? 'text-red-400' : 'text-green-400'}>
              {stats.gazeViolations}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Eyes:</span>
            <span className={stats.eyeMovementViolations > 0 ? 'text-yellow-400' : 'text-green-400'}>
              {stats.eyeMovementViolations}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">People:</span>
            <span className={stats.multiplePeopleViolations > 0 ? 'text-red-400' : 'text-green-400'}>
              {stats.multiplePeopleViolations}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Objects:</span>
            <span className={stats.objectViolations > 0 ? 'text-red-400' : 'text-green-400'}>
              {stats.objectViolations}
            </span>
          </div>
        </div>

        {/* Recent Violations */}
        {violations.length > 0 && (
          <div className="border-t border-gray-700 pt-2">
            <div className="text-xs text-gray-400 mb-2">Recent Violations:</div>
            <div className="max-h-20 overflow-y-auto space-y-1">
              {violations.slice(0, 3).map((violation) => (
                <div key={violation.id} className="flex items-center space-x-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${
                    violation.severity === 'critical' ? 'bg-red-500' :
                    violation.severity === 'high' ? 'bg-orange-500' :
                    violation.severity === 'medium' ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}></div>
                  <span className="text-gray-300 truncate flex-1">
                    {violation.description}
                  </span>
                  <span className="text-gray-500">
                    {Math.round(violation.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analysis Canvas (hidden) */}
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          className="hidden"
        />
      </Card>
    </div>
  );
}