import time
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone
import asyncio
from app.models.call import Call
from app.core.cosmos import get_calls_container

_CALLS_CACHE: Dict[str, Tuple[List[Call], float]] = {}
CALLS_CACHE_TTL_SECONDS = 15.0

# The calls container is partitioned by /user_id, but most lookups only know the call id or Twilio SID.
# Remember each call's partition value as calls are listed / saved so later lookups can be 1-RU point reads
# instead of cross-partition queries.
_CALL_PARTITION: Dict[str, str] = {}
_CALL_SID_INDEX: Dict[str, str] = {}  # call_sid -> call id

# Columns needed by list views (everything heavy such as transcript, agent snapshot and analytics is left out)
_LIGHT_COLUMNS = (
    "c.id, c.organization_id, c.user_id, c.prospect_id, c.campaign_id, c.twilio_configuration_id, c.call_sid, "
    "c.session_id, c.call_session_id, c.from_number, c.to_number, c.duration, c.status, c.agent_id, "
    "c.agent_version, c.agent_name, c.agent_scope, c.outcome, c.business_outcome, c.summary, c.intent, "
    "c.sentiment, c.lead_score, c.interest_level, c.classification, c.callback_datetime, c.next_action, "
    "c.analytics_status, c.created_at, c.updated_at, SUBSTRING(c.prompt, 0, 500) AS prompt"
)


def _remember_call(item_id, user_id, call_sid=None):
    if item_id and user_id:
        _CALL_PARTITION[item_id] = user_id
    if call_sid and item_id:
        _CALL_SID_INDEX[call_sid] = item_id

