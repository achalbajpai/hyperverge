import json
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter
from datetime import datetime

router = APIRouter()


# WebSocket connection manager to handle multiple client connections
class ConnectionManager:
    def __init__(self):
        # Dictionary to store WebSocket connections by course_id
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, course_id: int):
        await websocket.accept()
        if course_id not in self.active_connections:
            self.active_connections[course_id] = set()
        self.active_connections[course_id].add(websocket)

    def disconnect(self, websocket: WebSocket, course_id: int):
        if course_id in self.active_connections:
            self.active_connections[course_id].discard(websocket)
            if not self.active_connections[course_id]:
                del self.active_connections[course_id]

    async def send_item_update(self, course_id: int, item_data: Dict):
        if course_id in self.active_connections:
            disconnected_websockets = set()
            for websocket in self.active_connections[course_id]:
                try:
                    await websocket.send_json(item_data)
                except Exception as exception:
                    print(exception)

                    # Mark for removal if sending fails
                    disconnected_websockets.add(websocket)

            # Remove disconnected websockets
            for websocket in disconnected_websockets:
                self.disconnect(websocket, course_id)


# Create a connection manager instance
manager = ConnectionManager()


# WebSocket endpoint for course generation updates
@router.websocket("/course/{course_id}/generation")
async def websocket_course_generation(websocket: WebSocket, course_id: int):
    try:
        await manager.connect(websocket, course_id)

        # Keep the connection alive until client disconnects
        while True:
            # Wait for any message from the client to detect disconnection
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, course_id)


