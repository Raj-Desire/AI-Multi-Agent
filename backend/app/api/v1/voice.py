"""
Voice API and Telemetry Stream Endpoints
Provides real-time developer telemetry WebSocket stream, active session monitoring, and test call initiation.
"""

import asyncio
import uuid
from datetime import datetime, timezone
import json
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request

from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.voice.session import CallSession, active_sessions
from app.voice.events import telemetry_broadcaster
from app.agents.configuration import AgentConfiguration, AgentRuntimeSettings
from app.agents.handoff_controller import HandoffController
from app.api.v1.think_proxy import attach_think_proxy, think_proxy_requested, unregister_call_state
from app.services.agent_service import AgentService
from app.services.call_session_service import CallSessionService
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.agent_repository import AgentRepository
from app.repositories.call_repository import CallRepository
from app.core.security import decrypt_token
from twilio.rest import Client

logger = logging.getLogger("voice_api")

router = APIRouter(prefix="/voice", tags=["Voice"])

twilio_repo = TwilioRepository()

# Identifies this server process. Twilio is told to call back PUBLIC_BASE_URL; when that URL points at a
# different deployment (e.g. a cloud instance) the media stream and status webhooks never reach this
# process, so its in-memory live state can never update. We detect that and fall back to Twilio's own status.
INSTANCE_ID = uuid.uuid4().hex
_remote_sessions: Dict[str, str] = {}          # call_session_id -> host that actually receives the call
_twilio_status_cache: Dict[str, tuple] = {}    # call_sid -> (monotonic_ts, status, start_time_iso, duration)


