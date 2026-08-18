from typing import List, Optional
from fastapi import APIRouter, Depends, Request, Query
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.call import MakeCallRequest, CallResponse
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

@router.get("", response_model=ApiResponse[List[CallResponse]])
async def list_calls(
    type: Optional[str] = None,  # "simple" | "ai" | None
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    """
    Returns call history for this organization.
    Filter options:
    - `type=simple`: only traditional WebRTC phone calls (no AI Agent)
    - `type=ai`: only calls handled by AI Voice Agents
    - `type=None`: all calls
    """
    calls = await service.list_calls(ctx, call_type=type)
    return ApiResponse.ok([CallResponse.model_validate(c) for c in calls])
