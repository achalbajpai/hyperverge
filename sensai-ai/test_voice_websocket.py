#!/usr/bin/env python3
"""
Test WebSocket Server for Voice Integrity
This script tests the voice WebSocket functionality independently.
"""

import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Create test FastAPI app
app = FastAPI(title="Voice WebSocket Test")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Test voice monitoring WebSocket
@app.websocket("/voice/monitor/{org_id}")
async def websocket_voice_monitor(websocket: WebSocket, org_id: int):
    """Test WebSocket endpoint for voice monitoring."""
    await websocket.accept()
    print(f"✓ Voice monitor WebSocket connected for org_id: {org_id}")
    
    try:
        # Send initial connection message
        await websocket.send_json({
            "type": "voice_monitor_connected",
            "message": "Voice monitoring active",
            "data": {
                "active_sessions": {},
                "timestamp": "2025-08-07T16:45:00Z"
            }
        })
        
        # Send periodic updates
        counter = 0
        while True:
            await asyncio.sleep(5)  # Send update every 5 seconds
            counter += 1
            
            await websocket.send_json({
                "type": "voice_monitor_update",
                "data": {
                    "active_sessions": {
                        f"test_session_{counter}": {
                            "session_id": f"test_session_{counter}",
                            "start_time": "2025-08-07T16:45:00Z",
                            "audio_chunks_processed": counter * 10,
                            "alerts_generated": counter % 3,
                            "current_risk_score": min(0.1 * counter, 0.9),
                            "user_name": "Test User",
                            "user_email": "test@example.com"
                        }
                    },
                    "timestamp": "2025-08-07T16:45:00Z"
                }
            })
            
            print(f"✓ Sent voice monitor update #{counter}")
            
    except WebSocketDisconnect:
        print(f"✓ Voice monitor WebSocket disconnected for org_id: {org_id}")
    except Exception as e:
        print(f"❌ Voice monitor WebSocket error: {e}")

@app.websocket("/voice/session/{session_id}")
async def websocket_voice_session(websocket: WebSocket, session_id: str):
    """Test WebSocket endpoint for voice session processing."""
    await websocket.accept()
    print(f"✓ Voice session WebSocket connected: {session_id}")
    
    try:
        # Send initial session message
        await websocket.send_json({
            "type": "voice_session_started",
            "session_id": session_id,
            "message": "Voice processing session active"
        })
        
        # Listen for messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            print(f"✓ Received voice session message: {message.get('type', 'unknown')}")
            
            # Echo back a response
            await websocket.send_json({
                "type": "voice_analysis_result",
                "session_id": session_id,
                "data": {
                    "risk_score": 0.3,
                    "is_cheating": False,
                    "confidence": 0.7,
                    "contributing_factors": ["Normal speech patterns"]
                }
            })
            
    except WebSocketDisconnect:
        print(f"✓ Voice session WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"❌ Voice session WebSocket error: {e}")

@app.get("/")
async def root():
    return {
        "message": "Voice WebSocket Test Server", 
        "status": "running",
        "endpoints": [
            "/voice/monitor/{org_id}",
            "/voice/session/{session_id}"
        ]
    }

if __name__ == "__main__":
    print("🎤 Starting Voice WebSocket Test Server...")
    print("📡 WebSocket endpoints available:")
    print("   - ws://localhost:8000/voice/monitor/{org_id}")
    print("   - ws://localhost:8000/voice/session/{session_id}")
    print("🌐 Test endpoint: http://localhost:8000/")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)