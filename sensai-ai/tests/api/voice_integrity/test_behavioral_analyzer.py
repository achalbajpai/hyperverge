"""
Tests for Behavioral Analyzer Module

This module contains tests for behavioral pattern analysis including
speech pattern detection, content analysis, and cheating behavior classification.
"""

import pytest
import numpy as np
from datetime import datetime, timezone
from unittest.mock import Mock, patch

# Try to import voice integrity modules
try:
    from api.voice_integrity.behavioral_analyzer import (
        BehavioralAnalyzer, BehavioralMetrics, EmotionalFeatures
    )
    VOICE_MODULES_AVAILABLE = True
except ImportError:
    VOICE_MODULES_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not VOICE_MODULES_AVAILABLE,
    reason="Voice integrity modules not available"
)


@pytest.fixture
def behavioral_analyzer():
    """Create a BehavioralAnalyzer instance for testing."""
    return BehavioralAnalyzer(
        window_size=30,
        sample_rate=16000,
        confidence_threshold=0.7
    )


@pytest.fixture
def sample_audio():
    """Create sample audio data."""
    sample_rate = 16000
    duration = 2.0  # 2 seconds
    frequency = 440
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio = np.sin(2 * np.pi * frequency * t).astype(np.float32) * 0.5
    return audio


@pytest.fixture
def sample_speech_segments():
    """Create sample speech segment data."""
    return [
        {'start_time': 0.0, 'end_time': 1.0, 'duration': 1.0},
        {'start_time': 1.5, 'end_time': 3.0, 'duration': 1.5},
        {'start_time': 4.0, 'end_time': 5.0, 'duration': 1.0},
    ]


@pytest.fixture
def sample_voice_events():
    """Create sample voice activity events."""
    return [
        {'timestamp': 0.1, 'is_speech': True, 'rms_energy': 0.3},
        {'timestamp': 0.2, 'is_speech': True, 'rms_energy': 0.4},
        {'timestamp': 0.3, 'is_speech': False, 'rms_energy': 0.1},
        {'timestamp': 0.4, 'is_speech': True, 'rms_energy': 0.35},
        {'timestamp': 0.5, 'is_speech': False, 'rms_energy': 0.05},
    ]


