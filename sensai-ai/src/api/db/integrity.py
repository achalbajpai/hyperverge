import json
import uuid
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from api.utils.db import execute_db_operation
from api.config import (
    integrity_events_table_name,
    proctoring_sessions_table_name,
    integrity_flags_table_name,
    integrity_reviews_table_name,
    users_table_name,
    questions_table_name,
    tasks_table_name,
)
from api.models import (
    IntegrityEvent,
    CreateIntegrityEventRequest,
    ProctoringSession,
    StartProctoringSessionRequest,
    IntegrityFlag,
    CreateIntegrityFlagRequest,
    IntegrityReview,
    CreateIntegrityReviewRequest,
    IntegrityFlagWithDetails,
    IntegrityTimelineEntry,
    IntegrityDashboardStats,
    IntegrityEventType,
    IntegrityFlagType,
    IntegritySeverity,
    IntegrityFlagStatus,
    ReviewDecision,
)


async def create_integrity_event(
    user_id: int, event_request: CreateIntegrityEventRequest
) -> IntegrityEvent:
    """Create a new integrity event."""
    event_data_json = json.dumps(event_request.event_data) if event_request.event_data else None
    
    event_id = await execute_db_operation(
        f"""
        INSERT INTO {integrity_events_table_name} 
        (user_id, session_id, event_type, event_data, confidence_score, question_id, task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            event_request.session_id,
            event_request.event_type.value,
            event_data_json,
            event_request.confidence_score,
            event_request.question_id,
            event_request.task_id,
        ),
        fetch_one=True,
    )
    
    return await get_integrity_event(event_id)


async def get_integrity_event(event_id: int) -> Optional[IntegrityEvent]:
    """Get an integrity event by ID."""
    row = await execute_db_operation(
        f"""
        SELECT id, user_id, session_id, event_type, event_data, confidence_score, 
               question_id, task_id, created_at
        FROM {integrity_events_table_name}
        WHERE id = ?
        """,
        (event_id,),
        fetch_one=True,
    )
    
    if not row:
        return None
    
    event_data = json.loads(row[4]) if row[4] else None
    
    return IntegrityEvent(
        id=row[0],
        user_id=row[1],
        session_id=row[2],
        event_type=IntegrityEventType(row[3]),
        event_data=event_data,
        confidence_score=row[5],
        question_id=row[6],
        task_id=row[7],
        created_at=datetime.fromisoformat(row[8]) if row[8] else None,
    )


async def get_user_integrity_events(
    user_id: int,
    session_id: Optional[str] = None,
    limit: int = 100,
) -> List[IntegrityEvent]:
    """Get integrity events for a user."""
    query = f"""
        SELECT id, user_id, session_id, event_type, event_data, confidence_score,
               question_id, task_id, created_at
        FROM {integrity_events_table_name}
        WHERE user_id = ?
    """
    params = [user_id]
    
    if session_id:
        query += " AND session_id = ?"
        params.append(session_id)
    
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    rows = await execute_db_operation(query, tuple(params), fetch_all=True)
    
    events = []
    for row in rows:
        event_data = json.loads(row[4]) if row[4] else None
        events.append(
            IntegrityEvent(
                id=row[0],
                user_id=row[1],
                session_id=row[2],
                event_type=IntegrityEventType(row[3]),
                event_data=event_data,
                confidence_score=row[5],
                question_id=row[6],
                task_id=row[7],
                created_at=datetime.fromisoformat(row[8]) if row[8] else None,
            )
        )
    
    return events


async def start_proctoring_session(
    user_id: int, session_request: StartProctoringSessionRequest
) -> ProctoringSession:
    """Start a new proctoring session."""
    session_id = str(uuid.uuid4())
    session_data_json = json.dumps(session_request.session_data) if session_request.session_data else None
    
    await execute_db_operation(
        f"""
        INSERT INTO {proctoring_sessions_table_name}
        (session_id, user_id, task_id, question_id, session_data)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            session_id,
            user_id,
            session_request.task_id,
            session_request.question_id,
            session_data_json,
        ),
    )
    
    return await get_proctoring_session(session_id)


