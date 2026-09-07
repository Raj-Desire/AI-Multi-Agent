from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.twilio import SaveTwilioConfigRequest, TwilioConfigResponse, AutoSetupTwilioRequest, AutoSetupResponse, TwilioBalanceResponse
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

@router.get("", response_model=ApiResponse[Optional[TwilioConfigResponse]])
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

@router.post("/auto-setup", response_model=ApiResponse[AutoSetupResponse])
async def auto_setup_twilio(
    payload: AutoSetupTwilioRequest,
    organization_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    if ctx.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Organization Administrators or Superadmins can auto-configure Twilio settings."
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
        res = await service.auto_setup(
            ctx=effective_ctx,
            account_sid=payload.account_sid,
            auth_token=payload.auth_token,
            friendly_name=payload.friendly_name or "Desire AI Calling Platform"
        )
        return ApiResponse.ok(res)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/balance", response_model=ApiResponse[TwilioBalanceResponse])
async def get_twilio_balance(
    organization_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    if ctx.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Organization Administrators or Superadmins can view Twilio account balance."
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
    res = await service.get_balance(effective_ctx)
    return ApiResponse.ok(res)



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


@router.api_route("/voice/status", methods=["GET", "POST"])
async def voice_status_webhook(request: Request):
    """
    Public webhook endpoint invoked by Twilio on call status transitions
    (initiated, ringing, answered, in-progress, completed, busy, no-answer, failed, canceled).
    Synchronizes real-time call states across Call, Prospect, and Campaign entities.
    """
    form_data = {}
    if request.method == "POST":
        try:
            form_data = await request.form()
        except Exception:
            form_data = {}

    call_sid = form_data.get("CallSid") or request.query_params.get("CallSid")
    call_status = (form_data.get("CallStatus") or request.query_params.get("CallStatus") or "").lower().strip()
    call_duration_str = form_data.get("CallDuration") or request.query_params.get("CallDuration") or "0"
    call_duration = int(call_duration_str) if str(call_duration_str).isdigit() else 0

    campaign_id = request.query_params.get("campaign_id") or form_data.get("campaign_id")
    prospect_id = request.query_params.get("prospect_id") or form_data.get("prospect_id")
    org_id = request.query_params.get("organization_id") or form_data.get("organization_id")

    if not call_sid:
        return Response(content="<Response/>", media_type="application/xml")

    try:
        # Find Call record by call_sid
        existing_call = await call_repo.get_by_call_sid(call_sid)
        if not existing_call:
            # Try memory search or cross-partition lookup
            existing_call = await call_repo.get_by_id("global", call_sid)

        target_campaign_id = campaign_id or (existing_call.campaign_id if existing_call else None)
        target_prospect_id = prospect_id or (existing_call.prospect_id if existing_call else None)
        target_org_id = org_id or (existing_call.organization_id if existing_call else "global")

        # Distinguish Non-Terminal (initiated, ringing, in-progress) vs Terminal (completed, busy, no-answer, failed, canceled)
        INTERMEDIATE_STATUSES = {"queued", "initiated", "ringing", "in-progress", "answered"}
        TERMINAL_STATUSES = {"completed", "busy", "no-answer", "no_answer", "failed", "canceled"}

        if existing_call:
            existing_call.status = call_status
            if call_duration > 0:
                existing_call.duration = call_duration
            if target_campaign_id and not existing_call.campaign_id:
                existing_call.campaign_id = target_campaign_id
            if target_prospect_id and not existing_call.prospect_id:
                existing_call.prospect_id = target_prospect_id

        if call_status in INTERMEDIATE_STATUSES:
            if existing_call:
                if call_status in ["in-progress", "answered"]:
                    existing_call.outcome = "connected"
                await call_repo.save(existing_call)

            # Ensure Campaign Member status is marked as CALLING during active ringing/progress
            if target_campaign_id and target_prospect_id:
                from app.models.campaign import CampaignMemberStatus
                from app.services.campaign_service import CampaignService
                from app.repositories.campaign_repository import CampaignMemberRepository
                mem_repo = CampaignMemberRepository()
                target_mem = await mem_repo.get_by_campaign_and_prospect(target_campaign_id, target_prospect_id)
                if target_mem and target_mem.status in [CampaignMemberStatus.QUEUED, CampaignMemberStatus.RETRYING]:
                    target_mem.status = CampaignMemberStatus.CALLING
                    await mem_repo.save(target_mem)
                    cmp_svc = CampaignService()
                    await cmp_svc.recalculate_campaign_stats(target_campaign_id)

        elif call_status in TERMINAL_STATUSES:
            # Check if conversation actually took place (via audio stream / transcript / existing call state)
            has_spoke = False
            if existing_call:
                if (existing_call.transcript and len(existing_call.transcript) > 0) or (existing_call.duration and existing_call.duration > 0):
                    has_spoke = True
                if existing_call.business_outcome and existing_call.business_outcome.lower() not in ["no_answer", "no answer", "failed", "busy", "initiated", "ringing"]:
                    has_spoke = True
                elif existing_call.outcome and existing_call.outcome.lower() not in ["no_answer", "no answer", "failed", "busy", "initiated", "ringing"]:
                    has_spoke = True

            effective_duration = max(call_duration, existing_call.duration if existing_call else 0)

            # Determine human-grade commercial outcome
            if has_spoke and existing_call:
                outcome = existing_call.business_outcome or existing_call.outcome or "connected"
                is_success = True
            elif call_status == "completed":
                if existing_call and existing_call.business_outcome:
                    outcome = existing_call.business_outcome
                    is_success = True
                elif existing_call and existing_call.outcome and existing_call.outcome.lower() not in ["initiated", "ringing"]:
                    outcome = existing_call.outcome
                    is_success = True
                elif effective_duration > 0:
                    outcome = "connected"
                    is_success = True
                else:
                    outcome = "completed"
                    is_success = True
            elif call_status in ["no-answer", "no_answer"]:
                outcome = (existing_call.business_outcome or existing_call.outcome) if (has_spoke and existing_call) else "no_answer"
                is_success = has_spoke
            elif call_status == "busy":
                outcome = (existing_call.business_outcome or existing_call.outcome) if (has_spoke and existing_call) else "busy"
                is_success = has_spoke
            elif call_status == "failed":
                outcome = (existing_call.business_outcome or existing_call.outcome) if (has_spoke and existing_call) else "failed"
                is_success = has_spoke
            elif call_status == "canceled":
                outcome = (existing_call.business_outcome or existing_call.outcome) if (has_spoke and existing_call) else "canceled"
                is_success = has_spoke
            else:
                outcome = (existing_call.business_outcome or existing_call.outcome) if (has_spoke and existing_call) else "failed"
                is_success = has_spoke

            if existing_call:
                existing_call.outcome = outcome
                if not existing_call.business_outcome or existing_call.business_outcome in ["completed", "connected"]:
                    existing_call.business_outcome = outcome
                if effective_duration > 0:
                    existing_call.duration = effective_duration
                await call_repo.save(existing_call)

            # Sync Prospect Activity & Outcome
            if target_org_id and existing_call and (existing_call.to_number or target_prospect_id):
                try:
                    from app.services.prospect_service import ProspectService
                    from app.repositories.prospect_repository import ProspectRepository
                    prospect_svc = ProspectService(ProspectRepository(), call_repo)
                    await prospect_svc.record_call_outcome(
                        organization_id=target_org_id,
                        phone_number=existing_call.to_number or "",
                        call_id=existing_call.id,
                        duration=effective_duration,
                        outcome=outcome,
                        is_success=is_success
                    )
                except Exception as pe:
                    print(f"[Twilio Status Webhook] Prospect sync warning: {pe}")

            # Sync Campaign Member if call is part of a Campaign
            if target_campaign_id and target_prospect_id:
                try:
                    from app.services.campaign_service import CampaignService
                    from app.repositories.campaign_repository import CampaignMemberRepository
                    mem_repo = CampaignMemberRepository()
                    target_mem = await mem_repo.get_by_campaign_and_prospect(target_campaign_id, target_prospect_id)
                    if target_mem:
                        cmp_svc = CampaignService()
                        await cmp_svc.record_call_outcome(
                            campaign_id=target_campaign_id,
                            member_id=target_mem.id,
                            call_id=existing_call.id if existing_call else call_sid,
                            duration=effective_duration,
                            outcome=outcome,
                            is_success=is_success
                        )
                except Exception as ce:
                    print(f"[Twilio Status Webhook] Campaign sync warning: {ce}")

    except Exception as e:
        print(f"[Twilio Status Webhook Error] {e}")

    return Response(content="<Response/>", media_type="application/xml")
