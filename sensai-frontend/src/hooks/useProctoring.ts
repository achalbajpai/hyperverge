import { useState, useRef, useEffect, useCallback } from 'react';
import { ProctoringService, type ProctoringEvent } from '@/lib/proctoring/proctoringService';

export interface UseProctoringProps {
  onEvent?: (event: ProctoringEvent) => void;
  detectionInterval?: number;
  gazeThreshold?: number;
  mouthOpenThreshold?: number;
  autoStart?: boolean;
}

export interface UseProctoringReturn {
  isInitialized: boolean;
  isMonitoring: boolean;
  error: string | null;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  toggleMonitoring: () => void;
  initialize: (videoElement: HTMLVideoElement) => Promise<void>;
  cleanup: () => Promise<void>;
  getLogs: () => ProctoringEvent[];
  clearLogs: () => void;
}

export function useProctoring({
  onEvent,
  detectionInterval = 1000,
  gazeThreshold = 0.4,
  mouthOpenThreshold = 0.5,
  autoStart = false,
}: UseProctoringProps = {}): UseProctoringReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proctoringService = useRef<ProctoringService | null>(null);

  // Initialize the proctoring service
  const initialize = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      setError(null);
      
      // Create a new proctoring service instance
      proctoringService.current = new ProctoringService({
        onEvent: (event) => {
          // Call the provided event handler if it exists
          if (onEvent) {
            onEvent(event);
          }
        },
        detectionInterval,
        gazeThreshold,
        mouthOpenThreshold,
      });
      
      // Initialize with the video element
      await proctoringService.current.initialize(videoElement);
      setIsInitialized(true);
      
      // Auto-start monitoring if enabled
      if (autoStart) {
        startMonitoring();
      }
    } catch (err) {
      console.error('Failed to initialize proctoring:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize proctoring');
      setIsInitialized(false);
      throw err;
    }
  }, [onEvent, detectionInterval, gazeThreshold, mouthOpenThreshold, autoStart]);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (proctoringService.current && isInitialized && !isMonitoring) {
      proctoringService.current.startMonitoring();
      setIsMonitoring(true);
    }
  }, [isInitialized, isMonitoring]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (proctoringService.current && isMonitoring) {
      proctoringService.current.stopMonitoring();
      setIsMonitoring(false);
    }
  }, [isMonitoring]);

  // Toggle monitoring
  const toggleMonitoring = useCallback(() => {
    if (isMonitoring) {
      stopMonitoring();
    } else {
      startMonitoring();
    }
  }, [isMonitoring, startMonitoring, stopMonitoring]);

  // Cleanup on unmount
  const cleanup = useCallback(async () => {
    if (proctoringService.current) {
      await proctoringService.current.cleanup();
      proctoringService.current = null;
      setIsInitialized(false);
      setIsMonitoring(false);
    }
  }, []);

  // Get proctoring logs
  const getLogs = useCallback((): ProctoringEvent[] => {
    try {
      return JSON.parse(localStorage.getItem('proctoringLogs') || '[]');
    } catch (error) {
      console.error('Failed to parse proctoring logs:', error);
      return [];
    }
  }, []);

  // Clear proctoring logs
  const clearLogs = useCallback(() => {
    localStorage.removeItem('proctoringLogs');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (proctoringService.current) {
        cleanup();
      }
    };
  }, [cleanup]);

  return {
    isInitialized,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
    toggleMonitoring,
    initialize,
    cleanup,
    getLogs,
    clearLogs,
  };
}

export default useProctoring;
