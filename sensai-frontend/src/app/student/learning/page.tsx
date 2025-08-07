'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, CheckCircle, Clock } from 'lucide-react';
import { fetchAssignment, type Assignment } from '@/lib/student-api';

function LearningContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCompleted, setIsCompleted] = useState(false);
    const [startTime] = useState(new Date());

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
                    }
                } catch (error) {
                    console.error('Error loading assignment:', error);
                }
            }
            setLoading(false);
        };

        loadAssignment();
    }, [assignmentId]);

    const handleMarkComplete = async () => {
        if (!session?.user?.id || !assignmentId) return;
        
        try {
            // In a real implementation, you'd call an API to mark as complete
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/tasks/${assignmentId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: parseInt(session.user.id),
                    completed_at: new Date().toISOString()
                })
            });
            
            if (response.ok) {
                setIsCompleted(true);
            }
        } catch (error) {
            console.error('Error marking assignment complete:', error);
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
                            <div className="flex items-center space-x-2 text-sm text-blue-400">
                                <Clock className="w-4 h-4" />
                                <span>
                                    {Math.floor((new Date().getTime() - startTime.getTime()) / 60000)} min
                                </span>
                            </div>
                            
                            {isCompleted && (
                                <div className="flex items-center space-x-2 text-sm text-green-400">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Completed</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <BookOpen className="w-5 h-5 mr-2" />
                            Learning Material
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="prose max-w-none">
                            <h2 className="text-2xl font-bold mb-4">{assignment.title}</h2>
                            <p className="text-gray-600 mb-6">{assignment.description}</p>
                            
                            {/* Learning Content */}
                            <div className="space-y-6">
                                <section>
                                    <h3 className="text-xl font-semibold mb-3">Overview</h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        This learning material covers important concepts that are essential for your understanding 
                                        of the subject matter. Take your time to read through the content carefully and make sure 
                                        you understand each concept before proceeding.
                                    </p>
                                </section>

                                <section>
                                    <h3 className="text-xl font-semibold mb-3">Key Concepts</h3>
                                    <div className="bg-blue-50 p-4 rounded-lg">
                                        <ul className="list-disc list-inside space-y-2 text-gray-700">
                                            <li>Understanding the fundamental principles</li>
                                            <li>Practical applications and use cases</li>
                                            <li>Best practices and common patterns</li>
                                            <li>Real-world examples and implementations</li>
                                        </ul>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-xl font-semibold mb-3">Detailed Explanation</h3>
                                    <div className="space-y-4 text-gray-700">
                                        <p>
                                            This section would contain the actual learning material content. In a real implementation,
                                            this would be loaded from your backend system and could include:
                                        </p>
                                        <ul className="list-disc list-inside space-y-1 ml-4">
                                            <li>Rich text content with formatting</li>
                                            <li>Images and diagrams</li>
                                            <li>Code examples and snippets</li>
                                            <li>Interactive elements</li>
                                            <li>Video content</li>
                                            <li>External resources and links</li>
                                        </ul>
                                        <p>
                                            The content would be specifically tailored to the learning objectives of this
                                            particular assignment and milestone.
                                        </p>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-xl font-semibold mb-3">Next Steps</h3>
                                    <div className="bg-green-50 p-4 rounded-lg">
                                        <p className="text-gray-700">
                                            After completing this learning material, you should have a solid understanding 
                                            of the concepts covered. Make sure to:
                                        </p>
                                        <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                                            <li>Review the key concepts</li>
                                            <li>Practice with the examples provided</li>
                                            <li>Ask questions if anything is unclear</li>
                                            <li>Proceed to the next assignment when ready</li>
                                        </ul>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Completion Actions */}
                <Card>
                    <CardContent className="py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold mb-1">
                                    {isCompleted ? 'Assignment Completed!' : 'Mark as Complete'}
                                </h3>
                                <p className="text-gray-600 text-sm">
                                    {isCompleted 
                                        ? 'Great job! You can now proceed to the next assignment.'
                                        : 'Mark this assignment as complete when you have finished reading the material.'
                                    }
                                </p>
                            </div>
                            <div className="flex space-x-3">
                                {!isCompleted && (
                                    <Button onClick={handleMarkComplete}>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Mark Complete
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    onClick={() => router.push('/student')}
                                >
                                    Back to Dashboard
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function StudentLearningPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        }>
            <LearningContent />
        </Suspense>
    );
}