async def end_proctoring_session(
    session_id: str, integrity_score: Optional[float] = None
) -> bool:
    """End a proctoring session."""
    await execute_db_operation(
        f"""
        UPDATE {proctoring_sessions_table_name}
        SET ended_at = CURRENT_TIMESTAMP, integrity_score = ?
        WHERE session_id = ? AND ended_at IS NULL
        """,
        (integrity_score, session_id),
    )
    return True


async def get_proctoring_session(session_id: str) -> Optional[ProctoringSession]:
    """Get a proctoring session by session ID."""
    row = await execute_db_operation(
        f"""
        SELECT id, session_id, user_id, task_id, question_id, started_at, 
               ended_at, session_data, integrity_score
        FROM {proctoring_sessions_table_name}
        WHERE session_id = ?
        """,
        (session_id,),
        fetch_one=True,
    )
    
    if not row:
        return None
    
    session_data = json.loads(row[7]) if row[7] else None
    
    return ProctoringSession(
        id=row[0],
        session_id=row[1],
        user_id=row[2],
        task_id=row[3],
        question_id=row[4],
        started_at=datetime.fromisoformat(row[5]) if row[5] else None,
        ended_at=datetime.fromisoformat(row[6]) if row[6] else None,
        session_data=session_data,
        integrity_score=row[8],
    )


