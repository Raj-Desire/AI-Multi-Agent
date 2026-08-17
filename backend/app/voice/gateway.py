"""
Voice Gateway
FastAPI WebSocket endpoint bridging Twilio Media Streams and Deepgram Voice Agent API.
Handles audio forwarding, barge-in clear events, telemetry, multi-tenant resolution, and graceful teardown.
"""

import asyncio
import json
import logging
import time
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.voice.audio import AudioAdapter
from app.voice.session import CallSession, active_sessions
from app.voice.events import telemetry_broadcaster, VoiceEventMessage, VoiceEventType
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.agents.runtime import AgentRuntimeBuilder
from app.services.agent_service import AgentService
from app.services.call_session_service import CallSessionService
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.agent_repository import AgentRepository
from app.repositories.call_repository import CallRepository
from app.core.dependencies import TenantContext

logger = logging.getLogger("voice_gateway")
logger.setLevel(logging.INFO)

router = APIRouter(tags=["Voice Gateway"])

agent_repo = AgentRepository()
agent_service = AgentService(agent_repo)
call_repo = CallRepository()
call_session_service = CallSessionService(call_repo)
twilio_repo = TwilioRepository()


@router.websocket("/voice/stream")
async def voice_stream_websocket(websocket: WebSocket):
    """
    Main WebSocket endpoint receiving Twilio Media Streams audio and piping to Deepgram Voice Agent API.
    """
    await websocket.accept()
    logger.info("[VoiceGateway] Twilio Media Stream WebSocket connected.")

    session: Optional[CallSession] = None
    deepgram_client: Optional[DeepgramVoiceAgentClient] = None
    stream_sid: Optional[str] = None
    call_sid: Optional[str] = None
    turn_start_time: float = time.perf_counter()

    async def handle_deepgram_audio(raw_audio: bytes):
        """Forward audio from Deepgram TTS to Twilio Media Stream."""
        nonlocal stream_sid
        if not stream_sid:
            return
        try:
            msg = AudioAdapter.create_twilio_media_message(stream_sid, raw_audio)
            await websocket.send_text(msg)
        except Exception as e:
            logger.error(f"[VoiceGateway] Error sending audio to Twilio: {e}")

    async def handle_user_speaking():
        """Barge-in / Interruption handler: instantly clear Twilio audio queue."""
        nonlocal stream_sid, session
        if stream_sid:
            try:
                clear_msg = AudioAdapter.create_twilio_clear_message(stream_sid)
                await websocket.send_text(clear_msg)
                logger.info(f"[VoiceGateway] Sent clear event to Twilio for Stream SID: {stream_sid}")
            except Exception as e:
                logger.error(f"[VoiceGateway] Error sending clear to Twilio: {e}")

        if session:
            await call_session_service.record_barge_in(session)

    async def handle_deepgram_event(event_type: str, data: dict):
        """Dispatch Deepgram events to frontend telemetry broadcaster."""
        nonlocal session
        if not session:
            return
        await telemetry_broadcaster.broadcast(VoiceEventMessage(
            event_type=event_type,
            call_session_id=session.call_session_id,
            organization_id=session.organization_id,
            agent_id=session.agent_id,
            twilio_call_sid=session.twilio_call_sid,
            payload=data
        ))

    async def handle_transcript(role: str, content: str):
        """Record transcript turns and latencies."""
        nonlocal session, turn_start_time
        if not session:
            return

        now = time.perf_counter()
        turn_latency = round((now - turn_start_time) * 1000.0, 2)

        if role == "user":
            turn_start_time = now
            await call_session_service.record_user_transcript(session, content, stt_latency_ms=turn_latency)
        else:
            await call_session_service.record_agent_transcript(
                session,
                content,
                turn_latency_ms=turn_latency
            )

    try:
        while True:
            raw_message = await websocket.receive_text()
            if not raw_message:
                continue

            try:
                data = json.loads(raw_message)
            except Exception:
                continue

            event = data.get("event")

            if event == "connected":
                logger.info("[VoiceGateway] Received 'connected' event from Twilio.")

            elif event == "start":
                start_data = data.get("start", {})
                stream_sid = data.get("streamSid") or start_data.get("streamSid")
                call_sid = start_data.get("callSid")
                custom_params = start_data.get("customParameters", {})

                logger.info(f"[VoiceGateway] Received 'start' event. streamSid={stream_sid}, callSid={call_sid}, params={custom_params}")

                # 1. Resolve Organization, Agent, and Existing CallSession
                req_session_id = custom_params.get("call_session_id")
                if req_session_id:
                    session = active_sessions.get(req_session_id)

                if not session and call_sid:
                    session = active_sessions.get_by_call_sid(call_sid)

                if session:
                    org_id = session.organization_id
                    agent_id = session.agent_id
                    user_id = session.user_id
                    direction = session.direction
                    from_num = session.phone_number
                    to_num = session.destination_number
                else:
                    org_id = custom_params.get("organization_id") or "default"
                    agent_id = custom_params.get("agent_id") or "agt_receptionist_default"
                    direction = custom_params.get("direction") or "outbound"
                    from_num = custom_params.get("from") or start_data.get("from", "")
                    to_num = custom_params.get("to") or start_data.get("to", "")
                    user_id = custom_params.get("user_id")

                ctx = TenantContext(
                    organization_id=org_id,
                    user_id=user_id or "system",
                    email="",
                    role="admin"
                )

                # Fetch or seed Agent Configuration
                agent_config = await agent_service.get_agent_by_id(ctx, agent_id)

                # Initialize or attach CallSession
                if not session:
                    session = await call_session_service.create_session(
                        organization_id=org_id,
                        agent_id=agent_config.agent_id,
                        user_id=user_id,
                        phone_number=from_num,
                        destination_number=to_num,
                        direction=direction,
                        agent_name=agent_config.name,
                        agent_role=agent_config.role,
                        voice=agent_config.voice.voice,
                        model=agent_config.llm.model,
                        twilio_call_sid=call_sid,
                        twilio_stream_sid=stream_sid
                    )

                await call_session_service.attach_stream(session, stream_sid, call_sid=call_sid)

                # 2. Build Deepgram Settings via AgentRuntimeBuilder
                deepgram_settings = AgentRuntimeBuilder.build_deepgram_settings(agent_config)

                # Override with custom prompt if specified for this test call session
                if session and session.custom_prompt:
                    logger.info(f"[VoiceGateway] Applying custom call prompt: {session.custom_prompt[:60]}...")
                    deepgram_settings.agent.think.prompt = session.custom_prompt

                # 3. Instantiate and connect Deepgram Client
                deepgram_client = DeepgramVoiceAgentClient(
                    on_audio=handle_deepgram_audio,
                    on_event=handle_deepgram_event,
                    on_transcript=handle_transcript,
                    on_user_speaking=handle_user_speaking
                )

                # Execute official handshake (Welcome -> Settings -> SettingsApplied -> Inject Greeting)
                try:
                    await deepgram_client.connect_and_configure(
                        settings=deepgram_settings,
                        greeting=agent_config.greeting
                    )
                    logger.info("[VoiceGateway] Deepgram Voice Agent successfully connected and ready.")
                except Exception as dg_err:
                    logger.error(f"[VoiceGateway] Deepgram connection failed: {dg_err}")
                    if session:
                        session.last_error = str(dg_err)
                        session.error_type = "deepgram_connection_error"

            elif event == "media":
                media_data = data.get("media", {})
                payload = media_data.get("payload")
                if payload and deepgram_client and deepgram_client.is_ready:
                    raw_audio = AudioAdapter.twilio_media_to_bytes(payload)
                    if raw_audio:
                        await deepgram_client.send_audio(raw_audio)

            elif event == "stop":
                logger.info(f"[VoiceGateway] Received 'stop' event from Twilio for stream {stream_sid}")
                break

    except WebSocketDisconnect:
        logger.info(f"[VoiceGateway] Twilio WebSocket disconnected for stream {stream_sid}")
    except Exception as e:
        logger.error(f"[VoiceGateway] Unexpected error in voice stream loop: {e}")
        if session:
            session.last_error = str(e)
            session.error_type = "stream_exception"
    finally:
        if deepgram_client:
            await deepgram_client.close()
        if session:
            await call_session_service.finalize_session(session, final_status="completed")
