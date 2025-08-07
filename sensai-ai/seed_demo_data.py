#!/usr/bin/env python3
"""
Demo Data Seeder for Integrity Suite
Creates realistic test data to make the demo more impressive
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta
import random

# Add the src directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from api.db.integrity import (
    create_integrity_event,
    create_integrity_flag,
    start_proctoring_session,
    create_integrity_review
)
from api.models import (
    CreateIntegrityEventRequest,
    CreateIntegrityFlagRequest,
    CreateIntegrityReviewRequest,
    IntegrityEventType,
    IntegrityFlagType,
    IntegritySeverity,
    IntegrityFlagStatus,
    ReviewDecision,
    StartProctoringSessionRequest
)

async def create_demo_data():
    """Create comprehensive demo data for impressive demo"""
    
    print("🚀 Creating demo data for Integrity Suite...")
    
    # 1. Create multiple proctoring sessions for different users/assessments
    sessions = []
    for i in range(3):
        session_request = StartProctoringSessionRequest(
            task_id=i+1,
            question_id=i+1
        )
        session = await start_proctoring_session(user_id=i+1, session_request=session_request)
        sessions.append(session)
        print(f"✅ Created proctoring session {i+1}: {session.session_id}")
    
    # 2. Create realistic integrity events
    events_data = [
        {
            "user_id": 1,
            "session_id": sessions[0].session_id,
            "event_type": IntegrityEventType.PASTE_BURST,
            "event_data": {
                "paste_count": 3,
                "total_length": 245,
                "time_span_seconds": 15,
                "content_preview": "Database normalization is the process of organizing data..."
            },
            "confidence_score": 0.85,
            "question_id": 1
        },
        {
            "user_id": 1,
            "session_id": sessions[0].session_id,
            "event_type": IntegrityEventType.TYPING_ANOMALY,
            "event_data": {
                "baseline_wpm": 45,
                "burst_wpm": 180,
                "anomaly_duration": 120,
                "pattern": "sudden_speed_increase"
            },
            "confidence_score": 0.73,
            "question_id": 2
        },
        {
            "user_id": 2,
            "session_id": sessions[1].session_id,
            "event_type": IntegrityEventType.TAB_SWITCH,
            "event_data": {
                "switch_count": 7,
                "external_sites": ["stackoverflow.com", "github.com"],
                "time_away_seconds": 185
            },
            "confidence_score": 0.91,
            "question_id": 1
        },
        {
            "user_id": 3,
            "session_id": sessions[2].session_id,
            "event_type": IntegrityEventType.RAPID_COMPLETION,
            "event_data": {
                "expected_time_minutes": 15,
                "actual_time_minutes": 4.2,
                "completion_ratio": 0.28
            },
            "confidence_score": 0.88,
            "question_id": 3
        }
    ]
    
    for event_data in events_data:
        event_request = CreateIntegrityEventRequest(
            event_type=event_data["event_type"],
            event_data=event_data["event_data"],
            confidence_score=event_data["confidence_score"],
            question_id=event_data.get("question_id"),
            session_id=event_data.get("session_id")
        )
        event = await create_integrity_event(event_data["user_id"], event_request)
        print(f"✅ Created integrity event: {event_data['event_type'].value}")
    
    # 3. Create diverse integrity flags with realistic AI analysis
    flags_data = [
        {
            "user_id": 1,
            "session_id": sessions[0].session_id,
            "flag_type": IntegrityFlagType.CONTENT_SIMILARITY,
            "severity": IntegritySeverity.HIGH,
            "confidence_score": 0.94,
            "ai_analysis": "High semantic similarity detected with reference answer. Key phrases match exactly: 'first normal form', 'functional dependency', 'transitive dependency'. Recommendation: Human review required.",
            "evidence_data": {
                "similarity_score": 0.94,
                "matching_phrases": 15,
                "reference_answer_id": "db_norm_ref_1",
                "student_answer_length": 387,
                "unique_content_ratio": 0.23
            },
            "question_id": 1
        },
        {
            "user_id": 1,
            "session_id": sessions[0].session_id,
            "flag_type": IntegrityFlagType.BEHAVIORAL_ANOMALY,
            "severity": IntegritySeverity.MEDIUM,
            "confidence_score": 0.78,
            "ai_analysis": "Unusual typing pattern detected. Student's typing speed increased 400% during final portion of answer, suggesting potential copy-paste or external assistance.",
            "evidence_data": {
                "baseline_wpm": 45,
                "peak_wpm": 180,
                "anomaly_start_time": "2025-08-07T10:15:30Z",
                "anomaly_duration_seconds": 95
            },
            "question_id": 2
        },
        {
            "user_id": 2,
            "session_id": sessions[1].session_id,
            "flag_type": IntegrityFlagType.PROCTORING_VIOLATION,
            "severity": IntegritySeverity.HIGH,
            "confidence_score": 0.89,
            "ai_analysis": "Multiple tab switches detected during assessment. Student accessed external resources including Stack Overflow and GitHub. Total time away from assessment: 3 minutes 5 seconds.",
            "evidence_data": {
                "tab_switches": 7,
                "external_sites": ["stackoverflow.com", "github.com", "w3schools.com"],
                "time_away_total": 185,
                "longest_absence": 78
            },
            "question_id": 1
        },
        {
            "user_id": 3,
            "session_id": sessions[2].session_id,
            "flag_type": IntegrityFlagType.TECHNICAL_IRREGULARITY,
            "severity": IntegritySeverity.CRITICAL,
            "confidence_score": 0.96,
            "ai_analysis": "Assessment completed in 28% of expected time with 100% accuracy. This pattern is highly unusual and suggests pre-knowledge of questions or unauthorized assistance.",
            "evidence_data": {
                "expected_duration_minutes": 15,
                "actual_duration_minutes": 4.2,
                "accuracy_score": 1.0,
                "time_per_question_avg": 1.4,
                "expected_time_per_question": 5.0
            },
            "question_id": 3
        },
        {
            "user_id": 2,
            "session_id": sessions[1].session_id,
            "flag_type": IntegrityFlagType.CONTENT_SIMILARITY,
            "severity": IntegritySeverity.LOW,
            "confidence_score": 0.65,
            "ai_analysis": "Moderate similarity with online tutorial content. Some technical terms and code snippets match common educational resources, but overall structure is original.",
            "evidence_data": {
                "similarity_score": 0.65,
                "source_type": "tutorial_content",
                "matching_concepts": 8,
                "original_content_ratio": 0.67
            },
            "question_id": 2
        }
    ]
    
    created_flags = []
    for flag_data in flags_data:
        flag_request = CreateIntegrityFlagRequest(
            flag_type=flag_data["flag_type"],
            severity=flag_data["severity"],
            confidence_score=flag_data["confidence_score"],
            ai_analysis=flag_data["ai_analysis"],
            evidence_data=flag_data["evidence_data"],
            question_id=flag_data.get("question_id"),
            session_id=flag_data.get("session_id")
        )
        flag = await create_integrity_flag(flag_data["user_id"], flag_request)
        created_flags.append(flag)
        print(f"✅ Created integrity flag: {flag_data['flag_type'].value} - {flag_data['severity'].value}")
    
    # 4. Create sample reviews for some flags (showing different outcomes)
    reviews_data = [
        {
            "flag": created_flags[0],  # High similarity flag
            "reviewer_user_id": 2,  # Different user as reviewer
            "decision": ReviewDecision.INTEGRITY_VIOLATION,
            "notes": "Clear evidence of copying from reference material. Student should retake assessment with different questions and receive academic integrity training.",
            "follow_up_action": "Schedule meeting with student, assign integrity training module, retake assessment with different questions"
        },
        {
            "flag": created_flags[1],  # Behavioral anomaly
            "reviewer_user_id": 2,
            "decision": ReviewDecision.MINOR_CONCERN,
            "notes": "Typing pattern anomaly noted but could be explained by student pausing to think and then typing quickly. Benefit of doubt given due to overall good performance.",
            "follow_up_action": "No immediate action required, monitor in future assessments"
        },
        {
            "flag": created_flags[4],  # Low similarity flag
            "reviewer_user_id": 2,
            "decision": ReviewDecision.NO_VIOLATION,
            "notes": "Similarity with tutorial content is expected for technical questions. Student demonstrated understanding through original explanations and examples.",
            "follow_up_action": "None - flag dismissed as false positive"
        }
    ]
    
    for review_data in reviews_data:
        review_request = CreateIntegrityReviewRequest(
            decision=review_data["decision"],
            notes=review_data["notes"],
            follow_up_action=review_data["follow_up_action"]
        )
        review = await create_integrity_review(
            flag_id=review_data["flag"].id,
            reviewer_user_id=review_data["reviewer_user_id"],
            review_request=review_request
        )
        print(f"✅ Created review: {review_data['decision'].value}")
    
    print("\n🎉 Demo data creation complete!")
    print(f"Created:")
    print(f"  • {len(sessions)} proctoring sessions")
    print(f"  • {len(events_data)} integrity events") 
    print(f"  • {len(flags_data)} integrity flags")
    print(f"  • {len(reviews_data)} integrity reviews")
    print(f"\n🚀 Your demo is now ready with realistic data!")
    print(f"👉 Visit: http://localhost:3000/test-integrity")

async def clear_existing_data():
    """Clear existing demo data for fresh start"""
    from api.utils.db import execute_db_operation
    from api.config import (
        integrity_events_table_name,
        integrity_flags_table_name, 
        integrity_reviews_table_name,
        proctoring_sessions_table_name
    )
    
    print("🧹 Clearing existing demo data...")
    
    # Clear in reverse dependency order
    await execute_db_operation(f"DELETE FROM {integrity_reviews_table_name}")
    await execute_db_operation(f"DELETE FROM {integrity_flags_table_name}")
    await execute_db_operation(f"DELETE FROM {integrity_events_table_name}")
    await execute_db_operation(f"DELETE FROM {proctoring_sessions_table_name}")
    
    print("✅ Existing data cleared")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Seed demo data for Integrity Suite')
    parser.add_argument('--clear', action='store_true', help='Clear existing data first')
    args = parser.parse_args()
    
    async def main():
        if args.clear:
            await clear_existing_data()
        await create_demo_data()
    
    asyncio.run(main())