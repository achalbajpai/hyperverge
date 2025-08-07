"""
ML-Based Cheating Pattern Classifier

This module implements a comprehensive machine learning system that integrates
all voice analysis components to classify and predict cheating behavior with
high accuracy and detailed explanations.
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import asyncio
import json

try:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import cross_val_score
    from sklearn.metrics import classification_report, confusion_matrix
    import joblib
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

from .behavioral_analyzer import BehavioralAnalyzer, BehavioralMetrics
from .speaker_detector import SpeakerDetector, SpeakerAnalysis  
from .emotion_analyzer import EmotionAnalyzer, EmotionAnalysis
from .real_time_processor import VoiceProcessor

@dataclass
class CheatingSample:
    """Training/testing sample for cheating detection."""
    
    # Voice processing features
    speech_ratio: float = 0.0
    silence_periods: int = 0
    voice_confidence: float = 0.0
    
    # Behavioral features
    help_seeking_phrases: int = 0
    answer_receiving_phrases: int = 0
    question_reading: bool = False
    external_discussion: bool = False
    speech_rate: float = 0.0
    pause_frequency: float = 0.0
    
    # Speaker features
    total_speakers: int = 1
    speaker_switches: int = 0
    primary_speaker_ratio: float = 1.0
    overlapping_speech: float = 0.0
    
    # Emotion features
    stress_level: float = 0.0
    anxiety_level: float = 0.0
    deception_indicators_count: int = 0
    emotion_confidence: float = 0.0
    
    # Audio quality features
    audio_quality_score: float = 1.0
    background_noise: float = 0.0
    potential_recording: bool = False
    
    # Target variable
    is_cheating: bool = False
    
    # Metadata
    session_id: str = ""
    timestamp: str = ""

@dataclass
class CheatingPrediction:
    """Prediction results from the cheating classifier."""
    
    is_cheating: bool
    confidence: float
    probability: float
    risk_score: float
    
    # Detailed analysis
    contributing_factors: List[str]
    risk_breakdown: Dict[str, float]
    evidence_summary: Dict[str, Any]
    
    # Model information
    model_used: str
    prediction_timestamp: str

class CheatingClassifierNN(nn.Module):
    """Neural network for cheating classification."""
    
    def __init__(self, input_size: int, hidden_sizes: List[int] = [128, 64, 32]):
        super(CheatingClassifierNN, self).__init__()
        
        layers = []
        prev_size = input_size
        
        for hidden_size in hidden_sizes:
            layers.extend([
                nn.Linear(prev_size, hidden_size),
                nn.ReLU(),
                nn.Dropout(0.3)
            ])
            prev_size = hidden_size
        
        # Output layer
        layers.append(nn.Linear(prev_size, 2))  # Binary classification
        
        self.network = nn.Sequential(*layers)
    
    def forward(self, x):
        logits = self.network(x)
        return F.softmax(logits, dim=1)

class CheatingClassifier:
    """
    Comprehensive ML-based cheating detection system that integrates
    all voice analysis components for accurate cheating prediction.
    """
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize the cheating classifier.
        
        Args:
            model_path: Path to pre-trained model (optional)
        """
        self.logger = logging.getLogger(__name__)
        
        # Initialize component analyzers
        self.voice_processor = VoiceProcessor()
        self.behavioral_analyzer = BehavioralAnalyzer()
        self.speaker_detector = SpeakerDetector()
        self.emotion_analyzer = EmotionAnalyzer()
        
        # ML Models
        self.rf_model = None
        self.gb_model = None
        self.lr_model = None
        self.nn_model = None
        self.feature_scaler = None
        
        # Training data and state
        self.training_samples = []
        self.is_trained = False
        self.model_metrics = {}
        
        # Analysis state
        self.prediction_history = []
        self.feature_importance = {}
        
        # Feature configuration
        self.feature_names = self._get_feature_names()
        
        if model_path:
            self.load_model(model_path)
        else:
            self._initialize_models()
    
    def _get_feature_names(self) -> List[str]:
        """Get list of feature names for the ML models."""
        return [
            'speech_ratio', 'silence_periods', 'voice_confidence',
            'help_seeking_phrases', 'answer_receiving_phrases', 
            'question_reading', 'external_discussion',
            'speech_rate', 'pause_frequency',
            'total_speakers', 'speaker_switches', 'primary_speaker_ratio',
            'overlapping_speech', 'stress_level', 'anxiety_level',
            'deception_indicators_count', 'emotion_confidence',
            'audio_quality_score', 'background_noise', 'potential_recording'
        ]
    
    def _initialize_models(self):
        """Initialize ML models for cheating detection."""
        if not SKLEARN_AVAILABLE:
            self.logger.warning("scikit-learn not available for ML models")
            return
        
        try:
            # Random Forest - good for feature importance
            self.rf_model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            )
            
            # Gradient Boosting - often high accuracy
            self.gb_model = GradientBoostingClassifier(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=6,
                random_state=42
            )
            
            # Logistic Regression - interpretable
            self.lr_model = LogisticRegression(
                random_state=42,
                class_weight='balanced',
                max_iter=1000
            )
            
            # Feature scaler
            self.feature_scaler = StandardScaler()
            
            # Neural Network (if PyTorch available)
            if TORCH_AVAILABLE:
                input_size = len(self.feature_names)
                self.nn_model = CheatingClassifierNN(input_size)
            
            self.logger.info("ML models initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize ML models: {e}")
    
    def create_sample_from_analysis(self, 
                                  voice_summary: Dict,
                                  behavioral_metrics: BehavioralMetrics,
                                  speaker_analysis: Dict,
                                  emotion_analysis: EmotionAnalysis,
                                  session_id: str,
                                  is_cheating: bool = None) -> CheatingSample:
        """
        Create a training/prediction sample from analysis results.
        
        Args:
            voice_summary: Voice processor summary
            behavioral_metrics: Behavioral analysis results
            speaker_analysis: Speaker detection results
            emotion_analysis: Emotion analysis results
            session_id: Session identifier
            is_cheating: True if cheating (for training), None for prediction
            
        Returns:
            CheatingSample object
        """
        sample = CheatingSample(
            # Voice processing features
            speech_ratio=voice_summary.get('speech_ratio', 0.0),
            silence_periods=len(voice_summary.get('suspicious_events', [])),
            voice_confidence=voice_summary.get('average_speech_confidence', 0.0),
            
            # Behavioral features
            help_seeking_phrases=behavioral_metrics.help_seeking_phrases,
            answer_receiving_phrases=behavioral_metrics.answer_receiving_phrases,
            question_reading=behavioral_metrics.question_reading_detected,
            external_discussion=behavioral_metrics.external_discussion,
            speech_rate=behavioral_metrics.speech_rate,
            pause_frequency=behavioral_metrics.pause_frequency,
            
            # Speaker features
            total_speakers=speaker_analysis.get('total_speakers', 1),
            speaker_switches=speaker_analysis.get('speaker_switches', 0),
            primary_speaker_ratio=speaker_analysis.get('primary_speaker_ratio', 1.0),
            overlapping_speech=speaker_analysis.get('overlapping_speech_duration', 0.0),
            
            # Emotion features
            stress_level=emotion_analysis.predictions.stress_level,
            anxiety_level=emotion_analysis.predictions.anxiety_level,
            deception_indicators_count=len(emotion_analysis.predictions.deception_indicators),
            emotion_confidence=emotion_analysis.predictions.confidence,
            
            # Audio quality features
            audio_quality_score=behavioral_metrics.audio_quality_score,
            background_noise=behavioral_metrics.background_noise_level,
            potential_recording=behavioral_metrics.potential_recording,
            
            # Target and metadata
            is_cheating=is_cheating if is_cheating is not None else False,
            session_id=session_id,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
        
        return sample
    
    def sample_to_features(self, sample: CheatingSample) -> np.ndarray:
        """Convert CheatingSample to feature vector."""
        features = [
            sample.speech_ratio, sample.silence_periods, sample.voice_confidence,
            sample.help_seeking_phrases, sample.answer_receiving_phrases,
            float(sample.question_reading), float(sample.external_discussion),
            sample.speech_rate, sample.pause_frequency,
            sample.total_speakers, sample.speaker_switches, sample.primary_speaker_ratio,
            sample.overlapping_speech, sample.stress_level, sample.anxiety_level,
            sample.deception_indicators_count, sample.emotion_confidence,
            sample.audio_quality_score, sample.background_noise, 
            float(sample.potential_recording)
        ]
        
        return np.array(features)
    
    def add_training_sample(self, sample: CheatingSample):
        """Add a training sample to the dataset."""
        self.training_samples.append(sample)
        self.is_trained = False  # Need to retrain
        
        self.logger.info(f"Added training sample. Total samples: {len(self.training_samples)}")
    
    def train_models(self, validation_split: float = 0.2) -> Dict:
        """
        Train all ML models on the collected samples.
        
        Args:
            validation_split: Fraction of data for validation
            
        Returns:
            Training metrics and results
        """
        if len(self.training_samples) < 10:
            raise ValueError("Need at least 10 training samples")
        
        if not SKLEARN_AVAILABLE:
            raise ImportError("scikit-learn required for training")
        
        # Prepare training data
        X = np.array([self.sample_to_features(sample) for sample in self.training_samples])
        y = np.array([sample.is_cheating for sample in self.training_samples])
        
        # Scale features
        X_scaled = self.feature_scaler.fit_transform(X)
        
        metrics = {}
        
        try:
            # Train Random Forest
            self.rf_model.fit(X_scaled, y)
            rf_scores = cross_val_score(self.rf_model, X_scaled, y, cv=5, scoring='accuracy')
            metrics['random_forest'] = {
                'accuracy': float(np.mean(rf_scores)),
                'std': float(np.std(rf_scores)),
                'feature_importance': dict(zip(self.feature_names, 
                                             self.rf_model.feature_importances_.tolist()))
            }
            
            # Train Gradient Boosting
            self.gb_model.fit(X_scaled, y)
            gb_scores = cross_val_score(self.gb_model, X_scaled, y, cv=5, scoring='accuracy')
            metrics['gradient_boosting'] = {
                'accuracy': float(np.mean(gb_scores)),
                'std': float(np.std(gb_scores)),
                'feature_importance': dict(zip(self.feature_names,
                                             self.gb_model.feature_importances_.tolist()))
            }
            
            # Train Logistic Regression
            self.lr_model.fit(X_scaled, y)
            lr_scores = cross_val_score(self.lr_model, X_scaled, y, cv=5, scoring='accuracy')
            metrics['logistic_regression'] = {
                'accuracy': float(np.mean(lr_scores)),
                'std': float(np.std(lr_scores)),
                'coefficients': dict(zip(self.feature_names,
                                       self.lr_model.coef_[0].tolist()))
            }
            
            self.is_trained = True
            self.model_metrics = metrics
            self.feature_importance = metrics['random_forest']['feature_importance']
            
            self.logger.info(f"Models trained successfully on {len(self.training_samples)} samples")
            
            return metrics
            
        except Exception as e:
            self.logger.error(f"Training failed: {e}")
            raise
    
    def predict_cheating(self, sample: CheatingSample, 
                       use_ensemble: bool = True) -> CheatingPrediction:
        """
        Predict cheating probability for a sample.
        
        Args:
            sample: Sample to analyze
            use_ensemble: Whether to use ensemble of models
            
        Returns:
            Cheating prediction results
        """
        if not self.is_trained or not SKLEARN_AVAILABLE:
            return self._get_rule_based_prediction(sample)
        
        try:
            # Prepare features
            features = self.sample_to_features(sample).reshape(1, -1)
            features_scaled = self.feature_scaler.transform(features)
            
            # Get predictions from each model
            rf_prob = self.rf_model.predict_proba(features_scaled)[0, 1]
            gb_prob = self.gb_model.predict_proba(features_scaled)[0, 1]
            lr_prob = self.lr_model.predict_proba(features_scaled)[0, 1]
            
            if use_ensemble:
                # Weighted ensemble
                probability = (rf_prob * 0.4 + gb_prob * 0.4 + lr_prob * 0.2)
                model_used = "Ensemble (RF+GB+LR)"
            else:
                # Use Random Forest (typically most robust)
                probability = rf_prob
                model_used = "Random Forest"
            
            # Determine prediction
            is_cheating = probability > 0.5
            confidence = max(probability, 1 - probability)
            
            # Calculate risk score
            risk_score = self._calculate_risk_score(sample, probability)
            
            # Get contributing factors
            contributing_factors = self._get_contributing_factors(sample, features_scaled[0])
            
            # Risk breakdown by category
            risk_breakdown = self._get_risk_breakdown(sample)
            
            # Evidence summary
            evidence_summary = self._get_evidence_summary(sample)
            
            prediction = CheatingPrediction(
                is_cheating=is_cheating,
                confidence=confidence,
                probability=probability,
                risk_score=risk_score,
                contributing_factors=contributing_factors,
                risk_breakdown=risk_breakdown,
                evidence_summary=evidence_summary,
                model_used=model_used,
                prediction_timestamp=datetime.now(timezone.utc).isoformat()
            )
            
            # Store in history
            self.prediction_history.append(asdict(prediction))
            
            self.logger.info(f"Cheating prediction: {is_cheating} "
                           f"(prob: {probability:.3f}, conf: {confidence:.3f})")
            
            return prediction
            
        except Exception as e:
            self.logger.error(f"Prediction failed: {e}")
            return self._get_rule_based_prediction(sample)
    
    def _get_rule_based_prediction(self, sample: CheatingSample) -> CheatingPrediction:
        """Fallback rule-based prediction when ML models are unavailable."""
        risk_score = 0.0
        contributing_factors = []
        
        # Content-based rules (highest priority)
        if sample.help_seeking_phrases > 0:
            risk_score += 0.4
            contributing_factors.append(f"Help-seeking phrases ({sample.help_seeking_phrases})")
        
        if sample.answer_receiving_phrases > 0:
            risk_score += 0.5
            contributing_factors.append(f"Answer-receiving phrases ({sample.answer_receiving_phrases})")
        
        if sample.external_discussion:
            risk_score += 0.3
            contributing_factors.append("External discussion detected")
        
        # Speaker-based rules
        if sample.total_speakers > 1:
            risk_score += 0.3
            contributing_factors.append(f"Multiple speakers ({sample.total_speakers})")
        
        # Emotion-based rules
        if sample.stress_level > 0.7:
            risk_score += 0.2
            contributing_factors.append("High stress levels")
        
        if sample.deception_indicators_count > 2:
            risk_score += 0.2
            contributing_factors.append("Multiple deception indicators")
        
        # Audio quality rules
        if sample.potential_recording:
            risk_score += 0.3
            contributing_factors.append("Potential pre-recorded audio")
        
        risk_score = min(1.0, risk_score)
        probability = risk_score
        is_cheating = probability > 0.5
        confidence = max(probability, 1 - probability)
        
        return CheatingPrediction(
            is_cheating=is_cheating,
            confidence=confidence * 0.8,  # Lower confidence for rule-based
            probability=probability,
            risk_score=risk_score,
            contributing_factors=contributing_factors,
            risk_breakdown=self._get_risk_breakdown(sample),
            evidence_summary=self._get_evidence_summary(sample),
            model_used="Rule-based (fallback)",
            prediction_timestamp=datetime.now(timezone.utc).isoformat()
        )
    
    def _calculate_risk_score(self, sample: CheatingSample, probability: float) -> float:
        """Calculate comprehensive risk score."""
        # Base risk from ML model
        base_risk = probability
        
        # Adjust based on severity of indicators
        if sample.help_seeking_phrases > 0 or sample.answer_receiving_phrases > 0:
            base_risk = min(1.0, base_risk + 0.1)
        
        if sample.total_speakers > 2:
            base_risk = min(1.0, base_risk + 0.1)
        
        if sample.potential_recording:
            base_risk = min(1.0, base_risk + 0.1)
        
        return base_risk
    
    def _get_contributing_factors(self, sample: CheatingSample, 
                                features: np.ndarray) -> List[str]:
        """Get factors contributing most to the prediction."""
        factors = []
        
        if not self.feature_importance:
            return self._get_rule_based_factors(sample)
        
        # Get most important features
        important_features = sorted(self.feature_importance.items(), 
                                  key=lambda x: x[1], reverse=True)[:10]
        
        for feature_name, importance in important_features:
            if importance > 0.05:  # Only significant features
                feature_idx = self.feature_names.index(feature_name)
                feature_value = features[feature_idx]
                
                if self._is_feature_suspicious(feature_name, feature_value):
                    factors.append(f"{feature_name}: {feature_value:.2f}")
        
        return factors[:5]  # Top 5 factors
    
    def _get_rule_based_factors(self, sample: CheatingSample) -> List[str]:
        """Get contributing factors using rule-based approach."""
        factors = []
        
        if sample.help_seeking_phrases > 0:
            factors.append(f"Help-seeking phrases: {sample.help_seeking_phrases}")
        
        if sample.answer_receiving_phrases > 0:
            factors.append(f"Answer-receiving phrases: {sample.answer_receiving_phrases}")
        
        if sample.total_speakers > 1:
            factors.append(f"Multiple speakers: {sample.total_speakers}")
        
        if sample.stress_level > 0.6:
            factors.append(f"High stress level: {sample.stress_level:.2f}")
        
        if sample.potential_recording:
            factors.append("Potential recording detected")
        
        return factors
    
    def _is_feature_suspicious(self, feature_name: str, value: float) -> bool:
        """Check if a feature value is suspicious."""
        suspicious_thresholds = {
            'help_seeking_phrases': 0,
            'answer_receiving_phrases': 0,
            'total_speakers': 1,
            'stress_level': 0.6,
            'anxiety_level': 0.6,
            'deception_indicators_count': 1,
            'speaker_switches': 5,
            'overlapping_speech': 2.0
        }
        
        threshold = suspicious_thresholds.get(feature_name)
        if threshold is not None:
            return value > threshold
        
        return False
    
    def _get_risk_breakdown(self, sample: CheatingSample) -> Dict[str, float]:
        """Break down risk by category."""
        return {
            'content_risk': min(1.0, (sample.help_seeking_phrases + sample.answer_receiving_phrases) * 0.2),
            'speaker_risk': min(1.0, max(0, sample.total_speakers - 1) * 0.5),
            'emotion_risk': min(1.0, (sample.stress_level + sample.anxiety_level) / 2),
            'quality_risk': min(1.0, (1 - sample.audio_quality_score) + float(sample.potential_recording)),
            'behavioral_risk': min(1.0, sample.pause_frequency * 0.5)
        }
    
    def _get_evidence_summary(self, sample: CheatingSample) -> Dict[str, Any]:
        """Create evidence summary for the prediction."""
        return {
            'voice_analysis': {
                'speech_ratio': sample.speech_ratio,
                'silence_periods': sample.silence_periods,
                'voice_confidence': sample.voice_confidence
            },
            'content_analysis': {
                'help_seeking_phrases': sample.help_seeking_phrases,
                'answer_receiving_phrases': sample.answer_receiving_phrases,
                'question_reading': sample.question_reading,
                'external_discussion': sample.external_discussion
            },
            'speaker_analysis': {
                'total_speakers': sample.total_speakers,
                'speaker_switches': sample.speaker_switches,
                'primary_speaker_ratio': sample.primary_speaker_ratio
            },
            'emotion_analysis': {
                'stress_level': sample.stress_level,
                'anxiety_level': sample.anxiety_level,
                'deception_indicators_count': sample.deception_indicators_count
            },
            'audio_quality': {
                'quality_score': sample.audio_quality_score,
                'background_noise': sample.background_noise,
                'potential_recording': sample.potential_recording
            }
        }
    
    async def analyze_session_async(self, audio_data: np.ndarray,
                                  transcription: str,
                                  session_id: str,
                                  sample_rate: int = 16000) -> Dict:
        """
        Perform complete cheating analysis on a session.
        
        Args:
            audio_data: Audio data
            transcription: Speech transcription
            session_id: Session identifier
            sample_rate: Audio sample rate
            
        Returns:
            Complete analysis and prediction results
        """
        try:
            # Run all analyses in parallel
            tasks = [
                asyncio.create_task(self._get_voice_summary(audio_data, session_id)),
                asyncio.create_task(self._get_behavioral_analysis(audio_data, transcription)),
                asyncio.create_task(self.speaker_detector.analyze_audio_async(
                    audio_data, session_id, sample_rate)),
                asyncio.create_task(self.emotion_analyzer.analyze_emotion_async(
                    audio_data, session_id=session_id))
            ]
            
            voice_summary, behavioral_metrics, speaker_analysis, emotion_analysis = await asyncio.gather(*tasks)
            
            # Create sample
            sample = self.create_sample_from_analysis(
                voice_summary, behavioral_metrics, speaker_analysis, 
                emotion_analysis, session_id
            )
            
            # Get prediction
            prediction = self.predict_cheating(sample)
            
            # Combine all results
            return {
                'session_id': session_id,
                'prediction': asdict(prediction),
                'detailed_analysis': {
                    'voice_summary': voice_summary,
                    'behavioral_metrics': asdict(behavioral_metrics),
                    'speaker_analysis': speaker_analysis,
                    'emotion_analysis': asdict(emotion_analysis)
                },
                'sample_features': asdict(sample),
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            self.logger.error(f"Session analysis failed: {e}")
            return {
                'session_id': session_id,
                'error': str(e),
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
    
    async def _get_voice_summary(self, audio_data: np.ndarray, session_id: str) -> Dict:
        """Get voice processing summary."""
        # This would typically come from the real-time processor
        # For now, we'll create a basic summary
        rms = np.sqrt(np.mean(audio_data**2))
        
        return {
            'speech_ratio': 0.7,  # Placeholder
            'suspicious_events': [],
            'average_speech_confidence': 0.8
        }
    
    async def _get_behavioral_analysis(self, audio_data: np.ndarray, 
                                     transcription: str) -> BehavioralMetrics:
        """Get behavioral analysis."""
        return await asyncio.get_event_loop().run_in_executor(
            None, self.behavioral_analyzer.analyze_behavior,
            audio_data, transcription, [], []
        )
    
    def save_model(self, path: str):
        """Save trained models to disk."""
        if not self.is_trained:
            raise ValueError("Models not trained yet")
        
        model_data = {
            'rf_model': self.rf_model,
            'gb_model': self.gb_model,
            'lr_model': self.lr_model,
            'feature_scaler': self.feature_scaler,
            'feature_names': self.feature_names,
            'model_metrics': self.model_metrics,
            'feature_importance': self.feature_importance,
            'training_samples_count': len(self.training_samples)
        }
        
        if SKLEARN_AVAILABLE:
            joblib.dump(model_data, path)
            self.logger.info(f"Models saved to {path}")
    
    def load_model(self, path: str):
        """Load trained models from disk."""
        if not SKLEARN_AVAILABLE:
            raise ImportError("scikit-learn required for loading models")
        
        try:
            model_data = joblib.load(path)
            
            self.rf_model = model_data['rf_model']
            self.gb_model = model_data['gb_model']
            self.lr_model = model_data['lr_model']
            self.feature_scaler = model_data['feature_scaler']
            self.feature_names = model_data['feature_names']
            self.model_metrics = model_data['model_metrics']
            self.feature_importance = model_data['feature_importance']
            
            self.is_trained = True
            
            self.logger.info(f"Models loaded from {path}")
            
        except Exception as e:
            self.logger.error(f"Failed to load models: {e}")
            raise
    
    def get_model_status(self) -> Dict:
        """Get current model status and metrics."""
        return {
            'is_trained': self.is_trained,
            'training_samples': len(self.training_samples),
            'models_available': {
                'random_forest': self.rf_model is not None,
                'gradient_boosting': self.gb_model is not None,
                'logistic_regression': self.lr_model is not None,
                'neural_network': self.nn_model is not None
            },
            'model_metrics': self.model_metrics,
            'feature_importance': self.feature_importance,
            'predictions_made': len(self.prediction_history),
            'sklearn_available': SKLEARN_AVAILABLE,
            'torch_available': TORCH_AVAILABLE
        }