import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.v1.twilio import process_call_status
from app.core.webhook_security import create_stream_token, require_plivo_signature
from app.models.call import Call
from app.repositories.call_repository import CallRepository
from app.services.call_service import normalize_phone_number
from app.telephony.plivo_provider import PlivoProvider
from app.voice.call_end_classifier import MACHINE_CALLS
from app.voice.session import active_sessions

from app.core.dependencies import TenantContext, get_tenant_context
from app.repositories.plivo_repository import PlivoRepository
from app.schemas.common import ApiResponse
from app.schemas.plivo import (
    FetchPlivoNumbersRequest,
    PlivoBalanceResponse,
    PlivoConfigResponse,
    SavePlivoConfigRequest,
)
from app.services.plivo_service import PlivoService

router = APIRouter(prefix="/plivo", tags=["Telephony"])

plivo_repo = PlivoRepository()
plivo_service = PlivoService(plivo_repo)


def get_plivo_service() -> PlivoService:
    return plivo_service


def _require_admin(ctx: TenantContext) -> None:
    if ctx.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Forbidden: Only Organization Administrators or Superadmins can change telephony settings.")


@router.get("", response_model=ApiResponse[Optional[PlivoConfigResponse]])
@router.get("/configuration", response_model=ApiResponse[Optional[PlivoConfigResponse]])
async def get_configuration(ctx: TenantContext = Depends(get_tenant_context), service: PlivoService = Depends(get_plivo_service)):
    return ApiResponse.ok(await service.get_config(ctx))


@router.post("/configuration", response_model=ApiResponse[PlivoConfigResponse])
async def save_configuration(
    payload: SavePlivoConfigRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: PlivoService = Depends(get_plivo_service),
):
    _require_admin(ctx)
    try:
        return ApiResponse.ok(await service.save_config(ctx, payload))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/test-connection", response_model=ApiResponse[dict])
async def test_connection(ctx: TenantContext = Depends(get_tenant_context), service: PlivoService = Depends(get_plivo_service)):
    return ApiResponse.ok(await service.test_connection(ctx))


@router.post("/fetch-numbers", response_model=ApiResponse[list[str]])
async def fetch_numbers(
    payload: Optional[FetchPlivoNumbersRequest] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: PlivoService = Depends(get_plivo_service),
):
    _require_admin(ctx)
    try:
        return ApiResponse.ok(await service.fetch_account_phone_numbers(
            ctx, auth_id=payload.auth_id if payload else None, auth_token=payload.auth_token if payload else None))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/balance", response_model=ApiResponse[PlivoBalanceResponse])
async def get_balance(ctx: TenantContext = Depends(get_tenant_context), service: PlivoService = Depends(get_plivo_service)):
    return ApiResponse.ok(await service.get_balance(ctx))


# ----------------------------------------------------------------------------------------------------------------
# Voice webhooks (called by Plivo; every request is verified with the tenant's Auth Token, see PLIVO_WEBHOOK_VERIFY)
# ----------------------------------------------------------------------------------------------------------------

_STREAM_PARAM_KEYS = ("stream_token", "organization_id", "agent_id", "direction", "call_session_id", "from", "to", "user_id", "prospect_id", "campaign_id")
_call_repo = CallRepository()


def _xml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


def _hangup_xml(message: Optional[str] = None) -> Response:
    speak = f"<Speak>{escape(message)}</Speak>" if message else ""
    return _xml(f'<?xml version="1.0" encoding="UTF-8"?><Response>{speak}<Hangup/></Response>')


async def _params(request: Request) -> dict:
    """Form fields (Plivo POSTs) overlaid on the query string."""
    merged = dict(request.query_params)
    if request.method == "POST":
        try:
            form = await request.form()
            merged.update({k: v for k, v in form.items() if isinstance(v, str)})
        except Exception:
            pass
    return merged


def map_hangup_status(cause: str, call_status: str = "") -> str:
    """Plivo hangup cause -> the platform's call status vocabulary."""
    c = (cause or "").lower()
    if "busy" in c:
        return "busy"
    if "cancel" in c:
        return "canceled"
    if "no answer" in c or "no_answer" in c or "timeout" in c or "no user response" in c:
        return "no-answer"
    if (call_status or "").lower() == "failed" or any(w in c for w in ("unallocated", "invalid", "reject", "unavailable", "unreachable", "failure", "forbidden", "congestion")):
        return "failed"
    return "completed"


def _int(value) -> int:
    return int(value) if str(value or "").isdigit() else 0


def _ws_base(cfg) -> str:
    base = (os.getenv("PUBLIC_BASE_URL") or (getattr(cfg, "public_base_url", None) or "")).strip().rstrip("/")
    return (base.replace("http://", "ws://").replace("https://", "wss://") if base else "wss://localhost:8000") + "/api/v1" + PlivoProvider.stream_path


async def _rekey_call(request_uuid: str, call_uuid: str, call_session_id: str) -> None:
    """Plivo gives the real call id (CallUUID) only when the call is answered; until then the platform knows the call
    by the request id returned from the dial API. Re-key the stored call and live session to the CallUUID so the
    stream, hangup webhook and REST actions all find it."""
    if not call_uuid or not request_uuid or call_uuid == request_uuid:
        return
    try:
        call = await _call_repo.get_by_call_sid(request_uuid)
        if call:
            call.call_sid = call_uuid
            await _call_repo.save(call)
    except Exception as e:
        print(f"[Plivo Answer] could not re-key stored call {request_uuid}: {e}")
    session = active_sessions.get(call_session_id or "") or active_sessions.get_by_call_sid(request_uuid)
    if session:
        session.twilio_call_sid = call_uuid
        active_sessions.register(session)


