from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Response
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.schemas.lead_intelligence import (
    LeadKPISummary,
    LeadTrendsResponse,
    LeadOutcomeDistributionResponse,
    CampaignLeadStat,
    AgentLeadStat,
    LeadListPaginationResponse,
    CallbackListPaginationResponse,
    LeadDetailResponse,
    LeadActionRequest
)
from app.schemas.prospect import ProspectResponse
from app.services.lead_intelligence_service import LeadIntelligenceService

router = APIRouter(prefix="/lead-intelligence", tags=["Lead Intelligence"])

service = LeadIntelligenceService()


def get_lead_service() -> LeadIntelligenceService:
    return service


@router.get("/summary", response_model=ApiResponse[LeadKPISummary])
async def get_summary_kpis(
    date_range: Optional[str] = Query("7d", description="Preset: today, yesterday, 7d, 30d, this_month, last_month, custom"),
    custom_start: Optional[str] = Query(None, description="ISO timestamp for custom start date"),
    custom_end: Optional[str] = Query(None, description="ISO timestamp for custom end date"),
    campaign_id: Optional[str] = Query(None, description="Filter by campaign ID or 'all'"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns organization-wide Lead KPI summary with period-over-period percentage comparison.
    """
    res = await lead_svc.get_summary_kpis(
        ctx=ctx,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end,
        campaign_id=campaign_id
    )
    return ApiResponse.ok(res)


@router.get("/trends", response_model=ApiResponse[LeadTrendsResponse])
async def get_lead_trends(
    metric: Optional[str] = Query("all", description="Metric to plot: all, interested, warm, callback, qualified, converted"),
    date_range: Optional[str] = Query("7d", description="Preset: today, yesterday, 7d, 30d, this_month, last_month, custom"),
    custom_start: Optional[str] = Query(None, description="ISO timestamp for custom start date"),
    custom_end: Optional[str] = Query(None, description="ISO timestamp for custom end date"),
    campaign_id: Optional[str] = Query(None, description="Filter by campaign ID or 'all'"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns Lead Interest Over Time series for analytics charts.
    """
    res = await lead_svc.get_lead_trends(
        ctx=ctx,
        metric=metric,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end,
        campaign_id=campaign_id
    )
    return ApiResponse.ok(res)


@router.get("/distribution", response_model=ApiResponse[LeadOutcomeDistributionResponse])
async def get_outcome_distribution(
    date_range: Optional[str] = Query("7d", description="Preset: today, yesterday, 7d, 30d, this_month, last_month, custom"),
    custom_start: Optional[str] = Query(None, description="ISO timestamp for custom start date"),
    custom_end: Optional[str] = Query(None, description="ISO timestamp for custom end date"),
    campaign_id: Optional[str] = Query(None, description="Filter by campaign ID or 'all'"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns the distribution of all call outcomes across the organization.
    """
    res = await lead_svc.get_outcome_distribution(
        ctx=ctx,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end,
        campaign_id=campaign_id
    )
    return ApiResponse.ok(res)


@router.get("/campaigns", response_model=ApiResponse[List[CampaignLeadStat]])
async def get_campaign_performance(
    date_range: Optional[str] = Query("7d", description="Preset: today, yesterday, 7d, 30d, this_month, last_month, custom"),
    custom_start: Optional[str] = Query(None, description="ISO timestamp for custom start date"),
    custom_end: Optional[str] = Query(None, description="ISO timestamp for custom end date"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns 'Leads by Campaign' comparative performance.
    """
    res = await lead_svc.get_campaign_performance(
        ctx=ctx,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end
    )
    return ApiResponse.ok(res)


@router.get("/agents", response_model=ApiResponse[List[AgentLeadStat]])
async def get_agent_performance(
    date_range: Optional[str] = Query("7d", description="Preset: today, yesterday, 7d, 30d, this_month, last_month, custom"),
    custom_start: Optional[str] = Query(None, description="ISO timestamp for custom start date"),
    custom_end: Optional[str] = Query(None, description="ISO timestamp for custom end date"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns 'Leads by AI Voice Agent' performance.
    """
    res = await lead_svc.get_agent_performance(
        ctx=ctx,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end
    )
    return ApiResponse.ok(res)


@router.get("/leads", response_model=ApiResponse[LeadListPaginationResponse])
async def list_leads(
    search: Optional[str] = Query(None, description="Search name, phone, email, company"),
    date_range: Optional[str] = Query("all", description="Preset: all, today, yesterday, 7d, 30d, this_month, last_month, custom"),
    custom_start: Optional[str] = Query(None, description="ISO timestamp for custom start date"),
    custom_end: Optional[str] = Query(None, description="ISO timestamp for custom end date"),
    campaign_id: Optional[str] = Query(None, description="Filter by campaign ID"),
    outcome: Optional[str] = Query(None, description="Filter by outcome"),
    interest_level: Optional[str] = Query(None, description="Filter by Hot, Warm, Cold"),
    min_score: Optional[int] = Query(None, ge=0, le=100, description="Minimum lead score"),
    max_score: Optional[int] = Query(None, ge=0, le=100, description="Maximum lead score"),
    agent_id: Optional[str] = Query(None, description="Filter by AI agent"),
    prospect_status: Optional[str] = Query(None, description="Filter by prospect CRM status"),
    follow_up: Optional[str] = Query(None, description="Filter: needs_follow_up, scheduled, none"),
    only_high_value: bool = Query(True, description="Whether to default to valuable outcomes"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=500, description="Page size"),
    sort_by: str = Query("last_call_at", description="Sort field: last_call_at, lead_score, full_name, campaign_name, outcome, callback_datetime"),
    sort_order: str = Query("desc", description="Sort direction: asc or desc"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns paginated, multi-filtered list of valuable leads across all campaigns.
    """
    res = await lead_svc.list_leads(
        ctx=ctx,
        search=search,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end,
        campaign_id=campaign_id,
        outcome=outcome,
        interest_level=interest_level,
        min_score=min_score,
        max_score=max_score,
        agent_id=agent_id,
        prospect_status=prospect_status,
        follow_up=follow_up,
        only_high_value=only_high_value,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return ApiResponse.ok(res)


@router.get("/callbacks", response_model=ApiResponse[CallbackListPaginationResponse])
async def list_callbacks(
    search: Optional[str] = Query(None, description="Search name, phone, email, company"),
    campaign_id: Optional[str] = Query(None, description="Filter by campaign"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=500, description="Page size"),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns dedicated list of callback requests.
    """
    res = await lead_svc.list_callbacks(
        ctx=ctx,
        search=search,
        campaign_id=campaign_id,
        page=page,
        page_size=page_size
    )
    return ApiResponse.ok(res)


@router.get("/leads/{prospect_id}", response_model=ApiResponse[LeadDetailResponse])
async def get_lead_detail(
    prospect_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Returns comprehensive 360-degree Lead Intelligence detail for the drawer.
    Includes AI summary, key requirements, questions, objections, next action, 'Why highlighted' evidence, complete transcript turns, and call history.
    """
    res = await lead_svc.get_lead_detail(ctx=ctx, prospect_id=prospect_id)
    return ApiResponse.ok(res)


@router.post("/leads/{prospect_id}/action", response_model=ApiResponse[ProspectResponse])
async def execute_lead_action(
    prospect_id: str,
    payload: LeadActionRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Updates lead CRM status, notes, callback schedule, tags, or assigned owner.
    """
    res = await lead_svc.execute_lead_action(ctx=ctx, prospect_id=prospect_id, payload=payload)
    return ApiResponse.ok(ProspectResponse.model_validate(res))


@router.get("/export")
async def export_leads_csv(
    search: Optional[str] = Query(None),
    date_range: Optional[str] = Query("all"),
    custom_start: Optional[str] = Query(None),
    custom_end: Optional[str] = Query(None),
    campaign_id: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    interest_level: Optional[str] = Query(None),
    min_score: Optional[int] = Query(None),
    max_score: Optional[int] = Query(None),
    agent_id: Optional[str] = Query(None),
    prospect_status: Optional[str] = Query(None),
    follow_up: Optional[str] = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    lead_svc: LeadIntelligenceService = Depends(get_lead_service)
):
    """
    Exports filtered leads directly to CSV format.
    """
    csv_data = await lead_svc.export_leads_csv(
        ctx=ctx,
        search=search,
        date_range=date_range,
        custom_start=custom_start,
        custom_end=custom_end,
        campaign_id=campaign_id,
        outcome=outcome,
        interest_level=interest_level,
        min_score=min_score,
        max_score=max_score,
        agent_id=agent_id,
        prospect_status=prospect_status,
        follow_up=follow_up
    )
    filename = f"lead_intelligence_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
