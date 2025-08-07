"""
Speaker Detection and Diarization Module

This module implements advanced speaker diarization using pyannote.audio
to detect multiple speakers and analyze speaker patterns for cheating detection.
"""

import asyncio
import logging
import numpy as np
from typing import Dict, List, Tuple, Optional, AsyncGenerator
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import tempfile
import os
import io
import json

try:
    import torch
    import torchaudio
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logging.warning("PyTorch not available. Install with: pip install torch torchaudio")

try:
    from pyannote.audio import Pipeline
    from pyannote.audio.pipelines.speaker_diarization import SpeakerDiarization
    from pyannote.core import Annotation, Segment
    PYANNOTE_AVAILABLE = True
except ImportError:
    PYANNOTE_AVAILABLE = False
    logging.warning("pyannote.audio not available. Install with: pip install pyannote.audio")

try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    SOUNDFILE_AVAILABLE = False
    logging.warning("soundfile not available. Install with: pip install soundfile")

@dataclass
class SpeakerSegment:
    """Data class for speaker segment information."""
    speaker_id: str
    start_time: float
    end_time: float
    duration: float
    confidence: float
    audio_features: Dict

@dataclass
class SpeakerAnalysis:
    """Data class for speaker analysis results."""
    total_speakers: int
    primary_speaker_ratio: float
    speaker_switches: int
    overlapping_speech_duration: float
    speaker_segments: List[SpeakerSegment]
    suspicious_patterns: List[str]
    confidence_score: float
    analysis_timestamp: str

