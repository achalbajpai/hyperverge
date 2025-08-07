'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Component } from @/components/component';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, AlertTriangle, Check, X, Loader2, Eye, Users, MessageSquare } from 'lucide-react';
import { ProctoringService, type ProctoringEvent } from '@/lib/proctoring/proctoringService';

interface ProctoringAlert {
  id: string;
  type: ProctoringEvent['type'];
  message: string;
  timestamp: Date;
  confidence?: number;
}

export default function ProctoredCameraSetup() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const proctoringService = useRef<ProctoringService | null>(null);
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ProctoringAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const assignmentId = searchParams.get('assignmentId');
  const returnTo = searchParams.get('returnTo') || 'assessment';

  useEffect(() => {
    // Initialize proctoring service
    const initProctoring = async () => {
      if (!videoRef.current) return;
      
      setStatus('loading');
      
      try {
        proctoringService.current = new ProctoringService({
          onEvent: handleProctoringEvent,
          detectionInterval: 1000,
          gazeThreshold: 0.4,
          mouthOpenThreshold: 0.5,
        });
        
        await proctoringService.current.initialize(videoRef.current);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to initialize proctoring:', err);
        setError('Failed to access camera. Please ensure you have granted camera permissions.');
        setStatus('error');
      }
    };
    
    initProctoring();
    
    // Cleanup on unmount
    return () => {
      if (proctoringService.current) {
        proctoringService.current.cleanup();
      }
    };
  }, []);
  
  const handleProctoringEvent = (event: ProctoringEvent) => {
    console.log('Proctoring event:', event);
    
    // Map event type to user-friendly message
    let message = '';
    let shouldShowAlert = true;
    
    switch (event.type) {
      case 'face_detected':
        message = 'Face detected';
        shouldShowAlert = false;
        break;
      case 'face_not_detected':
        message = 'No face detected in frame';
        break;
      case 'multiple_faces':
        message = `Multiple faces detected (${event.details.count})`;
        break;
      case 'gaze_direction':
        message = `Looking away from screen (${event.details.direction.x > 0 ? 'right' : 'left'})`;
        break;
      case 'mouth_open':
        message = 'Talking detected';
        break;
      case 'device_detected':
        message = 'Potential unauthorized device detected';
        break;
      default:
        message = 'Suspicious activity detected';
    }
    
    if (shouldShowAlert) {
      const newAlert: ProctoringAlert = {
        id: Date.now().toString(),
        type: event.type,
        message,
        timestamp: new Date(),
        confidence: event.confidence
      };
      
      setAlerts(prev => [newAlert, ...prev].slice(0, 10)); // Keep only last 10 alerts
    }
  };
  
  const toggleMonitoring = () => {
    if (!proctoringService.current) return;
    
    if (isMonitoring) {
      proctoringService.current.stopMonitoring();
    } else {
      proctoringService.current.startMonitoring();
    }
    
    setIsMonitoring(!isMonitoring);
  };
  
  const handleContinue = () => {
    // Save proctoring logs to localStorage or send to server
    const logs = JSON.parse(localStorage.getItem('proctoringLogs') || '[]');
    console.log('Saving proctoring logs:', logs);
    
    // Navigate to the next page
    router.push(`/student/${returnTo}?assignmentId=${assignmentId}`);
  };
  
  const getAlertVariant = (type: ProctoringEvent['type']) => {
    switch (type) {
      case 'face_not_detected':
      case 'multiple_faces':
      case 'gaze_direction':
      case 'mouth_open':
      case 'device_detected':
        return 'destructive';
      default:
        return 'default';
    }
  };
  
  const getAlertIcon = (type: ProctoringEvent['type']) => {
    switch (type) {
      case 'face_not_detected':
        return <Eye className="h-4 w-4" />;
      case 'multiple_faces':
        return <Users className="h-4 w-4" />;
      case 'mouth_open':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="mr-4"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Proctoring Setup</h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Preview */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="relative overflow-hidden">
            <CardHeader>
              <CardTitle>Camera Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center items-center bg-gray-100 dark:bg-gray-800 p-0">
              <div className="relative w-full max-w-2xl">
                <video 
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto max-h-[480px] object-contain bg-black"
                />
                <canvas 
                  ref={canvasRef} 
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                />
                {status === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                  </div>
                )}
                {status === 'error' && error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
                    <Alert variant="destructive" className="max-w-md">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex items-center space-x-2">
                <div className={`h-3 w-3 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">
                  {isMonitoring ? 'Monitoring Active' : 'Monitoring Paused'}
                </span>
              </div>
              <Button 
                onClick={toggleMonitoring} 
                disabled={status !== 'ready'}
                variant={isMonitoring ? 'outline' : 'default'}
              >
                {isMonitoring ? 'Pause Monitoring' : 'Start Monitoring'}
              </Button>
            </CardFooter>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Proctoring Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start space-x-2">
                <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>Ensure your face is clearly visible in the frame</p>
              </div>
              <div className="flex items-start space-x-2">
                <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p>Make sure you are in a well-lit environment</p>
              </div>
              <div className="flex items-start space-x-2">
                <X className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p>Do not look away from the screen for extended periods</p>
              </div>
              <div className="flex items-start space-x-2">
                <X className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p>Avoid having other people in the frame</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Alerts */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Activity Log</CardTitle>
                <Badge variant={isMonitoring ? 'default' : 'outline'} className="ml-2">
                  {alerts.length} events
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <p>No suspicious activity detected yet.</p>
                  <p className="text-sm">Monitoring must be active to detect issues.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getAlertIcon(alert.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{alert.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                            {alert.confidence !== undefined && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({Math.round(alert.confidence * 100)}% confidence)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Button 
            className="w-full mt-4" 
            size="lg" 
            onClick={handleContinue}
            disabled={!isMonitoring || status !== 'ready'}
          >
            Continue to Assessment
          </Button>
        </div>
      </div>
    </div>
  );
}
