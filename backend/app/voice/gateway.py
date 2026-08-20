"""
Voice Gateway
FastAPI WebSocket endpoint bridging Twilio Media Streams and Deepgram Voice Agent API.
Handles audio forwarding, barge-in clear events, telemetry, silence management,
maximum call duration enforcement with conclusion message, and graceful teardown.
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
from app.agents.configuration import AgentConfiguration, AgentRuntimeSettings
from app.agents.runtime import AgentRuntimeBuilder
from app.services.agent_service import AgentService
from app.services.call_session_service import CallSessionService
from app.services.twilio_service import TwilioService
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
twilio_service = TwilioService(twilio_repo)


@router.websocket("/voice/stream")
async def voice_stream_websocket(websocket: WebSocket):
    """
    Main WebSocket endpoint receiving Twilio Media Streams audio and piping to Deepgram Voice Agent API.
    """
    await websocket.accept()
    logger.info("[VoiceGateway] Twilio Media Stream WebSocket connected.")

    session: Optional[CallSession] = None
    agent_config: Optional[AgentConfiguration] = None
    deepgram_client: Optional[DeepgramVoiceAgentClient] = None
    stream_sid: Optional[str] = None
    call_sid: Optional[str] = None
    turn_start_time: float = time.perf_counter()

    # Call lifecycle state
    call_start_time: float = time.time()
    last_user_speech_time: float = time.time()
    last_agent_speech_done_time: float = time.time()
    is_agent_speaking: bool = False
    is_user_speaking: bool = False
    has_reprompted_silence: bool = False
    is_concluding_call: bool = False
    call_ended_event: asyncio.Event = asyncio.Event()
    lifecycle_task: Optional[asyncio.Task] = None

    async def handle_deepgram_audio(raw_audio: bytes):
        """Forward audio from Deepgram TTS to Twilio Media Stream with smooth telephony chunking."""
        nonlocal stream_sid, is_agent_speaking, last_agent_speech_done_time
        if not stream_sid:
            return
        try:
            # 8000 bytes of mu-law @ 8000Hz = 1.0 second of audio
            audio_duration = len(raw_audio) / 8000.0
            now = time.time()
            if last_agent_speech_done_time < now:
                last_agent_speech_done_time = now + audio_duration
            else:
                last_agent_speech_done_time += audio_duration
            is_agent_speaking = True

            chunk_size = 320  # 40ms audio chunks
            for i in range(0, len(raw_audio), chunk_size):
                chunk = raw_audio[i:i + chunk_size]
                twilio_msg = AudioAdapter.bytes_to_twilio_media(chunk, stream_sid)
                await websocket.send_text(json.dumps(twilio_msg))
                await asyncio.sleep(0.002)
        except Exception as e:
            logger.error(f"[VoiceGateway] Error streaming audio chunk to Twilio: {e}")

    async def handle_user_speaking():
        """Barge-in: Interrupt audio immediately when user starts speaking."""
        nonlocal stream_sid, session, is_user_speaking, is_agent_speaking, last_user_speech_time, has_reprompted_silence
        is_user_speaking = True
        is_agent_speaking = False
        last_user_speech_time = time.time()
        has_reprompted_silence = False  # Reset silence reprompt on user speech

        if stream_sid:
            clear_msg = AudioAdapter.create_twilio_clear_message(stream_sid)
            try:
                await websocket.send_text(json.dumps(clear_msg))
                logger.info(f"[VoiceGateway] Barge-in clear signal sent to Twilio for stream {stream_sid}")
            except Exception as e:
                logger.error(f"[VoiceGateway] Failed to send clear message: {e}")

        if session:
            await call_session_service.record_barge_in(session)

    async def handle_agent_speaking(data: dict):
        nonlocal is_agent_speaking, is_user_speaking
        is_agent_speaking = True
        is_user_speaking = False

    async def handle_agent_audio_done():
        nonlocal is_agent_speaking, is_concluding_call
        if is_concluding_call:
            logger.info("[VoiceGateway] Conclusion audio finished playing. Scheduling call termination.")
            asyncio.create_task(terminate_call())

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
        nonlocal session, turn_start_time, last_user_speech_time, is_user_speaking, is_agent_speaking, has_reprompted_silence
        if not session:
            return

        now = time.perf_counter()
        turn_latency = round((now - turn_start_time) * 1000.0, 2)

        if role == "user":
            turn_start_time = now
            last_user_speech_time = time.time()
            is_user_speaking = False
            has_reprompted_silence = False
            await call_session_service.record_user_transcript(session, content, stt_latency_ms=turn_latency)
        else:
            is_agent_speaking = True
            await call_session_service.record_agent_transcript(
                session,
                content,
                turn_latency_ms=turn_latency
            )

    async def terminate_call():
        """Gracefully terminates the Twilio call and closes connections."""
        nonlocal session, call_ended_event
        call_ended_event.set()
        await asyncio.sleep(1.2)  # Allow Twilio buffer delivery
        try:
            if session and session.twilio_call_sid and session.organization_id:
                logger.info(f"[VoiceGateway] Hanging up Twilio call {session.twilio_call_sid}...")
                await twilio_service.end_call(session.organization_id, session.twilio_call_sid)
        except Exception as e:
            logger.warning(f"[VoiceGateway] Could not hang up Twilio call: {e}")
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass

    async def call_lifecycle_monitor():
        """
        Monitors Silence Timeout (Reprompt -> Conclude & End)
        and Maximum Call Duration (Finish current turn -> Conclude & End).
        """
        nonlocal is_concluding_call, has_reprompted_silence, last_agent_speech_done_time, last_user_speech_time, is_agent_speaking
        try:
            while not call_ended_event.is_set():
                await asyncio.sleep(0.5)
                if not deepgram_client or not deepgram_client.is_ready or not agent_config:
                    continue

                runtime = agent_config.runtime or AgentRuntimeSettings()
                silence_timeout = max(3, runtime.silence_timeout)
                hangup_delay = max(2, runtime.silence_hangup_delay or 5)
                max_duration = max(10, runtime.maximum_call_duration or 1800)
                conclusion_msg = (runtime.conclusion_message or "Thank you for your time. Have a great day!").strip()
                reprompt_msg = (runtime.silence_reprompt_message or "Are you still there? I'm here if you have any questions.").strip()

                now = time.time()
                elapsed_call_time = now - call_start_time

                # Check if agent is currently speaking or audio is still playing in user's speaker
                if now < last_agent_speech_done_time:
                    is_agent_speaking = True
                    continue
                else:
                    is_agent_speaking = False

                # 1. Maximum Call Duration Check
                if elapsed_call_time >= max_duration and not is_concluding_call:
                    # If customer is speaking, allow current turn to finish
                    if is_user_speaking:
                        continue

                    logger.info(f"[VoiceGateway] Maximum call duration ({max_duration}s) reached. Speaking conclusion message.")
                    is_concluding_call = True
                    await deepgram_client.inject_agent_message(conclusion_msg)
                    asyncio.create_task(asyncio.sleep(4.5)).add_done_callback(lambda _: asyncio.create_task(terminate_call()))
                    break

                # 2. Silence Timeout Check (Starts ONLY after agent audio finishes playing)
                if not is_concluding_call and not is_user_speaking:
                    last_activity = max(last_user_speech_time, last_agent_speech_done_time)
                    silence_elapsed = now - last_activity

                    # Phase 1: Ask reprompt message if silent for silence_timeout
                    if silence_elapsed >= silence_timeout and not has_reprompted_silence:
                        logger.info(f"[VoiceGateway] Silence timeout ({silence_timeout}s) reached. Injecting reprompt: '{reprompt_msg}'")
                        has_reprompted_silence = True
                        last_agent_speech_done_time = now + 2.5
                        await deepgram_client.inject_agent_message(reprompt_msg)

                    # Phase 2: If still silent after reprompt + hangup_delay, speak conclusion and hang up
                    elif has_reprompted_silence and silence_elapsed >= (silence_timeout + hangup_delay):
                        logger.info(f"[VoiceGateway] Post-reprompt silence limit ({hangup_delay}s) reached. Speaking conclusion and concluding call.")
                        is_concluding_call = True
                        await deepgram_client.inject_agent_message(conclusion_msg)
                        asyncio.create_task(asyncio.sleep(4.5)).add_done_callback(lambda _: asyncio.create_task(terminate_call()))
                        break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[VoiceGateway] Exception in call_lifecycle_monitor: {e}")

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
                if session and session.agent_config_snapshot:
                    agent_config = AgentConfiguration.model_validate(session.agent_config_snapshot)
                    logger.info(f"[VoiceGateway] Using CallSession agent snapshot: Name='{agent_config.name}', Model='{agent_config.llm.model}', Voice='{agent_config.voice.voice}'")
                else:
                    agent_config = await agent_service.get_agent_by_id(ctx, agent_id)
                    logger.info(f"[VoiceGateway] Loaded Agent config: Name='{agent_config.name}', Model='{agent_config.llm.model}', Voice='{agent_config.voice.voice}'")

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
                        twilio_stream_sid=stream_sid,
                        agent_config_snapshot=agent_config.model_dump(mode="json")
                    )

                await call_session_service.attach_stream(session, stream_sid, call_sid=call_sid)

                # Reset timers
                call_start_time = time.time()
                last_user_speech_time = time.time()
                last_agent_speech_done_time = time.time()

                # 2. Build Deepgram Settings via AgentRuntimeBuilder (with Business Profile Knowledge Base)
                from app.repositories.business_profile_repository import BusinessProfileRepository
                business_profile = await BusinessProfileRepository.get_profile(org_id)
                deepgram_settings = AgentRuntimeBuilder.build_deepgram_settings(agent_config, business_profile=business_profile)

                # Override with custom prompt if specified for this test call session
                if session and session.custom_prompt:
                    logger.info(f"[VoiceGateway] Applying custom call prompt override: {session.custom_prompt[:60]}...")
                    deepgram_settings.agent.think.prompt = session.custom_prompt

                logger.info(
                    f"[VoiceGateway] Initializing Deepgram with Settings: "
                    f"STT Model='{deepgram_settings.agent.listen.provider.model}', "
                    f"LLM Provider='{deepgram_settings.agent.think.provider.type}', "
                    f"LLM Model='{deepgram_settings.agent.think.provider.model}', "
                    f"LLM Temp={deepgram_settings.agent.think.provider.temperature}, "
                    f"TTS Voice='{deepgram_settings.agent.speak.provider.model}'"
                )

                # 3. Instantiate and connect Deepgram Client
                deepgram_client = DeepgramVoiceAgentClient(
                    on_audio=handle_deepgram_audio,
                    on_event=handle_deepgram_event,
                    on_transcript=handle_transcript,
                    on_user_speaking=handle_user_speaking,
                    on_agent_speaking=handle_agent_speaking,
                    on_agent_audio_done=handle_agent_audio_done
                )

                # Execute official handshake (Welcome -> Settings -> SettingsApplied -> Inject Greeting)
                try:
                    await deepgram_client.connect_and_configure(
                        settings=deepgram_settings,
                        greeting=agent_config.greeting
                    )
                    logger.info("[VoiceGateway] Deepgram Voice Agent successfully connected and ready.")

                    # Start background call lifecycle monitor (silence & duration)
                    lifecycle_task = asyncio.create_task(call_lifecycle_monitor())
                except Exception as dg_err:
                    logger.error(f"[VoiceGateway] Deepgram connection failed: {dg_err}")
                    if session:
                        session.last_error = str(dg_err)
                        session.error_type = "deepgram_connection_error"
                    if deepgram_client:
                        await deepgram_client.close()
                        deepgram_client = None
                    break

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
        call_ended_event.set()
        if lifecycle_task:
            lifecycle_task.cancel()
            lifecycle_task = None

        if deepgram_client:
            try:
                await deepgram_client.close()
                logger.info(f"[VoiceGateway] Deepgram connection cleanly closed for stream {stream_sid}")
            except Exception as close_err:
                logger.error(f"[VoiceGateway] Error closing Deepgram client: {close_err}")
            finally:
                deepgram_client = None

        if session:
            final_status = "failed" if session.last_error and session.error_type == "deepgram_connection_error" else "completed"
            await call_session_service.finalize_session(session, final_status=final_status)
