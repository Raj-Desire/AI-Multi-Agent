"""
Business Profile and Organization Knowledge Base API Endpoints
Provides tenant-isolated configuration for company introduction, services,
office address, operating hours, and custom FAQs for voice calls.
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.models.business_profile import CompanyBusinessProfile
from app.repositories.business_profile_repository import BusinessProfileRepository

router = APIRouter(prefix="/business-profile", tags=["Business Profile"])
repo = BusinessProfileRepository()


@router.get("", response_model=ApiResponse[Dict[str, Any]])
async def get_business_profile(
    org_id: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """Retrieves the business profile and knowledge base for the tenant's organization."""
    target_org = org_id if (ctx.role == "superadmin" and org_id) else ctx.organization_id
    profile = await repo.get_profile(target_org)
    return ApiResponse.ok(profile)


@router.post("", response_model=ApiResponse[Dict[str, Any]])
async def update_business_profile(
    payload: CompanyBusinessProfile,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Saves and updates the organization's business profile and knowledge base.
    Enforces that regular users can only save if admin has enabled 'allow_user_edits'.
    """
    target_org = payload.organization_id if (ctx.role == "superadmin" and payload.organization_id) else ctx.organization_id
    
    # Permission check
    if ctx.role not in ["admin", "superadmin"]:
        existing_profile = await repo.get_profile(target_org)
        can_edit = existing_profile.get("allow_user_edits", False)
        if not can_edit:
            raise HTTPException(
                status_code=403,
                detail="Knowledge Base is locked in Read-Only mode for non-admin users. Please contact your organization admin for editing access."
            )

    saved = await repo.save_profile(
        organization_id=target_org,
        profile_payload=payload.model_dump(mode="json"),
        user_email=ctx.email
    )
    return ApiResponse.ok(saved)
