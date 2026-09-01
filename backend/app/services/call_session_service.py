"""
Call Session Service
Manages live voice sessions, records conversational turns, computes stage latencies,
broadcasts telemetry to real-time subscribers, and persists final call records to Cosmos DB
with full immutable agent snapshots and transcripts.
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
        prospect_id: Optional[str] = None,
        campaign_id: Optional[str] = None,
        phone_number: str = "",
        destination_number: str = "",
        direction: str = "outbound",
        agent_name: str = "AI Receptionist",
        agent_role: str = "Professional AI Voice Assistant",
        voice: str = "aura-asteria-en",
        model: str = "gpt-4o-mini",
        twilio_call_sid: Optional[str] = None,
        twilio_stream_sid: Optional[str] = None,
        custom_prompt: Optional[str] = None,
        agent_config_snapshot: Optional[Dict[str, Any]] = None
    ) -> CallSession:
        """Initializes a new live CallSession in memory and active registry."""
        session = CallSession(
            organization_id=organization_id,
            agent_id=agent_id,
            user_id=user_id,
            prospect_id=prospect_id,
            campaign_id=campaign_id,
            phone_number=phone_number,
            destination_number=destination_number,
            direction=direction,
            status="initiated",
            agent_name=agent_name,
            agent_role=agent_role,
            voice=voice,
            model=model,
            custom_prompt=custom_prompt,
            agent_config_snapshot=agent_config_snapshot,
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
        """Calculates final metrics, stores transcript and immutable agent snapshot in Call model, and persists to Cosmos DB."""
        session.status = final_status
        session.ended_at = datetime.now(timezone.utc)
        session.calculate_duration()
        session.current_state = ConversationState.COMPLETED

        # Create combined transcript preview
        transcript_lines = [f"{m.role.upper()}: {m.content}" for m in session.messages]
        transcript_preview = "\n".join(transcript_lines) if transcript_lines else "No conversation recorded."

        agent_version = 1
        agent_scope = "ORGANIZATION"
        if session.agent_config_snapshot:
            agent_version = session.agent_config_snapshot.get("version", 1)
            agent_scope = session.agent_config_snapshot.get("scope", "ORGANIZATION")

        transcript_records = [
            m.model_dump(mode="json") if hasattr(m, "model_dump") else m
            for m in session.messages
        ]
        latency_dict = session.latest_latency.model_dump(mode="json") if hasattr(session.latest_latency, "model_dump") else None

        # Execute Post-Call Transcript Intelligence
        analytics_data = {}
        try:
            from app.services.call_analytics_service import CallAnalyticsService
            analytics_svc = CallAnalyticsService()
            analytics_data = await analytics_svc.analyze_call_transcript(transcript_records)
            logger.info(
                f"[CallSessionService:Analytics] Processed transcript for {session.call_session_id}: "
                f"Score={analytics_data.get('lead_score')}, Interest='{analytics_data.get('interest_level')}', "
                f"Classification='{analytics_data.get('classification')}'"
            )
        except Exception as analytics_err:
            logger.error(f"[CallSessionService] Post-call analytics error: {analytics_err}")

        # Persist to Call model in Cosmos DB
        call_doc = Call(
            id=session.call_session_id,
            organization_id=session.organization_id,
            user_id=session.user_id or "system",
            prospect_id=session.prospect_id,
            campaign_id=session.campaign_id,
            twilio_configuration_id=session.agent_id,
            call_sid=session.twilio_call_sid,
            from_number=session.phone_number or "Voice Gateway",
            to_number=session.destination_number or "Customer",
            duration=session.call_duration,
            prompt=transcript_preview,
            status=final_status,
            agent_id=session.agent_id,
            agent_version=agent_version,
            agent_name=session.agent_name,
            agent_scope=agent_scope,
            agent_config_snapshot=session.agent_config_snapshot,
            transcript=transcript_records,
            outcome=session.outcome or analytics_data.get("interest_level"),
            summary=analytics_data.get("summary"),
            key_insights=analytics_data.get("key_insights"),
            intent=analytics_data.get("intent"),
            sentiment=analytics_data.get("sentiment"),
            lead_score=analytics_data.get("lead_score"),
            interest_level=analytics_data.get("interest_level"),
            classification=analytics_data.get("classification"),
            callback_datetime=analytics_data.get("callback_datetime"),
            analytics=analytics_data if analytics_data else None,
            latency_metrics=latency_dict,
            created_at=session.started_at,
            updated_at=session.ended_at
        )

        try:
            await self.call_repo.save(call_doc)
            logger.info(f"Persisted CallSession {session.call_session_id} to database with Agent {session.agent_name} (v{agent_version}).")
        except Exception as e:
            logger.error(f"Error saving CallSession to database: {e}")

        # Update Prospect Activity & Metrics
        try:
            from app.services.prospect_service import ProspectService
            from app.repositories.prospect_repository import ProspectRepository
            prospect_svc = ProspectService(ProspectRepository(), self.call_repo)
            await prospect_svc.record_call_outcome(
                organization_id=session.organization_id,
                phone_number=session.destination_number,
                call_id=session.call_session_id,
                duration=session.call_duration,
                outcome=session.outcome or analytics_data.get("interest_level"),
                is_success=(final_status == "completed" or session.call_duration > 0)
            )
        except Exception as p_err:
            logger.warning(f"[CallSessionService] Could not sync prospect call outcome: {p_err}")

        # Update Campaign Member Activity if this call originated from an automated campaign
        if session.campaign_id and session.prospect_id:
            try:
                from app.services.campaign_service import CampaignService
                from app.repositories.campaign_repository import CampaignMemberRepository
                mem_repo = CampaignMemberRepository()
                target_mem = await mem_repo.get_by_campaign_and_prospect(session.campaign_id, session.prospect_id)
                if target_mem:
                    cmp_svc = CampaignService()
                    await cmp_svc.record_call_outcome(
                        campaign_id=session.campaign_id,
                        member_id=target_mem.id,
                        call_id=session.call_session_id,
                        duration=session.call_duration,
                        outcome=session.outcome or analytics_data.get("interest_level"),
                        is_success=(final_status == "completed" or session.call_duration > 0)
                    )
            except Exception as cmp_err:
                logger.warning(f"[CallSessionService] Could not sync campaign member outcome: {cmp_err}")

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
                "message_count": len(session.messages),
                "agent_name": session.agent_name,
                "agent_version": agent_version
            }
        ))

        # Cleanup from active memory
        active_sessions.remove(session.call_session_id)
