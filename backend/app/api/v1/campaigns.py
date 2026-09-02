import asyncio
import math
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.schemas.campaign import (
    CreateCampaignRequest,
    UpdateCampaignRequest,
    AddCampaignMembersRequest,
    CampaignResponse,
    CampaignPaginationResponse,
    CampaignMemberResponse,
    CampaignMemberListResponse,
    CampaignEventResponse,
    CampaignStats,
)
from app.services.campaign_service import CampaignService
from app.services.campaign_dialer import campaign_dialer_engine
from app.repositories.campaign_repository import (
    CampaignRepository,
    CampaignMemberRepository,
    CampaignEventRepository,
)
from app.repositories.agent_repository import AgentRepository
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.call_repository import CallRepository

router = APIRouter(prefix="/campaigns", tags=["Campaigns & Outbound Dialer"])

campaign_repo = CampaignRepository()
member_repo = CampaignMemberRepository()
event_repo = CampaignEventRepository()
agent_repo = AgentRepository()
twilio_repo = TwilioRepository()
prospect_repo = ProspectRepository()
call_repo = CallRepository()

campaign_service = CampaignService(
    campaign_repo=campaign_repo,
    member_repo=member_repo,
    event_repo=event_repo,
    agent_repo=agent_repo,
    twilio_repo=twilio_repo,
    prospect_repo=prospect_repo,
    call_repo=call_repo
)


def get_campaign_service() -> CampaignService:
    return campaign_service


