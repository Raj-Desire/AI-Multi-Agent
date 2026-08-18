from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.twilio import SaveTwilioConfigRequest, TwilioConfigResponse
from app.schemas.common import ApiResponse
from app.services.twilio_service import TwilioService
from app.services.call_service import CallService
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.call_repository import CallRepository

router = APIRouter(prefix="/twilio", tags=["Twilio"])

twilio_repo = TwilioRepository()
twilio_service = TwilioService(twilio_repo)
call_repo = CallRepository()
call_service = CallService(twilio_repo, call_repo)

def get_twilio_service() -> TwilioService:
    return twilio_service

@router.get("/configuration", response_model=ApiResponse[Optional[TwilioConfigResponse]])
async def get_configuration(
    organization_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    target_org_id = ctx.organization_id
    if organization_id and ctx.role == "superadmin":
        target_org_id = organization_id

    effective_ctx = TenantContext(
        organization_id=target_org_id,
        user_id=ctx.user_id,
        email=ctx.email,
        role=ctx.role,
        org_name=ctx.org_name
    )
    cfg = await service.get_config(effective_ctx)
    return ApiResponse.ok(cfg)

@router.post("/configuration", response_model=ApiResponse[TwilioConfigResponse])
async def save_configuration(
    payload: SaveTwilioConfigRequest,
    organization_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    # Security Rule: Only Admins and Superadmins can modify Twilio settings
    if ctx.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Organization Administrators or Superadmins can update Twilio configuration."
        )

    target_org_id = ctx.organization_id
    if organization_id and ctx.role == "superadmin":
        target_org_id = organization_id

    effective_ctx = TenantContext(
        organization_id=target_org_id,
        user_id=ctx.user_id,
        email=ctx.email,
        role=ctx.role,
        org_name=ctx.org_name
    )
    cfg = await service.save_config(effective_ctx, payload)
    return ApiResponse.ok(cfg)

@router.post("/test-connection", response_model=ApiResponse[dict])
async def test_connection(
    organization_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    target_org_id = ctx.organization_id
    if organization_id and ctx.role == "superadmin":
        target_org_id = organization_id

    effective_ctx = TenantContext(
        organization_id=target_org_id,
        user_id=ctx.user_id,
        email=ctx.email,
        role=ctx.role,
        org_name=ctx.org_name
    )
    res = await service.test_connection(effective_ctx)
    return ApiResponse.ok(res)

class FetchNumbersRequest(BaseModel):
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None

@router.post("/fetch-numbers", response_model=ApiResponse[list[str]])
async def fetch_purchased_numbers(
    payload: Optional[FetchNumbersRequest] = None,
    organization_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    if ctx.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Organization Administrators or Superadmins can fetch Twilio account numbers."
        )

    target_org_id = ctx.organization_id
    if organization_id and ctx.role == "superadmin":
        target_org_id = organization_id

    effective_ctx = TenantContext(
        organization_id=target_org_id,
        user_id=ctx.user_id,
        email=ctx.email,
        role=ctx.role,
        org_name=ctx.org_name
    )
    try:
        acc_sid = payload.account_sid if payload else None
        tok = payload.auth_token if payload else None
        numbers = await service.fetch_account_phone_numbers(effective_ctx, account_sid=acc_sid, auth_token=tok)
        return ApiResponse.ok(numbers)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.api_route("/voice/twiml", methods=["GET", "POST"])
async def voice_twiml_webhook(request: Request):
    """
    Public webhook endpoint invoked by Twilio when an in-browser WebRTC call connects.
    Returns TwiML instructions directing Twilio to dial the destination phone number.
    """
    # Accept params from either form body or query params
    form_data = {}
    if request.method == "POST":
        try:
            form_data = await request.form()
        except Exception:
            form_data = {}

    to = form_data.get("To") or form_data.get("to") or request.query_params.get("To") or request.query_params.get("to")
    user_id = form_data.get("userId") or form_data.get("user_id") or request.query_params.get("userId") or request.query_params.get("user_id")
    caller_id = form_data.get("callerId") or form_data.get("caller_id") or request.query_params.get("callerId")
    from_caller = form_data.get("From") or form_data.get("from") or request.query_params.get("From")
    called_number = form_data.get("Called") or form_data.get("called") or to
    call_sid = form_data.get("CallSid") or form_data.get("call_sid") or request.query_params.get("CallSid") or request.query_params.get("call_sid")
    agent_id = form_data.get("agent_id") or form_data.get("agentId") or request.query_params.get("agent_id") or request.query_params.get("agentId")

    try:
        twiml_xml = await call_service.build_twiml_response(
            to=to,
            caller_id_override=caller_id,
            user_id=user_id,
            from_caller=from_caller,
            called_number=called_number,
            call_sid=call_sid,
            agent_id=agent_id
        )
        return Response(content=twiml_xml, media_type="application/xml")
    except Exception as e:
        print(f"[Twilio Voice TwiML Error] {e}")
        fallback_xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred generating call instructions.</Say><Hangup/></Response>'
        return Response(content=fallback_xml, media_type="application/xml")
