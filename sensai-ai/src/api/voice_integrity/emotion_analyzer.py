"""
Emotion and Stress Detection Module

This module implements advanced speech emotion recognition to detect
stress, anxiety, deception, and other emotional indicators that might
suggest cheating behavior during tests.
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import asyncio
import json

try:
    import librosa
    import librosa.feature
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    logging.warning("Librosa not available. Install with: pip install librosa")

try:
    from scipy import stats
    from scipy.signal import find_peaks
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logging.warning("SciPy not available. Install with: pip install scipy")

try:
    from sklearn.preprocessing import StandardScaler
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logging.warning("scikit-learn not available. Install with: pip install scikit-learn")

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logging.warning("PyTorch not available. Install with: pip install torch")

@dataclass
class EmotionalFeatures:
    """Data class for emotional audio features."""
    
    # Prosodic features
    pitch_mean: float = 0.0
    pitch_std: float = 0.0
    pitch_range: float = 0.0
    
    # Energy features
    energy_mean: float = 0.0
    energy_std: float = 0.0
    energy_contour: List[float] = None
    
    # Temporal features
    speaking_rate: float = 0.0
    pause_rate: float = 0.0
    jitter: float = 0.0
    shimmer: float = 0.0
    
    # Spectral features
    spectral_centroid: float = 0.0
    spectral_bandwidth: float = 0.0
    spectral_rolloff: float = 0.0
    mfcc_features: List[float] = None
    
    def __post_init__(self):
        if self.energy_contour is None:
            self.energy_contour = []
        if self.mfcc_features is None:
            self.mfcc_features = []

@dataclass
class EmotionPrediction:
    """Data class for emotion prediction results."""
    emotion: str
    confidence: float
    probabilities: Dict[str, float]
    stress_level: float
    anxiety_level: float
    deception_indicators: List[str]

@dataclass
class EmotionAnalysis:
    """Data class for complete emotion analysis."""
    features: EmotionalFeatures
    predictions: EmotionPrediction
    suspicious_indicators: List[str]
    overall_risk_score: float
    analysis_timestamp: str

class SimpleEmotionModel(nn.Module):
    """Simple neural network for emotion classification."""
    
    def __init__(self, input_size: int, hidden_size: int = 128, num_emotions: int = 7):
        super(SimpleEmotionModel, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size // 2)
        self.fc3 = nn.Linear(hidden_size // 2, num_emotions)
        self.dropout = nn.Dropout(0.3)
        
    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = F.relu(self.fc2(x))
        x = self.dropout(x)
        x = F.softmax(self.fc3(x), dim=1)
        return x

class EmotionAnalyzer:
    """
    Advanced emotion and stress detection system for identifying
    emotional indicators of cheating behavior.
    """
    
    def __init__(self, sample_rate: int = 16000):
        """
        Initialize the emotion analyzer.
        
        Args:
            sample_rate: Audio sample rate
        """
        self.sample_rate = sample_rate
        self.logger = logging.getLogger(__name__)
        
        # Emotion categories
        self.emotions = [
            'neutral', 'happy', 'sad', 'angry', 
            'fear', 'surprise', 'disgust'
        ]
        
        # Stress and deception indicators
        self.stress_indicators = []
        self.deception_patterns = []
        
        # Models
        self.emotion_model = None
        self.feature_scaler = None
        
        # Analysis state
        self.analysis_history = []
        self.baseline_features = None
        
        self._initialize_models()
        
    def _initialize_models(self):
        """Initialize emotion recognition models."""
        if TORCH_AVAILABLE:
            try:
                # Initialize simple emotion model
                input_size = 25  # Number of features we'll extract
                self.emotion_model = SimpleEmotionModel(input_size)
                self.emotion_model.eval()
                
                # Initialize feature scaler
                if SKLEARN_AVAILABLE:
                    self.feature_scaler = StandardScaler()
                
                self.logger.info("Emotion analysis models initialized")
                
            except Exception as e:
                self.logger.error(f"Failed to initialize emotion models: {e}")
    
    def extract_prosodic_features(self, audio_data: np.ndarray) -> Dict:
        """
        Extract prosodic features (pitch, energy, rhythm).
        
        Args:
            audio_data: Audio signal
            
        Returns:
            Dictionary of prosodic features
        """
        if not LIBROSA_AVAILABLE:
            return self._get_basic_prosodic_features(audio_data)
        
        try:
            # Extract pitch (fundamental frequency)
            pitches, magnitudes = librosa.piptrack(
                y=audio_data, sr=self.sample_rate, threshold=0.1
            )
            
            # Get pitch values
            pitch_values = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0:
                    pitch_values.append(pitch)
            
            if not pitch_values:
                pitch_values = [0]
            
            # Pitch statistics
            pitch_mean = np.mean(pitch_values)
            pitch_std = np.std(pitch_values)
            pitch_range = np.max(pitch_values) - np.min(pitch_values)
            
            # Energy features
            rms = librosa.feature.rms(y=audio_data)[0]
            energy_mean = np.mean(rms)
            energy_std = np.std(rms)
            
            # Zero crossing rate (voice quality indicator)
            zcr = librosa.feature.zero_crossing_rate(audio_data)[0]
            zcr_mean = np.mean(zcr)
            
            return {
                'pitch_mean': float(pitch_mean),
                'pitch_std': float(pitch_std),
                'pitch_range': float(pitch_range),
                'energy_mean': float(energy_mean),
                'energy_std': float(energy_std),
                'energy_contour': rms.tolist(),
                'zcr_mean': float(zcr_mean),
                'jitter': self._calculate_jitter(pitch_values),
                'shimmer': self._calculate_shimmer(rms)
            }
            
        except Exception as e:
            self.logger.error(f"Prosodic feature extraction failed: {e}")
            return self._get_basic_prosodic_features(audio_data)
    
    def _get_basic_prosodic_features(self, audio_data: np.ndarray) -> Dict:
        """Basic prosodic features without librosa."""
        # Basic energy calculation
        rms = np.sqrt(np.mean(audio_data**2))
        
        # Basic zero crossing rate
        zero_crossings = np.where(np.diff(np.sign(audio_data)))[0]
        zcr = len(zero_crossings) / len(audio_data)
        
        return {
            'pitch_mean': 150.0,  # Default values
            'pitch_std': 20.0,
            'pitch_range': 100.0,
            'energy_mean': float(rms),
            'energy_std': float(rms * 0.3),
            'energy_contour': [float(rms)],
            'zcr_mean': float(zcr),
            'jitter': 0.01,
            'shimmer': 0.03
        }
    
    def _calculate_jitter(self, pitch_values: List[float]) -> float:
        """Calculate pitch jitter (pitch variability)."""
        if len(pitch_values) < 2:
            return 0.0
        
        differences = np.diff(pitch_values)
        jitter = np.std(differences) / np.mean(pitch_values) if np.mean(pitch_values) > 0 else 0.0
        return float(jitter)
    
    def _calculate_shimmer(self, energy_values: np.ndarray) -> float:
        """Calculate amplitude shimmer (amplitude variability)."""
        if len(energy_values) < 2:
            return 0.0
        
        differences = np.diff(energy_values)
        shimmer = np.std(differences) / np.mean(energy_values) if np.mean(energy_values) > 0 else 0.0
        return float(shimmer)
    
    def extract_spectral_features(self, audio_data: np.ndarray) -> Dict:
        """
        Extract spectral features from audio.
        
        Args:
            audio_data: Audio signal
            
        Returns:
            Dictionary of spectral features
        """
        if not LIBROSA_AVAILABLE:
            return self._get_basic_spectral_features(audio_data)
        
        try:
            # Spectral centroid (brightness)
            spectral_centroids = librosa.feature.spectral_centroid(
                y=audio_data, sr=self.sample_rate
            )[0]
            
            # Spectral bandwidth
            spectral_bandwidth = librosa.feature.spectral_bandwidth(
                y=audio_data, sr=self.sample_rate
            )[0]
            
            # Spectral rolloff
            spectral_rolloff = librosa.feature.spectral_rolloff(
                y=audio_data, sr=self.sample_rate
            )[0]
            
            # MFCC features
            mfccs = librosa.feature.mfcc(
                y=audio_data, sr=self.sample_rate, n_mfcc=13
            )
            mfcc_features = np.mean(mfccs.T, axis=0)
            
            return {
                'spectral_centroid': float(np.mean(spectral_centroids)),
                'spectral_bandwidth': float(np.mean(spectral_bandwidth)),
                'spectral_rolloff': float(np.mean(spectral_rolloff)),
                'mfcc_features': mfcc_features.tolist()
            }
            
        except Exception as e:
            self.logger.error(f"Spectral feature extraction failed: {e}")
            return self._get_basic_spectral_features(audio_data)
    
    def _get_basic_spectral_features(self, audio_data: np.ndarray) -> Dict:
        """Basic spectral features without librosa."""
        # Simple spectral analysis using FFT
        fft = np.fft.fft(audio_data)
        freqs = np.fft.fftfreq(len(fft), 1/self.sample_rate)
        magnitude = np.abs(fft)
        
        # Find dominant frequency (approximation of spectral centroid)
        dominant_freq_idx = np.argmax(magnitude[:len(magnitude)//2])
        dominant_freq = freqs[dominant_freq_idx]
        
        return {
            'spectral_centroid': float(abs(dominant_freq)),
            'spectral_bandwidth': 1000.0,  # Default value
            'spectral_rolloff': 4000.0,    # Default value
            'mfcc_features': [0.0] * 13    # Placeholder
        }
    
    def extract_temporal_features(self, audio_data: np.ndarray, 
                                speech_segments: List[Dict]) -> Dict:
        """
        Extract temporal features (rhythm, speaking rate).
        
        Args:
            audio_data: Audio signal
            speech_segments: List of speech segments
            
        Returns:
            Dictionary of temporal features
        """
        if not speech_segments:
            return {
                'speaking_rate': 0.0,
                'pause_rate': 0.0,
                'speech_rhythm_consistency': 0.0
            }
        
        # Calculate speaking rate
        total_speech_time = sum(seg.get('duration', 0) for seg in speech_segments)
        estimated_syllables = total_speech_time * 4  # ~4 syllables per second
        speaking_rate = estimated_syllables / (len(audio_data) / self.sample_rate) if len(audio_data) > 0 else 0
        
        # Calculate pause patterns
        pause_durations = []
        if len(speech_segments) > 1:
            for i in range(1, len(speech_segments)):
                prev_end = speech_segments[i-1].get('end_time', 0)
                curr_start = speech_segments[i].get('start_time', 0)
                pause_duration = curr_start - prev_end
                if pause_duration > 0:
                    pause_durations.append(pause_duration)
        
        pause_rate = len(pause_durations) / (len(audio_data) / self.sample_rate) if len(audio_data) > 0 else 0
        
        # Speech rhythm consistency
        segment_durations = [seg.get('duration', 0) for seg in speech_segments]
        rhythm_consistency = 1.0 - (np.std(segment_durations) / np.mean(segment_durations) 
                                   if segment_durations and np.mean(segment_durations) > 0 else 0)
        
        return {
            'speaking_rate': float(speaking_rate),
            'pause_rate': float(pause_rate),
            'speech_rhythm_consistency': float(max(0, min(1, rhythm_consistency)))
        }
    
    def extract_emotional_features(self, audio_data: np.ndarray,
                                 speech_segments: List[Dict] = None) -> EmotionalFeatures:
        """
        Extract comprehensive emotional features from audio.
        
        Args:
            audio_data: Audio signal
            speech_segments: Optional speech segments
            
        Returns:
            EmotionalFeatures object
        """
        if speech_segments is None:
            speech_segments = []
        
        # Extract different feature types
        prosodic = self.extract_prosodic_features(audio_data)
        spectral = self.extract_spectral_features(audio_data)
        temporal = self.extract_temporal_features(audio_data, speech_segments)
        
        return EmotionalFeatures(
            pitch_mean=prosodic['pitch_mean'],
            pitch_std=prosodic['pitch_std'],
            pitch_range=prosodic['pitch_range'],
            energy_mean=prosodic['energy_mean'],
            energy_std=prosodic['energy_std'],
            energy_contour=prosodic['energy_contour'],
            speaking_rate=temporal['speaking_rate'],
            pause_rate=temporal['pause_rate'],
            jitter=prosodic['jitter'],
            shimmer=prosodic['shimmer'],
            spectral_centroid=spectral['spectral_centroid'],
            spectral_bandwidth=spectral['spectral_bandwidth'],
            spectral_rolloff=spectral['spectral_rolloff'],
            mfcc_features=spectral['mfcc_features']
        )
    
    def predict_emotion(self, features: EmotionalFeatures) -> EmotionPrediction:
        """
        Predict emotion from extracted features.
        
        Args:
            features: Extracted emotional features
            
        Returns:
            Emotion prediction results
        """
        if not self.emotion_model or not TORCH_AVAILABLE:
            return self._get_fallback_emotion_prediction(features)
        
        try:
            # Convert features to tensor
            feature_vector = self._features_to_vector(features)
            
            if self.feature_scaler and len(self.analysis_history) > 10:
                # Normalize features if we have enough data
                feature_vector = self.feature_scaler.transform([feature_vector])[0]
            
            # Predict emotion
            with torch.no_grad():
                input_tensor = torch.tensor(feature_vector, dtype=torch.float32).unsqueeze(0)
                emotion_probs = self.emotion_model(input_tensor)[0]
                
            # Get prediction
            emotion_idx = torch.argmax(emotion_probs).item()
            emotion = self.emotions[emotion_idx]
            confidence = emotion_probs[emotion_idx].item()
            
            # Create probability dictionary
            probabilities = {
                self.emotions[i]: float(emotion_probs[i])
                for i in range(len(self.emotions))
            }
            
            # Calculate stress and anxiety levels
            stress_level = self._calculate_stress_level(features, probabilities)
            anxiety_level = self._calculate_anxiety_level(features, probabilities)
            
            # Identify deception indicators
            deception_indicators = self._identify_deception_indicators(features, probabilities)
            
            return EmotionPrediction(
                emotion=emotion,
                confidence=confidence,
                probabilities=probabilities,
                stress_level=stress_level,
                anxiety_level=anxiety_level,
                deception_indicators=deception_indicators
            )
            
        except Exception as e:
            self.logger.error(f"Emotion prediction failed: {e}")
            return self._get_fallback_emotion_prediction(features)
    
    def _features_to_vector(self, features: EmotionalFeatures) -> np.ndarray:
        """Convert EmotionalFeatures to feature vector."""
        vector = [
            features.pitch_mean, features.pitch_std, features.pitch_range,
            features.energy_mean, features.energy_std,
            features.speaking_rate, features.pause_rate,
            features.jitter, features.shimmer,
            features.spectral_centroid, features.spectral_bandwidth,
            features.spectral_rolloff
        ]
        
        # Add MFCC features (pad or truncate to 13)
        mfcc = features.mfcc_features[:13] if features.mfcc_features else [0.0] * 13
        mfcc.extend([0.0] * (13 - len(mfcc)))  # Pad if necessary
        vector.extend(mfcc)
        
        return np.array(vector)
    
    def _calculate_stress_level(self, features: EmotionalFeatures, 
                              probabilities: Dict[str, float]) -> float:
        """Calculate stress level from features and emotion probabilities."""
        stress_level = 0.0
        
        # High stress indicators
        if features.pitch_std > 30:  # High pitch variability
            stress_level += 0.3
        
        if features.speaking_rate > 6:  # Very fast speaking
            stress_level += 0.2
        
        if features.energy_std > 0.05:  # High energy variability
            stress_level += 0.2
        
        # Emotional indicators of stress
        stress_level += probabilities.get('angry', 0) * 0.5
        stress_level += probabilities.get('fear', 0) * 0.6
        stress_level += probabilities.get('sad', 0) * 0.3
        
        return min(1.0, stress_level)
    
    def _calculate_anxiety_level(self, features: EmotionalFeatures,
                               probabilities: Dict[str, float]) -> float:
        """Calculate anxiety level from features and emotion probabilities."""
        anxiety_level = 0.0
        
        # Anxiety indicators
        if features.jitter > 0.02:  # High pitch jitter
            anxiety_level += 0.3
        
        if features.pause_rate > 1.0:  # Many pauses
            anxiety_level += 0.2
        
        if features.speaking_rate < 2:  # Very slow speaking
            anxiety_level += 0.2
        
        # Emotional indicators of anxiety
        anxiety_level += probabilities.get('fear', 0) * 0.7
        anxiety_level += probabilities.get('surprise', 0) * 0.3
        anxiety_level += probabilities.get('sad', 0) * 0.4
        
        return min(1.0, anxiety_level)
    
    def _identify_deception_indicators(self, features: EmotionalFeatures,
                                     probabilities: Dict[str, float]) -> List[str]:
        """Identify potential deception indicators."""
        indicators = []
        
        # Voice quality indicators
        if features.jitter > 0.025:
            indicators.append("High voice instability (jitter)")
        
        if features.shimmer > 0.05:
            indicators.append("High amplitude instability (shimmer)")
        
        # Speaking pattern indicators
        if features.pause_rate > 0.8:
            indicators.append("Excessive pausing (thinking time)")
        
        if features.speaking_rate < 2.5:
            indicators.append("Unusually slow speech")
        
        # Pitch indicators
        if features.pitch_std > 40:
            indicators.append("Highly variable pitch (nervous)")
        
        # Emotional indicators
        if probabilities.get('fear', 0) > 0.4:
            indicators.append("High fear response")
        
        if probabilities.get('surprise', 0) > 0.3:
            indicators.append("Unexpected emotional response")
        
        return indicators
    
    def _get_fallback_emotion_prediction(self, features: EmotionalFeatures) -> EmotionPrediction:
        """Fallback emotion prediction using simple heuristics."""
        # Simple rule-based emotion detection
        emotion = 'neutral'
        
        if features.energy_mean > 0.05 and features.pitch_mean > 200:
            emotion = 'angry' if features.pitch_std > 30 else 'happy'
        elif features.energy_mean < 0.02:
            emotion = 'sad'
        elif features.pitch_std > 40:
            emotion = 'fear'
        
        probabilities = {e: 0.1 for e in self.emotions}
        probabilities[emotion] = 0.7
        
        return EmotionPrediction(
            emotion=emotion,
            confidence=0.6,  # Lower confidence for fallback
            probabilities=probabilities,
            stress_level=min(1.0, features.energy_std * 10),
            anxiety_level=min(1.0, features.jitter * 50),
            deception_indicators=[]
        )
    
    async def analyze_emotion_async(self, audio_data: np.ndarray,
                                  speech_segments: List[Dict] = None,
                                  session_id: str = None) -> EmotionAnalysis:
        """
        Asynchronously analyze emotion and stress indicators.
        
        Args:
            audio_data: Audio signal
            speech_segments: Optional speech segments
            session_id: Optional session identifier
            
        Returns:
            Complete emotion analysis
        """
        try:
            # Extract features
            features = await asyncio.get_event_loop().run_in_executor(
                None, self.extract_emotional_features, audio_data, speech_segments
            )
            
            # Predict emotion
            predictions = await asyncio.get_event_loop().run_in_executor(
                None, self.predict_emotion, features
            )
            
            # Identify suspicious indicators
            suspicious_indicators = self._identify_suspicious_indicators(features, predictions)
            
            # Calculate overall risk score
            risk_score = self._calculate_emotional_risk_score(features, predictions)
            
            analysis = EmotionAnalysis(
                features=features,
                predictions=predictions,
                suspicious_indicators=suspicious_indicators,
                overall_risk_score=risk_score,
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )
            
            # Store in history
            self.analysis_history.append(asdict(analysis))
            
            self.logger.info(f"Emotion analysis completed. "
                           f"Emotion: {predictions.emotion}, "
                           f"Stress: {predictions.stress_level:.2f}, "
                           f"Risk: {risk_score:.2f}")
            
            return analysis
            
        except Exception as e:
            self.logger.error(f"Emotion analysis failed: {e}")
            # Return minimal analysis on error
            return EmotionAnalysis(
                features=EmotionalFeatures(),
                predictions=EmotionPrediction(
                    emotion='unknown', confidence=0.0, probabilities={},
                    stress_level=0.0, anxiety_level=0.0, deception_indicators=[]
                ),
                suspicious_indicators=['Analysis failed'],
                overall_risk_score=0.5,
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )
    
    def _identify_suspicious_indicators(self, features: EmotionalFeatures,
                                      predictions: EmotionPrediction) -> List[str]:
        """Identify suspicious emotional indicators."""
        indicators = []
        
        # High stress/anxiety
        if predictions.stress_level > 0.7:
            indicators.append("High stress levels detected")
        
        if predictions.anxiety_level > 0.7:
            indicators.append("High anxiety levels detected")
        
        # Deception indicators
        if len(predictions.deception_indicators) > 2:
            indicators.append("Multiple deception indicators")
        
        # Emotional inconsistency
        if predictions.emotion in ['happy', 'surprise'] and predictions.stress_level > 0.5:
            indicators.append("Emotional inconsistency (positive emotion with high stress)")
        
        return indicators
    
    def _calculate_emotional_risk_score(self, features: EmotionalFeatures,
                                      predictions: EmotionPrediction) -> float:
        """Calculate overall emotional risk score."""
        risk_score = 0.0
        
        # Stress and anxiety contribute to risk
        risk_score += predictions.stress_level * 0.4
        risk_score += predictions.anxiety_level * 0.3
        
        # Deception indicators
        risk_score += len(predictions.deception_indicators) * 0.1
        
        # Emotional states associated with cheating
        risk_score += predictions.probabilities.get('fear', 0) * 0.3
        risk_score += predictions.probabilities.get('angry', 0) * 0.2
        
        return min(1.0, risk_score)
    
    def get_analysis_summary(self) -> Dict:
        """Get summary of all emotion analysis results."""
        if not self.analysis_history:
            return {'message': 'No emotion analysis data available'}
        
        recent_analyses = self.analysis_history[-10:]
        
        avg_stress = np.mean([a['predictions']['stress_level'] for a in recent_analyses])
        avg_anxiety = np.mean([a['predictions']['anxiety_level'] for a in recent_analyses])
        avg_risk = np.mean([a['overall_risk_score'] for a in recent_analyses])
        
        return {
            'total_analyses': len(self.analysis_history),
            'average_stress_level': float(avg_stress),
            'average_anxiety_level': float(avg_anxiety),
            'average_risk_score': float(avg_risk),
            'recent_analyses': recent_analyses[-5:],
            'model_available': self.emotion_model is not None
        }