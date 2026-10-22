import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Any, Optional
from app.core.dependencies import get_tenant_context, require_admin, require_superadmin, TenantContext
from app.services.credit_service import credit_service
from app.repositories.user_repository import UserRepository
from app.schemas.credits import (
    AssignCreditsRequest,
    TopUpCreditsRequest,
    DeductCreditsRequest,
    ToggleEnforcementRequest,
    OrgCreditStatusResponse,
    SuperAdminOrgCreditItem
)

router = APIRouter(prefix="/credits", tags=["Credits & Usage"])

# ============================================================================
# Tenant-Facing Endpoints (Admin & Org Members)
# ============================================================================

@router.get("/my-org", response_model=OrgCreditStatusResponse)
async def get_my_org_credit_status(
    ctx: TenantContext = Depends(get_tenant_context)
):
    """Returns current credit balance, status badge, and quotas for logged-in organization."""
    creds = await credit_service.repo.get_or_create_org_credits(ctx.organization_id, ctx.org_name or "")
    return OrgCreditStatusResponse(
        organization_id=creds.organization_id,
        org_name=creds.org_name or ctx.org_name or creds.organization_id,
        plan_name=creds.plan_name,
        total_credits_minutes=creds.total_credits_minutes,
        used_minutes=creds.used_minutes,
        remaining_minutes=creds.remaining_minutes,
        usage_percentage=creds.usage_percentage,
        status=creds.status,
        is_credit_enforced=creds.is_credit_enforced,
        credit_exhausted_action=creds.credit_exhausted_action,
        low_credit_threshold_pct=creds.low_credit_threshold_pct,
        period_start=creds.period_start.isoformat() if creds.period_start else None,
        period_end=creds.period_end.isoformat() if creds.period_end else None,
        max_agents_allowed=creds.max_agents_allowed,
        max_campaigns_allowed=creds.max_campaigns_allowed,
        updated_at=creds.updated_at.isoformat() if creds.updated_at else None
    )

@router.get("/my-org/dashboard")
async def get_my_org_dashboard(
    days: int = Query(30, ge=1, le=90),
    ctx: TenantContext = Depends(get_tenant_context)
):
    """Comprehensive dashboard payload: credit health, resource counters, 30d usage chart, recent ledger."""
    return await credit_service.get_org_dashboard_data(ctx.organization_id, days=days)

@router.get("/my-org/daily")
async def get_my_org_daily_usage(
    days: int = Query(30, ge=1, le=90),
    ctx: TenantContext = Depends(get_tenant_context)
):
    """Daily consumption aggregates for custom date range."""
    return await credit_service.repo.get_daily_usage_aggregates(ctx.organization_id, days=days)

@router.get("/my-org/ledger")
async def get_my_org_ledger(
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context)
):
    """Returns granular call-by-call credit deduction entries."""
    entries = await credit_service.repo.list_ledger(ctx.organization_id, limit=limit)
    return [e.model_dump(mode="json") for e in entries]

@router.get("/my-org/audit")
async def get_my_org_audit_history(
    limit: int = Query(50, ge=1, le=100),
    ctx: TenantContext = Depends(get_tenant_context),
    _: Dict[str, Any] = Depends(require_admin)
):
    """Returns history of plan adjustments, top-ups, and renewals."""
    logs = await credit_service.repo.list_assignment_logs(ctx.organization_id, limit=limit)
    return [log.model_dump(mode="json") for log in logs]


# ============================================================================
# SuperAdmin Management Endpoints (Requires superadmin role)
# ============================================================================

superadmin_credits_router = APIRouter(prefix="/superadmin/credits", tags=["Superadmin Credits Management"])

