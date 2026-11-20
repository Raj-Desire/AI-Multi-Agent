import time
from typing import Dict, List, Optional, Tuple

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.core.cosmos import get_voice_credentials_container
from app.models.voice_credentials import VoiceCredentials

_VC_CACHE: Dict[str, Tuple[Optional[VoiceCredentials], float]] = {}
VC_CACHE_TTL_SECONDS = 60.0


def _invalidate(org_id: str) -> None:
    _VC_CACHE.pop(org_id, None)


def _doc_id(org_id: str) -> str:
    return f"vc_{org_id}"


class VoiceCredentialsRepository:
    async def get_by_org(self, org_id: str) -> Optional[VoiceCredentials]:
        cached = _VC_CACHE.get(org_id)
        if cached and time.time() - cached[1] < VC_CACHE_TTL_SECONDS:
            return cached[0]
        container = get_voice_credentials_container()
        if not container:
            return None
        try:
            item = container.read_item(item=_doc_id(org_id), partition_key=org_id)
        except CosmosResourceNotFoundError:
            _VC_CACHE[org_id] = (None, time.time())
            return None
        data = {k: v for k, v in item.items() if not k.startswith("_") and k != "id"}
        creds = VoiceCredentials(**data)
        _VC_CACHE[org_id] = (creds, time.time())
        return creds

    async def save(self, creds: VoiceCredentials) -> VoiceCredentials:
        container = get_voice_credentials_container()
        if container:
            doc = creds.model_dump(mode="json")
            doc["id"] = _doc_id(creds.organization_id)
            container.upsert_item(body=doc)
            _invalidate(creds.organization_id)
        return creds

    async def delete(self, org_id: str) -> None:
        container = get_voice_credentials_container()
        if container:
            try:
                container.delete_item(item=_doc_id(org_id), partition_key=org_id)
            except Exception:
                pass
        _invalidate(org_id)

    async def list_all(self) -> List[VoiceCredentials]:
        container = get_voice_credentials_container()
        if not container:
            return []
        items = container.query_items(query="SELECT * FROM c", enable_cross_partition_query=True)
        result = []
        for item in items:
            data = {k: v for k, v in item.items() if not k.startswith("_") and k != "id"}
            result.append(VoiceCredentials(**data))
        return result
