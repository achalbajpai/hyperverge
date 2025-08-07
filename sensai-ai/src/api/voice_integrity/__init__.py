"""
Voice Integrity Detection System

This module provides comprehensive real-time voice analysis for detecting
cheating and suspicious behavior during tests and assessments.

Key Features:
- Real-time Voice Activity Detection (VAD) using Silero
- Multi-speaker detection and analysis
- Emotional state and stress detection
- Content analysis and transcription
- Behavioral pattern recognition
- Integration with existing integrity system
"""

from .real_time_processor import VoiceProcessor
from .behavioral_analyzer import BehavioralAnalyzer
from .speaker_detector import SpeakerDetector
from .emotion_analyzer import EmotionAnalyzer
from .cheating_classifier import CheatingClassifier

__version__ = "1.0.0"
__all__ = [
    "VoiceProcessor",
    "BehavioralAnalyzer", 
    "SpeakerDetector",
    "EmotionAnalyzer",
    "CheatingClassifier"
]