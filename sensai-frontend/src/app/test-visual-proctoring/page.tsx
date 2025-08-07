'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import VisualProctoringInterface from '@/components/VisualProctoringInterface';
import { AlertTriangle, Shield, Clock, Eye, Users, Phone, Mic } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface TestFlag {
    id: number;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: string;
    confidence: number;
}

export default function TestVisualProctoringPage() {
    const { data: session } = useSession();
    const [sessionId, setSessionId] = useState<string>('');
    const [testFlags, setTestFlags] = useState<TestFlag[]>([]);
    const [isTestActive, setIsTestActive] = useState(false);
    const [testStartTime, setTestStartTime] = useState<Date | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [flagCount, setFlagCount] = useState({
        face: 0,
        gaze: 0,
        movement: 0,
        people: 0,
        devices: 0
    });

    // Update current time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Generate session ID on mount
    useEffect(() => {
        setSessionId(`test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }, []);

    // Start test session
    const startTest = () => {
        setIsTestActive(true);
        setTestStartTime(new Date());
        setTestFlags([]);
        setFlagCount({ face: 0, gaze: 0, movement: 0, people: 0, devices: 0 });
    };

    // Stop test session
    const stopTest = () => {
        setIsTestActive(false);
        setTestStartTime(null);
    };

    // Handle proctoring flags
    const handleProctoringFlag = (flag: any) => {
        const newFlag: TestFlag = {
            id: Date.now() + Math.random(),
            type: flag.type,
            severity: flag.severity,
            message: flag.message,
            timestamp: flag.timestamp,
            confidence: flag.confidence
        };

        setTestFlags(prev => [...prev, newFlag].slice(-20)); // Keep last 20 flags

        // Update counters
        setFlagCount(prev => {
            const updated = { ...prev };
            switch (flag.type) {
                case 'no_face_detected':
                case 'head_turned':
                case 'head_tilted':
                    updated.face += 1;
                    break;
                case 'eyes_off_screen':
                    updated.gaze += 1;
                    break;
                case 'mouth_movement_detected':
                    updated.movement += 1;
                    break;
                case 'multiple_people_detected':
                    updated.people += 1;
                    break;
                case 'unauthorized_device_detected':
                    updated.devices += 1;
                    break;
            }
            return updated;
        });
    };

    // Get flag icon
    const getFlagIcon = (flagType: string) => {
        switch (flagType) {
            case 'no_face_detected':
            case 'head_turned':
            case 'head_tilted':
                return <Eye className="w-4 h-4" />;
            case 'eyes_off_screen':
                return <Eye className="w-4 h-4" />;
            case 'mouth_movement_detected':
                return <Mic className="w-4 h-4" />;
            case 'multiple_people_detected':
                return <Users className="w-4 h-4" />;
            case 'unauthorized_device_detected':
                return <Phone className="w-4 h-4" />;
            default:
                return <AlertTriangle className="w-4 h-4" />;
        }
    };

    // Calculate test duration
    const getTestDuration = () => {
        if (!testStartTime) return '00:00';
        const diff = currentTime.getTime() - testStartTime.getTime();
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900">Visual Proctoring Test Environment</h1>
                    <p className="mt-2 text-gray-600">
                        Test and monitor all visual proctoring features in real-time
                    </p>
                </div>

                {/* Control Panel */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            Test Controls
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="text-sm text-gray-600">Session ID: {sessionId}</div>
                                <div className="text-sm text-gray-600">User ID: {session?.user?.id || 'demo'}</div>
                                {isTestActive && (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <Clock className="w-4 h-4" />
                                        <span>Test Duration: {getTestDuration()}</span>
                                    </div>
                                )}
                            </div>
                            <div className="space-x-2">
                                {!isTestActive ? (
                                    <Button onClick={startTest} className="bg-green-600 hover:bg-green-700">
                                        Start Visual Proctoring Test
                                    </Button>
                                ) : (
                                    <Button onClick={stopTest} variant="outline">
                                        Stop Test
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Visual Proctoring Interface */}
                    <div className="lg:col-span-2">
                        {isTestActive ? (
                            <VisualProctoringInterface
                                sessionId={sessionId}
                                userId={parseInt(session?.user?.id || '1')}
                                onFlagDetected={handleProctoringFlag}
                                minimized={false}
                                autoStart={true}
                            />
                        ) : (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <Shield className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        Visual Proctoring Inactive
                                    </h3>
                                    <p className="text-gray-600">
                                        Start the test to activate visual proctoring
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Statistics and Flags */}
                    <div className="space-y-6">
                        {/* Statistics */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Detection Statistics</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Eye className="w-4 h-4 text-blue-500" />
                                            Face/Position
                                        </div>
                                        <span className="font-medium">{flagCount.face}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Eye className="w-4 h-4 text-purple-500" />
                                            Gaze Direction
                                        </div>
                                        <span className="font-medium">{flagCount.gaze}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Mic className="w-4 h-4 text-green-500" />
                                            Mouth Movement
                                        </div>
                                        <span className="font-medium">{flagCount.movement}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Users className="w-4 h-4 text-orange-500" />
                                            Multiple People
                                        </div>
                                        <span className="font-medium">{flagCount.people}</span>
                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Phone className="w-4 h-4 text-red-500" />
                                            Unauthorized Devices
                                        </div>
                                        <span className="font-medium">{flagCount.devices}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Test Instructions */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Test Instructions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm space-y-2 text-gray-600">
                                    <p><strong>To test face detection:</strong></p>
                                    <ul className="list-disc list-inside ml-2 space-y-1">
                                        <li>Move your head away from camera</li>
                                        <li>Turn your head left/right</li>
                                        <li>Tilt your head up/down</li>
                                    </ul>
                                    
                                    <p className="pt-2"><strong>To test gaze tracking:</strong></p>
                                    <ul className="list-disc list-inside ml-2 space-y-1">
                                        <li>Look away from the screen</li>
                                        <li>Look at different corners</li>
                                    </ul>
                                    
                                    <p className="pt-2"><strong>To test mouth detection:</strong></p>
                                    <ul className="list-disc list-inside ml-2 space-y-1">
                                        <li>Speak or move your mouth</li>
                                        <li>Open your mouth wide</li>
                                    </ul>
                                    
                                    <p className="pt-2"><strong>To test people detection:</strong></p>
                                    <ul className="list-disc list-inside ml-2 space-y-1">
                                        <li>Have someone else join you</li>
                                        <li>Show a photo of a person</li>
                                    </ul>
                                    
                                    <p className="pt-2"><strong>To test device detection:</strong></p>
                                    <ul className="list-disc list-inside ml-2 space-y-1">
                                        <li>Show your phone to the camera</li>
                                        <li>Hold up a tablet or laptop</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Recent Flags */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Detections</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {testFlags.length === 0 ? (
                                        <p className="text-sm text-gray-500 text-center py-4">
                                            No flags detected yet
                                        </p>
                                    ) : (
                                        testFlags.slice().reverse().map((flag) => (
                                            <div
                                                key={flag.id}
                                                className={`p-2 rounded border-l-4 text-sm ${
                                                    flag.severity === 'critical' ? 'bg-red-50 border-red-500' :
                                                    flag.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                                                    flag.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                                                    'bg-blue-50 border-blue-500'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    {getFlagIcon(flag.type)}
                                                    <span className="font-medium">{flag.message}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 flex justify-between">
                                                    <span>{new Date(flag.timestamp).toLocaleTimeString()}</span>
                                                    <span>{Math.round(flag.confidence * 100)}% confidence</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Features Overview */}
                <Card>
                    <CardHeader>
                        <CardTitle>Visual Proctoring Features</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="p-4 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <Eye className="w-5 h-5 text-blue-500" />
                                    <h3 className="font-medium">Face Detection</h3>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Monitors face presence and position. Detects when no face is visible for more than 3 seconds.
                                </p>
                            </div>
                            
                            <div className="p-4 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                                    <h3 className="font-medium">Head Movement</h3>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Tracks head orientation and flags when user is not facing the screen or head is tilted.
                                </p>
                            </div>
                            
                            <div className="p-4 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <Eye className="w-5 h-5 text-purple-500" />
                                    <h3 className="font-medium">Gaze Tracking</h3>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Monitors eye gaze direction and flags when eyes are off-screen for more than 5 seconds.
                                </p>
                            </div>
                            
                            <div className="p-4 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <Mic className="w-5 h-5 text-green-500" />
                                    <h3 className="font-medium">Mouth Movement</h3>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Detects mouth movement and speaking activity using lip landmark analysis.
                                </p>
                            </div>
                            
                            <div className="p-4 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <Users className="w-5 h-5 text-red-500" />
                                    <h3 className="font-medium">Multiple People</h3>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Identifies when more than one person is detected in the camera frame.
                                </p>
                            </div>
                            
                            <div className="p-4 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <Phone className="w-5 h-5 text-red-500" />
                                    <h3 className="font-medium">Device Detection</h3>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Uses YOLO object detection to identify phones, tablets, laptops, and books.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
