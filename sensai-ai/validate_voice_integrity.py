#!/usr/bin/env python3
"""
Voice Integrity System Validation Script

This script validates the performance and accuracy of the voice-based 
cheating detection system through comprehensive testing and benchmarking.

Usage:
    python validate_voice_integrity.py [--verbose] [--performance-only]

Options:
    --verbose           Show detailed output
    --performance-only  Run only performance tests
    --accuracy-only     Run only accuracy tests
    --save-results      Save validation results to file
"""

import argparse
import sys
import time
import json
import numpy as np
import asyncio
from typing import Dict, List, Tuple
from datetime import datetime, timezone

# Validation results storage
validation_results = {
    'timestamp': datetime.now(timezone.utc).isoformat(),
    'system_info': {},
    'component_tests': {},
    'performance_metrics': {},
    'accuracy_metrics': {},
    'integration_tests': {},
    'overall_score': 0.0
}

def check_dependencies() -> Dict[str, bool]:
    """Check if all required dependencies are available."""
    dependencies = {
        'numpy': False,
        'torch': False,
        'scipy': False,
        'librosa': False,
        'sklearn': False,
        'silero_vad': False,
        'pyannote_audio': False,
        'voice_integrity_modules': False
    }
    
    try:
        import numpy
        dependencies['numpy'] = True
    except ImportError:
        pass
    
    try:
        import torch
        dependencies['torch'] = True
    except ImportError:
        pass
    
    try:
        import scipy
        dependencies['scipy'] = True
    except ImportError:
        pass
    
    try:
        import librosa
        dependencies['librosa'] = True
    except ImportError:
        pass
    
    try:
        import sklearn
        dependencies['sklearn'] = True
    except ImportError:
        pass
    
    try:
        import silero_vad
        dependencies['silero_vad'] = True
    except ImportError:
        pass
    
    try:
        import pyannote.audio
        dependencies['pyannote_audio'] = True
    except ImportError:
        pass
    
    try:
        from src.api.voice_integrity.real_time_processor import VoiceProcessor
        from src.api.voice_integrity.behavioral_analyzer import BehavioralAnalyzer
        from src.api.voice_integrity.cheating_classifier import CheatingClassifier
        dependencies['voice_integrity_modules'] = True
    except ImportError:
        pass
    
    return dependencies

