"""
Agent Configuration API
Allows tenant users/admins to view, update, and manage their AI Voice Agent configurations.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
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
    """Lists all configured agents for the caller's organization."""
    agents = await service.list_agents(ctx)
    return ApiResponse.ok(agents)


@router.get("/primary", response_model=ApiResponse[AgentConfiguration])
async def get_primary_agent(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Returns the primary agent configuration (or auto-seeds default Receptionist)."""
    agent = await service.get_or_create_primary_agent(ctx)
    return ApiResponse.ok(agent)


@router.get("/{agent_id}", response_model=ApiResponse[AgentConfiguration])
async def get_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Retrieves a specific agent configuration within the tenant."""
    agent = await service.get_agent_by_id(ctx, agent_id)
    return ApiResponse.ok(agent)


@router.put("/{agent_id}", response_model=ApiResponse[AgentConfiguration])
async def update_agent(
    agent_id: str,
    payload: AgentConfiguration,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Updates the agent configuration for the tenant."""
    payload.agent_id = agent_id
    saved = await service.save_agent(ctx, payload)
    return ApiResponse.ok(saved)