@router.post("", response_model=ApiResponse[CampaignResponse], status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CreateCampaignRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Creates a new outbound campaign with selected prospects and calling rules."""
    campaign = await service.create_campaign(ctx, payload)
    return ApiResponse.ok(CampaignResponse.model_validate(campaign))


@router.get("", response_model=ApiResponse[CampaignPaginationResponse])
async def list_campaigns(
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Lists campaigns for the authenticated organization with filtering and pagination."""
    items, total = await service.list_campaigns(
        ctx=ctx,
        search=search,
        status=status,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    total_pages = max(1, math.ceil(total / page_size))
    return ApiResponse.ok(
        CampaignPaginationResponse(
            items=[CampaignResponse.model_validate(c) for c in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )
    )


@router.get("/{campaign_id}", response_model=ApiResponse[CampaignResponse])
async def get_campaign(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Retrieves single campaign details and real-time statistics."""
    campaign = await service.get_campaign(ctx, campaign_id)
    # Refresh live statistics
    await service.recalculate_campaign_stats(campaign_id)
    refreshed = await service.get_campaign(ctx, campaign_id)
    return ApiResponse.ok(CampaignResponse.model_validate(refreshed))


@router.put("/{campaign_id}", response_model=ApiResponse[CampaignResponse])
async def update_campaign(
    campaign_id: str,
    payload: UpdateCampaignRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Updates campaign parameters (name, description, calling window, concurrency)."""
    campaign = await service.update_campaign(ctx, campaign_id, payload)
    return ApiResponse.ok(CampaignResponse.model_validate(campaign))


@router.delete("/{campaign_id}", response_model=ApiResponse[Dict[str, Any]])
async def delete_campaign(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Deletes a campaign and its associated queue records."""
    success = await service.delete_campaign(ctx, campaign_id)
    return ApiResponse.ok({"deleted": success, "campaign_id": campaign_id})


@router.post("/{campaign_id}/start", response_model=ApiResponse[CampaignResponse])
async def start_campaign(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Starts or activates a campaign."""
    campaign = await service.start_campaign(ctx, campaign_id)
    # Trigger immediate dialer evaluation
    asyncio.create_task(campaign_dialer_engine.tick())
    return ApiResponse.ok(CampaignResponse.model_validate(campaign))


@router.post("/{campaign_id}/pause", response_model=ApiResponse[CampaignResponse])
async def pause_campaign(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Pauses an active campaign. In-flight calls will complete normally."""
    campaign = await service.pause_campaign(ctx, campaign_id)
    return ApiResponse.ok(CampaignResponse.model_validate(campaign))


@router.post("/{campaign_id}/resume", response_model=ApiResponse[CampaignResponse])
async def resume_campaign(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Resumes a paused campaign."""
    campaign = await service.resume_campaign(ctx, campaign_id)
    asyncio.create_task(campaign_dialer_engine.tick())
    return ApiResponse.ok(CampaignResponse.model_validate(campaign))


@router.post("/{campaign_id}/stop", response_model=ApiResponse[CampaignResponse])
async def stop_campaign(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Permanently stops a campaign."""
    campaign = await service.stop_campaign(ctx, campaign_id)
    return ApiResponse.ok(CampaignResponse.model_validate(campaign))


@router.get("/{campaign_id}/statistics", response_model=ApiResponse[CampaignStats])
async def get_campaign_statistics(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Computes and returns fresh real-time aggregated campaign statistics."""
    await service.get_campaign(ctx, campaign_id)
    stats = await service.recalculate_campaign_stats(campaign_id)
    return ApiResponse.ok(stats)


@router.get("/{campaign_id}/members", response_model=ApiResponse[CampaignMemberListResponse])
async def list_campaign_members(
    campaign_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Retrieves paginated campaign audience/queue members with status and outcome information."""
    items, total = await service.list_campaign_members(
        ctx=ctx,
        campaign_id=campaign_id,
        status=status,
        search=search,
        page=page,
        page_size=page_size
    )
    total_pages = max(1, math.ceil(total / page_size))
    return ApiResponse.ok(
        CampaignMemberListResponse(
            items=[CampaignMemberResponse.model_validate(m) for m in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )
    )


@router.post("/{campaign_id}/members/add", response_model=ApiResponse[Dict[str, Any]])
async def add_campaign_members(
    campaign_id: str,
    payload: AddCampaignMembersRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Adds more prospects into an existing campaign queue."""
    added_count = await service.add_prospects_to_campaign(
        ctx=ctx,
        campaign_id=campaign_id,
        filter_spec=payload.prospect_selection
    )
    return ApiResponse.ok({"added_count": added_count, "campaign_id": campaign_id})


@router.get("/{campaign_id}/events", response_model=ApiResponse[List[CampaignEventResponse]])
async def list_campaign_events(
    campaign_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Returns audit activity and dispatch event log for the campaign."""
    events = await service.list_campaign_events(ctx, campaign_id, limit=limit)
    return ApiResponse.ok([CampaignEventResponse.model_validate(e) for e in events])


@router.get("/{campaign_id}/calls", response_model=ApiResponse[Dict[str, Any]])
async def list_campaign_calls(
    campaign_id: str,
    status: Optional[str] = None,
    outcome: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Retrieves call intelligence history records specifically associated with this campaign."""
    items, total = await service.list_campaign_calls(
        ctx=ctx,
        campaign_id=campaign_id,
        status=status,
        outcome=outcome,
        search=search,
        page=page,
        page_size=page_size
    )
    total_pages = max(1, math.ceil(total / page_size))
    return ApiResponse.ok({
        "items": [c.model_dump(mode="json") if hasattr(c, "model_dump") else c for c in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    })


@router.get("/{campaign_id}/active-calls", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_campaign_active_calls(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Lists currently in-progress active voice calls for this campaign."""
    active_calls = await service.get_active_calls(ctx, campaign_id)
    return ApiResponse.ok(active_calls)


@router.post("/{campaign_id}/dial-now", response_model=ApiResponse[Dict[str, Any]])
async def trigger_dial_now(
    campaign_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: CampaignService = Depends(get_campaign_service)
):
    """Manually triggers an immediate dialer tick for this campaign."""
    campaign = await service.get_campaign(ctx, campaign_id)
    await campaign_dialer_engine.process_campaign(campaign)
    stats = await service.recalculate_campaign_stats(campaign_id)
    return ApiResponse.ok({"status": "dispatched", "stats": stats})


from fastapi import WebSocket, WebSocketDisconnect
from app.voice.events import telemetry_broadcaster

@router.websocket("/{campaign_id}/stream")
async def campaign_events_websocket(websocket: WebSocket, campaign_id: str):
    """Real-time WebSocket stream for campaign live status and execution updates."""
    await websocket.accept()
    q = await telemetry_broadcaster.subscribe(f"campaign_{campaign_id}")
    try:
        while True:
            event_data = await q.get()
            await websocket.send_json(event_data)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await telemetry_broadcaster.unsubscribe(f"campaign_{campaign_id}", q)
