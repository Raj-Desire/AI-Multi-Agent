from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.schemas.prospect import (
    CreateProspectRequest,
    UpdateProspectRequest,
    ProspectResponse,
    ProspectPaginationResponse,
    CSVValidateRequest,
    CSVValidateResponse,
    CSVImportRequest,
    CSVImportSummaryResponse,
    BulkStatusUpdateRequest,
    BulkTagRequest,
    BulkGroupUpdateRequest,
    BulkDeleteRequest,
    AddTagRequest,
    DistinctGroupsResponse,
    DeleteGroupRequest,
    DeleteGroupResponse
)
from app.services.prospect_service import ProspectService
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.call_repository import CallRepository

router = APIRouter(prefix="/prospects", tags=["Prospects"])

prospect_repo = ProspectRepository()
call_repo = CallRepository()
prospect_service = ProspectService(prospect_repo, call_repo)


def get_prospect_service() -> ProspectService:
    return prospect_service


@router.get("", response_model=ApiResponse[ProspectPaginationResponse])
async def list_prospects(
    search: Optional[str] = Query(None, description="Search term for name, phone, email, company, notes"),
    status: Optional[str] = Query(None, description="Filter by status"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    source: Optional[str] = Query(None, description="Filter by source"),
    group_name: Optional[str] = Query(None, description="Filter by group name"),
    assigned_owner: Optional[str] = Query(None, description="Filter by assigned owner"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(25, ge=1, le=500, description="Items per page"),
    sort_by: str = Query("created_at", description="Field to sort by (created_at, name, company, status, last_contacted_at, total_calls)"),
    sort_order: str = Query("desc", description="Sort direction (asc or desc)"),
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Lists paginated and filtered prospects scoped strictly to the authenticated tenant.
    """
    res = await service.list_prospects(
        ctx=ctx,
        search=search,
        status=status,
        tag=tag,
        source=source,
        group_name=group_name,
        assigned_owner=assigned_owner,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return ApiResponse.ok(res)


@router.get("/groups", response_model=ApiResponse[DistinctGroupsResponse])
async def list_distinct_groups(
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Lists all distinct group names created across the organization's contacts.
    """
    groups = await service.list_distinct_groups(ctx)
    return ApiResponse.ok(DistinctGroupsResponse(groups=groups))


@router.post("/groups/delete", response_model=ApiResponse[DeleteGroupResponse])
async def delete_contact_group_post(
    payload: DeleteGroupRequest,
    group_name: str = Query(..., description="Name of the group to delete"),
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Deletes or reassigns contacts in a group based on chosen policy:
    - 'unassign': Removes group tag while preserving contacts.
    - 'move': Moves contacts to target_group_name.
    - 'delete_contacts': Permanently removes all contacts in the group.
    """
    res = await service.delete_group(
        ctx=ctx,
        group_name=group_name,
        action=payload.action,
        target_group_name=payload.target_group_name
    )
    return ApiResponse.ok(DeleteGroupResponse.model_validate(res))



@router.post("", response_model=ApiResponse[ProspectResponse], status_code=status.HTTP_201_CREATED)
async def create_prospect(
    payload: CreateProspectRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Creates a new prospect for this organization with phone normalization and duplicate prevention.
    """
    prospect = await service.create_prospect(ctx, payload)
    return ApiResponse.ok(ProspectResponse.model_validate(prospect))


@router.post("/validate-import", response_model=ApiResponse[CSVValidateResponse])
async def validate_csv_import(
    payload: CSVValidateRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Validates CSV content, applies column mappings, and detects duplicates/syntax errors prior to import.
    """
    res = await service.validate_csv(ctx, payload.csv_content, payload.column_mapping)
    return ApiResponse.ok(res)


@router.post("/import", response_model=ApiResponse[CSVImportSummaryResponse])
@router.post("/import/csv", response_model=ApiResponse[CSVImportSummaryResponse])
async def import_prospects_csv(
    payload: CSVImportRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Executes batch CSV import with configurable duplicate policy (skip or update) and optional group assignment.
    """
    res = await service.import_csv(
        ctx=ctx,
        csv_content=payload.csv_content,
        column_mapping=payload.column_mapping,
        duplicate_policy=payload.duplicate_policy,
        default_group_name=payload.default_group_name,
        default_tags=payload.default_tags,
        default_source=payload.default_source
    )
    return ApiResponse.ok(res)


@router.post("/bulk/status", response_model=ApiResponse[Dict[str, Any]])
async def bulk_update_status(
    payload: BulkStatusUpdateRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Updates the status for multiple prospects at once.
    """
    updated_count = await service.bulk_update_status(ctx, payload.prospect_ids, payload.status)
    return ApiResponse.ok({"updated_count": updated_count, "status": payload.status.value})


@router.post("/bulk/tags", response_model=ApiResponse[Dict[str, Any]])
async def bulk_update_tags(
    payload: BulkTagRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Adds or removes tags in bulk across multiple selected prospects.
    """
    updated_count = await service.bulk_update_tags(ctx, payload.prospect_ids, payload.tags, action=payload.action)
    return ApiResponse.ok({"updated_count": updated_count, "action": payload.action, "tags": payload.tags})


@router.post("/bulk/group", response_model=ApiResponse[Dict[str, Any]])
async def bulk_update_group(
    payload: BulkGroupUpdateRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Assigns or changes the group for multiple selected prospects.
    """
    updated_count = await service.bulk_update_group(ctx, payload.prospect_ids, payload.group_name)
    return ApiResponse.ok({"updated_count": updated_count, "group_name": payload.group_name})
    """
    Adds or removes tags in bulk across multiple selected prospects.
    """
    updated_count = await service.bulk_update_tags(ctx, payload.prospect_ids, payload.tags, action=payload.action)
    return ApiResponse.ok({"updated_count": updated_count, "action": payload.action, "tags": payload.tags})


@router.post("/bulk/delete", response_model=ApiResponse[Dict[str, Any]])
async def bulk_delete_prospects(
    payload: BulkDeleteRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Permanently deletes multiple prospects within the authenticated tenant.
    """
    deleted_count = await service.bulk_delete(ctx, payload.prospect_ids)
    return ApiResponse.ok({"deleted_count": deleted_count})


@router.get("/{prospect_id}", response_model=ApiResponse[ProspectResponse])
async def get_prospect(
    prospect_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Retrieves a single prospect by ID within the authenticated tenant.
    """
    prospect = await service.get_prospect(ctx, prospect_id)
    return ApiResponse.ok(ProspectResponse.model_validate(prospect))


@router.patch("/{prospect_id}", response_model=ApiResponse[ProspectResponse])
async def update_prospect(
    prospect_id: str,
    payload: UpdateProspectRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Updates prospect fields, contact info, status, custom fields, or notes.
    """
    updated = await service.update_prospect(ctx, prospect_id, payload)
    return ApiResponse.ok(ProspectResponse.model_validate(updated))


@router.delete("/{prospect_id}", response_model=ApiResponse[Dict[str, bool]])
async def delete_prospect(
    prospect_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Deletes a prospect by ID within the authenticated tenant.
    """
    success = await service.delete_prospect(ctx, prospect_id)
    return ApiResponse.ok({"deleted": success})


@router.post("/{prospect_id}/tags", response_model=ApiResponse[ProspectResponse])
async def add_prospect_tag(
    prospect_id: str,
    payload: AddTagRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Adds a tag to an individual prospect.
    """
    updated = await service.add_tag(ctx, prospect_id, payload.tag)
    return ApiResponse.ok(ProspectResponse.model_validate(updated))


@router.delete("/{prospect_id}/tags/{tag}", response_model=ApiResponse[ProspectResponse])
async def remove_prospect_tag(
    prospect_id: str,
    tag: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Removes a tag from an individual prospect.
    """
    updated = await service.remove_tag(ctx, prospect_id, tag)
    return ApiResponse.ok(ProspectResponse.model_validate(updated))


@router.get("/{prospect_id}/calls", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_prospect_call_history(
    prospect_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: ProspectService = Depends(get_prospect_service)
):
    """
    Returns historical calls, transcripts, and post-call analytics for this prospect.
    """
    calls = await service.get_prospect_calls(ctx, prospect_id)
    return ApiResponse.ok(calls)
