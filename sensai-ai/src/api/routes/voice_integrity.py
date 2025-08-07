"""
Voice Integrity API Routes

This module provides REST API endpoints for voice-based integrity detection
and management, complementing the real-time WebSocket processing.
"""

import asyncio
import logging
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from datetime import datetime, timezone

from api.models import (
    IntegrityEvent, CreateIntegrityEventRequest, IntegrityEventType,
    IntegrityFlag, CreateIntegrityFlagRequest, IntegrityFlagType,
    IntegritySeverity, IntegrityFlagStatus
)

try:
    from ..voice_integrity.real_time_processor import VoiceProcessor
    from ..voice_integrity.behavioral_analyzer import BehavioralAnalyzer
    from ..voice_integrity.speaker_detector import SpeakerDetector
    from ..voice_integrity.emotion_analyzer import EmotionAnalyzer
    from ..voice_integrity.cheating_classifier import CheatingClassifier
    from ..websockets import get_voice_manager
    VOICE_PROCESSING_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Voice processing modules not available: {e}")
    VOICE_PROCESSING_AVAILABLE = False

router = APIRouter()


# Voice processing components (initialized if available)
if VOICE_PROCESSING_AVAILABLE:
    voice_processor = VoiceProcessor()
    behavioral_analyzer = BehavioralAnalyzer()
    speaker_detector = SpeakerDetector()
    emotion_analyzer = EmotionAnalyzer()
    cheating_classifier = CheatingClassifier()
else:
    voice_processor = None
    behavioral_analyzer = None
    speaker_detector = None
    emotion_analyzer = None
    cheating_classifier = None


# Utility function to check if voice processing is available
def check_voice_processing():
    """Check if voice processing is available."""
    if not VOICE_PROCESSING_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Voice processing not available. Please install required dependencies."
        )


# Health and Status Endpoints