@router.api_route("/voice/answer", methods=["GET", "POST"], dependencies=[Depends(require_plivo_signature)])
async def voice_answer(request: Request):
    """Plivo asks what to do with a call: answered outbound calls and inbound calls to one of our numbers."""
    p = await _params(request)
    org_from_url = request.query_params.get("organization_id")
    call_uuid = p.get("CallUUID") or ""

    if org_from_url and request.query_params.get("direction") == "outbound":
        cfg = await PlivoRepository().get_by_org(org_from_url)
        stream_params = {k: request.query_params[k] for k in _STREAM_PARAM_KEYS if request.query_params.get(k) is not None}
        await _rekey_call(p.get("RequestUUID") or "", call_uuid, request.query_params.get("call_session_id") or "")
        return _xml(PlivoProvider.build_answer_xml(_ws_base(cfg), stream_params))

    # Inbound: the owner of the number called decides the agent and forwarding
    called = p.get("To") or ""
    cfg = await PlivoRepository().get_by_phone_number(called)
    if not cfg:
        return _hangup_xml("Thank you for calling. This number is not available.")

    called_digits = "".join(c for c in called if c.isdigit())
    mode = cfg.inbound_forward_mode or "global"
    if mode == "disabled":
        return _hangup_xml("Thank you for calling. Inbound calling is currently disabled.")
    forward = None
    if mode == "per_number":
        forward = next((v for k, v in (cfg.inbound_forward_mapping or {}).items() if "".join(c for c in k if c.isdigit()) == called_digits), None) or cfg.inbound_forward_global_number
    elif mode == "global":
        forward = cfg.inbound_forward_global_number
    if forward:
        dest = normalize_phone_number(forward)
        caller = normalize_phone_number(p.get("From")) or normalize_phone_number(called)
        return _xml(PlivoProvider.build_transfer_xml(dest, caller, None, 30, None))

    agent_id = next((v for k, v in (cfg.inbound_agent_mapping or {}).items() if "".join(c for c in k if c.isdigit()) == called_digits), None) \
        or cfg.default_agent_id or "agt_receptionist_default"
    from_number = normalize_phone_number(p.get("From")) or ""
    to_number = normalize_phone_number(called) or ""
    if call_uuid and not await _call_repo.get_by_call_sid(call_uuid):
        now = datetime.now(timezone.utc)
        await _call_repo.save(Call(
            id=f"cal_{uuid.uuid4().hex[:12]}", organization_id=cfg.organization_id, user_id="system", twilio_configuration_id=cfg.id,
            call_sid=call_uuid, provider="plivo", from_number=from_number, to_number=to_number, status="in-progress", agent_id=agent_id,
            prompt="Inbound call", created_at=now, updated_at=now,
        ))
    stream_params = {
        "stream_token": create_stream_token(cfg.organization_id, agent_id, "inbound"),
        "organization_id": cfg.organization_id, "agent_id": agent_id, "direction": "inbound", "from": from_number, "to": to_number,
    }
    return _xml(PlivoProvider.build_answer_xml(_ws_base(cfg), stream_params))


@router.api_route("/voice/ring", methods=["GET", "POST"], dependencies=[Depends(require_plivo_signature)])
async def voice_ring(request: Request):
    p = await _params(request)
    sid = p.get("CallUUID") or p.get("RequestUUID")
    if sid:
        await process_call_status(sid, "ringing", 0, p.get("campaign_id"), p.get("prospect_id"), p.get("organization_id"), p.get("call_session_id") or "")
    return Response(status_code=200)


@router.api_route("/voice/hangup", methods=["GET", "POST"], dependencies=[Depends(require_plivo_signature)])
async def voice_hangup(request: Request):
    p = await _params(request)
    call_uuid, request_uuid = p.get("CallUUID") or "", p.get("RequestUUID") or ""
    sid = call_uuid or request_uuid
    if not sid:
        return Response(status_code=200)
    # The call may still be stored under the request id (it never got answered, so it was never re-keyed)
    if call_uuid and request_uuid and not await _call_repo.get_by_call_sid(call_uuid) and await _call_repo.get_by_call_sid(request_uuid):
        sid = request_uuid
    status = map_hangup_status(p.get("HangupCauseName") or "", p.get("CallStatus") or "")
    duration = (_int(p.get("BillDuration")) or _int(p.get("Duration"))) if status == "completed" else 0
    await process_call_status(sid, status, duration, p.get("campaign_id"), p.get("prospect_id"), p.get("organization_id"), p.get("call_session_id") or "")
    return Response(status_code=200)


@router.api_route("/voice/amd", methods=["GET", "POST"], dependencies=[Depends(require_plivo_signature)])
async def voice_machine_detection(request: Request):
    p = await _params(request)
    if (p.get("Machine") or "").lower() == "true" and p.get("CallUUID"):
        MACHINE_CALLS[p["CallUUID"]] = "machine_start"
    return Response(status_code=200)


@router.api_route("/voice/transfer", methods=["GET", "POST"])
async def voice_transfer(request: Request):
    """XML that moves a live call to a human number. It only returns instructions to Plivo for the number given."""
    p = await _params(request)
    to = (p.get("to") or "").strip()
    if not to:
        return _hangup_xml()
    return _xml(PlivoProvider.build_transfer_xml(to, p.get("caller_id"), p.get("whisper"), _int(p.get("timeout")) or 25, p.get("fallback")))
