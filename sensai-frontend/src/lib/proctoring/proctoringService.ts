import * as faceapi from 'face-api.js';

export interface ProctoringEvent {
  timestamp: Date;
  type: 'face_detected' | 'face_not_detected' | 'multiple_faces' | 'gaze_direction' | 'mouth_open' | 'device_detected';
  details: Record<string, any>;
  confidence?: number;
}

interface ProctoringOptions {
  onEvent: (event: ProctoringEvent) => void;
  detectionInterval?: number;
  gazeThreshold?: number;
  mouthOpenThreshold?: number;
}

export class ProctoringService {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isMonitoring = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private options: Required<ProctoringOptions>;
  private modelsLoaded = false;

  constructor(options: ProctoringOptions) {
    this.options = {
      detectionInterval: 1000, // Check every second
      gazeThreshold: 0.3, // 30% threshold for gaze direction
      mouthOpenThreshold: 0.5, // 50% threshold for mouth open
      ...options
    };
  }

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;
    
    // Load face-api.js models
    if (!this.modelsLoaded) {
      await this.loadModels();
      this.modelsLoaded = true;
    }

    // Request camera permissions
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: 'user'
        },
        audio: false
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error accessing camera:', error);
      return Promise.reject(error);
    }
  }

  private async loadModels(): Promise<void> {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        faceapi.nets.faceExpressionNet.loadFromUri('/models')
      ]);
    } catch (error) {
      console.error('Error loading models:', error);
      throw new Error('Failed to load face detection models');
    }
  }

  startMonitoring(): void {
    if (this.isMonitoring || !this.videoElement) return;

    this.isMonitoring = true;
    
    this.detectionInterval = setInterval(async () => {
      if (!this.videoElement) return;

      try {
        const detections = await faceapi
          .detectAllFaces(this.videoElement, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();

        this.analyzeDetections(detections);
      } catch (error) {
        console.error('Error during face detection:', error);
      }
    }, this.options.detectionInterval);
  }

  private analyzeDetections(detections: faceapi.WithFaceLandmarks<{ 
    detection: faceapi.FaceDetection; 
  }, faceapi.FaceLandmarks68>[]) {
    // No faces detected
    if (detections.length === 0) {
      this.logEvent({
        type: 'face_not_detected',
        timestamp: new Date(),
        details: { message: 'No face detected in frame' }
      });
      return;
    }

    // Multiple faces detected
    if (detections.length > 1) {
      this.logEvent({
        type: 'multiple_faces',
        timestamp: new Date(),
        details: { count: detections.length },
        confidence: 1.0
      });
    }

    // Analyze each detected face
    detections.forEach((detection, index) => {
      const { landmarks, detection: faceDetection } = detection;
      const jawOutline = landmarks.getJawOutline();
      const mouth = landmarks.getMouth();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      const nose = landmarks.getNose();

      // Calculate mouth openness
      const mouthOpenness = this.calculateMouthOpenness(mouth);
      if (mouthOpenness > this.options.mouthOpenThreshold) {
        this.logEvent({
          type: 'mouth_open',
          timestamp: new Date(),
          details: { openness: mouthOpenness },
          confidence: Math.min(1.0, (mouthOpenness - this.options.mouthOpenThreshold) * 2)
        });
      }

      // Calculate gaze direction
      const gazeDirection = this.estimateGazeDirection(leftEye, rightEye, nose);
      if (Math.abs(gazeDirection.x) > this.options.gazeThreshold || 
          Math.abs(gazeDirection.y) > this.options.gazeThreshold) {
        this.logEvent({
          type: 'gaze_direction',
          timestamp: new Date(),
          details: { direction: gazeDirection },
          confidence: Math.max(
            Math.abs(gazeDirection.x) / this.options.gazeThreshold,
            Math.abs(gazeDirection.y) / this.options.gazeThreshold
          )
        });
      }
    });
  }

  private calculateMouthOpenness(mouth: faceapi.Point[]): number {
    // Calculate vertical distance between upper and lower lip
    const topLip = mouth[13]; // Top of upper lip
    const bottomLip = mouth[19]; // Bottom of lower lip
    const verticalDistance = Math.abs(bottomLip.y - topLip.y);
    
    // Calculate mouth width as reference
    const leftCorner = mouth[0];
    const rightCorner = mouth[6];
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);
    
    // Return ratio of vertical to horizontal
    return verticalDistance / mouthWidth;
  }

  private estimateGazeDirection(
    leftEye: faceapi.Point[],
    rightEye: faceapi.Point[],
    nose: faceapi.Point[]
  ): { x: number; y: number } {
    // Calculate eye aspect ratio to detect if eyes are open
    const leftEAR = this.eyeAspectRatio(leftEye);
    const rightEAR = this.eyeAspectRatio(rightEye);
    
    // Calculate eye center
    const leftEyeCenter = {
      x: leftEye[0].x + (leftEye[3].x - leftEye[0].x) / 2,
      y: leftEye[0].y + (leftEye[4].y - leftEye[1].y) / 2
    };
    
    const rightEyeCenter = {
      x: rightEye[0].x + (rightEye[3].x - rightEye[0].x) / 2,
      y: rightEye[0].y + (rightEye[4].y - rightEye[1].y) / 2
    };
    
    const noseTip = nose[0];
    
    // Calculate gaze direction (normalized to -1..1 range)
    const gazeX = ((leftEyeCenter.x + rightEyeCenter.x) / 2 - noseTip.x) / 50; // Normalize
    const gazeY = ((leftEyeCenter.y + rightEyeCenter.y) / 2 - noseTip.y) / 50; // Normalize
    
    return {
      x: Math.max(-1, Math.min(1, gazeX)),
      y: Math.max(-1, Math.min(1, gazeY))
    };
  }

  private eyeAspectRatio(eye: faceapi.Point[]): number {
    // Compute the euclidean distances between the vertical eye landmarks
    const A = this.distance(eye[1], eye[5]);
    const B = this.distance(eye[2], eye[4]);
    
    // Compute the euclidean distance between the horizontal eye landmarks
    const C = this.distance(eye[0], eye[3]);
    
    // Compute the eye aspect ratio
    return (A + B) / (2.0 * C);
  }

  private distance(p1: faceapi.Point, p2: faceapi.Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  private logEvent(event: Omit<ProctoringEvent, 'timestamp'>): void {
    const fullEvent = {
      ...event,
      timestamp: new Date()
    };
    
    // Save to localStorage for persistence
    const logs = JSON.parse(localStorage.getItem('proctoringLogs') || '[]');
    logs.push(fullEvent);
    localStorage.setItem('proctoringLogs', JSON.stringify(logs));
    
    // Notify parent component
    this.options.onEvent(fullEvent);
  }

  stopMonitoring(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    this.isMonitoring = false;
  }

  async cleanup(): Promise<void> {
    this.stopMonitoring();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