def _fetch_instance_id_sync(base_url: str) -> Optional[str]:
    import urllib.request
    try:
        req = urllib.request.Request(f"{base_url.rstrip('/')}/api/v1/voice/instance", headers={"ngrok-skip-browser-warning": "1"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return (body.get("data") or body).get("instance_id")
    except Exception:
        return None


async def _routes_to_this_server(base_url: str) -> bool:
    return (await asyncio.to_thread(_fetch_instance_id_sync, base_url)) == INSTANCE_ID


async def _twilio_call_status(org_id: str, call_sid: str) -> Optional[tuple]:
    """Live call status straight from Twilio (cached ~1.5s): (status, start_time_iso, duration)."""
    cached = _twilio_status_cache.get(call_sid)
    if cached and time.monotonic() - cached[0] < 1.5:
        return cached[1:]
    tw_cfg = await twilio_repo.get_by_org(org_id)
    if not tw_cfg:
        return None

    def _fetch():
        c = Client(tw_cfg.account_sid, decrypt_token(tw_cfg.encrypted_auth_token)).calls(call_sid).fetch()
        return (c.status or "", c.start_time.isoformat() if c.start_time else None, int(c.duration or 0))

    try:
        result = await asyncio.to_thread(_fetch)
    except Exception as e:
        logger.warning(f"[VoiceAPI] Could not read Twilio status for {call_sid}: {e}")
        return None
    _twilio_status_cache[call_sid] = (time.monotonic(),) + result
    return result


@router.get("/instance")
async def get_instance_id():
    """Public: lets a server check whether the public tunnel / deployment URL routes back to itself."""
    return {"instance_id": INSTANCE_ID}
agent_repo = AgentRepository()
agent_service = AgentService(agent_repo)
call_repo = CallRepository()
call_session_service = CallSessionService(call_repo)


class TestAICallRequest(BaseModel):
    to_number: str
    from_number: Optional[str] = None
    agent_id: Optional[str] = "agt_receptionist_default"
    custom_prompt: Optional[str] = None
    agent_config_override: Optional[Dict[str, Any]] = None
    prospect_id: Optional[str] = None


class HangupCallRequest(BaseModel):
    call_session_id: Optional[str] = None
    call_sid: Optional[str] = None


from app.voice.audio import AudioAdapter
from app.voice.pronunciation_normalizer import PronunciationNormalizer
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.agents.runtime import AgentRuntimeBuilder
from app.agents.orchestrator import AgentOrchestrator
from app.agents.handoff_controller import HandoffController
import time
import re


def detect_conversation_conclusion(text: str) -> bool:
    """
    Detects if a transcript turn indicates that the conversation has concluded
    (e.g., farewells, goodbyes, thanking and ending, hangup cues, multilingual closings).
    """
    if not text:
        return False
    lower = text.lower().strip()

    # 1. Multilingual / Indic keyword matches (no ASCII \b boundaries)
    indic_farewells = ["આવજો", "अलવિદા", "अलविदा", "शुभ दिन", "दिन शुभ", "સારો રહે", "સારું રહે"]
    if any(k in lower for k in indic_farewells):
        return True

    # 2. English & Latin Regex Patterns with word boundaries
    patterns = [
        r"\b(goodbye|good\s*bye|bye\s*bye|bye\s*now|bye|cya)\b",
        r"\b(have\s+a\s+(great|good|wonderful|nice|fantastic|pleasant|blessed)\s+(day|evening|night|weekend|rest\s+of\s+(your\s+)?day))\b",
        r"\b(take\s*care|see\s*you|talk\s*to\s*you\s*later|catch\s*you\s*later)\b",
        r"\b(thanks\s+for\s+calling|thank\s+you\s+for\s+calling)\b.*(?:\b(goodbye|bye|take\s*care|have\s+a\s+good|have\s+a\s+great)\b|\Z)",
        r"\b(thanks\s+for\s+your\s+time|thank\s+you\s+for\s+your\s+time)\b",
        r"\b(disconnect(ing)?\s*now|hang(ing)?\s*up\s*now|end\s*the\s*call|ending\s*the\s*call)\b",
        r"\b(reached\s*(your\s*)?voicemail|leave\s+a\s+message\s+after)\b",
        r"\b(we\s+will\s+follow\s+up\s+at\s+a\s+convenient\s+time)\b",
        r"\b(glad\s+i\s+could\s+help|happy\s+to\s+help|pleasure\s+helping\s+you)\b.*\b(bye|goodbye|take\s+care)\b",
        r"\b(adiós|hasta\s+luego|hasta\s+pronto|que\s+tengas\s+un\s+buen\s+día)\b",
        r"\b(au\s+revoir|bonne\s+journée|à\s+bientôt)\b",
        r"\b(auf\s+wiedersehen|tschüss|schönen\s+tag)\b"
    ]
    return any(re.search(p, lower, re.IGNORECASE) for p in patterns)


@router.websocket("/telemetry/{call_session_id}")
async def telemetry_websocket(websocket: WebSocket, call_session_id: str):
    """
    Real-time WebSocket stream for developer debugging and live conversation telemetry.
    """
    await websocket.accept()
    q = await telemetry_broadcaster.subscribe(call_session_id)

    # Watch the client side too: a handler that only waits on the queue never notices a disconnect or a
    # server shutdown, which leaks the subscription and makes uvicorn's auto-reload hang indefinitely.
    recv_task = asyncio.create_task(websocket.receive_text())
    try:
        while True:
            get_task = asyncio.create_task(q.get())
            done, _ = await asyncio.wait({get_task, recv_task}, return_when=asyncio.FIRST_COMPLETED)
            if recv_task in done:
                get_task.cancel()
                recv_task.result()  # raises WebSocketDisconnect when the client is gone
                recv_task = asyncio.create_task(websocket.receive_text())
                continue
            await websocket.send_json(get_task.result())
    except WebSocketDisconnect:
        logger.info(f"Telemetry client disconnected for session {call_session_id}")
    except Exception as e:
        logger.error(f"Telemetry stream error: {e}")
    finally:
        recv_task.cancel()
        await telemetry_broadcaster.unsubscribe(call_session_id, q)


@router.websocket("/preview-stream")
async def browser_preview_stream_websocket(websocket: WebSocket):
    """
    Direct in-browser live voice preview stream.
    Allows testing any agent directly with browser microphone & audio playback
    without placing a Twilio phone call.
    """
    await websocket.accept()
    logger.info("[VoicePreview] Browser Live Preview WebSocket connected.")

    deepgram_client: Optional[DeepgramVoiceAgentClient] = None
    agent_config: Optional[AgentConfiguration] = None
    session_id = f"prev_{int(time.time()*1000)}"
    turn_start_time = time.perf_counter()

    # Lifecycle state
    call_start_time: float = time.time()
    last_user_speech_time: float = time.time()
    user_speech_start_time: float = time.time()
    last_backchannel_time: float = time.time()
    last_agent_speech_done_time: float = time.time()
    is_agent_speaking: bool = False
    is_user_speaking: bool = False
    has_reprompted_silence: bool = False
    is_concluding_call: bool = False
    call_ended_event: asyncio.Event = asyncio.Event()
    lifecycle_task: Optional[asyncio.Task] = None
    thinking_filler_task: Optional[asyncio.Task] = None
    barge_in_debounce_task: Optional[asyncio.Task] = None

    preview_chunk_counter: int = 0
    total_preview_bytes: int = 0
    total_preview_duration_s: float = 0.0

    async def handle_dg_audio(raw_audio: bytes):
        """Send high-definition linear16 (24000Hz) synthesized audio back to browser client."""
        nonlocal is_agent_speaking, last_agent_speech_done_time
        nonlocal preview_chunk_counter, total_preview_bytes, total_preview_duration_s
        try:
            # 24,000 samples/sec * 2 bytes/sample (16-bit linear PCM) = 48,000 bytes/sec
            audio_duration = len(raw_audio) / 48000.0
            now = time.time()
            if last_agent_speech_done_time < now:
                last_agent_speech_done_time = now + audio_duration
            else:
                last_agent_speech_done_time += audio_duration
            is_agent_speaking = True

            preview_chunk_counter += 1
            total_preview_bytes += len(raw_audio)
            total_preview_duration_s += audio_duration

            import base64
            payload = base64.b64encode(raw_audio).decode("utf-8")
            await websocket.send_json({
                "type": "audio",
                "payload": payload,
                "encoding": "linear16",
                "sample_rate": 24000,
                "channels": 1,
                "bytes": len(raw_audio),
                "duration_ms": round(audio_duration * 1000.0, 2)
            })

            logger.debug(
                f"[VoicePreview:HD_Audio] Chunk #{preview_chunk_counter} | "
                f"Bytes: {len(raw_audio)} | Duration: {audio_duration*1000:.1f}ms | "
                f"Rate: 24kHz Linear PCM | Cumulative: {total_preview_duration_s:.2f}s"
            )
        except Exception as e:
            logger.error(f"[VoicePreview] Error sending audio to browser: {e}")

    async def handle_dg_event(event_type: str, data: dict):
        try:
            if event_type == "UserStoppedSpeaking":
                nonlocal is_user_speaking
                is_user_speaking = False
            await websocket.send_json({
                "type": "event",
                "event_type": event_type,
                "data": data
            })
        except Exception:
            pass

    # Multi-Agent Orchestrator state
    orchestrator: Optional[AgentOrchestrator] = None
    handoff_controller: Optional[HandoffController] = None
    preview_proxy_token: Optional[str] = None
    live_transcript_turns: List[Dict[str, str]] = []
    turn_counter: int = 0

    async def handle_dg_transcript(role: str, content: str):
        nonlocal turn_start_time, last_user_speech_time, is_user_speaking, is_agent_speaking, has_reprompted_silence
        nonlocal live_transcript_turns, turn_counter, orchestrator, handoff_controller, is_concluding_call
        now = time.perf_counter()
        turn_latency = round((now - turn_start_time) * 1000.0, 2)
        if role == "user":
            turn_start_time = now
            last_user_speech_time = time.time()
            is_user_speaking = False
            has_reprompted_silence = False
            turn_counter += 1
            live_transcript_turns.append({"role": "user", "content": content})

            # Multi-Agent Orchestrator: Submit for Handoff Evaluation
            if handoff_controller and not is_concluding_call:
                handoff_controller.submit(content, turn_number=turn_counter)
        else:
            is_agent_speaking = True
            live_transcript_turns.append({"role": "assistant", "content": content})

            # Steady-State Prompt Swap Following Assistant Response
            if handoff_controller:
                asyncio.create_task(handoff_controller.on_assistant_turn(content))

        try:
            await websocket.send_json({
                "type": "transcript",
                "role": role,
                "content": content,
                "latency_ms": turn_latency
            })
        except Exception:
            pass

    async def handle_dg_user_speaking():
        nonlocal is_user_speaking, is_agent_speaking, last_user_speech_time, user_speech_start_time, has_reprompted_silence, is_concluding_call, thinking_filler_task
        user_speech_start_time = time.time()
        is_user_speaking = True
        if not is_concluding_call:
            last_user_speech_time = time.time()
            has_reprompted_silence = False

        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

        is_agent_speaking = False
        try:
            await websocket.send_json({
                "type": "clear"
            })
        except Exception:
            pass

    async def handle_dg_agent_speaking(data: dict):
        nonlocal is_agent_speaking, is_user_speaking, thinking_filler_task
        is_agent_speaking = True
        is_user_speaking = False
        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

    async def handle_dg_agent_thinking(data: dict):
        nonlocal thinking_filler_task, deepgram_client
        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

        runtime = agent_config.runtime if agent_config else None
        if runtime and getattr(runtime, "conversational_fillers_enabled", True):
            async def _delayed_preview_filler():
                try:
                    await asyncio.sleep(1.20)
                    if is_user_speaking or is_agent_speaking or is_concluding_call:
                        return
                    phrases = getattr(runtime, "filler_phrases", None) or [
                        "Got it, let me check that for you.",
                        "Understood, give me one moment.",
                        "Sure thing, looking into that right now."
                    ]
                    import random
                    filler = random.choice(phrases)
                    norm_filler = PronunciationNormalizer.normalize(filler, getattr(agent_config, "pronunciation_rules", None))
                    if not is_agent_speaking and not is_user_speaking and deepgram_client and deepgram_client.is_ready:
                        logger.info(f"[VoicePreview] Agent thinking threshold reached. Emitting filler: '{norm_filler}'")
                        await deepgram_client.inject_agent_message(norm_filler, behavior="queue")
                except asyncio.CancelledError:
                    pass
                except Exception as ex:
                    logger.debug(f"[VoicePreview] Filler notice: {ex}")
            thinking_filler_task = asyncio.create_task(_delayed_preview_filler())

    async def handle_dg_agent_audio_done():
        nonlocal is_agent_speaking
        is_agent_speaking = False
        logger.debug("[VoicePreview] Agent finished speaking turn. Actively listening for user speech.")

    async def terminate_preview_session():
        nonlocal call_ended_event, lifecycle_task, deepgram_client, thinking_filler_task
        if thinking_filler_task and not thinking_filler_task.done():
            thinking_filler_task.cancel()

    async def preview_lifecycle_monitor():
        """Keeps live preview stream alive indefinitely by sending periodic KeepAlive pulses to Deepgram."""
        nonlocal last_backchannel_time
        keepalive_counter = 0
        try:
            while not call_ended_event.is_set():
                await asyncio.sleep(1.0)
                keepalive_counter += 1
                if not deepgram_client or not deepgram_client.is_ready:
                    continue

                # Monologue monitor (ensure keepalive without disruptive agent injection)
                now = time.time()

                # Send periodic keep-alive every 4 seconds to guarantee WebSocket connection never drops during silence
                if keepalive_counter % 4 == 0:
                    try:
                        await deepgram_client.send_keep_alive()
                    except Exception as ke:
                        logger.debug(f"[VoicePreview] KeepAlive pulse: {ke}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[VoicePreview] Error in preview_lifecycle_monitor: {e}")

    try:
        while True:
            recv_data = await websocket.receive()
            if recv_data.get("type") == "websocket.disconnect":
                break

            # 1. Direct binary audio chunk from browser mic (24kHz Linear16 PCM) - Zero JSON/Base64 overhead
            if "bytes" in recv_data and recv_data["bytes"]:
                raw_bytes = recv_data["bytes"]
                last_user_speech_time = time.time()
                if deepgram_client and deepgram_client.is_ready:
                    try:
                        await deepgram_client.send_audio(raw_bytes)
                    except Exception as e:
                        logger.error(f"[VoicePreview] Error forwarding binary audio to voice agent: {e}")
                continue

            # 2. JSON control or data message
            elif "text" in recv_data and recv_data["text"]:
                msg = recv_data["text"]
                try:
                    data = json.loads(msg)
                except Exception:
                    continue

                msg_type = data.get("type")

                # Configure & Start Session
                if msg_type == "configure":
                    agent_dict = data.get("agent_config", {})
                    greeting = data.get("greeting") or agent_dict.get("greeting")
                    try:
                        agent_config = AgentConfiguration.model_validate(agent_dict)
                    except Exception as e:
                        logger.warning(f"[VoicePreview] Invalid agent configuration passed: {e}")
                        agent_config = AgentConfiguration(
                            name="Preview Agent",
                            role="Assistant",
                            objective="Helpful Assistant",
                            greeting="Hello! I am ready to test."
                        )

                    from app.repositories.platform_rules_repository import PlatformRulesRepository
                    target_org_id = agent_config.organization_id
                    if not target_org_id or target_org_id == "default":
                        target_org_id = "org_platform_root"
                    business_profile = None  # business details now live on each agent (see VoicePromptBuilder.agent_business_profile)
                    cached_platform_rules = PlatformRulesRepository.get_active_rule_directives_sync()
                    deepgram_settings = AgentRuntimeBuilder.build_deepgram_settings(
                        agent_config,
                        business_profile=business_profile,
                        platform_rules=cached_platform_rules,
                        audio_profile="playground"
                    )

                    if handoff_controller:
                        handoff_controller.close()
                        handoff_controller = None
                    if preview_proxy_token:
                        unregister_call_state(preview_proxy_token)
                        preview_proxy_token = None

                    if lifecycle_task:
                        lifecycle_task.cancel()
                        lifecycle_task = None

                    if deepgram_client:
                        await deepgram_client.close()
                        deepgram_client = None

                    # ── Multi-Agent Orchestrator Initialization for Browser Preview ──
                    orchestrator = None
                    live_transcript_turns.clear()
                    turn_counter = 0

                    if agent_config.is_orchestrator and agent_config.orchestrator_config:
                        try:
                            child_ids = agent_config.orchestrator_config.child_agent_ids
                            child_map: dict = {}
                            effective_org = target_org_id or "global"
                            for cid in child_ids:
                                try:
                                    c_cfg = await agent_repo.get_by_id(effective_org, cid)
                                    if c_cfg:
                                        child_map[cid] = c_cfg
                                        logger.info(f"[Orchestrator:Preview] Loaded child agent '{cid}' → '{c_cfg.name}'")
                                except Exception as c_err:
                                    logger.warning(f"[Orchestrator:Preview] Could not load child agent '{cid}': {c_err}")

                            if child_map:
                                orchestrator = AgentOrchestrator(
                                    orchestrator_config=agent_config,
                                    child_agents=child_map,
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
                                    f"[Orchestrator:Preview] Orchestrator active with {len(child_map)} child agents."
                                )

                                # Think Proxy removes the one-turn prompt-swap lag (needs a public HTTPS URL)
                                if think_proxy_requested(agent_config.orchestrator_config):
                                    async def _on_preview_proxy_committed(specialist_cfg, decision, context):
                                        nonlocal agent_config
                                        agent_config = specialist_cfg
                                        try:
                                            await websocket.send_json({
                                                "type": "agent_handoff",
                                                "target_agent_id": decision.target_agent_id,
                                                "target_agent_name": decision.target_agent_name,
                                                "keyword": decision.matched_keyword,
                                                "reason": decision.reason,
                                                "confidence": getattr(decision, "confidence", 0.0),
                                                "margin": getattr(decision, "margin", 0.0),
                                                "matched_terms": getattr(decision, "matched_terms", []),
                                            })
                                        except Exception:
                                            pass

                                    if preview_proxy_token:
                                        unregister_call_state(preview_proxy_token)
                                    preview_proxy_token = attach_think_proxy(
                                        deepgram_settings,
                                        orchestrator,
                                        call_id=f"preview_{agent_config.agent_id}_{int(time.time())}",
                                        tenant_id=effective_org,
                                        platform_rules=cached_platform_rules,
                                        on_committed=_on_preview_proxy_committed,
                                    )
                        except Exception as orch_e:
                            logger.error(f"[Orchestrator:Preview] Failed to initialize orchestrator: {orch_e}")
                    # ──────────────────────────────────────────────────────────────────

                    # Reset state
                    call_start_time = time.time()
                    last_user_speech_time = time.time()
                    user_speech_start_time = time.time()
                    last_backchannel_time = time.time()
                    last_agent_speech_done_time = time.time()
                    is_concluding_call = False
                    has_reprompted_silence = False
                    call_ended_event.clear()

                    async def handle_dg_error(err_str: str):
                        logger.error(f"[VoicePreview] Voice engine reported error: {err_str}")
                        try:
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Voice engine notice: {err_str}"
                            })
                        except Exception:
                            pass

                    deepgram_client = DeepgramVoiceAgentClient(
                        on_audio=handle_dg_audio,
                        on_event=handle_dg_event,
                        on_transcript=handle_dg_transcript,
                        on_user_speaking=handle_dg_user_speaking,
                        on_agent_thinking=handle_dg_agent_thinking,
                        on_agent_speaking=handle_dg_agent_speaking,
                        on_agent_audio_done=handle_dg_agent_audio_done,
                        on_error=handle_dg_error
                    )

                    # Initialize unified HandoffController if orchestrator is present and Think Proxy is NOT active
                    if orchestrator and not preview_proxy_token:
                        async def _on_preview_handoff_committed(specialist_cfg, decision, context):
                            nonlocal agent_config
                            agent_config = specialist_cfg
                            try:
                                await websocket.send_json({
                                    "type": "agent_handoff",
                                    "target_agent_id": decision.target_agent_id,
                                    "target_agent_name": decision.target_agent_name,
                                    "keyword": decision.matched_keyword,
                                    "reason": decision.reason,
                                    "confidence": getattr(decision, "confidence", 0.0),
                                    "margin": getattr(decision, "margin", 0.0),
                                    "runner_up_agent_id": getattr(decision, "runner_up_agent_id", None),
                                    "runner_up_score": getattr(decision, "runner_up_score", 0.0),
                                    "matched_terms": getattr(decision, "matched_terms", []),
                                })
                            except Exception:
                                pass

                        async def _on_preview_handoff_failed(decision, reason):
                            logger.warning(
                                f"[Orchestrator:Preview] Handoff failed: target='{decision.target_agent_id if decision else None}' "
                                f"reason='{reason}'"
                            )

                        handoff_controller = HandoffController(
                            orchestrator=orchestrator,
                            deepgram_client=deepgram_client,
                            on_committed=_on_preview_handoff_committed,
                            on_failed=_on_preview_handoff_failed,
                            is_concluding=lambda: is_concluding_call,
                            get_transcript_turns=lambda: live_transcript_turns,
                            platform_rules=cached_platform_rules,
                            ack_timeout=1.0,
                        )

                    try:
                        raw_greeting = greeting or agent_config.greeting
                        norm_greeting = PronunciationNormalizer.normalize(
                            raw_greeting,
                            getattr(agent_config, "pronunciation_rules", None)
                        ) if raw_greeting else None
                        await deepgram_client.connect_and_configure(
                            settings=deepgram_settings,
                            greeting=norm_greeting
                        )
                        await websocket.send_json({
                            "type": "ready",
                            "agent_name": agent_config.name,
                            "voice": agent_config.voice.voice,
                            "model": agent_config.llm.model,
                            "audio_profile": "playground",
                            "sample_rate": 24000,
                            "encoding": "linear16"
                        })
                        logger.info("[VoicePreview] Voice agent connected in HD Studio mode (24kHz Linear PCM) for in-browser preview.")
                        lifecycle_task = asyncio.create_task(preview_lifecycle_monitor())
                    except Exception as dg_err:
                        logger.error(f"[VoicePreview] Failed to configure voice agent: {dg_err}")
                        await websocket.send_json({
                            "type": "error",
                            "message": str(dg_err)
                        })

                # Legacy base64 JSON audio chunk fallback
                elif msg_type == "audio":
                    audio_payload = data.get("payload")
                    if audio_payload and deepgram_client and deepgram_client.is_ready:
                        import base64
                        try:
                            raw_bytes = base64.b64decode(audio_payload)
                            await deepgram_client.send_audio(raw_bytes)
                        except Exception as e:
                            logger.error(f"[VoicePreview] Error processing audio payload: {e}")

                # Dynamic Prompt / Parameter update while speaking
                elif msg_type == "update_prompt":
                    new_prompt = data.get("prompt")
                    if new_prompt and deepgram_client and deepgram_client.is_ready:
                        await deepgram_client.update_prompt(new_prompt)

                # Inject manual user message (simulates user speech turn for typed input)
                elif msg_type == "inject_text":
                    text = data.get("text")
                    if text and deepgram_client and deepgram_client.is_ready:
                        await deepgram_client.inject_user_message(text)


                # Heartbeat ping/pong
                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                # Stop preview session
                elif msg_type == "stop":
                    call_ended_event.set()
                    if handoff_controller:
                        handoff_controller.close()
                    if preview_proxy_token:
                        unregister_call_state(preview_proxy_token)
                        preview_proxy_token = None
                    if lifecycle_task:
                        lifecycle_task.cancel()
                        lifecycle_task = None
                    if deepgram_client:
                        await deepgram_client.close()
                    await websocket.send_json({"type": "stopped"})

    except WebSocketDisconnect:
        logger.info("[VoicePreview] Browser WebSocket disconnected.")
    except Exception as e:
        logger.error(f"[VoicePreview] Unexpected error: {e}")
    finally:
        call_ended_event.set()
        if handoff_controller:
            handoff_controller.close()
            handoff_controller = None
        if preview_proxy_token:
            unregister_call_state(preview_proxy_token)
            preview_proxy_token = None
        if lifecycle_task:
            lifecycle_task.cancel()
            lifecycle_task = None
        if deepgram_client:
            await deepgram_client.close()


