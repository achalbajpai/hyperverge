/**
 * MediaPipe Multiple Face Detection Regression Debug Tool
 * 
 * This diagnostic script helps identify what changed between working and non-working states
 * of multiple face detection in the MediaPipe system.
 */

// Configuration Analysis
console.log("=== 🔍 MEDIAPIPE CONFIGURATION ANALYSIS ===");

// Simulate loading the configuration
const MEDIAPIPE_CONFIG = {
  faceLandmarker: {
    numFaces: 5,                           // ✅ Should detect up to 5 faces
    minFaceDetectionConfidence: 0.7,       // ✅ Higher than default 0.5
    minFacePresenceConfidence: 0.7,        // ✅ Higher than default 0.5
    minTrackingConfidence: 0.7,            // ✅ Higher than default 0.5
  },
  multiplePeopleDetection: {
    enabled: true,                         // ✅ Multiple people detection enabled
    maxPeople: 5,                          // ✅ Track up to 5 people
    treatMultipleAsViolation: false,       // ✅ Allow multiple people (no violation)
    debugMode: true                        // ✅ Debug logging enabled
  }
};

console.log("Configuration Check:", {
  numFaces: MEDIAPIPE_CONFIG.faceLandmarker.numFaces,
  multipleDetectionEnabled: MEDIAPIPE_CONFIG.multiplePeopleDetection.enabled,
  treatAsViolation: MEDIAPIPE_CONFIG.multiplePeopleDetection.treatMultipleAsViolation,
  debugMode: MEDIAPIPE_CONFIG.multiplePeopleDetection.debugMode
});

// Common regression causes analysis
console.log("\n=== 🚨 REGRESSION ANALYSIS ===");

const potentialIssues = [
  {
    issue: "MediaPipe Library Version Change",
    description: "Check if @mediapipe/tasks-vision version changed",
    checkCommand: "npm ls @mediapipe/tasks-vision",
    severity: "HIGH"
  },
  {
    issue: "Configuration Not Applied",
    description: "numFaces setting not reaching MediaPipe initialization",
    debugSteps: [
      "Look for 'INITIALIZING FACELANDMARKER WITH OPTIONS' in console",
      "Verify numFaces appears in the logged options",
      "Check if faceLandmarker.detectForVideo() uses the right settings"
    ],
    severity: "HIGH"
  },
  {
    issue: "Browser/WebGL Changes",
    description: "Browser updates affecting MediaPipe WASM/WebGL support",
    debugSteps: [
      "Check browser console for WebGL errors",
      "Try in different browser or incognito mode",
      "Check MediaPipe WASM loading errors"
    ],
    severity: "MEDIUM"
  },
  {
    issue: "Camera/Video Source Issues",
    description: "Camera resolution or format changes affecting detection",
    debugSteps: [
      "Check video.videoWidth and video.videoHeight in console logs",
      "Verify camera is providing clear, well-lit video",
      "Test with different camera resolution settings"
    ],
    severity: "MEDIUM"
  },
  {
    issue: "Processing Logic Regression",
    description: "Code changes that broke the multiple face processing",
    debugSteps: [
      "Look for 'RAW MEDIAPIPE DETECTION RESULTS' with faceLandmarksLength > 1",
      "Check if trackFacesWithStability is being called",
      "Verify face filtering logic (minFaceSize/maxFaceSize)"
    ],
    severity: "HIGH"
  }
];

potentialIssues.forEach(issue => {
  console.log(`\n${issue.severity === 'HIGH' ? '🔴' : '🟡'} ${issue.issue}:`);
  console.log(`   Description: ${issue.description}`);
  if (issue.checkCommand) {
    console.log(`   Command: ${issue.checkCommand}`);
  }
  if (issue.debugSteps) {
    issue.debugSteps.forEach((step, index) => {
      console.log(`   ${index + 1}. ${step}`);
    });
  }
});

console.log("\n=== 🔧 DEBUG CHECKLIST ===");

const debugChecklist = [
  "Open browser developer console",
  "Start video proctoring session", 
  "Look for 'INITIALIZING FACELANDMARKER WITH OPTIONS' message",
  "Verify numFaces: 5 appears in the options",
  "Position 2+ people in camera view",
  "Look for 'RAW MEDIAPIPE DETECTION RESULTS' messages",
  "Check if faceLandmarksLength shows > 1 when multiple people present",
  "If faceLandmarksLength is always 0 or 1, the issue is at MediaPipe level",
  "If faceLandmarksLength shows > 1 but UI doesn't reflect it, issue is in processing"
];

debugChecklist.forEach((step, index) => {
  console.log(`${index + 1}. ${step}`);
});

console.log("\n=== 📊 EXPECTED DEBUG OUTPUT ===");

console.log("When working correctly, you should see:");
console.log(`
🔍 INITIALIZING FACELANDMARKER WITH OPTIONS: {
  baseOptions: {...},
  runningMode: "VIDEO",
  numFaces: 5,                    ← THIS IS CRITICAL
  minFaceDetectionConfidence: 0.7,
  ...
}

🚀 STARTING FACE DETECTION: {
  configuredNumFaces: 5,          ← Should be 5
  faceLandmarkerReady: true,
  ...
}

📊 RAW MEDIAPIPE DETECTION RESULTS: {
  faceLandmarksLength: 2,         ← Should be > 1 with multiple people
  hasBlendshapes: true,
  ...
}

🎯 FACE TRACKING RESULTS: {
  totalDetected: 2,               ← Should match people in view
  totalTracked: 2,
  primaryFaceId: "face_xxx",
  ...
}
`);

console.log("\n=== 🎯 NEXT STEPS ===");

console.log("1. Run this debug session and check console output");
console.log("2. If numFaces ≠ 5: Configuration not loading properly");
console.log("3. If faceLandmarksLength always ≤ 1: MediaPipe library or browser issue");
console.log("4. If detection works but UI doesn't update: Processing logic issue");
console.log("5. Compare working vs non-working browser/environment");

console.log("\n=== ✅ DIAGNOSTIC COMPLETE ===");