import asyncio
from typing import Any, Dict, Optional

from fastapi import Request

from app.core.dependencies import TenantContext
from app.repositories.activity_log_repository import ActivityLogRepository, get_client_ip
from app.repositories.user_repository import UserRepository


async def log_login(request: Request, user: Dict[str, Any]) -> None:
    await ActivityLogRepository.record("logged in", user, get_client_ip(request), category="login")


async def log_action(request: Request, ctx: TenantContext, action: str) -> None:
    """Records a major operation by the tenant user behind `ctx`. Never raises."""
    try:
        user = await UserRepository.get_by_id(ctx.user_id) or {}
        user = {
            **user,
            "id": ctx.user_id,
            "email": ctx.email,
            "organization_id": ctx.organization_id,
            "org_name": ctx.org_name or user.get("org_name"),
        }
        await ActivityLogRepository.record(action, user, get_client_ip(request))
    except Exception as e:
        print(f"[ActivityLog Error] log_action '{action}': {e}")
