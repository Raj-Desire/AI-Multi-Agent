import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.core.cosmos import get_plivo_container
from app.models.plivo import PlivoConfiguration

_CACHE: Dict[str, Tuple[Optional[PlivoConfiguration], float]] = {}
_LIST_CACHE: Dict[str, Tuple[List[PlivoConfiguration], float]] = {}
_PHONE_CACHE: Dict[str, Tuple[Optional[PlivoConfiguration], float]] = {}
CACHE_TTL_SECONDS = 60.0
LIST_TTL_SECONDS = 30.0
_MAX_PHONE_CACHE = 500
# Used only when no database is configured (local runs, tests).
_MEMORY: Dict[str, PlivoConfiguration] = {}


def _invalidate(org_id: Optional[str] = None) -> None:
    _LIST_CACHE.clear()
    _PHONE_CACHE.clear()
    if org_id:
        _CACHE.pop(org_id, None)
    else:
        _CACHE.clear()


def normalize_number(number: str) -> str:
    """Digits only, so '+91 1800-555-001' and '+911800555001' are the same number."""
    return "".join(c for c in (number or "") if c.isdigit())


def _numbers(cfg: PlivoConfiguration) -> List[str]:
    return [d for d in (normalize_number(n) for n in (cfg.phone_number or "").split(",")) if d]


def _from_item(item: dict) -> PlivoConfiguration:
    now = datetime.now(timezone.utc)
    return PlivoConfiguration(
        id=item.get("id", f"cfg_{item.get('organization_id')}"),
        organization_id=item.get("organization_id", ""),
        auth_id=item.get("auth_id", ""),
        encrypted_auth_token=item.get("encrypted_auth_token", ""),
        phone_number=item.get("phone_number", ""),
        application_id=item.get("application_id"),
        public_base_url=item.get("public_base_url"),
        inbound_forward_mode=item.get("inbound_forward_mode", "global"),
        inbound_forward_global_number=item.get("inbound_forward_global_number"),
        inbound_forward_mapping=item.get("inbound_forward_mapping") or {},
        default_agent_id=item.get("default_agent_id"),
        inbound_agent_mapping=item.get("inbound_agent_mapping") or {},
        escalation_alerts_enabled=item.get("escalation_alerts_enabled", True),
        escalation_alert_email=item.get("escalation_alert_email"),
        status="CONNECTED",
        created_at=now,
        updated_at=now,
    )


class PlivoRepository:
    async def get_by_org(self, organization_id: str) -> Optional[PlivoConfiguration]:
        cached = _CACHE.get(organization_id)
        if cached and time.time() - cached[1] < CACHE_TTL_SECONDS:
            return cached[0]
        container = get_plivo_container()
        if not container:
            return _MEMORY.get(organization_id)
        found: Optional[PlivoConfiguration] = None
        try:
            # Point read: document id cfg_<org>, partition key = organization id
            found = _from_item(container.read_item(item=f"cfg_{organization_id}", partition_key=organization_id))
        except Exception:
            found = None
        _CACHE[organization_id] = (found, time.time())
        return found

    async def list_all(self) -> List[PlivoConfiguration]:
        cached = _LIST_CACHE.get("all")
        if cached and time.time() - cached[1] < LIST_TTL_SECONDS:
            return cached[0]
        container = get_plivo_container()
        if not container:
            return list(_MEMORY.values())
        try:
            items = list(container.query_items(query="SELECT * FROM c", enable_cross_partition_query=True))
        except Exception as e:
            print(f"[PlivoRepository Error] list_all: {e}")
            return []
        configs = [_from_item(i) for i in items]
        _LIST_CACHE["all"] = (configs, time.time())
        return configs

    async def get_by_phone_number(self, phone_number: str) -> Optional[PlivoConfiguration]:
        """The configuration whose number list contains exactly this number (digits compared, not substrings).
        A number claimed by more than one organization is ambiguous: return None rather than guess a tenant."""
        wanted = normalize_number(phone_number)
        if not wanted:
            return None
        cached = _PHONE_CACHE.get(wanted)
        if cached and time.time() - cached[1] < CACHE_TTL_SECONDS:
            return cached[0]
        matches = [cfg for cfg in await self.list_all() if wanted in _numbers(cfg)]
        found: Optional[PlivoConfiguration] = None
        if len({m.organization_id for m in matches}) > 1:
            print(f"[PlivoRepository Warning] number {phone_number} is claimed by several organizations; refusing to route it")
        elif matches:
            found = matches[0]
        if len(_PHONE_CACHE) >= _MAX_PHONE_CACHE:
            _PHONE_CACHE.clear()
        _PHONE_CACHE[wanted] = (found, time.time())
        return found

    async def save(self, config: PlivoConfiguration) -> PlivoConfiguration:
        container = get_plivo_container()
        if not container:
            _MEMORY[config.organization_id] = config
        else:
            container.upsert_item(body={
                "id": f"cfg_{config.organization_id}",
                "organization_id": config.organization_id,
                "auth_id": config.auth_id,
                "encrypted_auth_token": config.encrypted_auth_token,
                "phone_number": config.phone_number,
                "application_id": config.application_id,
                "public_base_url": config.public_base_url,
                "inbound_forward_mode": config.inbound_forward_mode,
                "inbound_forward_global_number": config.inbound_forward_global_number,
                "inbound_forward_mapping": config.inbound_forward_mapping or {},
                "default_agent_id": config.default_agent_id,
                "inbound_agent_mapping": config.inbound_agent_mapping or {},
                "escalation_alerts_enabled": config.escalation_alerts_enabled,
                "escalation_alert_email": config.escalation_alert_email,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        _invalidate(config.organization_id)
        return config
