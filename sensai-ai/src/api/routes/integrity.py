from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import asyncio
from api.db.integrity import (
    create_integrity_event,
    get_integrity_event,
    get_user_integrity_events,
    start_proctoring_session,
    end_proctoring_session,
    get_proctoring_session,
    create_integrity_flag,
    get_integrity_flag,
    get_integrity_flags_with_details,
    create_integrity_review,
    get_integrity_review,
    get_user_integrity_timeline,
    get_integrity_dashboard_stats,
    mark_follow_up_completed,
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
    IntegritySeverity,
    IntegrityFlagStatus,
    IntegrityFlagType,
)

router = APIRouter()


# Integrity Events Endpoints

@router.post("/events", response_model=IntegrityEvent)
async def create_event_endpoint(
    event: CreateIntegrityEventRequest,
    user_id: int = Query(..., description="User ID")
):
    """Create a new integrity event."""
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            return await create_integrity_event(user_id, event)
        except Exception as e:
            retry_count += 1
            if "database is locked" in str(e).lower() or "busy" in str(e).lower():
                if retry_count < max_retries:
                    await asyncio.sleep(0.1 * retry_count)  # Exponential backoff
                    continue
                else:
                    raise HTTPException(status_code=500, detail="Database busy, please try again")
            else:
                raise HTTPException(status_code=422 if "validation" in str(e).lower() else 500, detail=str(e))
    
    raise HTTPException(status_code=500, detail="Failed to create integrity event after multiple retries")


@router.get("/events/{event_id}", response_model=IntegrityEvent)
async def get_event(event_id: int):
    """Get an integrity event by ID."""
    event = await get_integrity_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Integrity event not found")
    return event


@router.get("/users/{user_id}/events", response_model=List[IntegrityEvent])
async def get_user_events(
    user_id: int,
    session_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500)
):
    """Get integrity events for a user."""
    return await get_user_integrity_events(user_id, session_id, limit)


# Proctoring Sessions Endpoints

@router.post("/sessions", response_model=ProctoringSession)
async def start_session(
    user_id: int,
    session_request: StartProctoringSessionRequest
):
    """Start a new proctoring session."""
    try:
        return await start_proctoring_session(user_id, session_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start proctoring session: {str(e)}")


@router.put("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    integrity_score: Optional[float] = Query(None, ge=0, le=1)
):
    """End a proctoring session."""
    success = await end_proctoring_session(session_id, integrity_score)
    if not success:
        raise HTTPException(status_code=404, detail="Proctoring session not found or already ended")
    return {"message": "Session ended successfully"}


@router.get("/sessions/{session_id}", response_model=ProctoringSession)
async def get_session(session_id: str):
    """Get a proctoring session by ID."""
    session = await get_proctoring_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Proctoring session not found")
    return session


# Integrity Flags Endpoints

@router.post("/flags", response_model=IntegrityFlag)
async def create_flag(
    user_id: int,
    flag_request: CreateIntegrityFlagRequest
):
    """Create a new integrity flag."""
    try:
        return await create_integrity_flag(user_id, flag_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create integrity flag: {str(e)}")


@router.get("/flags/{flag_id}", response_model=IntegrityFlag)
async def get_flag(flag_id: int):
    """Get an integrity flag by ID."""
    flag = await get_integrity_flag(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Integrity flag not found")
    return flag


@router.get("/flags", response_model=List[IntegrityFlagWithDetails])
async def get_flags(
    status: Optional[IntegrityFlagStatus] = Query(None),
    severity: Optional[IntegritySeverity] = Query(None),
    flag_type: Optional[IntegrityFlagType] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0)
):
    """Get integrity flags with filtering options."""
    return await get_integrity_flags_with_details(status, severity, flag_type, limit, offset)


# Integrity Reviews Endpoints

@router.post("/flags/{flag_id}/reviews", response_model=IntegrityReview)
async def create_review(
    flag_id: int,
    review_request: CreateIntegrityReviewRequest,
    reviewer_user_id: int = Query(...)
):
    """Create a review for an integrity flag."""
    # Verify the flag exists first
    flag = await get_integrity_flag(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Integrity flag not found")
    
    try:
        return await create_integrity_review(flag_id, reviewer_user_id, review_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create review: {str(e)}")


@router.get("/reviews/{review_id}", response_model=IntegrityReview)
async def get_review(review_id: int):
    """Get an integrity review by ID."""
    review = await get_integrity_review(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Integrity review not found")
    return review


@router.put("/reviews/{review_id}/complete-followup")
async def complete_followup(review_id: int):
    """Mark a review's follow-up action as completed."""
    success = await mark_follow_up_completed(review_id)
    if not success:
        raise HTTPException(status_code=404, detail="Review not found")
    return {"message": "Follow-up marked as completed"}


# Timeline and Dashboard Endpoints

@router.get("/users/{user_id}/timeline", response_model=List[IntegrityTimelineEntry])
async def get_user_timeline(
    user_id: int,
    task_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200)
):
    """Get integrity timeline for a user."""
    return await get_user_integrity_timeline(user_id, task_id, limit)


@router.get("/dashboard/stats", response_model=IntegrityDashboardStats)
async def get_dashboard_stats():
    """Get integrity dashboard statistics."""
    return await get_integrity_dashboard_stats()


# Batch Operations

@router.post("/events/batch")
async def create_events_batch(
    user_id: int,
    events: List[CreateIntegrityEventRequest]
):
    """Create multiple integrity events in batch."""
    created_events = []
    for event_request in events:
        try:
            event = await create_integrity_event(user_id, event_request)
            created_events.append(event)
        except Exception as e:
            # Continue with other events but log the error
            print(f"Failed to create event {event_request.event_type}: {e}")
            continue
    
    return {
        "created_count": len(created_events),
        "total_requested": len(events),
        "events": created_events
    }


@router.post("/flags/batch")
async def create_flags_batch(
    user_id: int,
    flags: List[CreateIntegrityFlagRequest]
):
    """Create multiple integrity flags in batch."""
    created_flags = []
    for flag_request in flags:
        try:
            flag = await create_integrity_flag(user_id, flag_request)
            created_flags.append(flag)
        except Exception as e:
            # Continue with other flags but log the error
            print(f"Failed to create flag {flag_request.flag_type}: {e}")
            continue
    
    return {
        "created_count": len(created_flags),
        "total_requested": len(flags),
        "flags": created_flags
    }


# Health Check

@router.get("/health")
async def health_check():
    """Health check endpoint for integrity system."""
    return {"status": "healthy", "system": "integrity"}