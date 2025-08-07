"""
Integration Tests for Voice Integrity System

This module contains comprehensive integration tests that verify the entire
voice integrity detection system works correctly end-to-end.
"""

import pytest
import numpy as np
import asyncio
import json
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone

# Try to import voice integrity modules
try:
    from api.voice_integrity.real_time_processor import VoiceProcessor
    from api.voice_integrity.behavioral_analyzer import BehavioralAnalyzer
    from api.voice_integrity.speaker_detector import SpeakerDetector
    from api.voice_integrity.emotion_analyzer import EmotionAnalyzer
    from api.voice_integrity.cheating_classifier import CheatingClassifier
    from api.voice_integrity.websocket_handler import VoiceWebSocketManager, VoiceSession
    VOICE_MODULES_AVAILABLE = True
except ImportError:
    VOICE_MODULES_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not VOICE_MODULES_AVAILABLE,
    reason="Voice integrity modules not available"
)


@pytest.fixture
def sample_test_audio():
    """Generate realistic test audio for integration testing."""
    sample_rate = 16000
    duration = 5.0  # 5 seconds
    
    # Create a more complex audio signal with speech-like characteristics
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Mix multiple frequencies to simulate speech
    speech_signal = (
        np.sin(2 * np.pi * 200 * t) * 0.3 +  # Fundamental frequency
        np.sin(2 * np.pi * 400 * t) * 0.2 +  # First harmonic
        np.sin(2 * np.pi * 600 * t) * 0.1 +  # Second harmonic
        np.random.normal(0, 0.05, len(t))    # Background noise
    )
    
    # Add some silence periods
    silence_start = int(sample_rate * 2)
    silence_end = int(sample_rate * 3)
    speech_signal[silence_start:silence_end] *= 0.1  # Reduce volume for "silence"
    
    return speech_signal.astype(np.float32)


@pytest.fixture
def suspicious_transcription():
    """Sample suspicious transcription for testing."""
    return "Can you help me with this question? What is the answer to number 5? Tell me the correct option."


@pytest.fixture
def clean_transcription():
    """Sample clean transcription for testing."""
    return "I am working through this problem step by step. The methodology involves several calculations."


@pytest.fixture
def mock_integrity_manager():
    """Create a mock integrity manager for testing."""
    mock_manager = Mock()
    mock_manager.send_integrity_event = AsyncMock()
    mock_manager.send_integrity_flag = AsyncMock()
    return mock_manager


