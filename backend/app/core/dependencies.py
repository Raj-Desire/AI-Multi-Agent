from dataclasses import dataclass
from fastapi import Header, HTTPException

@dataclass(frozen=True)
class TenantContext:
    organization_id: str
    user_id: str

async def get_tenant_context(
    x_organization_id: str = Header(default="org_demo_001"),
    x_user_id: str = Header(default="usr_demo_001")
) -> TenantContext:
    if not x_organization_id:
        raise HTTPException(status_code=401, detail="Missing Organization Scope")
    return TenantContext(organization_id=x_organization_id, user_id=x_user_id)
