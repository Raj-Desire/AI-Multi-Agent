"""
Voice API and Telemetry Stream Endpoints
Provides real-time developer telemetry WebSocket stream, active session monitoring, and test call initiation.
"""

import asyncio
import json
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request

from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.voice.session import CallSession, active_sessions
from app.voice.events import telemetry_broadcaster
from app.agents.configuration import AgentConfiguration
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


class HangupCallRequest(BaseModel):
    call_session_id: Optional[str] = None
    call_sid: Optional[str] = None


from app.voice.audio import AudioAdapter
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.agents.runtime import AgentRuntimeBuilder
import time

@router.websocket("/telemetry/{call_session_id}")
async def telemetry_websocket(websocket: WebSocket, call_session_id: str):
    """
    Real-time WebSocket stream for developer debugging and live conversation telemetry.
    """
    await websocket.accept()
    q = await telemetry_broadcaster.subscribe(call_session_id)

    try:
        while True:
            # Check for disconnect or messages from client
            event_data = await q.get()
            await websocket.send_json(event_data)
    except WebSocketDisconnect:
        logger.info(f"Telemetry client disconnected for session {call_session_id}")
    except Exception as e:
        logger.error(f"Telemetry stream error: {e}")
    finally:
        await telemetry_broadcaster.unsubscribe(call_session_id, q)


