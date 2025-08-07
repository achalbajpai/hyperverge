'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Mic, CheckCircle, XCircle, AlertTriangle, RefreshCw, Eye, Maximize, Minimize } from 'lucide-react';

function CameraSetupContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cameraStatus, setCameraStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle');
    const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle');
    const [fullscreenStatus, setFullscreenStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [assignmentData, setAssignmentData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [setupComplete, setSetupComplete] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fullscreenViolations, setFullscreenViolations] = useState(0);
    const [testStarted, setTestStarted] = useState(false);

    const assignmentId = searchParams.get('assignmentId');
    const returnTo = searchParams.get('returnTo') || 'assessment';

    useEffect(() => {
        // Load assignment data from localStorage
        const storedData = localStorage.getItem('currentAssignment');
        if (storedData) {
            try {
                const data = JSON.parse(storedData);
                setAssignmentData(data);
            } catch (error) {
                console.error('Failed to parse assignment data:', error);
            }
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        // Check setup completion status
        if (cameraStatus === 'granted' && micStatus === 'granted' && fullscreenStatus === 'granted' && stream) {
            setSetupComplete(true);
        } else {
            setSetupComplete(false);
        }
    }, [cameraStatus, micStatus, fullscreenStatus, stream]);

    useEffect(() => {
        // Add fullscreen change listener
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);
            
            // If test has started and user exits fullscreen, count as violation
            if (testStarted && !isCurrentlyFullscreen && setupComplete) {
                setFullscreenViolations(prev => prev + 1);
                // You could add a toast notification here
                console.warn('Fullscreen violation detected!');
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [testStarted, setupComplete]);


    const requestFullscreen = async () => {
        setFullscreenStatus('requesting');
        
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
                setFullscreenStatus('granted');
            } else {
                setFullscreenStatus('error');
            }
        } catch (error) {
            console.error('Fullscreen request failed:', error);
            setFullscreenStatus('denied');
        }
    };

    const requestAllPermissions = async () => {
        // First request camera and microphone
        setCameraStatus('requesting');
        setMicStatus('requesting');

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: true
            });

            setStream(mediaStream);
            setCameraStatus('granted');
            setMicStatus('granted');

            // Display video feed
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }

            // Then request fullscreen
            await requestFullscreen();

            // Store permission status
            const permissionData = {
                camera: true,
                microphone: true,
                fullscreen: true,
                timestamp: new Date().toISOString(),
                assignmentId
            };
            localStorage.setItem('cameraPermissions', JSON.stringify(permissionData));

        } catch (error) {
            console.error('Failed to access camera/microphone:', error);
            
            if (error instanceof DOMException) {
                if (error.name === 'NotAllowedError') {
                    setCameraStatus('denied');
                    setMicStatus('denied');
                } else if (error.name === 'NotFoundError') {
                    setCameraStatus('error');
                    setMicStatus('error');
                } else {
                    setCameraStatus('error');
                    setMicStatus('error');
                }
            } else {
                setCameraStatus('error');
                setMicStatus('error');
            }
        }
    };

    const retrySetup = () => {
        // Stop any existing stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        
        setCameraStatus('idle');
        setMicStatus('idle');
        setFullscreenStatus('idle');
        setSetupComplete(false);
    };

    const proceedToTest = () => {
        // Ensure we're in fullscreen mode
        if (!document.fullscreenElement) {
            alert('Please enter fullscreen mode to proceed with the assessment.');
            requestFullscreen();
            return;
        }
        
        setTestStarted(true);
        
        // Store setup completion
        const setupData = {
            completed: true,
            timestamp: new Date().toISOString(),
            assignmentId,
            cameraGranted: cameraStatus === 'granted',
            micGranted: micStatus === 'granted',
            fullscreenGranted: fullscreenStatus === 'granted'
        };
        localStorage.setItem('cameraSetupComplete', JSON.stringify(setupData));

        // Navigate to the actual test
        const targetUrl = returnTo === 'project' 
            ? `/student/project?assignmentId=${assignmentId}&courseId=${assignmentData?.courseId}&title=${encodeURIComponent(assignmentData?.title || '')}`
            : `/student/assessment?assignmentId=${assignmentId}&courseId=${assignmentData?.courseId}&title=${encodeURIComponent(assignmentData?.title || '')}`;
        
        router.push(targetUrl);
    };

    const handleBack = () => {
        // Stop any active stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        // Clear stored data and go back
        localStorage.removeItem('currentAssignment');
        localStorage.removeItem('rulesAccepted');
        router.push('/student');
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'granted':
                return <CheckCircle className="w-5 h-5 text-green-400" />;
            case 'denied':
            case 'error':
                return <XCircle className="w-5 h-5 text-red-400" />;
            case 'requesting':
                return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
            default:
                return <AlertTriangle className="w-5 h-5 text-gray-400" />;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'granted':
                return 'Access Granted';
            case 'denied':
                return 'Access Denied';
            case 'error':
                return 'Device Error';
            case 'requesting':
                return 'Requesting...';
            default:
                return 'Not Requested';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'granted':
                return 'text-green-400';
            case 'denied':
            case 'error':
                return 'text-red-400';
            case 'requesting':
                return 'text-blue-400';
            default:
                return 'text-gray-400';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <div className="bg-[#1A1A1A] border-b border-gray-800 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleBack}
                                className="text-gray-400 hover:text-gray-200"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Dashboard
                            </Button>
                            <div className="h-6 w-px bg-gray-600"></div>
                            <div>
                                <h1 className="text-xl font-light text-white">
                                    Camera & Microphone Setup
                                </h1>
                                <p className="text-sm text-gray-400">
                                    {assignmentData?.title || 'Assignment'} • Verify your setup
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-sm text-purple-400">
                            <Eye className="w-4 h-4" />
                            <span>Proctored Assessment</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {/* Instructions */}
                <Card className="bg-[#1A1A1A] mb-6 border-b-2 border-blue-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <Camera className="w-5 h-5 mr-2 text-blue-400" />
                            Setup Your Camera & Microphone
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-300 mb-4">
                            Your assessment requires camera and microphone access for integrity monitoring. 
                            Click the button below to grant permissions and test your setup.
                        </p>
                        <div className="bg-blue-900 border border-blue-500 rounded-lg p-4 text-blue-200">
                            <p className="text-sm">
                                <strong>Privacy Note:</strong> Your camera and microphone will only be used during the assessment. 
                                No recordings are stored permanently on our servers.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Camera Feed */}
                    <Card className="bg-[#1A1A1A] border-b-2 border-green-500 border-opacity-70">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center">
                                <Eye className="w-5 h-5 mr-2 text-green-400" />
                                Camera Preview
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-gray-800 rounded-lg overflow-hidden aspect-video">
                                {stream ? (
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        className="w-full h-full object-cover"
                                        onLoadedMetadata={() => {
                                            if (videoRef.current) {
                                                videoRef.current.play();
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        <div className="text-center">
                                            <Camera className="w-12 h-12 mx-auto mb-2" />
                                            <p>Camera feed will appear here</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {setupComplete && (
                                <div className="mt-4 p-3 bg-green-900 border border-green-500 rounded-lg">
                                    <div className="flex items-center text-green-300">
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        <span className="text-sm">Camera is working properly!</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Status & Controls */}
                    <Card className="bg-[#1A1A1A] border-b-2 border-purple-500 border-opacity-70">
                        <CardHeader>
                            <CardTitle className="text-white">Permission Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Camera Status */}
                                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <Camera className="w-5 h-5 text-blue-400" />
                                        <span className="text-white">Camera Access</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {getStatusIcon(cameraStatus)}
                                        <span className={`text-sm ${getStatusColor(cameraStatus)}`}>
                                            {getStatusText(cameraStatus)}
                                        </span>
                                    </div>
                                </div>

                                {/* Microphone Status */}
                                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <Mic className="w-5 h-5 text-green-400" />
                                        <span className="text-white">Microphone Access</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {getStatusIcon(micStatus)}
                                        <span className={`text-sm ${getStatusColor(micStatus)}`}>
                                            {getStatusText(micStatus)}
                                        </span>
                                    </div>
                                </div>

                                {/* Fullscreen Status */}
                                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <Maximize className="w-5 h-5 text-purple-400" />
                                        <span className="text-white">Fullscreen Access</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {getStatusIcon(fullscreenStatus)}
                                        <span className={`text-sm ${getStatusColor(fullscreenStatus)}`}>
                                            {getStatusText(fullscreenStatus)}
                                        </span>
                                    </div>
                                </div>

                                {/* Setup Instructions */}
                                {cameraStatus === 'idle' && (
                                    <div className="mt-6">
                                        <Button
                                            onClick={requestAllPermissions}
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                        >
                                            <div className="flex items-center justify-center space-x-2">
                                                <Camera className="w-4 h-4" />
                                                <Mic className="w-4 h-4" />
                                                <Maximize className="w-4 h-4" />
                                                <span>Request Camera, Microphone & Fullscreen Access</span>
                                            </div>
                                        </Button>
                                    </div>
                                )}

                                {/* Error Handling */}
                                {(cameraStatus === 'denied' || micStatus === 'denied' || fullscreenStatus === 'denied') && (
                                    <div className="mt-6 space-y-4">
                                        <div className="p-3 bg-red-900 border border-red-500 rounded-lg">
                                            <p className="text-red-200 text-sm">
                                                <strong>Permission Denied:</strong> Please enable camera, microphone, and fullscreen access 
                                                in your browser settings and try again.
                                            </p>
                                        </div>
                                        <Button
                                            onClick={retrySetup}
                                            variant="outline"
                                            className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                                        >
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                            Try Again
                                        </Button>
                                    </div>
                                )}

                                {/* Error Messages */}
                                {(cameraStatus === 'error' || micStatus === 'error' || fullscreenStatus === 'error') && (
                                    <div className="mt-6 space-y-4">
                                        <div className="p-3 bg-yellow-900 border border-yellow-500 rounded-lg">
                                            <p className="text-yellow-200 text-sm">
                                                <strong>Device Error:</strong> Unable to access your camera, microphone, or fullscreen mode. 
                                                Please check your device settings and browser permissions.
                                            </p>
                                        </div>
                                        <Button
                                            onClick={retrySetup}
                                            variant="outline"
                                            className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                                        >
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                            Retry Setup
                                        </Button>
                                    </div>
                                )}

                                {/* Fullscreen Status Indicator */}
                                {testStarted && (
                                    <div className="mt-6">
                                        <div className={`p-3 border rounded-lg ${
                                            isFullscreen 
                                                ? 'bg-green-900 border-green-500' 
                                                : 'bg-red-900 border-red-500'
                                        }`}>
                                            <div className="flex items-center space-x-2">
                                                {isFullscreen ? (
                                                    <>
                                                        <Maximize className="w-4 h-4 text-green-400" />
                                                        <span className="text-green-200 text-sm">Fullscreen Active</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Minimize className="w-4 h-4 text-red-400" />
                                                        <span className="text-red-200 text-sm">Fullscreen Required</span>
                                                        {fullscreenViolations > 0 && (
                                                            <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs ml-2">
                                                                {fullscreenViolations} violations
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Success and Proceed */}
                                {setupComplete && (
                                    <div className="mt-6 space-y-4">
                                        <div className="p-3 bg-green-900 border border-green-500 rounded-lg">
                                            <p className="text-green-200 text-sm">
                                                <strong>Setup Complete:</strong> Your camera, microphone, and fullscreen permissions are granted. 
                                                You can now proceed to your assessment.
                                            </p>
                                        </div>
                                        <Button
                                            onClick={proceedToTest}
                                            className="w-full bg-green-600 hover:bg-green-700"
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Proceed to Assessment
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Technical Requirements */}
                <Card className="bg-[#1A1A1A] mt-6 border-b-2 border-yellow-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2 text-yellow-400" />
                            Setup Tips
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <h4 className="text-white font-medium mb-2">Camera Setup</h4>
                                <ul className="text-gray-300 space-y-1">
                                    <li>• Position camera at eye level</li>
                                    <li>• Ensure good lighting on your face</li>
                                    <li>• Remove any obstructions</li>
                                    <li>• Check that only you are visible</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-medium mb-2">Environment</h4>
                                <ul className="text-gray-300 space-y-1">
                                    <li>• Find a quiet, private space</li>
                                    <li>• Close other applications</li>
                                    <li>• Ensure stable internet connection</li>
                                    <li>• Remove unauthorized materials from view</li>
                                    <li>• Stay in fullscreen mode throughout the test</li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function CameraSetupPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        }>
            <CameraSetupContent />
        </Suspense>
    );
}