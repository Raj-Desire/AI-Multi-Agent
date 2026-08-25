"""
Call Session Domain Model and In-Memory Active Session Tracker
Represents live voice sessions with strict multi-tenant isolation, conversation turns,
detailed stage latency measurements, and real-time state tracking.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import List, Dict, Any, Optional
import uuid
from pydantic import BaseModel, Field


class ConversationState(str, Enum):
    GREETING = "greeting"
    DISCOVERING_INTENT = "discovering_intent"
    COLLECTING_INFORMATION = "collecting_information"
    ANSWERING = "answering"
    CONFIRMING = "confirming"
    ESCALATING = "escalating"
    CLOSING = "closing"
    COMPLETED = "completed"


class ConversationMessage(BaseModel):
    id: str = Field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:8]}")
    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    turn_index: int = 0
    stt_latency_ms: Optional[float] = None
    llm_latency_ms: Optional[float] = None
    tts_latency_ms: Optional[float] = None
    turn_latency_ms: Optional[float] = None


class LatencyTelemetry(BaseModel):
    stt_latency_ms: float = 0.0
    llm_latency_ms: float = 0.0
    tts_latency_ms: float = 0.0
    first_audio_latency_ms: float = 0.0
    total_turn_latency_ms: float = 0.0
    call_connection_time_ms: float = 0.0
    deepgram_connection_time_ms: float = 0.0
    settings_application_time_ms: float = 0.0


class CallSession(BaseModel):
    """Complete CallSession model representing the live and persisted voice call."""
    call_session_id: str = Field(default_factory=lambda: f"cs_{uuid.uuid4().hex[:12]}")
    organization_id: str
    agent_id: str
    user_id: Optional[str] = None
    prospect_id: Optional[str] = None
    twilio_call_sid: Optional[str] = None
    twilio_stream_sid: Optional[str] = None
    phone_number: str = ""          # Twilio phone number
    destination_number: str = ""    # Customer number
    direction: str = "outbound"     # "inbound" | "outbound"
    status: str = "initiated"       # "initiated" | "ringing" | "in-progress" | "completed" | "failed"

    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    connected_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    call_duration: int = 0          # in seconds

    # AI Configuration snapshot
    agent_name: str = "AI Receptionist"
    agent_role: str = "Professional AI Voice Assistant"
    language: str = "en"
    voice: str = "aura-asteria-en"
    model: str = "gpt-4o-mini"
    custom_prompt: Optional[str] = None
    agent_config_snapshot: Optional[Dict[str, Any]] = None

    # Conversation Tracking
    messages: List[ConversationMessage] = Field(default_factory=list)
    current_state: ConversationState = ConversationState.GREETING
    turn_count: int = 0

    # Latency Telemetry (latest turn and aggregates)
    latest_latency: LatencyTelemetry = Field(default_factory=LatencyTelemetry)
    avg_turn_latency_ms: float = 0.0

    # Error Tracking
    last_error: Optional[str] = None
    error_type: Optional[str] = None
    provider_error: Optional[str] = None

    # Internal turn timers (not serialized)
    user_speech_start_ts: Optional[float] = None
    user_speech_end_ts: Optional[float] = None
    agent_thinking_start_ts: Optional[float] = None
    agent_speaking_start_ts: Optional[float] = None
    first_audio_byte_ts: Optional[float] = None

    def add_message(self, role: str, content: str, **latencies) -> ConversationMessage:
        msg = ConversationMessage(
            role=role,
            content=content,
            turn_index=self.turn_count,
            stt_latency_ms=latencies.get("stt_latency_ms"),
            llm_latency_ms=latencies.get("llm_latency_ms"),
            tts_latency_ms=latencies.get("tts_latency_ms"),
            turn_latency_ms=latencies.get("turn_latency_ms")
        )
        self.messages.append(msg)
        return msg

    def calculate_duration(self):
        if self.connected_at:
            end = self.ended_at or datetime.now(timezone.utc)
            self.call_duration = max(0, int((end - self.connected_at).total_seconds()))


class ActiveSessionRegistry:
    """Thread-safe registry for live active call sessions."""
    def __init__(self):
        self._sessions: Dict[str, CallSession] = {}
        self._by_call_sid: Dict[str, str] = {}
        self._by_stream_sid: Dict[str, str] = {}

    def register(self, session: CallSession):
        self._sessions[session.call_session_id] = session
        if session.twilio_call_sid:
            self._by_call_sid[session.twilio_call_sid] = session.call_session_id
        if session.twilio_stream_sid:
            self._by_stream_sid[session.twilio_stream_sid] = session.call_session_id

    def get(self, call_session_id: str) -> Optional[CallSession]:
        return self._sessions.get(call_session_id)

    def get_by_call_sid(self, call_sid: str) -> Optional[CallSession]:
        session_id = self._by_call_sid.get(call_sid)
        return self._sessions.get(session_id) if session_id else None

    def get_by_stream_sid(self, stream_sid: str) -> Optional[CallSession]:
        session_id = self._by_stream_sid.get(stream_sid)
        return self._sessions.get(session_id) if session_id else None

    def update_stream_sid(self, call_session_id: str, stream_sid: str):
        session = self._sessions.get(call_session_id)
        if session:
            session.twilio_stream_sid = stream_sid
            self._by_stream_sid[stream_sid] = call_session_id

    def remove(self, call_session_id: str) -> Optional[CallSession]:
        session = self._sessions.pop(call_session_id, None)
        if session:
            if session.twilio_call_sid:
                self._by_call_sid.pop(session.twilio_call_sid, None)
            if session.twilio_stream_sid:
                self._by_stream_sid.pop(session.twilio_stream_sid, None)
        return session


# Global active session registry
active_sessions = ActiveSessionRegistry()
