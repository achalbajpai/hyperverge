"""
Real-Time Voice Processor using Silero VAD

This module handles continuous audio stream processing with sub-millisecond
voice activity detection for real-time cheating detection during tests.
"""

import asyncio
import logging
import numpy as np
import torch
import io
from typing import AsyncGenerator, Dict, List, Optional, Callable
from datetime import datetime, timezone
import json

try:
    import silero_vad
    from silero_vad import load_silero_vad, read_audio, get_speech_timestamps
    SILERO_AVAILABLE = True
except ImportError:
    SILERO_AVAILABLE = False
    logging.warning("Silero VAD not available. Install with: pip install silero-vad")

try:
    import webrtcvad
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False
    logging.warning("WebRTC VAD not available. Install with: pip install webrtcvad")

try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    logging.warning("PyAudio not available. Install with: pip install pyaudio")

class VoiceProcessor:
    """
    Real-time voice activity detection and processing engine.
    
    Uses Silero VAD for high-accuracy, low-latency voice detection
    with comprehensive audio analysis capabilities.
    """
    
    def __init__(self, 
                 sample_rate: int = 16000,
                 chunk_size: int = 512,
                 vad_threshold: float = 0.5,
                 min_silence_duration: float = 0.5,
                 min_speech_duration: float = 0.3):
        """
        Initialize the voice processor.
        
        Args:
            sample_rate: Audio sample rate (Hz)
            chunk_size: Audio chunk size for processing
            vad_threshold: Voice activity detection threshold (0-1)
            min_silence_duration: Minimum silence duration (seconds)
            min_speech_duration: Minimum speech duration (seconds)
        """
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.vad_threshold = vad_threshold
        self.min_silence_duration = min_silence_duration
        self.min_speech_duration = min_speech_duration
        
        self.logger = logging.getLogger(__name__)
        self.is_active = False
        self.audio_buffer = []
        self.speech_segments = []
        self.callbacks: List[Callable] = []
        
        # Initialize VAD models
        self.silero_model = None
        self.webrtc_vad = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Session tracking
        self.session_start_time = None
        self.total_speech_time = 0.0
        self.total_silence_time = 0.0
        self.speech_events = []
        self.suspicious_events = []
        
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize VAD models."""
        if SILERO_AVAILABLE:
            try:
                self.silero_model = load_silero_vad()
                self.silero_model.to(self.device)
                self.logger.info("Silero VAD model loaded successfully")
            except Exception as e:
                self.logger.error(f"Failed to load Silero VAD: {e}")
        
        if WEBRTC_AVAILABLE:
            try:
                self.webrtc_vad = webrtcvad.Vad(2)  # Aggressiveness mode 2
                self.logger.info("WebRTC VAD initialized successfully") 
            except Exception as e:
                self.logger.error(f"Failed to initialize WebRTC VAD: {e}")
    
    def add_callback(self, callback: Callable):
        """Add a callback function for voice events."""
        self.callbacks.append(callback)
    
    def remove_callback(self, callback: Callable):
        """Remove a callback function."""
        if callback in self.callbacks:
            self.callbacks.remove(callback)
    
    def _notify_callbacks(self, event_type: str, data: Dict):
        """Notify all registered callbacks of voice events."""
        event = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'type': event_type,
            'data': data
        }
        
        for callback in self.callbacks:
            try:
                asyncio.create_task(callback(event))
            except Exception as e:
                self.logger.error(f"Callback error: {e}")
    
    def detect_voice_activity_silero(self, audio_chunk: np.ndarray) -> float:
        """
        Detect voice activity using Silero VAD.
        
        Args:
            audio_chunk: Audio data as numpy array
            
        Returns:
            Voice probability (0-1)
        """
        if not self.silero_model:
            return 0.0
        
        try:
            # Convert to tensor
            audio_tensor = torch.tensor(audio_chunk, dtype=torch.float32)
            
            # Get voice probability
            with torch.no_grad():
                voice_prob = self.silero_model(audio_tensor, self.sample_rate).item()
            
            return voice_prob
            
        except Exception as e:
            self.logger.error(f"Silero VAD error: {e}")
            return 0.0
    
    def detect_voice_activity_webrtc(self, audio_chunk: bytes) -> bool:
        """
        Detect voice activity using WebRTC VAD.
        
        Args:
            audio_chunk: Audio data as bytes
            
        Returns:
            True if voice is detected
        """
        if not self.webrtc_vad:
            return False
        
        try:
            return self.webrtc_vad.is_speech(audio_chunk, self.sample_rate)
        except Exception as e:
            self.logger.error(f"WebRTC VAD error: {e}")
            return False
    
    def analyze_audio_chunk(self, audio_data: bytes) -> Dict:
        """
        Analyze an audio chunk for voice activity and characteristics.
        
        Args:
            audio_data: Raw audio data
            
        Returns:
            Analysis results dictionary
        """
        # Convert to numpy array
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0  # Normalize
        
        # Detect voice activity
        silero_prob = self.detect_voice_activity_silero(audio_np)
        webrtc_detected = self.detect_voice_activity_webrtc(audio_data)
        
        # Calculate audio characteristics
        rms = np.sqrt(np.mean(audio_np**2))
        zero_crossing_rate = np.sum(np.diff(np.sign(audio_np)) != 0) / len(audio_np)
        
        # Determine if speech is present
        is_speech = silero_prob > self.vad_threshold
        
        analysis = {
            'is_speech': is_speech,
            'silero_probability': silero_prob,
            'webrtc_detected': webrtc_detected,
            'rms_energy': float(rms),
            'zero_crossing_rate': float(zero_crossing_rate),
            'audio_length_seconds': len(audio_np) / self.sample_rate,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        # Track speech/silence periods
        if is_speech:
            self.total_speech_time += analysis['audio_length_seconds']
        else:
            self.total_silence_time += analysis['audio_length_seconds']
        
        # Detect suspicious patterns
        self._detect_suspicious_patterns(analysis)
        
        return analysis
    
    def _detect_suspicious_patterns(self, analysis: Dict):
        """Detect suspicious voice patterns that might indicate cheating."""
        suspicious_indicators = []
        
        # Very low energy speech (whispering)
        if analysis['is_speech'] and analysis['rms_energy'] < 0.01:
            suspicious_indicators.append('low_energy_speech')
        
        # High zero crossing rate (distorted audio, potential recording)
        if analysis['zero_crossing_rate'] > 0.3:
            suspicious_indicators.append('high_distortion')
        
        # Inconsistent Silero vs WebRTC detection
        if analysis['is_speech'] != analysis['webrtc_detected']:
            suspicious_indicators.append('vad_inconsistency')
        
        if suspicious_indicators:
            self.suspicious_events.append({
                'timestamp': analysis['timestamp'],
                'indicators': suspicious_indicators,
                'analysis': analysis
            })
            
            self._notify_callbacks('suspicious_pattern', {
                'indicators': suspicious_indicators,
                'analysis': analysis
            })
    
    async def process_audio_stream(self, audio_stream: AsyncGenerator[bytes, None],
                                 session_id: str) -> AsyncGenerator[Dict, None]:
        """
        Process continuous audio stream with real-time analysis.
        
        Args:
            audio_stream: Async generator of audio chunks
            session_id: Test session identifier
            
        Yields:
            Analysis results for each audio chunk
        """
        self.session_start_time = datetime.now(timezone.utc)
        self.is_active = True
        
        self.logger.info(f"Starting voice processing for session {session_id}")
        
        try:
            async for audio_chunk in audio_stream:
                if not self.is_active:
                    break
                
                # Analyze the audio chunk
                analysis = self.analyze_audio_chunk(audio_chunk)
                analysis['session_id'] = session_id
                
                # Store in buffer for further analysis
                self.audio_buffer.append(audio_chunk)
                
                # Keep buffer size manageable
                if len(self.audio_buffer) > 1000:  # ~30 seconds at 30 FPS
                    self.audio_buffer.pop(0)
                
                # Track speech events
                if analysis['is_speech']:
                    self.speech_events.append(analysis)
                
                # Notify callbacks
                self._notify_callbacks('voice_analysis', analysis)
                
                yield analysis
                
        except Exception as e:
            self.logger.error(f"Error processing audio stream: {e}")
            self._notify_callbacks('processing_error', {'error': str(e)})
        
        finally:
            self.is_active = False
            self.logger.info(f"Voice processing stopped for session {session_id}")
    
    def get_session_summary(self) -> Dict:
        """
        Generate a comprehensive session summary.
        
        Returns:
            Session analysis summary
        """
        if not self.session_start_time:
            return {'error': 'No active session'}
        
        session_duration = (datetime.now(timezone.utc) - self.session_start_time).total_seconds()
        
        return {
            'session_duration_seconds': session_duration,
            'total_speech_time': self.total_speech_time,
            'total_silence_time': self.total_silence_time,
            'speech_ratio': self.total_speech_time / session_duration if session_duration > 0 else 0,
            'total_speech_events': len(self.speech_events),
            'suspicious_events_count': len(self.suspicious_events),
            'suspicious_events': self.suspicious_events,
            'average_speech_confidence': np.mean([e['silero_probability'] for e in self.speech_events]) if self.speech_events else 0,
            'device_used': str(self.device),
            'models_available': {
                'silero': SILERO_AVAILABLE,
                'webrtc': WEBRTC_AVAILABLE,
                'pyaudio': PYAUDIO_AVAILABLE
            }
        }
    
    def stop_processing(self):
        """Stop the voice processing."""
        self.is_active = False
        self._notify_callbacks('processing_stopped', self.get_session_summary())
    
    def reset_session(self):
        """Reset session data for a new test."""
        self.audio_buffer.clear()
        self.speech_segments.clear()
        self.speech_events.clear()
        self.suspicious_events.clear()
        self.total_speech_time = 0.0
        self.total_silence_time = 0.0
        self.session_start_time = None
        self.is_active = False


# Factory function for easy initialization
def create_voice_processor(**kwargs) -> VoiceProcessor:
    """Create a VoiceProcessor with default settings."""
    return VoiceProcessor(**kwargs)