import time
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from app.core.cosmos import get_telephony_settings_container
from app.models.telephony import TelephonySettings

_CACHE: Dict[str, Tuple[Optional[TelephonySettings], float]] = {}
CACHE_TTL_SECONDS = 60.0
# Used only when no database is configured (local runs, tests).
_MEMORY: Dict[str, TelephonySettings] = {}


class TelephonySettingsRepository:
    async def get(self, organization_id: str) -> Optional[TelephonySettings]:
        cached = _CACHE.get(organization_id)
        if cached and time.time() - cached[1] < CACHE_TTL_SECONDS:
            return cached[0]

        container = get_telephony_settings_container()
        if not container:
            return _MEMORY.get(organization_id)

        found: Optional[TelephonySettings] = None
        try:
            item = container.read_item(item=f"tel_{organization_id}", partition_key=organization_id)
            found = TelephonySettings(
                organization_id=organization_id,
                provider=item.get("provider", "twilio"),
                market=item.get("market"),
            )
        except Exception:
            found = None
        _CACHE[organization_id] = (found, time.time())
        return found

    async def save(self, settings: TelephonySettings) -> TelephonySettings:
        container = get_telephony_settings_container()
        if not container:
            _MEMORY[settings.organization_id] = settings
        else:
            container.upsert_item(body={
                "id": f"tel_{settings.organization_id}",
                "organization_id": settings.organization_id,
                "provider": settings.provider,
                "market": settings.market,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        _CACHE.pop(settings.organization_id, None)
        return settings
