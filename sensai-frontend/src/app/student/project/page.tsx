'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Code, Upload, Download, Save, Play, Shield } from 'lucide-react';
import { fetchAssignment, type Assignment } from '@/lib/student-api';
import ProctoringInterface from '@/components/ProctoringInterface';

function ProjectContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [code, setCode] = useState('// Write your code here\n\n');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    // Get assignment parameters from URL
    const assignmentId = searchParams.get('assignmentId');

    // Load assignment data
    useEffect(() => {
        const loadAssignment = async () => {
            if (assignmentId) {
                try {
                    const assignmentData = await fetchAssignment(parseInt(assignmentId));
                    if (assignmentData) {
                        setAssignment(assignmentData);
                        
                        // Start proctoring session for projects
                        if (assignmentData.integrityEnabled && session?.user?.id) {
                            // Initialize proctoring session
                            // This would be similar to the assessment page
                        }
                    }
                } catch (error) {
                    console.error('Error loading assignment:', error);
                }
            }
            setLoading(false);
        };

        loadAssignment();
    }, [assignmentId, session?.user?.id]);

    const handleSaveProject = async () => {
        if (!session?.user?.id || !assignmentId) return;
        
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/tasks/${assignmentId}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: parseInt(session.user.id),
                    code,
                    saved_at: new Date().toISOString()
                })
            });
            
            if (response.ok) {
                console.log('Project saved successfully');
                // Show success message
            }
        } catch (error) {
            console.error('Error saving project:', error);
        }
    };

    const handleSubmitProject = async () => {
        if (!session?.user?.id || !assignmentId) return;
        
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/tasks/${assignmentId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: parseInt(session.user.id),
                    code,
                    submitted_at: new Date().toISOString(),
                    session_id: sessionId
                })
            });
            
            if (response.ok) {
                setIsSubmitted(true);
                console.log('Project submitted successfully');
            }
        } catch (error) {
            console.error('Error submitting project:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!assignment) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-8 border-b-2 border-red-500 border-opacity-70 max-w-md mx-auto text-center">
                    <h2 className="text-xl font-light text-white mb-2">Assignment Not Found</h2>
                    <p className="text-gray-400 mb-4">The requested assignment could not be loaded.</p>
                    <Button onClick={() => router.push('/student')}>
                        Back to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <div className="bg-[#1A1A1A] border-b border-gray-800 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push('/student')}
                                className="text-gray-400 hover:text-gray-200"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Dashboard
                            </Button>
                            <div className="h-6 w-px bg-gray-600"></div>
                            <div>
                                <h1 className="text-xl font-light text-white">
                                    {assignment.title}
                                </h1>
                                <p className="text-sm text-gray-400">
                                    {assignment.courseTitle} • {assignment.milestoneTitle}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            {assignment.integrityEnabled && (
                                <div className="flex items-center space-x-2 text-sm text-purple-400">
                                    <Shield className="w-4 h-4" />
                                    <span>Proctored</span>
                                </div>
                            )}
                            
                            {isSubmitted && (
                                <span className="px-3 py-1 text-sm bg-green-900 text-green-300 border border-green-500 rounded-full">
                                    Submitted
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Proctoring Interface */}
            {assignment.integrityEnabled && (
                <ProctoringInterface
                    taskId={parseInt(assignmentId || '1')}
                    minimized={true}
                />
            )}

                <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Project Instructions */}
                    <div className="lg:col-span-1">
                        <Card className="bg-[#1A1A1A] border-gray-700">
                            <CardHeader>
                                <CardTitle className="text-white">Project Instructions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="font-semibold mb-2 text-white">Description</h3>
                                        <p className="text-gray-400 text-sm">
                                            {assignment.description}
                                        </p>
                                    </div>                                    <div>
                                        <h3 className="font-semibold mb-2 text-white">Requirements</h3>
                                        <ul className="text-sm text-gray-400 space-y-1">
                                            <li>• Build a functional web application</li>
                                            <li>• Implement user authentication</li>
                                            <li>• Use modern web technologies</li>
                                            <li>• Include proper error handling</li>
                                            <li>• Write clean, documented code</li>
                                        </ul>
                                    </div>
                                    
                                    <div>
                                        <h3 className="font-semibold mb-2 text-white">Submission</h3>
                                        <p className="text-gray-400 text-sm">
                                            Save your work frequently and submit when complete. 
                                            Make sure your code is well-documented and functional.
                                        </p>
                                    </div>

                                    {assignment.dueDate && (
                                        <div>
                                            <h3 className="font-semibold mb-2 text-white">Due Date</h3>
                                            <p className="text-gray-400 text-sm">
                                                {new Date(assignment.dueDate).toLocaleDateString()} at 11:59 PM
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Code Editor */}
                    <div className="lg:col-span-2">
                        <Card className="bg-[#1A1A1A] border-gray-700">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center text-white">
                                        <Code className="w-5 h-5 mr-2" />
                                        Code Editor
                                    </CardTitle>
                                    <div className="flex space-x-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSaveProject}
                                            disabled={isSubmitted}
                                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                        >
                                            <Save className="w-4 h-4 mr-2" />
                                            Save
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isSubmitted}
                                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            Run
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="border border-gray-600 rounded-lg">
                                    <textarea
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        className="w-full h-96 p-4 font-mono text-sm border-none resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg bg-[#0D1117] text-white placeholder-gray-400"
                                        placeholder="Write your code here..."
                                        disabled={isSubmitted}
                                    />
                                </div>
                                
                                {/* File Upload/Download */}
                                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-600">
                                    <div className="flex space-x-2">
                                        <Button variant="outline" size="sm" disabled={isSubmitted} className="border-gray-600 text-gray-300 hover:bg-gray-700">
                                            <Upload className="w-4 h-4 mr-2" />
                                            Upload File
                                        </Button>
                                        <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                                            <Download className="w-4 h-4 mr-2" />
                                            Download
                                        </Button>
                                    </div>
                                    
                                    <div className="text-sm text-gray-400">
                                        Auto-saved • {new Date().toLocaleTimeString()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Submission */}
                        <Card className="mt-6 bg-[#1A1A1A] border-gray-700">
                            <CardContent className="py-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold mb-1 text-white">
                                            {isSubmitted ? 'Project Submitted!' : 'Ready to Submit?'}
                                        </h3>
                                        <p className="text-gray-400 text-sm">
                                            {isSubmitted 
                                                ? 'Your project has been submitted successfully. You can view it on your dashboard.'
                                                : 'Make sure your code is complete and tested before submitting.'
                                            }
                                        </p>
                                    </div>
                                    <div className="flex space-x-3">
                                        {!isSubmitted && (
                                            <Button onClick={handleSubmitProject}>
                                                Submit Project
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            onClick={() => router.push('/student')}
                                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                        >
                                            {isSubmitted ? 'Back to Dashboard' : 'Save & Exit'}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function StudentProjectPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        }>
            <ProjectContent />
        </Suspense>
    );
}
