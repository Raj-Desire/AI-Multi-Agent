"""
Agent Configuration Repository
Provides tenant-isolated persistence for AgentConfiguration models in Cosmos DB with fallback memory storage.
Supports GLOBAL (platform default) and ORGANIZATION (private tenant) scopes, versioning, duplication, and status transitions.
"""

import time
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import uuid
import copy

from app.agents.configuration import AgentConfiguration, get_default_platform_agents, get_default_receptionist_agent
from app.core.cosmos import get_agents_container


# In-memory agent list cache with TTL for fast load times (<1ms)
_AGENT_CACHE: Dict[str, Tuple[List[AgentConfiguration], float]] = {}
AGENT_CACHE_TTL_SECONDS = 60.0

def _invalidate_agent_cache(org_id: Optional[str] = None):
    if org_id and org_id in _AGENT_CACHE:
        del _AGENT_CACHE[org_id]
    if "global" in _AGENT_CACHE:
        del _AGENT_CACHE["global"]
    # Clear all org caches if a global agent was modified
    _AGENT_CACHE.clear()


class AgentRepository:
    """Repository handling tenant-isolated persistence of AI Agent configurations."""

    def __init__(self):
        # In-memory store fallback: { "organization_id": { "agent_id": AgentConfiguration } }
        self._memory_store: Dict[str, Dict[str, AgentConfiguration]] = {}
        self._seed_global_defaults()

    def _seed_global_defaults(self):
        """Seeds platform default global agents into memory and Cosmos DB if not present."""
        if "global" not in self._memory_store:
            self._memory_store["global"] = {}

        defaults = get_default_platform_agents()
        for agt in defaults:
            if agt.agent_id not in self._memory_store["global"]:
                self._memory_store["global"][agt.agent_id] = agt

    async def seed_cosmos_defaults(self):
        """Ensures Cosmos DB contains global default agents."""
        def _sync_seed():
            container = get_agents_container()
            if not container:
                return
            for agt in get_default_platform_agents():
                doc_id = f"global_{agt.agent_id}"
                query = "SELECT * FROM c WHERE c.id = @doc_id"
                params = [{"name": "@doc_id", "value": doc_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    if not items:
                        doc = agt.model_dump(mode="json")
                        doc["id"] = doc_id
                        container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[AgentRepository Warning] Cosmos DB seed failed for {agt.agent_id}: {e}")

        await asyncio.to_thread(_sync_seed)

    async def get_by_id(self, organization_id: str, agent_id: str) -> Optional[AgentConfiguration]:
        """
        Retrieves a specific agent by ID.
        Strictly enforces tenant isolation: returns the agent if it belongs to organization_id OR is a GLOBAL agent.
        """
        def _sync_get():
            container = get_agents_container()
            if container:
                # Query within organization partition
                query = "SELECT * FROM c WHERE (c.organization_id = @org_id OR c.organization_id = 'global' OR c.scope = 'GLOBAL') AND c.agent_id = @agent_id"
                params = [
                    {"name": "@org_id", "value": organization_id},
                    {"name": "@agent_id", "value": agent_id}
                ]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    if items:
                        # Prioritize org-specific match if both exist
                        org_item = next((i for i in items if i.get("organization_id") == organization_id), items[0])
                        return AgentConfiguration.model_validate(org_item)
                except Exception as e:
                    print(f"[AgentRepository Warning] get_by_id failed for {agent_id}: {e}")

            # Memory fallback
            org_agents = self._memory_store.get(organization_id, {})
            if agent_id in org_agents:
                return org_agents[agent_id]
            global_agents = self._memory_store.get("global", {})
            if agent_id in global_agents:
                return global_agents[agent_id]
            return None

        return await asyncio.to_thread(_sync_get)

    async def list_by_org(self, organization_id: str, include_global: bool = True) -> List[AgentConfiguration]:
        """Lists all agent configurations for a given organization (including global defaults if requested)."""
        cache_key = f"{organization_id}_{include_global}"
        cached = _AGENT_CACHE.get(cache_key)
        if cached:
            data, ts = cached
            if time.time() - ts < AGENT_CACHE_TTL_SECONDS:
                return data
            del _AGENT_CACHE[cache_key]

        def _sync_list():
            results: List[AgentConfiguration] = []
            seen_agent_ids = set()

            container = get_agents_container()
            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @org_id"
                params = [{"name": "@org_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        cfg = AgentConfiguration.model_validate(item)
                        if cfg.agent_id not in seen_agent_ids:
                            results.append(cfg)
                            seen_agent_ids.add(cfg.agent_id)
                except Exception as e:
                    print(f"[AgentRepository Warning] list_by_org failed for org {organization_id}: {e}")

                if include_global and organization_id != "global":
                    g_query = "SELECT * FROM c WHERE c.organization_id = 'global' OR c.scope = 'GLOBAL'"
                    try:
                        g_items = list(container.query_items(query=g_query, enable_cross_partition_query=True))
                        for g_item in g_items:
                            g_cfg = AgentConfiguration.model_validate(g_item)
                            # Do not duplicate if org already overrode or has this agent_id
                            if g_cfg.agent_id not in seen_agent_ids:
                                results.append(g_cfg)
                                seen_agent_ids.add(g_cfg.agent_id)
                    except Exception as e:
                        print(f"[AgentRepository Warning] list_by_org global fetch failed: {e}")

            # Memory fallback merge
            org_mem = self._memory_store.get(organization_id, {})
            for agt in org_mem.values():
                if agt.agent_id not in seen_agent_ids:
                    results.append(agt)
                    seen_agent_ids.add(agt.agent_id)

            if include_global:
                for g_agt in self._memory_store.get("global", {}).values():
                    if g_agt.agent_id not in seen_agent_ids:
                        results.append(g_agt)
                        seen_agent_ids.add(g_agt.agent_id)

            _AGENT_CACHE[cache_key] = (results, time.time())
            return results

        return await asyncio.to_thread(_sync_list)

    async def get_available_for_org(self, organization_id: str) -> Dict[str, List[AgentConfiguration]]:
        """
        Returns active agents available for call selection, cleanly grouped into:
        - my_agents: active agents owned by this tenant
        - default_agents: active global platform agents
        """
        all_agents = await self.list_by_org(organization_id, include_global=True)
        my_agents = [
            a for a in all_agents
            if a.organization_id == organization_id and a.scope != "GLOBAL" and a.status.upper() == "ACTIVE"
        ]
        default_agents = [
            a for a in all_agents
            if (a.organization_id == "global" or a.scope == "GLOBAL") and a.status.upper() == "ACTIVE"
        ]
        return {
            "my_agents": my_agents,
            "default_agents": default_agents
        }

    async def save(self, config: AgentConfiguration) -> AgentConfiguration:
        """Saves or updates an agent configuration document."""
        def _sync_save():
            org_key = config.organization_id or "global"
            if org_key not in self._memory_store:
                self._memory_store[org_key] = {}
            self._memory_store[org_key][config.agent_id] = config

            container = get_agents_container()
            if container:
                try:
                    doc = config.model_dump(mode="json")
                    doc["id"] = f"{org_key}_{config.agent_id}"
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[AgentRepository Warning] Cosmos DB save failed for {config.agent_id}: {e}")
            _invalidate_agent_cache(org_key)
            return config

        return await asyncio.to_thread(_sync_save)

    async def update(
        self,
        agent_id: str,
        organization_id: str,
        updated_config: AgentConfiguration,
        updated_by: Optional[str] = None
    ) -> AgentConfiguration:
        """
        Updates an existing agent configuration and increments the version number.
        Preserves agent identity and tenant ownership.
        """
        existing = await self.get_by_id(organization_id, agent_id)
        if not existing:
            # Fallback to saving new
            updated_config.agent_id = agent_id
            updated_config.organization_id = organization_id
            return await self.save(updated_config)

        # Enforce version increment
        updated_config.agent_id = agent_id
        updated_config.organization_id = existing.organization_id
        updated_config.scope = existing.scope
        updated_config.version = existing.version + 1
        updated_config.created_at = existing.created_at
        updated_config.created_by = existing.created_by
        updated_config.updated_at = datetime.now(timezone.utc)
        if updated_by:
            updated_config.updated_by = updated_by

        return await self.save(updated_config)

    async def set_status(
        self,
        agent_id: str,
        organization_id: str,
        status: str,
        updated_by: Optional[str] = None
    ) -> AgentConfiguration:
        """Transitions agent status to ACTIVE, INACTIVE, ARCHIVED, or DRAFT."""
        agent = await self.get_by_id(organization_id, agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found in organization {organization_id}")

        agent.status = status.upper()
        agent.updated_at = datetime.now(timezone.utc)
        if updated_by:
            agent.updated_by = updated_by

        return await self.save(agent)

    async def duplicate(
        self,
        agent_id: str,
        source_org_id: str,
        target_org_id: str,
        user_id: Optional[str] = None
    ) -> AgentConfiguration:
        """
        Duplicates an agent (global or organization) into the target organization.
        Creates an independent copy with scope=ORGANIZATION, version=1, status=ACTIVE.
        """
        source = await self.get_by_id(source_org_id, agent_id)
        if not source:
            source = await self.get_by_id("global", agent_id)
        if not source:
            raise ValueError(f"Source agent {agent_id} not found to duplicate.")

        new_agent_id = f"agt_{uuid.uuid4().hex[:10]}"
        new_data = source.model_dump()
        new_data["agent_id"] = new_agent_id
        new_data["id"] = f"{target_org_id}_{new_agent_id}"
        new_data["organization_id"] = target_org_id
        new_data["owner_user_id"] = user_id
        new_data["created_by"] = user_id
        new_data["updated_by"] = user_id
        new_data["scope"] = "ORGANIZATION"
        new_data["status"] = "ACTIVE"
        new_data["version"] = 1
        new_data["name"] = f"{source.name} (Copy)" if not source.name.endswith("(Copy)") else f"{source.name} 2"
        new_data["created_at"] = datetime.now(timezone.utc)
        new_data["updated_at"] = datetime.now(timezone.utc)

        duplicated = AgentConfiguration.model_validate(new_data)
        return await self.save(duplicated)

    async def get_by_org(self, organization_id: str) -> Optional[AgentConfiguration]:
        """Retrieves the active primary agent configuration for the organization (or fallback)."""
        agents = await self.list_by_org(organization_id, include_global=False)
        active_org = [a for a in agents if a.status.upper() == "ACTIVE"]
        if active_org:
            return active_org[0]
        if agents:
            return agents[0]

        # Fallback to global default receptionist
        global_rec = await self.get_by_id("global", "agt_receptionist_default")
        return global_rec or get_default_receptionist_agent(organization_id=organization_id)

    async def delete(self, organization_id: str, agent_id: str) -> bool:
        """
        Permanently deletes an agent from Cosmos DB and in-memory store.
        """
        def _sync_delete():
            container = get_agents_container()
            if container:
                doc_id = f"{organization_id}_{agent_id}"
                try:
                    container.delete_item(item=doc_id, partition_key=organization_id)
                except Exception as e:
                    print(f"[AgentRepository Warning] Cosmos DB delete failed for {doc_id}: {e}")

            if organization_id in self._memory_store and agent_id in self._memory_store[organization_id]:
                del self._memory_store[organization_id][agent_id]
            if organization_id == "global" and "global" in self._memory_store and agent_id in self._memory_store["global"]:
                del self._memory_store["global"][agent_id]

            _invalidate_agent_cache(organization_id)
            return True

        return await asyncio.to_thread(_sync_delete)
