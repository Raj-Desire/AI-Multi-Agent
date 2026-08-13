from typing import Dict, Optional
from app.models.twilio import TwilioConfiguration

class TwilioRepository:
    _storage: Dict[str, TwilioConfiguration] = {}

    async def get_by_org(self, organization_id: str) -> Optional[TwilioConfiguration]:
        return self._storage.get(organization_id)

    async def save(self, config: TwilioConfiguration) -> TwilioConfiguration:
        self._storage[config.organization_id] = config
        return config
