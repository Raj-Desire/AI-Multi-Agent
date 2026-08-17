"""
Agent Configuration Repository
Provides tenant-isolated persistence for AgentConfiguration models in Cosmos DB with fallback memory storage.
"""

import asyncio
from typing import Optional, List, Dict
from app.agents.configuration import AgentConfiguration, get_default_receptionist_agent
from app.core.cosmos import get_agents_container


class AgentRepository:
    """Repository handling tenant-isolated persistence of AI Agent configurations."""

    def __init__(self):
        # In-memory store fallback for tests and development
        self._memory_store: Dict[str, Dict[str, AgentConfiguration]] = {}

    async def get_by_org(self, organization_id: str) -> Optional[AgentConfiguration]:
        """Retrieves the active primary agent configuration for the organization."""
        def _sync_get():
            container = get_agents_container()
            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @org_id"
                params = [{"name": "@org_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    if items:
                        return AgentConfiguration.model_validate(items[0])
                except Exception as e:
                    print(f"[AgentRepository Warning] get_by_org query failed: {e}")

            # Fallback to memory store
            org_agents = self._memory_store.get(organization_id, {})
            if org_agents:
                return next(iter(org_agents.values()))
            return None

        return await asyncio.to_thread(_sync_get)

    async def get_by_id(self, organization_id: str, agent_id: str) -> Optional[AgentConfiguration]:
        """Retrieves a specific agent by ID within an organization, strictly enforcing tenant isolation."""
        def _sync_get():
            container = get_agents_container()
            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @org_id AND c.agent_id = @agent_id"
                params = [
                    {"name": "@org_id", "value": organization_id},
                    {"name": "@agent_id", "value": agent_id}
                ]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    if items:
                        return AgentConfiguration.model_validate(items[0])
                except Exception as e:
                    print(f"[AgentRepository Warning] get_by_id failed: {e}")

            # Memory fallback
            return self._memory_store.get(organization_id, {}).get(agent_id)

        return await asyncio.to_thread(_sync_get)

    async def save(self, config: AgentConfiguration) -> AgentConfiguration:
        """Saves or updates an agent configuration for an organization."""
        def _sync_save():
            # Update memory store
            if config.organization_id not in self._memory_store:
                self._memory_store[config.organization_id] = {}
            self._memory_store[config.organization_id][config.agent_id] = config

            container = get_agents_container()
            if container:
                try:
                    doc = config.model_dump(mode="json")
                    doc["id"] = f"{config.organization_id}_{config.agent_id}"
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[AgentRepository Warning] CosmosDB save failed: {e}")
            return config

        return await asyncio.to_thread(_sync_save)

    async def list_by_org(self, organization_id: str) -> List[AgentConfiguration]:
        """Lists all agent configurations for a given organization."""
        def _sync_list():
            container = get_agents_container()
            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @org_id"
                params = [{"name": "@org_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    if items:
                        return [AgentConfiguration.model_validate(item) for item in items]
                except Exception as e:
                    print(f"[AgentRepository Warning] list_by_org failed: {e}")

            return list(self._memory_store.get(organization_id, {}).values())

        return await asyncio.to_thread(_sync_list)