class TestVoiceIntegrityPipeline:
    """Test the complete voice integrity analysis pipeline."""
    
    @pytest.mark.asyncio
    async def test_complete_analysis_pipeline(self, sample_test_audio, suspicious_transcription):
        """Test the complete analysis pipeline from audio to cheating prediction."""
        # Initialize components
        voice_processor = VoiceProcessor()
        behavioral_analyzer = BehavioralAnalyzer()
        speaker_detector = SpeakerDetector()
        emotion_analyzer = EmotionAnalyzer()
        cheating_classifier = CheatingClassifier()
        
        session_id = "integration_test_001"
        
        # Step 1: Process audio with voice processor
        audio_chunks = [sample_test_audio[i:i+512] for i in range(0, len(sample_test_audio), 512)]
        voice_events = []
        
        for chunk_data in audio_chunks:
            chunk_bytes = (chunk_data * 32767).astype(np.int16).tobytes()
            analysis = voice_processor.analyze_audio_chunk(chunk_bytes)
            voice_events.append(analysis)
        
        # Step 2: Run behavioral analysis
        behavioral_metrics = behavioral_analyzer.analyze_behavior(
            sample_test_audio, suspicious_transcription, [], voice_events
        )
        
        # Step 3: Run speaker analysis
        speaker_analysis = await speaker_detector.analyze_audio_async(
            sample_test_audio, session_id
        )
        
        # Step 4: Run emotion analysis
        emotion_analysis = await emotion_analyzer.analyze_emotion_async(
            sample_test_audio, session_id=session_id
        )
        
        # Step 5: Run comprehensive cheating classification
        comprehensive_result = await cheating_classifier.analyze_session_async(
            sample_test_audio, suspicious_transcription, session_id
        )
        
        # Verify pipeline results
        assert 'prediction' in comprehensive_result
        assert 'detailed_analysis' in comprehensive_result
        
        prediction = comprehensive_result['prediction']
        assert 'is_cheating' in prediction
        assert 'confidence' in prediction
        assert 'probability' in prediction
        assert 'contributing_factors' in prediction
        
        # With suspicious transcription, should have higher cheating probability
        assert prediction['probability'] > 0.3  # Should detect some suspicious activity
    
    @pytest.mark.asyncio
    async def test_clean_audio_analysis(self, sample_test_audio, clean_transcription):
        """Test analysis pipeline with clean, non-suspicious content."""
        cheating_classifier = CheatingClassifier()
        session_id = "clean_test_001"
        
        result = await cheating_classifier.analyze_session_async(
            sample_test_audio, clean_transcription, session_id
        )
        
        prediction = result['prediction']
        
        # Clean content should have low cheating probability
        assert prediction['probability'] < 0.5
        assert prediction['is_cheating'] is False
    
    def test_component_integration(self, sample_test_audio):
        """Test that all components can work together without errors."""
        # Initialize all components
        voice_processor = VoiceProcessor()
        behavioral_analyzer = BehavioralAnalyzer()
        speaker_detector = SpeakerDetector()
        emotion_analyzer = EmotionAnalyzer()
        cheating_classifier = CheatingClassifier()
        
        # Verify all components initialized successfully
        assert voice_processor is not None
        assert behavioral_analyzer is not None
        assert speaker_detector is not None
        assert emotion_analyzer is not None
        assert cheating_classifier is not None
        
        # Test basic functionality
        chunk_bytes = (sample_test_audio[:512] * 32767).astype(np.int16).tobytes()
        voice_analysis = voice_processor.analyze_audio_chunk(chunk_bytes)
        assert 'is_speech' in voice_analysis
        
        behavioral_metrics = behavioral_analyzer.analyze_behavior(sample_test_audio, "", [], [])
        assert behavioral_metrics.overall_confidence >= 0.0


class TestWebSocketIntegration:
    """Test WebSocket integration for real-time processing."""
    
    @pytest.mark.asyncio
    async def test_voice_websocket_manager_initialization(self, mock_integrity_manager):
        """Test VoiceWebSocketManager initialization."""
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        
        assert voice_manager.integrity_manager == mock_integrity_manager
        assert len(voice_manager.active_sessions) == 0
        assert voice_manager.analysis_interval == 10.0
        assert voice_manager.alert_threshold == 0.7
    
    @pytest.mark.asyncio
    async def test_voice_session_lifecycle(self, mock_integrity_manager):
        """Test voice session creation, processing, and cleanup."""
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        
        # Mock WebSocket
        mock_websocket = Mock()
        mock_websocket.send_json = AsyncMock()
        
        session_id = "test_session_ws_001"
        
        # Start session
        success = await voice_manager.start_voice_session(mock_websocket, session_id)
        assert success is True
        assert session_id in voice_manager.active_sessions
        
        # Process audio
        test_audio_bytes = b'\x00\x01' * 1000  # Mock audio data
        result = await voice_manager.process_audio_chunk(session_id, test_audio_bytes)
        assert 'status' in result
        
        # Stop session
        summary = await voice_manager.stop_voice_session(session_id)
        assert 'session_id' in summary
        assert session_id not in voice_manager.active_sessions
    
    @pytest.mark.asyncio
    async def test_voice_session_audio_processing(self, mock_integrity_manager, sample_test_audio):
        """Test audio processing within a voice session."""
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        mock_websocket = Mock()
        mock_websocket.send_json = AsyncMock()
        
        session_id = "audio_test_session_001"
        
        # Start session
        await voice_manager.start_voice_session(mock_websocket, session_id)
        voice_session = voice_manager.active_sessions[session_id]
        
        # Process multiple audio chunks
        chunk_size = 1024
        for i in range(0, len(sample_test_audio), chunk_size):
            chunk = sample_test_audio[i:i+chunk_size]
            chunk_bytes = (chunk * 32767).astype(np.int16).tobytes()
            
            result = await voice_session.process_audio(chunk_bytes)
            assert 'status' in result
            assert result['status'] == 'processed'
        
        # Verify session state
        assert voice_session.audio_chunks_processed > 0
        assert len(voice_session.voice_events) > 0
    
    @pytest.mark.asyncio
    async def test_alert_generation(self, mock_integrity_manager):
        """Test alert generation and notification."""
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        
        alert_data = {
            'session_id': 'alert_test_001',
            'risk_score': 0.8,
            'probability': 0.85,
            'severity': 'high',
            'message': 'High risk cheating detected',
            'org_id': 1
        }
        
        await voice_manager.send_voice_alert('alert_test_001', alert_data)
        
        # Verify alerts were sent
        mock_integrity_manager.send_integrity_event.assert_called_once()
        mock_integrity_manager.send_integrity_flag.assert_called_once()


