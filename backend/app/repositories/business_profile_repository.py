import uuid
import time
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from app.core.cosmos import get_business_profiles_container
from app.models.business_profile import CompanyBusinessProfile

# In-memory profile cache with TTL for ultra-fast prompt generation (<1ms)
_PROFILE_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
PROFILE_CACHE_TTL_SECONDS = 60.0


def get_profiles_container():
    return get_business_profiles_container()



class BusinessProfileRepository:
    @staticmethod
    async def get_profile(organization_id: str) -> Dict[str, Any]:
        org_key = organization_id or "default"
        cached = _PROFILE_CACHE.get(org_key)
        if cached:
            data, ts = cached
            if time.time() - ts < PROFILE_CACHE_TTL_SECONDS:
                return data
            del _PROFILE_CACHE[org_key]

        def _sync_get():
            container = get_profiles_container()
            if not container:
                default_obj = CompanyBusinessProfile(organization_id=org_key).model_dump(mode="json")
                default_obj["id"] = f"profile_{org_key}"
                _PROFILE_CACHE[org_key] = (default_obj, time.time())
                return default_obj

            # 1. Primary lookup by exact organization_id
            query = "SELECT * FROM c WHERE c.organization_id = @org_id"
            params = [{"name": "@org_id", "value": org_key}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items and items[0].get("company_name"):
                    _PROFILE_CACHE[org_key] = (items[0], time.time())
                    return items[0]
            except Exception as e:
                print(f"[BusinessProfileRepository Error] get_profile query: {e}")

            # 2. If org_key is 'default' or not found, check for 'org_platform_root'
            try:
                root_query = "SELECT * FROM c WHERE c.organization_id = 'org_platform_root'"
                root_items = list(container.query_items(query=root_query, enable_cross_partition_query=True))
                if root_items and root_items[0].get("company_name"):
                    _PROFILE_CACHE[org_key] = (root_items[0], time.time())
                    return root_items[0]
            except Exception as e:
                print(f"[BusinessProfileRepository Error] root profile query: {e}")

            # 3. Fallback lookup: return the most recently updated populated profile
            try:
                fallback_query = "SELECT * FROM c WHERE IS_DEFINED(c.company_name) AND c.company_name != ''"
                fallback_items = list(container.query_items(query=fallback_query, enable_cross_partition_query=True))
                if fallback_items:
                    # Sort in python by updated_at to ensure latest
                    sorted_items = sorted(fallback_items, key=lambda x: x.get("updated_at", ""), reverse=True)
                    _PROFILE_CACHE[org_key] = (sorted_items[0], time.time())
                    return sorted_items[0]
            except Exception as e:
                print(f"[BusinessProfileRepository Error] fallback profile query: {e}")

            # 3. Default empty profile
            default_obj = CompanyBusinessProfile(organization_id=org_key).model_dump(mode="json")
            default_obj["id"] = f"profile_{org_key}"
            _PROFILE_CACHE[org_key] = (default_obj, time.time())
            return default_obj

        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def save_profile(organization_id: str, profile_payload: Dict[str, Any], user_email: str) -> Dict[str, Any]:
        def _sync_save():
            container = get_profiles_container()
            doc_id = f"profile_{organization_id}"
            now = datetime.now(timezone.utc).isoformat()

            doc = {
                **profile_payload,
                "id": doc_id,
                "organization_id": organization_id,
                "updated_at": now,
                "updated_by": user_email
            }

            if container:
                try:
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[BusinessProfileRepository Error] save_profile: {e}")

            _PROFILE_CACHE[organization_id] = (doc, time.time())
            return doc

        return await asyncio.to_thread(_sync_save)
