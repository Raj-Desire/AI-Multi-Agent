import uuid
import time
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from app.models.credit import OrgCredits, LedgerEntry, CreditAssignmentLog
from app.core.cosmos import (
    get_credits_container,
    get_ledger_container,
    get_credit_logs_container,
)

_CREDIT_CACHE: Dict[str, Tuple[OrgCredits, float]] = {}
CACHE_TTL_SECONDS = 30.0

def _invalidate_credit_cache(org_id: Optional[str] = None):
    if org_id and org_id in _CREDIT_CACHE:
        del _CREDIT_CACHE[org_id]
    elif org_id is None:
        _CREDIT_CACHE.clear()

class CreditRepository:
    def __init__(self):
        # In-memory store fallback: { org_id: OrgCredits }
        self._memory_credits: Dict[str, OrgCredits] = {}
        # In-memory ledger: { org_id: [LedgerEntry] }
        self._memory_ledger: Dict[str, List[LedgerEntry]] = {}
        # In-memory audit logs: { org_id: [CreditAssignmentLog] }
        self._memory_logs: Dict[str, List[CreditAssignmentLog]] = {}

    async def get_or_create_org_credits(self, organization_id: str, org_name: str = "") -> OrgCredits:
        cached = _CREDIT_CACHE.get(organization_id)
        if cached:
            doc, ts = cached
            if time.time() - ts < CACHE_TTL_SECONDS:
                return doc
            del _CREDIT_CACHE[organization_id]

        def _sync_get():
            container = get_credits_container()
            doc_id = f"credits_{organization_id}"
            if container:
                try:
                    item = container.read_item(item=doc_id, partition_key=organization_id)
                    obj = OrgCredits.model_validate(item)
                    if org_name and not obj.org_name:
                        obj.org_name = org_name
                    _CREDIT_CACHE[organization_id] = (obj, time.time())
                    return obj
                except Exception:
                    pass

                # If not found in Cosmos, create default
                new_doc = OrgCredits(
                    id=doc_id,
                    organization_id=organization_id,
                    org_name=org_name or organization_id,
                    total_credits_minutes=0,
                    used_credits_seconds=0
                )
                try:
                    container.upsert_item(body=new_doc.model_dump(mode="json"))
                    _CREDIT_CACHE[organization_id] = (new_doc, time.time())
                    return new_doc
                except Exception as e:
                    print(f"[CreditRepository] Upsert error: {e}")

            # Memory fallback
            if organization_id not in self._memory_credits:
                self._memory_credits[organization_id] = OrgCredits(
                    id=doc_id,
                    organization_id=organization_id,
                    org_name=org_name or organization_id,
                    total_credits_minutes=0,
                    used_credits_seconds=0
                )
            obj = self._memory_credits[organization_id]
            if org_name and not obj.org_name:
                obj.org_name = org_name
            _CREDIT_CACHE[organization_id] = (obj, time.time())
            return obj

        return await asyncio.to_thread(_sync_get)

    async def list_all_credits(self) -> List[OrgCredits]:
        def _sync_list():
            container = get_credits_container()
            if container:
                query = "SELECT * FROM c"
                try:
                    items = list(container.query_items(query=query, enable_cross_partition_query=True))
                    return [OrgCredits.model_validate(it) for it in items]
                except Exception as e:
                    print(f"[CreditRepository] list_all error: {e}")
            return list(self._memory_credits.values())

        return await asyncio.to_thread(_sync_list)

    async def atomic_deduct_seconds(self, organization_id: str, duration_seconds: int) -> OrgCredits:
        if duration_seconds <= 0:
            return await self.get_or_create_org_credits(organization_id)

        _invalidate_credit_cache(organization_id)

        def _sync_deduct():
            container = get_credits_container()
            doc_id = f"credits_{organization_id}"
            now_iso = datetime.now(timezone.utc).isoformat()

            if container:
                try:
                    patch_operations = [
                        {"op": "incr", "path": "/used_credits_seconds", "value": int(duration_seconds)},
                        {"op": "set", "path": "/updated_at", "value": now_iso}
                    ]
                    updated_item = container.patch_item(
                        item=doc_id,
                        partition_key=organization_id,
                        patch_operations=patch_operations
                    )
                    obj = OrgCredits.model_validate(updated_item)
                    _CREDIT_CACHE[organization_id] = (obj, time.time())
                    return obj
                except Exception as e:
                    # Fallback read & update
                    try:
                        item = container.read_item(item=doc_id, partition_key=organization_id)
                        item["used_credits_seconds"] = int(item.get("used_credits_seconds", 0)) + int(duration_seconds)
                        item["updated_at"] = now_iso
                        res = container.upsert_item(body=item)
                        obj = OrgCredits.model_validate(res)
                        _CREDIT_CACHE[organization_id] = (obj, time.time())
                        return obj
                    except Exception as err:
                        print(f"[CreditRepository] Fallback deduction error: {err}")

            # Memory fallback
            if organization_id not in self._memory_credits:
                self._memory_credits[organization_id] = OrgCredits(
                    id=doc_id,
                    organization_id=organization_id,
                    total_credits_minutes=0,
                    used_credits_seconds=0
                )
            doc = self._memory_credits[organization_id]
            doc.used_credits_seconds += int(duration_seconds)
            doc.updated_at = datetime.now(timezone.utc)
            _CREDIT_CACHE[organization_id] = (doc, time.time())
            return doc

        return await asyncio.to_thread(_sync_deduct)

    async def assign_credits(
        self,
        organization_id: str,
        total_minutes: int,
        org_name: str = "",
        plan_name: str = "Standard",
        assigned_by: str = "superadmin",
        reason: Optional[str] = None,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        is_enforced: bool = True,
        exhausted_action: str = "block",
        low_threshold_pct: int = 20,
        max_agents: Optional[int] = None,
        max_campaigns: Optional[int] = None,
    ) -> OrgCredits:
        _invalidate_credit_cache(organization_id)
        current = await self.get_or_create_org_credits(organization_id, org_name)
        prev_total = current.total_credits_minutes
        delta = total_minutes - prev_total

        current.total_credits_minutes = total_minutes
        if org_name:
            current.org_name = org_name
        current.plan_name = plan_name
        current.is_credit_enforced = is_enforced
        current.credit_exhausted_action = exhausted_action
        current.low_credit_threshold_pct = low_threshold_pct
        current.max_agents_allowed = max_agents
        current.max_campaigns_allowed = max_campaigns
        current.period_start = period_start
        current.period_end = period_end
        current.last_assigned_by = assigned_by
        current.last_assigned_at = datetime.now(timezone.utc)
        current.updated_at = datetime.now(timezone.utc)

        def _sync_save():
            container = get_credits_container()
            if container:
                try:
                    container.upsert_item(body=current.model_dump(mode="json"))
                except Exception as e:
                    print(f"[CreditRepository] assign_credits upsert: {e}")
            self._memory_credits[organization_id] = current

        await asyncio.to_thread(_sync_save)

        # Audit log
        log_entry = CreditAssignmentLog(
            id=f"assign_{uuid.uuid4().hex[:12]}",
            organization_id=organization_id,
            action="assign",
            previous_total_minutes=prev_total,
            new_total_minutes=total_minutes,
            delta_minutes=delta,
            previous_used_seconds=current.used_credits_seconds,
            new_used_seconds=current.used_credits_seconds,
            assigned_by_user=assigned_by,
            reason=reason or f"Set plan {plan_name} with {total_minutes}m"
        )
        await self._write_audit_log(log_entry)
        return current

    async def add_credits(
        self,
        organization_id: str,
        add_minutes: int,
        assigned_by: str = "superadmin",
        reason: Optional[str] = None
    ) -> OrgCredits:
        _invalidate_credit_cache(organization_id)
        current = await self.get_or_create_org_credits(organization_id)
        prev_total = current.total_credits_minutes
        new_total = prev_total + add_minutes
        current.total_credits_minutes = new_total
        current.last_assigned_by = assigned_by
        current.last_assigned_at = datetime.now(timezone.utc)
        current.updated_at = datetime.now(timezone.utc)

        def _sync_save():
            container = get_credits_container()
            if container:
                try:
                    container.upsert_item(body=current.model_dump(mode="json"))
                except Exception as e:
                    print(f"[CreditRepository] add_credits upsert: {e}")
            self._memory_credits[organization_id] = current

        await asyncio.to_thread(_sync_save)

        log_entry = CreditAssignmentLog(
            id=f"assign_{uuid.uuid4().hex[:12]}",
            organization_id=organization_id,
            action="add",
            previous_total_minutes=prev_total,
            new_total_minutes=new_total,
            delta_minutes=add_minutes,
            previous_used_seconds=current.used_credits_seconds,
            new_used_seconds=current.used_credits_seconds,
            assigned_by_user=assigned_by,
            reason=reason or f"Added +{add_minutes} minutes top-up"
        )
        await self._write_audit_log(log_entry)
        return current

    async def deduct_credits(
        self,
        organization_id: str,
        deduct_minutes: int,
        assigned_by: str = "superadmin",
        reason: Optional[str] = None
    ) -> OrgCredits:
        _invalidate_credit_cache(organization_id)
        current = await self.get_or_create_org_credits(organization_id)
        if deduct_minutes <= 0:
            raise ValueError("Deduct minutes must be greater than 0.")
        if deduct_minutes > current.remaining_minutes:
            raise ValueError(
                f"Cannot deduct {deduct_minutes} minutes. Only {current.remaining_minutes:.1f} minutes available to deduct."
            )

        prev_total = current.total_credits_minutes
        new_total = max(0, prev_total - deduct_minutes)
        current.total_credits_minutes = new_total
        current.last_assigned_by = assigned_by
        current.last_assigned_at = datetime.now(timezone.utc)
        current.updated_at = datetime.now(timezone.utc)

        def _sync_save():
            container = get_credits_container()
            if container:
                try:
                    container.upsert_item(body=current.model_dump(mode="json"))
                except Exception as e:
                    print(f"[CreditRepository] deduct_credits upsert: {e}")
            self._memory_credits[organization_id] = current

        await asyncio.to_thread(_sync_save)

        log_entry = CreditAssignmentLog(
            id=f"assign_{uuid.uuid4().hex[:12]}",
            organization_id=organization_id,
            action="deduct",
            previous_total_minutes=prev_total,
            new_total_minutes=new_total,
            delta_minutes=-deduct_minutes,
            previous_used_seconds=current.used_credits_seconds,
            new_used_seconds=current.used_credits_seconds,
            assigned_by_user=assigned_by,
            reason=reason or f"Deducted -{deduct_minutes} minutes"
        )
        await self._write_audit_log(log_entry)
        return current

    async def reset_usage(
        self,
        organization_id: str,
        assigned_by: str = "superadmin",
        reason: Optional[str] = None
    ) -> OrgCredits:
        _invalidate_credit_cache(organization_id)
        current = await self.get_or_create_org_credits(organization_id)
        prev_used = current.used_credits_seconds
        current.used_credits_seconds = 0
        current.updated_at = datetime.now(timezone.utc)

        def _sync_save():
            container = get_credits_container()
            if container:
                try:
                    container.upsert_item(body=current.model_dump(mode="json"))
                except Exception as e:
                    print(f"[CreditRepository] reset_usage upsert: {e}")
            self._memory_credits[organization_id] = current

        await asyncio.to_thread(_sync_save)

        log_entry = CreditAssignmentLog(
            id=f"assign_{uuid.uuid4().hex[:12]}",
            organization_id=organization_id,
            action="reset",
            previous_total_minutes=current.total_credits_minutes,
            new_total_minutes=current.total_credits_minutes,
            delta_minutes=0,
            previous_used_seconds=prev_used,
            new_used_seconds=0,
            assigned_by_user=assigned_by,
            reason=reason or "Cycle renewal usage reset"
        )
        await self._write_audit_log(log_entry)
        return current

    async def toggle_enforcement(
        self,
        organization_id: str,
        is_enforced: bool,
        exhausted_action: str = "block",
        assigned_by: str = "superadmin"
    ) -> OrgCredits:
        _invalidate_credit_cache(organization_id)
        current = await self.get_or_create_org_credits(organization_id)
        current.is_credit_enforced = is_enforced
        current.credit_exhausted_action = exhausted_action
        current.updated_at = datetime.now(timezone.utc)

        def _sync_save():
            container = get_credits_container()
            if container:
                try:
                    container.upsert_item(body=current.model_dump(mode="json"))
                except Exception as e:
                    print(f"[CreditRepository] toggle_enforcement: {e}")
            self._memory_credits[organization_id] = current

        await asyncio.to_thread(_sync_save)

        log_entry = CreditAssignmentLog(
            id=f"assign_{uuid.uuid4().hex[:12]}",
            organization_id=organization_id,
            action="toggle_enforcement",
            previous_total_minutes=current.total_credits_minutes,
            new_total_minutes=current.total_credits_minutes,
            delta_minutes=0,
            previous_used_seconds=current.used_credits_seconds,
            new_used_seconds=current.used_credits_seconds,
            assigned_by_user=assigned_by,
            reason=f"Enforcement set to {is_enforced} ({exhausted_action})"
        )
        await self._write_audit_log(log_entry)
        return current

    async def record_ledger_entry(self, entry: LedgerEntry) -> None:
        def _sync_write():
            container = get_ledger_container()
            if container:
                try:
                    container.create_item(body=entry.model_dump(mode="json"))
                    return
                except Exception as e:
                    print(f"[CreditRepository] record_ledger error: {e}")

            # Memory fallback
            org_id = entry.organization_id
            if org_id not in self._memory_ledger:
                self._memory_ledger[org_id] = []
            self._memory_ledger[org_id].insert(0, entry)

        await asyncio.to_thread(_sync_write)

    async def list_ledger(self, organization_id: str, limit: int = 50) -> List[LedgerEntry]:
        def _sync_list():
            container = get_ledger_container()
            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @org_id ORDER BY c.created_at DESC"
                params = [{"name": "@org_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False, max_item_count=limit))
                    return [LedgerEntry.model_validate(it) for it in items[:limit]]
                except Exception as e:
                    print(f"[CreditRepository] list_ledger query: {e}")

            # Memory fallback
            entries = self._memory_ledger.get(organization_id, [])
            return entries[:limit]

        return await asyncio.to_thread(_sync_list)

    async def get_daily_usage_aggregates(self, organization_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """Computes daily consumption for bar charts from usage_ledger."""
        now = datetime.now(timezone.utc)
        from_date_str = (now - timedelta(days=days)).strftime("%Y-%m-%d")

        def _sync_daily():
            container = get_ledger_container()
            items_to_aggregate: List[Dict[str, Any]] = []

            if container:
                query = (
                    "SELECT c.date_key, c.duration_seconds, c.credits_consumed_minutes, c.total_tokens "
                    "FROM c WHERE c.organization_id = @org_id AND c.date_key >= @from_date"
                )
                params = [
                    {"name": "@org_id", "value": organization_id},
                    {"name": "@from_date", "value": from_date_str}
                ]
                try:
                    items_to_aggregate = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False))
                except Exception as e:
                    print(f"[CreditRepository] daily items query: {e}")
                    items_to_aggregate = []

            if not items_to_aggregate:
                # Memory fallback aggregation
                entries = self._memory_ledger.get(organization_id, [])
                for e in entries:
                    if e.date_key >= from_date_str:
                        items_to_aggregate.append({
                            "date_key": e.date_key,
                            "duration_seconds": e.duration_seconds,
                            "credits_consumed_minutes": e.credits_consumed_minutes,
                            "total_tokens": e.total_tokens
                        })

            groups: Dict[str, Dict[str, Any]] = {}
            for item in items_to_aggregate:
                d_key = item.get("date_key", "")
                if not d_key:
                    continue
                if d_key not in groups:
                    groups[d_key] = {
                        "date_key": d_key,
                        "total_seconds": 0,
                        "total_minutes": 0.0,
                        "total_tokens": 0,
                        "call_count": 0
                    }
                groups[d_key]["total_seconds"] += item.get("duration_seconds", 0)
                groups[d_key]["total_minutes"] += round(item.get("credits_consumed_minutes", 0.0), 2)
                groups[d_key]["total_tokens"] += item.get("total_tokens", 0)
                groups[d_key]["call_count"] += 1

            result = list(groups.values())
            result.sort(key=lambda x: x["date_key"])
            return result

        return await asyncio.to_thread(_sync_daily)

    async def list_assignment_logs(self, organization_id: str, limit: int = 50) -> List[CreditAssignmentLog]:
        def _sync_logs():
            container = get_credit_logs_container()
            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @org_id ORDER BY c.created_at DESC"
                params = [{"name": "@org_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False, max_item_count=limit))
                    return [CreditAssignmentLog.model_validate(it) for it in items[:limit]]
                except Exception as e:
                    print(f"[CreditRepository] list_assignment_logs: {e}")

            return self._memory_logs.get(organization_id, [])[:limit]

        return await asyncio.to_thread(_sync_logs)

    async def _write_audit_log(self, entry: CreditAssignmentLog):
        def _sync_audit():
            container = get_credit_logs_container()
            if container:
                try:
                    container.create_item(body=entry.model_dump(mode="json"))
                    return
                except Exception as e:
                    print(f"[CreditRepository] _write_audit_log: {e}")

            org_id = entry.organization_id
            if org_id not in self._memory_logs:
                self._memory_logs[org_id] = []
            self._memory_logs[org_id].insert(0, entry)

        await asyncio.to_thread(_sync_audit)
