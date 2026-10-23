"""
Voice Gateway
FastAPI WebSocket endpoint bridging Twilio Media Streams and Deepgram Voice Agent API.
Handles audio forwarding, barge-in clear events, telemetry, silence management,
maximum call duration enforcement with conclusion message, and graceful teardown.
"""

import asyncio
import json
import logging
import re
import time
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.voice.audio import AudioAdapter
from app.voice.pronunciation_normalizer import PronunciationNormalizer
from app.voice.session import CallSession, active_sessions
from app.voice.language_follow import LanguageFollower
from app.voice.duration_policy import billing_elapsed, effective_limit, limit_action, limit_deadline
from app.voice.call_ending import closing_audio_expected_seconds, playback_complete
from app.voice.silence_policy import MIN_SILENCE_SECONDS, STUCK_SPEAKING_SECONDS, silence_action
from app.services.language_text import silence_messages
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


def _text_key(text: str) -> str:
    """Lower-case letters and digits only, to recognise a spoken message in the transcript despite punctuation."""
    return re.sub(r"\W+", "", (text or "").lower())

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
    real_conversation: bool = False  # the caller has said real words; lifts the no-conversation call cap
    is_agent_speaking: bool = False
    is_user_speaking: bool = False
    has_reprompted_silence: bool = False
    reprompt_injected_at: float = 0.0
    last_audio_chunk_time: float = 0.0  # when the voice engine last sent us audio
    goodbye_key: Optional[str] = None  # text fingerprint of the closing message while we wait for it to be spoken
    goodbye_started_event: asyncio.Event = asyncio.Event()
    injection_refused_event: asyncio.Event = asyncio.Event()
    is_concluding_call: bool = False
    org_credit_limit_sec: Optional[float] = None
    is_transferred: bool = False
    is_interrupted: bool = False
    call_ended_event: asyncio.Event = asyncio.Event()
    lifecycle_task: Optional[asyncio.Task] = None
    thinking_filler_task: Optional[asyncio.Task] = None
    barge_in_debounce_task: Optional[asyncio.Task] = None

    # Multi-Agent Orchestrator runtime state
    orchestrator: Optional[AgentOrchestrator] = None
    handoff_controller: Optional[HandoffController] = None
    live_transcript_turns: list = []  # [{"role": str, "content": str}]
    recent_user_texts: list = []  # last few caller turns, scanned together for split-up IVR menus
    turn_counter: int = 0

    # Cached call-local configurations (loaded once per call at setup)
    cached_rules_map: dict = {}
    cached_inbound_forward_number: Optional[str] = None

    # Outbound audio metrics
    startup_timing: dict = {}  # perf_counter marks for the answer -> first-greeting-audio path
    # Per-turn response-latency marks (perf_counter): user_start -> user_final -> thinking -> first_audio.
    # Logged once per turn so we can see which stage (endpointing, LLM, TTS) dominates the reply delay.
    turn_marks: dict = {}

    def _mark_turn(stage: str) -> None:
        turn_marks[stage] = time.perf_counter()

    def _log_turn_latency() -> None:
        m = turn_marks
        if "user_final" not in m or "first_audio" not in m or m.get("logged"):
            return
        m["logged"] = True
        ms = lambda a, b: round((m[b] - m[a]) * 1000.0) if a in m and b in m else None
        logger.info(
            f"[VoiceGateway:TurnLatency] reply_delay={ms('user_final', 'first_audio')}ms "
            f"(final_transcript->thinking={ms('user_final', 'thinking')}ms, "
            f"thinking->first_audio={ms('thinking', 'first_audio')}ms, "
            f"speech_start->final_transcript={ms('user_start', 'user_final')}ms)"
        )
        if session:
            session.latest_latency.reply_delay_ms = float(ms("user_final", "first_audio") or 0.0)

    outbound_chunk_counter: int = 0
    total_outbound_audio_bytes: int = 0
    total_outbound_audio_duration_s: float = 0.0

    # Asynchronous outbound audio queue to pace packets at true telephony speed (40ms per 320 bytes)
    # Drift-compensated wall-clock scheduling ensures EXACT 1.0x playback speed with zero slow-motion on Windows.
    outbound_audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
    audio_pacer_task: Optional[asyncio.Task] = None

    async def _audio_pacer_worker():
        nonlocal outbound_chunk_counter
        try:
            next_frame_time = 0.0
            while not call_ended_event.is_set():
                chunk = await outbound_audio_queue.get()
                if is_interrupted or not websocket:
                    outbound_audio_queue.task_done()
                    continue

                outbound_chunk_counter += 1
                twilio_msg = AudioAdapter.bytes_to_twilio_media(chunk, stream_sid)
                try:
                    await websocket.send_text(json.dumps(twilio_msg))
                except Exception as send_err:
                    logger.debug(f"[VoiceGateway] Audio chunk send notice: {send_err}")
                    outbound_audio_queue.task_done()
                    break

                outbound_audio_queue.task_done()
                
                chunk_duration_s = len(chunk) / 8000.0
                now = time.perf_counter()
                
                # Telephony Jitter Buffer Optimization:
                # Reset wall-clock anchor when restarting speech after a pause (>150ms).
                # Giving a ~120ms lead burst fills Twilio's audio player buffer instantaneously,
                # eliminating any startup delay or stutter when the agent begins speaking.
                if next_frame_time == 0.0 or (now - next_frame_time) > 0.15:
                    next_frame_time = now - (chunk_duration_s * 2.0)
                else:
                    next_frame_time += chunk_duration_s

                # Sleep only when pacing exceeds current clock time
                sleep_delay = next_frame_time - time.perf_counter()
                if sleep_delay > 0.005:
                    await asyncio.sleep(sleep_delay)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[VoiceGateway] Audio pacer worker error: {e}")

    audio_pacer_task = asyncio.create_task(_audio_pacer_worker())

    async def handle_deepgram_audio(raw_audio: bytes):
        """
        Receive audio from speech engine TTS and enqueue in 320-byte (40ms) frames for paced delivery.
        Preserves audio fidelity, avoids buffer flooding or packet starvation,
        and logs precise duration & byte metrics.
        """
        nonlocal is_agent_speaking, last_agent_speech_done_time, is_interrupted, last_audio_chunk_time
        nonlocal total_outbound_audio_bytes, total_outbound_audio_duration_s
        if not stream_sid or not raw_audio:
            return
        
        # If new audio from a subsequent agent turn arrives, clear the previous interrupted state
        is_interrupted = False
        try:
            # 8000 bytes of mu-law @ 8000Hz = 1.0 second of audio (1 byte = 0.125ms)
            audio_duration = len(raw_audio) / 8000.0
            now = time.time()

            if "user_final" in turn_marks and "first_audio" not in turn_marks:
                _mark_turn("first_audio")
                _log_turn_latency()

            # Conversational turn pacing: outbound audio starts immediately with zero artificial lag.
            if "first_audio" not in startup_timing and "start" in startup_timing:
                startup_timing["first_audio"] = time.perf_counter()
                first_audio_ms = (startup_timing["first_audio"] - startup_timing["start"]) * 1000.0
                logger.info(f"[VoiceGateway:Startup] First greeting audio sent to Twilio {first_audio_ms:.0f}ms after stream start")
                if session:
                    session.latest_latency.first_audio_latency_ms = round(first_audio_ms, 1)

            last_audio_chunk_time = now
            if last_agent_speech_done_time < now:
                last_agent_speech_done_time = now + audio_duration
            else:
                last_agent_speech_done_time += audio_duration
            is_agent_speaking = True

            total_outbound_audio_bytes += len(raw_audio)
            total_outbound_audio_duration_s += audio_duration

            # Split into 320-byte frames (40ms @ 8kHz mu-law) for smooth, jitter-free playback on mobile networks
            chunks = AudioAdapter.chunk_mulaw_audio(raw_audio, chunk_size=320)
            for chunk in chunks:
                if is_interrupted:
                    break
                await outbound_audio_queue.put(chunk)
        except Exception as e:
            logger.error(f"[VoiceGateway] Error enqueuing audio chunks: {e}")

    async def handle_user_speaking():
        """Barge-in: Interrupt audio immediately when user starts speaking."""
        nonlocal stream_sid, session, is_user_speaking, is_agent_speaking, last_user_speech_time, user_speech_start_time, has_reprompted_silence, user_spoke, thinking_filler_task, is_interrupted, last_agent_speech_done_time, is_concluding_call
        turn_marks.clear()
        _mark_turn("user_start")
        user_speech_start_time = time.time()
        is_user_speaking = True
        user_spoke = True
        last_user_speech_time = time.time()
        if is_concluding_call:
            # The goodbye is already on its way: never flush the audio queue, or the caller would hear it cut off.
            is_user_speaking = False
            return
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

        # Flush any unplayed chunks in the internal pacer queue
        while not outbound_audio_queue.empty():
            try:
                outbound_audio_queue.get_nowait()
                outbound_audio_queue.task_done()
            except Exception:
                break

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
        if "thinking" not in turn_marks:
            _mark_turn("thinking")
        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

        # Thinking fillers: Disabled by default to prevent extra unnecessary turns ('बिल्कुल!', 'Got it, one moment please.')
        # and eliminate delay so the model responds directly in a single, crisp turn.
        runtime = agent_config.runtime if agent_config else None
        if runtime and getattr(runtime, "conversational_fillers_enabled", False):
            async def _delayed_filler():
                try:
                    filler_delay = getattr(runtime, "filler_delay_seconds", 1.8) or 1.8
                    await asyncio.sleep(filler_delay)
                    if is_user_speaking or is_agent_speaking or is_concluding_call or is_interrupted:
                        return
                    agent_voice_lang = getattr(getattr(agent_config, "voice", None), "language", "en") or "en"
                    if "hi" in agent_voice_lang.lower():
                        phrases = getattr(runtime, "filler_phrases", None) or [
                            "हाँ जी, एक पल दीजिए...",
                            "समझ गया, मैं चेक कर रहा हूँ...",
                            "बिल्कुल, एक सेकंड रुकिए..."
                        ]
                    else:
                        phrases = getattr(runtime, "filler_phrases", None) or [
                            "Let me check that for you.",
                            "Got it, one moment please.",
                            "Understood, looking into that right now."
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
        # The engine finishing the audio is NOT the same as the caller having heard it (we pace playback in real
        # time), and it also fires for a sentence that was cut short. Hanging up on this event is what truncated
        # goodbyes, so the call is ended by end_call_gracefully(), which waits for the playback itself.
        if is_concluding_call:
            logger.info("[VoiceGateway] Engine finished sending the closing audio; waiting for it to finish playing.")

    async def handle_deepgram_event(event_type: str, data: dict):
        """Dispatch Deepgram events to frontend telemetry broadcaster."""
        nonlocal session
        if event_type == "InjectionRefused":
            injection_refused_event.set()
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
        nonlocal session, turn_start_time, last_user_speech_time, is_user_speaking, is_agent_speaking, has_reprompted_silence, is_concluding_call, user_spoke, real_conversation
        nonlocal orchestrator, live_transcript_turns, handoff_controller, turn_counter, cached_rules_map, cached_inbound_forward_number
        if not session:
            return

        now = time.perf_counter()
        turn_latency = round((now - turn_start_time) * 1000.0, 2)

        if role == "user":
            if "user_start" not in turn_marks:
                turn_marks.clear()
            turn_marks.pop("first_audio", None)
            turn_marks.pop("logged", None)
            turn_marks.pop("thinking", None)
            turn_marks["user_final"] = now
            turn_start_time = now
            last_user_speech_time = time.time()
            is_user_speaking = False
            user_spoke = True
            if len(content.split()) >= 2:  # a "real conversation" starts with actual words, not a noise blip or a lone hello
                real_conversation = True
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
                    # IVR menus arrive in several short segments ("for sales..." / "press one"), so also
                    # scan the last few caller turns joined together, not just this one.
                    # Zero-latency script check, so a switch to Hindi/Gujarati/etc. applies before the LLM verdict.
                    # Instant, offline language check on the caller's own words: no network call.
                    asyncio.create_task(language_follower.on_user_turn(content))
                    recent_user_texts.append(content)
                    del recent_user_texts[:-3]
                    window_text = " ".join(recent_user_texts)
                    ivr_res = SmartIVRDetector.analyze_transcript(content, enabled_rules=cached_rules_map)
                    if not ivr_res.is_ivr and len(recent_user_texts) > 1:
                        ivr_res = SmartIVRDetector.analyze_transcript(window_text, enabled_rules=cached_rules_map)
                    if not ivr_res.is_ivr and SmartIVRDetector.is_user_refusal(content):
                        logger.info(f"[VoiceGateway] Caller declined to continue: '{content[:60]}'. Concluding and hanging up.")
                        is_concluding_call = True
                        asyncio.create_task(conclude_and_hangup(content, "USER_DECLINED"))
                    elif not ivr_res.is_ivr:
                        # No rule matched: let the LLM judge it in whatever language the caller used.
                        asyncio.create_task(llm_end_check(window_text, content))
                    elif ivr_res.is_ivr:
                        logger.warning(
                            f"[VoiceGateway:IVR_DETECTED] Machine detected! "
                            f"Type='{ivr_res.symptom_type}', Phrase='{ivr_res.matched_phrase}', "
                            f"Action='{ivr_res.recommended_action}'"
                        )
                        session.outcome = f"IVR_DETECTED ({ivr_res.symptom_type})"
                        is_concluding_call = True

                        # Every call ends with a spoken closing message, machines included.
                        asyncio.create_task(conclude_and_hangup(window_text, session.outcome))
                except Exception as ivr_err:
                    logger.error(f"[VoiceGateway] IVR detection error: {ivr_err}")
        else:
            is_agent_speaking = True
            live_transcript_turns.append({"role": "assistant", "content": content})
            if goodbye_key and goodbye_key in _text_key(content):
                goodbye_started_event.set()
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
            # Never conclude on initial greeting (turn 0) or before the user has even spoken!
            if user_spoke and turn_counter >= 1 and detect_conversation_conclusion(content):
                lower_content = content.lower()
                is_voicemail_or_machine = (
                    "voicemail detected" in lower_content or
                    "automated system detected" in lower_content or
                    "leaving a message" in lower_content
                )
                logger.info(f"[VoiceGateway] Assistant ended with a farewell: '{content[-50:]}'. Hanging up once it has been heard in full.")
                is_concluding_call = True
                has_reprompted_silence = True
                # The agent already said its goodbye; just let it finish playing, then hang up.
                asyncio.create_task(end_call_gracefully(None))

    async def end_call_gracefully(closing_text: Optional[str], deadline_at: Optional[float] = None, max_wait: float = 25.0):
        """Speaks the closing message (if any) and hangs up only after the caller has heard it in full.

        The agent's current sentence is never cut: the closing message is queued behind it, and the hang-up waits for
        the engine to stop sending audio AND for our real-time playback queue to drain. deadline_at is only a billing
        safety net for the maximum-duration limit; it is reached long after the goodbye has normally finished.
        """
        nonlocal is_concluding_call, goodbye_key
        is_concluding_call = True
        hard_stop = time.time() + max_wait
        if deadline_at is not None:
            hard_stop = min(hard_stop, deadline_at)

        audio_before = total_outbound_audio_duration_s
        expected_audio_s = 0.0
        if closing_text and deepgram_client and deepgram_client.is_ready:
            goodbye_key = _text_key(closing_text)[:14] or None
            expected_audio_s = closing_audio_expected_seconds(closing_text)
            # The engine REFUSES an injection while the caller is mid-turn (and a "default" one while the agent is
            # mid-turn too), which silently dropped goodbyes before. "queue" waits behind the sentence in progress;
            # if it is refused we wait for the caller to stop and try again, never injecting twice.
            for attempt in range(6):
                goodbye_started_event.clear()
                injection_refused_event.clear()
                try:
                    await deepgram_client.inject_agent_message(closing_text, behavior="queue")
                except Exception as e:
                    logger.warning(f"[VoiceGateway] Could not speak closing message: {e}")
                waiter = asyncio.create_task(goodbye_started_event.wait())
                refused = asyncio.create_task(injection_refused_event.wait())
                try:
                    await asyncio.wait({waiter, refused}, timeout=max(0.5, min(8.0, hard_stop - time.time())), return_when=asyncio.FIRST_COMPLETED)
                finally:
                    waiter.cancel()
                    refused.cancel()
                if goodbye_started_event.is_set() or not injection_refused_event.is_set():
                    break  # being spoken, or accepted and queued behind the sentence in progress
                logger.info(f"[VoiceGateway] Closing message refused (caller mid-turn); retry {attempt + 1}.")
                for _ in range(10):  # let the caller finish their turn
                    if not is_user_speaking:
                        break
                    await asyncio.sleep(0.2)
                await asyncio.sleep(0.4)
                if time.time() >= hard_stop:
                    break

        while time.time() < hard_stop:
            now = time.time()
            if playback_complete(
                now,
                total_outbound_audio_duration_s - audio_before,
                expected_audio_s,
                last_audio_chunk_time,
                outbound_audio_queue.empty(),
                last_agent_speech_done_time,
            ):
                break
            await asyncio.sleep(0.1)
        else:
            logger.warning("[VoiceGateway] Hang-up deadline reached before the closing audio finished.")
        goodbye_key = None
        await terminate_call()

    async def conclude_and_hangup(heard_text: str, outcome: str, closing: Optional[str] = None):
        """Speak a goodbye in the language the other party used, then hang up."""
        if not closing:
            from app.voice.call_end_classifier import classify_turn
            from app.voice.ivr_detector import SmartIVRDetector
            langs = []
            if agent_config and getattr(agent_config, "language", None):
                langs = [agent_config.language.primary, *agent_config.language.secondary]
            try:
                verdict = await asyncio.wait_for(classify_turn(heard_text, langs), timeout=2.5)
            except Exception:
                verdict = None
            closing = (verdict.closing if verdict and verdict.closing else None) or SmartIVRDetector.closing_message(heard_text)
        if session:
            session.outcome = outcome
        await end_call_gracefully(closing)

    language_follower = LanguageFollower(
        get_config=lambda: agent_config,
        get_client=lambda: deepgram_client,
        get_settings=lambda: deepgram_settings,
        get_proxy_token=lambda: proxy_token,
        on_language=lambda lang: setattr(session, "detected_language", lang) if session else None,
    )

    def stt_language() -> str:
        return language_follower.stt_language()

    def get_language_tracker():
        return language_follower.tracker

    async def follow_caller_language(code: Optional[str], latest_text: str, confident: bool = False):
        await language_follower.follow(code, latest_text, confident=confident)

    async def llm_end_check(heard_text: str, latest_text: Optional[str] = None):
        """Background language-agnostic check for voicemail/IVR or a caller who wants to end the call."""
        nonlocal is_concluding_call
        from app.voice.call_end_classifier import classify_turn
        from app.voice.language_switcher import script_language, guess_latin_language
        latest_text = latest_text or heard_text
        langs = []
        if agent_config and getattr(agent_config, "language", None):
            langs = [agent_config.language.primary, *agent_config.language.secondary]
        verdict = await classify_turn(heard_text, langs, stt_language=stt_language(), speaking=get_language_tracker().current)
        if not is_concluding_call and not (verdict and verdict.should_end):
            # The model's verdict wins: it knows Hindi that a Gujarati-tuned recognizer wrote in Gujarati script.
            verdict_lang = verdict.language if verdict and verdict.language else None
            # Same offline guess as the instant path wins; the model's verdict only decides what the words cannot.
            local = script_language(latest_text) or guess_latin_language(latest_text)
            detected = local if local and local != stt_language() else (verdict_lang or local)
            await follow_caller_language(detected, latest_text, confident=bool(verdict_lang))
        if not verdict or not verdict.should_end or is_concluding_call:
            return
        is_concluding_call = True
        reason = "IVR_DETECTED (LLM_MACHINE)" if verdict.is_machine else "USER_DECLINED"
        logger.info(f"[VoiceGateway] LLM call-end verdict ({verdict.language}): {reason}. Concluding and hanging up.")
        await conclude_and_hangup(heard_text, reason, closing=verdict.closing or None)

    async def transfer_call_to_human(destination_phone: str, whisper_msg: Optional[str] = None):
        """Transfers the live Twilio call to a human phone number and concludes AI stream."""
        nonlocal session, call_ended_event, is_concluding_call, is_transferred
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
        
        # Extract configured fallback settings
        gr = getattr(agent_config, "guardrails", None)
        timeout_sec = getattr(gr, "human_transfer_timeout_seconds", 25) if gr else 25
        fallback_act = getattr(gr, "human_transfer_fallback_action", "hangup") if gr else "hangup"
        fallback_msg = getattr(gr, "human_transfer_fallback_message", "Our representatives are currently busy. We have logged your request and will follow up shortly.") if gr else None

        try:
            if session and session.twilio_call_sid and session.organization_id:
                success = await twilio_service.transfer_call(
                    org_id=session.organization_id,
                    call_sid=session.twilio_call_sid,
                    destination_phone=destination_phone,
                    caller_id=session.phone_number,
                    whisper_message=None,  # Already announced by AI
                    timeout_seconds=timeout_sec,
                    fallback_action=fallback_act,
                    fallback_message=fallback_msg
                )
                if success:
                    is_transferred = True
                    session.outcome = "TRANSFERRED_TO_HUMAN"
                    session.business_outcome = "Transferred to Human Specialist"
                    logger.info(f"[VoiceGateway] Live call transfer to {destination_phone} succeeded (timeout={timeout_sec}s, fallback={fallback_act}).")
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
        nonlocal is_concluding_call, has_reprompted_silence, reprompt_injected_at, last_agent_speech_done_time, last_user_speech_time, is_agent_speaking, user_spoke
        try:
            while not call_ended_event.is_set():
                await asyncio.sleep(0.5)
                if not deepgram_client or not deepgram_client.is_ready or not agent_config:
                    continue

                runtime = agent_config.runtime or AgentRuntimeSettings()
                now = time.time()
                elapsed_call_time = now - call_start_time

                # Use the seconds the client picked (the agent settings offer 3, 5, 7, 10). Only a 3s floor remains so
                # a mistyped 0 or 1 cannot interrupt a caller who is simply taking a breath.
                configured_silence = getattr(runtime, "silence_timeout", 8) or 8
                silence_timeout = max(MIN_SILENCE_SECONDS, float(configured_silence))
                configured_hangup = getattr(runtime, "silence_hangup_delay", 6) or 6
                hangup_delay = max(MIN_SILENCE_SECONDS, float(configured_hangup))
                active_limit = effective_limit(runtime.maximum_call_duration or 300, real_conversation, org_credit_limit_sec)
                credit_limit_close = org_credit_limit_sec is not None and elapsed_call_time >= max(1.0, org_credit_limit_sec - 10)

                # Default English wording is spoken in the language the call is currently in; custom text stays as written.
                reprompt_msg, silence_conclusion_msg = silence_messages(
                    runtime.silence_reprompt_message, runtime.conclusion_message, language_follower.tracker.current
                )

                # 0. Maximum call duration, planned around Twilio's per-minute billing (see duration_policy): the closing
                # message starts about 11s before the limit and the call is hung up about 5s before it, so it never
                # rolls into another billed minute. Evaluated before any speaking checks so a long agent monologue or
                # a noisy caller cannot push the call past the limit.
                if not is_concluding_call:
                    limit_step = limit_action(elapsed_call_time, active_limit, is_user_speaking)
                    if limit_step != "none":
                        closing_text = (
                            "You have reached your allocated organization calling limit. Please contact your workspace administrator "
                            "to top up your account. Goodbye!"
                            if credit_limit_close else silence_conclusion_msg
                        )
                        norm_conclusion = PronunciationNormalizer.normalize(closing_text, getattr(agent_config, "pronunciation_rules", None))
                        logger.info(
                            f"[VoiceGateway] Call limit: action={limit_step} elapsed={elapsed_call_time:.1f}s "
                            f"(billing~{billing_elapsed(elapsed_call_time):.1f}s) limit={active_limit:.0f}s "
                            f"real_conversation={real_conversation}. Ending call."
                        )
                        is_concluding_call = True
                        # The goodbye is queued behind the sentence in progress and the hang-up waits until it has been
                        # heard in full. The deadline is a billing safety net; the plan reaches the goodbye long before it.
                        asyncio.create_task(end_call_gracefully(norm_conclusion, deadline_at=limit_deadline(call_start_time, active_limit)))
                        break

                # Twilio audio-based answering-machine verdict (any language).
                from app.voice.call_end_classifier import MACHINE_CALLS
                amd_result = MACHINE_CALLS.pop(session.twilio_call_sid, None) if session and session.twilio_call_sid else None
                if amd_result and not is_concluding_call:
                    is_concluding_call = True
                    lang = language_follower.tracker.current
                    logger.warning(f"[VoiceGateway:IVR_DETECTED] Twilio AMD answered_by={amd_result}. Concluding and hanging up.")
                    from app.voice.ivr_detector import SmartIVRDetector
                    asyncio.create_task(conclude_and_hangup(
                        "", f"IVR_DETECTED (AMD_{amd_result.upper()})", closing=SmartIVRDetector.closing_for_code(lang)
                    ))
                    continue

                # CRITICAL TELEPHONY GUARD:
                # Do NOT run silence timeouts if outbound greeting audio has not yet been delivered to Twilio.
                # During initial call pickup, media streaming setup and TTS synthesis may take 1-3 seconds.
                # Terminating a call before any agent audio is delivered is strictly prevented.
                if outbound_chunk_counter == 0 and elapsed_call_time < 15.0:
                    continue

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

                # 2. Silence Timeout Check (Starts ONLY after agent audio finishes playing)
                if not is_concluding_call:
                    action = silence_action(
                        now, last_user_speech_time, last_agent_speech_done_time, is_user_speaking,
                        user_speech_start_time, has_reprompted_silence, reprompt_injected_at,
                        silence_timeout, hangup_delay,
                    )
                    # Phase 1: Ask reprompt message if silent for silence_timeout
                    if action == "reprompt":
                        norm_reprompt = PronunciationNormalizer.normalize(reprompt_msg, getattr(agent_config, "pronunciation_rules", None))
                        logger.info(f"[VoiceGateway] Silence timeout ({silence_timeout:.1f}s) reached. Injecting reprompt: '{norm_reprompt}'")
                        has_reprompted_silence = True
                        reprompt_injected_at = now
                        await deepgram_client.inject_agent_message(norm_reprompt, behavior="queue")

                    # Phase 2: If still silent after reprompt + hangup_delay, speak conclusion and hang up
                    elif action == "conclude":
                        norm_conclusion = PronunciationNormalizer.normalize(silence_conclusion_msg, getattr(agent_config, "pronunciation_rules", None))
                        logger.info(f"[VoiceGateway] No response {hangup_delay:.1f}s after reprompt. Speaking conclusion and ending call.")
                        is_concluding_call = True
                        asyncio.create_task(end_call_gracefully(norm_conclusion))
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

                # Fetch fresh Agent Configuration from database (ensuring latest endpointing & speed settings apply)
                agent_config = await agent_service.get_agent_by_id(ctx, agent_id)
                logger.info(f"[VoiceGateway] Loaded Agent config: Name='{agent_config.name}', Model='{agent_config.llm.model}', Voice='{agent_config.voice.voice}', Endpointing={agent_config.listen.endpointing if agent_config.listen else 'default'}ms")
                if session:
                    session.agent_config_snapshot = agent_config.model_dump(mode="json")

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

                startup_timing["start"] = time.perf_counter()
                await call_session_service.attach_stream(session, stream_sid, call_sid=call_sid)
                if session.connected_at and session.started_at:
                    session.latest_latency.call_connection_time_ms = round(
                        (session.connected_at - session.started_at).total_seconds() * 1000.0, 1
                    )

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

                # 2. Pre-fetch platform rules (in-memory) and start the Twilio config / credit lookups in the
                # background so they overlap with the Voice Engine handshake instead of delaying the greeting.
                cached_platform_rules = PlatformRulesRepository.get_active_rule_directives_sync()
                cached_rules_map = {r["id"]: True for r in cached_platform_rules} if cached_platform_rules else {}
                cached_tw = None

                async def _load_twilio_cfg():
                    if not (session and session.organization_id):
                        return None
                    try:
                        return await twilio_repo.get_by_org(session.organization_id)
                    except Exception as tw_err:
                        logger.warning(f"[VoiceGateway] Notice fetching Twilio config: {tw_err}")
                        return None

                async def _load_credit_limit():
                    # Fetch organization credit limit if strict enforcement is configured
                    if not org_id or org_id == "default":
                        return None
                    try:
                        from app.services.credit_service import credit_service
                        org_cred = await credit_service.repo.get_or_create_org_credits(org_id)
                        if org_cred and org_cred.is_credit_enforced and org_cred.credit_exhausted_action == "block":
                            limit_sec = float(max(1, org_cred.remaining_credits_seconds))
                            logger.info(f"[VoiceGateway] Org '{org_id}' credit limit active: {limit_sec:.1f}s remaining.")
                            return limit_sec
                    except Exception as c_err:
                        logger.debug(f"[VoiceGateway] Notice checking org credit limit: {c_err}")
                    return None

                twilio_cfg_task = asyncio.create_task(_load_twilio_cfg())
                credit_limit_task = asyncio.create_task(_load_credit_limit())

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
                                cached_tw = await twilio_cfg_task
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
                    f"STT Model='{deepgram_settings.agent.listen.provider.model}' (Lang='{deepgram_settings.agent.listen.provider.language}', Endpointing={deepgram_settings.agent.listen.provider.endpointing}ms), "
                    f"LLM Provider='{deepgram_settings.agent.think.provider.type}', "
                    f"LLM Model='{deepgram_settings.agent.think.provider.model}', "
                    f"TTS Voice='{deepgram_settings.agent.speak.provider.model}'"
                )

                # Multi-language agent without an orchestrator: tell the model each turn's language on that very reply.
                if not proxy_token and not orchestrator:
                    from app.voice.language_support import resolve_multilingual
                    from app.api.v1.think_proxy import attach_language_proxy
                    lang_plan = resolve_multilingual(agent_config)
                    if lang_plan.enabled:
                        proxy_token = attach_language_proxy(
                            deepgram_settings,
                            call_id=session.call_session_id if session else "session",
                            tenant_id=session.organization_id if session else "global",
                            primary=lang_plan.primary,
                            languages=lang_plan.languages,
                            twilio_cfg=cached_tw,
                        )
                        language_follower.reset()

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
                    startup_timing["handshake_begin"] = time.perf_counter()
                    await deepgram_client.connect_and_configure(
                        settings=deepgram_settings,
                        greeting=norm_greeting
                    )
                    startup_timing["handshake_done"] = time.perf_counter()
                    handshake_ms = (startup_timing["handshake_done"] - startup_timing["handshake_begin"]) * 1000.0
                    session.latest_latency.deepgram_connection_time_ms = round(handshake_ms, 1)
                    logger.info(f"[VoiceGateway:Startup] Voice Engine handshake (connect + settings applied) took {handshake_ms:.0f}ms")
                    logger.info("[VoiceGateway] Deepgram Voice Agent successfully connected and ready.")
                    cached_tw = await twilio_cfg_task
                    if cached_tw and cached_tw.inbound_forward_global_number:
                        cached_inbound_forward_number = cached_tw.inbound_forward_global_number
                    org_credit_limit_sec = await credit_limit_task

                    # Calculate greeting duration to ensure silence monitor does not fire during opening statement
                    greeting_text = (agent_config.greeting or "").strip()
                    if greeting_text:
                        words_count = len(greeting_text.split())
                        estimated_intro_duration = max(4.0, (words_count / 2.0))
                        last_agent_speech_done_time = time.time() + estimated_intro_duration
                        last_user_speech_time = last_agent_speech_done_time
                        logger.info(f"[VoiceGateway] Initial greeting duration estimated: {estimated_intro_duration:.1f}s ({words_count} words)")
                    else:
                        last_agent_speech_done_time = time.time()
                        last_user_speech_time = time.time()

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
        # Release the live status for every dashboard before any slow teardown (Voice Engine close,
        # Twilio REST hangup, database persistence) so "ringing / in call" never lingers after hang-up.
        if session:
            _early_status = "failed" if session.last_error and session.error_type == "deepgram_connection_error" else "completed"
            try:
                await call_session_service.release_live_session(session, _early_status)
            except Exception as rel_err:
                logger.debug(f"[VoiceGateway] Early session release notice: {rel_err}")
        if handoff_controller:
            handoff_controller.close()
            handoff_controller = None

        if proxy_token:
            unregister_call_state(proxy_token)
            proxy_token = None

        if lifecycle_task:
            lifecycle_task.cancel()
            lifecycle_task = None

        if audio_pacer_task:
            audio_pacer_task.cancel()
            audio_pacer_task = None

        if deepgram_client:
            try:
                await deepgram_client.close()
                logger.info(f"[VoiceGateway] Deepgram connection cleanly closed for stream {stream_sid}")
            except Exception as close_err:
                logger.error(f"[VoiceGateway] Error closing Deepgram client: {close_err}")
            finally:
                deepgram_client = None

        # Proactively terminate Twilio phone call via REST API if not already transferred to a human specialist
        if session and session.twilio_call_sid and session.organization_id and not is_transferred:
            try:
                logger.info(f"[VoiceGateway] Ensuring Twilio call {session.twilio_call_sid} is terminated on stream disconnect...")
                await twilio_service.end_call(session.organization_id, session.twilio_call_sid)
            except Exception as tw_err:
                logger.debug(f"[VoiceGateway] Notice on ending Twilio call: {tw_err}")

        if session:
            final_status = "failed" if session.last_error and session.error_type == "deepgram_connection_error" else "completed"
            await call_session_service.finalize_session(session, final_status=final_status)
