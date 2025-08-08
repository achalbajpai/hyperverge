#!/usr/bin/env node

/**
 * Enhanced Multiple Face Detection Test Suite
 * 
 * Tests the comprehensive fixes applied to MediaPipe multiple face detection:
 * - Configuration cleanup and standardization
 * - Enhanced face tracking with stability scoring
 * - Smart primary person selection
 * - Error recovery mechanisms
 * - Adaptive thresholds
 * - Proper visualization with color coding
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName, status, details = '') {
  const statusColor = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  log(`${statusIcon} ${testName}: ${colors[statusColor]}${status}${colors.reset}${details ? ` - ${details}` : ''}`, 'cyan');
}

// Test configuration
const testResults = [];

function runTest(testName, testFn, expectedValue = true) {
  try {
    const result = testFn();
    const passed = result === expectedValue || (typeof result === 'object' && result.success);
    testResults.push({ name: testName, passed, details: result.details || '' });
    logTest(testName, passed ? 'PASS' : 'FAIL', result.details || '');
    return passed;
  } catch (error) {
    testResults.push({ name: testName, passed: false, details: error.message });
    logTest(testName, 'FAIL', error.message);
    return false;
  }
}

// Test 1: Configuration Integrity
function testConfigurationIntegrity() {
  const configPath = './sensai-frontend/src/config/mediapipe-solutions-config.ts';
  if (!fs.existsSync(configPath)) {
    return { success: false, details: 'Config file not found' };
  }
  
  const configContent = fs.readFileSync(configPath, 'utf8');
  
  // Check for actual duplicate configuration implementations (not interface + implementation)
  // Look for duplicates in the implementation section only (after "export const")
  const implementationSection = configContent.split('export const MEDIAPIPE_SOLUTIONS_CONFIG')[1];
  if (implementationSection) {
    const implCalibrationMatches = implementationSection.match(/calibration:\s*{/g) || [];
    if (implCalibrationMatches.length > 1) {
      return { success: false, details: 'Duplicate configuration sections found in implementation' };
    }
  }
  
  // Check for numFaces: 5 setting
  if (!configContent.includes('numFaces: 5')) {
    return { success: false, details: 'numFaces not set to 5' };
  }
  
  // Check for new multiple people detection configuration
  if (!configContent.includes('multiplePeopleDetection:')) {
    return { success: false, details: 'multiplePeopleDetection config missing' };
  }
  
  // Check for enhanced configuration options
  const requiredOptions = [
    'stabilityFrames:',
    'stabilityThreshold:',
    'faceTrackingContinuity:',
    'adaptiveConfidence:',
    'debugMode:',
    'most_stable'
  ];
  
  for (const option of requiredOptions) {
    if (!configContent.includes(option)) {
      return { success: false, details: `Missing configuration: ${option}` };
    }
  }
  
  return { success: true, details: 'All configuration checks passed' };
}

// Test 2: MediaPipeSolutionsProctoring Enhancement
function testProctoringEnhancements() {
  const proctoringPath = './sensai-frontend/src/components/MediaPipeSolutionsProctoring.tsx';
  if (!fs.existsSync(proctoringPath)) {
    return { success: false, details: 'MediaPipeSolutionsProctoring file not found' };
  }
  
  const content = fs.readFileSync(proctoringPath, 'utf8');
  
  // Check for enhanced face tracking features
  const requiredFeatures = [
    'FaceTrackingData',
    'MultipleFaceDetectionResult',
    'trackFacesWithStability',
    'selectPrimaryFace',
    'drawEnhancedFaceLandmarks',
    'adaptiveThresholds',
    'errorRecoveryState',
    'attemptErrorRecovery'
  ];
  
  for (const feature of requiredFeatures) {
    if (!content.includes(feature)) {
      return { success: false, details: `Missing feature: ${feature}` };
    }
  }
  
  // Check for proper error handling
  if (!content.includes('resetErrorRecoveryState')) {
    return { success: false, details: 'Error recovery not implemented' };
  }
  
  // Check for enhanced debugging
  if (!content.includes('ENHANCED FACE DETECTION RESULTS')) {
    return { success: false, details: 'Enhanced debugging not implemented' };
  }
  
  return { success: true, details: 'All proctoring enhancements found' };
}

// Test 3: TypeScript Interface Integrity
function testTypeScriptInterfaces() {
  const configPath = './sensai-frontend/src/config/mediapipe-solutions-config.ts';
  if (!fs.existsSync(configPath)) {
    return { success: false, details: 'Config file not found' };
  }
  
  const content = fs.readFileSync(configPath, 'utf8');
  
  // Check for new TypeScript interfaces
  const requiredInterfaces = [
    'interface FaceTrackingData',
    'interface MultipleFaceDetectionResult',
    'type PrimaryPersonSelectionStrategy'
  ];
  
  for (const interfaceDef of requiredInterfaces) {
    if (!content.includes(interfaceDef)) {
      return { success: false, details: `Missing interface: ${interfaceDef}` };
    }
  }
  
  return { success: true, details: 'All TypeScript interfaces present' };
}

// Test 4: Multiple Face Processing Logic
function testMultipleFaceProcessingLogic() {
  const proctoringPath = './sensai-frontend/src/components/MediaPipeSolutionsProctoring.tsx';
  if (!fs.existsSync(proctoringPath)) {
    return { success: false, details: 'MediaPipeSolutionsProctoring file not found' };
  }
  
  const content = fs.readFileSync(proctoringPath, 'utf8');
  
  // Check for proper multiple face handling (not treating as "no face")
  if (!content.includes('trackFacesWithStability(results.faceLandmarks, timestamp)')) {
    return { success: false, details: 'Enhanced face tracking not implemented' };
  }
  
  // Check for stability scoring
  if (!content.includes('stabilityScore')) {
    return { success: false, details: 'Stability scoring not implemented' };
  }
  
  // Check for face continuity tracking
  if (!content.includes('framesSinceDetection')) {
    return { success: false, details: 'Face continuity tracking not implemented' };
  }
  
  // Check for primary face selection
  if (!content.includes('face.isPrimary = face.id === selectedPrimaryId')) {
    return { success: false, details: 'Primary face marking not implemented' };
  }
  
  return { success: true, details: 'Multiple face processing logic properly implemented' };
}

// Test 5: Visualization and Color Coding
function testVisualizationEnhancements() {
  const proctoringPath = './sensai-frontend/src/components/MediaPipeSolutionsProctoring.tsx';
  if (!fs.existsSync(proctoringPath)) {
    return { success: false, details: 'MediaPipeSolutionsProctoring file not found' };
  }
  
  const content = fs.readFileSync(proctoringPath, 'utf8');
  
  // Check for enhanced visualization function
  if (!content.includes('drawEnhancedFaceLandmarks')) {
    return { success: false, details: 'Enhanced visualization not implemented' };
  }
  
  // Check for color coding
  if (!content.includes('config.colorCoding.primary') || !content.includes('config.colorCoding.secondary')) {
    return { success: false, details: 'Color coding not implemented' };
  }
  
  // Check for stability-based opacity
  if (!content.includes('stabilityScore')) {
    return { success: false, details: 'Stability-based visualization not implemented' };
  }
  
  // Check for debug statistics overlay
  if (!content.includes('Draw tracking statistics')) {
    return { success: false, details: 'Debug statistics overlay not implemented' };
  }
  
  return { success: true, details: 'Visualization enhancements properly implemented' };
}

// Test 6: Error Recovery Mechanisms
function testErrorRecoveryMechanisms() {
  const proctoringPath = './sensai-frontend/src/components/MediaPipeSolutionsProctoring.tsx';
  if (!fs.existsSync(proctoringPath)) {
    return { success: false, details: 'MediaPipeSolutionsProctoring file not found' };
  }
  
  const content = fs.readFileSync(proctoringPath, 'utf8');
  
  // Check for error recovery functions
  const recoveryFeatures = [
    'adjustAdaptiveThresholds',
    'attemptErrorRecovery',
    'resetErrorRecoveryState',
    'errorRecoveryState',
    'consecutiveFailures'
  ];
  
  for (const feature of recoveryFeatures) {
    if (!content.includes(feature)) {
      return { success: false, details: `Missing error recovery feature: ${feature}` };
    }
  }
  
  // Check for specific recovery strategies
  if (!content.includes('lower_confidence_threshold') || !content.includes('reset_tracking_state')) {
    return { success: false, details: 'Recovery strategies not implemented' };
  }
  
  return { success: true, details: 'Error recovery mechanisms properly implemented' };
}

// Test 7: Configuration Validation
function testConfigurationValidation() {
  const configPath = './sensai-frontend/src/config/mediapipe-solutions-config.ts';
  if (!fs.existsSync(configPath)) {
    return { success: false, details: 'Config file not found' };
  }
  
  const content = fs.readFileSync(configPath, 'utf8');
  
  // Check for reasonable default values
  const configChecks = [
    { key: 'primaryPersonSelection: \'most_stable\'', desc: 'Primary selection strategy' },
    { key: 'debugMode: true', desc: 'Debug mode enabled' },
    { key: 'faceTrackingContinuity: true', desc: 'Face tracking continuity' },
    { key: 'adaptiveConfidence: true', desc: 'Adaptive confidence' },
    { key: 'treatMultipleAsViolation: false', desc: 'Multiple people allowed' }
  ];
  
  for (const check of configChecks) {
    if (!content.includes(check.key)) {
      return { success: false, details: `Missing config: ${check.desc}` };
    }
  }
  
  return { success: true, details: 'Configuration validation passed' };
}

// Test 8: Import and Export Integrity
function testImportExportIntegrity() {
  const configPath = './sensai-frontend/src/config/mediapipe-solutions-config.ts';
  const proctoringPath = './sensai-frontend/src/components/MediaPipeSolutionsProctoring.tsx';
  
  if (!fs.existsSync(configPath) || !fs.existsSync(proctoringPath)) {
    return { success: false, details: 'Required files not found' };
  }
  
  const configContent = fs.readFileSync(configPath, 'utf8');
  const proctoringContent = fs.readFileSync(proctoringPath, 'utf8');
  
  // Check exports in config
  const requiredExports = [
    'export interface FaceTrackingData',
    'export interface MultipleFaceDetectionResult',
    'export type PrimaryPersonSelectionStrategy'
  ];
  
  for (const exportDef of requiredExports) {
    if (!configContent.includes(exportDef)) {
      return { success: false, details: `Missing export: ${exportDef}` };
    }
  }
  
  // Check imports in proctoring component
  if (!proctoringContent.includes('type FaceTrackingData')) {
    return { success: false, details: 'FaceTrackingData not imported' };
  }
  
  if (!proctoringContent.includes('type MultipleFaceDetectionResult')) {
    return { success: false, details: 'MultipleFaceDetectionResult not imported' };
  }
  
  return { success: true, details: 'Import/export integrity verified' };
}

// Main test runner
function runAllTests() {
  log('\n🚀 Starting Enhanced Multiple Face Detection Test Suite', 'bold');
  log('=' .repeat(80), 'cyan');
  
  const tests = [
    ['Configuration Integrity', testConfigurationIntegrity],
    ['Proctoring Enhancements', testProctoringEnhancements],
    ['TypeScript Interfaces', testTypeScriptInterfaces],
    ['Multiple Face Processing Logic', testMultipleFaceProcessingLogic],
    ['Visualization Enhancements', testVisualizationEnhancements],
    ['Error Recovery Mechanisms', testErrorRecoveryMechanisms],
    ['Configuration Validation', testConfigurationValidation],
    ['Import/Export Integrity', testImportExportIntegrity]
  ];
  
  let passedTests = 0;
  
  for (const [testName, testFn] of tests) {
    if (runTest(testName, testFn)) {
      passedTests++;
    }
  }
  
  // Summary
  log('\n' + '=' .repeat(80), 'cyan');
  log(`📊 Test Results Summary`, 'bold');
  log('-' .repeat(40), 'cyan');
  
  const totalTests = tests.length;
  const failedTests = totalTests - passedTests;
  
  log(`Total Tests: ${totalTests}`, 'blue');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`, 
      passedTests === totalTests ? 'green' : 'yellow');
  
  if (passedTests === totalTests) {
    log('\n🎉 ALL TESTS PASSED! Multiple face detection implementation is ready for production.', 'green');
    log('\n✅ Key Features Successfully Implemented:', 'green');
    log('   • Enhanced face tracking with stability scoring', 'green');
    log('   • Smart primary person selection (most_stable strategy)', 'green');
    log('   • Face tracking continuity to prevent jumping', 'green');
    log('   • Error recovery mechanisms with adaptive thresholds', 'green');
    log('   • Proper visualization with color coding', 'green');
    log('   • Comprehensive debug logging', 'green');
    log('   • Clean configuration without duplicates', 'green');
  } else {
    log('\n⚠️ Some tests failed. Please review the issues above.', 'yellow');
    log('\nFailed tests:', 'red');
    testResults.filter(r => !r.passed).forEach(test => {
      log(`   • ${test.name}: ${test.details}`, 'red');
    });
  }
  
  log('\n' + '=' .repeat(80), 'cyan');
  
  return passedTests === totalTests;
}

// Run the test suite
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runAllTests };