# Integrity monitoring connection manager
class IntegrityConnectionManager:
    def __init__(self):
        # Dictionary to store WebSocket connections by session_id for integrity monitoring
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Dictionary to store connections by organization for admin monitoring
        self.admin_connections: Dict[int, Set[WebSocket]] = {}

    async def connect_session(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)

    async def connect_admin(self, websocket: WebSocket, org_id: int):
        await websocket.accept()
        if org_id not in self.admin_connections:
            self.admin_connections[org_id] = set()
        self.admin_connections[org_id].add(websocket)

    def disconnect_session(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    def disconnect_admin(self, websocket: WebSocket, org_id: int):
        if org_id in self.admin_connections:
            self.admin_connections[org_id].discard(websocket)
            if not self.admin_connections[org_id]:
                del self.admin_connections[org_id]

    async def send_integrity_event(self, session_id: str, event_data: Dict):
        """Send integrity event to session participants."""
        if session_id in self.active_connections:
            disconnected_websockets = set()
            for websocket in self.active_connections[session_id]:
                try:
                    await websocket.send_json(
                        {"type": "integrity_event", "data": event_data}
                    )
                except Exception as exception:
                    print(f"Failed to send integrity event: {exception}")
                    disconnected_websockets.add(websocket)

            # Remove disconnected websockets
            for websocket in disconnected_websockets:
                self.disconnect_session(websocket, session_id)

    async def send_integrity_flag(self, org_id: int, flag_data: Dict):
        """Send integrity flag to admin connections."""
        if org_id in self.admin_connections:
            disconnected_websockets = set()
            for websocket in self.admin_connections[org_id]:
                try:
                    await websocket.send_json(
                        {"type": "integrity_flag", "data": flag_data}
                    )
                except Exception as exception:
                    print(f"Failed to send integrity flag: {exception}")
                    disconnected_websockets.add(websocket)

            # Remove disconnected websockets
            for websocket in disconnected_websockets:
                self.disconnect_admin(websocket, org_id)

    async def send_proctoring_update(self, session_id: str, update_data: Dict):
        """Send proctoring session update."""
        if session_id in self.active_connections:
            disconnected_websockets = set()
            for websocket in self.active_connections[session_id]:
                try:
                    await websocket.send_json(
                        {"type": "proctoring_update", "data": update_data}
                    )
                except Exception as exception:
                    print(f"Failed to send proctoring update: {exception}")
                    disconnected_websockets.add(websocket)

            # Remove disconnected websockets
            for websocket in disconnected_websockets:
                self.disconnect_session(websocket, session_id)


# Create integrity connection manager instance
integrity_manager = IntegrityConnectionManager()


# WebSocket endpoint for integrity monitoring
@router.websocket("/integrity/session/{session_id}")
async def websocket_integrity_session(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time integrity monitoring of a session."""
    try:
        await integrity_manager.connect_session(websocket, session_id)

        # Keep the connection alive until client disconnects
        while True:
            # Wait for any message from the client to detect disconnection
            message = await websocket.receive_text()
            # Echo back for heartbeat/ping purposes
            await websocket.send_json(
                {"type": "pong", "data": {"session_id": session_id}}
            )
    except WebSocketDisconnect:
        integrity_manager.disconnect_session(websocket, session_id)


# WebSocket endpoint for admin integrity monitoring
@router.websocket("/integrity/admin/{org_id}")
async def websocket_integrity_admin(websocket: WebSocket, org_id: int):
    """WebSocket endpoint for admin to monitor integrity flags across organization."""
    try:
        await integrity_manager.connect_admin(websocket, org_id)

        # Keep the connection alive until client disconnects
        while True:
            # Wait for any message from the client to detect disconnection
            message = await websocket.receive_text()
            # Echo back for heartbeat/ping purposes
            await websocket.send_json({"type": "pong", "data": {"org_id": org_id}})
    except WebSocketDisconnect:
        integrity_manager.disconnect_admin(websocket, org_id)


# WebSocket endpoint for proctoring session monitoring
@router.websocket("/integrity/proctoring/{session_id}")
async def websocket_proctoring_session(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time proctoring session monitoring."""
    try:
        await integrity_manager.connect_session(websocket, session_id)

        # Send initial session status
        await websocket.send_json(
            {
                "type": "session_started",
                "data": {
                    "session_id": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            }
        )

        # Keep the connection alive and handle real-time events
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            # Handle different types of proctoring events
            if message_type == "heartbeat":
                await websocket.send_json(
                    {
                        "type": "heartbeat_ack",
                        "data": {"timestamp": datetime.utcnow().isoformat()},
                    }
                )
            elif message_type == "typing_event":
                # Process typing event for integrity analysis
                typing_data = message.get("data", {})
                await websocket.send_json(
                    {
                        "type": "typing_received",
                        "data": {"event_id": typing_data.get("id")},
                    }
                )
            elif message_type == "paste_event":
                # Process paste event
                paste_data = message.get("data", {})
                await websocket.send_json(
                    {
                        "type": "paste_received",
                        "data": {"event_id": paste_data.get("id")},
                    }
                )
            elif message_type == "focus_event":
                # Process window focus/blur events
                focus_data = message.get("data", {})
                await websocket.send_json(
                    {
                        "type": "focus_received",
                        "data": {"event_id": focus_data.get("id")},
                    }
                )

    except WebSocketDisconnect:
        integrity_manager.disconnect_session(websocket, session_id)
    except Exception as e:
        print(f"Error in proctoring websocket: {e}")
        integrity_manager.disconnect_session(websocket, session_id)


# Function to get the connection manager instance
def get_manager() -> ConnectionManager:
    return manager


# Function to get the integrity connection manager instance
def get_integrity_manager() -> IntegrityConnectionManager:
    return integrity_manager


# Voice Processing Integration
try:
    from api.voice_integrity.websocket_handler import VoiceWebSocketManager

    # Create voice WebSocket manager instance
    voice_manager = VoiceWebSocketManager(integrity_manager)
    VOICE_PROCESSING_AVAILABLE = True
    print("✓ Voice processing WebSocket manager initialized")
except ImportError as e:
    print(f"Voice processing not available: {e}")
    try:
        # Try alternative import path
        from src.api.voice_integrity.websocket_handler import VoiceWebSocketManager

        voice_manager = VoiceWebSocketManager(integrity_manager)
        VOICE_PROCESSING_AVAILABLE = True
        print("✓ Voice processing WebSocket manager initialized (alternative path)")
    except ImportError as e2:
        print(f"Voice processing not available (alternative): {e2}")
        voice_manager = None
        VOICE_PROCESSING_AVAILABLE = False


# WebSocket endpoint for real-time voice processing
@router.websocket("/voice/session/{session_id}")
async def websocket_voice_session(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time voice processing and analysis."""
    try:
        await websocket.accept()

        if not VOICE_PROCESSING_AVAILABLE or not voice_manager:
            await websocket.send_json(
                {
                    "type": "voice_error",
                    "data": {"message": "Voice processing not available"},
                }
            )
            await websocket.close(code=1003, reason="Voice processing unavailable")
            return

        # Start voice processing session
        if not await voice_manager.start_voice_session(websocket, session_id):
            await websocket.close(code=1003, reason="Failed to start voice session")
            return

        # Handle voice processing messages
        while True:
            try:
                message = await websocket.receive()

                # Handle different message types
                if "bytes" in message:
                    # Audio data received
                    audio_data = message["bytes"]
                    result = await voice_manager.process_audio_chunk(
                        session_id, audio_data
                    )

                    if "error" in result:
                        await websocket.send_json(
                            {"type": "voice_error", "data": result}
                        )

                elif "text" in message:
                    # JSON message received
                    try:
                        data = json.loads(message["text"])
                        message_type = data.get("type")

                        if message_type == "heartbeat":
                            await websocket.send_json(
                                {
                                    "type": "heartbeat_ack",
                                    "data": {
                                        "timestamp": datetime.utcnow().isoformat()
                                    },
                                }
                            )

                        elif message_type == "audio_chunk":
                            # Base64 encoded audio in JSON
                            audio_data = data.get("data", {}).get("audio", "")
                            if audio_data:
                                result = await voice_manager.process_audio_chunk(
                                    session_id, audio_data
                                )
                                await websocket.send_json(
                                    {"type": "audio_processed", "data": result}
                                )

                        elif message_type == "stop_voice_session":
                            # Stop voice processing
                            summary = await voice_manager.stop_voice_session(session_id)
                            await websocket.send_json(
                                {"type": "voice_session_summary", "data": summary}
                            )
                            break

                        elif message_type == "get_session_status":
                            # Get current session status
                            status = voice_manager.get_active_sessions()
                            await websocket.send_json(
                                {"type": "session_status", "data": status}
                            )

                    except json.JSONDecodeError:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "data": {"message": "Invalid JSON message"},
                            }
                        )

            except Exception as e:
                print(f"Error processing voice message: {e}")
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Voice WebSocket error: {e}")
    finally:
        # Clean up session
        if session_id in voice_manager.active_sessions:
            await voice_manager.stop_voice_session(session_id)


# WebSocket endpoint for voice monitoring dashboard
@router.websocket("/voice/monitor/{org_id}")
async def websocket_voice_monitor(websocket: WebSocket, org_id: int):
    """WebSocket endpoint for admin voice monitoring dashboard."""
    try:
        if not VOICE_PROCESSING_AVAILABLE or not voice_manager:
            await integrity_manager.connect_admin(websocket, org_id)
            await websocket.send_json(
                {
                    "type": "voice_error",
                    "data": {"message": "Voice processing not available"},
                }
            )
            await websocket.close(code=1003, reason="Voice processing unavailable")
            return

        await integrity_manager.connect_admin(websocket, org_id)

        # Send initial status
        await websocket.send_json(
            {
                "type": "voice_monitor_connected",
                "data": {
                    "org_id": org_id,
                    "active_sessions": voice_manager.get_active_sessions(),
                    "timestamp": datetime.utcnow().isoformat(),
                },
            }
        )

        # Keep connection alive and send periodic updates
        while True:
            message = await websocket.receive_text()

            # Handle monitor requests
            try:
                data = json.loads(message)
                message_type = data.get("type")

                if message_type == "get_active_sessions":
                    await websocket.send_json(
                        {
                            "type": "active_sessions",
                            "data": voice_manager.get_active_sessions(),
                        }
                    )

                elif message_type == "heartbeat":
                    await websocket.send_json(
                        {
                            "type": "heartbeat_ack",
                            "data": {"timestamp": datetime.utcnow().isoformat()},
                        }
                    )

            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "data": {"message": "Invalid JSON"}}
                )

    except WebSocketDisconnect:
        integrity_manager.disconnect_admin(websocket, org_id)
    except Exception as e:
        print(f"Voice monitor WebSocket error: {e}")
        integrity_manager.disconnect_admin(websocket, org_id)


# Function to get the voice WebSocket manager instance
def get_voice_manager():
    """Get the voice WebSocket manager instance if available."""
    if VOICE_PROCESSING_AVAILABLE and voice_manager:
        return voice_manager
    return None
