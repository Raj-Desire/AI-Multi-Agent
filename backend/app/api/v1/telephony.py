from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import TenantContext, get_tenant_context
from app.models.telephony import TelephonySettings
from app.repositories.plivo_repository import PlivoRepository
from app.repositories.telephony_settings_repository import TelephonySettingsRepository
from app.schemas.common import ApiResponse
from app.schemas.plivo import ProviderResponse, SelectProviderRequest
from app.telephony.registry import is_available, resolve_provider_name

router = APIRouter(prefix="/telephony", tags=["Telephony"])


@router.get("/provider", response_model=ApiResponse[ProviderResponse])
async def get_provider_setting(ctx: TenantContext = Depends(get_tenant_context)):
    return ApiResponse.ok(ProviderResponse(provider=await resolve_provider_name(ctx.organization_id)))


@router.put("/provider", response_model=ApiResponse[ProviderResponse])
async def set_provider_setting(payload: SelectProviderRequest, ctx: TenantContext = Depends(get_tenant_context)):
    if ctx.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Forbidden: Only Organization Administrators or Superadmins can change telephony settings.")
    provider = (payload.provider or "").strip().lower()
    if provider not in ("twilio", "plivo"):
        raise HTTPException(status_code=400, detail="Unknown telephony provider.")
    if provider == "plivo":
        if not is_available("plivo"):
            raise HTTPException(status_code=400, detail="This telephony provider is not available yet.")
        if not await PlivoRepository().get_by_org(ctx.organization_id):
            raise HTTPException(status_code=400, detail="Save the telephony credentials for this provider before selecting it.")
    saved = await TelephonySettingsRepository().save(TelephonySettings(organization_id=ctx.organization_id, provider=provider))
    return ApiResponse.ok(ProviderResponse(provider=saved.provider))