class SampleSpeechRequest(BaseModel):
    voice: str = "flux-hannah-en"
    provider: Optional[str] = None  # "deepgram" | "cartesia"
    text: Optional[str] = None
    speed: Optional[float] = 1.0


SAMPLE_SPEECH_CACHE: Dict[str, bytes] = {}
CARTESIA_VOICES_CACHE: Dict[str, Any] = {"timestamp": 0.0, "voices": []}


@router.get("/cartesia-voices")
async def list_cartesia_voices():
    """
    Returns curated, categorized Cartesia Sonic voices with high-speed in-memory caching.
    Includes gender, language, accent, and conversational suitability tags.
    """
    import os
    import time
    import httpx

    now = time.time()
    # Cache for 1 hour to prevent redundant API calls
    if CARTESIA_VOICES_CACHE["voices"] and (now - CARTESIA_VOICES_CACHE["timestamp"]) < 3600:
        return {"status": "success", "data": CARTESIA_VOICES_CACHE["voices"]}

    api_key = (os.getenv("CARTESIA_API_KEY", "")).strip()
    if not api_key:
        return {"status": "error", "message": "Cartesia API key is not configured in .env", "data": []}

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Cartesia-Version": "2024-06-10"
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get("https://api.cartesia.ai/voices", headers=headers)
            if resp.status_code != 200:
                logger.error(f"[CartesiaVoices Error] Failed to fetch voices: {resp.status_code} - {resp.text}")
                return {"status": "error", "message": f"Cartesia API returned {resp.status_code}", "data": []}

            raw_voices = resp.json()
            formatted = []
            for v in raw_voices:
                if v.get("is_archived"):
                    continue
                # Map gender
                raw_gender = (v.get("gender") or "").lower()
                gender = "Female" if "fem" in raw_gender else ("Male" if "masc" in raw_gender else "Neutral")
                lang = v.get("language") or "en"
                name = v.get("name") or "Sonic Voice"
                desc = v.get("description") or "Lifelike expressive Sonic voice."

                # Map authentic native sample greetings per language
                NATIVE_SAMPLE_TEXTS: Dict[str, str] = {
                    "en": "Hello! I am your AI voice assistant powered by Sonic. How can I help you today?",
                    "es": "¡Hola! Soy tu asistente de voz con tecnología Sonic. ¿En qué puedo ayudarte hoy?",
                    "fr": "Bonjour ! Je suis votre assistante vocale avec Sonic. Comment puis-je vous aider aujourd'hui ?",
                    "de": "Hallo! Ich bin Ihr KI-Sprachassistent mit Sonic. Wie kann ich Ihnen heute helfen?",
                    "it": "Ciao! Sono il tuo assistente vocale intelligente con Sonic. Come posso aiutarti oggi?",
                    "pt": "Olá! Sou o seu assistente de voz com tecnologia Sonic. Como posso ajudar você hoje?",
                    "ja": "こんにちは！Sonic音声エンジンを搭載したAIアシスタントです。本日はどのようなご用件でしょうか？",
                    "hi": "नमस्ते! मैं सॉनिक तकनीक द्वारा संचालित आपका एआई वॉयस असिस्टेंट हूँ। आज मैं आपकी क्या मदद कर सकता हूँ?",
                    "gu": "નમસ્તે! હું સોનિક ટેકનોલોજી દ્વારા સંચાલિત તમારો એઆઈ વોઇસ આસિસ્ટન્ટ છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
                    "zh": "您好！我是搭载Sonic语音引擎的AI助手。请问今天有什么我可以帮您的？",
                    "ko": "안녕하세요! 소닉 엔진을 탑재한 AI 음성 어시스턴트입니다. 오늘 어떤 도움이 필요하신가요?",
                    "ar": "مرحباً! أنا مساعدك الصوتي الذكي المدعوم بمحرك سونيك. كيف يمكنني مساعدتك اليوم؟",
                    "nl": "Hallo! Ik ben uw virtuele spraakassistent met Sonic. Hoe kan ik u vandaag helpen?",
                    "he": "שלום! אני עוזר הקול שלך המופעל באמצעות סוניק. איך אוכל לעזור לך היום?",
                    "sv": "Hej! Jag är din AI-röstassistent med Sonic. Hur kan jag hjälpa dig idag?",
                    "pl": "Cześć! Jestem Twoim inteligentnym asystentem głosowym z silnikiem Sonic. W czym mogę pomóc?",
                    "tr": "Merhaba! Sonic ses motoruyla desteklenen yapay zeka ses asistanınızım. Bugün size nasıl yardımcı olabilirim?",
                    "id": "Halo! Saya asisten suara AI Anda dengan teknologi Sonic. Ada yang bisa saya bantu hari ini?",
                    "th": "สวัสดีค่ะ! ฉันคือผู้ช่วยเสียง AI ของคุณ ขับเคลื่อนด้วย Sonic วันนี้มีอะไรให้ช่วยไหมคะ?",
                    "ru": "Здравствуйте! Я ваш голосовой ассистент с искусственным интеллектом Sonic. Чем могу помочь?",
                    "vi": "Xin chào! Tôi là trợ lý giọng nói AI của bạn với công nghệ Sonic. Tôi có thể giúp gì cho bạn hôm nay?",
                    "tl": "Kamusta! Ako ang iyong AI voice assistant gamit ang Sonic. Paano kita matutulungan ngayon?",
                    "ta": "வணக்கம்! சோனிக் தொழில்நுட்பத்தால் இயங்கும் உங்கள் AI குரல் உதவியாளர் நான். இன்று உங்களுக்கு எவ்வாறு உதவ முடியும்?",
                    "te": "నమస్కారం! సోనిక్ టెక్నాలజీతో పనిచేసే మీ AI వాయిస్ అసిస్టెంట్‌ని నేను. ఈరోజు మీకు ఎలా సహాయపడగలను?",
                    "bn": "নমস্কার! আমি সনিক প্রযুক্তি দ্বারা পরিচালিত আপনার এআই ভয়েস সহকারী। আজ আমি আপনাকে কিভাবে সাহায্য করতে পারি?",
                    "pa": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਸੋਨਿਕ ਤਕਨਾਲੋਜੀ ਦੁਆਰਾ ਸੰਚਾਲਿਤ ਤੁਹਾਡਾ ਏਆਈ ਵੌਇਸ ਅਸਿਸਟੈਂਟ ਹਾਂ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
                    "ur": "السلام علیکم! میں سونک ٹیکنالوجی سے لیس آپ کا اے آئی وائس اسسٹنٹ ہوں۔ آج میں آپ کی کیا مدد کر سکتا ہوں?",
                    "el": "Γεια σας! Είμαι ο φωνητικός σας βοηθός AI με τεχνολογία Sonic. Πώς μπορώ να σας βοηθήσω σήμερα;",
                    "da": "Hej! Jeg er din AI-stemmeassistent med Sonic. Hvordan kan jeg hjælpe dig i dag?",
                    "fi": "Hei! Olen tekoäly-ääniavustajasi Sonic-teknologialla. Kuinka voin auttaa sinua tänään?",
                    "no": "Hei! Jeg er din AI-stemmeassistent med Sonic. Hvordan kan jeg hjelpe deg i dag?",
                    "cs": "Dobrý den! Jsem váš hlasový asistent AI s technologií Sonic. Jak vám mohu dnes pomoci?",
                    "hu": "Üdvözlöm! Én vagyok az Ön Sonic-alapú mesterséges intelligencia hangasszisztense. Miben segíthetek ma?",
                    "ro": "Bună! Sunt asistentul tău vocal inteligent cu tehnologia Sonic. Cu ce te pot ajuta astăzi?",
                    "uk": "Вітаю! Я ваш голосовий асистент зі штучним інтелектом на базі Sonic. Чим можу допомогти?"
                }

                formatted.append({
                    "id": v.get("id"),
                    "name": name,
                    "gender": gender,
                    "language": lang,
                    "description": desc,
                    "style": "Ultra-Natural & Lifelike",
                    "engine": "sonic",
                    "sampleText": NATIVE_SAMPLE_TEXTS.get(lang, f"Hello! I am your AI voice assistant powered by Sonic in {lang.upper()}. How can I help you today?")
                })

            CARTESIA_VOICES_CACHE["voices"] = formatted
            CARTESIA_VOICES_CACHE["timestamp"] = now
            return {"status": "success", "data": formatted}
    except Exception as e:
        logger.error(f"[CartesiaVoices Error] Exception fetching voices: {e}")
        return {"status": "error", "message": str(e), "data": []}


