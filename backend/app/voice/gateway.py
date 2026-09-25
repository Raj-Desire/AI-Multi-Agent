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
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.voice.audio import AudioAdapter
from app.voice.pronunciation_normalizer import PronunciationNormalizer
from app.voice.session import CallSession, active_sessions
from app.voice.events import telemetry_broadcaster, VoiceEventMessage, VoiceEventType
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.agents.configuration import AgentConfiguration, AgentRuntimeSettings
from app.agents.runtime import AgentRuntimeBuilder
from app.agents.orchestrator import AgentOrchestrator, HandoffContext
from app.agents.handoff_controller import HandoffController
from app.api.v1.think_proxy import attach_think_proxy, think_proxy_requested, unregister_call_state
from app.repositories.platform_rules_repository import PlatformRulesRepository
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
    proxy_token: Optional[str] = None
    use_think_proxy: bool = False
    turn_start_time: float = time.perf_counter()

    # Call lifecycle state
    call_start_time: float = time.time()
    last_user_speech_time: float = time.time()
    user_speech_start_time: float = time.time()
    last_backchannel_time: float = time.time()
    last_agent_speech_done_time: float = time.time()
    user_spoke: bool = False
    is_agent_speaking: bool = False
    is_user_speaking: bool = False
    has_reprompted_silence: bool = False
    is_concluding_call: bool = False
    is_interrupted: bool = False
    call_ended_event: asyncio.Event = asyncio.Event()
    lifecycle_task: Optional[asyncio.Task] = None
    thinking_filler_task: Optional[asyncio.Task] = None
    barge_in_debounce_task: Optional[asyncio.Task] = None

    # Multi-Agent Orchestrator runtime state
    orchestrator: Optional[AgentOrchestrator] = None
    handoff_controller: Optional[HandoffController] = None
    live_transcript_turns: list = []  # [{"role": str, "content": str}]
    turn_counter: int = 0

    # Cached call-local configurations (loaded once per call at setup)
    cached_rules_map: dict = {}
    cached_inbound_forward_number: Optional[str] = None

    # Outbound audio metrics
    outbound_chunk_counter: int = 0
    total_outbound_audio_bytes: int = 0
    total_outbound_audio_duration_s: float = 0.0

    async def handle_deepgram_audio(raw_audio: bytes):
        """
        Forward audio from Deepgram TTS to Twilio Media Stream in standard 160-byte (20ms) frames.
        Preserves audio order, avoids buffer flooding or artificial sleep starvation,
        and logs precise duration & byte metrics.
        """
        nonlocal is_agent_speaking, last_agent_speech_done_time, is_interrupted
        nonlocal outbound_chunk_counter, total_outbound_audio_bytes, total_outbound_audio_duration_s
        if not stream_sid or not raw_audio:
            return
        
        # If new audio from a subsequent agent turn arrives, clear the previous interrupted state
        is_interrupted = False
        try:
            # 8000 bytes of mu-law @ 8000Hz = 1.0 second of audio (1 byte = 0.125ms)
            audio_duration = len(raw_audio) / 8000.0
            now = time.time()

            # Natural human conversational turn delay: If transitioning from silence/user turn,
            # introduce calibrated conversational pause (turn_delay_ms) before outbound audio burst
            if not is_agent_speaking and user_spoke and outbound_chunk_counter > 0:
                runtime = agent_config.runtime if agent_config else None
                delay_ms = getattr(runtime, "turn_delay_ms", 250) if runtime else 250
                if delay_ms > 0:
                    delay_s = min(delay_ms / 1000.0, 0.45)
                    await asyncio.sleep(delay_s)
                    if is_interrupted or not websocket:
                        return

            if last_agent_speech_done_time < now:
                last_agent_speech_done_time = now + audio_duration
            else:
                last_agent_speech_done_time += audio_duration
            is_agent_speaking = True

            total_outbound_audio_bytes += len(raw_audio)
            total_outbound_audio_duration_s += audio_duration

            # Split into 160-byte frames (20ms @ 8kHz mu-law) matching Twilio Media Streams specification
            chunks = AudioAdapter.chunk_mulaw_audio(raw_audio, chunk_size=160)
            for chunk in chunks:
                if is_interrupted:
                    break
                outbound_chunk_counter += 1
                chunk_duration_ms = (len(chunk) / 8000.0) * 1000.0
                twilio_msg = AudioAdapter.bytes_to_twilio_media(chunk, stream_sid)
                await websocket.send_text(json.dumps(twilio_msg))

                logger.debug(
                    f"[VoiceGateway:OutboundAudio] Chunk #{outbound_chunk_counter} | "
                    f"Bytes: {len(chunk)} | Duration: {chunk_duration_ms:.1f}ms | "
                    f"SendTime: {time.time():.4f} | "
                    f"CumulativeAudio: {total_outbound_audio_duration_s:.2f}s ({total_outbound_audio_bytes} B)"
                )
        except Exception as e:
            logger.error(f"[VoiceGateway] Error streaming audio chunk to Twilio: {e}")

    async def handle_user_speaking():
        """Barge-in: Interrupt audio immediately when user starts speaking."""
        nonlocal stream_sid, session, is_user_speaking, is_agent_speaking, last_user_speech_time, user_speech_start_time, has_reprompted_silence, user_spoke, thinking_filler_task, is_interrupted, last_agent_speech_done_time
        user_speech_start_time = time.time()
        is_user_speaking = True
        user_spoke = True
        last_user_speech_time = time.time()
        has_reprompted_silence = False  # Reset silence reprompt on user speech
        is_interrupted = True
        is_agent_speaking = False
        last_agent_speech_done_time = time.time()

        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

        # Instantly send clear message to Twilio to flush the audio buffer on the caller's handset
        if stream_sid:
            clear_msg = AudioAdapter.create_twilio_clear_message(stream_sid)
            try:
                await websocket.send_text(clear_msg)
                logger.info(f"[VoiceGateway] Instant barge-in clear signal sent to Twilio for stream {stream_sid}")
            except Exception as e:
                logger.error(f"[VoiceGateway] Failed to send clear message: {e}")

        if session:
            await call_session_service.record_barge_in(session)

    async def handle_agent_speaking(data: dict):
        nonlocal is_agent_speaking, is_user_speaking, thinking_filler_task, is_interrupted
        is_agent_speaking = True
        is_user_speaking = False
        is_interrupted = False
        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

    async def handle_agent_thinking(data: dict):
        nonlocal thinking_filler_task, deepgram_client
        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

        runtime = agent_config.runtime if agent_config else None
        if runtime and getattr(runtime, "conversational_fillers_enabled", True):
            async def _delayed_filler():
                try:
                    filler_delay = getattr(runtime, "filler_delay_seconds", 0.95) or 0.95
                    await asyncio.sleep(filler_delay)
                    if is_user_speaking or is_agent_speaking or is_concluding_call or is_interrupted:
                        return
                    phrases = getattr(runtime, "filler_phrases", None) or [
                        "Let me check that for you...",
                        "Got it, one moment please...",
                        "Understood, looking into that right now...",
                        "Sure thing, let me pull that up...",
                        "Alright, let me see..."
                    ]
                    import random
                    filler = random.choice(phrases)
                    norm_filler = PronunciationNormalizer.normalize(filler, getattr(agent_config, "pronunciation_rules", None))
                    if not is_agent_speaking and not is_user_speaking and deepgram_client and deepgram_client.is_ready:
                        logger.info(f"[VoiceGateway] Agent thinking threshold ({filler_delay}s) reached. Injecting filler: '{norm_filler}'")
                        await deepgram_client.inject_agent_message(norm_filler, behavior="queue")
                except asyncio.CancelledError:
                    pass
                except Exception as ex:
                    logger.debug(f"[VoiceGateway] Filler injection notice: {ex}")
            thinking_filler_task = asyncio.create_task(_delayed_filler())

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
        """Record transcript turns, check for IVR/Machine patterns, and record latencies."""
        nonlocal session, turn_start_time, last_user_speech_time, is_user_speaking, is_agent_speaking, has_reprompted_silence, is_concluding_call, user_spoke
        nonlocal orchestrator, live_transcript_turns, handoff_controller, turn_counter, cached_rules_map, cached_inbound_forward_number
        if not session:
            return

        now = time.perf_counter()
        turn_latency = round((now - turn_start_time) * 1000.0, 2)

        if role == "user":
            turn_start_time = now
            last_user_speech_time = time.time()
            is_user_speaking = False
            user_spoke = True
            has_reprompted_silence = False
            live_transcript_turns.append({"role": "user", "content": content})
            turn_counter += 1
            await call_session_service.record_user_transcript(session, content, stt_latency_ms=turn_latency)

            # ── Multi-Agent Orchestrator: Submit for Handoff Evaluation ──────
            if handoff_controller and not is_concluding_call:
                handoff_controller.submit(content, turn_number=turn_counter)
            # ─────────────────────────────────────────────────────────────────

            # Smart IVR & Answering Machine Detection (AMD) using pre-cached rules
            if not is_concluding_call:
                try:
                    from app.voice.ivr_detector import SmartIVRDetector
                    ivr_res = SmartIVRDetector.analyze_transcript(content, enabled_rules=cached_rules_map)
                    if ivr_res.is_ivr:
                        logger.warning(
                            f"[VoiceGateway:IVR_DETECTED] Machine detected! "
                            f"Type='{ivr_res.symptom_type}', Phrase='{ivr_res.matched_phrase}', "
                            f"Action='{ivr_res.recommended_action}'"
                        )
                        session.outcome = f"IVR_DETECTED ({ivr_res.symptom_type})"
                        is_concluding_call = True

                        if ivr_res.recommended_action == "disconnect_immediate":
                            asyncio.create_task(terminate_call())
                        else:
                            conclusion_text = "Thank you, we will follow up at a convenient time. Goodbye."
                            if agent_config and agent_config.runtime and agent_config.runtime.conclusion_message:
                                conclusion_text = agent_config.runtime.conclusion_message
                            await deepgram_client.inject_agent_message(conclusion_text)
                            asyncio.create_task(asyncio.sleep(1.5)).add_done_callback(lambda _: asyncio.create_task(terminate_call()))
                except Exception as ivr_err:
                    logger.error(f"[VoiceGateway] IVR detection error: {ivr_err}")
        else:
            is_agent_speaking = True
            live_transcript_turns.append({"role": "assistant", "content": content})
            await call_session_service.record_agent_transcript(
                session,
                content,
                turn_latency_ms=turn_latency
            )

            # ── Steady-State Prompt Swap Following Assistant Response ────────
            if handoff_controller:
                asyncio.create_task(handoff_controller.on_assistant_turn(content))
            # ─────────────────────────────────────────────────────────────────

            # Check for live human transfer cues in Assistant speech
            lower_content = content.lower()
            transfer_target = getattr(agent_config.guardrails, "human_transfer_phone_number", None) if (agent_config and agent_config.guardrails and getattr(agent_config.guardrails, "human_transfer_enabled", True)) else None
            
            # Fallback to pre-cached Twilio config default forward number if no agent-specific transfer number configured
            if not transfer_target and cached_inbound_forward_number:
                transfer_target = cached_inbound_forward_number

            is_transfer_announcement = any(k in lower_content for k in [
                "transferring you to", "transfer you to", "connect you with a human",
                "connect you to a human", "transferring to our team", "transferring your call",
                "handing you over to", "connecting you to our specialist", "hold while i transfer"
            ])

            if is_transfer_announcement and transfer_target and not is_concluding_call:
                logger.info(f"[VoiceGateway] Assistant transfer announcement detected: '{content[:60]}...'. Initiating live call transfer to {transfer_target}.")
                asyncio.create_task(transfer_call_to_human(destination_phone=transfer_target))
                return

            from app.api.v1.voice import detect_conversation_conclusion
            if detect_conversation_conclusion(content):
                lower_content = content.lower()
                is_voicemail_or_machine = (
                    "voicemail detected" in lower_content or
                    "automated system detected" in lower_content or
                    "leaving a message" in lower_content
                )
                hangup_delay = 1.5 if is_voicemail_or_machine else 3.5
                logger.info(f"[VoiceGateway] Assistant conclusion phrase detected: '{content[:50]}...'. Scheduling hangup in {hangup_delay}s.")
                is_concluding_call = True
                has_reprompted_silence = True
                asyncio.create_task(asyncio.sleep(hangup_delay)).add_done_callback(lambda _: asyncio.create_task(terminate_call()))

    async def transfer_call_to_human(destination_phone: str, whisper_msg: Optional[str] = None):
        """Transfers the live Twilio call to a human phone number and concludes AI stream."""
        nonlocal session, call_ended_event, is_concluding_call
        if is_concluding_call:
            return
        is_concluding_call = True
        call_ended_event.set()
        logger.info(f"[VoiceGateway] Executing live human call transfer to {destination_phone} for call {session.twilio_call_sid if session else 'unknown'}...")
        
        # Inject spoken transition announcement before transfer
        transition_text = whisper_msg or (agent_config.guardrails.human_transfer_whisper_message if agent_config and agent_config.guardrails else None) or "Please hold while we transfer you to a human specialist."
        norm_transfer_text = PronunciationNormalizer.normalize(transition_text, getattr(agent_config, "pronunciation_rules", None))
        try:
            if deepgram_client and deepgram_client.is_ready:
                await deepgram_client.inject_agent_message(norm_transfer_text, behavior="interrupt")
        except Exception:
            pass

        await asyncio.sleep(2.0)  # Allow speech playback to complete
        
        try:
            if session and session.twilio_call_sid and session.organization_id:
                success = await twilio_service.transfer_call(
                    org_id=session.organization_id,
                    call_sid=session.twilio_call_sid,
                    destination_phone=destination_phone,
                    caller_id=session.phone_number,
                    whisper_message=None  # Already announced by AI
                )
                if success:
                    session.outcome = "TRANSFERRED_TO_HUMAN"
                    session.business_outcome = "Transferred to Human Specialist"
                    logger.info(f"[VoiceGateway] Live call transfer to {destination_phone} succeeded.")
                else:
                    logger.error(f"[VoiceGateway] Live call transfer to {destination_phone} failed.")
        except Exception as transfer_err:
            logger.error(f"[VoiceGateway] Error during call transfer: {transfer_err}")

        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass


    async def terminate_call():
        """Gracefully terminates the Twilio call and closes connections."""
        nonlocal session, call_ended_event, handoff_controller
        call_ended_event.set()
        if handoff_controller:
            handoff_controller.close()
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
        Monitors Silence Timeout (2-Stage Recovery: Reprompt -> Conclude & End)
        and Dynamic Maximum Call Duration (180s active vs 60s silent).
        """
        nonlocal is_concluding_call, has_reprompted_silence, last_agent_speech_done_time, last_user_speech_time, is_agent_speaking, user_spoke
        try:
            while not call_ended_event.is_set():
                await asyncio.sleep(0.5)
                if not deepgram_client or not deepgram_client.is_ready or not agent_config:
                    continue

                runtime = agent_config.runtime or AgentRuntimeSettings()
                silence_timeout = max(3, runtime.silence_timeout)
                hangup_delay = max(2, runtime.silence_hangup_delay or 5)
                max_duration = max(10, runtime.maximum_call_duration or 300)
                active_limit = max_duration if user_spoke else min(60, max_duration)
                
                conclusion_msg = (runtime.conclusion_message or "Thank you for your time. We will connect with you shortly. Goodbye!").strip()
                reprompt_msg = (runtime.silence_reprompt_message or "Hello? Are you there? Are you available?").strip()

                now = time.time()
                elapsed_call_time = now - call_start_time

                # Check if agent is currently speaking or audio is still playing in user's speaker
                if now < last_agent_speech_done_time:
                    is_agent_speaking = True
                    continue
                else:
                    is_agent_speaking = False

                # Active Monologue Tracking & Active Backchanneling (subtle listening cues during caller monologues)
                if is_user_speaking:
                    if runtime and getattr(runtime, "backchanneling_enabled", True) and not is_concluding_call and not is_agent_speaking:
                        bc_interval = getattr(runtime, "backchannel_interval_seconds", 4.0) or 4.0
                        user_speech_duration = now - user_speech_start_time
                        since_last_bc = now - last_backchannel_time
                        if user_speech_duration >= bc_interval and since_last_bc >= bc_interval:
                            bc_phrases = getattr(runtime, "backchannel_phrases", None) or [
                                "Right", "Mhm", "Understood", "I see", "Okay"
                            ]
                            import random
                            bc_word = random.choice(bc_phrases)
                            norm_bc = PronunciationNormalizer.normalize(bc_word, getattr(agent_config, "pronunciation_rules", None))
                            if deepgram_client and deepgram_client.is_ready:
                                logger.info(f"[VoiceGateway] Caller monologue active ({user_speech_duration:.1f}s). Injecting backchannel cue: '{norm_bc}'")
                                await deepgram_client.inject_agent_message(norm_bc, behavior="queue")
                                last_backchannel_time = now

                # 1. Smart Minute-Boundary Protection Check (conclude at selected_duration - 5s to avoid rolling into next billed minute)
                # e.g., 1 min (60s) -> triggers conclusion at 55s, 3 min (180s) -> triggers conclusion at 175s, 5 min (300s) -> triggers at 295s
                conclude_threshold = max(10, active_limit - 5) if active_limit >= 20 else active_limit
                if elapsed_call_time >= conclude_threshold and not is_concluding_call:
                    # If customer is actively speaking, allow current turn to finish naturally
                    if is_user_speaking:
                        continue

                    norm_conclusion = PronunciationNormalizer.normalize(conclusion_msg, getattr(agent_config, "pronunciation_rules", None))
                    logger.info(
                        f"[VoiceGateway] Smart Minute-Boundary Protection triggered: elapsed={elapsed_call_time:.1f}s, "
                        f"threshold={conclude_threshold}s (limit={active_limit}s, user_spoke={user_spoke}). Speaking conclusion message."
                    )
                    is_concluding_call = True
                    await deepgram_client.inject_agent_message(norm_conclusion)
                    # Allow 3.5s for audio playback, then hangup before the minute boundary
                    asyncio.create_task(asyncio.sleep(3.5)).add_done_callback(lambda _: asyncio.create_task(terminate_call()))
                    break

                # 2. Silence Timeout Check (Starts ONLY after agent audio finishes playing)
                if not is_concluding_call and not is_user_speaking:
                    last_activity = max(last_user_speech_time, last_agent_speech_done_time)
                    silence_elapsed = now - last_activity

                    # Phase 1: Ask reprompt message if silent for silence_timeout
                    if silence_elapsed >= silence_timeout and not has_reprompted_silence:
                        norm_reprompt = PronunciationNormalizer.normalize(reprompt_msg, getattr(agent_config, "pronunciation_rules", None))
                        logger.info(f"[VoiceGateway] Silence timeout ({silence_timeout}s) reached. Injecting reprompt: '{norm_reprompt}'")
                        has_reprompted_silence = True
                        last_agent_speech_done_time = now + 2.5
                        await deepgram_client.inject_agent_message(norm_reprompt)

                    # Phase 2: If still silent after reprompt + hangup_delay, speak conclusion and hang up
                    elif has_reprompted_silence and silence_elapsed >= (silence_timeout + hangup_delay):
                        norm_conclusion = PronunciationNormalizer.normalize(conclusion_msg, getattr(agent_config, "pronunciation_rules", None))
                        logger.info(f"[VoiceGateway] Post-reprompt silence limit ({hangup_delay}s) reached. Speaking conclusion and concluding call.")
                        is_concluding_call = True
                        await deepgram_client.inject_agent_message(norm_conclusion)
                        asyncio.create_task(asyncio.sleep(4.0)).add_done_callback(lambda _: asyncio.create_task(terminate_call()))
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
                        prospect_id=custom_params.get("prospect_id"),
                        campaign_id=custom_params.get("campaign_id"),
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

                # Resolve prospect details (if campaign or prospect_id provided) for dynamic greeting personalization
                prospect_data = None
                p_id = session.prospect_id if session else custom_params.get("prospect_id")
                c_id = session.campaign_id if session else custom_params.get("campaign_id")
                if p_id and c_id and org_id:
                    try:
                        from app.repositories.campaign_repository import CampaignRepository
                        camp_repo = CampaignRepository()
                        member = await camp_repo.get_by_campaign_and_prospect(c_id, p_id)
                        if member:
                            prospect_data = {
                                "name": getattr(member, "prospect_name", "") or "",
                                "phone": getattr(member, "phone_number", "") or ""
                            }
                    except Exception as p_err:
                        logger.debug(f"[VoiceGateway] Notice fetching prospect details for greeting: {p_err}")

                # Attach runtime call context onto agent_config object for dynamic variable resolution
                agent_config._call_direction = direction
                agent_config._prospect_data = prospect_data or {}

                # 2. Pre-fetch platform rules and Twilio configuration once per call at setup
                cached_platform_rules = PlatformRulesRepository.get_active_rule_directives_sync()
                cached_rules_map = {r["id"]: True for r in cached_platform_rules} if cached_platform_rules else {}
                cached_tw = None
                if session and session.organization_id:
                    try:
                        cached_tw = await twilio_repo.get_by_org(session.organization_id)
                        if cached_tw and cached_tw.inbound_forward_global_number:
                            cached_inbound_forward_number = cached_tw.inbound_forward_global_number
                    except Exception as tw_err:
                        logger.warning(f"[VoiceGateway] Notice fetching Twilio config: {tw_err}")

                business_profile = None  # business details now live on each agent (see VoicePromptBuilder.agent_business_profile)
                deepgram_settings = AgentRuntimeBuilder.build_deepgram_settings(
                    agent_config,
                    business_profile=business_profile,
                    platform_rules=cached_platform_rules,
                )

                # ── Multi-Agent Orchestrator Initialization ────────────────────────
                if agent_config.is_orchestrator and agent_config.orchestrator_config:
                    try:
                        child_agent_ids = agent_config.orchestrator_config.child_agent_ids
                        child_agents_map: dict = {}
                        for child_id in child_agent_ids:
                            try:
                                child_cfg = await agent_service.get_agent_by_id(ctx, child_id)
                                child_agents_map[child_id] = child_cfg
                                logger.info(f"[Orchestrator:Gateway] Loaded child agent '{child_id}' → '{child_cfg.name}'")
                            except Exception as child_err:
                                logger.warning(f"[Orchestrator:Gateway] Could not load child agent '{child_id}': {child_err}")

                        if child_agents_map:
                            orchestrator = AgentOrchestrator(
                                orchestrator_config=agent_config,
                                child_agents=child_agents_map,
                                business_profile=business_profile or {},
                            )
                            # Boost Voice Engine STT keyterms with orchestrator's high-weight terms (capped at 100)
                            orch_keyterms = orchestrator.get_stt_keyterms()
                            if orch_keyterms and deepgram_settings.agent.listen and deepgram_settings.agent.listen.provider:
                                current_kts = deepgram_settings.agent.listen.provider.keyterms or []
                                merged_kts = list(current_kts)
                                for kt in orch_keyterms:
                                    if kt not in merged_kts:
                                        merged_kts.append(kt)
                                deepgram_settings.agent.listen.provider.keyterms = merged_kts[:100]

                            logger.info(
                                f"[Orchestrator:Gateway] Orchestrator active with "
                                f"{len(child_agents_map)} child agents: {list(child_agents_map.keys())}"
                            )

                            # Think Proxy: route inside the LLM request path (falls back to UpdatePrompt without a public URL)
                            if think_proxy_requested(agent_config.orchestrator_config):
                                def _on_think_proxy_committed(specialist_cfg: AgentConfiguration, decision, context):
                                    nonlocal agent_config
                                    agent_config = specialist_cfg

                                async def _on_think_proxy_telemetry(telem_data: Dict[str, Any]):
                                    if session:
                                        await telemetry_broadcaster.broadcast(VoiceEventMessage(
                                            event_type=telem_data.get("event_type", "ThinkProxyRouting"),
                                            call_session_id=session.call_session_id,
                                            organization_id=session.organization_id,
                                            agent_id=telem_data.get("agent_id", session.agent_id),
                                            twilio_call_sid=session.twilio_call_sid,
                                            payload=telem_data.get("payload", {})
                                        ))

                                proxy_token = attach_think_proxy(
                                    deepgram_settings,
                                    orchestrator,
                                    call_id=session.call_session_id if session else "session",
                                    tenant_id=session.organization_id if session else "global",
                                    platform_rules=cached_platform_rules,
                                    on_committed=_on_think_proxy_committed,
                                    telemetry_callback=_on_think_proxy_telemetry,
                                    twilio_cfg=cached_tw,
                                )
                                use_think_proxy = proxy_token is not None
                        else:
                            logger.warning("[Orchestrator:Gateway] No child agents loaded. Orchestrator inactive.")
                    except Exception as orch_err:
                        logger.error(f"[Orchestrator:Gateway] Failed to initialize orchestrator: {orch_err}")
                # ──────────────────────────────────────────────────────────────────

                # Override with custom prompt if specified for this test call session
                if session and session.custom_prompt:
                    logger.info(f"[VoiceGateway] Applying custom call prompt override: {session.custom_prompt[:60]}...")
                    deepgram_settings.agent.think.prompt = session.custom_prompt

                logger.info(
                    f"[VoiceGateway] Initializing Voice Engine with Settings: "
                    f"STT Model='{deepgram_settings.agent.listen.provider.model}', "
                    f"LLM Provider='{deepgram_settings.agent.think.provider.type}', "
                    f"LLM Model='{deepgram_settings.agent.think.provider.model}', "
                    f"LLM Temp={deepgram_settings.agent.think.provider.temperature}, "
                    f"TTS Voice='{deepgram_settings.agent.speak.provider.model}'"
                )

                # 3. Instantiate Voice Engine Client
                deepgram_client = DeepgramVoiceAgentClient(
                    on_audio=handle_deepgram_audio,
                    on_event=handle_deepgram_event,
                    on_transcript=handle_transcript,
                    on_user_speaking=handle_user_speaking,
                    on_agent_thinking=handle_agent_thinking,
                    on_agent_speaking=handle_agent_speaking,
                    on_agent_audio_done=handle_agent_audio_done
                )

                # Initialize unified HandoffController if orchestrator is present and Think Proxy is NOT active
                if orchestrator and not use_think_proxy:
                    async def _on_gateway_handoff_committed(specialist_cfg: AgentConfiguration, decision, context):
                        nonlocal agent_config
                        agent_config = specialist_cfg
                        if session:
                            await telemetry_broadcaster.broadcast(VoiceEventMessage(
                                event_type="AgentHandoff",
                                call_session_id=session.call_session_id,
                                organization_id=session.organization_id,
                                agent_id=decision.target_agent_id,
                                twilio_call_sid=session.twilio_call_sid,
                                payload={
                                    "from_agent": context.from_agent_id,
                                    "to_agent": decision.target_agent_id,
                                    "keyword": decision.matched_keyword,
                                    "reason": decision.reason,
                                    "confidence": getattr(decision, "confidence", 0.0),
                                    "margin": getattr(decision, "margin", 0.0),
                                    "runner_up_agent_id": getattr(decision, "runner_up_agent_id", None),
                                    "runner_up_score": getattr(decision, "runner_up_score", 0.0),
                                    "matched_terms": getattr(decision, "matched_terms", []),
                                    "cumulative_appended_chars": getattr(handoff_controller, "cumulative_appended_chars", 0),
                                    "cumulative_appended_tokens": getattr(handoff_controller, "cumulative_appended_tokens", 0),
                                }
                            ))

                    async def _on_gateway_handoff_failed(decision, reason):
                        if session:
                            await telemetry_broadcaster.broadcast(VoiceEventMessage(
                                event_type="AgentHandoffFailed",
                                call_session_id=session.call_session_id,
                                organization_id=session.organization_id,
                                agent_id=decision.target_agent_id if decision else session.agent_id,
                                twilio_call_sid=session.twilio_call_sid,
                                payload={
                                    "target_agent": decision.target_agent_id if decision else None,
                                    "reason": reason,
                                }
                            ))

                    handoff_controller = HandoffController(
                        orchestrator=orchestrator,
                        deepgram_client=deepgram_client,
                        on_committed=_on_gateway_handoff_committed,
                        on_failed=_on_gateway_handoff_failed,
                        is_concluding=lambda: is_concluding_call,
                        get_transcript_turns=lambda: live_transcript_turns,
                        platform_rules=cached_platform_rules,
                        ack_timeout=1.0,
                    )

                # Execute official handshake (Welcome -> Settings -> SettingsApplied -> Inject Greeting)
                try:
                    # Use the fully resolved greeting (with dynamic variables like {{company_name}} and {{caller_name}} replaced)
                    raw_greeting = deepgram_settings.agent.greeting if deepgram_settings and deepgram_settings.agent and deepgram_settings.agent.greeting else agent_config.greeting
                    norm_greeting = PronunciationNormalizer.normalize(
                        raw_greeting,
                        getattr(agent_config, "pronunciation_rules", None)
                    ) if raw_greeting else None
                    await deepgram_client.connect_and_configure(
                        settings=deepgram_settings,
                        greeting=norm_greeting
                    )
                    logger.info("[VoiceGateway] Deepgram Voice Agent successfully connected and ready.")

                    # Calculate greeting duration to ensure silence monitor does not fire during opening statement
                    greeting_text = (agent_config.greeting or "").strip()
                    if greeting_text:
                        words_count = len(greeting_text.split())
                        estimated_intro_duration = max(3.0, (words_count / 2.0))
                        last_agent_speech_done_time = time.time() + estimated_intro_duration
                        logger.info(f"[VoiceGateway] Initial greeting duration estimated: {estimated_intro_duration:.1f}s ({words_count} words)")

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
        if handoff_controller:
            handoff_controller.close()
            handoff_controller = None

        if proxy_token:
            unregister_call_state(proxy_token)
            proxy_token = None

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

        # Proactively terminate Twilio phone call via REST API to ensure no billing or lingering phone line
        if session and session.twilio_call_sid and session.organization_id:
            try:
                logger.info(f"[VoiceGateway] Ensuring Twilio call {session.twilio_call_sid} is terminated on stream disconnect...")
                await twilio_service.end_call(session.organization_id, session.twilio_call_sid)
            except Exception as tw_err:
                logger.debug(f"[VoiceGateway] Notice on ending Twilio call: {tw_err}")

        if session:
            final_status = "failed" if session.last_error and session.error_type == "deepgram_connection_error" else "completed"
            await call_session_service.finalize_session(session, final_status=final_status)
