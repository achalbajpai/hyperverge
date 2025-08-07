"""
Voice Integrity Test Suite

This package contains comprehensive tests for the voice-based integrity detection system.

Test Modules:
- test_voice_processor: Tests for real-time voice processing and VAD
- test_behavioral_analyzer: Tests for behavioral pattern detection
- test_integration: End-to-end integration tests

To run all voice integrity tests:
    pytest tests/api/voice_integrity/

To run specific test modules:
    pytest tests/api/voice_integrity/test_voice_processor.py
    pytest tests/api/voice_integrity/test_behavioral_analyzer.py
    pytest tests/api/voice_integrity/test_integration.py

Test Coverage:
- Real-time voice activity detection
- Behavioral pattern analysis
- Content analysis and suspicious phrase detection
- Speaker diarization and multi-speaker detection
- Emotion and stress detection
- ML-based cheating classification
- WebSocket real-time processing
- End-to-end system integration
- Error handling and edge cases
- Performance testing
"""

__version__ = "1.0.0"
__author__ = "Voice Integrity Test Suite"