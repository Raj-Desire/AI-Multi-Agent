import base64
import copy
import hashlib
from fastapi import APIRouter, HTTPException, Depends, status, Response
from typing import Dict, Any
from app.models.theme import OrganizationThemeConfig, SaveThemePayload
from app.repositories.theme_repository import ThemeRepository
from app.core.dependencies import get_tenant_context, require_admin, TenantContext

router = APIRouter(prefix="/organization/theme", tags=["Organization Theme Studio"])

ASSET_KEYS = ("logo_url", "logo_dark_url", "favicon_url")
ASSET_PATH = "/api/v1/organization/theme/asset"


def _slim_theme(theme: Dict[str, Any], organization_id: str) -> Dict[str, Any]:
    """Theme JSON for the browser. Logos are stored as base64 data URLs (hundreds of KB); embedding them in the
    theme made every page load download them again. They are served from a long-cached asset URL instead."""
    slim = copy.deepcopy(theme)
    identity = slim.get("identity") or {}
    for key in ASSET_KEYS:
        value = identity.get(key)
        if isinstance(value, str) and value.startswith("data:"):
            version = hashlib.md5(value.encode("utf-8")).hexdigest()[:12]
            identity[key] = f"{ASSET_PATH}/{organization_id}/{key}?v={version}"
    return slim


async def _restore_assets(payload: Dict[str, Any], organization_id: str) -> Dict[str, Any]:
    """The browser echoes asset URLs back when the theme is saved; map them back to the stored image data."""
    identity = payload.get("identity")
    if not isinstance(identity, dict):
        return payload
    if not any(isinstance(identity.get(k), str) and ASSET_PATH in identity[k] for k in ASSET_KEYS):
        return payload
    stored = (await ThemeRepository.get_theme(organization_id)).get("identity") or {}
    for key in ASSET_KEYS:
        value = identity.get(key)
        if isinstance(value, str) and ASSET_PATH in value:
            identity[key] = stored.get(key)
    return payload


@router.get("/asset/{organization_id}/{asset_key}", include_in_schema=False)
async def get_theme_asset(organization_id: str, asset_key: str):
    """Serves a theme image (logo / favicon) as a real file that browsers cache for a year (URL carries a version)."""
    if asset_key not in ASSET_KEYS:
        raise HTTPException(status_code=404, detail="Unknown theme asset.")
    theme = await ThemeRepository.get_theme(organization_id)
    value = (theme.get("identity") or {}).get(asset_key)
    if not isinstance(value, str) or not value.startswith("data:") or "," not in value:
        raise HTTPException(status_code=404, detail="Theme asset not found.")
    header, encoded = value.split(",", 1)
    media_type = header[5:].split(";")[0] or "image/png"
    try:
        body = base64.b64decode(encoded) if ";base64" in header else encoded.encode("utf-8")
    except Exception:
        raise HTTPException(status_code=404, detail="Theme asset is not valid.")
    return Response(content=body, media_type=media_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("", response_model=OrganizationThemeConfig)
async def get_organization_theme(tenant: TenantContext = Depends(get_tenant_context)):
    """Fetch the active theme configuration for the current organization."""
    try:
        theme = await ThemeRepository.get_theme(tenant.organization_id)
        return _slim_theme(theme, tenant.organization_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load organization theme: {e}"
        )

@router.put("", response_model=OrganizationThemeConfig)
async def update_organization_theme(
    payload: SaveThemePayload,
    tenant: TenantContext = Depends(get_tenant_context),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """Update organization theme configuration (Admin only)."""
    try:
        clean_payload = await _restore_assets(payload.model_dump(exclude_unset=True), tenant.organization_id)
        updated = await ThemeRepository.save_theme(
            organization_id=tenant.organization_id,
            theme_payload=clean_payload,
            user_email=current_admin.get("email", "admin")
        )
        return _slim_theme(updated, tenant.organization_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update organization theme: {e}"
        )

@router.post("/reset", response_model=OrganizationThemeConfig)
async def reset_organization_theme(
    tenant: TenantContext = Depends(get_tenant_context),
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    """Reset organization theme configuration to system default (Admin only)."""
    try:
        reset_doc = await ThemeRepository.reset_theme(
            organization_id=tenant.organization_id,
            user_email=current_admin.get("email", "admin")
        )
        return _slim_theme(reset_doc, tenant.organization_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset organization theme: {e}"
        )