@router.post("/sample-speech")
async def generate_sample_speech(payload: SampleSpeechRequest):
    """
    Synthesizes a sample audio snippet using Conversational Text-to-Speech (Flux or Sonic).
    Features high-speed in-memory caching and lightweight MP3 encoding for instant in-browser playback.
    """
    import os
    import httpx
    from fastapi.responses import Response

    sample_text = payload.text
    if not sample_text or not sample_text.strip():
        sample_text = "Hello! I am your AI Voice Agent. How can I help you today?"

    sample_text = sample_text.strip()
    voice = payload.voice or "flux-hannah-en"

    cache_key = f"{voice}:{sample_text}"
    if cache_key in SAMPLE_SPEECH_CACHE:
        return Response(
            content=SAMPLE_SPEECH_CACHE[cache_key],
            media_type="audio/mp3",
            headers={"Cache-Control": "public, max-age=86400", "X-Cache": "RAM-HIT"}
        )

    # 1. Check persistent disk cache (zero credit deduction on all subsequent requests & server restarts)
    import hashlib
    from pathlib import Path
    samples_dir = Path("static/voice_previews")
    samples_dir.mkdir(parents=True, exist_ok=True)
    hash_sig = hashlib.md5(f"{voice}:{sample_text}".encode("utf-8")).hexdigest()[:12]
    safe_voice_filename = voice.replace("/", "_").replace("\\", "_")
    disk_file = samples_dir / f"{safe_voice_filename}_{hash_sig}.mp3"

    if disk_file.exists():
        try:
            cached_bytes = disk_file.read_bytes()
            if len(cached_bytes) > 500:
                SAMPLE_SPEECH_CACHE[cache_key] = cached_bytes
                return Response(
                    content=cached_bytes,
                    media_type="audio/mp3",
                    headers={"Cache-Control": "public, max-age=86400", "X-Cache": "DISK-HIT"}
                )
        except Exception as read_err:
            logger.debug(f"[SampleSpeech] Notice reading disk cache: {read_err}")

    # Detect if Sonic (UUID format or explicit cartesia provider)
    is_sonic = (
        payload.provider == "cartesia" or
        ("-" in voice and len(voice) == 36 and not voice.startswith("flux-") and not voice.startswith("aura-"))
    )

    if is_sonic:
        cartesia_key = (os.getenv("CARTESIA_API_KEY", "")).strip()
        if not cartesia_key:
            raise HTTPException(status_code=400, detail="Cartesia Sonic API key is not configured in .env.")

        cartesia_url = "https://api.cartesia.ai/tts/bytes"
        headers = {
            "X-API-Key": cartesia_key,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json"
        }
        body = {
            "model_id": "sonic-3.5",
            "transcript": sample_text,
            "voice": {
                "mode": "id",
                "id": voice
            },
            "output_format": {
                "container": "mp3",
                "sample_rate": 44100,
                "bit_rate": 128000
            }
        }
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = None
                for attempt in range(3):
                    resp = await client.post(cartesia_url, json=body, headers=headers)
                    if resp.status_code == 429:
                        wait_time = 0.6 * (attempt + 1)
                        logger.warning(f"[SampleSpeech] Cartesia 429 concurrency limit hit. Retrying attempt {attempt+1}/3 in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    break

                if not resp or resp.status_code != 200:
                    err_msg = resp.text if resp else "No response"
                    logger.error(f"[SampleSpeech Error] Cartesia Sonic TTS returned {resp.status_code if resp else 'None'}: {err_msg}")
                    raise HTTPException(status_code=resp.status_code if resp else 500, detail=f"Sonic synthesis error: {err_msg}")

                SAMPLE_SPEECH_CACHE[cache_key] = resp.content
                # Save to disk permanently
                try:
                    disk_file.write_bytes(resp.content)
                except Exception as save_err:
                    logger.debug(f"[SampleSpeech] Notice writing disk cache: {save_err}")

                return Response(
                    content=resp.content,
                    media_type="audio/mp3",
                    headers={"Cache-Control": "public, max-age=86400", "X-Cache": "MISS"}
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[SampleSpeech Error] Failed to synthesize Sonic speech: {e}")
            raise HTTPException(status_code=500, detail=f"Sonic TTS synthesis failed: {str(e)}")

    # Default: Conversational Speech Synthesis Preview (Flux / Spoken Engine)
    api_key = (os.getenv("DEEPGRAM_API_KEY", "")).strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Voice synthesis API key is not configured.")

    # Flux voices use /v2/speak, while legacy models use /v1/speak
    endpoint_path = "v2/speak" if "flux" in voice.lower() else "v1/speak"
    deepgram_url = f"https://api.deepgram.com/{endpoint_path}?model={voice}&encoding=mp3"
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json"
    }
    body = {
        "text": sample_text
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(deepgram_url, json=body, headers=headers)
            if resp.status_code != 200:
                logger.error(f"[SampleSpeech Error] Voice TTS returned {resp.status_code}: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Voice synthesis error: {resp.text}")

            SAMPLE_SPEECH_CACHE[cache_key] = resp.content
            return Response(
                content=resp.content,
                media_type="audio/mp3",
                headers={"Cache-Control": "public, max-age=86400", "X-Cache": "MISS"}
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SampleSpeech Error] Failed to synthesize speech: {e}")
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {str(e)}")


@router.get("/active-sessions", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_active_sessions(ctx: TenantContext = Depends(get_tenant_context)):
    """Lists currently active live call sessions for this tenant."""
    sessions = [
        s.model_dump(mode="json")
        for s in active_sessions._sessions.values()
        if s.organization_id == ctx.organization_id or ctx.role == "superadmin"
    ]
    return ApiResponse.ok(sessions)


@router.post("/test-call", response_model=ApiResponse[Dict[str, Any]])
async def initiate_ai_test_call(
    payload: TestAICallRequest,
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Places an outbound phone call via Twilio and immediately connects it to the AI Voice Gateway Media Stream.
    """
    # 1. Organization Credit Authorization Check
    from app.services.credit_service import credit_service
    auth_check = await credit_service.check_call_authorization(ctx.organization_id)
    if not auth_check.get("allowed", True):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED if hasattr(status, "HTTP_402_PAYMENT_REQUIRED") else 402,
            detail=auth_check.get("reason", "Organization has exhausted available call credits. Please top up your subscription minutes.")
        )

    # 2. Strict Backend DNC Enforcement
    from app.services.prospect_service import ProspectService
    from app.repositories.prospect_repository import ProspectRepository
    prospect_repo = ProspectRepository()
    prospect_svc = ProspectService(prospect_repo, call_repo)

    if await prospect_svc.is_dnc_blocked(ctx.organization_id, payload.to_number):
        raise HTTPException(
            status_code=400,
            detail="Call blocked: This recipient is registered on your Do Not Contact (DNC) list."
        )

    # Lookup prospect details if available
    matched_prospect = None
    if payload.prospect_id:
        matched_prospect = await prospect_repo.get_by_id(ctx.organization_id, payload.prospect_id)
    else:
        matched_prospect = await prospect_svc.get_prospect_by_phone(ctx.organization_id, payload.to_number)

    resolved_prospect_id = matched_prospect.id if matched_prospect else payload.prospect_id

    tw_cfg = await twilio_repo.get_by_org(ctx.organization_id)
    if not tw_cfg:
        raise HTTPException(
            status_code=400,
            detail="Twilio is not configured for your organization. Please configure Account SID and Auth Token first."
        )

    auth_token = decrypt_token(tw_cfg.encrypted_auth_token)

    available_numbers = [n.strip() for n in tw_cfg.phone_number.split(",") if n.strip()]
    if not available_numbers:
        raise HTTPException(status_code=400, detail="No configured Twilio phone numbers found.")

    selected_from = (payload.from_number or available_numbers[0]).strip()
    agent_id = payload.agent_id or "agt_receptionist_default"

    # Get agent config or apply override from client
    if payload.agent_config_override:
        try:
            agent_config = AgentConfiguration.model_validate(payload.agent_config_override)
            agent_config.organization_id = ctx.organization_id
            await agent_service.save_agent(ctx, agent_config)
        except Exception as e:
            logger.warning(f"Failed to parse agent_config_override: {e}")
            agent_config = await agent_service.get_agent_by_id(ctx, agent_id)
    else:
        agent_config = await agent_service.get_agent_by_id(ctx, agent_id)

    # Validate Deepgram API Key before initiating call
    import os
    if not os.getenv("DEEPGRAM_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="Voice engine is not configured. Please verify your backend environment settings."
        )

    # Determine public stream URL
    # Prioritize environment variable (e.g. Azure App Service setting or local .env) over DB
    base_url = (os.getenv("PUBLIC_BASE_URL") or (tw_cfg.public_base_url if tw_cfg and tw_cfg.public_base_url else None) or str(request.base_url)).strip().rstrip("/")
    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise HTTPException(
            status_code=400,
            detail="Twilio cannot reach localhost. Please start an ngrok tunnel (e.g. `ngrok http 8000`) and set the HTTPS URL in Twilio Settings -> Public Base URL."
        )

    # Replace http/https with ws/wss
    ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")
    stream_url = f"{ws_base}/api/v1/voice/stream"

    # Pre-create CallSession with full config snapshot
    session = await call_session_service.create_session(
        organization_id=ctx.organization_id,
        agent_id=agent_config.agent_id,
        user_id=ctx.user_id,
        prospect_id=resolved_prospect_id,
        phone_number=selected_from,
        destination_number=payload.to_number,
        direction="outbound",
        agent_name=agent_config.name,
        agent_role=agent_config.role,
        voice=agent_config.voice.voice,
        model=agent_config.llm.model,
        custom_prompt=payload.custom_prompt.strip() if payload.custom_prompt and payload.custom_prompt.strip() else None,
        agent_config_snapshot=agent_config.model_dump(mode="json")
    )

    # Build TwiML containing <Connect><Stream> with immediate hangup on stream completion
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{stream_url}">
            <Parameter name="organization_id" value="{ctx.organization_id}" />
            <Parameter name="agent_id" value="{agent_config.agent_id}" />
            <Parameter name="call_session_id" value="{session.call_session_id}" />
            <Parameter name="direction" value="outbound" />
            <Parameter name="from" value="{selected_from}" />
            <Parameter name="to" value="{payload.to_number}" />
            <Parameter name="user_id" value="{ctx.user_id}" />
        </Stream>
    </Connect>
    <Hangup/>
</Response>"""

    try:
        def _place_call():
            client = Client(tw_cfg.account_sid, auth_token)
            create_kwargs = {
                "to": payload.to_number,
                "from_": selected_from,
                "twiml": twiml,
                "status_callback": f"{base_url.rstrip('/')}/api/v1/twilio/voice/status?organization_id={ctx.organization_id}&call_session_id={session.call_session_id}",
                "status_callback_event": ["initiated", "ringing", "answered", "completed"],
                "status_callback_method": "POST",
            }
            if auth_check.get("is_credit_enforced") and auth_check.get("credit_exhausted_action") == "block":
                rem_sec = int(auth_check.get("remaining_seconds", 14400))
                create_kwargs["time_limit"] = max(1, min(14400, rem_sec))
            return client.calls.create(**create_kwargs)

        routing_check = asyncio.create_task(_routes_to_this_server(base_url))
        tw_call = await asyncio.to_thread(_place_call)
        session.twilio_call_sid = tw_call.sid
        active_sessions.register(session)
        routes_here = await routing_check
        if not routes_here:
            from urllib.parse import urlparse
            _remote_sessions[session.call_session_id] = urlparse(base_url).netloc
            logger.warning(
                f"[VoiceAPI] Twilio is routed to {base_url}, which is NOT this server. Live transcript/stats for call "
                f"{tw_call.sid} will be handled there; this server shows Twilio's call status only. "
                f"Point Public Base URL at this server (tunnel) to get live transcript here."
            )

        return ApiResponse.ok({
            "call_session_id": session.call_session_id,
            "call_sid": tw_call.sid,
            "status": tw_call.status or "initiated",
            "to": payload.to_number,
            "from": selected_from,
            "agent_name": agent_config.name,
            "stream_url": stream_url,
            "routes_to_this_server": routes_here,
            "routed_host": _remote_sessions.get(session.call_session_id),
        })
    except Exception as e:
        logger.error(f"Error placing AI test call: {e}")
        raise HTTPException(status_code=400, detail=f"Twilio call failed: {str(e)}")


@router.get("/session/{call_session_id}/live", response_model=ApiResponse[Dict[str, Any]])
async def get_live_session_state(
    call_session_id: str,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Lightweight in-memory snapshot of a call (phase, duration, transcript, latency).
    The dashboard polls this so its status never depends on catching a one-off websocket event.
    """
    session = active_sessions.get(call_session_id)
    if session:
        if session.organization_id != ctx.organization_id and ctx.role != "superadmin":
            raise HTTPException(status_code=404, detail="Call session not found.")
        remote_host = _remote_sessions.get(call_session_id)
        if remote_host and not session.connected_at and session.twilio_call_sid:
            # The stream/webhooks land on another deployment: Twilio itself is the source of truth.
            tw = await _twilio_call_status(session.organization_id, session.twilio_call_sid)
            tw_status = (tw[0] if tw else "") or ""
            tw_start, tw_duration = (tw[1], tw[2]) if tw else (None, 0)
            if tw_status in ("completed", "busy", "no-answer", "failed", "canceled"):
                _remote_sessions.pop(call_session_id, None)
                active_sessions.remove(call_session_id)  # the call record is saved by the instance that handled it
                return ApiResponse.ok({"phase": "ended", "status": tw_status, "duration": tw_duration,
                                       "turn_count": 0, "messages": [], "latency": {}, "remote": True, "remote_host": remote_host})
            if tw_status == "in-progress":
                dur = 0
                if tw_start:
                    try:
                        dur = max(0, int((datetime.now(timezone.utc) - datetime.fromisoformat(tw_start)).total_seconds()))
                    except Exception:
                        dur = 0
                return ApiResponse.ok({"phase": "connected", "status": tw_status, "duration": dur, "turn_count": 0,
                                       "messages": [], "latency": {}, "remote": True, "remote_host": remote_host})
            return ApiResponse.ok({"phase": "ringing" if tw_status == "ringing" else "dialing", "status": tw_status or "initiated",
                                   "duration": 0, "turn_count": 0, "messages": [], "latency": {}, "remote": True, "remote_host": remote_host})
        now = datetime.now(timezone.utc)
        if session.connected_at:
            phase = "connected"
        elif session.status == "ringing":
            phase = "ringing"
        else:
            phase = "dialing"
        return ApiResponse.ok({
            "phase": phase,
            "status": session.status,
            "duration": int((now - session.connected_at).total_seconds()) if session.connected_at else 0,
            "turn_count": session.turn_count,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "stt_latency_ms": m.stt_latency_ms,
                    "llm_latency_ms": m.llm_latency_ms,
                    "tts_latency_ms": m.tts_latency_ms,
                    "turn_latency_ms": m.turn_latency_ms,
                }
                for m in session.messages
            ],
            "latency": session.latest_latency.model_dump(mode="json") if hasattr(session.latest_latency, "model_dump") else {},
        })

    call = await call_repo.get_by_id(call_session_id)
    if call and call.organization_id == ctx.organization_id:
        return ApiResponse.ok({"phase": "ended", "status": call.status, "duration": call.duration or 0,
                               "turn_count": 0, "messages": [], "latency": {}})
    return ApiResponse.ok({"phase": "unknown"})


@router.post("/hangup", response_model=ApiResponse[Dict[str, Any]])
async def hangup_call(
    payload: HangupCallRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Immediately terminates an active Twilio phone call and releases all streaming resources to prevent ongoing charges.
    """
    tw_cfg = await twilio_repo.get_by_org(ctx.organization_id)
    target_call_sid = payload.call_sid
    session: Optional[CallSession] = None

    if payload.call_session_id:
        session = active_sessions.get(payload.call_session_id)
        if session and session.twilio_call_sid:
            target_call_sid = session.twilio_call_sid

    if not target_call_sid and session:
        target_call_sid = session.twilio_call_sid

    # Terminate the call in Twilio
    if tw_cfg and target_call_sid:
        try:
            auth_token = decrypt_token(tw_cfg.encrypted_auth_token)
            client = Client(tw_cfg.account_sid, auth_token)
            await asyncio.to_thread(
                client.calls(target_call_sid).update,
                status="completed"
            )
            logger.info(f"[VoiceAPI] Terminated Twilio Call SID: {target_call_sid}")
        except Exception as e:
            logger.warning(f"[VoiceAPI] Error terminating Twilio call: {e}")

    # Finalize the session if active
    if session:
        if _remote_sessions.pop(session.call_session_id, None) and not session.connected_at:
            # The call is handled by another deployment which saves the record; just release the local live state.
            await call_session_service.release_live_session(session, "completed")
        else:
            await call_session_service.finalize_session(session, final_status="completed")

    return ApiResponse.ok({
        "message": "Call successfully hung up and all streaming resources released.",
        "call_session_id": payload.call_session_id,
        "call_sid": target_call_sid
    })