def _invalidate_calls_cache(org_id: Optional[str] = None):
    if org_id and org_id in _CALLS_CACHE:
        del _CALLS_CACHE[org_id]
    else:
        _CALLS_CACHE.clear()
    from app.core.cache_events import notify_data_changed
    notify_data_changed(org_id)

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
                    _remember_call(item["id"], item.get("user_id"), item.get("call_sid"))
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
                        campaign_id=item.get("campaign_id"),
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
                        business_outcome=item.get("business_outcome"),
                        key_requirements=item.get("key_requirements"),
                        customer_questions=item.get("customer_questions"),
                        objections=item.get("objections"),
                        important_info=item.get("important_info"),
                        next_action=item.get("next_action"),
                        session_id=item.get("session_id"),
                        call_session_id=item.get("call_session_id"),
                        analytics_status=item.get("analytics_status") or "ready",
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

    async def list_summaries_by_org(self, organization_id: str, call_type: Optional[str] = None) -> List[Call]:
        """Lightweight call list for tables: no transcript, agent snapshot or analytics payloads.
        These objects are READ-ONLY views. Never save() them, because that would overwrite the full document."""
        cache_key = f"light:{organization_id}:{call_type or 'all'}"
        cached = _CALLS_CACHE.get(cache_key)
        if cached:
            data, ts = cached
            if time.time() - ts < CALLS_CACHE_TTL_SECONDS:
                return data
            del _CALLS_CACHE[cache_key]

        def _sync_light():
            container = get_calls_container()
            if not container:
                all_calls = [c for c in self._memory_store.values() if c.organization_id == organization_id]
                if call_type == "simple":
                    return [c for c in all_calls if not c.agent_id]
                if call_type == "ai":
                    return [c for c in all_calls if c.agent_id]
                return all_calls

            type_filter = ""
            if call_type == "simple":
                type_filter = " AND (NOT IS_DEFINED(c.agent_id) OR IS_NULL(c.agent_id) OR c.agent_id = '')"
            elif call_type == "ai":
                type_filter = " AND IS_DEFINED(c.agent_id) AND NOT IS_NULL(c.agent_id) AND c.agent_id != ''"
            query = (
                f"SELECT TOP 100 {_LIGHT_COLUMNS} FROM c WHERE c.organization_id = @organization_id{type_filter} "
                "ORDER BY c.created_at DESC"
            )
            params = [{"name": "@organization_id", "value": organization_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
            except Exception as e:
                print(f"[CallRepository Error] list_summaries_by_org: {e}")
                return []

            calls = []
            for item in items:
                _remember_call(item["id"], item.get("user_id"), item.get("call_sid"))
                created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else created_dt
                calls.append(Call(
                    id=item["id"],
                    organization_id=item.get("organization_id", organization_id),
                    user_id=item.get("user_id", ""),
                    prospect_id=item.get("prospect_id"),
                    campaign_id=item.get("campaign_id"),
                    twilio_configuration_id=item.get("twilio_configuration_id", ""),
                    call_sid=item.get("call_sid"),
                    session_id=item.get("session_id"),
                    call_session_id=item.get("call_session_id"),
                    from_number=item.get("from_number", ""),
                    to_number=item.get("to_number", ""),
                    duration=int(item.get("duration") or 0),
                    prompt=item.get("prompt"),
                    status=item.get("status", "initiated"),
                    agent_id=item.get("agent_id"),
                    agent_version=item.get("agent_version", 1),
                    agent_name=item.get("agent_name"),
                    agent_scope=item.get("agent_scope"),
                    outcome=item.get("outcome"),
                    business_outcome=item.get("business_outcome"),
                    summary=item.get("summary"),
                    intent=item.get("intent"),
                    sentiment=item.get("sentiment"),
                    lead_score=item.get("lead_score"),
                    interest_level=item.get("interest_level"),
                    classification=item.get("classification"),
                    callback_datetime=item.get("callback_datetime"),
                    next_action=item.get("next_action"),
                    analytics_status=item.get("analytics_status") or "ready",
                    created_at=created_dt,
                    updated_at=updated_dt,
                ))
            _CALLS_CACHE[cache_key] = (calls, time.time())
            return calls

        return await asyncio.to_thread(_sync_light)

    async def get_by_id(self, call_id: str) -> Optional[Call]:
        def _sync_get():
            container = get_calls_container()
            if not container:
                item = self._memory_store.get(call_id)
                if not item:
                    item = next((c for c in self._memory_store.values() if getattr(c, 'call_sid', None) == call_id or getattr(c, 'session_id', None) == call_id), None)
                return item

            query = "SELECT * FROM c WHERE c.id = @call_id OR c.session_id = @call_id OR c.call_session_id = @call_id OR c.call_sid = @call_id"
            params = [{"name": "@call_id", "value": call_id}]
            try:
                items = []
                # 1-RU point read when this call's partition (user_id) is already known; the OR-query is cross-partition
                known_id = call_id if call_id in _CALL_PARTITION else _CALL_SID_INDEX.get(call_id)
                if known_id and _CALL_PARTITION.get(known_id):
                    try:
                        items = [container.read_item(item=known_id, partition_key=_CALL_PARTITION[known_id])]
                    except Exception:
                        items = []
                if not items:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    _remember_call(items[0].get("id"), items[0].get("user_id"), items[0].get("call_sid"))
                    item = items[0]
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    return Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", ""),
                        user_id=item.get("user_id", ""),
                        prospect_id=item.get("prospect_id"),
                        campaign_id=item.get("campaign_id"),
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
                        business_outcome=item.get("business_outcome"),
                        key_requirements=item.get("key_requirements"),
                        customer_questions=item.get("customer_questions"),
                        objections=item.get("objections"),
                        important_info=item.get("important_info"),
                        next_action=item.get("next_action"),
                        session_id=item.get("session_id"),
                        call_session_id=item.get("call_session_id"),
                        analytics_status=item.get("analytics_status") or "ready",
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
                        campaign_id=item.get("campaign_id"),
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
                        business_outcome=item.get("business_outcome"),
                        key_requirements=item.get("key_requirements"),
                        customer_questions=item.get("customer_questions"),
                        objections=item.get("objections"),
                        important_info=item.get("important_info"),
                        next_action=item.get("next_action"),
                        session_id=item.get("session_id"),
                        call_session_id=item.get("call_session_id"),
                        analytics_status=item.get("analytics_status") or "ready",
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
                doc = call.model_dump(mode="json")
                # Retry transient database failures (throttling, timeouts) so a finished call is never lost silently
                for attempt in range(1, 4):
                    try:
                        container.upsert_item(body=doc)
                        break
                    except Exception as e:
                        print(f"[CallRepository Error] save attempt {attempt}/3 for call {call.id}: {e}")
                        if attempt < 3:
                            time.sleep(0.4 * attempt)
            _remember_call(call.id, call.user_id, call.call_sid)
            _invalidate_calls_cache(call.organization_id)
            return call
        return await asyncio.to_thread(_sync_save)

    async def list_all_calls(self, limit: int = 5000) -> List[Call]:
        """Lists calls across all tenant organizations for SuperAdmin platform usage and cost tracking."""
        cache_key = f"__all_calls__:{limit}"
        cached = _CALLS_CACHE.get(cache_key)
        if cached:
            data, ts = cached
            if time.time() - ts < CALLS_CACHE_TTL_SECONDS:
                return data
            del _CALLS_CACHE[cache_key]

        def _sync_list_all():
            container = get_calls_container()
            if not container:
                return list(self._memory_store.values())

            query = f"SELECT TOP {limit} * FROM c ORDER BY c.created_at DESC"
            try:
                items = list(container.query_items(query=query, enable_cross_partition_query=True))
                calls = []
                for item in items:
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    calls.append(Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", "unknown"),
                        user_id=item.get("user_id", ""),
                        prospect_id=item.get("prospect_id"),
                        campaign_id=item.get("campaign_id"),
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
                        business_outcome=item.get("business_outcome"),
                        key_requirements=item.get("key_requirements"),
                        customer_questions=item.get("customer_questions"),
                        objections=item.get("objections"),
                        important_info=item.get("important_info"),
                        next_action=item.get("next_action"),
                        session_id=item.get("session_id"),
                        call_session_id=item.get("call_session_id"),
                        analytics_status=item.get("analytics_status") or "ready",
                        created_at=created_dt,
                        updated_at=updated_dt
                    ))
                _CALLS_CACHE[cache_key] = (calls, time.time())
                return calls
            except Exception as e:
                print(f"[CallRepository Error] list_all_calls: {e}")
                return list(self._memory_store.values())

        return await asyncio.to_thread(_sync_list_all)
