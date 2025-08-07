from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime
from api.utils.db import execute_db_operation
from api.config import integrity_flags_table_name, follow_up_actions_table_name
from pydantic import BaseModel

router = APIRouter()

# Health check - must be first to avoid conflicts with parameterized routes
@router.get("/follow-up-actions/health")
async def health_check():
    """Health check endpoint for follow-up actions system."""
    return {"status": "healthy", "system": "follow-up-actions"}

class FollowUpActionRequest(BaseModel):
    action_type: str  # 'suggest_resources' or 'schedule_viva'
    flag_id: int
    user_id: int
    timestamp: str
    status: str = 'pending'

class FollowUpActionResponse(BaseModel):
    id: int
    action_type: str
    flag_id: int
    user_id: int
    status: str
    created_at: str
    completed_at: Optional[str] = None

@router.post("/follow-up-actions", response_model=FollowUpActionResponse)
async def create_follow_up_action(action_request: FollowUpActionRequest):
    """Create a follow-up action for an integrity flag."""
    try:
        # Insert follow-up action into database
        action_id = await execute_db_operation(
            f"""
            INSERT INTO {follow_up_actions_table_name} 
            (action_type, flag_id, user_id, status, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                action_request.action_type,
                action_request.flag_id,
                action_request.user_id,
                action_request.status,
                action_request.timestamp
            ),
            get_last_row_id=True,
        )

        # Update flag with follow-up action reference
        await execute_db_operation(
            f"""
            UPDATE {integrity_flags_table_name}
            SET follow_up_action_id = ?
            WHERE id = ?
            """,
            (action_id, action_request.flag_id),
        )

        # Return the created action
        return FollowUpActionResponse(
            id=action_id,
            action_type=action_request.action_type,
            flag_id=action_request.flag_id,
            user_id=action_request.user_id,
            status=action_request.status,
            created_at=action_request.timestamp
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create follow-up action: {str(e)}")

@router.get("/follow-up-actions/{action_id}", response_model=FollowUpActionResponse)
async def get_follow_up_action(action_id: int):
    """Get a follow-up action by ID."""
    try:
        row = await execute_db_operation(
            f"""
            SELECT id, action_type, flag_id, user_id, status, created_at, completed_at
            FROM {follow_up_actions_table_name}
            WHERE id = ?
            """,
            (action_id,),
            fetch_one=True,
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="Follow-up action not found")
        
        return FollowUpActionResponse(
            id=row[0],
            action_type=row[1],
            flag_id=row[2],
            user_id=row[3],
            status=row[4],
            created_at=row[5],
            completed_at=row[6]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get follow-up action: {str(e)}")

@router.put("/follow-up-actions/{action_id}/complete")
async def complete_follow_up_action(action_id: int):
    """Mark a follow-up action as completed."""
    try:
        await execute_db_operation(
            f"""
            UPDATE {follow_up_actions_table_name}
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (action_id,),
        )

        return {"message": "Follow-up action marked as completed"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to complete follow-up action: {str(e)}")

@router.get("/follow-up-actions", response_model=List[FollowUpActionResponse])
async def get_follow_up_actions(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Get all follow-up actions with optional filtering."""
    try:
        query = f"""
            SELECT id, action_type, flag_id, user_id, status, created_at, completed_at
            FROM {follow_up_actions_table_name}
            WHERE 1=1
        """
        params = []
        
        if status:
            query += " AND status = ?"
            params.append(status)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        rows = await execute_db_operation(query, tuple(params), fetch_all=True)
        
        return [
            FollowUpActionResponse(
                id=row[0],
                action_type=row[1],
                flag_id=row[2],
                user_id=row[3],
                status=row[4],
                created_at=row[5],
                completed_at=row[6]
            )
            for row in rows
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get follow-up actions: {str(e)}")

