'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ProctoringInterface from '@/components/ProctoringInterface';
import MediaPipeProctoringInterface from '@/components/MediaPipeProctoringInterface';
import FullscreenWarningSystem from '@/components/FullscreenWarningSystem';
import { ArrowLeft, Clock, Shield, AlertTriangle, CheckCircle, Camera, Mic, Eye } from 'lucide-react';
import { fetchAssignment, startProctoringSession, submitAssignmentCompletion } from '@/lib/student-api';
import { useSession } from 'next-auth/react';

function AssessmentContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState<string[]>(['', '', '']);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [startTime] = useState(new Date());
    const [assessmentData, setAssessmentData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const typingStartRef = useRef<Date | null>(null);
    
    // Enhanced monitoring state
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [rapidTypingDetected, setRapidTypingDetected] = useState(false);
    const [suspiciousActivity, setSuspiciousActivity] = useState(false);
    const [lastTypingTime, setLastTypingTime] = useState<number>(0);
    const [typingBuffer, setTypingBuffer] = useState<string>('');
    
    // MediaPipe proctoring state
    const [mediaPipeViolations, setMediaPipeViolations] = useState<any[]>([]);
    const [mediaPipeActive, setMediaPipeActive] = useState(false);
    
    // Audio recording state (simplified for full test recording)
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const fullTestAudioChunks = useRef<Blob[]>([]);
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

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

    // Initialize camera for monitoring
    useEffect(() => {
        const initializeCamera = async () => {
            try {
                // Check if permissions were already granted in setup
                const permissionsData = localStorage.getItem('cameraPermissions');
                if (permissionsData) {
                    const permissions = JSON.parse(permissionsData);
                    if (permissions.camera && permissions.microphone) {
                        const stream = await navigator.mediaDevices.getUserMedia({
                            video: { width: 320, height: 240, facingMode: 'user' },
                            audio: true
                        });
                        setCameraStream(stream);
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                        }

                        // Activate MediaPipe proctoring
                        setMediaPipeActive(true);

                        // Initialize audio recording for full test
                        await initializeAudioRecording();
                    }
                }
            } catch (error) {
                console.error('Failed to initialize camera:', error);
                addWarning('Camera access failed. Please check your settings.');
            }
        };

        if (!loading && assessmentData) {
            initializeCamera();
        }

        // Cleanup camera stream and voice monitoring on unmount
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
            }
            stopAudioRecording();
        };
    }, [loading, assessmentData]);

    // Auto-redirect after submission
    useEffect(() => {
        if (isSubmitted) {
            const timer = setTimeout(() => {
                localStorage.removeItem('currentAssignment');
                localStorage.removeItem('rulesAccepted');
                localStorage.removeItem('cameraSetupComplete');
                router.push('/student');
            }, 10000); // 10 seconds

            return () => clearTimeout(timer);
        }
    }, [isSubmitted, router]);

    // Additional tab switching and multiple tabs monitoring
    useEffect(() => {
        if (isSubmitting || isSubmitted) return;

        let tabSwitchCount = 0;
        let lastVisibilityChange = Date.now();

        const handleVisibilityChange = () => {
            const now = Date.now();
            const timeSinceLastChange = now - lastVisibilityChange;
            
            if (document.hidden) {
                tabSwitchCount++;
                
                // Rapid tab switching detection (multiple switches in short time)
                if (timeSinceLastChange < 2000 && tabSwitchCount > 3) {
                    setWarnings(prev => {
                        const newWarnings = [...prev, '⚠️ Rapid tab switching detected - suspicious behavior flagged'];
                        return newWarnings.slice(-3);
                    });
                    
                    // Send integrity event
                    if (sessionId) {
                        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                session_id: sessionId,
                                event_type: 'rapid_tab_switching',
                                event_data: {
                                    switch_count: tabSwitchCount,
                                    time_window: timeSinceLastChange,
                                    timestamp: new Date().toISOString(),
                                    question_index: currentQuestion
                                }
                            })
                        }).catch(console.error);
                    }
                } else {
                    setWarnings(prev => {
                        const newWarnings = [...prev, '⚠️ Tab switch detected - please stay on the test page'];
                        return newWarnings.slice(-3);
                    });
                    
                    // Send integrity event
                    if (sessionId) {
                        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                session_id: sessionId,
                                event_type: 'tab_switch',
                                event_data: {
                                    timestamp: new Date().toISOString(),
                                    question_index: currentQuestion,
                                    total_switches: tabSwitchCount
                                }
                            })
                        }).catch(console.error);
                    }
                }
            }
            
            lastVisibilityChange = now;
        };

        const handleFocusChange = () => {
            if (!document.hasFocus()) {
                setWarnings(prev => {
                    const newWarnings = [...prev, '⚠️ Browser window lost focus - multiple applications detected'];
                    return newWarnings.slice(-3);
                });
                
                // Send integrity event
                if (sessionId) {
                    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_id: sessionId,
                            event_type: 'window_focus_lost',
                            event_data: {
                                timestamp: new Date().toISOString(),
                                question_index: currentQuestion
                            }
                        })
                    }).catch(console.error);
                }
            }
        };

        const handlePageHide = () => {
            setWarnings(prev => {
                const newWarnings = [...prev, '⚠️ Page navigation detected - attempting to leave test'];
                return newWarnings.slice(-3);
            });
            
            // Send integrity event
            if (sessionId) {
                fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionId,
                        event_type: 'page_navigation_attempt',
                        event_data: {
                            timestamp: new Date().toISOString(),
                            question_index: currentQuestion
                        }
                    })
                }).catch(console.error);
            }
        };

        // Add event listeners
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocusChange);
        window.addEventListener('blur', handleFocusChange);
        window.addEventListener('pagehide', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocusChange);
            window.removeEventListener('blur', handleFocusChange);
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, [isSubmitting, isSubmitted, currentQuestion, sessionId]);

    // Enhanced monitoring functions
    const addWarning = (message: string) => {
        setWarnings(prev => {
            const newWarnings = [...prev, message];
            // Keep only last 3 warnings
            return newWarnings.slice(-3);
        });
        
        // Auto-remove warning after 10 seconds
        setTimeout(() => {
            setWarnings(prev => prev.filter(w => w !== message));
        }, 10000);
    };

    const detectRapidTyping = (newLength: number) => {
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTypingTime;
        
        if (timeDiff < 100 && newLength - typingBuffer.length > 50) {
            // More than 50 characters in less than 100ms = ~3000 WPM (impossible)
            setRapidTypingDetected(true);
            addWarning('⚠️ Rapid typing detected. Please type at a normal pace.');
            
            // Send event to backend
            sendIntegrityEvent('typing_anomaly', {
                characters_per_second: (newLength - typingBuffer.length) / (timeDiff / 1000),
                timestamp: currentTime,
                question_id: questions[currentQuestion].id
            });
            
            setTimeout(() => setRapidTypingDetected(false), 5000);
        }
        
        setLastTypingTime(currentTime);
        setTypingBuffer(newLength.toString());
    };

    const detectSuspiciousPasteEvent = (pastedText: string) => {
        // Check for very large paste events
        if (pastedText.length > 200) {
            addWarning('⚠️ Large text paste detected. Please type your own answers.');
            setSuspiciousActivity(true);
            
            // Send event to backend
            sendIntegrityEvent('paste_burst', {
                paste_length: pastedText.length,
                content_preview: pastedText.substring(0, 100),
                question_id: questions[currentQuestion].id
            });
            
            setTimeout(() => setSuspiciousActivity(false), 10000);
        }
        
        // Check for multiple rapid pastes
        const recentPasteEvents = JSON.parse(localStorage.getItem('recentPastes') || '[]');
        recentPasteEvents.push(Date.now());
        
        // Keep only pastes from last 30 seconds
        const recentPastes = recentPasteEvents.filter((time: number) => Date.now() - time < 30000);
        localStorage.setItem('recentPastes', JSON.stringify(recentPastes));
        
        if (recentPastes.length > 3) {
            addWarning('⚠️ Multiple paste events detected. This may indicate academic dishonesty.');
            
            // Send event to backend
            sendIntegrityEvent('paste_burst', {
                paste_count: recentPastes.length,
                timeframe: '30_seconds',
                question_id: questions[currentQuestion].id
            });
        }
    };

    // Throttle integrity event sending to prevent overwhelming the backend
    const lastIntegrityEventTime = useRef<number>(0);
    const INTEGRITY_EVENT_THROTTLE_MS = 1000; // Minimum 1 second between events

    const sendIntegrityEvent = async (eventType: string, eventData: any) => {
        if (!sessionId) return;

        // Throttle requests to prevent overwhelming the backend
        const now = Date.now();
        if (now - lastIntegrityEventTime.current < INTEGRITY_EVENT_THROTTLE_MS) {
            console.log('Throttling integrity event:', eventType);
            return;
        }
        lastIntegrityEventTime.current = now;

        try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events?user_id=${session?.user?.id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    event_type: eventType,
                    event_data: eventData,
                    confidence_score: 0.85,
                    question_id: questions[currentQuestion].id
                })
            });
        } catch (error) {
            console.error('Failed to send integrity event:', error);
        }
    };

    // MediaPipe violation handler
    const handleMediaPipeViolation = async (violation: any) => {
        console.log('MediaPipe violation detected:', violation);
        
        // Add to local violations list
        setMediaPipeViolations(prev => [violation, ...prev.slice(0, 49)]);
        
        // Add visual warning
        addWarning(`🎥 ${violation.description}`);
        
        // Send to backend as integrity flag
        try {
            if (sessionId) {
                const flagData = {
                    flag_type: 'proctoring_violation',
                    severity: violation.severity,
                    confidence_score: violation.confidence,
                    ai_analysis: `MediaPipe Analysis: ${violation.description}. Detection confidence: ${Math.round(violation.confidence * 100)}%`,
                    evidence_data: {
                        mediapipe_violation_type: violation.type,
                        detection_confidence: violation.confidence,
                        violation_evidence: violation.evidence,
                        timestamp: violation.timestamp,
                        question_id: questions[currentQuestion]?.id
                    },
                    session_id: sessionId,
                    task_id: parseInt(assignmentId || '0')
                };

                await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${session?.user?.id || 1}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(flagData)
                });
            }
        } catch (error) {
            console.error('Failed to log MediaPipe violation:', error);
        }
    };

    // Initialize audio recording for the entire test duration
    const initializeAudioRecording = async () => {
        try {
            console.log('🎤 Initializing full test audio recording...');
            
            // Get microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                } 
            });
            
            setAudioStream(stream);
            
            // Create MediaRecorder with the best available format
            let recorder: MediaRecorder;
            
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                recorder = new MediaRecorder(stream, { 
                    mimeType: 'audio/webm;codecs=opus',
                    audioBitsPerSecond: 128000 
                });
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                recorder = new MediaRecorder(stream, { 
                    mimeType: 'audio/webm',
                    audioBitsPerSecond: 128000 
                });
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                recorder = new MediaRecorder(stream, { 
                    mimeType: 'audio/mp4',
                    audioBitsPerSecond: 128000 
                });
            } else {
                recorder = new MediaRecorder(stream);
            }
            
            // Clear any previous recordings
            fullTestAudioChunks.current = [];
            
            // Handle audio data
            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    fullTestAudioChunks.current.push(event.data);
                    console.log(`📹 Audio chunk recorded: ${event.data.size} bytes, total chunks: ${fullTestAudioChunks.current.length}`);
                }
            };
            
            // Handle recording completion
            recorder.onstop = () => {
                console.log(`🎬 Audio recording stopped. Total chunks: ${fullTestAudioChunks.current.length}`);
                if (fullTestAudioChunks.current.length > 0) {
                    processTestAudioWithSarvamAndOpenAI();
                }
                
                // Clean up stream
                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                    setAudioStream(null);
                }
            };
            
            // Start recording continuously
            recorder.start(2000); // 2-second chunks for stability
            setMediaRecorder(recorder);
            setIsRecordingAudio(true);
            
            console.log('✅ Full test audio recording started successfully');
            addWarning('🎤 Audio recording started for academic integrity monitoring');
            
        } catch (error) {
            console.error('❌ Failed to initialize audio recording:', error);
            addWarning('⚠️ Could not start audio recording. Please allow microphone access.');
        }
    };



    const stopAudioRecording = () => {
        console.log('🛑 Stopping audio recording...');
        setIsRecordingAudio(false);
        
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); // This will trigger processing
        }
        
        setMediaRecorder(null);
    };

    // Process full test audio using Sarvam AI → OpenAI pipeline
    const processTestAudioWithSarvamAndOpenAI = async () => {
        if (fullTestAudioChunks.current.length === 0) {
            console.log('⚠️ No audio chunks recorded');
            return;
        }

        try {
            console.log('🔄 Processing full test audio with Sarvam AI → OpenAI pipeline...');
            
            // Step 1: Combine all audio chunks into a single blob
            const combinedBlob = new Blob(fullTestAudioChunks.current, { 
                type: fullTestAudioChunks.current[0]?.type || 'audio/webm' 
            });
            
            console.log(`🎵 Combined audio size: ${Math.round(combinedBlob.size / 1024)} KB`);
            
            // Step 2: Convert to base64 for API transmission
            const arrayBuffer = await combinedBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Convert to base64 using a more efficient method for large files
            let binaryString = '';
            const chunkSize = 8192; // Process in chunks to avoid stack overflow
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, i + chunkSize);
                binaryString += String.fromCharCode(...chunk);
            }
            const base64Audio = btoa(binaryString);
            
            // Step 3: Send to our Sarvam → OpenAI processing API
            const response = await fetch('/api/sarvam/process-test-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio_data: base64Audio,
                    audio_format: combinedBlob.type,
                    session_id: sessionId,
                    user_id: session?.user?.id || '1',
                    test_duration_minutes: Math.round((Date.now() - startTime.getTime()) / 60000),
                    assignment_id: assignmentId
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Audio processing completed:', result);
                
                // Create integrity flag with the results
                await createComprehensiveAudioIntegrityFlag(result);
                
                // Show user feedback based on results
                if (result.cheating_detected) {
                    addWarning(`🚨 AUDIO ANALYSIS: ${result.cheating_summary}`);
                }
                
                if (result.suspicious_phrases && result.suspicious_phrases.length > 0) {
                    addWarning(`⚠️ Suspicious content detected in audio`);
                }
                
                if (result.transcription_english && result.transcription_english.length > 50) {
                    console.log('📝 Full English transcription:', result.transcription_english);
                }
                
            } else {
                console.error('❌ Audio processing failed:', response.statusText);
                await createBasicAudioRecordingFlag();
            }
            
        } catch (error) {
            console.error('❌ Error processing test audio:', error);
            await createBasicAudioRecordingFlag();
        } finally {
            // Clear the recording buffer
            fullTestAudioChunks.current = [];
        }
    };

    // Create comprehensive integrity flag based on Sarvam + OpenAI analysis
    const createComprehensiveAudioIntegrityFlag = async (result: any) => {
        if (!sessionId) return;

        const flagData = {
            flag_type: 'proctoring_violation',
            severity: result.cheating_detected ? 'high' : 
                     (result.suspicious_phrases && result.suspicious_phrases.length > 0 ? 'medium' : 'low'),
            confidence_score: result.overall_confidence || 0.85,
            ai_analysis: `SARVAM + OpenAI Audio Analysis: ${result.cheating_detected ? '🚨 CHEATING DETECTED' : '✅ No cheating detected'}. 
            
Original Language: ${result.detected_language || 'Unknown'}
English Translation: "${result.transcription_english || 'No speech detected'}"
OpenAI Analysis: ${result.openai_analysis || 'Analysis completed'}
Suspicious Phrases: [${result.suspicious_phrases ? result.suspicious_phrases.join(', ') : 'None'}]`,
            evidence_data: {
                // Sarvam AI Results
                full_transcription: result.transcription_english,
                original_transcription: result.transcription_original,
                detected_language: result.detected_language,
                sarvam_confidence: result.sarvam_confidence,
                
                // OpenAI Analysis Results  
                cheating_detected: result.cheating_detected,
                cheating_summary: result.cheating_summary,
                suspicious_phrases: result.suspicious_phrases || [],
                openai_analysis: result.openai_analysis,
                openai_confidence: result.openai_confidence,
                
                // Technical Details
                audio_duration_seconds: result.audio_duration_seconds,
                test_duration_minutes: result.test_duration_minutes,
                overall_confidence: result.overall_confidence,
                processing_pipeline: 'Sarvam AI → OpenAI',
                audio_quality: result.audio_quality || 'good'
            },
            session_id: sessionId,
            task_id: parseInt(assignmentId || '0')
        };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${session?.user?.id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flagData)
            });
            
            if (response.ok) {
                console.log('✅ Comprehensive audio integrity flag created successfully');
            } else {
                console.error('❌ Failed to create audio integrity flag:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Error creating audio integrity flag:', error);
        }
    };

    // Create basic recording flag if analysis fails
    const createBasicAudioRecordingFlag = async () => {
        if (!sessionId) return;

        const flagData = {
            flag_type: 'proctoring_violation',
            severity: 'low',
            confidence_score: 0.3,
            ai_analysis: 'Audio was recorded during test but analysis pipeline failed. Manual review recommended.',
            evidence_data: {
                audio_recorded: true,
                analysis_failed: true,
                recording_chunks: fullTestAudioChunks.current.length,
                failure_reason: 'Sarvam AI or OpenAI processing failed'
            },
            session_id: sessionId,
            task_id: parseInt(assignmentId || '0')
        };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${session?.user?.id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flagData)
            });
            
            if (response.ok) {
                console.log('📝 Basic audio recording flag created');
            }
        } catch (error) {
            console.error('❌ Error creating basic audio flag:', error);
        }
    };

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

        // Enhanced monitoring: detect rapid typing
        detectRapidTyping(value.length);

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
        
        // Enhanced monitoring: detect suspicious paste events
        detectSuspiciousPasteEvent(pasteContent);
        
        // Send paste event to backend for analysis
        try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/events?user_id=${session?.user?.id || 1}`, {
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

    // OpenAI Plagiarism Check
    const checkPlagiarismWithOpenAI = async (answer: string, questionTitle: string): Promise<any> => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/ai/check-plagiarism`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: answer,
                    question: questionTitle,
                    userId: session?.user?.id
                })
            });

            if (response.ok) {
                return await response.json();
            } else {
                // Fallback to local analysis if API fails
                return null;
            }
        } catch (error) {
            console.error('OpenAI plagiarism check failed:', error);
            return null;
        }
    };

    // Submit assessment and trigger comprehensive AI analysis for all answers
    // This function will:
    // 1. Stop proctoring (camera, audio, warnings)
    // 2. End the proctoring session
    // 3. Analyze ALL answers in parallel using both OpenAI and Nebius AI
    // 4. Create integrity flags in the dashboard for any suspicious patterns
    // 5. Mark assessment as submitted
    const handleSubmit = async () => {
        if (!sessionId || isSubmitting) return;

        console.log('🚀 Starting assessment submission...');
        setIsSubmitting(true);

        try {
            // Stop camera stream and voice monitoring
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                setCameraStream(null);
            }
            
            // Stop MediaPipe monitoring
            setMediaPipeActive(false);
            
            stopAudioRecording();

            // Clear warning timers
            setWarnings([]);

            console.log('🔄 Ending proctoring session...');
            // End the proctoring session
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/sessions/${sessionId}/end`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrity_score: 0.85 // This would be calculated based on events
                })
            });

            console.log('✅ Proctoring session ended successfully');

            // Analyze all answers for potential integrity issues and plagiarism
            console.log('🔍 Starting comprehensive analysis for all answers...', { 
                totalAnswers: answers.length,
                nonEmptyAnswers: answers.filter(a => a.trim()).length 
            });
            
            const analysisPromises = [];
            for (let i = 0; i < answers.length; i++) {
                if (answers[i].trim()) {
                    // Create promise for parallel processing
                    const analysisPromise = (async () => {
                        try {
                            console.log(`🔍 Starting analysis for question ${i + 1}...`);
                            
                            // Check plagiarism with OpenAI first (with timeout)
                            const plagiarismResult = await Promise.race([
                                checkPlagiarismWithOpenAI(answers[i], questions[i].title),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI timeout')), 10000))
                            ]);
                            
                            // Analyze answer with enhanced detection (with timeout)
                            await Promise.race([
                                analyzeAnswer(answers[i], questions[i], i, plagiarismResult),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Nebius timeout')), 10000))
                            ]);
                            
                            console.log(`✅ Analysis completed for question ${i + 1}`);
                        } catch (error) {
                            console.error(`❌ Analysis failed for question ${i + 1}:`, error);
                            // Don't let analysis failure prevent submission
                        }
                    })();
                    
                    analysisPromises.push(analysisPromise);
                }
            }
            
            // Wait for all analysis to complete (with overall timeout)
            try {
                await Promise.race([
                    Promise.all(analysisPromises),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Overall analysis timeout')), 30000))
                ]);
                console.log('🎉 All answer analyses completed!');
            } catch (error) {
                console.error('⚠️ Some analyses failed or timed out:', error);
                // Continue with submission even if analysis fails
            }

            console.log('✅ Setting assessment as submitted...');
            setIsSubmitted(true);
            console.log('🎉 Assessment submission complete!');
        } catch (error) {
            console.error('Failed to submit assessment:', error);
            // Still mark as submitted to prevent user from being stuck
            setIsSubmitted(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Create fallback flag when analysis service is unavailable
    const createFallbackAnalysisFlag = async (answer: string, question: any, questionIndex: number, errorStatus: string | number) => {
        try {
            const flagData = {
                flag_type: 'analysis_service_unavailable',
                severity: 'medium',
                confidence_score: 0.8,
                ai_analysis: `Analysis service unavailable (${errorStatus}). Answer recorded: ${answer.length} characters, ${answer.trim().split(/\s+/).length} words.`,
                evidence_data: {
                    answer_length: answer.length,
                    word_count: answer.trim().split(/\s+/).length,
                    error_status: errorStatus,
                    question_index: questionIndex + 1,
                    submission_time: new Date().toISOString()
                },
                session_id: sessionId,
                question_id: question.id
            };

            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${session?.user?.id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flagData)
            });
        } catch (error) {
            console.error('Failed to create fallback analysis flag:', error);
        }
    };

    // AI analysis of student answers
    const analyzeAnswer = async (answer: string, question: any, questionIndex: number, plagiarismResult?: any) => {
        console.log(`🔍 Analyzing answer ${questionIndex + 1}/${questions.length}`, {
            questionTitle: question.title,
            answerLength: answer.length,
            wordCount: answer.trim().split(/\s+/).filter(word => word.length > 0).length
        });

        // First, run our Nebius AI analysis for comprehensive cheating detection
        try {
            const timeSpent = (new Date().getTime() - startTime.getTime()) / 1000; // seconds
            const wordCount = answer.trim().split(/\s+/).filter(word => word.length > 0).length;
            const characterCount = answer.length;

            console.log(`📡 Sending request to Nebius AI for Q${questionIndex + 1}...`);

            const analysisResponse = await fetch('/api/analyze-answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    answer,
                    questionId: question.id?.toString() || questionIndex.toString(),
                    userId: session?.user?.id?.toString() || '1',
                    questionText: question.question || question.title,
                    submissionContext: {
                        timeSpent,
                        wordCount,
                        characterCount,
                        submissionTime: new Date().toISOString(),
                        questionIndex: questionIndex + 1,
                        totalQuestions: questions.length
                    }
                })
            });

            console.log(`📡 Response received for Q${questionIndex + 1}:`, analysisResponse.status);

            if (analysisResponse.ok) {
                const analysisResult = await analysisResponse.json();
                console.log(`✅ Nebius AI analysis completed for Q${questionIndex + 1}`, {
                    cheatingProbability: analysisResult.analysis?.cheating_probability,
                    confidenceLevel: analysisResult.analysis?.confidence_level,
                    redFlags: analysisResult.analysis?.red_flags?.length,
                    flagsCreated: analysisResult.integrity_flags_created
                });
                return analysisResult;
            } else {
                const errorText = await analysisResponse.text();
                console.warn(`⚠️ Nebius AI analysis failed for Q${questionIndex + 1} (${analysisResponse.status}). Continuing without analysis.`);
                
                // Create a fallback flag indicating the analysis service was unavailable
                await createFallbackAnalysisFlag(answer, question, questionIndex, analysisResponse.status);
                return null;
            }
        } catch (error) {
            console.warn(`⚠️ Nebius AI analysis error for Q${questionIndex + 1}:`, error);
            // Create a fallback flag indicating the analysis failed
            await createFallbackAnalysisFlag(answer, question, questionIndex, 'timeout_or_error');
            return null;
        }

        // Continue with existing analysis logic...
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
            { pattern: /.{500,}/, type: 'unusually_long_answer' }, // Very long answers
        ];

        let flagsToCreate = [];

        // Check OpenAI plagiarism results first
        if (plagiarismResult) {
            if (plagiarismResult.isPlagiarized) {
                flagsToCreate.push({
                    flag_type: 'content_similarity',
                    severity: 'high',
                    confidence_score: plagiarismResult.confidence || 0.95,
                    ai_analysis: `OpenAI detected potential plagiarism: ${plagiarismResult.reason}. Similarity score: ${plagiarismResult.similarityScore || 'N/A'}`,
                    evidence_data: {
                        openai_result: plagiarismResult,
                        answer_length: answer.length,
                        detected_sources: plagiarismResult.sources || [],
                        plagiarism_type: plagiarismResult.type || 'content_match'
                    }
                });
            }

            if (plagiarismResult.suspiciousPatterns && plagiarismResult.suspiciousPatterns.length > 0) {
                flagsToCreate.push({
                    flag_type: 'behavioral_anomaly',
                    severity: 'medium',
                    confidence_score: 0.8,
                    ai_analysis: `OpenAI detected suspicious patterns: ${plagiarismResult.suspiciousPatterns.join(', ')}`,
                    evidence_data: {
                        suspicious_patterns: plagiarismResult.suspiciousPatterns,
                        answer_excerpt: answer.substring(0, 200)
                    }
                });
            }
        }

        // Check answer similarity with reference
        if (calculateSimilarity(answer, referenceAnswers[questionIndex]) > 0.8) {
            flagsToCreate.push({
                flag_type: 'content_similarity',
                severity: 'high',
                confidence_score: 0.92,
                ai_analysis: `High similarity detected with reference answer. Similarity score: ${calculateSimilarity(answer, referenceAnswers[questionIndex]).toFixed(2)}`,
                evidence_data: {
                    student_answer_length: answer.length,
                    similarity_score: calculateSimilarity(answer, referenceAnswers[questionIndex]),
                    reference_answer_id: questionIndex
                }
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
                    evidence_data: {
                        pattern_type: type,
                        answer_excerpt: answer.substring(0, 200)
                    }
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
                evidence_data: {
                    expected_time_minutes: expectedTime,
                    actual_time_minutes: timeSpent,
                    completion_ratio: timeSpent / expectedTime
                }
            });
        }

        // Create integrity flags
        for (const flag of flagsToCreate) {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${session?.user?.id || 1}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...flag,
                        session_id: sessionId,
                        question_id: question.id
                    })
                });
                
                if (response.ok) {
                    console.log('Integrity flag created successfully:', flag.flag_type);
                } else {
                    console.error('Failed to create integrity flag:', response.statusText);
                }
            } catch (error) {
                console.error('Failed to create integrity flag:', error);
            }
        }

        // Create a general test completion flag if no specific flags were created
        if (flagsToCreate.length === 0) {
            try {
                await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${session?.user?.id || 1}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        flag_type: 'test_completion',
                        severity: 'low',
                        confidence_score: 0.95,
                        ai_analysis: `Test completed successfully. Answer length: ${answer.length} characters. Time taken: ${timeSpent.toFixed(1)} minutes.`,
                        evidence_data: {
                            answer_length: answer.length,
                            completion_time: timeSpent,
                            question_title: question.title
                        },
                        session_id: sessionId,
                        question_id: question.id
                    })
                });
                console.log('Test completion flag created');
            } catch (error) {
                console.error('Failed to create test completion flag:', error);
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
        // Clear localStorage data
        setTimeout(() => {
            localStorage.removeItem('currentAssignment');
            localStorage.removeItem('rulesAccepted');
            localStorage.removeItem('cameraSetupComplete');
            localStorage.removeItem('cameraPermissions');
            localStorage.removeItem('recentPastes');
        }, 5000);

        return (
            <div className="flex items-center justify-center min-h-screen bg-black">
                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-8 border-b-2 border-green-500 border-opacity-70 max-w-2xl mx-auto text-center">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                    <h2 className="mb-4 text-2xl font-light text-white">Assessment Submitted Successfully!</h2>
                    <p className="mb-4 text-gray-400">
                        Your answers have been submitted and are being processed with AI-powered integrity analysis.
                    </p>
                    <div className="p-4 mb-6 bg-blue-900 border border-blue-500 rounded-lg">
                        <p className="text-sm text-blue-200">
                            <strong>What happens next:</strong><br />
                            • Your responses are analyzed for plagiarism and integrity<br />
                            • Results are reviewed by our academic team<br />
                            • You'll receive an email with your detailed report soon
                        </p>
                    </div>
                    <p className="mb-6 text-sm text-gray-500">
                        Session ID: {sessionId?.substring(0, 8)}...
                    </p>
                    <div className="space-y-3">
                        <Button 
                            onClick={() => {
                                // Clean up and redirect
                                localStorage.removeItem('currentAssignment');
                                localStorage.removeItem('rulesAccepted');
                                localStorage.removeItem('cameraSetupComplete');
                                router.push('/student');
                            }}
                            className="w-full bg-green-600 hover:bg-green-700"
                        >
                            Return to Dashboard
                        </Button>
                    </div>
                    <p className="mt-4 text-xs text-gray-500">
                        You will be automatically redirected to your dashboard in 10 seconds...
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            {/* Assessment Header */}
            <div className="bg-[#1A1A1A] border-b border-gray-800 sticky top-0 z-10">
                <div className="max-w-5xl px-4 mx-auto sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between py-4">
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
                            <div className="w-px h-6 bg-gray-600"></div>
                            <div>
                                <h1 className="text-xl font-light text-white">
                                    {assignmentTitle || assessmentData?.title || 'Programming Assessment'}
                                </h1>
                                <p className="text-sm text-gray-400">
                                    {courseId || assessmentData?.course_title || 'Computer Science Fundamentals'}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            {/* Integrity monitoring indicator */}
                            <div className="flex items-center space-x-2 text-sm text-purple-400">
                                <Shield className="w-4 h-4" />
                                <span>Proctored</span>
                            </div>
                            
                            {/* Question progress */}
                            <div className="px-3 py-1 text-sm text-gray-300 bg-gray-800 rounded-full">
                                Question {currentQuestion + 1} of {questions.length}
                            </div>
                            
                            {/* Timer */}
                            <div className="flex items-center space-x-2 text-sm text-blue-400">
                                <Clock className="w-4 h-4" />
                                <span>
                                    {Math.floor((new Date().getTime() - startTime.getTime()) / 60000)} min
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container py-8 mx-auto">
                {/* Camera Feed - Small floating window */}
                {cameraStream && (
                    <div className="fixed top-20 right-4 z-40 bg-[#1A1A1A] border border-gray-600 rounded-lg overflow-hidden shadow-lg">
                        <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-600">
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                <span className="text-xs text-gray-300">Live</span>
                            </div>
                            <Camera className="w-4 h-4 text-gray-400" />
                        </div>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            className="object-cover w-48 h-36"
                        />
                        <div className="flex items-center justify-between p-1 bg-gray-800">
                            <span className={`text-xs ${cameraStream ? 'text-green-400' : 'text-red-400'}`}>
                                {cameraStream ? 'Monitoring Active' : ' Monitoring'}
                            </span>
                            {isRecordingAudio && (
                                <div className="flex items-center space-x-1">
                                    <Mic className="w-3 h-3 text-red-400" />
                                    <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                                    <span className="text-xs text-red-400">Recording Audio</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Warning System */}
                {warnings.length > 0 && (
                    <div className="fixed z-50 space-y-2 transform -translate-x-1/2 top-4 left-1/2">
                        {warnings.map((warning, index) => (
                            <div
                                key={index}
                                className="flex items-center px-4 py-3 space-x-3 text-yellow-200 bg-yellow-900 border border-yellow-500 rounded-lg shadow-lg"
                            >
                                <AlertTriangle className="flex-shrink-0 w-5 h-5" />
                                <span className="text-sm">{warning}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Fullscreen Warning System */}
                <FullscreenWarningSystem
                    isTestActive={!isSubmitting && !isSubmitted}
                    onViolationDetected={(violationType) => {
                        let warningMessage = `Violation detected: ${violationType.replace('_', ' ')}`;
                        
                        // Specific warnings for different violation types
                        if (violationType === 'visibility_change') {
                            warningMessage = 'Tab switching detected - please stay on the test tab';
                        } else if (violationType === 'window_blur') {
                            warningMessage = 'Window focus lost - multiple applications detected';
                        } else if (violationType === 'fullscreen_exit') {
                            warningMessage = 'Fullscreen mode exited - please return to fullscreen';
                        } else if (violationType === 'key_combination') {
                            warningMessage = 'Prohibited key combination used';
                        }
                        
                        addWarning(warningMessage);
                        sendIntegrityEvent('proctoring_violation', {
                            violation_type: violationType,
                            timestamp: new Date().toISOString(),
                            question_index: currentQuestion,
                            description: warningMessage
                        });
                    }}
                    onReturnToCompliance={() => {
                        console.log('User returned to compliance');
                    }}
                    maxViolations={5}
                />

                {/* Proctoring Interface - minimized mode */}
                <ProctoringInterface
                    taskId={parseInt(assignmentId || '1')}
                    questionId={questions[currentQuestion]?.id}
                    minimized={true}
                />

                {/* MediaPipe Proctoring Interface */}
                <MediaPipeProctoringInterface
                    isActive={mediaPipeActive}
                    sessionId={sessionId}
                    userId={session?.user?.id || '1'}
                    onViolationDetected={handleMediaPipeViolation}
                    videoRef={videoRef}
                />

                <div className="max-w-4xl mx-auto">
                    <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-indigo-500 border-opacity-70">
                        <div className="mb-6">
                            <h2 className="mb-4 text-xl font-light text-white">{questions[currentQuestion].title}</h2>
                        </div>
                        <div className="space-y-4">
                            <p className="text-gray-300">
                                {questions[currentQuestion].question}
                            </p>
                            
                            <div>
                                <label className="block mb-2 text-sm font-light text-white">
                                    Your Answer:
                                </label>
                                <textarea
                                    className="w-full h-48 p-4 text-white placeholder-gray-400 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Type your answer here..."
                                    value={answers[currentQuestion] || ''}
                                    onChange={(e) => handleAnswerChange(e.target.value, currentQuestion)}
                                    onPaste={(e) => handlePaste(e, currentQuestion)}
                                />
                                <p className="mt-1 text-sm text-gray-400">
                                    Expected time: {questions[currentQuestion].expected_time} minutes
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-between mt-6">
                            <Button
                                variant="outline"
                                disabled={currentQuestion === 0}
                                onClick={() => setCurrentQuestion(currentQuestion - 1)}
                                className="text-gray-300 border-gray-600 hover:bg-gray-700"
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
                                    disabled={isSubmitting}
                                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 mr-2 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                                            Processing Submission...
                                        </>
                                    ) : (
                                        'Submit Assessment'
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Progress indicator */}
                    <div className="h-2 mt-4 bg-gray-700 rounded-full">
                        <div
                            className="h-2 transition-all duration-300 bg-indigo-500 rounded-full"
                            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function StudentAssessmentPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
            </div>
        }>
            <AssessmentContent />
        </Suspense>
    );
}