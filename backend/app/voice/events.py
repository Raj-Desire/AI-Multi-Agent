"""
Voice Events and Telemetry Broadcast System
Defines internal schemas for call events, transcripts, latency points, and real-time pub/sub broadcaster.
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Set
from pydantic import BaseModel, Field


class VoiceEventType:
    CALL_STARTED = "CallStarted"
    STREAM_CONNECTED = "StreamConnected"
    DEEPGRAM_CONNECTED = "DeepgramConnected"
    WELCOME = "Welcome"
    SETTINGS_APPLIED = "SettingsApplied"
    USER_STARTED_SPEAKING = "UserStartedSpeaking"
    USER_STOPPED_SPEAKING = "UserStoppedSpeaking"
    USER_TRANSCRIPT = "UserTranscript"
    AGENT_THINKING = "AgentThinking"
    AGENT_STARTED_SPEAKING = "AgentStartedSpeaking"
    AGENT_AUDIO_DONE = "AgentAudioDone"
    AGENT_TRANSCRIPT = "AgentTranscript"
    CONVERSATION_TEXT = "ConversationText"
    BARGE_IN_TRIGGERED = "BargeInTriggered"
    LATENCY_REPORT = "LatencyReport"
    WARNING = "Warning"
    ERROR = "Error"
    CALL_ENDED = "CallEnded"
    LEAD_INTELLIGENCE_UPDATED = "LeadIntelligenceUpdated"


class VoiceEventMessage(BaseModel):
    event_type: str
    call_session_id: str
    organization_id: str
    agent_id: Optional[str] = None
    twilio_call_sid: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: Dict[str, Any] = Field(default_factory=dict)


class TelemetryBroadcaster:
    """In-memory pub/sub broadcaster for real-time developer view and dashboard."""
    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, call_session_id: str) -> asyncio.Queue:
        async with self._lock:
            if call_session_id not in self._subscribers:
                self._subscribers[call_session_id] = set()
            q: asyncio.Queue = asyncio.Queue()
            self._subscribers[call_session_id].add(q)
            return q

    async def unsubscribe(self, call_session_id: str, q: asyncio.Queue):
        async with self._lock:
            if call_session_id in self._subscribers:
                self._subscribers[call_session_id].discard(q)
                if not self._subscribers[call_session_id]:
                    del self._subscribers[call_session_id]

    async def broadcast(self, event: VoiceEventMessage):
        async with self._lock:
            queues = list(self._subscribers.get(event.call_session_id, []))
            # Also route to organization subscribers
            if event.organization_id:
                queues.extend(list(self._subscribers.get(f"org_{event.organization_id}", [])))
                queues.extend(list(self._subscribers.get(event.organization_id, [])))
            # Also route to campaign subscribers if campaign_id is present
            campaign_id = event.payload.get("campaign_id") if event.payload else None
            if campaign_id:
                queues.extend(list(self._subscribers.get(f"campaign_{campaign_id}", [])))
            # Also broadcast to global "all" listeners if present
            all_queues = list(self._subscribers.get("global_debug", []))
            combined = set(queues + all_queues)

        for q in combined:
            try:
                q.put_nowait(event.model_dump(mode="json"))
            except Exception:
                pass


# Global singleton broadcaster
telemetry_broadcaster = TelemetryBroadcaster()
