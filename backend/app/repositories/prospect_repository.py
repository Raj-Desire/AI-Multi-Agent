import asyncio
import time
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from app.core.cosmos import get_prospects_container
from app.models.prospect import Prospect, ProspectStatus, ProspectSource

_PROSPECT_CACHE: Dict[str, Tuple[List[Prospect], float]] = {}
PROSPECT_CACHE_TTL_SECONDS = 15.0


def _invalidate_prospect_cache(org_id: Optional[str] = None):
    if org_id and org_id in _PROSPECT_CACHE:
        del _PROSPECT_CACHE[org_id]
    else:
        _PROSPECT_CACHE.clear()


class ProspectRepository:
    def __init__(self):
        self._memory_store: Dict[str, Prospect] = {}

    async def get_by_id(self, organization_id: str, prospect_id: str) -> Optional[Prospect]:
        def _sync_get():
            # Check memory store first or fallback
            mem_item = self._memory_store.get(prospect_id)
            if mem_item and mem_item.organization_id == organization_id:
                return mem_item

            container = get_prospects_container()
            if not container:
                return None

            query = "SELECT * FROM c WHERE c.id = @id AND c.organization_id = @organization_id"
            params = [
                {"name": "@id", "value": prospect_id},
                {"name": "@organization_id", "value": organization_id}
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    p = Prospect.model_validate(items[0])
                    self._memory_store[p.id] = p
                    return p
            except Exception as e:
                print(f"[ProspectRepository Error] get_by_id: {e}")
            return None

        return await asyncio.to_thread(_sync_get)

    async def get_by_normalized_phone(self, organization_id: str, normalized_phone: str) -> Optional[Prospect]:
        def _sync_get():
            # Check memory store first or fallback
            for p in self._memory_store.values():
                if p.organization_id == organization_id and p.normalized_phone == normalized_phone:
                    return p

            container = get_prospects_container()
            if not container:
                return None

            query = "SELECT * FROM c WHERE c.organization_id = @organization_id AND c.normalized_phone = @phone"
            params = [
                {"name": "@organization_id", "value": organization_id},
                {"name": "@phone", "value": normalized_phone}
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    p = Prospect.model_validate(items[0])
                    self._memory_store[p.id] = p
                    return p
            except Exception as e:
                print(f"[ProspectRepository Error] get_by_normalized_phone: {e}")
            return None

        return await asyncio.to_thread(_sync_get)

    async def get_by_email(self, organization_id: str, email: str) -> Optional[Prospect]:
        if not email:
            return None
        target_email = email.strip().lower()

        def _sync_get():
            for p in self._memory_store.values():
                if p.organization_id == organization_id and p.email and p.email.strip().lower() == target_email:
                    return p

            container = get_prospects_container()
            if not container:
                return None

            query = "SELECT * FROM c WHERE c.organization_id = @organization_id AND LOWER(c.email) = @email"
            params = [
                {"name": "@organization_id", "value": organization_id},
                {"name": "@email", "value": target_email}
            ]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    p = Prospect.model_validate(items[0])
                    self._memory_store[p.id] = p
                    return p
            except Exception as e:
                print(f"[ProspectRepository Error] get_by_email: {e}")
            return None

        return await asyncio.to_thread(_sync_get)

    async def list_by_org(
        self,
        organization_id: str,
        search: Optional[str] = None,
        status: Optional[str] = None,
        tag: Optional[str] = None,
        source: Optional[str] = None,
        group_name: Optional[str] = None,
        assigned_owner: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Prospect], int]:
        def _sync_list():
            container = get_prospects_container()
            all_prospects_dict: Dict[str, Prospect] = {
                p.id: p for p in self._memory_store.values() if p.organization_id == organization_id
            }

            if container:
                query = "SELECT * FROM c WHERE c.organization_id = @organization_id"
                params = [{"name": "@organization_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        p = Prospect.model_validate(item)
                        all_prospects_dict[p.id] = p
                except Exception as e:
                    print(f"[ProspectRepository Error] list_by_org: {e}")

            all_prospects = list(all_prospects_dict.values())

            # In-memory filtering for flexible, rich querying
            filtered = all_prospects

            if search and search.strip():
                s = search.strip().lower()
                filtered = [
                    p for p in filtered
                    if (s in p.full_name.lower())
                    or (s in (p.email or "").lower())
                    or (s in p.phone_number)
                    or (s in (p.company or "").lower())
                    or (s in (p.notes or "").lower())
                    or (s in (p.group_name or "").lower())
                ]

            if status and status.strip() and status.lower() != "all":
                target_status = status.strip().lower()
                filtered = [
                    p for p in filtered
                    if str(getattr(p.status, "value", p.status)).lower() == target_status
                    or str(getattr(p.status, "name", "")).lower() == target_status
                ]

            if tag and tag.strip():
                t = tag.strip().lower()
                filtered = [p for p in filtered if any(t == existing_tag.lower() for existing_tag in p.tags)]

            if group_name and group_name.strip() and group_name.lower() != "all":
                gn = group_name.strip().lower()
                filtered = [
                    p for p in filtered
                    if (p.group_name or "").lower() == gn
                    or any(gn == (t or "").lower() for t in (p.tags or []))
                ]

            if source and source.strip() and source.lower() != "all":
                target_source = source.strip().lower()
                filtered = [
                    p for p in filtered
                    if str(getattr(p.source, "value", p.source)).lower() == target_source
                    or str(getattr(p.source, "name", "")).lower() == target_source
                ]

            if assigned_owner and assigned_owner.strip():
                ao = assigned_owner.strip().lower()
                filtered = [p for p in filtered if (p.assigned_owner or "").lower() == ao]

            # Sorting
            reverse = (sort_order.lower() == "desc")
            if sort_by == "name" or sort_by == "full_name":
                filtered.sort(key=lambda x: (x.full_name or "").lower(), reverse=reverse)
            elif sort_by == "company":
                filtered.sort(key=lambda x: (x.company or "").lower(), reverse=reverse)
            elif sort_by == "status":
                filtered.sort(key=lambda x: str(getattr(x.status, "value", x.status)), reverse=reverse)
            elif sort_by == "last_contacted_at":
                filtered.sort(key=lambda x: x.last_contacted_at or datetime.min.replace(tzinfo=timezone.utc), reverse=reverse)
            elif sort_by == "total_calls":
                filtered.sort(key=lambda x: x.total_calls, reverse=reverse)
            else:  # default to created_at
                filtered.sort(key=lambda x: x.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=reverse)

            total_count = len(filtered)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated_items = filtered[start_idx:end_idx]

            return paginated_items, total_count

        return await asyncio.to_thread(_sync_list)

    async def save(self, prospect: Prospect) -> Prospect:
        def _sync_save():
            self._memory_store[prospect.id] = prospect
            container = get_prospects_container()
            if container:
                try:
                    doc = prospect.model_dump(mode="json")
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[ProspectRepository Error] save: {e}")
            _invalidate_prospect_cache(prospect.organization_id)
            return prospect

        return await asyncio.to_thread(_sync_save)

    async def save_bulk(self, prospects: List[Prospect]) -> List[Prospect]:
        def _sync_save_bulk():
            container = get_prospects_container()
            saved = []
            org_id = None
            for p in prospects:
                self._memory_store[p.id] = p
                org_id = p.organization_id
                if container:
                    try:
                        doc = p.model_dump(mode="json")
                        container.upsert_item(body=doc)
                    except Exception as e:
                        print(f"[ProspectRepository Error] save_bulk item: {e}")
                saved.append(p)
            if org_id:
                _invalidate_prospect_cache(org_id)
            return saved

        return await asyncio.to_thread(_sync_save_bulk)

    async def delete(self, organization_id: str, prospect_id: str) -> bool:
        def _sync_delete():
            existing = self._memory_store.get(prospect_id)
            if existing and existing.organization_id == organization_id:
                del self._memory_store[prospect_id]

            container = get_prospects_container()
            if container:
                try:
                    container.delete_item(item=prospect_id, partition_key=organization_id)
                except Exception as e:
                    print(f"[ProspectRepository Error] delete: {e}")
                    # Return True if was in memory store
                    return existing is not None
            _invalidate_prospect_cache(organization_id)
            return True

        return await asyncio.to_thread(_sync_delete)

    async def bulk_delete(self, organization_id: str, prospect_ids: List[str]) -> int:
        def _sync_bulk_delete():
            count = 0
            container = get_prospects_container()
            for pid in prospect_ids:
                deleted = False
                if pid in self._memory_store and self._memory_store[pid].organization_id == organization_id:
                    del self._memory_store[pid]
                    deleted = True
                if container:
                    try:
                        container.delete_item(item=pid, partition_key=organization_id)
                        deleted = True
                    except Exception:
                        pass
                if deleted:
                    count += 1
            _invalidate_prospect_cache(organization_id)
            return count

        return await asyncio.to_thread(_sync_bulk_delete)

    async def bulk_update_status(
        self,
        organization_id: str,
        prospect_ids: List[str],
        status: ProspectStatus,
        updated_by: Optional[str] = None
    ) -> int:
        def _sync_bulk_status():
            count = 0
            now = datetime.now(timezone.utc)
            container = get_prospects_container()

            for pid in prospect_ids:
                p = self._memory_store.get(pid)
                if not p and container:
                    try:
                        doc = container.read_item(item=pid, partition_key=organization_id)
                        if doc:
                            p = Prospect.model_validate(doc)
                    except Exception:
                        pass

                if p and p.organization_id == organization_id:
                    p.status = status
                    p.updated_at = now
                    p.updated_by = updated_by
                    self._memory_store[pid] = p
                    if container:
                        try:
                            container.upsert_item(body=p.model_dump(mode="json"))
                        except Exception as e:
                            print(f"[ProspectRepository Error] bulk_update_status: {e}")
                    count += 1

            _invalidate_prospect_cache(organization_id)
            return count

        return await asyncio.to_thread(_sync_bulk_status)

    async def bulk_update_tags(
        self,
        organization_id: str,
        prospect_ids: List[str],
        tags: List[str],
        action: str = "add",
        updated_by: Optional[str] = None
    ) -> int:
        def _sync_bulk_tags():
            count = 0
            now = datetime.now(timezone.utc)
            clean_tags = [t.strip() for t in tags if t.strip()]
            container = get_prospects_container()

            for pid in prospect_ids:
                p = self._memory_store.get(pid)
                if not p and container:
                    try:
                        doc = container.read_item(item=pid, partition_key=organization_id)
                        if doc:
                            p = Prospect.model_validate(doc)
                    except Exception:
                        pass

                if p and p.organization_id == organization_id:
                    current_tags = list(p.tags)
                    if action == "add":
                        for t in clean_tags:
                            if t not in current_tags:
                                current_tags.append(t)
                    elif action == "remove":
                        current_tags = [t for t in current_tags if t not in clean_tags]

                    p.tags = current_tags
                    p.updated_at = now
                    p.updated_by = updated_by
                    self._memory_store[pid] = p
                    if container:
                        try:
                            container.upsert_item(body=p.model_dump(mode="json"))
                        except Exception as e:
                            print(f"[ProspectRepository Error] bulk_update_tags: {e}")
                    count += 1

            _invalidate_prospect_cache(organization_id)
            return count

        return await asyncio.to_thread(_sync_bulk_tags)

    async def list_distinct_groups(self, organization_id: str) -> List[str]:
        def _sync_groups():
            container = get_prospects_container()
            groups_set = set()

            for p in self._memory_store.values():
                if p.organization_id == organization_id:
                    if p.group_name and p.group_name.strip():
                        groups_set.add(p.group_name.strip())
                    for t in (p.tags or []):
                        if t and str(t).strip():
                            groups_set.add(str(t).strip())

            if container:
                query = "SELECT c.group_name, c.tags FROM c WHERE c.organization_id = @organization_id"
                params = [{"name": "@organization_id", "value": organization_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                    for item in items:
                        gn = item.get("group_name")
                        if gn and str(gn).strip():
                            groups_set.add(str(gn).strip())
                        tags = item.get("tags") or []
                        if isinstance(tags, list):
                            for t in tags:
                                if t and str(t).strip():
                                    groups_set.add(str(t).strip())
                except Exception as e:
                    print(f"[ProspectRepository Error] list_distinct_groups: {e}")

            return sorted(list(groups_set))

        return await asyncio.to_thread(_sync_groups)

    async def bulk_update_group(
        self,
        organization_id: str,
        prospect_ids: List[str],
        group_name: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> int:
        def _sync_bulk_group():
            count = 0
            now = datetime.now(timezone.utc)
            clean_group = group_name.strip() if group_name and group_name.strip() else None
            container = get_prospects_container()

            for pid in prospect_ids:
                p = self._memory_store.get(pid)
                if not p and container:
                    try:
                        doc = container.read_item(item=pid, partition_key=organization_id)
                        if doc:
                            p = Prospect.model_validate(doc)
                    except Exception:
                        pass

                if p and p.organization_id == organization_id:
                    p.group_name = clean_group
                    p.updated_at = now
                    p.updated_by = updated_by
                    self._memory_store[pid] = p
                    if container:
                        try:
                            container.upsert_item(body=p.model_dump(mode="json"))
                        except Exception as e:
                            print(f"[ProspectRepository Error] bulk_update_group: {e}")
                    count += 1

            _invalidate_prospect_cache(organization_id)
            return count

        return await asyncio.to_thread(_sync_bulk_group)

