import { useState, useEffect, useCallback, useMemo } from 'react';

export interface FullscreenMonitoringConfig {
    enabled: boolean;
    gracePerdiod: number; // seconds before recording violation
    maxViolations: number;
    enableKeyDetection: boolean;
    enableTabSwitchDetection: boolean;
    enableWindowBlurDetection: boolean;
}

export interface ViolationData {
    id: string;
    type: 'fullscreen_exit' | 'tab_switch' | 'window_blur' | 'key_combination' | 'visibility_change';
    timestamp: number;
    description: string;
    severity: 'low' | 'medium' | 'high';
}

export interface FullscreenMonitoringState {
    isInFullscreen: boolean;
    violations: ViolationData[];
    violationCount: number;
    isGracePeriodActive: boolean;
    remainingGraceTime: number;
}

const defaultConfig: FullscreenMonitoringConfig = {
    enabled: true,
    gracePerdiod: 5,
    maxViolations: 5,
    enableKeyDetection: true,
    enableTabSwitchDetection: true,
    enableWindowBlurDetection: true,
};

export const useFullscreenMonitoring = (
    config: Partial<FullscreenMonitoringConfig> = {},
    onViolation?: (violation: ViolationData) => void,
    onReturnToCompliance?: () => void
) => {
    const finalConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config]);
    
    const [state, setState] = useState<FullscreenMonitoringState>({
        isInFullscreen: !!document.fullscreenElement,
        violations: [],
        violationCount: 0,
        isGracePeriodActive: false,
        remainingGraceTime: 0,
    });

    const [graceTimer, setGraceTimer] = useState<NodeJS.Timeout | null>(null);
    const [graceCountdown, setGraceCountdown] = useState<NodeJS.Timeout | null>(null);

    const createViolation = useCallback((
        type: ViolationData['type'],
        description: string,
        severity: ViolationData['severity'] = 'medium'
    ): ViolationData => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        timestamp: Date.now(),
        description,
        severity,
    }), []);

    const recordViolation = useCallback((violation: ViolationData) => {
        setState(prev => ({
            ...prev,
            violations: [...prev.violations, violation],
            violationCount: prev.violationCount + 1,
        }));
        
        onViolation?.(violation);
    }, [onViolation]);

    const startGracePeriod = useCallback(() => {
        if (!finalConfig.enabled) return;

        setState(prev => ({
            ...prev,
            isGracePeriodActive: true,
            remainingGraceTime: finalConfig.gracePerdiod,
        }));

        // Countdown timer
        const countdownInterval = setInterval(() => {
            setState(prev => ({
                ...prev,
                remainingGraceTime: Math.max(0, prev.remainingGraceTime - 1),
            }));
        }, 1000);
        
        setGraceCountdown(countdownInterval);

        // Main grace timer
        const timer = setTimeout(() => {
            setState(prev => {
                if (!prev.isInFullscreen) {
                    const violation = createViolation(
                        'fullscreen_exit',
                        'Remained outside fullscreen mode for too long',
                        'high'
                    );
                    recordViolation(violation);
                }
                
                return {
                    ...prev,
                    isGracePeriodActive: false,
                    remainingGraceTime: 0,
                };
            });
            
            if (graceCountdown) {
                clearInterval(graceCountdown);
                setGraceCountdown(null);
            }
        }, finalConfig.gracePerdiod * 1000);
        
        setGraceTimer(timer);
    }, [finalConfig, createViolation, recordViolation, graceCountdown]);

    const clearGracePeriod = useCallback(() => {
        if (graceTimer) {
            clearTimeout(graceTimer);
            setGraceTimer(null);
        }
        if (graceCountdown) {
            clearInterval(graceCountdown);
            setGraceCountdown(null);
        }
        
        setState(prev => ({
            ...prev,
            isGracePeriodActive: false,
            remainingGraceTime: 0,
        }));
    }, [graceTimer, graceCountdown]);

    const requestFullscreen = useCallback(async () => {
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
            return true;
        } catch (error) {
            console.error('Failed to enter fullscreen:', error);
            return false;
        }
    }, []);

    // Fullscreen change handler
    const handleFullscreenChange = useCallback(() => {
        const isCurrentlyFullscreen = !!document.fullscreenElement;
        
        setState(prev => ({
            ...prev,
            isInFullscreen: isCurrentlyFullscreen,
        }));

        if (isCurrentlyFullscreen) {
            clearGracePeriod();
            onReturnToCompliance?.();
        } else if (finalConfig.enabled) {
            startGracePeriod();
        }
    }, [finalConfig.enabled, startGracePeriod, clearGracePeriod, onReturnToCompliance]);

    // Visibility change handler
    const handleVisibilityChange = useCallback(() => {
        if (!finalConfig.enabled || !finalConfig.enableTabSwitchDetection) return;

        if (document.hidden) {
            const violation = createViolation(
                'visibility_change',
                'Browser tab was hidden',
                'medium'
            );
            recordViolation(violation);
        }
    }, [finalConfig, createViolation, recordViolation]);

    // Window blur handler
    const handleWindowBlur = useCallback(() => {
        if (!finalConfig.enabled || !finalConfig.enableWindowBlurDetection) return;

        const violation = createViolation(
            'window_blur',
            'Window lost focus',
            'medium'
        );
        recordViolation(violation);
    }, [finalConfig, createViolation, recordViolation]);

    // Key combination handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!finalConfig.enabled || !finalConfig.enableKeyDetection) return;

        let violation: ViolationData | null = null;

        if (e.altKey && e.key === 'Tab') {
            e.preventDefault();
            violation = createViolation(
                'key_combination',
                'Alt+Tab combination pressed',
                'high'
            );
        } else if (e.metaKey && e.key === 'Tab') {
            e.preventDefault();
            violation = createViolation(
                'key_combination',
                'Cmd+Tab combination pressed',
                'high'
            );
        } else if (e.key === 'Meta' || e.key === 'Super') {
            e.preventDefault();
            violation = createViolation(
                'key_combination',
                'Windows/Cmd key pressed',
                'medium'
            );
        } else if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            violation = createViolation(
                'key_combination',
                'Developer tools shortcut pressed',
                'high'
            );
        } else if (e.key === 'F12') {
            e.preventDefault();
            violation = createViolation(
                'key_combination',
                'F12 key pressed',
                'high'
            );
        }

        if (violation) {
            recordViolation(violation);
        }
    }, [finalConfig, createViolation, recordViolation]);

    // Setup event listeners
    useEffect(() => {
        if (!finalConfig.enabled) return;

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
    }, [
        finalConfig.enabled,
        handleFullscreenChange,
        handleVisibilityChange,
        handleWindowBlur,
        handleKeyDown
    ]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            clearGracePeriod();
        };
    }, [clearGracePeriod]);

    return {
        state,
        requestFullscreen,
        clearAllViolations: () => setState(prev => ({
            ...prev,
            violations: [],
            violationCount: 0,
        })),
        isMaxViolationsReached: state.violationCount >= finalConfig.maxViolations,
        config: finalConfig,
    };
};

export default useFullscreenMonitoring;
