from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Request, Query
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.call import MakeCallRequest, CallResponse, slim_call_dict
from app.schemas.common import ApiResponse
from app.services.call_service import CallService
from app.api.v1.twilio import twilio_repo
from app.repositories.call_repository import CallRepository

router = APIRouter(prefix="/calls", tags=["Calls"])

call_repo = CallRepository()
call_service = CallService(twilio_repo, call_repo)

def get_call_service() -> CallService:
    return call_service

@router.post("", response_model=ApiResponse[CallResponse])
async def make_call(
    payload: MakeCallRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    call = await service.make_call(
        ctx=ctx,
        to_number=payload.to,
        from_number=payload.from_number,
        prompt=payload.prompt,
        agent_id=payload.agent_id
    )
    return ApiResponse.ok(CallResponse.model_validate(call))

@router.get("/token", response_model=ApiResponse[dict])
async def get_voice_token(
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    base_url = str(request.base_url).rstrip("/")
    res = await service.generate_voice_token(ctx, req_base_url=base_url)
    return ApiResponse.ok(res)

@router.get("/{call_id}", response_model=ApiResponse[CallResponse])
async def get_call(
    call_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    """Retrieves full call intelligence details including transcripts, summary, and telemetry."""
    call = await call_repo.get_by_id(call_id)
    if not call:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Call record not found.")
    if call.organization_id != ctx.organization_id and ctx.role != "superadmin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden: You do not have access to this call record.")

    # Auto-heal false "No Answer" if customer actually answered and spoke
    has_customer_speech = False
    if call.transcript:
        for t in call.transcript:
            if (t.get("role") in ["user", "customer"]) and (t.get("content") or t.get("text", "")).strip():
                has_customer_speech = True
                break

    if has_customer_speech or (call.duration and call.duration > 0):
        current_outcome = (call.business_outcome or call.outcome or "").lower()
        if "no answer" in current_outcome or "no_answer" in current_outcome or "unanswered" in current_outcome or not current_outcome:
            try:
                from app.services.call_analytics_service import CallAnalyticsService
                analytics_svc = CallAnalyticsService()
                new_analytics = await analytics_svc.analyze_call_transcript(call.transcript or [])
                if new_analytics and new_analytics.get("business_outcome") not in ["No Answer", "Voicemail"]:
                    call.business_outcome = new_analytics.get("business_outcome")
                    call.outcome = new_analytics.get("business_outcome")
                    call.summary = new_analytics.get("summary") or call.summary
                    call.key_insights = new_analytics.get("key_insights") or call.key_insights
                    call.lead_score = new_analytics.get("lead_score") or 50
                    call.interest_level = new_analytics.get("interest_level") or "Warm"
                    call.next_action = new_analytics.get("next_action") or call.next_action
                else:
                    call.business_outcome = "Asked Details"
                    call.outcome = "Asked Details"
                    if not call.lead_score or call.lead_score == 0:
                        call.lead_score = 50
                await call_repo.save(call)
            except Exception:
                call.business_outcome = "Asked Details"
                call.outcome = "Asked Details"
                if not call.lead_score or call.lead_score == 0:
                    call.lead_score = 50
                try:
                    await call_repo.save(call)
                except Exception:
                    pass

    return ApiResponse.ok(CallResponse.model_validate(call))


@router.post("/{call_id}/analyze", response_model=ApiResponse[CallResponse])
async def analyze_call(
    call_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
):
    """
    (Re)generates the conversation summary and lead intelligence for a call from its transcript.
    Used by the call inspector when a call has no summary yet (e.g. analysis failed at hang-up).
    """
    from fastapi import HTTPException
    call = await call_repo.get_by_id(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found.")
    if call.organization_id != ctx.organization_id and ctx.role != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden: You do not have access to this call record.")
    if not call.transcript:
        raise HTTPException(status_code=400, detail="This call has no conversation transcript to summarize.")

    from app.services.call_analytics_service import CallAnalyticsService
    data = await CallAnalyticsService().analyze_call_transcript(
        call.transcript,
        call_duration=call.duration or 0,
        call_status=call.status or "completed",
    )

    call.summary = data.get("summary") or call.summary
    call.key_insights = data.get("key_insights") or call.key_insights
    call.key_requirements = data.get("key_requirements") or call.key_requirements
    call.customer_questions = data.get("customer_questions") or call.customer_questions
    call.objections = data.get("objections") or call.objections
    call.important_info = data.get("important_info") or call.important_info
    call.next_action = data.get("next_action") or call.next_action
    call.intent = data.get("intent") or call.intent
    call.sentiment = data.get("sentiment") or call.sentiment
    if data.get("lead_score") is not None:
        call.lead_score = data["lead_score"]
    call.interest_level = data.get("interest_level") or call.interest_level
    call.classification = data.get("classification") or call.classification
    call.callback_datetime = data.get("callback_datetime") or call.callback_datetime
    # Keep a transfer outcome recorded during the call; otherwise take the analyzed outcome
    if not (call.business_outcome or call.outcome or "").upper().startswith("TRANSFER"):
        call.business_outcome = data.get("business_outcome") or call.business_outcome
        call.outcome = call.business_outcome or call.outcome
    call.analytics = data
    call.analytics_status = "ready"
    await call_repo.save(call)
    return ApiResponse.ok(CallResponse.model_validate(call))


@router.get("", response_model=ApiResponse[List[Dict[str, Any]]])
async def list_calls(
    type: Optional[str] = None,  # "simple" | "ai" | None
    campaign_id: Optional[str] = None,
    prospect_id: Optional[str] = None,
    full: bool = False,  # True returns transcripts, agent snapshots and analytics for every row (slow, large)
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    """
    Returns call history for this organization.
    Filter options:
    - `type=simple`: only traditional WebRTC phone calls (no AI Agent)
    - `type=ai`: only calls handled by AI Voice Agents
    - `type=None`: all calls
    - `campaign_id`: filter by campaign
    - `prospect_id`: filter by prospect
    """
    calls = await service.list_calls(ctx, call_type=type, light=not full)
    if campaign_id:
        calls = [c for c in calls if c.campaign_id == campaign_id]
    if prospect_id:
        calls = [c for c in calls if c.prospect_id == prospect_id]
    if full:
        return ApiResponse.ok([CallResponse.model_validate(c).model_dump(mode="json") for c in calls])
    # Summary rows only: open a call (GET /calls/{id}) to load its transcript, analytics and agent snapshot
    return ApiResponse.ok([slim_call_dict(c) for c in calls])
