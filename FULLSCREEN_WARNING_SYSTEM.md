# Fullscreen Violation Warning System

## Overview
A comprehensive system to monitor and warn users when they violate test integrity by exiting fullscreen mode, switching tabs, or using prohibited key combinations during online assessments.

## 🚀 Features

### ✅ Real-time Monitoring
- **Fullscreen Detection**: Monitors when users exit/enter fullscreen mode
- **Tab Switching**: Detects when browser tab becomes hidden
- **Window Focus**: Tracks when the test window loses focus
- **Key Combination Detection**: Prevents Alt+Tab, Cmd+Tab, F12, etc.
- **Grace Period**: 5-second warning before recording violations

### ✅ Progressive Warning System
- **1st Violation**: Friendly warning with auto-recovery option
- **2nd Violation**: Stern warning with manual confirmation
- **3rd+ Violations**: Final warning with potential test termination

### ✅ User-Friendly Interface
- **Modal Warnings**: Blocking modals with clear instructions
- **Toast Notifications**: Non-intrusive alerts for minor violations
- **Return Prompts**: Helpful buttons to return to fullscreen
- **Countdown Timers**: Visual feedback for grace periods

### ✅ Smart Detection
- **Violation Throttling**: Prevents spam violations (2-second cooldown)
- **Context Awareness**: Different handling for different violation types
- **Auto-Recovery**: Automatically selects safe options after 10 seconds

## 📁 File Structure

```
/components/
├── FullscreenWarningSystem.tsx    # Main warning system component
├── ProctoringInterface.tsx        # Enhanced with fullscreen monitoring
└── ui/                           # UI components (Card, Button, etc.)

/hooks/
└── useFullscreenMonitoring.ts     # Reusable hook for fullscreen monitoring

/app/student/assessment/
└── page.tsx                      # Assessment page with integrated warnings
```

## 🔧 Implementation

### 1. Using the Component

```tsx
import FullscreenWarningSystem from '@/components/FullscreenWarningSystem';

function TestPage() {
    const [violationCount, setViolationCount] = useState(0);
    
    return (
        <div>
            {/* Your test content */}
            
            <FullscreenWarningSystem
                isTestActive={true}
                onViolationDetected={(violationType) => {
                    setViolationCount(prev => prev + 1);
                    console.log(`Violation: ${violationType}`);
                }}
                onReturnToCompliance={() => {
                    console.log('User returned to compliance');
                }}
                maxViolations={5}
            />
        </div>
    );
}
```

### 2. Using the Hook

```tsx
import { useFullscreenMonitoring } from '@/hooks/useFullscreenMonitoring';

function TestComponent() {
    const { state, requestFullscreen, isMaxViolationsReached } = useFullscreenMonitoring(
        {
            enabled: true,
            gracePerdiod: 5,
            maxViolations: 3,
            enableKeyDetection: true,
            enableTabSwitchDetection: true,
            enableWindowBlurDetection: true,
        },
        (violation) => {
            console.log('Violation detected:', violation);
        },
        () => {
            console.log('User returned to compliance');
        }
    );

    return (
        <div>
            <p>Fullscreen: {state.isInFullscreen ? 'Yes' : 'No'}</p>
            <p>Violations: {state.violationCount}</p>
            
            {!state.isInFullscreen && (
                <button onClick={requestFullscreen}>
                    Return to Fullscreen
                </button>
            )}
        </div>
    );
}
```

### 3. Integration with Proctoring

```tsx
// In ProctoringInterface.tsx
<FullscreenWarningSystem
    isTestActive={isActive}
    onViolationDetected={(violationType) => {
        setViolationCount(prev => prev + 1);
        addAlert(`${violationType.replace('_', ' ')} detected`);
        
        // Reduce integrity score
        setIntegrityScore(prev => Math.max(0, prev - 0.1));
        
        // Send to WebSocket
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'violation_event',
                data: { violation_type: violationType, timestamp: Date.now() }
            }));
        }
    }}
    onReturnToCompliance={() => {
        addAlert('User returned to compliant state');
        setIntegrityScore(prev => Math.min(1.0, prev + 0.02));
    }}
/>
```

## 🎯 Violation Types

| Type | Description | Severity | Prevention |
|------|-------------|----------|------------|
| `fullscreen_exit` | User exited fullscreen mode | High | Grace period + modal warning |
| `tab_switch` | Browser tab was hidden | Medium | Toast notification |
| `window_blur` | Window lost focus | Medium | Toast notification |
| `key_combination` | Prohibited key pressed (Alt+Tab, F12, etc.) | High | Event prevention + warning |
| `visibility_change` | Page became hidden | Medium | Real-time detection |