async def create_integrity_flag(
    user_id: int, flag_request: CreateIntegrityFlagRequest
) -> IntegrityFlag:
    """Create a new integrity flag."""
    evidence_data_json = json.dumps(flag_request.evidence_data) if flag_request.evidence_data else None
    
    flag_id = await execute_db_operation(
        f"""
        INSERT INTO {integrity_flags_table_name}
        (user_id, session_id, flag_type, severity, confidence_score, 
         evidence_data, ai_analysis, question_id, task_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            flag_request.session_id,
            flag_request.flag_type.value,
            flag_request.severity.value,
            flag_request.confidence_score,
            evidence_data_json,
            flag_request.ai_analysis,
            flag_request.question_id,
            flag_request.task_id,
            IntegrityFlagStatus.PENDING.value,
        ),
        fetch_one=True,
    )
    
    return await get_integrity_flag(flag_id)


async def get_integrity_flag(flag_id: int) -> Optional[IntegrityFlag]:
    """Get an integrity flag by ID."""
    row = await execute_db_operation(
        f"""
        SELECT id, user_id, session_id, flag_type, severity, confidence_score,
               evidence_data, ai_analysis, question_id, task_id, status, 
               created_at, reviewed_at
        FROM {integrity_flags_table_name}
        WHERE id = ?
        """,
        (flag_id,),
        fetch_one=True,
    )
    
    if not row:
        return None
    
    evidence_data = json.loads(row[6]) if row[6] else None
    
    return IntegrityFlag(
        id=row[0],
        user_id=row[1],
        session_id=row[2],
        flag_type=IntegrityFlagType(row[3]),
        severity=IntegritySeverity(row[4]),
        confidence_score=row[5],
        evidence_data=evidence_data,
        ai_analysis=row[7],
        question_id=row[8],
        task_id=row[9],
        status=IntegrityFlagStatus(row[10]),
        created_at=datetime.fromisoformat(row[11]),
        reviewed_at=datetime.fromisoformat(row[12]) if row[12] else None,
    )


async def get_integrity_flags_with_details(
    status: Optional[IntegrityFlagStatus] = None,
    severity: Optional[IntegritySeverity] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[IntegrityFlagWithDetails]:
    """Get integrity flags with user and task details."""
    query = f"""
        SELECT 
            f.id, f.user_id, f.session_id, f.flag_type, f.severity, f.confidence_score,
            f.evidence_data, f.ai_analysis, f.question_id, f.task_id, f.status, 
            f.created_at, f.reviewed_at,
            u.email, u.first_name, u.last_name,
            t.title as task_title,
            q.title as question_title,
            r.id as review_id, r.reviewer_user_id, r.decision, r.notes, 
            r.follow_up_action, r.follow_up_completed, r.reviewed_at as review_date
        FROM {integrity_flags_table_name} f
        JOIN {users_table_name} u ON f.user_id = u.id
        LEFT JOIN {tasks_table_name} t ON f.task_id = t.id
        LEFT JOIN {questions_table_name} q ON f.question_id = q.id
        LEFT JOIN {integrity_reviews_table_name} r ON f.id = r.flag_id
        WHERE 1=1
    """
    params = []
    
    if status:
        query += " AND f.status = ?"
        params.append(status.value)
    
    if severity:
        query += " AND f.severity = ?"
        params.append(severity.value)
    
    query += " ORDER BY f.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    rows = await execute_db_operation(query, tuple(params), fetch_all=True)
    
    flags = []
    for row in rows:
        evidence_data = json.loads(row[6]) if row[6] else None
        user_name = f"{row[14] or ''} {row[15] or ''}".strip() or None
        
        review = None
        if row[17]:  # review_id exists
            review = IntegrityReview(
                id=row[17],
                flag_id=row[0],
                reviewer_user_id=row[18],
                decision=ReviewDecision(row[19]),
                notes=row[20],
                follow_up_action=row[21],
                follow_up_completed=bool(row[22]),
                reviewed_at=datetime.fromisoformat(row[23]),
            )
        
        flags.append(
            IntegrityFlagWithDetails(
                id=row[0],
                user_id=row[1],
                session_id=row[2],
                flag_type=IntegrityFlagType(row[3]),
                severity=IntegritySeverity(row[4]),
                confidence_score=row[5],
                evidence_data=evidence_data,
                ai_analysis=row[7],
                question_id=row[8],
                task_id=row[9],
                status=IntegrityFlagStatus(row[10]),
                created_at=datetime.fromisoformat(row[11]),
                reviewed_at=datetime.fromisoformat(row[12]) if row[12] else None,
                user_email=row[13],
                user_name=user_name,
                task_title=row[16],
                question_title=row[17],
                review=review,
            )
        )
    
    return flags


async def create_integrity_review(
    flag_id: int, reviewer_user_id: int, review_request: CreateIntegrityReviewRequest
) -> IntegrityReview:
    """Create a review for an integrity flag."""
    await execute_db_operation(
        f"""
        INSERT INTO {integrity_reviews_table_name}
        (flag_id, reviewer_user_id, decision, notes, follow_up_action)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            flag_id,
            reviewer_user_id,
            review_request.decision.value,
            review_request.notes,
            review_request.follow_up_action,
        ),
    )
    
    # Get the review ID from the last inserted row
    review_id_result = await execute_db_operation(
        "SELECT last_insert_rowid()",
        fetch_one=True,
    )
    review_id = review_id_result[0] if review_id_result else None
    
    # Update the flag status to reviewed
    await execute_db_operation(
        f"""
        UPDATE {integrity_flags_table_name}
        SET status = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (IntegrityFlagStatus.REVIEWED.value, flag_id),
    )
    
    return await get_integrity_review(review_id)


async def get_integrity_review(review_id: int) -> Optional[IntegrityReview]:
    """Get an integrity review by ID."""
    row = await execute_db_operation(
        f"""
        SELECT id, flag_id, reviewer_user_id, decision, notes, 
               follow_up_action, follow_up_completed, reviewed_at
        FROM {integrity_reviews_table_name}
        WHERE id = ?
        """,
        (review_id,),
        fetch_one=True,
    )
    
    if not row:
        return None
    
    return IntegrityReview(
        id=row[0],
        flag_id=row[1],
        reviewer_user_id=row[2],
        decision=ReviewDecision(row[3]),
        notes=row[4],
        follow_up_action=row[5],
        follow_up_completed=bool(row[6]),
        reviewed_at=datetime.fromisoformat(row[7]),
    )


async def get_user_integrity_timeline(
    user_id: int, task_id: Optional[int] = None, limit: int = 50
) -> List[IntegrityTimelineEntry]:
    """Get a timeline of integrity events and flags for a user."""
    timeline = []
    
    # Get integrity events
    events_query = f"""
        SELECT created_at, event_type, event_data, confidence_score, 'event' as type
        FROM {integrity_events_table_name}
        WHERE user_id = ?
    """
    events_params = [user_id]
    
    if task_id:
        events_query += " AND task_id = ?"
        events_params.append(task_id)
    
    events_query += " ORDER BY created_at DESC LIMIT ?"
    events_params.append(limit)
    
    events = await execute_db_operation(events_query, tuple(events_params), fetch_all=True)
    
    for event in events:
        event_data = json.loads(event[2]) if event[2] else None
        timeline.append(
            IntegrityTimelineEntry(
                timestamp=datetime.fromisoformat(event[0]),
                event_type="integrity_event",
                description=f"Integrity event: {event[1]}",
                data={
                    "event_type": event[1],
                    "event_data": event_data,
                    "confidence_score": event[3],
                },
            )
        )
    
    # Get integrity flags
    flags_query = f"""
        SELECT created_at, flag_type, severity, confidence_score, ai_analysis, 'flag' as type
        FROM {integrity_flags_table_name}
        WHERE user_id = ?
    """
    flags_params = [user_id]
    
    if task_id:
        flags_query += " AND task_id = ?"
        flags_params.append(task_id)
    
    flags_query += " ORDER BY created_at DESC LIMIT ?"
    flags_params.append(limit)
    
    flags = await execute_db_operation(flags_query, tuple(flags_params), fetch_all=True)
    
    for flag in flags:
        timeline.append(
            IntegrityTimelineEntry(
                timestamp=datetime.fromisoformat(flag[0]),
                event_type="integrity_flag",
                description=f"Flag raised: {flag[1]}",
                data={
                    "flag_type": flag[1],
                    "confidence_score": flag[3],
                    "ai_analysis": flag[4],
                },
                severity=flag[2],
            )
        )
    
    # Sort timeline by timestamp descending
    timeline.sort(key=lambda x: x.timestamp, reverse=True)
    
    return timeline[:limit]


async def get_integrity_dashboard_stats() -> IntegrityDashboardStats:
    """Get dashboard statistics for integrity monitoring."""
    # Total flags
    total_flags_result = await execute_db_operation(
        f"SELECT COUNT(*) FROM {integrity_flags_table_name}",
        fetch_one=True,
    )
    total_flags = total_flags_result[0] if total_flags_result else 0
    
    # Pending flags
    pending_flags_result = await execute_db_operation(
        f"SELECT COUNT(*) FROM {integrity_flags_table_name} WHERE status = ?",
        (IntegrityFlagStatus.PENDING.value,),
        fetch_one=True,
    )
    pending_flags = pending_flags_result[0] if pending_flags_result else 0
    
    # High severity flags
    high_severity_flags_result = await execute_db_operation(
        f"""SELECT COUNT(*) FROM {integrity_flags_table_name} 
           WHERE severity IN (?, ?)""",
        (IntegritySeverity.HIGH.value, IntegritySeverity.CRITICAL.value),
        fetch_one=True,
    )
    high_severity_flags = high_severity_flags_result[0] if high_severity_flags_result else 0
    
    # Flags by type
    flags_by_type = await execute_db_operation(
        f"SELECT flag_type, COUNT(*) FROM {integrity_flags_table_name} GROUP BY flag_type",
        fetch_all=True,
    )
    flags_by_type_dict = {flag_type: count for flag_type, count in flags_by_type}
    
    # Recent flags
    recent_flags = await get_integrity_flags_with_details(limit=10)
    
    return IntegrityDashboardStats(
        total_flags=total_flags,
        pending_flags=pending_flags,
        high_severity_flags=high_severity_flags,
        flags_by_type=flags_by_type_dict,
        recent_flags=recent_flags,
    )


async def mark_follow_up_completed(review_id: int) -> bool:
    """Mark a review's follow-up action as completed."""
    await execute_db_operation(
        f"""
        UPDATE {integrity_reviews_table_name}
        SET follow_up_completed = TRUE
        WHERE id = ?
        """,
        (review_id,),
    )
    return True