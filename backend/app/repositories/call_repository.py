from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import asyncio
from app.models.call import Call
from app.core.cosmos import get_calls_container

class CallRepository:
    def __init__(self):
        self._memory_store: Dict[str, Call] = {}

    async def list_by_org(self, organization_id: str) -> List[Call]:
        def _sync_list():
            container = get_calls_container()
            if not container:
                return [c for c in self._memory_store.values() if c.organization_id == organization_id]
            query = "SELECT * FROM c WHERE c.organization_id = @organization_id ORDER BY c.created_at DESC"
            params = [{"name": "@organization_id", "value": organization_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                calls = []
                for item in items:
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    calls.append(Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", organization_id),
                        user_id=item.get("user_id", ""),
                        twilio_configuration_id=item.get("twilio_configuration_id", ""),
                        call_sid=item.get("call_sid"),
                        from_number=item.get("from_number", ""),
                        to_number=item.get("to_number", ""),
                        duration=int(item.get("duration", 0)),
                        prompt=item.get("prompt"),
                        status=item.get("status", "initiated"),
                        agent_id=item.get("agent_id"),
                        agent_version=item.get("agent_version", 1),
                        agent_name=item.get("agent_name"),
                        agent_scope=item.get("agent_scope"),
                        agent_config_snapshot=item.get("agent_config_snapshot"),
                        transcript=item.get("transcript"),
                        outcome=item.get("outcome"),
                        latency_metrics=item.get("latency_metrics"),
                        error_information=item.get("error_information"),
                        created_at=created_dt,
                        updated_at=updated_dt
                    ))
                return calls
            except Exception as e:
                print(f"[CallRepository Error] list_by_org: {e}")
                return [c for c in self._memory_store.values() if c.organization_id == organization_id]

        return await asyncio.to_thread(_sync_list)

    async def get_by_id(self, call_id: str) -> Optional[Call]:
        def _sync_get():
            container = get_calls_container()
            if not container:
                return self._memory_store.get(call_id)
            query = "SELECT * FROM c WHERE c.id = @call_id"
            params = [{"name": "@call_id", "value": call_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    item = items[0]
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    return Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", ""),
                        user_id=item.get("user_id", ""),
                        twilio_configuration_id=item.get("twilio_configuration_id", ""),
                        call_sid=item.get("call_sid"),
                        from_number=item.get("from_number", ""),
                        to_number=item.get("to_number", ""),
                        duration=int(item.get("duration", 0)),
                        prompt=item.get("prompt"),
                        status=item.get("status", "initiated"),
                        agent_id=item.get("agent_id"),
                        agent_version=item.get("agent_version", 1),
                        agent_name=item.get("agent_name"),
                        agent_scope=item.get("agent_scope"),
                        agent_config_snapshot=item.get("agent_config_snapshot"),
                        transcript=item.get("transcript"),
                        outcome=item.get("outcome"),
                        latency_metrics=item.get("latency_metrics"),
                        error_information=item.get("error_information"),
                        created_at=created_dt,
                        updated_at=updated_dt
                    )
            except Exception as e:
                print(f"[CallRepository Error] get_by_id: {e}")
            return self._memory_store.get(call_id)

        return await asyncio.to_thread(_sync_get)

    async def get_by_call_sid(self, call_sid: str) -> Optional[Call]:
        def _sync_get():
            container = get_calls_container()
            if not container:
                return next((c for c in self._memory_store.values() if c.call_sid == call_sid), None)
            query = "SELECT * FROM c WHERE c.call_sid = @call_sid"
            params = [{"name": "@call_sid", "value": call_sid}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    item = items[0]
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    return Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", ""),
                        user_id=item.get("user_id", ""),
                        twilio_configuration_id=item.get("twilio_configuration_id", ""),
                        call_sid=item.get("call_sid"),
                        from_number=item.get("from_number", ""),
                        to_number=item.get("to_number", ""),
                        duration=int(item.get("duration", 0)),
                        prompt=item.get("prompt"),
                        status=item.get("status", "initiated"),
                        agent_id=item.get("agent_id"),
                        agent_version=item.get("agent_version", 1),
                        agent_name=item.get("agent_name"),
                        agent_scope=item.get("agent_scope"),
                        agent_config_snapshot=item.get("agent_config_snapshot"),
                        transcript=item.get("transcript"),
                        outcome=item.get("outcome"),
                        latency_metrics=item.get("latency_metrics"),
                        error_information=item.get("error_information"),
                        created_at=created_dt,
                        updated_at=updated_dt
                    )
            except Exception as e:
                print(f"[CallRepository Error] get_by_call_sid: {e}")
            return next((c for c in self._memory_store.values() if c.call_sid == call_sid), None)

        return await asyncio.to_thread(_sync_get)

    async def save(self, call: Call) -> Call:
        def _sync_save():
            self._memory_store[call.id] = call
            container = get_calls_container()
            if container:
                try:
                    doc = call.model_dump(mode="json")
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[CallRepository Error] save: {e}")
            return call

        return await asyncio.to_thread(_sync_save)