@router.get("/health")
async def voice_health_check():
    """Health check for voice processing system."""
    voice_manager = get_voice_manager()
    
    return {
        "status": "healthy" if VOICE_PROCESSING_AVAILABLE else "unavailable",
        "voice_processing_available": VOICE_PROCESSING_AVAILABLE,
        "active_sessions": len(voice_manager.active_sessions) if voice_manager else 0,
        "components": {
            "voice_processor": voice_processor is not None,
            "behavioral_analyzer": behavioral_analyzer is not None,
            "speaker_detector": speaker_detector is not None,
            "emotion_analyzer": emotion_analyzer is not None,
            "cheating_classifier": cheating_classifier is not None
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/status")
async def get_voice_processing_status():
    """Get detailed status of voice processing system."""
    check_voice_processing()
    
    voice_manager = get_voice_manager()
    
    status = {
        "system_status": "active",
        "active_sessions": voice_manager.get_active_sessions() if voice_manager else {},
        "component_status": {}
    }
    
    # Get status from each component
    if cheating_classifier:
        status["component_status"]["classifier"] = cheating_classifier.get_model_status()
    
    if voice_processor:
        status["component_status"]["voice_processor"] = {
            "is_active": voice_processor.is_active,
            "session_start_time": voice_processor.session_start_time.isoformat() if voice_processor.session_start_time else None
        }
    
    if behavioral_analyzer:
        status["component_status"]["behavioral_analyzer"] = behavioral_analyzer.get_analysis_summary()
    
    if speaker_detector:
        status["component_status"]["speaker_detector"] = speaker_detector.get_session_summary()
    
    if emotion_analyzer:
        status["component_status"]["emotion_analyzer"] = emotion_analyzer.get_analysis_summary()
    
    return status


# Analysis Endpoints

@router.post("/analyze/audio")
async def analyze_audio_file(
    file: UploadFile = File(...),
    session_id: str = Query(...),
    include_transcription: bool = Query(False),
    sample_rate: int = Query(16000)
):
    """
    Analyze uploaded audio file for cheating indicators.
    
    Args:
        file: Audio file to analyze
        session_id: Test session ID
        include_transcription: Whether to include transcription analysis
        sample_rate: Audio sample rate
    """
    check_voice_processing()
    
    try:
        # Read audio file
        audio_data = await file.read()
        
        # Convert to numpy array (assuming WAV format)
        import numpy as np
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0  # Normalize
        
        # Run comprehensive analysis
        result = await cheating_classifier.analyze_session_async(
            audio_np, "", session_id, sample_rate
        )
        
        # Add file metadata
        result["file_info"] = {
            "filename": file.filename,
            "content_type": file.content_type,
            "file_size": len(audio_data),
            "duration_seconds": len(audio_np) / sample_rate
        }
        
        return result
        
    except Exception as e:
        logging.error(f"Audio analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze/behavioral")
async def analyze_behavioral_patterns(
    audio_data: str,  # Base64 encoded
    transcription: str = "",
    session_id: str = Query(...),
    sample_rate: int = Query(16000)
):
    """
    Analyze behavioral patterns from audio and transcription.
    
    Args:
        audio_data: Base64 encoded audio data
        transcription: Speech transcription
        session_id: Test session ID
        sample_rate: Audio sample rate
    """
    check_voice_processing()
    
    try:
        import base64
        import numpy as np
        
        # Decode audio
        audio_bytes = base64.b64decode(audio_data)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0
        
        # Analyze behavioral patterns
        metrics = behavioral_analyzer.analyze_behavior(
            audio_np, transcription, [], []
        )
        
        return {
            "session_id": session_id,
            "behavioral_metrics": metrics.__dict__,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logging.error(f"Behavioral analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze/speakers")
async def analyze_speakers(
    audio_data: str,  # Base64 encoded
    session_id: str = Query(...),
    sample_rate: int = Query(16000)
):
    """
    Analyze speaker patterns and diarization.
    
    Args:
        audio_data: Base64 encoded audio data
        session_id: Test session ID
        sample_rate: Audio sample rate
    """
    check_voice_processing()
    
    try:
        import base64
        import numpy as np
        
        # Decode audio
        audio_bytes = base64.b64decode(audio_data)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0
        
        # Analyze speakers
        result = await speaker_detector.analyze_audio_async(
            audio_np, session_id, sample_rate
        )
        
        return result
        
    except Exception as e:
        logging.error(f"Speaker analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze/emotion")
async def analyze_emotion(
    audio_data: str,  # Base64 encoded
    session_id: str = Query(...),
    sample_rate: int = Query(16000)
):
    """
    Analyze emotional indicators and stress patterns.
    
    Args:
        audio_data: Base64 encoded audio data
        session_id: Test session ID
        sample_rate: Audio sample rate
    """
    check_voice_processing()
    
    try:
        import base64
        import numpy as np
        
        # Decode audio
        audio_bytes = base64.b64decode(audio_data)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0
        
        # Analyze emotion
        result = await emotion_analyzer.analyze_emotion_async(
            audio_np, session_id=session_id
        )
        
        return {
            "session_id": session_id,
            "emotion_analysis": result.__dict__,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logging.error(f"Emotion analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze/comprehensive")
async def comprehensive_analysis(
    audio_data: str,  # Base64 encoded
    transcription: str = "",
    session_id: str = Query(...),
    sample_rate: int = Query(16000)
):
    """
    Perform comprehensive cheating analysis using all components.
    
    Args:
        audio_data: Base64 encoded audio data
        transcription: Speech transcription
        session_id: Test session ID
        sample_rate: Audio sample rate
    """
    check_voice_processing()
    
    try:
        import base64
        import numpy as np
        
        # Decode audio
        audio_bytes = base64.b64decode(audio_data)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0
        
        # Run comprehensive analysis
        result = await cheating_classifier.analyze_session_async(
            audio_np, transcription, session_id, sample_rate
        )
        
        return result
        
    except Exception as e:
        logging.error(f"Comprehensive analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# Training and Model Management Endpoints

@router.post("/model/train")
async def train_models(
    validation_split: float = Query(0.2, ge=0.1, le=0.5)
):
    """
    Train the cheating classification models on collected data.
    
    Args:
        validation_split: Fraction of data for validation
    """
    check_voice_processing()
    
    try:
        # Check if we have enough training data
        if len(cheating_classifier.training_samples) < 10:
            raise HTTPException(
                status_code=400,
                detail=f"Need at least 10 training samples. Current: {len(cheating_classifier.training_samples)}"
            )
        
        # Train models
        metrics = cheating_classifier.train_models(validation_split)
        
        return {
            "training_completed": True,
            "training_samples": len(cheating_classifier.training_samples),
            "validation_split": validation_split,
            "model_metrics": metrics,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logging.error(f"Model training failed: {e}")
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@router.post("/model/add-sample")
async def add_training_sample(
    audio_data: str,  # Base64 encoded
    transcription: str,
    is_cheating: bool,
    session_id: str = Query(...),
    sample_rate: int = Query(16000)
):
    """
    Add a labeled sample to the training dataset.
    
    Args:
        audio_data: Base64 encoded audio data
        transcription: Speech transcription
        is_cheating: True if this sample represents cheating
        session_id: Test session ID
        sample_rate: Audio sample rate
    """
    check_voice_processing()
    
    try:
        import base64
        import numpy as np
        
        # Decode audio
        audio_bytes = base64.b64decode(audio_data)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_np = audio_np / 32768.0
        
        # Analyze to create features
        tasks = [
            behavioral_analyzer.analyze_behavior(audio_np, transcription, [], []),
            speaker_detector.analyze_audio_async(audio_np, session_id, sample_rate),
            emotion_analyzer.analyze_emotion_async(audio_np, session_id=session_id)
        ]
        
        behavioral_result, speaker_result, emotion_result = await asyncio.gather(*tasks)
        
        # Create sample
        voice_summary = {"speech_ratio": 0.5, "suspicious_events": [], "average_speech_confidence": 0.8}
        sample = cheating_classifier.create_sample_from_analysis(
            voice_summary, behavioral_result, speaker_result, emotion_result,
            session_id, is_cheating
        )
        
        # Add to training data
        cheating_classifier.add_training_sample(sample)
        
        return {
            "sample_added": True,
            "total_samples": len(cheating_classifier.training_samples),
            "sample_features": sample.__dict__,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logging.error(f"Failed to add training sample: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add sample: {str(e)}")


@router.get("/model/status")
async def get_model_status():
    """Get status of the cheating classification models."""
    check_voice_processing()
    
    return cheating_classifier.get_model_status()


# Session Management Endpoints

@router.get("/sessions/active")
async def get_active_sessions():
    """Get information about all active voice processing sessions."""
    voice_manager = get_voice_manager()
    
    if not voice_manager:
        return {"active_sessions": {}, "message": "Voice processing not available"}
    
    return voice_manager.get_active_sessions()


@router.post("/sessions/{session_id}/stop")
async def stop_voice_session(session_id: str):
    """
    Stop an active voice processing session.
    
    Args:
        session_id: Test session ID to stop
    """
    voice_manager = get_voice_manager()
    
    if not voice_manager:
        raise HTTPException(status_code=503, detail="Voice processing not available")
    
    if session_id not in voice_manager.active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    summary = await voice_manager.stop_voice_session(session_id)
    
    return {
        "session_stopped": True,
        "session_id": session_id,
        "summary": summary,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/sessions/{session_id}/summary")
async def get_session_summary(session_id: str):
    """
    Get summary of a voice processing session.
    
    Args:
        session_id: Test session ID
    """
    voice_manager = get_voice_manager()
    
    if not voice_manager:
        raise HTTPException(status_code=503, detail="Voice processing not available")
    
    if session_id not in voice_manager.active_sessions:
        raise HTTPException(status_code=404, detail="Session not found or ended")
    
    session = voice_manager.active_sessions[session_id]
    summary = await session._generate_session_summary()
    
    return summary


# Integration with Existing Integrity System

@router.post("/create-integrity-flag")
async def create_voice_integrity_flag(
    user_id: int,
    session_id: str,
    voice_analysis_result: Dict,
    org_id: int = Query(1)
):
    """
    Create an integrity flag based on voice analysis results.
    
    Args:
        user_id: User ID
        session_id: Test session ID
        voice_analysis_result: Results from voice analysis
        org_id: Organization ID
    """
    try:
        # Import the integrity creation function
        from ..db.integrity import create_integrity_flag
        
        # Extract information from voice analysis
        prediction = voice_analysis_result.get("prediction", {})
        
        # Create integrity flag request
        flag_request = CreateIntegrityFlagRequest(
            session_id=session_id,
            flag_type=IntegrityFlagType.PROCTORING_VIOLATION,
            severity=IntegritySeverity.HIGH if prediction.get("probability", 0) > 0.8 else IntegritySeverity.MEDIUM,
            confidence_score=prediction.get("confidence", 0.5),
            evidence_data={
                "voice_analysis": voice_analysis_result,
                "cheating_probability": prediction.get("probability", 0),
                "contributing_factors": prediction.get("contributing_factors", []),
                "risk_breakdown": prediction.get("risk_breakdown", {}),
                "analysis_type": "voice_comprehensive"
            },
            ai_analysis=f"Voice analysis detected potential cheating with {prediction.get('probability', 0):.1%} probability. "
                       f"Key factors: {', '.join(prediction.get('contributing_factors', [])[:3])}"
        )
        
        # Create the flag
        flag = await create_integrity_flag(user_id, flag_request)
        
        # Send notification through WebSocket
        voice_manager = get_voice_manager()
        if voice_manager:
            await voice_manager.integrity_manager.send_integrity_flag(org_id, {
                "flag_id": flag.id,
                "user_id": user_id,
                "session_id": session_id,
                "flag_type": flag.flag_type,
                "severity": flag.severity,
                "voice_analysis": voice_analysis_result
            })
        
        return {
            "flag_created": True,
            "flag_id": flag.id,
            "flag": flag.__dict__,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logging.error(f"Failed to create integrity flag: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create flag: {str(e)}")


# Configuration and Settings

@router.get("/config")
async def get_voice_config():
    """Get voice processing configuration."""
    check_voice_processing()
    
    config = {
        "voice_processor": {
            "sample_rate": voice_processor.sample_rate,
            "chunk_size": voice_processor.chunk_size,
            "vad_threshold": voice_processor.vad_threshold
        },
        "behavioral_analyzer": {
            "window_size": behavioral_analyzer.window_size,
            "confidence_threshold": behavioral_analyzer.confidence_threshold
        },
        "analysis_intervals": {
            "periodic_analysis": 10.0,
            "alert_threshold": 0.7
        },
        "available_components": {
            "silero_vad": True,
            "pyannote_diarization": speaker_detector.model_loaded if speaker_detector else False,
            "emotion_analysis": emotion_analyzer is not None,
            "ml_classification": cheating_classifier.is_trained if cheating_classifier else False
        }
    }
    
    return config


@router.put("/config")
async def update_voice_config(config: Dict):
    """
    Update voice processing configuration.
    
    Args:
        config: Configuration updates
    """
    check_voice_processing()
    
    try:
        updated_components = []
        
        # Update voice processor config
        if "voice_processor" in config:
            vp_config = config["voice_processor"]
            if "vad_threshold" in vp_config:
                voice_processor.vad_threshold = vp_config["vad_threshold"]
                updated_components.append("voice_processor.vad_threshold")
        
        # Update behavioral analyzer config
        if "behavioral_analyzer" in config:
            ba_config = config["behavioral_analyzer"]
            if "confidence_threshold" in ba_config:
                behavioral_analyzer.confidence_threshold = ba_config["confidence_threshold"]
                updated_components.append("behavioral_analyzer.confidence_threshold")
        
        return {
            "config_updated": True,
            "updated_components": updated_components,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logging.error(f"Failed to update config: {e}")
        raise HTTPException(status_code=500, detail=f"Config update failed: {str(e)}")


# Export endpoint for compatibility with existing system
@router.post("/process-audio")
async def process_audio_endpoint(
    audio_data: str,
    transcription: str = "",
    session_id: str = Query(...),
    format: str = Query("webm"),
    test_duration_minutes: int = Query(60)
):
    """
    Process audio for compatibility with existing system.
    This endpoint provides the same interface as the existing audio processing.
    """
    try:
        # Use comprehensive analysis
        result = await comprehensive_analysis(
            audio_data=audio_data,
            transcription=transcription,
            session_id=session_id,
            sample_rate=16000
        )
        
        # Format result to match existing API
        prediction = result.get("prediction", {})
        
        return {
            "session_id": session_id,
            "cheating_detected": prediction.get("is_cheating", False),
            "cheating_probability": prediction.get("probability", 0.0),
            "confidence": prediction.get("confidence", 0.0),
            "risk_score": prediction.get("risk_score", 0.0),
            "contributing_factors": prediction.get("contributing_factors", []),
            "evidence_summary": prediction.get("evidence_summary", {}),
            "detailed_analysis": result.get("detailed_analysis", {}),
            "processing_timestamp": datetime.now(timezone.utc).isoformat(),
            "test_duration_minutes": test_duration_minutes,
            "format": format
        }
        
    except Exception as e:
        logging.error(f"Audio processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")