def generate_test_audio_scenarios() -> Dict[str, Tuple[np.ndarray, str, bool]]:
    """Generate various test audio scenarios for validation."""
    scenarios = {}
    sample_rate = 16000
    
    # Scenario 1: Clean single speaker
    duration = 3.0
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    clean_audio = np.sin(2 * np.pi * 440 * t) * 0.3
    scenarios['clean_single_speaker'] = (
        clean_audio.astype(np.float32),
        "I am working on this problem systematically using proper methodology.",
        False  # Not cheating
    )
    
    # Scenario 2: Suspicious content
    suspicious_audio = np.sin(2 * np.pi * 220 * t) * 0.4
    scenarios['suspicious_content'] = (
        suspicious_audio.astype(np.float32),
        "Can you help me with this? What is the answer to question number 3?",
        True  # Cheating
    )
    
    # Scenario 3: Multiple speakers (simulated)
    multi_speaker_audio = (
        np.sin(2 * np.pi * 440 * t) * 0.3 +  # Speaker 1
        np.sin(2 * np.pi * 880 * t[:len(t)//2]) * 0.2  # Speaker 2 (first half)
    )
    scenarios['multiple_speakers'] = (
        multi_speaker_audio.astype(np.float32),
        "The answer is option B. You should write that down.",
        True  # Cheating
    )
    
    # Scenario 4: Silent/background noise
    noise_audio = np.random.normal(0, 0.05, len(t))
    scenarios['background_noise'] = (
        noise_audio.astype(np.float32),
        "",
        False  # Not cheating
    )
    
    # Scenario 5: High stress/anxiety indicators
    stress_audio = np.sin(2 * np.pi * 660 * t) * 0.5  # Higher frequency
    scenarios['stress_indicators'] = (
        stress_audio.astype(np.float32),
        "Um, I don't know... this is really difficult... I'm not sure what to do...",
        False  # Stress but not necessarily cheating
    )
    
    return scenarios

def validate_component_functionality(verbose: bool = False) -> Dict[str, Dict]:
    """Validate individual component functionality."""
    component_results = {}
    
    if verbose:
        print("Validating individual components...")
    
    try:
        from src.api.voice_integrity.real_time_processor import VoiceProcessor
        from src.api.voice_integrity.behavioral_analyzer import BehavioralAnalyzer
        from src.api.voice_integrity.speaker_detector import SpeakerDetector
        from src.api.voice_integrity.emotion_analyzer import EmotionAnalyzer
        from src.api.voice_integrity.cheating_classifier import CheatingClassifier
        
        # Test VoiceProcessor
        if verbose:
            print("  Testing VoiceProcessor...")
        voice_processor = VoiceProcessor()
        test_audio = np.random.randn(1000).astype(np.float32)
        test_bytes = (test_audio * 32767).astype(np.int16).tobytes()
        voice_result = voice_processor.analyze_audio_chunk(test_bytes)
        
        component_results['voice_processor'] = {
            'initialized': True,
            'basic_analysis': 'is_speech' in voice_result,
            'features_present': all(key in voice_result for key in 
                                  ['silero_probability', 'rms_energy', 'timestamp']),
            'score': 1.0 if 'is_speech' in voice_result else 0.5
        }
        
        # Test BehavioralAnalyzer
        if verbose:
            print("  Testing BehavioralAnalyzer...")
        behavioral_analyzer = BehavioralAnalyzer()
        behavioral_result = behavioral_analyzer.analyze_behavior(test_audio, "test transcription", [], [])
        
        component_results['behavioral_analyzer'] = {
            'initialized': True,
            'pattern_detection': behavioral_result.help_seeking_phrases >= 0,
            'metrics_complete': hasattr(behavioral_result, 'overall_confidence'),
            'score': 1.0 if hasattr(behavioral_result, 'overall_confidence') else 0.5
        }
        
        # Test SpeakerDetector
        if verbose:
            print("  Testing SpeakerDetector...")
        speaker_detector = SpeakerDetector()
        component_results['speaker_detector'] = {
            'initialized': True,
            'model_loaded': speaker_detector.model_loaded,
            'fallback_available': True,
            'score': 1.0 if speaker_detector.model_loaded else 0.7
        }
        
        # Test EmotionAnalyzer
        if verbose:
            print("  Testing EmotionAnalyzer...")
        emotion_analyzer = EmotionAnalyzer()
        component_results['emotion_analyzer'] = {
            'initialized': True,
            'model_available': emotion_analyzer.emotion_model is not None,
            'feature_extraction': True,
            'score': 1.0 if emotion_analyzer.emotion_model else 0.8
        }
        
        # Test CheatingClassifier
        if verbose:
            print("  Testing CheatingClassifier...")
        cheating_classifier = CheatingClassifier()
        component_results['cheating_classifier'] = {
            'initialized': True,
            'components_integrated': all([
                cheating_classifier.voice_processor,
                cheating_classifier.behavioral_analyzer,
                cheating_classifier.speaker_detector,
                cheating_classifier.emotion_analyzer
            ]),
            'ml_models_available': cheating_classifier.rf_model is not None,
            'score': 1.0 if cheating_classifier.rf_model else 0.6
        }
        
    except ImportError as e:
        component_results['error'] = {
            'message': f"Voice integrity modules not available: {e}",
            'score': 0.0
        }
    
    return component_results

async def validate_performance_metrics(verbose: bool = False) -> Dict[str, float]:
    """Validate system performance metrics."""
    performance_results = {}
    
    if verbose:
        print("Running performance validation...")
    
    try:
        from src.api.voice_integrity.cheating_classifier import CheatingClassifier
        
        # Generate test scenarios
        scenarios = generate_test_audio_scenarios()
        cheating_classifier = CheatingClassifier()
        
        # Test processing speed
        if verbose:
            print("  Testing processing speed...")
        
        speed_results = []
        for scenario_name, (audio, transcription, _) in scenarios.items():
            start_time = time.time()
            
            result = await cheating_classifier.analyze_session_async(
                audio, transcription, f"perf_test_{scenario_name}"
            )
            
            end_time = time.time()
            processing_time = end_time - start_time
            speed_results.append(processing_time)
            
            if verbose:
                print(f"    {scenario_name}: {processing_time:.2f}s")
        
        # Calculate performance metrics
        performance_results['average_processing_time'] = np.mean(speed_results)
        performance_results['max_processing_time'] = np.max(speed_results)
        performance_results['min_processing_time'] = np.min(speed_results)
        performance_results['throughput_scenarios_per_second'] = 1.0 / np.mean(speed_results)
        
        # Real-time capability score
        # Should process faster than real-time (audio duration)
        audio_durations = [len(audio) / 16000 for audio, _, _ in scenarios.values()]
        realtime_ratios = [duration / processing for duration, processing 
                          in zip(audio_durations, speed_results)]
        performance_results['realtime_capability_ratio'] = np.mean(realtime_ratios)
        
        # Memory usage test (basic)
        import psutil
        import os
        process = psutil.Process(os.getpid())
        
        initial_memory = process.memory_info().rss
        
        # Process multiple scenarios
        for _ in range(5):
            for audio, transcription, _ in scenarios.values():
                await cheating_classifier.analyze_session_async(
                    audio, transcription, "memory_test"
                )
        
        final_memory = process.memory_info().rss
        memory_increase_mb = (final_memory - initial_memory) / (1024 * 1024)
        performance_results['memory_increase_mb'] = memory_increase_mb
        
        if verbose:
            print(f"  Average processing time: {performance_results['average_processing_time']:.2f}s")
            print(f"  Real-time capability ratio: {performance_results['realtime_capability_ratio']:.2f}x")
            print(f"  Memory increase: {memory_increase_mb:.1f} MB")
        
    except Exception as e:
        performance_results['error'] = str(e)
    
    return performance_results

async def validate_accuracy_metrics(verbose: bool = False) -> Dict[str, float]:
    """Validate system accuracy metrics."""
    accuracy_results = {}
    
    if verbose:
        print("Running accuracy validation...")
    
    try:
        from src.api.voice_integrity.cheating_classifier import CheatingClassifier
        
        # Generate test scenarios with known outcomes
        scenarios = generate_test_audio_scenarios()
        cheating_classifier = CheatingClassifier()
        
        # Test predictions
        predictions = []
        ground_truth = []
        
        for scenario_name, (audio, transcription, is_cheating) in scenarios.items():
            if verbose:
                print(f"  Testing scenario: {scenario_name}")
            
            result = await cheating_classifier.analyze_session_async(
                audio, transcription, f"accuracy_test_{scenario_name}"
            )
            
            prediction = result.get('prediction', {})
            predicted_cheating = prediction.get('is_cheating', False)
            confidence = prediction.get('confidence', 0.0)
            
            predictions.append(predicted_cheating)
            ground_truth.append(is_cheating)
            
            if verbose:
                print(f"    Expected: {is_cheating}, Predicted: {predicted_cheating}, Confidence: {confidence:.2f}")
        
        # Calculate accuracy metrics
        correct_predictions = sum(1 for pred, truth in zip(predictions, ground_truth) if pred == truth)
        total_predictions = len(predictions)
        accuracy = correct_predictions / total_predictions if total_predictions > 0 else 0.0
        
        # Calculate precision, recall for cheating detection
        true_positives = sum(1 for pred, truth in zip(predictions, ground_truth) if pred and truth)
        false_positives = sum(1 for pred, truth in zip(predictions, ground_truth) if pred and not truth)
        false_negatives = sum(1 for pred, truth in zip(predictions, ground_truth) if not pred and truth)
        
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0.0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0.0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        accuracy_results['overall_accuracy'] = accuracy
        accuracy_results['precision'] = precision
        accuracy_results['recall'] = recall
        accuracy_results['f1_score'] = f1_score
        accuracy_results['correct_predictions'] = correct_predictions
        accuracy_results['total_predictions'] = total_predictions
        
        if verbose:
            print(f"  Overall accuracy: {accuracy:.2f}")
            print(f"  Precision: {precision:.2f}")
            print(f"  Recall: {recall:.2f}")
            print(f"  F1 Score: {f1_score:.2f}")
        
    except Exception as e:
        accuracy_results['error'] = str(e)
    
    return accuracy_results

def validate_integration_capabilities(verbose: bool = False) -> Dict[str, float]:
    """Validate system integration capabilities."""
    integration_results = {}
    
    if verbose:
        print("Validating integration capabilities...")
    
    try:
        # Test WebSocket integration
        from src.api.voice_integrity.websocket_handler import VoiceWebSocketManager
        from unittest.mock import Mock
        
        mock_integrity_manager = Mock()
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        
        integration_results['websocket_manager_init'] = 1.0
        integration_results['session_management'] = 1.0 if hasattr(voice_manager, 'active_sessions') else 0.0
        integration_results['callback_system'] = 1.0 if hasattr(voice_manager, 'integrity_manager') else 0.0
        
        # Test API endpoint availability
        try:
            from src.api.routes.voice_integrity import router
            integration_results['api_endpoints'] = 1.0
        except ImportError:
            integration_results['api_endpoints'] = 0.5
        
        # Test database integration
        try:
            from src.api.models import IntegrityFlag, IntegrityEvent
            integration_results['database_models'] = 1.0
        except ImportError:
            integration_results['database_models'] = 0.0
        
        if verbose:
            print(f"  WebSocket integration: {'✓' if integration_results['websocket_manager_init'] == 1.0 else '✗'}")
            print(f"  API endpoints: {'✓' if integration_results['api_endpoints'] == 1.0 else '✗'}")
            print(f"  Database models: {'✓' if integration_results['database_models'] == 1.0 else '✗'}")
        
    except Exception as e:
        integration_results['error'] = str(e)
    
    return integration_results

def calculate_overall_score(results: Dict) -> float:
    """Calculate overall system score."""
    scores = []
    weights = {
        'component_tests': 0.3,
        'performance_metrics': 0.3,
        'accuracy_metrics': 0.3,
        'integration_tests': 0.1
    }
    
    for category, weight in weights.items():
        if category in results and results[category]:
            category_scores = []
            
            if category == 'component_tests':
                for component, data in results[category].items():
                    if isinstance(data, dict) and 'score' in data:
                        category_scores.append(data['score'])
            
            elif category == 'accuracy_metrics':
                if 'f1_score' in results[category]:
                    category_scores.append(results[category]['f1_score'])
            
            elif category == 'performance_metrics':
                # Performance score based on real-time capability and memory efficiency
                if 'realtime_capability_ratio' in results[category]:
                    realtime_score = min(1.0, results[category]['realtime_capability_ratio'] / 2.0)
                    category_scores.append(realtime_score)
                if 'memory_increase_mb' in results[category]:
                    memory_score = max(0.0, 1.0 - results[category]['memory_increase_mb'] / 100.0)
                    category_scores.append(memory_score)
            
            elif category == 'integration_tests':
                for key, score in results[category].items():
                    if isinstance(score, (int, float)) and key != 'error':
                        category_scores.append(score)
            
            if category_scores:
                category_average = np.mean(category_scores)
                scores.append(category_average * weight)
    
    return sum(scores) if scores else 0.0

def print_validation_report(results: Dict, verbose: bool = False):
    """Print comprehensive validation report."""
    print("\n" + "="*60)
    print("VOICE INTEGRITY SYSTEM VALIDATION REPORT")
    print("="*60)
    
    print(f"Timestamp: {results['timestamp']}")
    print(f"Overall Score: {results['overall_score']:.2f}/1.00")
    
    # System dependencies
    if 'system_info' in results and results['system_info']:
        print(f"\nSystem Dependencies:")
        for dep, available in results['system_info'].items():
            status = "✓" if available else "✗"
            print(f"  {dep}: {status}")
    
    # Component tests
    if 'component_tests' in results and results['component_tests']:
        print(f"\nComponent Tests:")
        for component, data in results['component_tests'].items():
            if isinstance(data, dict) and 'score' in data:
                print(f"  {component}: {data['score']:.2f}/1.00")
                if verbose and 'error' not in data:
                    for key, value in data.items():
                        if key != 'score':
                            print(f"    {key}: {value}")
    
    # Performance metrics
    if 'performance_metrics' in results and results['performance_metrics']:
        print(f"\nPerformance Metrics:")
        perf = results['performance_metrics']
        if 'average_processing_time' in perf:
            print(f"  Average processing time: {perf['average_processing_time']:.2f}s")
        if 'realtime_capability_ratio' in perf:
            print(f"  Real-time capability: {perf['realtime_capability_ratio']:.2f}x")
        if 'memory_increase_mb' in perf:
            print(f"  Memory efficiency: {perf['memory_increase_mb']:.1f} MB increase")
    
    # Accuracy metrics
    if 'accuracy_metrics' in results and results['accuracy_metrics']:
        print(f"\nAccuracy Metrics:")
        acc = results['accuracy_metrics']
        if 'overall_accuracy' in acc:
            print(f"  Overall accuracy: {acc['overall_accuracy']:.2f}")
        if 'f1_score' in acc:
            print(f"  F1 Score: {acc['f1_score']:.2f}")
        if 'precision' in acc:
            print(f"  Precision: {acc['precision']:.2f}")
        if 'recall' in acc:
            print(f"  Recall: {acc['recall']:.2f}")
    
    # Integration tests
    if 'integration_tests' in results and results['integration_tests']:
        print(f"\nIntegration Tests:")
        for test, score in results['integration_tests'].items():
            if isinstance(score, (int, float)) and test != 'error':
                status = "✓" if score >= 0.8 else "⚠" if score >= 0.5 else "✗"
                print(f"  {test}: {status} ({score:.2f})")
    
    # Overall assessment
    print(f"\nOverall Assessment:")
    if results['overall_score'] >= 0.8:
        print("  🟢 EXCELLENT - System is performing well and ready for production")
    elif results['overall_score'] >= 0.6:
        print("  🟡 GOOD - System is functional with minor issues")
    elif results['overall_score'] >= 0.4:
        print("  🟠 FAIR - System needs improvement in several areas")
    else:
        print("  🔴 POOR - System requires significant fixes before deployment")
    
    print("="*60)

async def main():
    """Main validation function."""
    parser = argparse.ArgumentParser(description="Validate Voice Integrity System")
    parser.add_argument('--verbose', action='store_true', help='Show detailed output')
    parser.add_argument('--performance-only', action='store_true', help='Run only performance tests')
    parser.add_argument('--accuracy-only', action='store_true', help='Run only accuracy tests')
    parser.add_argument('--save-results', action='store_true', help='Save results to JSON file')
    
    args = parser.parse_args()
    
    print("Starting Voice Integrity System Validation...")
    
    # Check dependencies
    dependencies = check_dependencies()
    validation_results['system_info'] = dependencies
    
    if not dependencies.get('voice_integrity_modules', False):
        print("❌ Voice integrity modules not available. Please install required dependencies.")
        if args.save_results:
            with open('validation_results.json', 'w') as f:
                json.dump(validation_results, f, indent=2)
        return
    
    if args.verbose:
        print("Dependencies checked ✓")
    
    # Run validation tests
    try:
        # Component functionality tests
        if not args.performance_only and not args.accuracy_only:
            validation_results['component_tests'] = validate_component_functionality(args.verbose)
        
        # Performance tests
        if not args.accuracy_only:
            validation_results['performance_metrics'] = await validate_performance_metrics(args.verbose)
        
        # Accuracy tests
        if not args.performance_only:
            validation_results['accuracy_metrics'] = await validate_accuracy_metrics(args.verbose)
        
        # Integration tests
        if not args.performance_only and not args.accuracy_only:
            validation_results['integration_tests'] = validate_integration_capabilities(args.verbose)
        
        # Calculate overall score
        validation_results['overall_score'] = calculate_overall_score(validation_results)
        
    except Exception as e:
        print(f"❌ Validation failed with error: {e}")
        validation_results['validation_error'] = str(e)
    
    # Print report
    print_validation_report(validation_results, args.verbose)
    
    # Save results
    if args.save_results:
        filename = f"validation_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(validation_results, f, indent=2)
        print(f"\nResults saved to {filename}")

if __name__ == "__main__":
    asyncio.run(main())