"""
WebSocket Handler for Real-Time Voice Processing

This module provides WebSocket integration for real-time voice monitoring
and analysis during test sessions, integrating with the existing WebSocket
system for seamless real-time cheating detection.
"""

import asyncio
import logging
import json
import base64
import numpy as np
from typing import Dict, Set, Optional, Any
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect

from .real_time_processor import VoiceProcessor
from .behavioral_analyzer import BehavioralAnalyzer
from .speaker_detector import SpeakerDetector
from .emotion_analyzer import EmotionAnalyzer
from .cheating_classifier import CheatingClassifier

class VoiceWebSocketManager:
    """
    WebSocket manager for real-time voice processing and analysis.
    Integrates with existing integrity monitoring system.
    """
    
    def __init__(self, integrity_manager):
        """
        Initialize the voice WebSocket manager.
        
        Args:
            integrity_manager: Existing integrity connection manager
        """
        self.integrity_manager = integrity_manager
        self.logger = logging.getLogger(__name__)
        
        # Active voice processing sessions
        self.active_sessions: Dict[str, VoiceSession] = {}
        
        # Analysis components
        self.voice_processor = VoiceProcessor()
        self.behavioral_analyzer = BehavioralAnalyzer()
        self.speaker_detector = SpeakerDetector()
        self.emotion_analyzer = EmotionAnalyzer()
        self.cheating_classifier = CheatingClassifier()
        
        # Configuration
        self.analysis_interval = 10.0  # seconds
        self.alert_threshold = 0.7     # cheating probability threshold
        
    async def start_voice_session(self, websocket: WebSocket, session_id: str) -> bool:
        """
        Start a new voice processing session.
        
        Args:
            websocket: WebSocket connection
            session_id: Test session ID
            
        Returns:
            True if session started successfully
        """
        try:
            if session_id in self.active_sessions:
                await websocket.send_json({
                    "type": "voice_session_error",
                    "data": {"message": "Session already active"}
                })
                return False
            
            # Create new voice session
            voice_session = VoiceSession(
                session_id=session_id,
                websocket=websocket,
                voice_manager=self
            )
            
            self.active_sessions[session_id] = voice_session
            
            # Start processing
            await voice_session.start()
            
            self.logger.info(f"Voice session started for {session_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to start voice session {session_id}: {e}")
            return False
    
    async def stop_voice_session(self, session_id: str) -> Dict:
        """
        Stop a voice processing session and return summary.
        
        Args:
            session_id: Test session ID
            
        Returns:
            Session summary
        """
        if session_id not in self.active_sessions:
            return {"error": "Session not found"}
        
        voice_session = self.active_sessions[session_id]
        summary = await voice_session.stop()
        
        del self.active_sessions[session_id]
        
        self.logger.info(f"Voice session stopped for {session_id}")
        return summary
    
    async def process_audio_chunk(self, session_id: str, audio_data: bytes) -> Dict:
        """
        Process incoming audio chunk.
        
        Args:
            session_id: Test session ID
            audio_data: Raw audio data
            
        Returns:
            Processing result
        """
        if session_id not in self.active_sessions:
            return {"error": "Session not found"}
        
        voice_session = self.active_sessions[session_id]
        return await voice_session.process_audio(audio_data)
    
    async def send_voice_alert(self, session_id: str, alert_data: Dict):
        """
        Send voice-based alert to admins and session participants.
        
        Args:
            session_id: Test session ID
            alert_data: Alert information
        """
        try:
            # Send to session participants
            await self.integrity_manager.send_integrity_event(session_id, {
                "type": "voice_alert",
                "severity": alert_data.get("severity", "medium"),
                "message": alert_data.get("message", "Voice activity detected"),
                "data": alert_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            # Send to admin (org_id would come from session data)
            org_id = alert_data.get("org_id", 1)  # Default to org 1
            await self.integrity_manager.send_integrity_flag(org_id, {
                "type": "voice_cheating_alert",
                "session_id": session_id,
                "alert_data": alert_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
        except Exception as e:
            self.logger.error(f"Failed to send voice alert for {session_id}: {e}")
    
    def get_active_sessions(self) -> Dict:
        """Get information about all active voice sessions."""
        return {
            "active_session_count": len(self.active_sessions),
            "sessions": {
                session_id: {
                    "start_time": session.start_time.isoformat() if session.start_time else None,
                    "audio_chunks_processed": session.audio_chunks_processed,
                    "alerts_generated": session.alerts_generated,
                    "current_risk_score": session.current_risk_score
                }
                for session_id, session in self.active_sessions.items()
            }
        }

class VoiceSession:
    """
    Individual voice processing session for a test taker.
    Handles real-time audio processing and analysis.
    """
    
    def __init__(self, session_id: str, websocket: WebSocket, voice_manager: VoiceWebSocketManager):
        """
        Initialize voice session.
        
        Args:
            session_id: Test session ID
            websocket: WebSocket connection
            voice_manager: Voice WebSocket manager
        """
        self.session_id = session_id
        self.websocket = websocket
        self.voice_manager = voice_manager
        self.logger = logging.getLogger(f"{__name__}.{session_id}")
        
        # Session state
        self.start_time = None
        self.is_active = False
        self.audio_chunks_processed = 0
        self.alerts_generated = 0
        self.current_risk_score = 0.0
        
        # Audio processing
        self.audio_buffer = []
        self.transcription_buffer = ""
        self.sample_rate = 16000
        
        # Analysis results
        self.voice_events = []
        self.behavioral_history = []
        self.speaker_analyses = []
        self.emotion_analyses = []
        self.risk_history = []
        
        # Analysis tasks
        self.processing_task = None
        self.analysis_task = None
        
    async def start(self):
        """Start the voice processing session."""
        self.start_time = datetime.now(timezone.utc)
        self.is_active = True
        
        # Start analysis task
        self.analysis_task = asyncio.create_task(self._periodic_analysis())
        
        # Send session started message
        await self.websocket.send_json({
            "type": "voice_session_started",
            "data": {
                "session_id": self.session_id,
                "timestamp": self.start_time.isoformat(),
                "status": "active"
            }
        })
        
        self.logger.info("Voice session started")
    
    async def stop(self) -> Dict:
        """Stop the voice processing session and return summary."""
        self.is_active = False
        
        # Cancel analysis task
        if self.analysis_task:
            self.analysis_task.cancel()
        
        # Generate final analysis
        summary = await self._generate_session_summary()
        
        # Send session stopped message
        try:
            await self.websocket.send_json({
                "type": "voice_session_stopped",
                "data": {
                    "session_id": self.session_id,
                    "summary": summary,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            })
        except Exception as e:
            self.logger.warning(f"Failed to send stop message: {e}")
        
        self.logger.info("Voice session stopped")
        return summary
    
    async def process_audio(self, audio_data: bytes) -> Dict:
        """
        Process incoming audio chunk.
        
        Args:
            audio_data: Raw audio data
            
        Returns:
            Processing result
        """
        if not self.is_active:
            return {"error": "Session not active"}
        
        try:
            # Decode audio data (assuming base64 encoded)
            try:
                audio_bytes = base64.b64decode(audio_data)
            except Exception:
                # If not base64, assume raw bytes
                audio_bytes = audio_data
            
            # Convert to numpy array
            audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
            audio_np = audio_np / 32768.0  # Normalize
            
            # Add to buffer
            self.audio_buffer.extend(audio_np)
            self.audio_chunks_processed += 1
            
            # Keep buffer manageable (30 seconds worth)
            max_buffer_size = self.sample_rate * 30
            if len(self.audio_buffer) > max_buffer_size:
                self.audio_buffer = self.audio_buffer[-max_buffer_size:]
            
            # Analyze this chunk with voice processor
            analysis = self.voice_manager.voice_processor.analyze_audio_chunk(audio_bytes)
            self.voice_events.append(analysis)
            
            # Send real-time feedback
            await self._send_realtime_feedback(analysis)
            
            return {
                "status": "processed",
                "chunk_size": len(audio_bytes),
                "is_speech": analysis.get("is_speech", False),
                "confidence": analysis.get("silero_probability", 0.0)
            }
            
        except Exception as e:
            self.logger.error(f"Audio processing failed: {e}")
            return {"error": str(e)}
    
    async def _send_realtime_feedback(self, analysis: Dict):
        """Send real-time feedback to the client."""
        try:
            # Send basic voice activity info
            await self.websocket.send_json({
                "type": "voice_activity",
                "data": {
                    "is_speech": analysis.get("is_speech", False),
                    "confidence": analysis.get("silero_probability", 0.0),
                    "energy": analysis.get("rms_energy", 0.0),
                    "timestamp": analysis.get("timestamp", datetime.now(timezone.utc).isoformat())
                }
            })
            
            # Send alerts for suspicious patterns
            if len(self.voice_manager.voice_processor.suspicious_events) > 0:
                latest_suspicious = self.voice_manager.voice_processor.suspicious_events[-1]
                await self.websocket.send_json({
                    "type": "voice_warning",
                    "data": {
                        "indicators": latest_suspicious["indicators"],
                        "timestamp": latest_suspicious["timestamp"],
                        "severity": "medium"
                    }
                })
                
        except Exception as e:
            self.logger.error(f"Failed to send real-time feedback: {e}")
    
    async def _periodic_analysis(self):
        """Perform periodic comprehensive analysis."""
        while self.is_active:
            try:
                await asyncio.sleep(self.voice_manager.analysis_interval)
                
                if not self.is_active:
                    break
                
                # Perform comprehensive analysis
                await self._perform_comprehensive_analysis()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Periodic analysis failed: {e}")
                await asyncio.sleep(5)  # Wait before retrying
    
    async def _perform_comprehensive_analysis(self):
        """Perform comprehensive voice analysis using all components."""
        if len(self.audio_buffer) < self.sample_rate:  # Less than 1 second
            return
        
        try:
            # Convert buffer to numpy array
            audio_data = np.array(self.audio_buffer[-self.sample_rate * 10:])  # Last 10 seconds
            
            # Run all analyses in parallel
            tasks = [
                self._run_behavioral_analysis(audio_data),
                self._run_speaker_analysis(audio_data), 
                self._run_emotion_analysis(audio_data)
            ]
            
            behavioral_result, speaker_result, emotion_result = await asyncio.gather(
                *tasks, return_exceptions=True
            )
            
            # Store results
            if not isinstance(behavioral_result, Exception):
                self.behavioral_history.append(behavioral_result)
            
            if not isinstance(speaker_result, Exception):
                self.speaker_analyses.append(speaker_result)
            
            if not isinstance(emotion_result, Exception):
                self.emotion_analyses.append(emotion_result)
            
            # Run cheating classification
            if all(not isinstance(r, Exception) for r in [behavioral_result, speaker_result, emotion_result]):
                await self._run_cheating_classification(
                    audio_data, behavioral_result, speaker_result, emotion_result
                )
            
        except Exception as e:
            self.logger.error(f"Comprehensive analysis failed: {e}")
    
    async def _run_behavioral_analysis(self, audio_data: np.ndarray) -> Dict:
        """Run behavioral analysis."""
        return await asyncio.get_event_loop().run_in_executor(
            None,
            self.voice_manager.behavioral_analyzer.analyze_behavior,
            audio_data, self.transcription_buffer, [], self.voice_events
        )
    
    async def _run_speaker_analysis(self, audio_data: np.ndarray) -> Dict:
        """Run speaker analysis."""
        return await self.voice_manager.speaker_detector.analyze_audio_async(
            audio_data, self.session_id, self.sample_rate
        )
    
    async def _run_emotion_analysis(self, audio_data: np.ndarray) -> Dict:
        """Run emotion analysis."""
        result = await self.voice_manager.emotion_analyzer.analyze_emotion_async(
            audio_data, session_id=self.session_id
        )
        return result  # EmotionAnalysis object
    
    async def _run_cheating_classification(self, audio_data: np.ndarray, 
                                         behavioral_result: Dict, 
                                         speaker_result: Dict, 
                                         emotion_result: Dict):
        """Run comprehensive cheating classification."""
        try:
            # Create sample from results
            voice_summary = self.voice_manager.voice_processor.get_session_summary()
            
            sample = self.voice_manager.cheating_classifier.create_sample_from_analysis(
                voice_summary, behavioral_result, speaker_result, emotion_result, self.session_id
            )
            
            # Get prediction
            prediction = self.voice_manager.cheating_classifier.predict_cheating(sample)
            
            self.current_risk_score = prediction.risk_score
            self.risk_history.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "risk_score": prediction.risk_score,
                "probability": prediction.probability,
                "is_cheating": prediction.is_cheating
            })
            
            # Send analysis update
            await self.websocket.send_json({
                "type": "voice_analysis_update",
                "data": {
                    "session_id": self.session_id,
                    "risk_score": prediction.risk_score,
                    "probability": prediction.probability,
                    "is_cheating": prediction.is_cheating,
                    "contributing_factors": prediction.contributing_factors[:3],  # Top 3
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            })
            
            # Send alert if threshold exceeded
            if prediction.probability > self.voice_manager.alert_threshold:
                await self._send_cheating_alert(prediction)
            
        except Exception as e:
            self.logger.error(f"Cheating classification failed: {e}")
    
    async def _send_cheating_alert(self, prediction):
        """Send high-risk cheating alert."""
        alert_data = {
            "session_id": self.session_id,
            "risk_score": prediction.risk_score,
            "probability": prediction.probability,
            "contributing_factors": prediction.contributing_factors,
            "evidence_summary": prediction.evidence_summary,
            "severity": "high" if prediction.probability > 0.8 else "medium",
            "message": f"High cheating probability detected: {prediction.probability:.1%}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        await self.voice_manager.send_voice_alert(self.session_id, alert_data)
        
        self.alerts_generated += 1
        self.logger.warning(f"Cheating alert sent for {self.session_id}: {prediction.probability:.1%}")
    
    async def _generate_session_summary(self) -> Dict:
        """Generate comprehensive session summary."""
        session_duration = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        
        return {
            "session_id": self.session_id,
            "duration_seconds": session_duration,
            "start_time": self.start_time.isoformat(),
            "end_time": datetime.now(timezone.utc).isoformat(),
            "audio_chunks_processed": self.audio_chunks_processed,
            "alerts_generated": self.alerts_generated,
            "final_risk_score": self.current_risk_score,
            "voice_processor_summary": self.voice_manager.voice_processor.get_session_summary(),
            "risk_history": self.risk_history[-10:],  # Last 10 risk assessments
            "total_voice_events": len(self.voice_events),
            "total_behavioral_analyses": len(self.behavioral_history),
            "total_speaker_analyses": len(self.speaker_analyses),
            "total_emotion_analyses": len(self.emotion_analyses),
            "analysis_counts": {
                "behavioral": len(self.behavioral_history),
                "speaker": len(self.speaker_analyses),
                "emotion": len(self.emotion_analyses),
                "risk_assessments": len(self.risk_history)
            }
        }