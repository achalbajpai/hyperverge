import json
import asyncio
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import openai
from openai import OpenAI
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
from api.models import (
    IntegrityEventType,
    IntegrityFlagType,
    IntegritySeverity,
    CreateIntegrityFlagRequest,
    CreateIntegrityEventRequest,
)
from api.db.integrity import create_integrity_event, create_integrity_flag
from api.db.chat import get_chat_history_for_question
from api.settings import settings
from api.utils.logging import logger


class IntegrityAnalyzer:
    """AI-powered integrity analysis engine."""
    
    def __init__(self, openai_api_key: Optional[str] = None):
        self.openai_api_key = openai_api_key or settings.openai_api_key
        self.client = OpenAI(api_key=self.openai_api_key) if self.openai_api_key else None
        
    async def analyze_answer_similarity(
        self, 
        user_answer: str, 
        reference_answers: List[str],
        question_id: int,
        user_id: int,
        session_id: Optional[str] = None
    ) -> Dict:
        """Analyze similarity between user answer and reference answers."""
        try:
            # Text preprocessing
            user_answer_clean = self._preprocess_text(user_answer)
            reference_answers_clean = [self._preprocess_text(ref) for ref in reference_answers]
            
            # TF-IDF similarity analysis
            tfidf_scores = self._calculate_tfidf_similarity(user_answer_clean, reference_answers_clean)
            max_tfidf_score = max(tfidf_scores) if tfidf_scores else 0
            
            # OpenAI semantic similarity (if API key available)
            semantic_score = 0
            ai_analysis = "TF-IDF analysis only"
            
            if self.client:
                semantic_analysis = await self._openai_similarity_analysis(
                    user_answer_clean, reference_answers_clean
                )
                semantic_score = semantic_analysis.get("similarity_score", 0)
                ai_analysis = semantic_analysis.get("analysis", "")
            
            # Combine scores
            combined_score = max(max_tfidf_score, semantic_score)
            
            # Log event
            await create_integrity_event(
                user_id,
                CreateIntegrityEventRequest(
                    session_id=session_id,
                    event_type=IntegrityEventType.ANSWER_SIMILARITY,
                    event_data={
                        "tfidf_score": max_tfidf_score,
                        "semantic_score": semantic_score,
                        "combined_score": combined_score,
                        "reference_count": len(reference_answers)
                    },
                    confidence_score=combined_score,
                    question_id=question_id
                )
            )
            
            # Create flag if similarity is high
            if combined_score > 0.8:  # High similarity threshold
                await create_integrity_flag(
                    user_id,
                    CreateIntegrityFlagRequest(
                        session_id=session_id,
                        flag_type=IntegrityFlagType.CONTENT_SIMILARITY,
                        severity=IntegritySeverity.HIGH if combined_score > 0.9 else IntegritySeverity.MEDIUM,
                        confidence_score=combined_score,
                        evidence_data={
                            "user_answer": user_answer[:500],  # Truncated for storage
                            "similarity_scores": tfidf_scores,
                            "max_similarity": combined_score
                        },
                        ai_analysis=ai_analysis,
                        question_id=question_id
                    )
                )
            
            return {
                "similarity_score": combined_score,
                "tfidf_score": max_tfidf_score,
                "semantic_score": semantic_score,
                "flag_created": combined_score > 0.8,
                "analysis": ai_analysis
            }
            
        except Exception as e:
            logger.error(f"Error in similarity analysis: {str(e)}")
            return {"error": str(e)}
    
    async def analyze_typing_patterns(
        self,
        typing_events: List[Dict],
        user_id: int,
        question_id: int,
        session_id: Optional[str] = None
    ) -> Dict:
        """Analyze typing patterns for anomalies."""
        try:
            if not typing_events:
                return {"analysis": "No typing events to analyze"}
            
            # Calculate typing metrics
            metrics = self._calculate_typing_metrics(typing_events)
            
            # Detect anomalies
            anomalies = self._detect_typing_anomalies(metrics)
            
            # Log typing analysis event
            await create_integrity_event(
                user_id,
                CreateIntegrityEventRequest(
                    session_id=session_id,
                    event_type=IntegrityEventType.TYPING_ANOMALY,
                    event_data={
                        "metrics": metrics,
                        "anomalies": anomalies,
                        "event_count": len(typing_events)
                    },
                    confidence_score=anomalies.get("confidence", 0),
                    question_id=question_id
                )
            )
            
            # Create flag for significant anomalies
            if anomalies.get("confidence", 0) > 0.7:
                severity = IntegritySeverity.HIGH if anomalies["confidence"] > 0.9 else IntegritySeverity.MEDIUM
                
                await create_integrity_flag(
                    user_id,
                    CreateIntegrityFlagRequest(
                        session_id=session_id,
                        flag_type=IntegrityFlagType.BEHAVIORAL_ANOMALY,
                        severity=severity,
                        confidence_score=anomalies["confidence"],
                        evidence_data={
                            "typing_metrics": metrics,
                            "anomaly_details": anomalies,
                            "patterns": anomalies.get("patterns", [])
                        },
                        ai_analysis=anomalies.get("description", "Unusual typing patterns detected"),
                        question_id=question_id
                    )
                )
            
            return {
                "metrics": metrics,
                "anomalies": anomalies,
                "flag_created": anomalies.get("confidence", 0) > 0.7
            }
            
        except Exception as e:
            logger.error(f"Error in typing pattern analysis: {str(e)}")
            return {"error": str(e)}
    
    async def analyze_paste_events(
        self,
        paste_events: List[Dict],
        user_id: int,
        question_id: int,
        session_id: Optional[str] = None
    ) -> Dict:
        """Analyze paste events for suspicious patterns."""
        try:
            if not paste_events:
                return {"analysis": "No paste events detected"}
            
            # Analyze paste patterns
            paste_analysis = self._analyze_paste_patterns(paste_events)
            
            # Log paste burst event
            await create_integrity_event(
                user_id,
                CreateIntegrityEventRequest(
                    session_id=session_id,
                    event_type=IntegrityEventType.PASTE_BURST,
                    event_data={
                        "paste_count": len(paste_events),
                        "analysis": paste_analysis,
                        "events": paste_events[:5]  # Store first 5 events
                    },
                    confidence_score=paste_analysis.get("suspicion_score", 0),
                    question_id=question_id
                )
            )
            
            # Create flag for suspicious paste activity
            if paste_analysis.get("suspicion_score", 0) > 0.6:
                severity = self._determine_paste_severity(paste_analysis)
                
                await create_integrity_flag(
                    user_id,
                    CreateIntegrityFlagRequest(
                        session_id=session_id,
                        flag_type=IntegrityFlagType.TECHNICAL_IRREGULARITY,
                        severity=severity,
                        confidence_score=paste_analysis["suspicion_score"],
                        evidence_data={
                            "paste_count": len(paste_events),
                            "paste_analysis": paste_analysis,
                            "time_span": paste_analysis.get("time_span_seconds", 0)
                        },
                        ai_analysis=paste_analysis.get("description", "Suspicious paste activity detected"),
                        question_id=question_id
                    )
                )
            
            return paste_analysis
            
        except Exception as e:
            logger.error(f"Error in paste event analysis: {str(e)}")
            return {"error": str(e)}
    
    async def analyze_completion_time(
        self,
        start_time: datetime,
        end_time: datetime,
        expected_duration: int,  # in seconds
        user_id: int,
        question_id: int,
        session_id: Optional[str] = None
    ) -> Dict:
        """Analyze completion time for anomalies."""
        try:
            actual_duration = (end_time - start_time).total_seconds()
            time_ratio = actual_duration / expected_duration if expected_duration > 0 else 1
            
            analysis = {
                "actual_duration": actual_duration,
                "expected_duration": expected_duration,
                "time_ratio": time_ratio,
                "is_rapid": time_ratio < 0.3,
                "is_very_rapid": time_ratio < 0.1,
                "suspicion_score": 0
            }
            
            # Calculate suspicion score
            if time_ratio < 0.1:
                analysis["suspicion_score"] = 0.9
                analysis["description"] = "Extremely rapid completion"
            elif time_ratio < 0.3:
                analysis["suspicion_score"] = 0.7
                analysis["description"] = "Very rapid completion"
            elif time_ratio < 0.5:
                analysis["suspicion_score"] = 0.4
                analysis["description"] = "Rapid completion"
            
            # Log event
            await create_integrity_event(
                user_id,
                CreateIntegrityEventRequest(
                    session_id=session_id,
                    event_type=IntegrityEventType.RAPID_COMPLETION,
                    event_data=analysis,
                    confidence_score=analysis["suspicion_score"],
                    question_id=question_id
                )
            )
            
            # Create flag for very rapid completion
            if analysis["suspicion_score"] > 0.6:
                severity = IntegritySeverity.HIGH if analysis["suspicion_score"] > 0.8 else IntegritySeverity.MEDIUM
                
                await create_integrity_flag(
                    user_id,
                    CreateIntegrityFlagRequest(
                        session_id=session_id,
                        flag_type=IntegrityFlagType.BEHAVIORAL_ANOMALY,
                        severity=severity,
                        confidence_score=analysis["suspicion_score"],
                        evidence_data={
                            "completion_analysis": analysis,
                            "start_time": start_time.isoformat(),
                            "end_time": end_time.isoformat()
                        },
                        ai_analysis=analysis.get("description", "Unusually rapid task completion"),
                        question_id=question_id
                    )
                )
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error in completion time analysis: {str(e)}")
            return {"error": str(e)}
    
    def _preprocess_text(self, text: str) -> str:
        """Clean and preprocess text for analysis."""
        # Remove extra whitespace and normalize
        text = re.sub(r'\s+', ' ', text.lower().strip())
        # Remove common stopwords and punctuation for better similarity detection
        text = re.sub(r'[^\w\s]', '', text)
        return text
    
    def _calculate_tfidf_similarity(self, user_answer: str, reference_answers: List[str]) -> List[float]:
        """Calculate TF-IDF similarity scores."""
        if not reference_answers:
            return []
        
        try:
            documents = [user_answer] + reference_answers
            vectorizer = TfidfVectorizer()
            tfidf_matrix = vectorizer.fit_transform(documents)
            
            # Calculate cosine similarity between user answer and each reference
            user_vector = tfidf_matrix[0]
            similarities = []
            
            for i in range(1, len(documents)):
                similarity = cosine_similarity(user_vector, tfidf_matrix[i])[0][0]
                similarities.append(float(similarity))
            
            return similarities
        except Exception:
            return []
    
    async def _openai_similarity_analysis(self, user_answer: str, reference_answers: List[str]) -> Dict:
        """Use OpenAI to perform semantic similarity analysis."""
        try:
            prompt = f"""
            Analyze the semantic similarity between the user's answer and the reference answers.
            
            User Answer: "{user_answer}"
            
            Reference Answers:
            {chr(10).join([f"- {ref}" for ref in reference_answers])}
            
            Provide:
            1. A similarity score from 0.0 to 1.0 (where 1.0 is identical meaning)
            2. Brief analysis explaining the similarity
            3. Whether this suggests potential academic dishonesty
            
            Respond in JSON format:
            {{
                "similarity_score": 0.0,
                "analysis": "Brief analysis here",
                "dishonesty_risk": "low/medium/high"
            }}
            """
            
            response = await self.client.chat.completions.acreate(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.1
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            logger.error(f"OpenAI similarity analysis failed: {str(e)}")
            return {"similarity_score": 0, "analysis": "AI analysis unavailable", "dishonesty_risk": "unknown"}
    
    def _calculate_typing_metrics(self, typing_events: List[Dict]) -> Dict:
        """Calculate typing pattern metrics."""
        if not typing_events:
            return {}
        
        # Sort events by timestamp
        sorted_events = sorted(typing_events, key=lambda x: x.get('timestamp', 0))
        
        # Calculate intervals between keystrokes
        intervals = []
        for i in range(1, len(sorted_events)):
            interval = sorted_events[i]['timestamp'] - sorted_events[i-1]['timestamp']
            intervals.append(interval)
        
        if not intervals:
            return {"event_count": len(typing_events)}
        
        intervals_array = np.array(intervals)
        
        metrics = {
            "event_count": len(typing_events),
            "total_time": sorted_events[-1]['timestamp'] - sorted_events[0]['timestamp'],
            "avg_interval": float(np.mean(intervals_array)),
            "std_interval": float(np.std(intervals_array)),
            "min_interval": float(np.min(intervals_array)),
            "max_interval": float(np.max(intervals_array)),
            "median_interval": float(np.median(intervals_array))
        }
        
        # Calculate typing speed (rough approximation)
        if metrics["total_time"] > 0:
            metrics["chars_per_second"] = len(typing_events) / metrics["total_time"]
            metrics["wpm_estimate"] = (metrics["chars_per_second"] * 60) / 5  # Assuming 5 chars per word
        
        return metrics
    
    def _detect_typing_anomalies(self, metrics: Dict) -> Dict:
        """Detect anomalies in typing patterns."""
        anomalies = {"patterns": [], "confidence": 0}
        
        if not metrics or "avg_interval" not in metrics:
            return anomalies
        
        confidence_score = 0
        
        # Check for unusually consistent timing (bot-like behavior)
        if metrics.get("std_interval", 0) < 0.05 and metrics.get("avg_interval", 0) > 0:
            anomalies["patterns"].append("unusually_consistent_timing")
            confidence_score += 0.3
        
        # Check for extremely fast typing
        if metrics.get("wpm_estimate", 0) > 120:  # Very fast typing
            anomalies["patterns"].append("extremely_fast_typing")
            confidence_score += 0.4
        
        # Check for long pauses followed by bursts
        if metrics.get("max_interval", 0) > 5 and metrics.get("min_interval", 0) < 0.1:
            anomalies["patterns"].append("pause_burst_pattern")
            confidence_score += 0.3
        
        anomalies["confidence"] = min(confidence_score, 1.0)
        
        if anomalies["confidence"] > 0.5:
            anomalies["description"] = f"Suspicious typing patterns detected: {', '.join(anomalies['patterns'])}"
        
        return anomalies
    
    def _analyze_paste_patterns(self, paste_events: List[Dict]) -> Dict:
        """Analyze patterns in paste events."""
        if not paste_events:
            return {"suspicion_score": 0}
        
        # Calculate time span of paste events
        timestamps = [event.get('timestamp', 0) for event in paste_events]
        time_span = max(timestamps) - min(timestamps) if timestamps else 0
        
        analysis = {
            "paste_count": len(paste_events),
            "time_span_seconds": time_span,
            "suspicion_score": 0,
            "patterns": []
        }
        
        # Multiple pastes in short time = suspicious
        if len(paste_events) > 3 and time_span < 60:  # 3+ pastes in 1 minute
            analysis["patterns"].append("rapid_multiple_pastes")
            analysis["suspicion_score"] += 0.4
        
        # Large paste content
        total_paste_length = sum(len(event.get('content', '')) for event in paste_events)
        if total_paste_length > 1000:  # Large amount of pasted content
            analysis["patterns"].append("large_paste_volume")
            analysis["suspicion_score"] += 0.3
        
        # Single massive paste
        max_paste_length = max(len(event.get('content', '')) for event in paste_events)
        if max_paste_length > 500:
            analysis["patterns"].append("large_single_paste")
            analysis["suspicion_score"] += 0.2
        
        analysis["suspicion_score"] = min(analysis["suspicion_score"], 1.0)
        
        if analysis["suspicion_score"] > 0.5:
            analysis["description"] = f"Suspicious paste activity: {', '.join(analysis['patterns'])}"
        
        return analysis
    
    def _determine_paste_severity(self, paste_analysis: Dict) -> IntegritySeverity:
        """Determine severity level for paste-related flags."""
        score = paste_analysis.get("suspicion_score", 0)
        
        if score > 0.8:
            return IntegritySeverity.HIGH
        elif score > 0.6:
            return IntegritySeverity.MEDIUM
        else:
            return IntegritySeverity.LOW


# Global analyzer instance
integrity_analyzer = IntegrityAnalyzer()


# Convenience functions for easy access
async def analyze_answer_similarity(user_answer: str, reference_answers: List[str], 
                                  question_id: int, user_id: int, session_id: Optional[str] = None):
    return await integrity_analyzer.analyze_answer_similarity(
        user_answer, reference_answers, question_id, user_id, session_id
    )


async def analyze_typing_patterns(typing_events: List[Dict], user_id: int, 
                                question_id: int, session_id: Optional[str] = None):
    return await integrity_analyzer.analyze_typing_patterns(
        typing_events, user_id, question_id, session_id
    )


async def analyze_paste_events(paste_events: List[Dict], user_id: int, 
                             question_id: int, session_id: Optional[str] = None):
    return await integrity_analyzer.analyze_paste_events(
        paste_events, user_id, question_id, session_id
    )


async def analyze_completion_time(start_time: datetime, end_time: datetime, 
                                expected_duration: int, user_id: int, question_id: int, 
                                session_id: Optional[str] = None):
    return await integrity_analyzer.analyze_completion_time(
        start_time, end_time, expected_duration, user_id, question_id, session_id
    )