@router.websocket("/preview-stream")
async def browser_preview_stream_websocket(websocket: WebSocket):
    """
    Direct in-browser live voice preview stream (like Deepgram Playground).
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
    last_agent_speech_done_time: float = time.time()
    is_agent_speaking: bool = False
    is_user_speaking: bool = False
    has_reprompted_silence: bool = False
    is_concluding_call: bool = False
    call_ended_event: asyncio.Event = asyncio.Event()
    lifecycle_task: Optional[asyncio.Task] = None

    async def handle_dg_audio(raw_audio: bytes):
        """Send synthesized audio back to browser client (mulaw encoded in JSON or raw)."""
        nonlocal is_agent_speaking, last_agent_speech_done_time
        try:
            # 8000 bytes of mu-law @ 8000Hz = 1.0 second of audio
            audio_duration = len(raw_audio) / 8000.0
            now = time.time()
            if last_agent_speech_done_time < now:
                last_agent_speech_done_time = now + audio_duration
            else:
                last_agent_speech_done_time += audio_duration
            is_agent_speaking = True

            import base64
            payload = base64.b64encode(raw_audio).decode("utf-8")
            await websocket.send_json({
                "type": "audio",
                "payload": payload
            })
        except Exception as e:
            logger.error(f"[VoicePreview] Error sending audio to browser: {e}")

    async def handle_dg_event(event_type: str, data: dict):
        try:
            await websocket.send_json({
                "type": "event",
                "event_type": event_type,
                "data": data
            })
        except Exception:
            pass

    async def handle_dg_transcript(role: str, content: str):
        nonlocal turn_start_time, last_user_speech_time, is_user_speaking, is_agent_speaking, has_reprompted_silence
        now = time.perf_counter()
        turn_latency = round((now - turn_start_time) * 1000.0, 2)
        if role == "user":
            turn_start_time = now
            last_user_speech_time = time.time()
            is_user_speaking = False
            has_reprompted_silence = False
        else:
            is_agent_speaking = True
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
        nonlocal is_user_speaking, is_agent_speaking, last_user_speech_time, has_reprompted_silence
        is_user_speaking = True
        is_agent_speaking = False
        last_user_speech_time = time.time()
        has_reprompted_silence = False
        try:
            await websocket.send_json({
                "type": "clear"
            })
        except Exception:
            pass

    async def handle_dg_agent_speaking(data: dict):
        nonlocal is_agent_speaking, is_user_speaking
        is_agent_speaking = True
        is_user_speaking = False

    async def handle_dg_agent_audio_done():
        nonlocal is_agent_speaking, is_concluding_call
        if is_concluding_call:
            logger.info("[VoicePreview] Conclusion audio finished playing. Concluding session.")
            asyncio.create_task(terminate_preview_session())

    async def terminate_preview_session():
        nonlocal call_ended_event
        call_ended_event.set()
        await asyncio.sleep(1.2)
        try:
            await websocket.send_json({
                "type": "call_concluded",
                "reason": "completed"
            })
        except Exception:
            pass

    async def preview_lifecycle_monitor():
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
                    if is_user_speaking:
                        continue

                    logger.info(f"[VoicePreview] Maximum duration ({max_duration}s) reached. Speaking conclusion message.")
                    is_concluding_call = True
                    await deepgram_client.inject_agent_message(conclusion_msg)
                    asyncio.create_task(asyncio.sleep(4.5)).add_done_callback(lambda _: asyncio.create_task(terminate_preview_session()))
                    break

                # 2. Silence Timeout Check (Starts ONLY after agent audio finishes playing)
                if not is_concluding_call and not is_user_speaking:
                    last_activity = max(last_user_speech_time, last_agent_speech_done_time)
                    silence_elapsed = now - last_activity

                    # Phase 1: Reprompt
                    if silence_elapsed >= silence_timeout and not has_reprompted_silence:
                        logger.info(f"[VoicePreview] Silence timeout ({silence_timeout}s) reached. Injecting reprompt: '{reprompt_msg}'")
                        has_reprompted_silence = True
                        last_agent_speech_done_time = now + 2.5
                        await deepgram_client.inject_agent_message(reprompt_msg)

                    # Phase 2: Post-reprompt silence conclusion
                    elif has_reprompted_silence and silence_elapsed >= (silence_timeout + hangup_delay):
                        logger.info(f"[VoicePreview] Post-reprompt silence limit ({hangup_delay}s) reached. Speaking conclusion.")
                        is_concluding_call = True
                        await deepgram_client.inject_agent_message(conclusion_msg)
                        asyncio.create_task(asyncio.sleep(4.5)).add_done_callback(lambda _: asyncio.create_task(terminate_preview_session()))
                        break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[VoicePreview] Error in preview_lifecycle_monitor: {e}")

    try:
        while True:
            msg = await websocket.receive_text()
            if not msg:
                continue

            try:
                data = json.loads(msg)
            except Exception:
                continue

            msg_type = data.get("type")

            # 1. Initialize session with agent config parameters
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

                deepgram_settings = AgentRuntimeBuilder.build_deepgram_settings(agent_config)

                if lifecycle_task:
                    lifecycle_task.cancel()
                    lifecycle_task = None

                if deepgram_client:
                    await deepgram_client.close()

                # Reset state
                call_start_time = time.time()
                last_user_speech_time = time.time()
                last_agent_speech_done_time = time.time()
                is_concluding_call = False
                has_reprompted_silence = False
                call_ended_event.clear()

                deepgram_client = DeepgramVoiceAgentClient(
                    on_audio=handle_dg_audio,
                    on_event=handle_dg_event,
                    on_transcript=handle_dg_transcript,
                    on_user_speaking=handle_dg_user_speaking,
                    on_agent_speaking=handle_dg_agent_speaking,
                    on_agent_audio_done=handle_dg_agent_audio_done
                )

                try:
                    await deepgram_client.connect_and_configure(
                        settings=deepgram_settings,
                        greeting=greeting or agent_config.greeting
                    )
                    await websocket.send_json({
                        "type": "ready",
                        "agent_name": agent_config.name,
                        "voice": agent_config.voice.voice,
                        "model": agent_config.llm.model
                    })
                    logger.info("[VoicePreview] Deepgram agent connected and configured for in-browser preview.")
                    lifecycle_task = asyncio.create_task(preview_lifecycle_monitor())
                except Exception as dg_err:
                    logger.error(f"[VoicePreview] Failed to configure Deepgram: {dg_err}")
                    await websocket.send_json({
                        "type": "error",
                        "message": str(dg_err)
                    })

            # 2. Receive live microphone audio chunk from browser
            elif msg_type == "audio":
                audio_payload = data.get("payload")
                if audio_payload and deepgram_client and deepgram_client.is_ready:
                    import base64
                    try:
                        raw_bytes = base64.b64decode(audio_payload)
                        format_type = data.get("format", "pcm16")
                        if format_type == "pcm16":
                            mulaw_bytes = AudioAdapter.pcm16_to_mulaw(raw_bytes)
                            await deepgram_client.send_audio(mulaw_bytes)
                        else:
                            await deepgram_client.send_audio(raw_bytes)
                    except Exception as e:
                        logger.error(f"[VoicePreview] Error processing audio payload: {e}")

            # 3. Dynamic Prompt / Parameter update while speaking
            elif msg_type == "update_prompt":
                new_prompt = data.get("prompt")
                if new_prompt and deepgram_client and deepgram_client.is_ready:
                    await deepgram_client.update_prompt(new_prompt)

            # 4. Inject specific speech text
            elif msg_type == "inject_text":
                text = data.get("text")
                if text and deepgram_client and deepgram_client.is_ready:
                    await deepgram_client.inject_agent_message(text)

            # 5. Stop preview session
            elif msg_type == "stop":
                call_ended_event.set()
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
        if lifecycle_task:
            lifecycle_task.cancel()
            lifecycle_task = None
        if deepgram_client:
            await deepgram_client.close()


class SampleSpeechRequest(BaseModel):
    voice: str = "aura-orion-en"
    text: Optional[str] = None
    speed: Optional[float] = 0.95


@router.post("/sample-speech")
async def generate_sample_speech(payload: SampleSpeechRequest):
    """
    Synthesizes a sample audio snippet using Neural Text-to-Speech (native Gujarati, Hindi, English, Spanish).
    Returns audio/mp3 or audio/wav for instant in-browser playback.
    """
    import os
    import httpx
    from fastapi.responses import Response

    sample_text = payload.text
    if not sample_text or not sample_text.strip():
        sample_text = "Hello! I am your Desire AI Voice Agent. How can I help you today?"

    sample_text = sample_text.strip()
    voice = payload.voice or "aura-orion-en"

    # Check if voice is a Native Neural Voice (Gujarati, Hindi, Spanish, etc.) or contains Indic characters
    is_neural_voice = "Neural" in voice or voice.startswith("gu-") or voice.startswith("hi-") or voice.startswith("es-")
    has_indic_text = any(ord(c) >= 0x0900 and ord(c) <= 0x0D7F for c in sample_text)

    if is_neural_voice or has_indic_text:
        try:
            import edge_tts
            target_voice = voice
            if not is_neural_voice:
                # Pick appropriate native voice based on text script
                if any(ord(c) >= 0x0A80 and ord(c) <= 0x0AFF for c in sample_text):
                    target_voice = "gu-IN-DhwaniNeural"
                else:
                    target_voice = "hi-IN-SwaraNeural"

            communicate = edge_tts.Communicate(sample_text, target_voice)
            audio_data = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.extend(chunk["data"])

            return Response(content=bytes(audio_data), media_type="audio/mp3")
        except Exception as e:
            logger.error(f"[SampleSpeech Error] Native Neural TTS error: {e}")
            # Fall through to Deepgram if error occurs

    # Fallback to Deepgram Aura REST TTS
    api_key = (os.getenv("DEEPGRAM_API_KEY", "")).strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="TTS service configuration error.")

    deepgram_url = f"https://api.deepgram.com/v1/speak?model={voice}&container=wav&encoding=linear16"
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json"
    }
    body = {"text": sample_text}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(deepgram_url, json=body, headers=headers)
            if resp.status_code != 200:
                logger.error(f"[SampleSpeech Error] Deepgram TTS returned {resp.status_code}: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Deepgram TTS error: {resp.text}")

            return Response(content=resp.content, media_type="audio/wav")
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
            detail="Deepgram API key is not configured. Please add DEEPGRAM_API_KEY to your backend/.env file."
        )

    # Determine public stream URL
    base_url = (os.getenv("PUBLIC_BASE_URL") or tw_cfg.public_base_url or str(request.base_url)).strip().rstrip("/")
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

    # Build TwiML containing <Connect><Stream> with fallback
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
    <Pause length="2"/>
    <Say voice="Google.en-US-Neural2-F">The AI Voice connection has closed. Goodbye.</Say>
    <Hangup/>
</Response>"""

    try:
        def _place_call():
            client = Client(tw_cfg.account_sid, auth_token)
            return client.calls.create(
                to=payload.to_number,
                from_=selected_from,
                twiml=twiml
            )

        tw_call = await asyncio.to_thread(_place_call)
        session.twilio_call_sid = tw_call.sid
        active_sessions.register(session)

        return ApiResponse.ok({
            "call_session_id": session.call_session_id,
            "call_sid": tw_call.sid,
            "status": tw_call.status or "initiated",
            "to": payload.to_number,
            "from": selected_from,
            "agent_name": agent_config.name,
            "stream_url": stream_url
        })
    except Exception as e:
        logger.error(f"Error placing AI test call: {e}")
        raise HTTPException(status_code=400, detail=f"Twilio call failed: {str(e)}")


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
        await call_session_service.finalize_session(session, final_status="completed")

    return ApiResponse.ok({
        "message": "Call successfully hung up and all streaming resources released.",
        "call_session_id": payload.call_session_id,
        "call_sid": target_call_sid
    })
