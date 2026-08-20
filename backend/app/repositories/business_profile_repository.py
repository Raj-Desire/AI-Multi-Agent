import uuid
import time
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from app.core.cosmos import get_database, get_cosmos_client
from app.models.business_profile import CompanyBusinessProfile

# In-memory profile cache with TTL for ultra-fast prompt generation (<1ms)
_PROFILE_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
PROFILE_CACHE_TTL_SECONDS = 60.0

COSMOS_CONTAINER_PROFILES = "business_profiles"
_profiles_container = None


def get_profiles_container():
    global _profiles_container
    if _profiles_container is not None:
        return _profiles_container
    db = get_database()
    if not db:
        return None
    try:
        from azure.cosmos import PartitionKey
        _profiles_container = db.create_container_if_not_exists(
            id=COSMOS_CONTAINER_PROFILES,
            partition_key=PartitionKey(path="/organization_id")
        )
        return _profiles_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get profiles container: {e}")
        return None


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
                if items:
                    _PROFILE_CACHE[org_key] = (items[0], time.time())
                    return items[0]
            except Exception as e:
                print(f"[BusinessProfileRepository Error] get_profile query: {e}")

            # 2. Fallback lookup: If org_key is 'default' or not found, check for ANY existing profile in container
            try:
                fallback_query = "SELECT * FROM c WHERE IS_DEFINED(c.company_name) AND c.company_name != ''"
                fallback_items = list(container.query_items(query=fallback_query, enable_cross_partition_query=True))
                if fallback_items:
                    # Return the first or most recently updated populated profile
                    _PROFILE_CACHE[org_key] = (fallback_items[0], time.time())
                    return fallback_items[0]
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
