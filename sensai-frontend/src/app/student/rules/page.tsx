'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, CheckCircle, AlertTriangle, Eye, Mic, Clipboard, Clock, Users } from 'lucide-react';

function RulesContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [rulesAccepted, setRulesAccepted] = useState(false);
    const [assignmentData, setAssignmentData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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

    const handleAcceptRules = () => {
        if (!rulesAccepted) return;

        // Store rules acceptance
        const rulesData = {
            assignmentId,
            accepted: true,
            timestamp: new Date().toISOString(),
            userId: session?.user?.id
        };
        localStorage.setItem('rulesAccepted', JSON.stringify(rulesData));

        // Navigate to camera setup
        router.push(`/student/camera-setup?assignmentId=${assignmentId}&returnTo=${returnTo}`);
    };

    const handleBack = () => {
        // Clear assignment data and go back to dashboard
        localStorage.removeItem('currentAssignment');
        router.push('/student');
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
                                    Integrity Guidelines
                                </h1>
                                <p className="text-sm text-gray-400">
                                    {assignmentData?.title || 'Assignment'} • Please read and accept
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-sm text-purple-400">
                            <Shield className="w-4 h-4" />
                            <span>Proctored Assessment</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {/* Introduction */}
                <Card className="bg-[#1A1A1A] border-gray-700 mb-6 border-b-2 border-purple-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <Shield className="w-5 h-5 mr-2 text-purple-400" />
                            Academic Integrity Guidelines
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-300 mb-4">
                            This assessment is monitored using our advanced integrity system to ensure fair evaluation. 
                            Please read and understand the following guidelines before proceeding.
                        </p>
                        <div className="bg-purple-900 border border-purple-500 rounded-lg p-4 text-purple-200">
                            <p className="text-sm">
                                <strong>Important:</strong> By proceeding, you consent to audio, video, and behavioral monitoring 
                                during the assessment to maintain academic integrity standards.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Monitoring Technologies */}
                <Card className="bg-[#1A1A1A] border-gray-700 mb-6 border-b-2 border-blue-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <Eye className="w-5 h-5 mr-2 text-blue-400" />
                            Monitoring Technologies
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start space-x-3">
                                <Eye className="w-5 h-5 text-blue-400 mt-1" />
                                <div>
                                    <h4 className="text-white font-medium">Video Monitoring</h4>
                                    <p className="text-gray-400 text-sm">
                                        Your camera will capture video to detect multiple people, unusual movements, or objects that could be used for cheating.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-3">
                                <Mic className="w-5 h-5 text-green-400 mt-1" />
                                <div>
                                    <h4 className="text-white font-medium">Audio Detection</h4>
                                    <p className="text-gray-400 text-sm">
                                        Advanced multilingual audio analysis detects conversations, coaching, or external assistance in any language.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-3">
                                <Clipboard className="w-5 h-5 text-yellow-400 mt-1" />
                                <div>
                                    <h4 className="text-white font-medium">Content Analysis</h4>
                                    <p className="text-gray-400 text-sm">
                                        AI-powered detection of copy-paste activities, rapid typing patterns, and content similarity with external sources.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-3">
                                <Clock className="w-5 h-5 text-orange-400 mt-1" />
                                <div>
                                    <h4 className="text-white font-medium">Behavioral Patterns</h4>
                                    <p className="text-gray-400 text-sm">
                                        Analysis of typing speed, completion time, and navigation patterns to identify unusual behavior.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Rules and Guidelines */}
                <Card className="bg-[#1A1A1A] border-gray-700 mb-6 border-b-2 border-green-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
                            Assessment Rules
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="border-l-4 border-green-500 pl-4">
                                <h4 className="text-white font-medium mb-2">✅ What is Allowed</h4>
                                <ul className="text-gray-300 text-sm space-y-1">
                                    <li>• Use your own knowledge and understanding</li>
                                    <li>• Take breaks if needed (time will continue)</li>
                                    <li>• Adjust your camera position before starting</li>
                                    <li>• Ask for technical support if issues arise</li>
                                    <li>• Complete the assessment at your own pace</li>
                                </ul>
                            </div>
                            
                            <div className="border-l-4 border-red-500 pl-4">
                                <h4 className="text-white font-medium mb-2">❌ Prohibited Activities</h4>
                                <ul className="text-gray-300 text-sm space-y-1">
                                    <li>• <strong>No external assistance:</strong> Getting help from other people, tutors, or coaching</li>
                                    <li>• <strong>No unauthorized materials:</strong> Books, notes, phones, tablets, or reference materials</li>
                                    <li>• <strong>No copy-paste:</strong> Copying content from external sources or other applications</li>
                                    <li>• <strong>No multiple tabs/windows:</strong> Opening other websites or applications during the test</li>
                                    <li>• <strong>No communication:</strong> Talking to others, phone calls, or messaging</li>
                                    <li>• <strong>No leaving the frame:</strong> Staying visible in the camera throughout the assessment</li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Technical Requirements */}
                <Card className="bg-[#1A1A1A] border-gray-700 mb-6 border-b-2 border-yellow-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2 text-yellow-400" />
                            Technical Requirements
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <h4 className="text-white font-medium mb-2">Camera & Audio</h4>
                                <ul className="text-gray-300 space-y-1">
                                    <li>• Functional webcam with clear video quality</li>
                                    <li>• Microphone access for audio monitoring</li>
                                    <li>• Well-lit environment with your face visible</li>
                                    <li>• Stable internet connection</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-medium mb-2">Environment</h4>
                                <ul className="text-gray-300 space-y-1">
                                    <li>• Quiet, private room without interruptions</li>
                                    <li>• Clean desk space with no unauthorized materials</li>
                                    <li>• Only you should be visible in the camera frame</li>
                                    <li>• Close all unnecessary applications and tabs</li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Warnings and Consequences */}
                <Card className="bg-[#1A1A1A] border-gray-700 mb-6 border-b-2 border-red-500 border-opacity-70">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center">
                            <Users className="w-5 h-5 mr-2 text-red-400" />
                            Integrity Violations & Consequences
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="bg-red-900 border border-red-500 rounded-lg p-4">
                                <p className="text-red-200 text-sm">
                                    <strong>Academic Integrity:</strong> Any detected violations will be reviewed by academic staff. 
                                    Confirmed violations may result in assessment invalidation, grade penalties, or disciplinary action.
                                </p>
                            </div>
                            <div className="bg-yellow-900 border border-yellow-500 rounded-lg p-4">
                                <p className="text-yellow-200 text-sm">
                                    <strong>Real-time Alerts:</strong> You will receive polite warnings if suspicious activity is detected. 
                                    Multiple warnings may result in automatic assessment termination.
                                </p>
                            </div>
                            <div className="bg-blue-900 border border-blue-500 rounded-lg p-4">
                                <p className="text-blue-200 text-sm">
                                    <strong>Review Process:</strong> All flagged activities undergo human review. False positives are 
                                    identified and do not impact your grade.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Acceptance */}
                <Card className="bg-[#1A1A1A] border-gray-700 border-b-2 border-indigo-500 border-opacity-70">
                    <CardContent className="py-6">
                        <div className="flex items-start space-x-3 mb-6">
                            <input
                                type="checkbox"
                                id="rulesAccepted"
                                checked={rulesAccepted}
                                onChange={(e) => setRulesAccepted(e.target.checked)}
                                className="mt-1 w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                            />
                            <label htmlFor="rulesAccepted" className="text-gray-300 text-sm">
                                I have read and understood the integrity guidelines above. I agree to follow all rules during this assessment 
                                and consent to monitoring through camera, microphone, and behavioral analysis. I understand that violations 
                                may result in academic consequences.
                            </label>
                        </div>
                        
                        <div className="flex justify-between">
                            <Button
                                variant="outline"
                                onClick={handleBack}
                                className="border-gray-600 text-gray-300 hover:bg-gray-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAcceptRules}
                                disabled={!rulesAccepted}
                                className={`${rulesAccepted 
                                    ? 'bg-purple-600 hover:bg-purple-700' 
                                    : 'bg-gray-600 cursor-not-allowed'
                                }`}
                            >
                                Accept & Continue
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function StudentRulesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        }>
            <RulesContent />
        </Suspense>
    );
}