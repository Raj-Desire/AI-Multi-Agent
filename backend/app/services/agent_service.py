"""
Agent Service
Orchestrates tenant-isolated AI agent configuration management and lifecycle.
"""

from typing import Optional, List
from fastapi import HTTPException
from app.core.dependencies import TenantContext
from app.agents.configuration import AgentConfiguration, get_default_receptionist_agent
from app.repositories.agent_repository import AgentRepository


class AgentService:
    def __init__(self, agent_repo: Optional[AgentRepository] = None):
        self.agent_repo = agent_repo or AgentRepository()

    async def get_or_create_primary_agent(self, ctx: TenantContext) -> AgentConfiguration:
        """Fetches the primary agent for the tenant or auto-seeds the default Receptionist agent."""
        existing = await self.agent_repo.get_by_org(ctx.organization_id)
        if existing:
            return existing

        # Seed default Desire AI Receptionist for this tenant
        default_agent = get_default_receptionist_agent(organization_id=ctx.organization_id)
        return await self.agent_repo.save(default_agent)

    async def get_agent_by_id(self, ctx: TenantContext, agent_id: str) -> AgentConfiguration:
        """Retrieves a specific agent with strict tenant isolation."""
        agent = await self.agent_repo.get_by_id(ctx.organization_id, agent_id)
        if not agent:
            # Check if default agent requested
            if agent_id in ["default", "agt_receptionist_default"]:
                return await self.get_or_create_primary_agent(ctx)
            raise HTTPException(status_code=404, detail="AI Agent not found for this organization.")
        return agent

    async def save_agent(self, ctx: TenantContext, config: AgentConfiguration) -> AgentConfiguration:
        """Saves or updates the agent configuration, ensuring organization_id belongs to the current tenant."""
        config.organization_id = ctx.organization_id
        return await self.agent_repo.save(config)

    async def list_agents(self, ctx: TenantContext) -> List[AgentConfiguration]:
        """Lists all agents for the tenant."""
        agents = await self.agent_repo.list_by_org(ctx.organization_id)
        if not agents:
            default_agent = await self.get_or_create_primary_agent(ctx)
            return [default_agent]
        return agents
