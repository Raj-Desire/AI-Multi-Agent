from fastapi import APIRouter, HTTPException, Depends, status
from typing import Dict, Any
from app.models.theme import OrganizationThemeConfig, SaveThemePayload
from app.repositories.theme_repository import ThemeRepository
from app.core.dependencies import get_tenant_context, require_admin, TenantContext

router = APIRouter(prefix="/organization/theme", tags=["Organization Theme Studio"])

@router.get("", response_model=OrganizationThemeConfig)
async def get_organization_theme(tenant: TenantContext = Depends(get_tenant_context)):
    """Fetch the active theme configuration for the current organization."""
    try:
        theme = await ThemeRepository.get_theme(tenant.organization_id)
        return theme
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
        clean_payload = payload.model_dump(exclude_unset=True)
        updated = await ThemeRepository.save_theme(
            organization_id=tenant.organization_id,
            theme_payload=clean_payload,
            user_email=current_admin.get("email", "admin")
        )
        return updated
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
        return reset_doc
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset organization theme: {e}"
        )
