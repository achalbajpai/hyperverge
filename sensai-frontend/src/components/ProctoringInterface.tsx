import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Camera, Mic, Shield, Wifi, AlertTriangle, Play, Square } from 'lucide-react';
import {
    ProctoringSession,
    StartProctoringSessionRequest,
    TypingEvent,
    PasteEvent,
    FocusEvent,
    IntegrityEventType,
    WebSocketIntegrityMessage,
    ProctoringControls,
} from '../types';
import { useAuth } from '@/lib/auth';

interface ProctoringInterfaceProps {
    taskId?: number;
    questionId?: number;
    onSessionStart?: (sessionId: string) => void;
    onSessionEnd?: (sessionId: string, integrityScore: number) => void;
    minimized?: boolean;
}

export default function ProctoringInterface({
    taskId,
    questionId,
    onSessionStart,
    onSessionEnd,
    minimized = false,
}: ProctoringInterfaceProps) {
    const { user } = useAuth();
    const [session, setSession] = useState<ProctoringSession | null>(null);
    const [isActive, setIsActive] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [integrityScore, setIntegrityScore] = useState<number>(1.0);
    const [alerts, setAlerts] = useState<string[]>([]);
    
    // Refs for tracking
    const wsRef = useRef<WebSocket | null>(null);
    const typingEventsRef = useRef<TypingEvent[]>([]);
    const pasteEventsRef = useRef<PasteEvent[]>([]);
    const focusEventsRef = useRef<FocusEvent[]>([]);
    const startTimeRef = useRef<Date | null>(null);
    
    // Generate unique event IDs
    const generateEventId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Start proctoring session
    const startSession = useCallback(async () => {
        if (!user?.id) return;

        try {
            const sessionRequest: StartProctoringSessionRequest = {
                task_id: taskId,
                question_id: questionId,
                session_data: {
                    browser: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    screen_resolution: `${window.screen.width}x${window.screen.height}`,
                },
            };

            const response = await fetch('/api/integrity/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: parseInt(user.id),
                    ...sessionRequest,
                }),
            });

            if (response.ok) {
                const sessionData: ProctoringSession = await response.json();
                setSession(sessionData);
                setIsActive(true);
                startTimeRef.current = new Date();
                
                // Start monitoring
                initializeMonitoring();
                connectWebSocket(sessionData.session_id);
                
                onSessionStart?.(sessionData.session_id);
            }
        } catch (error) {
            console.error('Failed to start proctoring session:', error);
            addAlert('Failed to start monitoring session');
        }
    }, [user?.id, taskId, questionId, onSessionStart]);

    // End proctoring session
    const endSession = useCallback(async () => {
        if (!session) return;

        try {
            // Calculate final integrity score
            const finalScore = calculateIntegrityScore();
            
            const response = await fetch(`/api/integrity/sessions/${session.session_id}/end?integrity_score=${finalScore}`, {
                method: 'PUT',
            });

            if (response.ok) {
                setIsActive(false);
                disconnectWebSocket();
                cleanupMonitoring();
                onSessionEnd?.(session.session_id, finalScore);
                setSession(null);
            }
        } catch (error) {
            console.error('Failed to end proctoring session:', error);
        }
    }, [session, onSessionEnd]);

    // Initialize monitoring
    const initializeMonitoring = useCallback(() => {
        // Keyboard monitoring
        const handleKeyDown = (event: KeyboardEvent) => {
            const typingEvent: TypingEvent = {
                id: generateEventId(),
                timestamp: Date.now(),
                key: event.key,
                type: 'keydown',
            };
            
            typingEventsRef.current.push(typingEvent);
            
            // Send typing event via WebSocket
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'typing_event',
                    data: typingEvent,
                }));
            }
        };

        // Paste monitoring
        const handlePaste = (event: ClipboardEvent) => {
            const pasteContent = event.clipboardData?.getData('text') || '';
            const pasteEvent: PasteEvent = {
                id: generateEventId(),
                timestamp: Date.now(),
                content: pasteContent,
                length: pasteContent.length,
            };
            
            pasteEventsRef.current.push(pasteEvent);
            
            // Alert for large pastes
            if (pasteContent.length > 100) {
                addAlert('Large paste detected');
            }
            
            // Send paste event via WebSocket
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'paste_event',
                    data: pasteEvent,
                }));
            }
        };

        // Focus/blur monitoring
        const handleFocus = () => {
            const focusEvent: FocusEvent = {
                id: generateEventId(),
                timestamp: Date.now(),
                type: 'focus',
                target: document.title,
            };
            focusEventsRef.current.push(focusEvent);
        };

        const handleBlur = () => {
            const focusEvent: FocusEvent = {
                id: generateEventId(),
                timestamp: Date.now(),
                type: 'blur',
                target: document.title,
            };
            focusEventsRef.current.push(focusEvent);
            addAlert('Tab switch detected');
        };

        // Visibility change monitoring
        const handleVisibilityChange = () => {
            if (document.hidden) {
                addAlert('Browser tab became hidden');
            }
        };

        // Add event listeners
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('paste', handlePaste);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Store listeners for cleanup
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('paste', handlePaste);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // WebSocket connection
    const connectWebSocket = useCallback((sessionId: string) => {
        setConnectionStatus('connecting');
        
        const ws = new WebSocket(`ws://localhost:8000/ws/integrity/proctoring/${sessionId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnectionStatus('connected');
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketIntegrityMessage = JSON.parse(event.data);
                
                if (message.type === 'session_started') {
                    console.log('Proctoring session confirmed:', message.data);
                } else if (message.type === 'proctoring_update') {
                    // Handle real-time proctoring updates
                    if (message.data.integrity_alert) {
                        addAlert(message.data.integrity_alert);
                    }
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        ws.onclose = () => {
            setConnectionStatus('disconnected');
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setConnectionStatus('disconnected');
        };

        // Send heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 30000);

        // Store interval for cleanup
        return () => {
            clearInterval(heartbeatInterval);
        };
    }, []);

    // Disconnect WebSocket
    const disconnectWebSocket = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setConnectionStatus('disconnected');
    }, []);

    // Cleanup monitoring
    const cleanupMonitoring = useCallback(() => {
        typingEventsRef.current = [];
        pasteEventsRef.current = [];
        focusEventsRef.current = [];
        setAlerts([]);
    }, []);

    // Add alert
    const addAlert = useCallback((message: string) => {
        setAlerts(prev => {
            const newAlerts = [...prev, message];
            // Keep only last 5 alerts
            return newAlerts.slice(-5);
        });
        
        // Auto-remove alert after 5 seconds
        setTimeout(() => {
            setAlerts(prev => prev.filter(alert => alert !== message));
        }, 5000);
    }, []);

    // Calculate integrity score
    const calculateIntegrityScore = useCallback(() => {
        let score = 1.0;
        
        // Deduct for paste events
        const pasteCount = pasteEventsRef.current.length;
        if (pasteCount > 0) {
            score -= Math.min(pasteCount * 0.1, 0.3); // Max 0.3 deduction
        }
        
        // Deduct for focus/blur events
        const blurCount = focusEventsRef.current.filter(e => e.type === 'blur').length;
        if (blurCount > 0) {
            score -= Math.min(blurCount * 0.05, 0.2); // Max 0.2 deduction
        }
        
        // Ensure score doesn't go below 0
        return Math.max(score, 0);
    }, []);

    // Update integrity score periodically
    useEffect(() => {
        if (!isActive) return;
        
        const interval = setInterval(() => {
            const newScore = calculateIntegrityScore();
            setIntegrityScore(newScore);
        }, 10000); // Update every 10 seconds
        
        return () => clearInterval(interval);
    }, [isActive, calculateIntegrityScore]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isActive) {
                endSession();
            }
        };
    }, []);

    const getConnectionStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'text-green-600';
            case 'connecting': return 'text-yellow-600';
            case 'disconnected': return 'text-red-600';
        }
    };

    const getIntegrityScoreColor = (score: number) => {
        if (score >= 0.9) return 'text-green-600';
        if (score >= 0.7) return 'text-yellow-600';
        return 'text-red-600';
    };

    if (minimized) {
        return (
            <div className="fixed z-50 bottom-4 right-4">
                <Card className="p-3 bg-white border-2 shadow-lg">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        <span className="text-sm font-medium">
                            {isActive ? 'Monitoring Active' : ' Monitoring'}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        {isActive && (
                            <span className={`text-sm font-bold ${getIntegrityScoreColor(integrityScore)}`}>
                                {Math.round(integrityScore * 100)}%
                            </span>
                        )}
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <Card className="p-4 bg-white border-2 border-blue-200">
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        <h3 className="text-lg font-semibold">Integrity Monitoring</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Wifi className="w-4 h-4" />
                        <span className={`text-sm ${getConnectionStatusColor()}`}>
                            {connectionStatus}
                        </span>
                    </div>
                </div>

                {/* Status */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                        <div className="text-sm text-gray-600">Session Status</div>
                        <div className={`font-semibold ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-sm text-gray-600">Integrity Score</div>
                        <div className={`font-bold text-lg ${getIntegrityScoreColor(integrityScore)}`}>
                            {Math.round(integrityScore * 100)}%
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex justify-center">
                    {!isActive ? (
                        <Button
                            onClick={startSession}
                            className="flex items-center gap-2"
                            disabled={!user?.id}
                        >
                            <Play className="w-4 h-4" />
                            Start Monitoring
                        </Button>
                    ) : (
                        <Button
                            onClick={endSession}
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <Square className="w-4 h-4" />
                            Stop Monitoring
                        </Button>
                    )}
                </div>

                {/* Alerts */}
                {alerts.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-sm font-medium text-gray-700">Recent Alerts</div>
                        <div className="space-y-1">
                            {alerts.map((alert, index) => (
                                <div key={index} className="flex items-center gap-2 p-2 text-sm rounded text-amber-600 bg-amber-50">
                                    <AlertTriangle className="w-4 h-4" />
                                    {alert}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Session Info */}
                {session && (
                    <div className="pt-3 text-xs text-gray-500 border-t">
                        <div>Session ID: {session.session_id.slice(0, 8)}...</div>
                        <div>Started: {session.started_at ? new Date(session.started_at).toLocaleTimeString() : 'Unknown'}</div>
                    </div>
                )}
            </div>
        </Card>
    );
}