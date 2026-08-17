"""
Call Session Service
Manages live voice sessions, records conversational turns, computes stage latencies,
broadcasts telemetry to real-time subscribers, and persists final call records to Cosmos DB.
"""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Optional, List, Dict, Any

from app.voice.session import CallSession, active_sessions, ConversationState, LatencyTelemetry
from app.voice.events import telemetry_broadcaster, VoiceEventMessage, VoiceEventType
from app.repositories.call_repository import CallRepository
from app.models.call import Call

logger = logging.getLogger("call_session_service")


class CallSessionService:
    def __init__(self, call_repo: Optional[CallRepository] = None):
        self.call_repo = call_repo or CallRepository()

    async def create_session(
        self,
        organization_id: str,
        agent_id: str,
        user_id: Optional[str] = None,
        phone_number: str = "",
        destination_number: str = "",
        direction: str = "outbound",
        agent_name: str = "Desire AI Receptionist",
        agent_role: str = "Professional AI Voice Assistant",
        voice: str = "aura-asteria-en",
        model: str = "gpt-4o-mini",
        twilio_call_sid: Optional[str] = None,
        twilio_stream_sid: Optional[str] = None,
        custom_prompt: Optional[str] = None
    ) -> CallSession:
        """Initializes a new live CallSession in memory and active registry."""
        session = CallSession(
            organization_id=organization_id,
            agent_id=agent_id,
            user_id=user_id,
            phone_number=phone_number,
            destination_number=destination_number,
            direction=direction,
            status="initiated",
            agent_name=agent_name,
            agent_role=agent_role,
            voice=voice,
            model=model,
            custom_prompt=custom_prompt,
            twilio_call_sid=twilio_call_sid,
            twilio_stream_sid=twilio_stream_sid,
            started_at=datetime.now(timezone.utc)
        )

        active_sessions.register(session)

        # Broadcast CallStarted event
        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=VoiceEventType.CALL_STARTED,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload={
                "direction": direction,
                "phone_number": phone_number,
                "destination_number": destination_number,
                "agent_name": agent_name,
                "model": model,
                "voice": voice
            }
        ))

        return session

    async def attach_stream(self, session: CallSession, stream_sid: str, call_sid: Optional[str] = None):
        """Attaches Twilio stream_sid and call_sid to the session."""
        session.twilio_stream_sid = stream_sid
        if call_sid:
            session.twilio_call_sid = call_sid
        session.status = "in-progress"
        session.connected_at = datetime.now(timezone.utc)
        active_sessions.update_stream_sid(session.call_session_id, stream_sid)

        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=VoiceEventType.STREAM_CONNECTED,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload={
                "stream_sid": stream_sid,
                "call_sid": session.twilio_call_sid
            }
        ))

    async def record_user_transcript(self, session: CallSession, text: str, stt_latency_ms: Optional[float] = None):
        """Appends user speech turn to session."""
        session.turn_count += 1
        session.current_state = ConversationState.DISCOVERING_INTENT
        msg = session.add_message(role="user", content=text, stt_latency_ms=stt_latency_ms)

        if stt_latency_ms is not None:
            session.latest_latency.stt_latency_ms = stt_latency_ms

        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=VoiceEventType.USER_TRANSCRIPT,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload={
                "role": "user",
                "content": text,
                "stt_latency_ms": stt_latency_ms,
                "turn_index": session.turn_count
            }
        ))

    async def record_agent_transcript(
        self,
        session: CallSession,
        text: str,
        llm_latency_ms: Optional[float] = None,
        tts_latency_ms: Optional[float] = None,
        turn_latency_ms: Optional[float] = None
    ):
        """Appends agent response turn to session."""
        msg = session.add_message(
            role="assistant",
            content=text,
            llm_latency_ms=llm_latency_ms,
            tts_latency_ms=tts_latency_ms,
            turn_latency_ms=turn_latency_ms
        )

        if llm_latency_ms is not None:
            session.latest_latency.llm_latency_ms = llm_latency_ms
        if tts_latency_ms is not None:
            session.latest_latency.tts_latency_ms = tts_latency_ms
        if turn_latency_ms is not None:
            session.latest_latency.total_turn_latency_ms = turn_latency_ms

        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=VoiceEventType.AGENT_TRANSCRIPT,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload={
                "role": "assistant",
                "content": text,
                "llm_latency_ms": llm_latency_ms,
                "tts_latency_ms": tts_latency_ms,
                "turn_latency_ms": turn_latency_ms,
                "turn_index": session.turn_count
            }
        ))

    async def record_barge_in(self, session: CallSession):
        """Records an interruption event."""
        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=VoiceEventType.BARGE_IN_TRIGGERED,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload={"turn_index": session.turn_count}
        ))

    async def finalize_session(self, session: CallSession, final_status: str = "completed"):
        """Calculates final metrics, stores transcript in Call model, and persists to Cosmos DB."""
        session.status = final_status
        session.ended_at = datetime.now(timezone.utc)
        session.calculate_duration()
        session.current_state = ConversationState.COMPLETED

        # Create combined transcript preview
        transcript_lines = [f"{m.role.upper()}: {m.content}" for m in session.messages]
        transcript_preview = "\n".join(transcript_lines) if transcript_lines else "No conversation recorded."

        # Persist to Call model in Cosmos DB
        call_doc = Call(
            id=session.call_session_id,
            organization_id=session.organization_id,
            user_id=session.user_id or "system",
            twilio_configuration_id=session.agent_id,
            call_sid=session.twilio_call_sid,
            from_number=session.phone_number or "Voice Gateway",
            to_number=session.destination_number or "Customer",
            duration=session.call_duration,
            prompt=transcript_preview,
            status=final_status,
            created_at=session.started_at,
            updated_at=session.ended_at
        )

        try:
            await self.call_repo.save(call_doc)
            logger.info(f"Persisted CallSession {session.call_session_id} to database.")
        except Exception as e:
            logger.error(f"Error saving CallSession to database: {e}")

        # Broadcast CallEnded event
        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=VoiceEventType.CALL_ENDED,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload={
                "call_duration": session.call_duration,
                "turn_count": session.turn_count,
                "status": final_status,
                "message_count": len(session.messages)
            }
        ))

        # Cleanup from active memory
        active_sessions.remove(session.call_session_id)