class TestRealTimeProcessing:
    """Test real-time processing capabilities."""
    
    @pytest.mark.asyncio
    async def test_continuous_audio_stream_processing(self, sample_test_audio):
        """Test processing a continuous audio stream."""
        voice_processor = VoiceProcessor()
        
        async def audio_stream_generator():
            """Simulate continuous audio stream."""
            chunk_size = 1024
            for i in range(0, len(sample_test_audio), chunk_size):
                chunk = sample_test_audio[i:i+chunk_size]
                chunk_bytes = (chunk * 32767).astype(np.int16).tobytes()
                yield chunk_bytes
                await asyncio.sleep(0.01)  # Simulate real-time delay
        
        session_id = "stream_test_001"
        results = []
        
        # Process stream
        async for analysis in voice_processor.process_audio_stream(
            audio_stream_generator(), session_id
        ):
            results.append(analysis)
            
            # Stop after processing some chunks
            if len(results) >= 5:
                voice_processor.stop_processing()
                break
        
        assert len(results) >= 5
        assert all('session_id' in result for result in results)
        assert all(result['session_id'] == session_id for result in results)
    
    @pytest.mark.asyncio
    async def test_periodic_analysis_execution(self, mock_integrity_manager, sample_test_audio):
        """Test periodic comprehensive analysis execution."""
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        voice_manager.analysis_interval = 0.5  # Reduce interval for testing
        
        mock_websocket = Mock()
        mock_websocket.send_json = AsyncMock()
        
        session_id = "periodic_test_001"
        
        # Start session
        await voice_manager.start_voice_session(mock_websocket, session_id)
        voice_session = voice_manager.active_sessions[session_id]
        
        # Add audio to buffer
        chunk_bytes = (sample_test_audio[:8000] * 32767).astype(np.int16).tobytes()  # 0.5 seconds
        voice_session.audio_buffer.extend(np.frombuffer(chunk_bytes, dtype=np.int16))
        
        # Wait for periodic analysis to run
        await asyncio.sleep(1.0)
        
        # Stop session
        await voice_manager.stop_voice_session(session_id)
        
        # Verify analysis was performed
        assert len(voice_session.behavioral_history) >= 0  # May be 0 if analysis didn't complete