## 🔧 Configuration Options

```tsx
interface FullscreenMonitoringConfig {
    enabled: boolean;                    // Enable/disable monitoring
    gracePerdiod: number;               // Seconds before violation (default: 5)
    maxViolations: number;              // Max violations before termination (default: 5)
    enableKeyDetection: boolean;        // Monitor dangerous key combinations
    enableTabSwitchDetection: boolean;  // Monitor tab switches
    enableWindowBlurDetection: boolean; // Monitor window focus loss
}
```

## 🎨 UI Components

### Warning Modal
- **Purpose**: Blocking modal for serious violations
- **Features**: 10-second auto-safe-choice, violation counter, severity indicators
- **Actions**: "Stay Compliant" (recommended) or "Continue (violation recorded)"

### Toast Notifications
- **Purpose**: Non-blocking alerts for minor violations
- **Features**: 5-second auto-dismiss, color-coded severity
- **Types**: Warning (yellow), Error (red), Info (blue)

### Return Prompt
- **Purpose**: Persistent reminder when not in fullscreen
- **Features**: Pulsing icon, one-click return button
- **Position**: Bottom center of screen

## 📊 Analytics & Tracking

### Violation Data Structure
```tsx
interface ViolationData {
    id: string;                         // Unique violation ID
    type: 'fullscreen_exit' | 'tab_switch' | ...;
    timestamp: number;                  // Unix timestamp
    description: string;                // Human-readable description
    severity: 'low' | 'medium' | 'high'; // Violation severity
}
```

### Integration Points
- **WebSocket**: Real-time violation reporting
- **REST API**: Batch violation submission
- **Local Storage**: Violation history persistence
- **Analytics**: Violation pattern analysis

## 🔒 Security Features

### Prevention Mechanisms
- **Event.preventDefault()**: Blocks dangerous key combinations
- **Capture Phase**: Intercepts events before they bubble
- **Grace Periods**: Prevents accidental violations
- **Throttling**: Prevents violation spam

### Detection Accuracy
- **Debouncing**: 2-second cooldown between similar violations
- **Context Awareness**: Different handling for intentional vs accidental
- **Progressive Escalation**: Increasingly strict responses

## 📱 Mobile & Responsive

### Mobile Considerations
- **Touch Events**: Different interaction patterns on mobile
- **Orientation Changes**: Handle landscape/portrait switches
- **App Switching**: Mobile-specific background detection
- **Keyboard Shortcuts**: Different key combinations on mobile

### Responsive Design
- **Modal Sizing**: Adaptive modal sizes for all screens
- **Toast Position**: Screen-appropriate positioning
- **Button Sizing**: Touch-friendly button dimensions

## 🚀 Performance

### Optimization Features
- **Event Delegation**: Efficient event listener management
- **Throttling**: Prevents excessive API calls
- **Cleanup**: Proper timer and listener cleanup
- **Memory Management**: Prevents memory leaks

### Monitoring Impact
- **Lightweight**: Minimal performance overhead
- **Efficient**: Only active during test sessions
- **Selective**: Configurable monitoring components

## 🔄 Future Enhancements

### Planned Features
1. **AI-Powered Detection**: Machine learning for behavior analysis
2. **Biometric Monitoring**: Eye tracking and facial recognition
3. **Network Monitoring**: Detect suspicious network activity
4. **Advanced Analytics**: Predictive violation scoring
5. **Custom Rules**: Admin-configurable violation rules

### Integration Roadmap
1. **LMS Integration**: Canvas, Blackboard, Moodle support
2. **Video Proctoring**: Integration with existing video solutions
3. **Mobile Apps**: Native mobile app support
4. **Browser Extensions**: Enhanced browser-level monitoring

## 📞 Support & Troubleshooting

### Common Issues
1. **Fullscreen API Blocked**: Check browser permissions
2. **False Positives**: Adjust grace period settings
3. **Performance Issues**: Disable unused monitoring features
4. **Mobile Compatibility**: Test on target devices

### Debugging
```javascript
// Enable debug logging
localStorage.setItem('fullscreen_debug', 'true');

// Check current state
console.log('Fullscreen element:', document.fullscreenElement);
console.log('Page visibility:', document.hidden);
console.log('Window focused:', document.hasFocus());
```

## 📄 License & Credits

- **License**: MIT License
- **Author**: Achal Bajpai
- **Version**: 1.0.0
- **Last Updated**: August 8, 2025

---

**🎯 Best for your $2000 investment**: This system provides enterprise-grade violation detection with user-friendly warnings, reducing false positives while maintaining strict security standards.
