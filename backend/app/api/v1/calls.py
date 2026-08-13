from typing import List
from fastapi import APIRouter, Depends
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
    call = await service.make_call(ctx, payload.to, payload.from_number, payload.prompt)
    return ApiResponse.ok(CallResponse.model_validate(call))

@router.get("/token", response_model=ApiResponse[dict])
async def get_voice_token(
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    res = await service.generate_voice_token(ctx)
    return ApiResponse.ok(res)

@router.get("", response_model=ApiResponse[List[CallResponse]])
async def list_calls(
    ctx: TenantContext = Depends(get_tenant_context),
    service: CallService = Depends(get_call_service)
):
    calls = await service.list_calls(ctx)
    return ApiResponse.ok([CallResponse.model_validate(c) for c in calls])
