import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AlertTriangle, Shield, Eye, X, Maximize } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface FullscreenWarningSystemProps {
    isTestActive: boolean;
    onViolationDetected: (violation: ViolationType) => void;
    onReturnToCompliance: () => void;
    maxViolations?: number;
}

type ViolationType = 'fullscreen_exit' | 'tab_switch' | 'window_blur' | 'key_combination' | 'visibility_change';

interface Violation {
    id: string;
    type: ViolationType;
    timestamp: number;
    description: string;
}

interface WarningModalProps {
    isOpen: boolean;
    violation: Violation | null;
    violationCount: number;
    onStayCompliant: () => void;
    onContinueWithViolation: () => void;
    onClose: () => void;
}

// Warning Modal Component
const WarningModal: React.FC<WarningModalProps> = ({
    isOpen,
    violation,
    violationCount,
    onStayCompliant,
    onContinueWithViolation,
}) => {
    const [countdown, setCountdown] = useState(10);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isOpen) {
            setCountdown(10);
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        onStayCompliant(); // Auto-choose safe option
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [isOpen, onStayCompliant]);

    if (!isOpen || !violation) return null;

    const getSeverityColor = () => {
        if (violationCount >= 3) return 'border-red-500 bg-red-950/50';
        if (violationCount >= 2) return 'border-orange-500 bg-orange-950/50';
        return 'border-yellow-500 bg-yellow-950/50';
    };

    const getSeverityTitle = () => {
        if (violationCount >= 3) return '🚨 FINAL WARNING';
        if (violationCount >= 2) return '⚠️ SECOND WARNING';
        return '⚠️ VIOLATION DETECTED';
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <Card className={`w-full max-w-md mx-4 ${getSeverityColor()}`}>
                <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-full bg-red-600">
                            <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {getSeverityTitle()}
                            </h2>
                            <p className="text-sm text-gray-300">
                                Violation #{violationCount}
                            </p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <p className="text-white mb-2 font-medium">
                            {violation.description}
                        </p>
                        <div className="text-sm text-gray-300 space-y-1">
                            <p>• This action has been recorded</p>
                            <p>• Multiple violations may result in test termination</p>
                            <p>• Please return to proper test environment</p>
                        </div>
                    </div>

                    <div className="mb-4 p-3 rounded-lg bg-blue-900/30 border border-blue-500">
                        <p className="text-sm text-blue-200">
                            Auto-selecting safe option in <span className="font-bold text-blue-100">{countdown}s</span>
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            onClick={onStayCompliant}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                            <Shield className="w-4 h-4 mr-2" />
                            Stay Compliant
                        </Button>
                        
                        <Button
                            onClick={onContinueWithViolation}
                            variant="outline"
                            className="flex-1 border-red-500 text-red-400 hover:bg-red-950"
                        >
                            Continue ({violationCount}/5)
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

// Toast Notification Component
const ToastNotification: React.FC<{
    message: string;
    type: 'warning' | 'error' | 'info';
    isVisible: boolean;
    onClose: () => void;
}> = ({ message, type, isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(onClose, 5000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    if (!isVisible) return null;

    const getTypeStyles = () => {
        switch (type) {
            case 'error': return 'bg-red-900 border-red-500 text-red-200';
            case 'warning': return 'bg-yellow-900 border-yellow-500 text-yellow-200';
            case 'info': return 'bg-blue-900 border-blue-500 text-blue-200';
        }
    };

    return (
        <div className="fixed top-4 right-4 z-[9998] animate-in slide-in-from-right duration-300">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${getTypeStyles()} shadow-lg max-w-sm`}>
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm flex-1">{message}</p>
                <button onClick={onClose} className="text-current hover:opacity-70">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

// Return to Fullscreen Prompt
const ReturnPrompt: React.FC<{
    isVisible: boolean;
    onReturnToFullscreen: () => void;
}> = ({ isVisible, onReturnToFullscreen }) => {
    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[9997]">
            <div className="bg-red-900 border border-red-500 text-red-200 px-6 py-4 rounded-lg shadow-lg flex items-center gap-4">
                <div className="animate-pulse">
                    <Eye className="w-6 h-6" />
                </div>
                <div>
                    <p className="font-medium">Not in fullscreen mode!</p>
                    <p className="text-sm opacity-90">Click to return to test mode</p>
                </div>
                <Button
                    onClick={onReturnToFullscreen}
                    className="bg-red-600 hover:bg-red-700"
                    size="sm"
                >
                    <Maximize className="w-4 h-4 mr-2" />
                    Return
                </Button>
            </div>
        </div>
    );
};

export const FullscreenWarningSystem: React.FC<FullscreenWarningSystemProps> = ({
    isTestActive,
    onViolationDetected,
    onReturnToCompliance,
    maxViolations = 5
}) => {
    const [violations, setViolations] = useState<Violation[]>([]);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [currentViolation, setCurrentViolation] = useState<Violation | null>(null);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'warning' | 'error' | 'info'>('warning');
    const [showReturnPrompt, setShowReturnPrompt] = useState(false);
    const [isInFullscreen, setIsInFullscreen] = useState(true);

    const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastViolationTimeRef = useRef<number>(0);

    const showToastNotification = useCallback((message: string, type: 'warning' | 'error' | 'info' = 'warning') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    }, []);

    const createViolation = useCallback((type: ViolationType, description: string): Violation => ({
        id: `${Date.now()}-${Math.random()}`,
        type,
        timestamp: Date.now(),
        description
    }), []);

    const recordViolation = useCallback((violation: Violation, showModal: boolean = true) => {
        const now = Date.now();
        
        // Throttle violations - ignore if too recent (within 2 seconds)
        if (now - lastViolationTimeRef.current < 2000) {
            return;
        }
        
        lastViolationTimeRef.current = now;

        setViolations(prev => [...prev, violation]);
        onViolationDetected(violation.type);

        if (showModal && violations.length < maxViolations - 1) {
            setCurrentViolation(violation);
            setShowWarningModal(true);
        } else if (violations.length >= maxViolations - 1) {
            showToastNotification('Maximum violations reached. Test may be terminated.', 'error');
        } else {
            showToastNotification(violation.description, 'warning');
        }
    }, [violations.length, maxViolations, onViolationDetected, showToastNotification]);

    const handleFullscreenChange = useCallback(() => {
        if (!isTestActive) return;

        const isCurrentlyFullscreen = !!document.fullscreenElement;
        setIsInFullscreen(isCurrentlyFullscreen);

        if (!isCurrentlyFullscreen) {
            setShowReturnPrompt(true);
            
            // Give user 5 seconds grace period before recording violation
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
            }

            graceTimerRef.current = setTimeout(() => {
                if (!document.fullscreenElement) {
                    const violation = createViolation(
                        'fullscreen_exit',
                        'You exited fullscreen mode during the test.'
                    );
                    recordViolation(violation);
                }
            }, 5000);
        } else {
            setShowReturnPrompt(false);
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
            }
            onReturnToCompliance();
        }
    }, [isTestActive, createViolation, recordViolation, onReturnToCompliance]);

    const handleVisibilityChange = useCallback(() => {
        if (!isTestActive) return;

        if (document.hidden) {
            const violation = createViolation(
                'visibility_change',
                'Browser tab was hidden or switched away from test.'
            );
            recordViolation(violation, false); // Don't show modal for tab switches
            showToastNotification('Tab switch detected!', 'warning');
        }
    }, [isTestActive, createViolation, recordViolation, showToastNotification]);

    const handleWindowBlur = useCallback(() => {
        if (!isTestActive) return;

        const violation = createViolation(
            'window_blur',
            'Window lost focus - you may have switched to another application.'
        );
        recordViolation(violation, false);
        showToastNotification('Window focus lost!', 'warning');
    }, [isTestActive, createViolation, recordViolation, showToastNotification]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isTestActive) return;

        let violationDetected = false;
        let description = '';

        // Detect dangerous key combinations
        if (e.altKey && e.key === 'Tab') {
            e.preventDefault();
            violationDetected = true;
            description = 'Alt+Tab key combination detected.';
        } else if (e.metaKey && e.key === 'Tab') {
            e.preventDefault();
            violationDetected = true;
            description = 'Cmd+Tab key combination detected.';
        } else if (e.key === 'Meta' || e.key === 'Super') {
            e.preventDefault();
            violationDetected = true;
            description = 'Windows/Cmd key pressed.';
        } else if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            violationDetected = true;
            description = 'Developer tools shortcut detected.';
        } else if (e.key === 'F12') {
            e.preventDefault();
            violationDetected = true;
            description = 'F12 key (Developer Tools) pressed.';
        }

        if (violationDetected) {
            const violation = createViolation('key_combination', description);
            recordViolation(violation, false);
            showToastNotification(description, 'warning');
        }
    }, [isTestActive, createViolation, recordViolation, showToastNotification]);

    const requestFullscreen = useCallback(async () => {
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            console.error('Failed to request fullscreen:', error);
            showToastNotification('Failed to enter fullscreen mode', 'error');
        }
    }, [showToastNotification]);

    // Event listeners
    useEffect(() => {
        if (!isTestActive) return;

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('keydown', handleKeyDown, { capture: true });

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [isTestActive, handleFullscreenChange, handleVisibilityChange, handleWindowBlur, handleKeyDown]);

    // Cleanup grace timer
    useEffect(() => {
        return () => {
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
            }
        };
    }, []);

    return (
        <>
            <WarningModal
                isOpen={showWarningModal}
                violation={currentViolation}
                violationCount={violations.length}
                onStayCompliant={() => {
                    setShowWarningModal(false);
                    requestFullscreen();
                }}
                onContinueWithViolation={() => {
                    setShowWarningModal(false);
                    showToastNotification('Violation recorded. Please maintain test integrity.', 'warning');
                }}
                onClose={() => setShowWarningModal(false)}
            />

            <ToastNotification
                message={toastMessage}
                type={toastType}
                isVisible={showToast}
                onClose={() => setShowToast(false)}
            />

            <ReturnPrompt
                isVisible={showReturnPrompt && !isInFullscreen}
                onReturnToFullscreen={requestFullscreen}
            />
        </>
    );
};

export default FullscreenWarningSystem;
