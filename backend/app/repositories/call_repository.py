import logging
import os
import time
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone
import asyncio
from app.models.call import Call
from app.core.cosmos import get_calls_container, COSMOS_CALLS_PARTITION_FIELD
from app.core.cosmos_metrics import timed_query

logger = logging.getLogger(__name__)

_CALLS_CACHE: Dict[str, Tuple[List[Call], float]] = {}
CALLS_CACHE_TTL_SECONDS = 15.0
_MAX_CACHE_KEYS = 200
# The most calls one list loads. This used to be a hard 100, so an organisation's call list, lead count and dashboards stopped
# growing at 100: every new call pushed the oldest one out of view.
MAX_CALLS_PER_LIST = int(os.getenv("CALLS_LIST_MAX", "5000"))

# True once the calls container is partitioned by /organization_id: every "calls of an organisation" read is then a
# single-partition query instead of a fan-out across all partitions (see core/cosmos.py).
_ORG_PARTITIONED = COSMOS_CALLS_PARTITION_FIELD == "organization_id"

# Most lookups only know the call id or Twilio SID. Remember each call's partition value as calls are listed / saved
# so later lookups can be 1-RU point reads instead of cross-partition queries.
_CALL_PARTITION: Dict[str, str] = {}
_CALL_SID_INDEX: Dict[str, str] = {}  # call_sid -> call id
_MAX_REMEMBERED = 50000

# Columns needed by list views (everything heavy such as transcript, agent snapshot and analytics is left out)
_LIGHT_COLUMNS = (
    "c.id, c.organization_id, c.user_id, c.prospect_id, c.campaign_id, c.twilio_configuration_id, c.call_sid, "
    "c.session_id, c.call_session_id, c.from_number, c.to_number, c.duration, c.status, c.agent_id, "
    "c.agent_version, c.agent_name, c.agent_scope, c.outcome, c.business_outcome, c.summary, c.intent, "
    "c.sentiment, c.lead_score, c.interest_level, c.classification, c.callback_datetime, c.next_action, "
    "c.analytics_status, c.created_at, c.updated_at, SUBSTRING(c.prompt, 0, 500) AS prompt"
)

# Light columns plus the analytics payload, but still no transcript / agent snapshot / prompt (read-only reporting).
_ANALYTICS_COLUMNS = (
    "c.id, c.organization_id, c.user_id, c.prospect_id, c.campaign_id, c.twilio_configuration_id, c.call_sid, "
    "c.session_id, c.call_session_id, c.from_number, c.to_number, c.duration, c.status, c.agent_id, "
    "c.agent_version, c.agent_name, c.agent_scope, c.outcome, c.business_outcome, c.summary, c.key_insights, "
    "c.key_requirements, c.customer_questions, c.objections, c.important_info, c.intent, c.sentiment, "
    "c.lead_score, c.interest_level, c.classification, c.callback_datetime, c.next_action, c.analytics, "
    "c.analytics_status, c.is_test, c.created_at, c.updated_at, ARRAY_LENGTH(c.transcript) AS transcript_turns"
)

_CALL_FIELDS = set(Call.model_fields)


def _partition_of(item: Dict[str, Any]) -> Optional[str]:
    return item.get(COSMOS_CALLS_PARTITION_FIELD)


def _remember_call(item_id, partition_value, call_sid=None):
    if len(_CALL_PARTITION) > _MAX_REMEMBERED:
        _CALL_PARTITION.clear()
        _CALL_SID_INDEX.clear()
    if item_id and partition_value:
        _CALL_PARTITION[item_id] = partition_value
    if call_sid and item_id:
        _CALL_SID_INDEX[call_sid] = item_id


def _remember_item(item: Dict[str, Any]):
    _remember_call(item.get("id"), _partition_of(item), item.get("call_sid"))


def _cache_put(key: str, value: List[Call]):
    if len(_CALLS_CACHE) >= _MAX_CACHE_KEYS:
        _CALLS_CACHE.clear()
    _CALLS_CACHE[key] = (value, time.time())


def _invalidate_calls_cache(org_id: Optional[str] = None):
    if org_id:
        # list_by_org, list_summaries_by_org and list_analytics_by_org all key on the organisation
        for key in [k for k in _CALLS_CACHE if f":{org_id}:" in f":{k}:" or k.startswith("__all_calls__")]:
            _CALLS_CACHE.pop(key, None)
    else:
        _CALLS_CACHE.clear()
    from app.core.cache_events import notify_data_changed
    notify_data_changed(org_id)


