"""
Behavioral Analyzer for Voice-Based Cheating Detection

This module implements advanced behavioral analysis using multiple parameters
to detect suspicious patterns that may indicate cheating during tests.
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from collections import deque
import json
import re

try:
    from scipy import stats
    from scipy.signal import find_peaks

    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logging.warning("SciPy not available. Install with: pip install scipy")

try:
    import librosa

    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    logging.warning("Librosa not available. Install with: pip install librosa")


@dataclass
class BehavioralMetrics:
    """Data class for behavioral analysis metrics."""

    # Speech pattern metrics
    speech_rate: float = 0.0
    pause_frequency: float = 0.0
    average_pause_duration: float = 0.0
    speech_consistency: float = 0.0

    # Content analysis metrics
    question_reading_detected: bool = False
    help_seeking_phrases: int = 0
    answer_receiving_phrases: int = 0
    external_discussion: bool = False

    # Audio quality metrics
    background_noise_level: float = 0.0
    audio_quality_score: float = 1.0
    potential_recording: bool = False

    # Temporal pattern metrics
    unusual_silence_periods: int = 0
    rapid_speech_bursts: int = 0
    inconsistent_volume: bool = False

    # Confidence metrics
    overall_confidence: float = 0.0
    analysis_timestamp: str = ""


class BehavioralAnalyzer:
    """
    Advanced behavioral analysis engine for detecting cheating patterns
    through comprehensive voice and speech analysis.
    """

    def __init__(
        self,
        window_size: int = 30,  # seconds
        sample_rate: int = 16000,
        confidence_threshold: float = 0.7,
    ):
        """
        Initialize the behavioral analyzer.

        Args:
            window_size: Analysis window size in seconds
            sample_rate: Audio sample rate
            confidence_threshold: Minimum confidence for flagging behavior
        """
        self.window_size = window_size
        self.sample_rate = sample_rate
        self.confidence_threshold = confidence_threshold

        self.logger = logging.getLogger(__name__)

        # Analysis buffers
        self.audio_buffer = deque(maxlen=window_size * sample_rate)
        self.speech_segments = deque(maxlen=100)
        self.analysis_history = deque(maxlen=1000)

        # Behavioral patterns database
        self.suspicious_phrases = self._load_suspicious_phrases()
        self.help_seeking_patterns = self._load_help_seeking_patterns()
        self.answer_patterns = self._load_answer_patterns()

        # Baseline metrics (learned from normal behavior)
        self.baseline_metrics = None
        self.calibration_data = []

    def _load_suspicious_phrases(self) -> List[str]:
        """Load database of suspicious phrases that indicate cheating."""
        return [
            # English phrases
            "what is the answer",
            "help me with",
            "tell me",
            "can you help",
            "what should i write",
            "give me the answer",
            "how do i solve",
            "what's the solution",
            "i don't know this",
            "can you do this",
            "google it",
            "search for",
            "look it up",
            "check online",
            "ask someone",
            "call someone",
            "text someone",
            # Hindi phrases
            "जवाब क्या है",
            "मदद करो",
            "बताओ",
            "हल क्या है",
            "उत्तर दो",
            "यह कैसे करते हैं",
            "गूगल करो",
            # Bengali phrases
            "উত্তর কি",
            "সাহায্য করো",
            "বলো",
            "সমাধান কি",
            # Telugu phrases
            "జవాబు ఏమిటి",
            "సహాయం చేయి",
            "చెప్పు",
            "పరిష్కారం ఏమిటి",
            # Tamil phrases
            "பதில் என்ன",
            "உதவி செய்",
            "சொல்லு",
            "தீர்வு என்ன",
        ]

    def _load_help_seeking_patterns(self) -> List[str]:
        """Load patterns that indicate seeking help."""
        return [
            r"\b(what|how|where|when|why)\s+(is|are|do|does|should|would|can|could)",
            r"\b(help|assist|guide|show)\s+(me|us)",
            r"\b(i\s+don't\s+know|i\s+need\s+help|i'm\s+stuck)",
            r"\b(can\s+you|could\s+you|will\s+you|would\s+you)",
            r"\b(tell\s+me|show\s+me|give\s+me)",
        ]

    def _load_answer_patterns(self) -> List[str]:
        """Load patterns that indicate receiving answers."""
        return [
            r"\b(the\s+answer\s+is|it\s+is|it's)",
            r"\b(you\s+should|try\s+this|write\s+this)",
            r"\b(option\s+[abcd]|choice\s+[1234])",
            r"\b(correct\s+answer|right\s+answer)",
            r"\b(just\s+write|simply\s+put|the\s+solution)",
        ]

    def analyze_speech_patterns(
        self, audio_data: np.ndarray, speech_segments: List[Dict]
    ) -> Dict:
        """
        Analyze speech patterns for behavioral indicators.

        Args:
            audio_data: Audio data for analysis
            speech_segments: List of detected speech segments

        Returns:
            Speech pattern analysis results
        """
        if not speech_segments:
            return {
                "speech_rate": 0.0,
                "pause_frequency": 0.0,
                "average_pause_duration": 0.0,
                "speech_consistency": 0.0,
            }

        # Calculate speech rate (words per minute estimation)
        total_speech_time = sum(seg.get("duration", 0) for seg in speech_segments)
        estimated_words = total_speech_time * 2.5  # Average 2.5 words/second
        speech_rate = (
            (estimated_words / total_speech_time) * 60 if total_speech_time > 0 else 0
        )

        # Analyze pauses between speech segments
        pause_durations = []
        if len(speech_segments) > 1:
            for i in range(1, len(speech_segments)):
                prev_end = speech_segments[i - 1].get("end_time", 0)
                curr_start = speech_segments[i].get("start_time", 0)
                pause_duration = curr_start - prev_end
                if pause_duration > 0:
                    pause_durations.append(pause_duration)

        pause_frequency = (
            len(pause_durations) / total_speech_time if total_speech_time > 0 else 0
        )
        avg_pause_duration = np.mean(pause_durations) if pause_durations else 0

        # Speech consistency (variation in speech segment durations)
        segment_durations = [seg.get("duration", 0) for seg in speech_segments]
        speech_consistency = 1.0 - (
            np.std(segment_durations) / np.mean(segment_durations)
            if segment_durations and np.mean(segment_durations) > 0
            else 0
        )

        return {
            "speech_rate": float(speech_rate),
            "pause_frequency": float(pause_frequency),
            "average_pause_duration": float(avg_pause_duration),
            "speech_consistency": float(max(0, min(1, speech_consistency))),
        }

    def analyze_content(self, transcription: str) -> Dict:
        """
        Analyze transcribed content for suspicious phrases and patterns.

        Args:
            transcription: Audio transcription text

        Returns:
            Content analysis results
        """
        if not transcription:
            return {
                "question_reading_detected": False,
                "help_seeking_phrases": 0,
                "answer_receiving_phrases": 0,
                "external_discussion": False,
                "suspicious_phrase_details": [],
            }

        transcription_lower = transcription.lower()
        suspicious_details = []

        # Check for suspicious phrases
        help_seeking_count = 0
        for phrase in self.suspicious_phrases:
            if phrase.lower() in transcription_lower:
                help_seeking_count += 1
                suspicious_details.append(
                    {
                        "phrase": phrase,
                        "type": "help_seeking",
                        "positions": [
                            m.start()
                            for m in re.finditer(
                                re.escape(phrase.lower()), transcription_lower
                            )
                        ],
                    }
                )

        # Check for help-seeking patterns (regex)
        help_pattern_count = 0
        for pattern in self.help_seeking_patterns:
            matches = re.finditer(pattern, transcription_lower)
            for match in matches:
                help_pattern_count += 1
                suspicious_details.append(
                    {
                        "phrase": match.group(),
                        "type": "help_pattern",
                        "positions": [match.start()],
                    }
                )

        # Check for answer-receiving patterns
        answer_receiving_count = 0
        for pattern in self.answer_patterns:
            matches = re.finditer(pattern, transcription_lower)
            for match in matches:
                answer_receiving_count += 1
                suspicious_details.append(
                    {
                        "phrase": match.group(),
                        "type": "answer_receiving",
                        "positions": [match.start()],
                    }
                )

        # Detect question reading (questions typically end with ?)
        question_reading = bool(
            re.search(r"\?.*\b(is|are|what|how|where|when|why)", transcription)
        )

        # Detect external discussion (multiple speaker indicators)
        external_discussion = any(
            indicator in transcription_lower
            for indicator in [
                "he said",
                "she said",
                "they said",
                "someone said",
                "person said",
                "friend said",
                "teacher said",
            ]
        )

        return {
            "question_reading_detected": question_reading,
            "help_seeking_phrases": help_seeking_count + help_pattern_count,
            "answer_receiving_phrases": answer_receiving_count,
            "external_discussion": external_discussion,
            "suspicious_phrase_details": suspicious_details,
        }

    def analyze_audio_quality(self, audio_data: np.ndarray) -> Dict:
        """
        Analyze audio quality and detect potential recording or manipulation.

        Args:
            audio_data: Audio data for analysis

        Returns:
            Audio quality analysis results
        """
        if len(audio_data) == 0:
            return {
                "background_noise_level": 0.0,
                "audio_quality_score": 1.0,
                "potential_recording": False,
            }

        # Calculate background noise level
        # Use quieter 10% of audio as background noise estimate
        sorted_audio = np.sort(np.abs(audio_data))
        noise_level = np.mean(sorted_audio[: len(sorted_audio) // 10])

        # Calculate signal-to-noise ratio
        signal_level = np.mean(np.abs(audio_data))
        snr = signal_level / noise_level if noise_level > 0 else float("inf")

        # Audio quality score (higher is better)
        quality_score = min(1.0, snr / 10.0)  # Normalize SNR to 0-1

        # Detect potential recording artifacts
        potential_recording = False

        if LIBROSA_AVAILABLE:
            try:
                # Spectral analysis for recording detection
                stft = librosa.stft(audio_data)
                spectral_centroids = librosa.feature.spectral_centroid(S=np.abs(stft))[
                    0
                ]
                spectral_rolloff = librosa.feature.spectral_rolloff(S=np.abs(stft))[0]

                # Recordings often have limited frequency range
                avg_centroid = np.mean(spectral_centroids)
                avg_rolloff = np.mean(spectral_rolloff)

                # Simple heuristics for recording detection
                if avg_centroid < 1000 or avg_rolloff < 4000:
                    potential_recording = True

            except Exception as e:
                self.logger.warning(f"Spectral analysis failed: {e}")

        return {
            "background_noise_level": float(noise_level),
            "audio_quality_score": float(quality_score),
            "potential_recording": potential_recording,
            "snr": float(snr) if snr != float("inf") else 100.0,
        }

    def analyze_temporal_patterns(self, voice_events: List[Dict]) -> Dict:
        """
        Analyze temporal patterns in voice activity.

        Args:
            voice_events: List of voice activity events

        Returns:
            Temporal pattern analysis results
        """
        if not voice_events:
            return {
                "unusual_silence_periods": 0,
                "rapid_speech_bursts": 0,
                "inconsistent_volume": False,
            }

        # Extract timestamps and speech indicators
        timestamps = [event.get("timestamp", 0) for event in voice_events]
        speech_indicators = [event.get("is_speech", False) for event in voice_events]
        volumes = [event.get("rms_energy", 0) for event in voice_events]

        # Detect unusual silence periods (long gaps in speech)
        unusual_silences = 0
        current_silence_duration = 0

        for is_speech in speech_indicators:
            if not is_speech:
                current_silence_duration += 1
            else:
                if current_silence_duration > 30:  # 30+ consecutive non-speech chunks
                    unusual_silences += 1
                current_silence_duration = 0

        # Detect rapid speech bursts (sudden increases in activity)
        rapid_bursts = 0
        window_size = 10

        for i in range(len(speech_indicators) - window_size):
            window = speech_indicators[i : i + window_size]
            speech_count = sum(window)
            if speech_count > 8:  # 8+ out of 10 chunks are speech (very active)
                rapid_bursts += 1

        # Detect inconsistent volume (potential multiple speakers or recording)
        inconsistent_volume = False
        if volumes and len(volumes) > 10:
            volume_std = np.std(volumes)
            volume_mean = np.mean(volumes)
            cv = volume_std / volume_mean if volume_mean > 0 else 0
            inconsistent_volume = cv > 0.5  # High coefficient of variation

        return {
            "unusual_silence_periods": unusual_silences,
            "rapid_speech_bursts": rapid_bursts,
            "inconsistent_volume": inconsistent_volume,
        }

    def calculate_overall_risk_score(
        self, metrics: BehavioralMetrics
    ) -> Tuple[float, List[str]]:
        """
        Calculate overall cheating risk score based on all metrics.

        Args:
            metrics: Behavioral metrics

        Returns:
            Risk score (0-1) and list of risk factors
        """
        risk_factors = []
        risk_score = 0.0

        # Content-based risk factors (highest weight)
        if metrics.help_seeking_phrases > 0:
            risk_score += 0.3
            risk_factors.append(
                f"Help-seeking phrases detected ({metrics.help_seeking_phrases})"
            )

        if metrics.answer_receiving_phrases > 0:
            risk_score += 0.4
            risk_factors.append(
                f"Answer-receiving phrases detected ({metrics.answer_receiving_phrases})"
            )

        if metrics.external_discussion:
            risk_score += 0.3
            risk_factors.append("External discussion detected")

        if metrics.question_reading_detected:
            risk_score += 0.2
            risk_factors.append("Question reading to others detected")

        # Audio quality risk factors
        if metrics.potential_recording:
            risk_score += 0.15
            risk_factors.append("Potential pre-recorded audio detected")

        if metrics.audio_quality_score < 0.3:
            risk_score += 0.15
            risk_factors.append("Poor audio quality (possible manipulation)")

        # Behavioral pattern risk factors
        if metrics.unusual_silence_periods > 2:
            risk_score += 0.2
            risk_factors.append("Unusual silence patterns")

        if metrics.rapid_speech_bursts > 3:
            risk_score += 0.15
            risk_factors.append("Rapid speech burst patterns")

        if metrics.inconsistent_volume:
            risk_score += 0.2
            risk_factors.append("Inconsistent volume (multiple speakers?)")

        # Speech pattern anomalies
        if metrics.speech_rate > 200 or metrics.speech_rate < 50:  # Very fast or slow
            risk_score += 0.1
            risk_factors.append(f"Unusual speech rate ({metrics.speech_rate:.1f} WPM)")

        if metrics.speech_consistency < 0.3:
            risk_score += 0.1
            risk_factors.append("Inconsistent speech patterns")

        # Normalize risk score to 0-1 range
        risk_score = min(1.0, risk_score)

        return risk_score, risk_factors

    def analyze_behavior(
        self,
        audio_data: np.ndarray,
        transcription: str,
        speech_segments: List[Dict],
        voice_events: List[Dict],
    ) -> BehavioralMetrics:
        """
        Comprehensive behavioral analysis.

        Args:
            audio_data: Audio data
            transcription: Speech transcription
            speech_segments: Speech segment data
            voice_events: Voice activity events

        Returns:
            Complete behavioral metrics
        """
        # Analyze different aspects
        speech_patterns = self.analyze_speech_patterns(audio_data, speech_segments)
        content_analysis = self.analyze_content(transcription)
        audio_quality = self.analyze_audio_quality(audio_data)
        temporal_patterns = self.analyze_temporal_patterns(voice_events)

        # Create metrics object
        metrics = BehavioralMetrics(
            # Speech patterns
            speech_rate=speech_patterns["speech_rate"],
            pause_frequency=speech_patterns["pause_frequency"],
            average_pause_duration=speech_patterns["average_pause_duration"],
            speech_consistency=speech_patterns["speech_consistency"],
            # Content analysis
            question_reading_detected=content_analysis["question_reading_detected"],
            help_seeking_phrases=content_analysis["help_seeking_phrases"],
            answer_receiving_phrases=content_analysis["answer_receiving_phrases"],
            external_discussion=content_analysis["external_discussion"],
            # Audio quality
            background_noise_level=audio_quality["background_noise_level"],
            audio_quality_score=audio_quality["audio_quality_score"],
            potential_recording=audio_quality["potential_recording"],
            # Temporal patterns
            unusual_silence_periods=temporal_patterns["unusual_silence_periods"],
            rapid_speech_bursts=temporal_patterns["rapid_speech_bursts"],
            inconsistent_volume=temporal_patterns["inconsistent_volume"],
            # Analysis metadata
            analysis_timestamp=datetime.now(timezone.utc).isoformat(),
        )

        # Calculate overall confidence/risk
        risk_score, risk_factors = self.calculate_overall_risk_score(metrics)
        metrics.overall_confidence = 1.0 - risk_score  # Confidence is inverse of risk

        # Store in history
        analysis_result = asdict(metrics)
        analysis_result["risk_score"] = risk_score
        analysis_result["risk_factors"] = risk_factors
        analysis_result["content_details"] = content_analysis.get(
            "suspicious_phrase_details", []
        )

        self.analysis_history.append(analysis_result)

        self.logger.info(
            f"Behavioral analysis completed. Risk score: {risk_score:.3f}, "
            f"Factors: {len(risk_factors)}"
        )

        return metrics

    def get_analysis_summary(self) -> Dict:
        """Get summary of all behavioral analysis results."""
        if not self.analysis_history:
            return {"message": "No analysis data available"}

        recent_analyses = list(self.analysis_history)[-10:]  # Last 10 analyses

        return {
            "total_analyses": len(self.analysis_history),
            "recent_analyses": recent_analyses,
            "average_risk_score": np.mean(
                [a.get("risk_score", 0) for a in recent_analyses]
            ),
            "total_risk_factors": sum(
                len(a.get("risk_factors", [])) for a in recent_analyses
            ),
            "most_common_risks": self._get_most_common_risks(recent_analyses),
        }

    def _get_most_common_risks(self, analyses: List[Dict]) -> List[str]:
        """Get most commonly detected risk factors."""
        risk_counts = {}
        for analysis in analyses:
            for risk in analysis.get("risk_factors", []):
                # Extract base risk type (before parentheses)
                base_risk = risk.split("(")[0].strip()
                risk_counts[base_risk] = risk_counts.get(base_risk, 0) + 1

        # Return top 5 most common risks
        return sorted(risk_counts.items(), key=lambda x: x[1], reverse=True)[:5]
