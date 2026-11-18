from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import TenantContext, get_tenant_context
from app.models.telephony import TelephonySettings
from app.repositories.telephony_settings_repository import TelephonySettingsRepository
from app.schemas.common import ApiResponse
from app.schemas.plivo import ProviderResponse, SelectProviderRequest
from app.telephony.registry import MARKET_PROVIDER, is_available, list_numbers, resolve_market, resolve_provider_name

router = APIRouter(prefix="/telephony", tags=["Telephony"])


async def _current(org_id: str) -> ProviderResponse:
    return ProviderResponse(provider=await resolve_provider_name(org_id), market=await resolve_market(org_id))


@router.get("/provider", response_model=ApiResponse[ProviderResponse])
async def get_provider_setting(ctx: TenantContext = Depends(get_tenant_context)):
    return ApiResponse.ok(await _current(ctx.organization_id))


@router.put("/provider", response_model=ApiResponse[ProviderResponse])
async def set_provider_setting(payload: SelectProviderRequest, ctx: TenantContext = Depends(get_tenant_context)):
    """Choose the organization's market (domestic -> Plivo, international -> Twilio, both -> per number) or a provider."""
    if ctx.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Forbidden: Only Organization Administrators or Superadmins can change telephony settings.")
    market: Optional[str] = (payload.market or "").strip().lower() or None
    provider: Optional[str] = (payload.provider or "").strip().lower() or None
    if market and market not in MARKET_PROVIDER:
        raise HTTPException(status_code=400, detail="Unknown market.")
    if market == "both" and ctx.role != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden: Only a Superadmin can use both providers.")
    if provider and provider not in ("twilio", "plivo"):
        raise HTTPException(status_code=400, detail="Unknown telephony provider.")
    if not market and not provider:
        raise HTTPException(status_code=400, detail="Choose a market or a provider.")

    chosen = provider or MARKET_PROVIDER[market]
    if chosen == "plivo":
        if not is_available("plivo"):
            raise HTTPException(status_code=400, detail="This telephony provider is not available yet.")
    new_market = market or ("domestic" if chosen == "plivo" else "international")
    await TelephonySettingsRepository().save(TelephonySettings(organization_id=ctx.organization_id, provider=chosen, market=new_market))
    return ApiResponse.ok(await _current(ctx.organization_id))


@router.get("/numbers", response_model=ApiResponse[list])
async def get_numbers(ctx: TenantContext = Depends(get_tenant_context)):
    """Numbers the organization can call from, each labelled with its provider."""
    return ApiResponse.ok(await list_numbers(ctx.organization_id))