@superadmin_credits_router.get("", response_model=List[SuperAdminOrgCreditItem])
async def list_all_org_credits(
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Returns directory of all organizations with their credit balances, plan, and resource counters."""
    orgs = await UserRepository.list_organizations()
    all_credits = await credit_service.repo.list_all_credits()
    credit_by_org = {c.organization_id: c for c in all_credits}

    async def _load_org(org):
        org_id = org["organization_id"]
        creds = credit_by_org.get(org_id)
        counters_task = credit_service.get_org_resource_counters(org_id)
        if not creds:
            creds, counters = await asyncio.gather(
                credit_service.repo.get_or_create_org_credits(org_id, org["org_name"]), counters_task
            )
        else:
            counters = await counters_task
        return creds, counters

    # Per-organization lookups are independent: run them concurrently instead of one organization at a time
    loaded = await asyncio.gather(*[_load_org(o) for o in orgs])

    results = []
    for org, (creds, counters) in zip(orgs, loaded):
        org_id = org["organization_id"]

        results.append(SuperAdminOrgCreditItem(
            organization_id=org_id,
            org_name=org["org_name"] or creds.org_name or org_id,
            plan_name=creds.plan_name,
            total_credits_minutes=creds.total_credits_minutes,
            used_minutes=creds.used_minutes,
            remaining_minutes=creds.remaining_minutes,
            usage_percentage=creds.usage_percentage,
            status=creds.status,
            is_credit_enforced=creds.is_credit_enforced,
            credit_exhausted_action=creds.credit_exhausted_action,
            low_credit_threshold_pct=creds.low_credit_threshold_pct,
            period_start=creds.period_start.isoformat() if creds.period_start else None,
            period_end=creds.period_end.isoformat() if creds.period_end else None,
            max_agents_allowed=creds.max_agents_allowed,
            max_campaigns_allowed=creds.max_campaigns_allowed,
            total_agents=counters.total_agents,
            total_campaigns=counters.total_campaigns,
            total_calls=counters.total_calls_count,
            last_assigned_by=creds.last_assigned_by,
            last_assigned_at=creds.last_assigned_at.isoformat() if creds.last_assigned_at else None,
            updated_at=creds.updated_at.isoformat() if creds.updated_at else None
        ))

    return results

@superadmin_credits_router.get("/{organization_id}")
async def get_org_credit_detail(
    organization_id: str,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Detailed view for a specific tenant organization."""
    return await credit_service.get_org_dashboard_data(organization_id, days=30)

@superadmin_credits_router.post("/{organization_id}/assign")
async def assign_org_credits(
    organization_id: str,
    payload: AssignCreditsRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    """Assigns or updates subscription credit tier, quotas, and enforcement settings."""
    assigned_by = current_user.get("email", "superadmin")
    updated = await credit_service.repo.assign_credits(
        organization_id=organization_id,
        total_minutes=payload.total_minutes,
        plan_name=payload.plan_name,
        assigned_by=assigned_by,
        reason=payload.reason,
        period_start=payload.period_start,
        period_end=payload.period_end,
        is_enforced=payload.is_enforced,
        exhausted_action=payload.exhausted_action,
        low_threshold_pct=payload.low_threshold_pct,
        max_agents=payload.max_agents,
        max_campaigns=payload.max_campaigns
    )
    return {
        "message": f"Successfully updated credits for organization {organization_id}.",
        "credits": updated.model_dump(mode="json")
    }

@superadmin_credits_router.post("/{organization_id}/add")
async def add_org_credits(
    organization_id: str,
    payload: TopUpCreditsRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    """Adds top-up minutes to the organization's existing credit balance."""
    assigned_by = current_user.get("email", "superadmin")
    updated = await credit_service.repo.add_credits(
        organization_id=organization_id,
        add_minutes=payload.add_minutes,
        assigned_by=assigned_by,
        reason=payload.reason
    )
    return {
        "message": f"Added +{payload.add_minutes} minutes to organization {organization_id}.",
        "total_credits_minutes": updated.total_credits_minutes,
        "remaining_minutes": updated.remaining_minutes
    }

@superadmin_credits_router.post("/{organization_id}/deduct")
async def deduct_org_credits(
    organization_id: str,
    payload: DeductCreditsRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    """Deducts minutes from the organization's available allocation."""
    assigned_by = current_user.get("email", "superadmin")
    try:
        updated = await credit_service.repo.deduct_credits(
            organization_id=organization_id,
            deduct_minutes=payload.deduct_minutes,
            assigned_by=assigned_by,
            reason=payload.reason
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    return {
        "message": f"Deducted -{payload.deduct_minutes} minutes from organization {organization_id}.",
        "total_credits_minutes": updated.total_credits_minutes,
        "remaining_minutes": updated.remaining_minutes
    }

@superadmin_credits_router.patch("/{organization_id}/enforcement")
async def toggle_org_enforcement(
    organization_id: str,
    payload: ToggleEnforcementRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    """Toggles live credit blocking on/off for this tenant."""
    assigned_by = current_user.get("email", "superadmin")
    updated = await credit_service.repo.toggle_enforcement(
        organization_id=organization_id,
        is_enforced=payload.is_enforced,
        exhausted_action=payload.exhausted_action,
        assigned_by=assigned_by
    )
    return {
        "message": f"Credit enforcement set to {payload.is_enforced} ({payload.exhausted_action}).",
        "is_credit_enforced": updated.is_credit_enforced,
        "credit_exhausted_action": updated.credit_exhausted_action
    }

@superadmin_credits_router.get("/{organization_id}/audit-log")
async def get_org_audit_log(
    organization_id: str,
    limit: int = Query(50, ge=1, le=100),
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Retrieves full audit log of all credit actions taken on this organization."""
    logs = await credit_service.repo.list_assignment_logs(organization_id, limit=limit)
    return [log.model_dump(mode="json") for log in logs]