class TestBehavioralAnalyzer:
    """Test cases for the BehavioralAnalyzer class."""
    
    def test_initialization(self, behavioral_analyzer):
        """Test BehavioralAnalyzer initialization."""
        assert behavioral_analyzer.window_size == 30
        assert behavioral_analyzer.sample_rate == 16000
        assert behavioral_analyzer.confidence_threshold == 0.7
        assert len(behavioral_analyzer.suspicious_phrases) > 0
        assert len(behavioral_analyzer.help_seeking_patterns) > 0
        assert len(behavioral_analyzer.answer_patterns) > 0
    
    def test_speech_pattern_analysis(self, behavioral_analyzer, sample_audio, sample_speech_segments):
        """Test speech pattern analysis."""
        result = behavioral_analyzer.analyze_speech_patterns(sample_audio, sample_speech_segments)
        
        # Check required fields
        assert 'speech_rate' in result
        assert 'pause_frequency' in result
        assert 'average_pause_duration' in result
        assert 'speech_consistency' in result
        
        # Check data types and ranges
        assert isinstance(result['speech_rate'], float)
        assert isinstance(result['pause_frequency'], float)
        assert isinstance(result['average_pause_duration'], float)
        assert 0.0 <= result['speech_consistency'] <= 1.0
    
    def test_content_analysis_suspicious_phrases(self, behavioral_analyzer):
        """Test content analysis for suspicious phrases."""
        # Test with suspicious content
        suspicious_text = "Can you help me with this question? What is the answer to number 5?"
        result = behavioral_analyzer.analyze_content(suspicious_text)
        
        assert result['help_seeking_phrases'] > 0
        assert result['question_reading_detected'] is True
        assert len(result['suspicious_phrase_details']) > 0
    
    def test_content_analysis_clean_text(self, behavioral_analyzer):
        """Test content analysis with clean text."""
        clean_text = "I am working on this problem step by step. The solution involves calculating the derivative."
        result = behavioral_analyzer.analyze_content(clean_text)
        
        assert result['help_seeking_phrases'] == 0
        assert result['answer_receiving_phrases'] == 0
        assert result['external_discussion'] is False
    
    def test_content_analysis_answer_receiving(self, behavioral_analyzer):
        """Test detection of answer-receiving phrases."""
        answer_text = "The answer is 42. You should write option A. The correct answer is definitely choice B."
        result = behavioral_analyzer.analyze_content(answer_text)
        
        assert result['answer_receiving_phrases'] > 0
    
    def test_content_analysis_external_discussion(self, behavioral_analyzer):
        """Test detection of external discussion."""
        external_text = "My friend said the answer is correct. Someone told me to try this approach."
        result = behavioral_analyzer.analyze_content(external_text)
        
        assert result['external_discussion'] is True
    
    def test_content_analysis_empty_text(self, behavioral_analyzer):
        """Test content analysis with empty text."""
        result = behavioral_analyzer.analyze_content("")
        
        assert result['help_seeking_phrases'] == 0
        assert result['answer_receiving_phrases'] == 0
        assert result['question_reading_detected'] is False
        assert result['external_discussion'] is False
    
    def test_audio_quality_analysis(self, behavioral_analyzer, sample_audio):
        """Test audio quality analysis."""
        result = behavioral_analyzer.analyze_audio_quality(sample_audio)
        
        assert 'background_noise_level' in result
        assert 'audio_quality_score' in result
        assert 'potential_recording' in result
        assert 'snr' in result
        
        assert isinstance(result['background_noise_level'], float)
        assert 0.0 <= result['audio_quality_score'] <= 1.0
        assert isinstance(result['potential_recording'], bool)
    
    def test_temporal_pattern_analysis(self, behavioral_analyzer, sample_voice_events):
        """Test temporal pattern analysis."""
        result = behavioral_analyzer.analyze_temporal_patterns(sample_voice_events)
        
        assert 'unusual_silence_periods' in result
        assert 'rapid_speech_bursts' in result
        assert 'inconsistent_volume' in result
        
        assert isinstance(result['unusual_silence_periods'], int)
        assert isinstance(result['rapid_speech_bursts'], int)
        assert isinstance(result['inconsistent_volume'], bool)
    
    def test_overall_risk_calculation(self, behavioral_analyzer):
        """Test overall risk score calculation."""
        # Create metrics with high-risk indicators
        metrics = BehavioralMetrics(
            help_seeking_phrases=3,
            answer_receiving_phrases=2,
            external_discussion=True,
            potential_recording=True,
            speech_rate=250,  # Very fast
            audio_quality_score=0.2  # Poor quality
        )
        
        risk_score, risk_factors = behavioral_analyzer.calculate_overall_risk_score(metrics)
        
        assert 0.0 <= risk_score <= 1.0
        assert len(risk_factors) > 0
        assert risk_score > 0.5  # Should be high risk
    
    def test_comprehensive_behavior_analysis(self, behavioral_analyzer, sample_audio, 
                                           sample_speech_segments, sample_voice_events):
        """Test comprehensive behavior analysis."""
        transcription = "Can you help me solve this problem? I need the answer to question 3."
        
        metrics = behavioral_analyzer.analyze_behavior(
            sample_audio, transcription, sample_speech_segments, sample_voice_events
        )
        
        # Check that all fields are populated
        assert metrics.speech_rate >= 0
        assert metrics.help_seeking_phrases > 0  # Due to suspicious transcription
        assert isinstance(metrics.audio_quality_score, float)
        assert isinstance(metrics.overall_confidence, float)
        assert isinstance(metrics.analysis_timestamp, str)
    
    def test_multilingual_phrase_detection(self, behavioral_analyzer):
        """Test detection of suspicious phrases in multiple languages."""
        # Test Hindi phrases
        hindi_text = "मदद करो। जवाब क्या है?"
        result = behavioral_analyzer.analyze_content(hindi_text)
        assert result['help_seeking_phrases'] > 0
        
        # Test Bengali phrases
        bengali_text = "সাহায্য করো। উত্তর কি?"
        result = behavioral_analyzer.analyze_content(bengali_text)
        assert result['help_seeking_phrases'] > 0
    
    def test_analysis_history_tracking(self, behavioral_analyzer, sample_audio):
        """Test that analysis results are stored in history."""
        initial_count = len(behavioral_analyzer.analysis_history)
        
        # Perform analysis
        behavioral_analyzer.analyze_behavior(sample_audio, "", [], [])
        
        # Should have one more entry in history
        assert len(behavioral_analyzer.analysis_history) == initial_count + 1
    
    def test_analysis_summary(self, behavioral_analyzer, sample_audio):
        """Test analysis summary generation."""
        # Perform some analyses
        for i in range(5):
            behavioral_analyzer.analyze_behavior(sample_audio, f"test {i}", [], [])
        
        summary = behavioral_analyzer.get_analysis_summary()
        
        assert 'total_analyses' in summary
        assert 'recent_analyses' in summary
        assert 'average_risk_score' in summary
        assert summary['total_analyses'] >= 5


class TestBehavioralMetrics:
    """Test the BehavioralMetrics data class."""
    
    def test_metrics_creation(self):
        """Test BehavioralMetrics creation with default values."""
        metrics = BehavioralMetrics()
        
        assert metrics.speech_rate == 0.0
        assert metrics.help_seeking_phrases == 0
        assert metrics.audio_quality_score == 1.0
        assert metrics.overall_confidence == 0.0
    
    def test_metrics_with_values(self):
        """Test BehavioralMetrics creation with specific values."""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        metrics = BehavioralMetrics(
            speech_rate=150.0,
            help_seeking_phrases=2,
            audio_quality_score=0.8,
            analysis_timestamp=timestamp
        )
        
        assert metrics.speech_rate == 150.0
        assert metrics.help_seeking_phrases == 2
        assert metrics.audio_quality_score == 0.8
        assert metrics.analysis_timestamp == timestamp


