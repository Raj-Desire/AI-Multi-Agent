"""
Agent Configuration API
Allows tenant users, admins, and platform superadmins to view, create, update, duplicate,
activate, deactivate, archive, and manage their AI Voice Agent configurations.
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.agents.configuration import AgentConfiguration
from app.services.agent_service import AgentService
from app.repositories.agent_repository import AgentRepository

router = APIRouter(prefix="/agents", tags=["Agents"])

agent_repo = AgentRepository()
agent_service = AgentService(agent_repo)


def get_agent_service() -> AgentService:
    return agent_service


@router.get("", response_model=ApiResponse[List[AgentConfiguration]])
async def list_agents(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Lists all configured agents available to the caller's organization (org-scoped + platform defaults)."""
    agents = await service.list_agents(ctx)
    return ApiResponse.ok(agents)


@router.get("/available", response_model=ApiResponse[Dict[str, List[AgentConfiguration]]])
async def get_available_agents(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """
    Returns active agents available for call selection:
    { "my_agents": [...], "default_agents": [...] }
    """
    available = await service.get_available_agents(ctx)
    return ApiResponse.ok(available)


@router.get("/primary", response_model=ApiResponse[AgentConfiguration])
async def get_primary_agent(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Returns the primary agent configuration for the tenant."""
    agent = await service.get_or_create_primary_agent(ctx)
    return ApiResponse.ok(agent)


@router.get("/{agent_id}", response_model=ApiResponse[AgentConfiguration])
async def get_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Retrieves a specific agent configuration within the tenant boundary or global scope."""
    agent = await service.get_agent_by_id(ctx, agent_id)
    return ApiResponse.ok(agent)


@router.post("", response_model=ApiResponse[AgentConfiguration])
async def create_agent(
    payload: AgentConfiguration,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Creates a new AI Agent for the organization (or global agent if SuperAdmin)."""
    created = await service.create_agent(ctx, payload)
    return ApiResponse.ok(created)


@router.put("/{agent_id}", response_model=ApiResponse[AgentConfiguration])
async def update_agent(
    agent_id: str,
    payload: AgentConfiguration,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Updates the agent configuration and increments its version number."""
    saved = await service.update_agent(ctx, agent_id, payload)
    return ApiResponse.ok(saved)


@router.post("/{agent_id}/activate", response_model=ApiResponse[AgentConfiguration])
async def activate_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Sets agent status to ACTIVE so it can be selected for live phone calls."""
    activated = await service.set_status(ctx, agent_id, "ACTIVE")
    return ApiResponse.ok(activated)


@router.post("/{agent_id}/deactivate", response_model=ApiResponse[AgentConfiguration])
async def deactivate_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Sets agent status to INACTIVE so it cannot be selected for new calls."""
    deactivated = await service.set_status(ctx, agent_id, "INACTIVE")
    return ApiResponse.ok(deactivated)


@router.post("/{agent_id}/archive", response_model=ApiResponse[AgentConfiguration])
async def archive_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Safely archives an agent while preserving all historical call references."""
    archived = await service.set_status(ctx, agent_id, "ARCHIVED")
    return ApiResponse.ok(archived)


@router.post("/{agent_id}/duplicate", response_model=ApiResponse[AgentConfiguration])
async def duplicate_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Duplicates a global template or existing agent into the caller's organization as a customizable copy."""
    duplicated = await service.duplicate_agent(ctx, agent_id)
    return ApiResponse.ok(duplicated)


@router.get("/{agent_id}/versions", response_model=ApiResponse[Dict[str, Any]])
async def get_agent_versions(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Fetches version and snapshot metadata for an agent."""
    agent = await service.get_agent_by_id(ctx, agent_id)
    return ApiResponse.ok({
        "agent_id": agent.agent_id,
        "name": agent.name,
        "current_version": agent.version,
        "status": agent.status,
        "updated_at": agent.updated_at
    })
