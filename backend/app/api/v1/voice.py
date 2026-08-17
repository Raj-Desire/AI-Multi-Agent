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


class HangupCallRequest(BaseModel):
    call_session_id: Optional[str] = None
    call_sid: Optional[str] = None


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

    # Get agent config
    agent_config = await agent_service.get_agent_by_id(ctx, agent_id)

    # Validate Deepgram API Key before initiating call
    import os
    if not os.getenv("DEEPGRAM_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="Deepgram API key is not configured. Please add DEEPGRAM_API_KEY to your backend/.env file."
        )

    # Determine public stream URL
    base_url = (tw_cfg.public_base_url or str(request.base_url)).strip().rstrip("/")
    if not tw_cfg.public_base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise HTTPException(
            status_code=400,
            detail="Twilio cannot reach localhost. Please start an ngrok tunnel (e.g. `ngrok http 8000`) and set the HTTPS URL in Twilio Settings -> Public Base URL."
        )

    # Replace http/https with ws/wss
    ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")
    stream_url = f"{ws_base}/api/v1/voice/stream"

    # Pre-create CallSession
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
        custom_prompt=payload.custom_prompt.strip() if payload.custom_prompt and payload.custom_prompt.strip() else None
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
