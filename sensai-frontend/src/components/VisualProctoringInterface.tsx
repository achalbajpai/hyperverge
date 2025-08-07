import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { 
    Camera, 
    Mic, 
    Shield, 
    Wifi, 
    WifiOff,
    AlertTriangle, 
    Play, 
    Square, 
    Eye,
    EyeOff,
    Users,
    Phone,
    AlertCircle,
    Minimize2,
    Maximize2,
    Activity,
    MessageSquare,
    Smartphone
} from 'lucide-react';

export interface VisualProctoringFlag {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    message: string;
    timestamp: string;
    device_type?: string;
    face_count?: number;
    direction?: string;
    deviation?: number;
    [key: string]: any;
}

interface VisualProctoringProps {
    sessionId: string;
    userId: number;
    onFlagDetected?: (flag: VisualProctoringFlag) => void;
    minimized?: boolean;
    autoStart?: boolean;
    className?: string;
}

export default function VisualProctoringInterface({
    sessionId,
    userId,
    onFlagDetected,
    minimized = false,
    autoStart = true
}: VisualProctoringProps) {
    // State management
    const [isActive, setIsActive] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [currentFlags, setCurrentFlags] = useState<ProctoringFlag[]>([]);
    const [overlayData, setOverlayData] = useState<any>({});
    const [error, setError] = useState<string | null>(null);
    
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    
    // Initialize camera and start proctoring
    const initializeCamera = useCallback(async () => {
        try {
            setError(null);
            
            // Request camera permissions
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                },
                audio: false // We'll handle audio separately
            });
            
            streamRef.current = stream;
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            
            // Auto-start if enabled
            if (autoStart) {
                await startProctoring();
            }
            
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to access camera';
            setError(errorMsg);
            console.error('Camera initialization error:', err);
        }
    }, [autoStart]);
    
    // Start proctoring session
    const startProctoring = useCallback(async () => {
        if (!streamRef.current || !videoRef.current) {
            await initializeCamera();
            return;
        }
        
        try {
            setConnectionStatus('connecting');
            
            // Connect to WebSocket - Use correct backend port 8000
            const wsUrl = `ws://localhost:8000/visual-proctoring/live/${sessionId}?user_id=${userId}`;
            console.log('🔗 Connecting to visual proctoring WebSocket:', wsUrl);
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;
            
            ws.onopen = () => {
                setConnectionStatus('connected');
                setIsActive(true);
                console.log('Visual proctoring WebSocket connected');
                
                // Start sending frames
                sendFramesToServer();
            };
            
            ws.onmessage = (event) => {
                handleServerMessage(event.data);
            };
            
            ws.onclose = () => {
                setConnectionStatus('disconnected');
                setIsActive(false);
                console.log('Visual proctoring WebSocket disconnected');
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setConnectionStatus('disconnected');
                setError('Connection error');
            };
            
        } catch (err) {
            console.error('Failed to start proctoring:', err);
            setError('Failed to start proctoring');
        }
    }, [sessionId, userId]);
    
    // Stop proctoring session
    const stopProctoring = useCallback(() => {
        // Stop sending frames
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        
        // Close WebSocket
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        
        // Stop video stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        setIsActive(false);
        setConnectionStatus('disconnected');
        setCurrentFlags([]);
        setOverlayData({});
    }, []);
    
    // Send video frames to server for analysis
    const sendFramesToServer = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
            // Retry after a short delay
            animationFrameRef.current = requestAnimationFrame(() => {
                setTimeout(sendFramesToServer, 100);
            });
            return;
        }
        
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        try {
            // Convert to base64 and send to server
            const frameData = canvas.toDataURL('image/jpeg', 0.8);
            
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'frame',
                    data: frameData,
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.error('Error sending frame:', error);
        }
        
        // Schedule next frame (throttled to ~10 FPS)
        setTimeout(() => {
            animationFrameRef.current = requestAnimationFrame(sendFramesToServer);
        }, 100);
    }, []);
    
    // Handle server messages
    const handleServerMessage = useCallback((data: string) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'detection_results':
                    const results = message.data;
                    
                    // Update flags
                    if (results.flags && results.flags.length > 0) {
                        const newFlags = results.flags.filter((flag: ProctoringFlag) => 
                            flag.severity !== 'low' // Only show medium+ severity flags
                        );
                        
                        setCurrentFlags(prev => {
                            const updated = [...newFlags];
                            // Keep only recent flags (last 5 seconds)
                            const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
                            return updated.filter(flag => flag.timestamp > fiveSecondsAgo);
                        });
                        
                        // Notify parent component
                        newFlags.forEach((flag: ProctoringFlag) => {
                            onFlagDetected?.(flag);
                        });
                    } else {
                        // Clear flags if no recent detections
                        setTimeout(() => {
                            setCurrentFlags(prev => prev.filter(flag => 
                                new Date(flag.timestamp).getTime() > Date.now() - 5000
                            ));
                        }, 1000);
                    }
                    
                    // Update overlay data for live display
                    if (results.overlay_data) {
                        setOverlayData(results.overlay_data);
                    }
                    break;
                    
                case 'error':
                    console.error('Server error:', message.message);
                    setError(message.message);
                    break;
                    
                case 'heartbeat_ack':
                    // Server is alive
                    break;
                    
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing server message:', error);
        }
    }, [onFlagDetected]);
    
    // Send heartbeat to server
    useEffect(() => {
        if (!isActive || !wsRef.current) return;
        
        const heartbeatInterval = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 30000); // Every 30 seconds
        
        return () => clearInterval(heartbeatInterval);
    }, [isActive]);
    
    // Initialize on mount
    useEffect(() => {
        initializeCamera();
        
        return () => {
            stopProctoring();
        };
    }, [initializeCamera, stopProctoring]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopProctoring();
        };
    }, []);
    
    // Helper functions for display
    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'text-red-600';
            case 'high': return 'text-orange-600';
            case 'medium': return 'text-yellow-600';
            case 'low': return 'text-blue-600';
            default: return 'text-gray-600';
        }
    };
    
    const getSeverityIcon = (flagType: string) => {
        switch (flagType) {
            case 'no_face_detected': return <EyeOff className="w-4 h-4" />;
            case 'multiple_people_detected': return <Users className="w-4 h-4" />;
            case 'unauthorized_device_detected': return <Phone className="w-4 h-4" />;
            case 'eyes_off_screen': return <Eye className="w-4 h-4" />;
            case 'mouth_movement_detected': return <Mic className="w-4 h-4" />;
            case 'head_turned':
            case 'head_tilted': return <AlertCircle className="w-4 h-4" />;
            default: return <AlertTriangle className="w-4 h-4" />;
        }
    };
    
    const getConnectionStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'text-green-600';
            case 'connecting': return 'text-yellow-600';
            case 'disconnected': return 'text-red-600';
        }
    };
    
    // Minimized view
    if (minimized) {
        return (
            <div className="fixed z-50 top-4 left-4">
                <Card className="p-3 bg-white border-2 shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Shield className="w-5 h-5" />
                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${
                                connectionStatus === 'connected' ? 'bg-green-500' : 
                                connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                        </div>
                        
                        <div className="text-sm">
                            <div className="font-medium">Visual Proctoring</div>
                            <div className={`text-xs ${getConnectionStatusColor()}`}>
                                {connectionStatus}
                            </div>
                        </div>
                        
                        {/* Live flags display */}
                        {currentFlags.length > 0 && (
                            <div className="flex items-center gap-1">
                                {currentFlags.slice(0, 3).map((flag, index) => (
                                    <div key={index} className={`p-1 rounded ${getSeverityColor(flag.severity)}`}>
                                        {getSeverityIcon(flag.type)}
                                    </div>
                                ))}
                                {currentFlags.length > 3 && (
                                    <span className="text-xs text-gray-500">+{currentFlags.length - 3}</span>
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        );
    }
    
    // Full interface
    return (
        <Card className="p-6 bg-white border-2 border-blue-200">
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        <h3 className="text-lg font-semibold">Visual Proctoring</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Wifi className="w-4 h-4" />
                        <span className={`text-sm ${getConnectionStatusColor()}`}>
                            {connectionStatus}
                        </span>
                    </div>
                </div>
                
                {/* Error display */}
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-2 text-red-700">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    </div>
                )}
                
                {/* Video feed */}
                <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                    <video 
                        ref={videoRef}
                        className="w-full h-64 object-cover"
                        autoPlay
                        muted
                        playsInline
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Live overlay */}
                    <div className="absolute top-2 left-2 space-y-1">
                        {overlayData.status && (
                            <div className="px-2 py-1 text-xs font-medium text-white bg-black bg-opacity-50 rounded">
                                {overlayData.status}
                            </div>
                        )}
                        {overlayData.gaze_status && (
                            <div className="px-2 py-1 text-xs text-white bg-blue-500 bg-opacity-75 rounded">
                                {overlayData.gaze_status}
                            </div>
                        )}
                        {overlayData.mouth_status && (
                            <div className="px-2 py-1 text-xs text-white bg-purple-500 bg-opacity-75 rounded">
                                {overlayData.mouth_status}
                            </div>
                        )}
                    </div>
                    
                    {/* Recording indicator */}
                    {isActive && (
                        <div className="absolute top-2 right-2 flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                                LIVE
                            </span>
                        </div>
                    )}
                </div>
                
                {/* Controls */}
                <div className="flex justify-center">
                    {!isActive ? (
                        <Button 
                            onClick={startProctoring}
                            className="flex items-center gap-2"
                            disabled={connectionStatus === 'connecting'}
                        >
                            <Play className="w-4 h-4" />
                            {connectionStatus === 'connecting' ? 'Connecting...' : 'Start Monitoring'}
                        </Button>
                    ) : (
                        <Button 
                            onClick={stopProctoring}
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <Square className="w-4 h-4" />
                            Stop Monitoring
                        </Button>
                    )}
                </div>
                
                {/* Live flags */}
                {currentFlags.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-sm font-medium text-gray-700">Active Detections</div>
                        <div className="space-y-1">
                            {currentFlags.slice(0, 5).map((flag, index) => (
                                <div key={index} className={`flex items-center gap-2 p-2 text-sm rounded border-l-4 ${
                                    flag.severity === 'critical' ? 'bg-red-50 border-red-500 text-red-700' :
                                    flag.severity === 'high' ? 'bg-orange-50 border-orange-500 text-orange-700' :
                                    flag.severity === 'medium' ? 'bg-yellow-50 border-yellow-500 text-yellow-700' :
                                    'bg-blue-50 border-blue-500 text-blue-700'
                                }`}>
                                    {getSeverityIcon(flag.type)}
                                    <span>{flag.message}</span>
                                    <span className="ml-auto text-xs opacity-75">
                                        {Math.round(flag.confidence * 100)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Status info */}
                <div className="pt-3 text-xs text-gray-500 border-t">
                    <div>Session: {sessionId.slice(0, 8)}...</div>
                    <div>User ID: {userId}</div>
                    {isActive && (
                        <div className="text-green-600">
                            ✓ Monitoring face detection, eye tracking, mouth movement, and unauthorized devices
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}
