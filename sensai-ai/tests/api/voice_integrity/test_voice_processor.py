"""
Tests for Voice Processor Module

This module contains comprehensive tests for the real-time voice processing
system including VAD, audio analysis, and pattern detection.
"""

import pytest
import numpy as np
import asyncio
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock

# Try to import voice integrity modules
try:
    from api.voice_integrity.real_time_processor import VoiceProcessor
    VOICE_MODULES_AVAILABLE = True
except ImportError:
    VOICE_MODULES_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not VOICE_MODULES_AVAILABLE,
    reason="Voice integrity modules not available"
)


@pytest.fixture
def voice_processor():
    """Create a VoiceProcessor instance for testing."""
    return VoiceProcessor(
        sample_rate=16000,
        chunk_size=512,
        vad_threshold=0.5
    )


@pytest.fixture
def sample_audio():
    """Create sample audio data for testing."""
    # Generate 1 second of sample audio (16kHz, sine wave)
    sample_rate = 16000
    duration = 1.0
    frequency = 440  # A4 note
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio = np.sin(2 * np.pi * frequency * t).astype(np.float32)
    return audio


@pytest.fixture
def sample_audio_bytes():
    """Create sample audio data as bytes."""
    # Generate 1 second of audio as 16-bit PCM
    sample_rate = 16000
    duration = 1.0
    frequency = 440
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio = (np.sin(2 * np.pi * frequency * t) * 32767).astype(np.int16)
    return audio.tobytes()


class TestVoiceProcessor:
    """Test cases for the VoiceProcessor class."""
    
    def test_initialization(self, voice_processor):
        """Test VoiceProcessor initialization."""
        assert voice_processor.sample_rate == 16000
        assert voice_processor.chunk_size == 512
        assert voice_processor.vad_threshold == 0.5
        assert voice_processor.is_active is False
        assert len(voice_processor.callbacks) == 0
    
    def test_add_remove_callback(self, voice_processor):
        """Test callback management."""
        callback_mock = Mock()
        
        # Add callback
        voice_processor.add_callback(callback_mock)
        assert callback_mock in voice_processor.callbacks
        
        # Remove callback
        voice_processor.remove_callback(callback_mock)
        assert callback_mock not in voice_processor.callbacks
    
    def test_analyze_audio_chunk(self, voice_processor, sample_audio_bytes):
        """Test audio chunk analysis."""
        result = voice_processor.analyze_audio_chunk(sample_audio_bytes)
        
        # Check required fields
        assert 'is_speech' in result
        assert 'silero_probability' in result
        assert 'rms_energy' in result
        assert 'zero_crossing_rate' in result
        assert 'audio_length_seconds' in result
        assert 'timestamp' in result
        
        # Check data types
        assert isinstance(result['is_speech'], bool)
        assert isinstance(result['silero_probability'], float)
        assert isinstance(result['rms_energy'], float)
        assert isinstance(result['zero_crossing_rate'], float)
        assert result['audio_length_seconds'] > 0
    
    @patch('api.voice_integrity.real_time_processor.load_silero_vad')
    def test_silero_vad_detection(self, mock_load_vad, voice_processor, sample_audio):
        """Test Silero VAD detection."""
        # Mock Silero model
        mock_model = Mock()
        mock_model.return_value.item.return_value = 0.8
        mock_load_vad.return_value = mock_model
        
        voice_processor._initialize_models()
        
        probability = voice_processor.detect_voice_activity_silero(sample_audio)
        assert isinstance(probability, float)
        assert 0.0 <= probability <= 1.0
    
    def test_webrtc_vad_detection_fallback(self, voice_processor, sample_audio_bytes):
        """Test WebRTC VAD detection fallback."""
        # When WebRTC is not available, should return False
        result = voice_processor.detect_voice_activity_webrtc(sample_audio_bytes)
        assert isinstance(result, bool)
    
    def test_session_summary(self, voice_processor):
        """Test session summary generation."""
        # Start a mock session
        voice_processor.session_start_time = datetime.now(timezone.utc)
        voice_processor.total_speech_time = 10.0
        voice_processor.total_silence_time = 5.0
        
        summary = voice_processor.get_session_summary()
        
        assert 'session_duration_seconds' in summary
        assert 'total_speech_time' in summary
        assert 'total_silence_time' in summary
        assert 'speech_ratio' in summary
        assert summary['total_speech_time'] == 10.0
        assert summary['total_silence_time'] == 5.0
    
    def test_suspicious_pattern_detection(self, voice_processor, sample_audio_bytes):
        """Test suspicious pattern detection."""
        # Process audio that should trigger suspicious patterns
        initial_suspicious_count = len(voice_processor.suspicious_events)
        
        # Analyze chunk
        voice_processor.analyze_audio_chunk(sample_audio_bytes)
        
        # Check if suspicious events are tracked
        assert len(voice_processor.suspicious_events) >= initial_suspicious_count
    
    @pytest.mark.asyncio
    async def test_audio_stream_processing(self, voice_processor, sample_audio_bytes):
        """Test audio stream processing."""
        async def mock_audio_stream():
            """Mock audio stream generator."""
            for i in range(3):
                yield sample_audio_bytes
                await asyncio.sleep(0.1)
        
        session_id = "test_session_001"
        results = []
        
        # Process stream
        async for result in voice_processor.process_audio_stream(mock_audio_stream(), session_id):
            results.append(result)
        
        assert len(results) == 3
        assert all('session_id' in result for result in results)
        assert all(result['session_id'] == session_id for result in results)
    
    def test_reset_session(self, voice_processor):
        """Test session reset functionality."""
        # Set some session data
        voice_processor.session_start_time = datetime.now(timezone.utc)
        voice_processor.total_speech_time = 5.0
        voice_processor.speech_events = [{'test': 'data'}]
        
        # Reset session
        voice_processor.reset_session()
        
        # Verify reset
        assert voice_processor.session_start_time is None
        assert voice_processor.total_speech_time == 0.0
        assert len(voice_processor.speech_events) == 0
        assert voice_processor.is_active is False