class TestBehavioralAnalyzerEdgeCases:
    """Test edge cases and error handling."""
    
    def test_empty_speech_segments(self, behavioral_analyzer, sample_audio):
        """Test analysis with empty speech segments."""
        result = behavioral_analyzer.analyze_speech_patterns(sample_audio, [])
        
        assert result['speech_rate'] == 0.0
        assert result['pause_frequency'] == 0.0
        assert result['speech_consistency'] == 0.0
    
    def test_single_speech_segment(self, behavioral_analyzer, sample_audio):
        """Test analysis with single speech segment."""
        segments = [{'start_time': 0.0, 'end_time': 1.0, 'duration': 1.0}]
        result = behavioral_analyzer.analyze_speech_patterns(sample_audio, segments)
        
        assert result['pause_frequency'] == 0.0  # No pauses with single segment
        assert result['speech_rate'] > 0.0
    
    def test_very_short_audio(self, behavioral_analyzer):
        """Test analysis with very short audio."""
        short_audio = np.array([0.1, 0.2, 0.1])  # 3 samples
        result = behavioral_analyzer.analyze_audio_quality(short_audio)
        
        assert isinstance(result['audio_quality_score'], float)
        assert isinstance(result['background_noise_level'], float)
    
    def test_silent_audio(self, behavioral_analyzer):
        """Test analysis with silent audio."""
        silent_audio = np.zeros(16000)  # 1 second of silence
        result = behavioral_analyzer.analyze_audio_quality(silent_audio)
        
        assert result['background_noise_level'] == 0.0
        assert result['audio_quality_score'] >= 0.0
    
    def test_very_noisy_audio(self, behavioral_analyzer):
        """Test analysis with very noisy audio."""
        # Generate white noise
        noisy_audio = np.random.normal(0, 1, 16000).astype(np.float32)
        result = behavioral_analyzer.analyze_audio_quality(noisy_audio)
        
        assert result['background_noise_level'] > 0.0
        assert result['audio_quality_score'] < 1.0


class TestSuspiciousPhraseDatabase:
    """Test the suspicious phrase detection database."""
    
    def test_english_phrases(self, behavioral_analyzer):
        """Test English suspicious phrases."""
        test_cases = [
            ("what is the answer", True),
            ("help me with this", True),
            ("tell me the solution", True),
            ("google it quickly", True),
            ("I am solving this problem", False),
            ("working on the assignment", False),
        ]
        
        for text, should_be_suspicious in test_cases:
            result = behavioral_analyzer.analyze_content(text)
            if should_be_suspicious:
                assert result['help_seeking_phrases'] > 0, f"'{text}' should be flagged"
            else:
                assert result['help_seeking_phrases'] == 0, f"'{text}' should not be flagged"
    
    def test_answer_patterns(self, behavioral_analyzer):
        """Test answer-receiving pattern detection."""
        test_cases = [
            ("the answer is 42", True),
            ("you should write option A", True),
            ("correct answer is choice B", True),
            ("try this approach", True),
            ("I think the solution is complex", False),
            ("this problem requires calculus", False),
        ]
        
        for text, should_detect_answer in test_cases:
            result = behavioral_analyzer.analyze_content(text)
            if should_detect_answer:
                assert result['answer_receiving_phrases'] > 0, f"'{text}' should detect answer"
            else:
                assert result['answer_receiving_phrases'] == 0, f"'{text}' should not detect answer"


@pytest.mark.parametrize("window_size,threshold", [
    (10, 0.5),
    (30, 0.7),
    (60, 0.9),
])
def test_behavioral_analyzer_configurations(window_size, threshold):
    """Test BehavioralAnalyzer with different configurations."""
    analyzer = BehavioralAnalyzer(
        window_size=window_size,
        confidence_threshold=threshold
    )
    
    assert analyzer.window_size == window_size
    assert analyzer.confidence_threshold == threshold


class TestBehavioralAnalyzerPerformance:
    """Performance tests for BehavioralAnalyzer."""
    
    def test_content_analysis_performance(self, behavioral_analyzer):
        """Test content analysis performance with large text."""
        import time
        
        # Generate large text
        large_text = "This is a test sentence. " * 1000
        
        start_time = time.time()
        result = behavioral_analyzer.analyze_content(large_text)
        end_time = time.time()
        
        processing_time = end_time - start_time
        
        # Should process large text quickly (less than 1 second)
        assert processing_time < 1.0
        assert isinstance(result, dict)
    
    def test_comprehensive_analysis_performance(self, behavioral_analyzer, sample_audio):
        """Test performance of comprehensive analysis."""
        import time
        
        start_time = time.time()
        
        # Run multiple comprehensive analyses
        for _ in range(10):
            behavioral_analyzer.analyze_behavior(
                sample_audio, "test transcription", [], []
            )
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Should complete 10 analyses in reasonable time
        assert processing_time < 5.0
        
        # Calculate analyses per second
        analyses_per_second = 10 / processing_time
        print(f"Analysis speed: {analyses_per_second:.2f} analyses/second")


if __name__ == "__main__":
    # Allow running tests directly
    pytest.main([__file__])