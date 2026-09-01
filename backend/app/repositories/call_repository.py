import time
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone
import asyncio
from app.models.call import Call
from app.core.cosmos import get_calls_container

_CALLS_CACHE: Dict[str, Tuple[List[Call], float]] = {}
CALLS_CACHE_TTL_SECONDS = 15.0

def _invalidate_calls_cache(org_id: Optional[str] = None):
    if org_id and org_id in _CALLS_CACHE:
        del _CALLS_CACHE[org_id]
    else:
        _CALLS_CACHE.clear()

class CallRepository:
    def __init__(self):
        self._memory_store: Dict[str, Call] = {}

    async def list_by_org(self, organization_id: str, call_type: Optional[str] = None) -> List[Call]:
        cache_key = f"{organization_id}:{call_type or 'all'}"
        cached = _CALLS_CACHE.get(cache_key)
        if cached:
            data, ts = cached
            if time.time() - ts < CALLS_CACHE_TTL_SECONDS:
                return data
            del _CALLS_CACHE[cache_key]

        def _sync_list():
            container = get_calls_container()
            if not container:
                all_calls = [c for c in self._memory_store.values() if c.organization_id == organization_id]
                if call_type == "simple":
                    return [c for c in all_calls if not c.agent_id or c.agent_id == ""]
                elif call_type == "ai":
                    return [c for c in all_calls if c.agent_id and c.agent_id != ""]
                return all_calls

            query = "SELECT TOP 100 * FROM c WHERE c.organization_id = @organization_id ORDER BY c.created_at DESC"
            params = [{"name": "@organization_id", "value": organization_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                calls = []
                for item in items:
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    
                    item_agent_id = item.get("agent_id")
                    if call_type == "simple" and item_agent_id and item_agent_id != "":
                        continue
                    elif call_type == "ai" and (not item_agent_id or item_agent_id == ""):
                        continue

                    calls.append(Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", organization_id),
                        user_id=item.get("user_id", ""),
                        prospect_id=item.get("prospect_id"),
                        twilio_configuration_id=item.get("twilio_configuration_id", ""),
                        call_sid=item.get("call_sid"),
                        from_number=item.get("from_number", ""),
                        to_number=item.get("to_number", ""),
                        duration=int(item.get("duration", 0)),
                        prompt=item.get("prompt"),
                        status=item.get("status", "initiated"),
                        agent_id=item_agent_id,
                        agent_version=item.get("agent_version", 1),
                        agent_name=item.get("agent_name"),
                        agent_scope=item.get("agent_scope"),
                        agent_config_snapshot=item.get("agent_config_snapshot"),
                        transcript=item.get("transcript"),
                        outcome=item.get("outcome"),
                        summary=item.get("summary"),
                        key_insights=item.get("key_insights"),
                        intent=item.get("intent"),
                        sentiment=item.get("sentiment"),
                        lead_score=item.get("lead_score"),
                        interest_level=item.get("interest_level"),
                        classification=item.get("classification"),
                        callback_datetime=item.get("callback_datetime"),
                        analytics=item.get("analytics"),
                        latency_metrics=item.get("latency_metrics"),
                        error_information=item.get("error_information"),
                        created_at=created_dt,
                        updated_at=updated_dt
                    ))
                _CALLS_CACHE[cache_key] = (calls, time.time())
                return calls
            except Exception as e:
                print(f"[CallRepository Error] list_by_org: {e}")
                all_calls = [c for c in self._memory_store.values() if c.organization_id == organization_id]
                if call_type == "simple":
                    return [c for c in all_calls if not c.agent_id or c.agent_id == ""]
                elif call_type == "ai":
                    return [c for c in all_calls if c.agent_id and c.agent_id != ""]
                return all_calls

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
                        prospect_id=item.get("prospect_id"),
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
                        summary=item.get("summary"),
                        key_insights=item.get("key_insights"),
                        intent=item.get("intent"),
                        sentiment=item.get("sentiment"),
                        lead_score=item.get("lead_score"),
                        interest_level=item.get("interest_level"),
                        classification=item.get("classification"),
                        callback_datetime=item.get("callback_datetime"),
                        analytics=item.get("analytics"),
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
                        prospect_id=item.get("prospect_id"),
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
                        summary=item.get("summary"),
                        key_insights=item.get("key_insights"),
                        intent=item.get("intent"),
                        sentiment=item.get("sentiment"),
                        lead_score=item.get("lead_score"),
                        interest_level=item.get("interest_level"),
                        classification=item.get("classification"),
                        callback_datetime=item.get("callback_datetime"),
                        analytics=item.get("analytics"),
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
            _invalidate_calls_cache(call.organization_id)
            return call

        return await asyncio.to_thread(_sync_save)
