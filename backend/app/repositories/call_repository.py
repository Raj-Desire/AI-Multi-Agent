from typing import Dict, List
from app.models.call import Call

class CallRepository:
    _storage: Dict[str, List[Call]] = {}

    async def list_by_org(self, organization_id: str) -> List[Call]:
        return self._storage.get(organization_id, [])

    async def save(self, call: Call) -> Call:
        if call.organization_id not in self._storage:
            self._storage[call.organization_id] = []
        self._storage[call.organization_id].insert(0, call)
        return call
