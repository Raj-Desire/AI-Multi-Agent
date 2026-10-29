import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Request

from app.core.cosmos import get_activity_logs_container


def get_client_ip(request: Optional[Request]) -> str:
    """Best-effort caller IP, honouring the proxy header set by the hosting platform."""
    if request is None:
        return "unknown"
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        # Some proxies append the source port (IPv4 only)
        if ip.count(":") == 1:
            ip = ip.split(":")[0]
        if ip:
            return ip
    return request.client.host if request.client else "unknown"


class ActivityLogRepository:
    @staticmethod
    async def record(
        action: str,
        user: Dict[str, Any],
        ip_address: str,
        category: str = "action",
    ) -> None:
        """Writes one audit entry. Never raises: auditing must not break the user's request."""
        now = datetime.now(timezone.utc)
        username = user.get("username") or user.get("email") or "unknown"
        org_id = user.get("organization_id") or user.get("id") or "unknown"
        doc = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "org_name": user.get("org_name"),
            "user_id": user.get("id"),
            "username": username,
            "email": user.get("email"),
            "ip_address": ip_address,
            "category": category,
            "action": action,
            "message": f"{username} {action} from {ip_address}",
            "timestamp": now.isoformat(),
        }

        def _sync_write():
            container = get_activity_logs_container()
            if container:
                container.upsert_item(body=doc)

        try:
            await asyncio.to_thread(_sync_write)
        except Exception as e:
            print(f"[ActivityLog Error] Failed to record '{action}': {e}")

    @staticmethod
    async def list_recent(limit: int = 200, search: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
        limit = max(1, min(limit, 1000))
        clauses = []
        params: List[Dict[str, Any]] = []
        if category:
            clauses.append("c.category = @category")
            params.append({"name": "@category", "value": category})
        if search:
            clauses.append(
                "(CONTAINS(LOWER(c.username), @q) OR CONTAINS(c.ip_address, @q) "
                "OR CONTAINS(LOWER(c.action), @q) OR CONTAINS(LOWER(IS_DEFINED(c.org_name) ? c.org_name : ''), @q))"
            )
            params.append({"name": "@q", "value": search.strip().lower()})
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        query = f"SELECT * FROM c {where} ORDER BY c.timestamp DESC OFFSET 0 LIMIT {limit}"

        def _sync_list():
            container = get_activity_logs_container()
            if not container:
                return []
            items = container.query_items(query=query, parameters=params, enable_cross_partition_query=True)
            return list(items)

        try:
            return await asyncio.to_thread(_sync_list)
        except Exception as e:
            print(f"[ActivityLog Error] Failed to list: {e}")
            return []
