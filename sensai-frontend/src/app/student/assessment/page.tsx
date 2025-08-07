'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ProctoringInterface from '@/components/ProctoringInterface';
import { ArrowLeft, Clock, Shield, AlertTriangle } from 'lucide-react';
import { fetchAssignment, startProctoringSession, submitAssignmentCompletion } from '@/lib/student-api';
import { useSession } from 'next-auth/react';

export default function StudentAssessmentPage() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState<string[]>(['', '', '']);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [startTime] = useState(new Date());
    const [assessmentData, setAssessmentData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const typingStartRef = useRef<Date | null>(null);

    // Get assignment parameters from URL
    const assignmentId = searchParams.get('assignmentId');
    const courseId = searchParams.get('courseId');
    const assignmentTitle = searchParams.get('title');

    const [questions, setQuestions] = useState([
        {
            id: 1,
            title: "Database Normalization",
            question: "Explain the difference between 2NF and 3NF in database normalization. Provide examples.",
            expected_time: 10 // minutes
        },
        {
            id: 2,
            title: "Algorithm Complexity",
            question: "Analyze the time complexity of merge sort and explain why it's O(n log n).",
            expected_time: 8
        },
        {
            id: 3,
            title: "React Hooks",
            question: "Explain the useEffect hook in React. When would you use dependency arrays?",
            expected_time: 7
        }
    ]);

    // Load assessment data based on assignment ID
    useEffect(() => {
        const loadAssessmentData = async () => {
            if (assignmentId) {
                try {
                    // Fetch assignment data using our API utility
                    const assignment = await fetchAssignment(parseInt(assignmentId));
                    if (assignment) {
                        setAssessmentData(assignment);
                        console.log('Assignment loaded:', assignment);
                        
                        // For now, keep using mock questions - in production you'd load from assignment
                        // If you have real questions in the assignment data, use:
                        // if (assignment.questions) {
                        //     setQuestions(assignment.questions);
                        //     setAnswers(new Array(assignment.questions.length).fill(''));
                        // }
                    } else {
                        console.error('No assignment data received');
                    }
                } catch (error) {
                    console.error('Error loading assessment data:', error);
                    // Don't fail completely, just use the default questions
                }
            } else {
                console.log('No assignment ID provided, using default questions');
            }
            setLoading(false);
        };

        loadAssessmentData();
    }, [assignmentId]);

    // Start proctoring session when assessment begins
    useEffect(() => {
        if (!loading && assessmentData && session?.user?.id) {
            initializeProctoringSession();
        }
    }, [loading, assessmentData, session?.user?.id]);

    const initializeProctoringSession = async () => {
        if (!session?.user?.id || !assignmentId) return;
        
        try {
            const proctoringSessionId = await startProctoringSession(
                parseInt(session.user.id),
                parseInt(assignmentId),
                questions[0]?.id
            );
            
            if (proctoringSessionId) {
                setSessionId(proctoringSessionId);
                console.log('Proctoring session started:', proctoringSessionId);
            }
        } catch (error) {
            console.error('Failed to start proctoring session:', error);
        }
    };

    // Track typing patterns for integrity analysis
    const handleAnswerChange = (value: string, questionIndex: number) => {
        if (!typingStartRef.current) {
            typingStartRef.current = new Date();
        }

        const newAnswers = [...answers];
        newAnswers[questionIndex] = value;
        setAnswers(newAnswers);

        // Send typing event to backend for analysis
        sendTypingEvent(value, questionIndex);
    };

    const sendTypingEvent = async (content: string, questionIndex: number) => {
        if (!sessionId) return;

        try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events?user_id=1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    event_type: 'typing_pattern',
                    event_data: {
                        content_length: content.length,
                        question_id: questions[questionIndex].id,
                        timestamp: new Date().toISOString(),
                        typing_speed: calculateTypingSpeed(content)
                    },
                    confidence_score: 0.9,
                    question_id: questions[questionIndex].id
                })
            });
        } catch (error) {
            console.error('Failed to send typing event:', error);
        }
    };

    const calculateTypingSpeed = (content: string) => {
        if (!typingStartRef.current) return 0;
        const timeElapsed = (new Date().getTime() - typingStartRef.current.getTime()) / 1000 / 60; // minutes
        return content.length / timeElapsed; // characters per minute
    };

    // Handle paste events (potential integrity concern)
    const handlePaste = async (e: React.ClipboardEvent, questionIndex: number) => {
        const pasteContent = e.clipboardData.getData('text');
        
        // Send paste event to backend for analysis
        try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events?user_id=1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    event_type: 'copy_paste',
                    event_data: {
                        paste_length: pasteContent.length,
                        question_id: questions[questionIndex].id,
                        content_preview: pasteContent.substring(0, 100) // First 100 chars for analysis
                    },
                    confidence_score: 0.8,
                    question_id: questions[questionIndex].id
                })
            });
        } catch (error) {
            console.error('Failed to send paste event:', error);
        }
    };

    // Submit assessment and trigger AI analysis
    const handleSubmit = async () => {
        if (!sessionId) return;

        try {
            // End the proctoring session
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/sessions/${sessionId}/end`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrity_score: 0.85 // This would be calculated based on events
                })
            });

            // Analyze each answer for potential integrity issues
            for (let i = 0; i < answers.length; i++) {
                if (answers[i].trim()) {
                    await analyzeAnswer(answers[i], questions[i], i);
                }
            }

            setIsSubmitted(true);
        } catch (error) {
            console.error('Failed to submit assessment:', error);
        }
    };

    // AI analysis of student answers
    const analyzeAnswer = async (answer: string, question: any, questionIndex: number) => {
        // Simulate reference answers (in real app, these would come from database)
        const referenceAnswers = [
            "2NF requires that a relation be in 1NF and that all non-prime attributes are fully functionally dependent on the primary key. 3NF requires that a relation be in 2NF and that no non-prime attribute is transitively dependent on the primary key.",
            "Merge sort divides the array into halves recursively (log n levels) and merges them back together (n operations per level), resulting in O(n log n) time complexity.",
            "useEffect is a React hook that performs side effects in function components. The dependency array controls when the effect runs - empty array runs once, no array runs every render."
        ];

        // Check for suspicious patterns
        const suspiciousPatterns = [
            { pattern: /copy|paste|ctrl\+c|ctrl\+v/i, type: 'copy_paste_reference' },
            { pattern: /stackoverflow|github|chatgpt/i, type: 'external_source_reference' },
            { pattern: /.{500,}/s, type: 'unusually_long_answer' }, // Very long answers
        ];

        let flagsToCreate = [];

        // Check answer similarity with reference
        if (calculateSimilarity(answer, referenceAnswers[questionIndex]) > 0.8) {
            flagsToCreate.push({
                flag_type: 'content_similarity',
                severity: 'high',
                confidence_score: 0.92,
                ai_analysis: `High similarity detected with reference answer. Similarity score: ${calculateSimilarity(answer, referenceAnswers[questionIndex]).toFixed(2)}`,
                evidence_data: JSON.stringify({
                    student_answer_length: answer.length,
                    similarity_score: calculateSimilarity(answer, referenceAnswers[questionIndex]),
                    reference_answer_id: questionIndex
                })
            });
        }

        // Check for suspicious patterns
        suspiciousPatterns.forEach(({ pattern, type }) => {
            if (pattern.test(answer)) {
                flagsToCreate.push({
                    flag_type: 'behavioral_anomaly',
                    severity: 'medium',
                    confidence_score: 0.75,
                    ai_analysis: `Suspicious pattern detected: ${type}`,
                    evidence_data: JSON.stringify({
                        pattern_type: type,
                        answer_excerpt: answer.substring(0, 200)
                    })
                });
            }
        });

        // Check completion time
        const timeSpent = (new Date().getTime() - startTime.getTime()) / 1000 / 60; // minutes
        const expectedTime = question.expected_time;
        
        if (timeSpent < expectedTime * 0.3) { // Completed too quickly
            flagsToCreate.push({
                flag_type: 'behavioral_anomaly',
                severity: 'medium',
                confidence_score: 0.73,
                ai_analysis: `Answer completed unusually quickly. Expected: ${expectedTime} min, Actual: ${timeSpent.toFixed(1)} min`,
                evidence_data: JSON.stringify({
                    expected_time_minutes: expectedTime,
                    actual_time_minutes: timeSpent,
                    completion_ratio: timeSpent / expectedTime
                })
            });
        }

        // Create integrity flags
        for (const flag of flagsToCreate) {
            try {
                await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=1`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...flag,
                        session_id: sessionId,
                        question_id: question.id
                    })
                });
            } catch (error) {
                console.error('Failed to create integrity flag:', error);
            }
        }
    };

    // Simple similarity calculation (in production, this would be more sophisticated)
    const calculateSimilarity = (text1: string, text2: string) => {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        const commonWords = words1.filter(word => words2.includes(word));
        return commonWords.length / Math.max(words1.length, words2.length);
    };

    if (isSubmitted) {
        return (
            <div className="container mx-auto py-8">
                <Card className="max-w-2xl mx-auto">
                    <CardContent className="p-8 text-center">
                        <h2 className="text-2xl font-bold mb-4">Assessment Submitted Successfully! ✅</h2>
                        <p className="text-gray-600 mb-4">
                            Your answers have been submitted and are being processed for integrity analysis.
                        </p>
                        <p className="text-sm text-gray-500">
                            Session ID: {sessionId?.substring(0, 8)}...
                        </p>
                        <div className="mt-6">
                            <Button onClick={() => window.location.href = '/test-integrity'}>
                                View Admin Dashboard
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Assessment Header */}
            <div className="bg-white shadow-sm border-b sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push('/student')}
                                className="text-gray-600 hover:text-gray-800"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Dashboard
                            </Button>
                            <div className="h-6 w-px bg-gray-300"></div>
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">
                                    {assignmentTitle || assessmentData?.title || 'Programming Assessment'}
                                </h1>
                                <p className="text-sm text-gray-600">
                                    {courseId || assessmentData?.course_title || 'Computer Science Fundamentals'}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            {/* Integrity monitoring indicator */}
                            <div className="flex items-center space-x-2 text-sm text-purple-600">
                                <Shield className="w-4 h-4" />
                                <span>Proctored</span>
                            </div>
                            
                            {/* Question progress */}
                            <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                                Question {currentQuestion + 1} of {questions.length}
                            </div>
                            
                            {/* Timer */}
                            <div className="flex items-center space-x-2 text-sm text-blue-600">
                                <Clock className="w-4 h-4" />
                                <span>
                                    {Math.floor((new Date().getTime() - startTime.getTime()) / 60000)} min
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto py-8">
                {/* Proctoring Interface - minimized mode */}
                <ProctoringInterface
                    taskId={parseInt(assignmentId || '1')}
                    questionId={questions[currentQuestion]?.id}
                    minimized={true}
                />

                <div className="max-w-4xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>{questions[currentQuestion].title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-gray-700">
                                    {questions[currentQuestion].question}
                                </p>
                                
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Your Answer:
                                    </label>
                                    <textarea
                                        className="w-full h-48 p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Type your answer here..."
                                        value={answers[currentQuestion] || ''}
                                        onChange={(e) => handleAnswerChange(e.target.value, currentQuestion)}
                                        onPaste={(e) => handlePaste(e, currentQuestion)}
                                    />
                                    <p className="text-sm text-gray-500 mt-1">
                                        Expected time: {questions[currentQuestion].expected_time} minutes
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between mt-6">
                                <Button
                                    variant="outline"
                                    disabled={currentQuestion === 0}
                                    onClick={() => setCurrentQuestion(currentQuestion - 1)}
                                >
                                    Previous
                                </Button>
                                
                                {currentQuestion < questions.length - 1 ? (
                                    <Button
                                        onClick={() => setCurrentQuestion(currentQuestion + 1)}
                                    >
                                        Next Question
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleSubmit}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        Submit Assessment
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Progress indicator */}
                    <div className="mt-4 bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}