class TestVoiceProcessorIntegration:
    """Integration tests for VoiceProcessor."""
    
    @pytest.mark.asyncio
    async def test_callback_notification(self, voice_processor, sample_audio_bytes):
        """Test callback notifications during processing."""
        callback_calls = []
        
        async def test_callback(event):
            callback_calls.append(event)
        
        voice_processor.add_callback(test_callback)
        
        # Analyze audio chunk
        voice_processor.analyze_audio_chunk(sample_audio_bytes)
        
        # Give callbacks time to execute
        await asyncio.sleep(0.1)
        
        # Should have received callback
        assert len(callback_calls) > 0
        assert all('timestamp' in call for call in callback_calls)
        assert all('type' in call for call in callback_calls)
    
    def test_buffer_management(self, voice_processor, sample_audio_bytes):
        """Test audio buffer management."""
        # Process many chunks to test buffer size limits
        for _ in range(1500):  # More than max buffer size
            voice_processor.analyze_audio_chunk(sample_audio_bytes)
        
        # Buffer should be limited to max size
        assert len(voice_processor.audio_buffer) <= 1000
    
    def test_factory_function(self):
        """Test factory function for creating VoiceProcessor."""
        from api.voice_integrity.real_time_processor import create_voice_processor
        
        processor = create_voice_processor(
            sample_rate=22050,
            vad_threshold=0.3
        )
        
        assert processor.sample_rate == 22050
        assert processor.vad_threshold == 0.3


class TestVoiceProcessorError:
    """Test error handling in VoiceProcessor."""
    
    def test_invalid_audio_data(self, voice_processor):
        """Test handling of invalid audio data."""
        # Test with empty bytes
        result = voice_processor.analyze_audio_chunk(b'')
        assert 'timestamp' in result  # Should still return valid result
        
        # Test with invalid data
        result = voice_processor.analyze_audio_chunk(b'invalid')
        assert isinstance(result, dict)
    
    @patch('api.voice_integrity.real_time_processor.torch')
    def test_silero_model_error(self, mock_torch, voice_processor, sample_audio):
        """Test handling of Silero model errors."""
        # Mock torch to raise an exception
        mock_torch.tensor.side_effect = Exception("Model error")
        
        # Should not crash, should return 0.0
        result = voice_processor.detect_voice_activity_silero(sample_audio)
        assert result == 0.0
    
    @pytest.mark.asyncio
    async def test_stream_processing_error(self, voice_processor):
        """Test error handling in stream processing."""
        async def failing_audio_stream():
            yield b'valid_data'
            raise Exception("Stream error")
        
        results = []
        session_id = "test_session_error"
        
        # Should handle the error gracefully
        async for result in voice_processor.process_audio_stream(failing_audio_stream(), session_id):
            results.append(result)
        
        # Should have processed at least one chunk before error
        assert len(results) >= 1


@pytest.mark.parametrize("sample_rate,chunk_size,threshold", [
    (8000, 256, 0.3),
    (16000, 512, 0.5),
    (22050, 1024, 0.7),
])
def test_voice_processor_configurations(sample_rate, chunk_size, threshold):
    """Test VoiceProcessor with different configurations."""
    processor = VoiceProcessor(
        sample_rate=sample_rate,
        chunk_size=chunk_size,
        vad_threshold=threshold
    )
    
    assert processor.sample_rate == sample_rate
    assert processor.chunk_size == chunk_size
    assert processor.vad_threshold == threshold


class TestVoiceProcessorPerformance:
    """Performance tests for VoiceProcessor."""
    
    def test_processing_speed(self, voice_processor, sample_audio_bytes):
        """Test processing speed with timing."""
        import time
        
        start_time = time.time()
        
        # Process 100 chunks
        for _ in range(100):
            voice_processor.analyze_audio_chunk(sample_audio_bytes)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Should process 100 chunks in reasonable time (less than 1 second)
        assert processing_time < 1.0
        
        # Calculate chunks per second
        chunks_per_second = 100 / processing_time
        print(f"Processing speed: {chunks_per_second:.2f} chunks/second")
        
        # Should be able to process at least 30 chunks per second for real-time
        assert chunks_per_second > 30


if __name__ == "__main__":
    # Allow running tests directly
    pytest.main([__file__])