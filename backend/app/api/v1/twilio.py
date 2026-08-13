from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.twilio import SaveTwilioConfigRequest, TwilioConfigResponse
from app.schemas.common import ApiResponse
from app.services.twilio_service import TwilioService
from app.repositories.twilio_repository import TwilioRepository

router = APIRouter(prefix="/twilio", tags=["Twilio"])

twilio_repo = TwilioRepository()
twilio_service = TwilioService(twilio_repo)

def get_twilio_service() -> TwilioService:
    return twilio_service

@router.get("/configuration", response_model=ApiResponse[Optional[TwilioConfigResponse]])
async def get_configuration(
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    cfg = await service.get_config(ctx)
    return ApiResponse.ok(cfg)

@router.post("/configuration", response_model=ApiResponse[TwilioConfigResponse])
async def save_configuration(
    payload: SaveTwilioConfigRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    cfg = await service.save_config(ctx, payload)
    return ApiResponse.ok(cfg)

@router.post("/test-connection", response_model=ApiResponse[dict])
async def test_connection(
    ctx: TenantContext = Depends(get_tenant_context),
    service: TwilioService = Depends(get_twilio_service)
):
    res = await service.test_connection(ctx)
    return ApiResponse.ok(res)