def _parse_dt(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return fallback
    return fallback


def _item_to_call(item: Dict[str, Any], default_org: str = "") -> Call:
    """Builds a Call from a stored document (or a projection of one). Fields that were not selected stay at their
    model default, and Cosmos system properties (_rid, _etag, ...) are ignored."""
    now = datetime.now(timezone.utc)
    created_dt = _parse_dt(item.get("created_at"), now)
    data = {k: v for k, v in item.items() if k in _CALL_FIELDS}
    data.update(
        organization_id=item.get("organization_id", default_org),
        user_id=item.get("user_id", ""),
        twilio_configuration_id=item.get("twilio_configuration_id", ""),
        from_number=item.get("from_number", ""),
        to_number=item.get("to_number", ""),
        duration=int(item.get("duration") or 0),
        status=item.get("status", "initiated"),
        analytics_status=item.get("analytics_status") or "ready",
        created_at=created_dt,
        updated_at=_parse_dt(item.get("updated_at"), created_dt),
    )
    return Call.model_validate(data)


def _matches_type(agent_id: Optional[str], call_type: Optional[str]) -> bool:
    if call_type == "simple":
        return not agent_id
    if call_type == "ai":
        return bool(agent_id)
    return True


def _type_filter_sql(call_type: Optional[str]) -> str:
    if call_type == "simple":
        return " AND (NOT IS_DEFINED(c.agent_id) OR IS_NULL(c.agent_id) OR c.agent_id = '')"
    if call_type == "ai":
        return " AND IS_DEFINED(c.agent_id) AND NOT IS_NULL(c.agent_id) AND c.agent_id != ''"
    return ""


class CallRepository:
    def __init__(self):
        self._memory_store: Dict[str, Call] = {}

    # ------------------------------------------------------------ list queries

    def _query_org_calls(self, container, columns: str, organization_id: str, call_type: Optional[str]) -> List[Dict[str, Any]]:
        query = (
            f"SELECT TOP {MAX_CALLS_PER_LIST} {columns} FROM c WHERE c.organization_id = @organization_id"
            f"{_type_filter_sql(call_type)} ORDER BY c.created_at DESC"
        )
        params = [{"name": "@organization_id", "value": organization_id}]
        label = "calls.list_by_org"
        if _ORG_PARTITIONED:
            return timed_query(container, label, query, params, partition_key=organization_id)
        return timed_query(container, label, query, params, enable_cross_partition_query=True)

    async def _list_by_org_cached(
        self, cache_prefix: str, columns: str, organization_id: str, call_type: Optional[str], label: str
    ) -> List[Call]:
        cache_key = f"{cache_prefix}:{organization_id}:{call_type or 'all'}"
        cached = _CALLS_CACHE.get(cache_key)
        if cached:
            data, ts = cached
            if time.time() - ts < CALLS_CACHE_TTL_SECONDS:
                return data
            _CALLS_CACHE.pop(cache_key, None)

        def _memory_fallback() -> List[Call]:
            return [c for c in self._memory_store.values()
                    if c.organization_id == organization_id and _matches_type(c.agent_id, call_type)]

        def _sync_list():
            container = get_calls_container()
            if not container:
                return _memory_fallback()
            try:
                items = self._query_org_calls(container, columns, organization_id, call_type)
            except Exception as e:
                logger.error("%s failed: %s", label, e)
                return _memory_fallback()
            calls = []
            for item in items:
                _remember_item(item)
                calls.append(_item_to_call(item, organization_id))
            _cache_put(cache_key, calls)
            return calls

        return await asyncio.to_thread(_sync_list)

    async def list_by_org(self, organization_id: str, call_type: Optional[str] = None) -> List[Call]:
        """Full documents (transcript, agent snapshot, analytics). Heavy: prefer the lighter lists when you can."""
        return await self._list_by_org_cached("full", "*", organization_id, call_type, "list_by_org")

    async def list_summaries_by_org(self, organization_id: str, call_type: Optional[str] = None) -> List[Call]:
        """Lightweight call list for tables: no transcript, agent snapshot or analytics payloads.
        These objects are READ-ONLY views. Never save() them, because that would overwrite the full document."""
        return await self._list_by_org_cached("light", _LIGHT_COLUMNS, organization_id, call_type, "list_summaries_by_org")

    async def list_analytics_by_org(self, organization_id: str, call_type: Optional[str] = None) -> List[Call]:
        """Calls with their analytics payload but without transcript / agent snapshot / prompt (the bulky parts).
        READ-ONLY views: never save() them, because that would overwrite the full document."""
        return await self._list_by_org_cached("analytics", _ANALYTICS_COLUMNS, organization_id, call_type, "list_analytics_by_org")

    async def hydrate_agent_snapshots(self, calls: List[Call]) -> None:
        """Fills `agent_config_snapshot` on already-loaded reporting views, for just the calls that need it
        (e.g. call-back scheduling reads the agent's time zone), instead of loading it for every call."""
        missing = [c for c in calls if not c.agent_config_snapshot]
        if not missing:
            return

        def _sync_hydrate():
            container = get_calls_container()
            if not container:
                return
            by_id = {c.id: c for c in missing}
            ids = list(by_id)
            org_ids = {c.organization_id for c in missing}
            for start in range(0, len(ids), 100):
                chunk = ids[start:start + 100]
                query = "SELECT c.id, c.agent_config_snapshot FROM c WHERE ARRAY_CONTAINS(@ids, c.id)"
                params = [{"name": "@ids", "value": chunk}]
                try:
                    if _ORG_PARTITIONED and len(org_ids) == 1:
                        rows = list(container.query_items(query=query, parameters=params, partition_key=next(iter(org_ids))))
                    else:
                        rows = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                except Exception as e:
                    logger.error("hydrate_agent_snapshots failed: %s", e)
                    return
                for row in rows:
                    target = by_id.get(row.get("id"))
                    if target is not None and row.get("agent_config_snapshot"):
                        target.agent_config_snapshot = row["agent_config_snapshot"]

        await asyncio.to_thread(_sync_hydrate)

    async def list_all_calls(self, limit: int = 5000, since: Optional[datetime] = None) -> List[Call]:
        """Lists calls across all tenant organizations for SuperAdmin platform usage and cost tracking.
        `since` pushes the date window into the query so a "last 7 days" view does not read months of transcripts."""
        since_key = since.isoformat() if since else "all"
        cache_key = f"__all_calls__:{limit}:{since_key}"
        cached = _CALLS_CACHE.get(cache_key)
        if cached:
            data, ts = cached
            if time.time() - ts < CALLS_CACHE_TTL_SECONDS:
                return data
            _CALLS_CACHE.pop(cache_key, None)

        def _sync_list_all():
            container = get_calls_container()
            if not container:
                return list(self._memory_store.values())

            where = " WHERE c.created_at >= @since" if since else ""
            params = [{"name": "@since", "value": since.isoformat()}] if since else []
            query = f"SELECT TOP {int(limit)} * FROM c{where} ORDER BY c.created_at DESC"
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                calls = [_item_to_call(item, "unknown") for item in items]
                _cache_put(cache_key, calls)
                return calls
            except Exception as e:
                logger.error("list_all_calls failed: %s", e)
                return list(self._memory_store.values())

        return await asyncio.to_thread(_sync_list_all)

    async def list_pending_analytics(self, created_after: datetime, created_before: datetime) -> List[Call]:
        """Calls whose post-call analysis never finished, found by a filtered query rather than by loading
        recent calls of every tenant (with their transcripts) and filtering in Python."""
        def _sync_list():
            container = get_calls_container()
            if not container:
                return [c for c in self._memory_store.values() if getattr(c, "analytics_status", None) == "pending"]
            query = (
                "SELECT * FROM c WHERE c.analytics_status = 'pending' "
                "AND c.created_at >= @after AND c.created_at <= @before"
            )
            params = [
                {"name": "@after", "value": created_after.isoformat()},
                {"name": "@before", "value": created_before.isoformat()},
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                return [_item_to_call(item, "unknown") for item in items]
            except Exception as e:
                logger.error("list_pending_analytics failed: %s", e)
                return []

        return await asyncio.to_thread(_sync_list)

    # ---------------------------------------------------------- single lookups

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
                # 1-RU point read when this call's partition is already known; the OR-query fans out across partitions
                known_id = call_id if call_id in _CALL_PARTITION else _CALL_SID_INDEX.get(call_id)
                if known_id and _CALL_PARTITION.get(known_id):
                    try:
                        items = [container.read_item(item=known_id, partition_key=_CALL_PARTITION[known_id])]
                    except Exception:
                        items = []
                if not items:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    _remember_item(items[0])
                    return _item_to_call(items[0])
            except Exception as e:
                logger.error("get_by_id failed: %s", e)
            return self._memory_store.get(call_id)

        return await asyncio.to_thread(_sync_get)

    async def get_by_call_sid(self, call_sid: str) -> Optional[Call]:
        def _sync_get():
            container = get_calls_container()
            if not container:
                return next((c for c in self._memory_store.values() if c.call_sid == call_sid), None)
            try:
                items = []
                known_id = _CALL_SID_INDEX.get(call_sid)
                if known_id and _CALL_PARTITION.get(known_id):
                    try:
                        items = [container.read_item(item=known_id, partition_key=_CALL_PARTITION[known_id])]
                    except Exception:
                        items = []
                if not items:
                    query = "SELECT * FROM c WHERE c.call_sid = @call_sid"
                    params = [{"name": "@call_sid", "value": call_sid}]
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    _remember_item(items[0])
                    return _item_to_call(items[0])
            except Exception as e:
                logger.error("get_by_call_sid failed: %s", e)
            return next((c for c in self._memory_store.values() if c.call_sid == call_sid), None)

        return await asyncio.to_thread(_sync_get)

    # ------------------------------------------------------------------ writes

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
                        logger.error("save attempt %s/3 for call %s: %s", attempt, call.id, e)
                        if attempt < 3:
                            time.sleep(0.4 * attempt)
            _remember_call(call.id, doc.get(COSMOS_CALLS_PARTITION_FIELD) if container else getattr(call, COSMOS_CALLS_PARTITION_FIELD, None), call.call_sid)
            _invalidate_calls_cache(call.organization_id)
            return call
        return await asyncio.to_thread(_sync_save)
