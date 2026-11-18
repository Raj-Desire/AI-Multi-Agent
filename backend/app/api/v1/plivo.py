from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

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
