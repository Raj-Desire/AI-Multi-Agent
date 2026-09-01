import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from app.core.cosmos import (
    get_campaigns_container,
    get_campaign_members_container,
    get_campaign_events_container,
)
from app.models.campaign import (
    Campaign,
    CampaignMember,
    CampaignEvent,
    CampaignStatus,
    CampaignMemberStatus,
    CampaignEventType,
)

_CAMPAIGN_CACHE: Dict[str, Tuple[List[Campaign], float]] = {}
CAMPAIGN_CACHE_TTL_SECONDS = 10.0

_CAMPAIGNS_MEM_STORE: Dict[str, Campaign] = {}
_CAMPAIGN_MEMBERS_MEM_STORE: Dict[str, CampaignMember] = {}
_CAMPAIGN_EVENTS_MEM_STORE: List[CampaignEvent] = []


def _invalidate_campaign_cache(org_id: Optional[str] = None):
    if org_id and org_id in _CAMPAIGN_CACHE:
        del _CAMPAIGN_CACHE[org_id]
    else:
        _CAMPAIGN_CACHE.clear()


class CampaignRepository:
    def __init__(self):
        self._memory_store = _CAMPAIGNS_MEM_STORE

    async def get_by_id(self, organization_id: str, campaign_id: str) -> Optional[Campaign]:
        def _sync_get():
            mem_item = self._memory_store.get(campaign_id)
            if mem_item and (mem_item.organization_id == organization_id or organization_id == "global"):
                return mem_item

            container = get_campaigns_container()
            if not container:
                return None

            query = "SELECT * FROM c WHERE c.id = @id AND c.organization_id = @organization_id"
            params = [
                {"name": "@id", "value": campaign_id},
                {"name": "@organization_id", "value": organization_id}
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    c = Campaign.model_validate(items[0])
                    self._memory_store[c.id] = c
                    return c
            except Exception as e:
                print(f"[CampaignRepository Error] get_by_id: {e}")
            return None

        return await asyncio.to_thread(_sync_get)

    async def list_by_org(
        self,
        organization_id: str,
        search: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Campaign], int]:
        def _sync_list():
            container = get_campaigns_container()
            all_dict: Dict[str, Campaign] = {
                c.id: c for c in self._memory_store.values() if c.organization_id == organization_id
            }

            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @organization_id"
                params = [{"name": "@organization_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        c = Campaign.model_validate(item)
                        all_dict[c.id] = c
                except Exception as e:
                    print(f"[CampaignRepository Error] list_by_org: {e}")

            all_campaigns = list(all_dict.values())

            filtered = all_campaigns
            if search and search.strip():
                s = search.strip().lower()
                filtered = [
                    c for c in filtered
                    if (s in c.name.lower()) or (s in (c.description or "").lower())
                ]

            if status and status.strip() and status.lower() != "all":
                st = status.strip().lower()
                filtered = [
                    c for c in filtered
                    if str(getattr(c.status, "value", c.status)).lower() == st
                ]

            # Sorting
            reverse = (sort_order.lower() == "desc")
            if sort_by == "name":
                filtered.sort(key=lambda x: (x.name or "").lower(), reverse=reverse)
            elif sort_by == "status":
                filtered.sort(key=lambda x: str(getattr(x.status, "value", x.status)), reverse=reverse)
            elif sort_by == "total_prospects":
                filtered.sort(key=lambda x: x.stats.total_prospects, reverse=reverse)
            else:  # default to created_at
                filtered.sort(key=lambda x: x.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=reverse)

            total_count = len(filtered)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated = filtered[start_idx:end_idx]

            return paginated, total_count

        return await asyncio.to_thread(_sync_list)

    async def list_active_campaigns(self) -> List[Campaign]:
        """Returns all campaigns that are currently RUNNING or SCHEDULED across all tenants for dialer polling."""
        def _sync_active():
            container = get_campaigns_container()
            all_dict: Dict[str, Campaign] = {
                c.id: c for c in self._memory_store.values()
                if c.status in [CampaignStatus.RUNNING, CampaignStatus.SCHEDULED, "running", "scheduled"]
            }

            if container:
                query = "SELECT * FROM c WHERE c.status IN ('running', 'scheduled')"
                try:
                    items = list(container.query_items(query=query, enable_cross_partition_query=True))
                    for item in items:
                        c = Campaign.model_validate(item)
                        all_dict[c.id] = c
                except Exception as e:
                    print(f"[CampaignRepository Error] list_active_campaigns: {e}")

            return list(all_dict.values())

        return await asyncio.to_thread(_sync_active)

    async def save(self, campaign: Campaign) -> Campaign:
        def _sync_save():
            self._memory_store[campaign.id] = campaign
            container = get_campaigns_container()
            if container:
                try:
                    doc = campaign.model_dump(mode="json")
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[CampaignRepository Error] save: {e}")
            _invalidate_campaign_cache(campaign.organization_id)
            return campaign

        return await asyncio.to_thread(_sync_save)

    async def delete(self, organization_id: str, campaign_id: str) -> bool:
        def _sync_delete():
            if campaign_id in self._memory_store:
                del self._memory_store[campaign_id]
            container = get_campaigns_container()
            if container:
                try:
                    container.delete_item(item=campaign_id, partition_key=organization_id)
                except Exception as e:
                    print(f"[CampaignRepository Error] delete: {e}")
            _invalidate_campaign_cache(organization_id)
            return True

        return await asyncio.to_thread(_sync_delete)


class CampaignMemberRepository:
    def __init__(self):
        self._memory_store = _CAMPAIGN_MEMBERS_MEM_STORE

    async def get_by_id(self, organization_id: str, member_id: str) -> Optional[CampaignMember]:
        def _sync_get():
            mem_item = self._memory_store.get(member_id)
            if mem_item and (mem_item.organization_id == organization_id or organization_id == "global"):
                return mem_item

            container = get_campaign_members_container()
            if not container:
                return None

            query = "SELECT * FROM c WHERE c.id = @id AND c.organization_id = @organization_id"
            params = [
                {"name": "@id", "value": member_id},
                {"name": "@organization_id", "value": organization_id}
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    m = CampaignMember.model_validate(items[0])
                    self._memory_store[m.id] = m
                    return m
            except Exception as e:
                print(f"[CampaignMemberRepository Error] get_by_id: {e}")
            return None

        return await asyncio.to_thread(_sync_get)

    async def get_by_campaign_and_prospect(self, campaign_id: str, prospect_id: str) -> Optional[CampaignMember]:
        def _sync_get():
            for m in self._memory_store.values():
                if m.campaign_id == campaign_id and m.prospect_id == prospect_id:
                    return m

            container = get_campaign_members_container()
            if not container:
                return None

            query = "SELECT * FROM c WHERE c.campaign_id = @campaign_id AND c.prospect_id = @prospect_id"
            params = [
                {"name": "@campaign_id", "value": campaign_id},
                {"name": "@prospect_id", "value": prospect_id}
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    m = CampaignMember.model_validate(items[0])
                    self._memory_store[m.id] = m
                    return m
            except Exception as e:
                print(f"[CampaignMemberRepository Error] get_by_campaign_and_prospect: {e}")
            return None

        return await asyncio.to_thread(_sync_get)

    async def list_by_campaign(
        self,
        organization_id: str,
        campaign_id: str,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 25
    ) -> Tuple[List[CampaignMember], int]:
        def _sync_list():
            container = get_campaign_members_container()
            all_dict: Dict[str, CampaignMember] = {
                m.id: m for m in self._memory_store.values()
                if m.campaign_id == campaign_id and (m.organization_id == organization_id or organization_id == "global")
            }

            if container:
                query = "SELECT * FROM c WHERE c.campaign_id = @campaign_id AND c.organization_id = @organization_id"
                params = [
                    {"name": "@campaign_id", "value": campaign_id},
                    {"name": "@organization_id", "value": organization_id}
                ]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        m = CampaignMember.model_validate(item)
                        all_dict[m.id] = m
                except Exception as e:
                    print(f"[CampaignMemberRepository Error] list_by_campaign: {e}")

            all_members = list(all_dict.values())

            filtered = all_members
            if status and status.strip() and status.lower() != "all":
                st = status.strip().lower()
                filtered = [
                    m for m in filtered
                    if str(getattr(m.status, "value", m.status)).lower() == st
                ]

            if search and search.strip():
                s = search.strip().lower()
                filtered = [
                    m for m in filtered
                    if (s in m.prospect_name.lower()) or (s in m.phone_number)
                ]

            filtered.sort(key=lambda x: x.created_at or datetime.min.replace(tzinfo=timezone.utc))

            total_count = len(filtered)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            return filtered[start_idx:end_idx], total_count

        return await asyncio.to_thread(_sync_list)

    async def get_all_by_campaign(self, campaign_id: str) -> List[CampaignMember]:
        def _sync_all():
            container = get_campaign_members_container()
            all_dict: Dict[str, CampaignMember] = {
                m.id: m for m in self._memory_store.values() if m.campaign_id == campaign_id
            }

            if container:
                query = "SELECT * FROM c WHERE c.campaign_id = @campaign_id"
                params = [{"name": "@campaign_id", "value": campaign_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        m = CampaignMember.model_validate(item)
                        all_dict[m.id] = m
                except Exception as e:
                    print(f"[CampaignMemberRepository Error] get_all_by_campaign: {e}")

            return list(all_dict.values())

        return await asyncio.to_thread(_sync_all)

    async def get_next_eligible_members(self, campaign_id: str, limit: int = 10) -> List[CampaignMember]:
        """
        Retrieves members in QUEUED status or RETRYING status whose next_attempt_at has arrived.
        """
        def _sync_eligible():
            now = datetime.now(timezone.utc)
            all_members = [m for m in self._memory_store.values() if m.campaign_id == campaign_id]

            container = get_campaign_members_container()
            if container:
                query = "SELECT * FROM c WHERE c.campaign_id = @campaign_id AND c.status IN ('queued', 'retrying')"
                params = [{"name": "@campaign_id", "value": campaign_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        m = CampaignMember.model_validate(item)
                        self._memory_store[m.id] = m
                except Exception as e:
                    print(f"[CampaignMemberRepository Error] get_next_eligible_members: {e}")
                all_members = [m for m in self._memory_store.values() if m.campaign_id == campaign_id]

            eligible = []
            for m in all_members:
                st = str(getattr(m.status, "value", m.status)).lower()
                if st == "queued":
                    eligible.append(m)
                elif st == "retrying":
                    if m.next_attempt_at and m.next_attempt_at <= now:
                        eligible.append(m)

            # Sort queued first, then earlier next_attempt_at
            eligible.sort(key=lambda x: x.next_attempt_at or datetime.min.replace(tzinfo=timezone.utc))
            return eligible[:limit]

        return await asyncio.to_thread(_sync_eligible)

    async def count_in_flight_calls(self, campaign_id: str) -> int:
        def _sync_count():
            container = get_campaign_members_container()
            in_mem = sum(1 for m in self._memory_store.values() if m.campaign_id == campaign_id and str(getattr(m.status, "value", m.status)).lower() == "calling")

            if container:
                query = "SELECT VALUE COUNT(1) FROM c WHERE c.campaign_id = @campaign_id AND c.status = 'calling'"
                params = [{"name": "@campaign_id", "value": campaign_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    if items:
                        return int(items[0])
                except Exception:
                    pass
            return in_mem

        return await asyncio.to_thread(_sync_count)

    async def save(self, member: CampaignMember) -> CampaignMember:
        def _sync_save():
            self._memory_store[member.id] = member
            container = get_campaign_members_container()
            if container:
                try:
                    doc = member.model_dump(mode="json")
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[CampaignMemberRepository Error] save: {e}")
            return member

        return await asyncio.to_thread(_sync_save)

    async def save_bulk(self, members: List[CampaignMember]) -> List[CampaignMember]:
        def _sync_save_bulk():
            container = get_campaign_members_container()
            for m in members:
                self._memory_store[m.id] = m
                if container:
                    try:
                        doc = m.model_dump(mode="json")
                        container.upsert_item(body=doc)
                    except Exception as e:
                        print(f"[CampaignMemberRepository Error] save_bulk: {e}")
            return members

        return await asyncio.to_thread(_sync_save_bulk)

    async def delete_by_campaign(self, organization_id: str, campaign_id: str) -> int:
        def _sync_delete_by_campaign():
            to_delete = [
                m_id for m_id, m in self._memory_store.items()
                if m.campaign_id == campaign_id
            ]
            for m_id in to_delete:
                del self._memory_store[m_id]

            container = get_campaign_members_container()
            count = len(to_delete)
            if container:
                query = "SELECT c.id FROM c WHERE c.campaign_id = @campaign_id AND c.organization_id = @organization_id"
                params = [
                    {"name": "@campaign_id", "value": campaign_id},
                    {"name": "@organization_id", "value": organization_id}
                ]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for it in items:
                        container.delete_item(item=it["id"], partition_key=organization_id)
                        count += 1
                except Exception as e:
                    print(f"[CampaignMemberRepository Error] delete_by_campaign: {e}")
            return count

        return await asyncio.to_thread(_sync_delete_by_campaign)


class CampaignEventRepository:
    def __init__(self):
        self._memory_store = _CAMPAIGN_EVENTS_MEM_STORE

    async def log_event(
        self,
        organization_id: str,
        campaign_id: str,
        event_type: CampaignEventType,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> CampaignEvent:
        def _sync_log():
            event = CampaignEvent(
                id=f"cmpevt_{uuid.uuid4().hex[:12]}",
                campaign_id=campaign_id,
                organization_id=organization_id,
                event_type=event_type,
                message=message,
                details=details,
                timestamp=datetime.now(timezone.utc)
            )
            self._memory_store.append(event)
            container = get_campaign_events_container()
            if container:
                try:
                    doc = event.model_dump(mode="json")
                    container.create_item(body=doc)
                except Exception as e:
                    print(f"[CampaignEventRepository Error] log_event: {e}")
            return event

        return await asyncio.to_thread(_sync_log)

    async def list_by_campaign(self, organization_id: str, campaign_id: str, limit: int = 100) -> List[CampaignEvent]:
        def _sync_list():
            container = get_campaign_events_container()
            events = [
                e for e in self._memory_store
                if e.campaign_id == campaign_id and (e.organization_id == organization_id or organization_id == "global")
            ]

            if container:
                query = "SELECT TOP @limit * FROM c WHERE c.campaign_id = @campaign_id AND c.organization_id = @organization_id ORDER BY c.timestamp DESC"
                params = [
                    {"name": "@limit", "value": limit},
                    {"name": "@campaign_id", "value": campaign_id},
                    {"name": "@organization_id", "value": organization_id}
                ]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    loaded = [CampaignEvent.model_validate(it) for it in items]
                    # Merge unique by ID
                    event_map = {e.id: e for e in events}
                    for le in loaded:
                        event_map[le.id] = le
                    events = list(event_map.values())
                except Exception as e:
                    print(f"[CampaignEventRepository Error] list_by_campaign: {e}")

            events.sort(key=lambda x: x.timestamp or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
            return events[:limit]

        return await asyncio.to_thread(_sync_list)