class SpeakerDetector:
    """
    Advanced speaker diarization and analysis system for detecting
    multiple speakers and suspicious conversation patterns.
    """
    
    def __init__(self, 
                 model_name: str = "pyannote/speaker-diarization@2.1",
                 min_speakers: int = 1,
                 max_speakers: int = 5,
                 segmentation_threshold: float = 0.5):
        """
        Initialize the speaker detector.
        
        Args:
            model_name: Pretrained model name for diarization
            min_speakers: Minimum number of speakers to detect
            max_speakers: Maximum number of speakers to detect
            segmentation_threshold: Threshold for speaker segmentation
        """
        self.model_name = model_name
        self.min_speakers = min_speakers
        self.max_speakers = max_speakers
        self.segmentation_threshold = segmentation_threshold
        
        self.logger = logging.getLogger(__name__)
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Initialize models
        self.pipeline = None
        self.model_loaded = False
        
        # Analysis state
        self.current_session = None
        self.speaker_history = []
        self.analysis_cache = {}
        
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize the pyannote.audio diarization pipeline."""
        if not PYANNOTE_AVAILABLE or not TORCH_AVAILABLE:
            self.logger.error("Required dependencies not available for speaker diarization")
            return
        
        try:
            # Note: This requires a Hugging Face token for the pretrained model
            # Users need to set HF_TOKEN environment variable
            hf_token = os.getenv('HF_TOKEN')
            if not hf_token:
                self.logger.warning("HF_TOKEN not set. Using fallback speaker detection.")
                return
            
            self.pipeline = Pipeline.from_pretrained(
                self.model_name,
                use_auth_token=hf_token
            )
            self.pipeline.to(self.device)
            self.model_loaded = True
            self.logger.info(f"Speaker diarization model loaded: {self.model_name}")
            
        except Exception as e:
            self.logger.error(f"Failed to load speaker diarization model: {e}")
            self.model_loaded = False
    
    def _save_audio_to_temp_file(self, audio_data: np.ndarray, sample_rate: int) -> str:
        """
        Save audio data to temporary file for processing.
        
        Args:
            audio_data: Audio data as numpy array
            sample_rate: Audio sample rate
            
        Returns:
            Path to temporary audio file
        """
        if not SOUNDFILE_AVAILABLE:
            raise ImportError("soundfile required for audio processing")
        
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        sf.write(temp_file.name, audio_data, sample_rate)
        return temp_file.name
    
    def _extract_speaker_features(self, audio_data: np.ndarray, 
                                segment: Tuple[float, float]) -> Dict:
        """
        Extract audio features for a speaker segment.
        
        Args:
            audio_data: Audio data
            segment: (start_time, end_time) tuple
            
        Returns:
            Dictionary of extracted features
        """
        start_sample = int(segment[0] * 16000)  # Assuming 16kHz
        end_sample = int(segment[1] * 16000)
        segment_audio = audio_data[start_sample:end_sample]
        
        if len(segment_audio) == 0:
            return {}
        
        # Basic audio features
        rms = np.sqrt(np.mean(segment_audio**2))
        zero_crossing_rate = np.sum(np.diff(np.sign(segment_audio)) != 0) / len(segment_audio)
        
        # Spectral features (if possible)
        features = {
            'rms_energy': float(rms),
            'zero_crossing_rate': float(zero_crossing_rate),
            'segment_length': len(segment_audio),
            'max_amplitude': float(np.max(np.abs(segment_audio))),
            'min_amplitude': float(np.min(np.abs(segment_audio)))
        }
        
        return features
    
    def perform_speaker_diarization(self, audio_data: np.ndarray, 
                                  sample_rate: int = 16000) -> Optional[Annotation]:
        """
        Perform speaker diarization on audio data.
        
        Args:
            audio_data: Audio data as numpy array
            sample_rate: Audio sample rate
            
        Returns:
            pyannote Annotation object or None if failed
        """
        if not self.model_loaded:
            self.logger.warning("Speaker diarization model not available")
            return None
        
        try:
            # Save audio to temporary file
            temp_file = self._save_audio_to_temp_file(audio_data, sample_rate)
            
            try:
                # Perform diarization
                diarization = self.pipeline(temp_file)
                return diarization
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
                
        except Exception as e:
            self.logger.error(f"Speaker diarization failed: {e}")
            return None
    
    def analyze_speaker_patterns(self, diarization: Annotation, 
                               audio_data: np.ndarray) -> SpeakerAnalysis:
        """
        Analyze speaker patterns from diarization results.
        
        Args:
            diarization: pyannote Annotation object
            audio_data: Original audio data
            
        Returns:
            Comprehensive speaker analysis
        """
        if not diarization:
            return SpeakerAnalysis(
                total_speakers=0,
                primary_speaker_ratio=1.0,
                speaker_switches=0,
                overlapping_speech_duration=0.0,
                speaker_segments=[],
                suspicious_patterns=[],
                confidence_score=0.0,
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )
        
        # Extract speaker information
        speakers = list(diarization.labels())
        total_speakers = len(speakers)
        
        # Analyze speaker segments
        speaker_segments = []
        speaker_durations = {speaker: 0.0 for speaker in speakers}
        
        for segment, _, speaker in diarization.itertracks(yield_label=True):
            duration = segment.end - segment.start
            speaker_durations[speaker] += duration
            
            # Extract audio features for this segment
            audio_features = self._extract_speaker_features(
                audio_data, (segment.start, segment.end)
            )
            
            speaker_segments.append(SpeakerSegment(
                speaker_id=speaker,
                start_time=segment.start,
                end_time=segment.end,
                duration=duration,
                confidence=0.8,  # Default confidence
                audio_features=audio_features
            ))
        
        # Calculate primary speaker ratio
        total_duration = sum(speaker_durations.values())
        primary_duration = max(speaker_durations.values()) if speaker_durations else 0
        primary_speaker_ratio = primary_duration / total_duration if total_duration > 0 else 0
        
        # Count speaker switches
        speaker_switches = self._count_speaker_switches(diarization)
        
        # Detect overlapping speech
        overlapping_duration = self._detect_overlapping_speech(diarization)
        
        # Identify suspicious patterns
        suspicious_patterns = self._identify_suspicious_patterns(
            total_speakers, speaker_switches, primary_speaker_ratio, overlapping_duration
        )
        
        # Calculate confidence score
        confidence_score = self._calculate_diarization_confidence(
            total_speakers, speaker_switches, primary_speaker_ratio
        )
        
        return SpeakerAnalysis(
            total_speakers=total_speakers,
            primary_speaker_ratio=primary_speaker_ratio,
            speaker_switches=speaker_switches,
            overlapping_speech_duration=overlapping_duration,
            speaker_segments=speaker_segments,
            suspicious_patterns=suspicious_patterns,
            confidence_score=confidence_score,
            analysis_timestamp=datetime.now(timezone.utc).isoformat()
        )
    
    def _count_speaker_switches(self, diarization: Annotation) -> int:
        """Count the number of speaker switches."""
        switches = 0
        prev_speaker = None
        
        for segment, _, speaker in diarization.itertracks(yield_label=True):
            if prev_speaker is not None and speaker != prev_speaker:
                switches += 1
            prev_speaker = speaker
        
        return switches
    
    def _detect_overlapping_speech(self, diarization: Annotation) -> float:
        """Detect and measure overlapping speech duration."""
        # This is a simplified implementation
        # In practice, you'd need more sophisticated overlap detection
        overlapping_duration = 0.0
        
        segments = [(segment.start, segment.end, speaker) 
                   for segment, _, speaker in diarization.itertracks(yield_label=True)]
        
        for i in range(len(segments)):
            for j in range(i + 1, len(segments)):
                start1, end1, speaker1 = segments[i]
                start2, end2, speaker2 = segments[j]
                
                if speaker1 != speaker2:
                    # Check for overlap
                    overlap_start = max(start1, start2)
                    overlap_end = min(end1, end2)
                    
                    if overlap_start < overlap_end:
                        overlapping_duration += overlap_end - overlap_start
        
        return overlapping_duration
    
    def _identify_suspicious_patterns(self, total_speakers: int, 
                                    speaker_switches: int,
                                    primary_ratio: float,
                                    overlapping_duration: float) -> List[str]:
        """Identify suspicious speaker patterns that might indicate cheating."""
        patterns = []
        
        # Multiple speakers detected
        if total_speakers > 1:
            patterns.append(f"Multiple speakers detected ({total_speakers})")
        
        # Too many speaker switches (conversation-like)
        if speaker_switches > 10:
            patterns.append(f"Frequent speaker switches ({speaker_switches})")
        
        # No dominant speaker (equal participation)
        if total_speakers > 1 and primary_ratio < 0.6:
            patterns.append("No dominant speaker (potential collaboration)")
        
        # Significant overlapping speech
        if overlapping_duration > 5.0:  # 5 seconds of overlap
            patterns.append(f"Overlapping speech detected ({overlapping_duration:.1f}s)")
        
        # Very quick alternating speakers (coaching pattern)
        if total_speakers == 2 and speaker_switches > 5:
            patterns.append("Rapid alternating speakers (potential coaching)")
        
        return patterns
    
    def _calculate_diarization_confidence(self, speakers: int, 
                                        switches: int, 
                                        primary_ratio: float) -> float:
        """Calculate confidence score for diarization results."""
        confidence = 1.0
        
        # Reduce confidence for complex speaker scenarios
        if speakers > 2:
            confidence -= 0.1 * (speakers - 2)
        
        # Reduce confidence for excessive switches
        if switches > 20:
            confidence -= 0.2
        
        # Reduce confidence for unclear primary speaker
        if speakers > 1 and primary_ratio < 0.4:
            confidence -= 0.3
        
        return max(0.0, min(1.0, confidence))
    
    async def analyze_audio_async(self, audio_data: np.ndarray, 
                                session_id: str,
                                sample_rate: int = 16000) -> Dict:
        """
        Asynchronously analyze audio for speaker patterns.
        
        Args:
            audio_data: Audio data
            session_id: Test session ID
            sample_rate: Audio sample rate
            
        Returns:
            Speaker analysis results
        """
        # Check cache first
        cache_key = f"{session_id}_{len(audio_data)}"
        if cache_key in self.analysis_cache:
            return self.analysis_cache[cache_key]
        
        try:
            # Perform diarization
            diarization = await asyncio.get_event_loop().run_in_executor(
                None, self.perform_speaker_diarization, audio_data, sample_rate
            )
            
            # Analyze patterns
            analysis = await asyncio.get_event_loop().run_in_executor(
                None, self.analyze_speaker_patterns, diarization, audio_data
            )
            
            # Convert to dict and cache
            result = asdict(analysis)
            result['session_id'] = session_id
            
            self.analysis_cache[cache_key] = result
            
            # Store in history
            self.speaker_history.append(result)
            
            self.logger.info(f"Speaker analysis completed for session {session_id}. "
                           f"Speakers: {analysis.total_speakers}, "
                           f"Patterns: {len(analysis.suspicious_patterns)}")
            
            return result
            
        except Exception as e:
            self.logger.error(f"Speaker analysis failed: {e}")
            return {
                'error': str(e),
                'session_id': session_id,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
    
    def get_fallback_analysis(self, audio_data: np.ndarray) -> Dict:
        """
        Provide fallback speaker analysis when advanced models are unavailable.
        
        Args:
            audio_data: Audio data
            
        Returns:
            Basic speaker analysis
        """
        # Basic energy-based speaker detection
        chunk_size = len(audio_data) // 10  # 10 chunks
        chunks = [audio_data[i:i+chunk_size] for i in range(0, len(audio_data), chunk_size)]
        
        # Calculate energy for each chunk
        energies = [np.sqrt(np.mean(chunk**2)) for chunk in chunks if len(chunk) > 0]
        
        # Simple heuristic: high variation in energy might indicate multiple speakers
        energy_variation = np.std(energies) / np.mean(energies) if energies else 0
        
        # Estimate speaker count based on energy variation
        estimated_speakers = 1
        if energy_variation > 0.5:
            estimated_speakers = 2
        
        return {
            'total_speakers': estimated_speakers,
            'primary_speaker_ratio': 0.8 if estimated_speakers == 1 else 0.6,
            'speaker_switches': int(energy_variation * 10),
            'overlapping_speech_duration': 0.0,
            'speaker_segments': [],
            'suspicious_patterns': ["Fallback analysis - limited accuracy"] if estimated_speakers > 1 else [],
            'confidence_score': 0.4,  # Low confidence for fallback
            'analysis_timestamp': datetime.now(timezone.utc).isoformat(),
            'fallback': True
        }
    
    def get_session_summary(self) -> Dict:
        """Get summary of all speaker analysis sessions."""
        if not self.speaker_history:
            return {'message': 'No speaker analysis data available'}
        
        total_sessions = len(self.speaker_history)
        multi_speaker_sessions = sum(1 for h in self.speaker_history 
                                   if h.get('total_speakers', 0) > 1)
        
        return {
            'total_sessions_analyzed': total_sessions,
            'multi_speaker_sessions': multi_speaker_sessions,
            'multi_speaker_percentage': (multi_speaker_sessions / total_sessions * 100) 
                                      if total_sessions > 0 else 0,
            'recent_analyses': self.speaker_history[-5:],
            'model_available': self.model_loaded
        }