"""
Agent Service
Orchestrates tenant-isolated AI agent configuration management, versioning, duplication,
RBAC enforcement, and lifecycle state machines.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
from fastapi import HTTPException

from app.core.dependencies import TenantContext
from app.agents.configuration import AgentConfiguration, get_default_receptionist_agent
from app.repositories.agent_repository import AgentRepository


class AgentService:
    def __init__(self, agent_repo: Optional[AgentRepository] = None):
        self.agent_repo = agent_repo or AgentRepository()

    async def get_or_create_primary_agent(self, ctx: TenantContext) -> AgentConfiguration:
        """Fetches the primary agent for the tenant or returns the default global Receptionist."""
        existing = await self.agent_repo.get_by_org(ctx.organization_id)
        if existing:
            return existing
        global_agent = await self.agent_repo.get_by_id("global", "agt_receptionist_default")
        return global_agent or get_default_receptionist_agent(organization_id=ctx.organization_id)

    async def get_agent_by_id(self, ctx: TenantContext, agent_id: str) -> AgentConfiguration:
        """Retrieves a specific agent with strict tenant isolation or global platform availability."""
        agent = await self.agent_repo.get_by_id(ctx.organization_id, agent_id)
        if not agent:
            # Check default aliases
            if agent_id in ["default", "agt_receptionist_default"]:
                return await self.get_or_create_primary_agent(ctx)
            raise HTTPException(status_code=404, detail=f"AI Agent '{agent_id}' not found for this organization.")

        # Ensure that if it's an organization agent, caller belongs to that organization
        if agent.scope == "ORGANIZATION" and agent.organization_id != ctx.organization_id and ctx.role != "superadmin":
            raise HTTPException(status_code=404, detail="AI Agent not found for this organization.")

        return agent

    async def list_agents(self, ctx: TenantContext) -> List[AgentConfiguration]:
        """Lists all agents available to the caller's organization (org-scoped + platform defaults)."""
        return await self.agent_repo.list_by_org(ctx.organization_id, include_global=True)

    async def get_available_agents(self, ctx: TenantContext) -> Dict[str, List[AgentConfiguration]]:
        """Returns clean grouped dict of active agents for call selection: { 'my_agents': [...], 'default_agents': [...] }."""
        return await self.agent_repo.get_available_for_org(ctx.organization_id)

    async def create_agent(self, ctx: TenantContext, config: AgentConfiguration) -> AgentConfiguration:
        """Creates a new AI Agent, strictly enforcing scope and RBAC permissions."""
        if not config.agent_id:
            config.agent_id = f"agt_{uuid.uuid4().hex[:10]}"

        if config.scope == "GLOBAL":
            if ctx.role != "superadmin":
                raise HTTPException(
                    status_code=403,
                    detail="Only platform SuperAdmins have permission to create GLOBAL default agents."
                )
            config.organization_id = "global"
        else:
            config.scope = "ORGANIZATION"
            config.organization_id = ctx.organization_id

        config.owner_user_id = ctx.user_id
        config.created_by = ctx.user_id
        config.updated_by = ctx.user_id
        config.version = 1
        config.created_at = datetime.now(timezone.utc)
        config.updated_at = datetime.now(timezone.utc)

        return await self.agent_repo.save(config)

    async def update_agent(
        self,
        ctx: TenantContext,
        agent_id: str,
        payload: AgentConfiguration
    ) -> AgentConfiguration:
        """
        Updates an existing AI Agent and increments the version.
        Prevents organization users from modifying Global agents directly.
        """
        existing = await self.get_agent_by_id(ctx, agent_id)

        # RBAC Check: Global agents can only be updated by SuperAdmin
        if existing.scope == "GLOBAL":
            if ctx.role != "superadmin":
                raise HTTPException(
                    status_code=403,
                    detail="Global platform agents cannot be modified directly. Please duplicate the agent to customize it for your organization."
                )

        # RBAC Check: Org agents can only be edited by Admins / SuperAdmins in that tenant
        if existing.scope == "ORGANIZATION":
            if ctx.role not in ["admin", "superadmin"] and existing.owner_user_id != ctx.user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You do not have permission to modify this organization agent."
                )

        payload.agent_id = agent_id
        payload.organization_id = existing.organization_id
        payload.scope = existing.scope
        return await self.agent_repo.update(
            agent_id=agent_id,
            organization_id=existing.organization_id or ctx.organization_id,
            updated_config=payload,
            updated_by=ctx.user_id
        )

    async def save_agent(self, ctx: TenantContext, config: AgentConfiguration) -> AgentConfiguration:
        """Saves or updates an agent configuration for the tenant organization."""
        config.organization_id = ctx.organization_id
        if config.scope == "GLOBAL" and ctx.role != "superadmin":
            config.scope = "ORGANIZATION"
        existing = await self.agent_repo.get_by_id(ctx.organization_id, config.agent_id)
        if existing and existing.scope != "GLOBAL":
            return await self.update_agent(ctx, config.agent_id, config)
        return await self.create_agent(ctx, config)

    async def duplicate_agent(self, ctx: TenantContext, agent_id: str) -> AgentConfiguration:
        """Duplicates an agent into the caller's organization as an editable private copy."""
        # Validate source agent exists and is accessible
        source = await self.get_agent_by_id(ctx, agent_id)
        return await self.agent_repo.duplicate(
            agent_id=source.agent_id,
            source_org_id=source.organization_id or "global",
            target_org_id=ctx.organization_id,
            user_id=ctx.user_id
        )

    async def set_status(self, ctx: TenantContext, agent_id: str, status: str) -> AgentConfiguration:
        """Activates, deactivates, or archives an agent with RBAC checks."""
        existing = await self.get_agent_by_id(ctx, agent_id)
        if existing.scope == "GLOBAL" and ctx.role != "superadmin":
            raise HTTPException(status_code=403, detail="Only SuperAdmins can change status of Global agents.")

        if ctx.role not in ["admin", "superadmin"] and existing.owner_user_id != ctx.user_id:
            raise HTTPException(status_code=403, detail="Permission denied to change agent status.")

        return await self.agent_repo.set_status(
            agent_id=agent_id,
            organization_id=existing.organization_id or ctx.organization_id,
            status=status,
            updated_by=ctx.user_id
        )