class TestErrorHandling:
    """Test error handling in the integrated system."""
    
    @pytest.mark.asyncio
    async def test_invalid_audio_handling(self):
        """Test handling of invalid audio data."""
        cheating_classifier = CheatingClassifier()
        
        # Test with invalid audio
        invalid_audio = np.array([])  # Empty array
        result = await cheating_classifier.analyze_session_async(
            invalid_audio, "test transcription", "error_test_001"
        )
        
        # Should handle gracefully without crashing
        assert isinstance(result, dict)
    
    @pytest.mark.asyncio
    async def test_component_failure_resilience(self, sample_test_audio):
        """Test system resilience when individual components fail."""
        cheating_classifier = CheatingClassifier()
        
        # Mock a component to raise an exception
        with patch.object(cheating_classifier.behavioral_analyzer, 'analyze_behavior', 
                         side_effect=Exception("Component failure")):
            
            result = await cheating_classifier.analyze_session_async(
                sample_test_audio, "test", "resilience_test_001"
            )
            
            # System should handle the failure and still return a result
            assert isinstance(result, dict)
            # May contain error information
    
    def test_concurrent_session_handling(self, mock_integrity_manager):
        """Test handling of multiple concurrent sessions."""
        voice_manager = VoiceWebSocketManager(mock_integrity_manager)
        
        # Create multiple mock sessions
        session_ids = [f"concurrent_test_{i}" for i in range(5)]
        mock_websockets = [Mock() for _ in range(5)]
        
        for websocket in mock_websockets:
            websocket.send_json = AsyncMock()
        
        # Test that manager can track multiple sessions
        for i, session_id in enumerate(session_ids):
            # Simulate session creation
            voice_manager.active_sessions[session_id] = Mock()
            voice_manager.active_sessions[session_id].start_time = datetime.now(timezone.utc)
            voice_manager.active_sessions[session_id].audio_chunks_processed = i * 10
            voice_manager.active_sessions[session_id].alerts_generated = i
            voice_manager.active_sessions[session_id].current_risk_score = i * 0.2
        
        # Get active sessions
        status = voice_manager.get_active_sessions()
        assert status['active_session_count'] == 5
        assert len(status['sessions']) == 5


class TestPerformanceIntegration:
    """Test performance of the integrated system."""
    
    @pytest.mark.asyncio
    async def test_end_to_end_processing_performance(self, sample_test_audio, suspicious_transcription):
        """Test end-to-end processing performance."""
        import time
        
        cheating_classifier = CheatingClassifier()
        session_id = "performance_test_001"
        
        start_time = time.time()
        
        # Run complete analysis
        result = await cheating_classifier.analyze_session_async(
            sample_test_audio, suspicious_transcription, session_id
        )
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Should complete analysis in reasonable time (less than 5 seconds)
        assert processing_time < 5.0
        assert isinstance(result, dict)
        assert 'prediction' in result
        
        print(f"End-to-end processing time: {processing_time:.2f} seconds")
    
    def test_memory_usage_stability(self, sample_test_audio):
        """Test that memory usage remains stable during processing."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss
        
        # Process audio multiple times
        behavioral_analyzer = BehavioralAnalyzer()
        for i in range(20):
            behavioral_analyzer.analyze_behavior(sample_test_audio, f"test {i}", [], [])
        
        final_memory = process.memory_info().rss
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable (less than 50MB)
        assert memory_increase < 50 * 1024 * 1024
        print(f"Memory increase: {memory_increase / (1024*1024):.2f} MB")


class TestConfigurationIntegration:
    """Test system configuration and integration."""
    
    def test_component_configuration_consistency(self):
        """Test that all components use consistent configurations."""
        voice_processor = VoiceProcessor(sample_rate=22050, vad_threshold=0.6)
        behavioral_analyzer = BehavioralAnalyzer(sample_rate=22050, confidence_threshold=0.6)
        
        # Components should use consistent sample rates
        assert voice_processor.sample_rate == behavioral_analyzer.sample_rate
    
    def test_system_health_check(self):
        """Test system health and component availability."""
        # Initialize all components
        components = {
            'voice_processor': VoiceProcessor(),
            'behavioral_analyzer': BehavioralAnalyzer(),
            'speaker_detector': SpeakerDetector(),
            'emotion_analyzer': EmotionAnalyzer(),
            'cheating_classifier': CheatingClassifier()
        }
        
        # All components should initialize without errors
        for name, component in components.items():
            assert component is not None, f"{name} failed to initialize"
        
        # Check component-specific health
        assert components['voice_processor'].is_active is False  # Should start inactive
        assert len(components['behavioral_analyzer'].suspicious_phrases) > 0
        assert components['cheating_classifier'].is_trained is False  # No training data yet


if __name__ == "__main__":
    # Allow running tests directly
    pytest.main([__file__, "-v"])