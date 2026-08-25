from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, EmailStr, Field
from typing import List, Dict, Any, Optional
import uuid
from app.repositories.user_repository import UserRepository
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.platform_rules_repository import PlatformRulesRepository
from app.services.twilio_service import TwilioService
from app.schemas.twilio import SaveTwilioConfigRequest, TwilioConfigResponse
from app.schemas.platform_rules import VoiceRulesResponse, UpdateVoiceRulesPayload
from app.core.dependencies import require_superadmin, TenantContext

router = APIRouter(prefix="/superadmin", tags=["Superadmin Management"])

twilio_repo = TwilioRepository()
twilio_service = TwilioService(twilio_repo)


class CreateOrganizationPayload(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=100)
    admin_username: str = Field(..., min_length=2, max_length=50)
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=6)

class CreateAdminPayload(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    organization_id: str
    org_name: str

class UpdateUserPayload(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = Field(None, description="Must be 'superadmin', 'admin', or 'user'")
    organization_id: Optional[str] = None
    org_name: Optional[str] = None
    is_active: Optional[bool] = None

class ToggleOrganizationStatusPayload(BaseModel):
    is_active: bool

class SuperadminResetPasswordPayload(BaseModel):
    new_password: str = Field(..., min_length=6)

class OrganizationSummaryResponse(BaseModel):
    organization_id: str
    org_name: str
    admin_count: int
    user_count: int
    total_members: int
    is_active: bool
    admins: List[Dict[str, Any]]
    created_at: str

class SuperadminUserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    organization_id: Optional[str] = None
    org_name: Optional[str] = None
    is_active: bool
    created_at: str

class PlatformOverviewResponse(BaseModel):
    total_organizations: int
    total_superadmins: int
    total_admins: int
    total_users: int
    total_accounts: int

class OrganizationTwilioSummary(BaseModel):
    organization_id: str
    org_name: str
    account_sid: Optional[str] = None
    phone_number: Optional[str] = None
    twiml_app_sid: Optional[str] = None
    api_key_sid: Optional[str] = None
    inbound_forward_mode: Optional[str] = None
    status: str


@router.get("/overview", response_model=PlatformOverviewResponse)
async def get_overview(_: Dict[str, Any] = Depends(require_superadmin)):
    users = await UserRepository.list_users()
    orgs = await UserRepository.list_organizations()

    superadmins = sum(1 for u in users if u.get("role") == "superadmin")
    admins = sum(1 for u in users if u.get("role") == "admin")
    standard_users = sum(1 for u in users if u.get("role") == "user")

    return PlatformOverviewResponse(
        total_organizations=len(orgs),
        total_superadmins=superadmins,
        total_admins=admins,
        total_users=standard_users,
        total_accounts=len(users)
    )

@router.get("/organizations", response_model=List[OrganizationSummaryResponse])
async def list_organizations(_: Dict[str, Any] = Depends(require_superadmin)):
    orgs = await UserRepository.list_organizations()
    return [
        OrganizationSummaryResponse(
            organization_id=o["organization_id"],
            org_name=o["org_name"],
            admin_count=o["admin_count"],
            user_count=o["user_count"],
            total_members=o["total_members"],
            is_active=o.get("is_active", True),
            admins=o["admins"],
            created_at=o.get("created_at", "")
        ) for o in orgs
    ]

@router.get("/twilio/all", response_model=List[OrganizationTwilioSummary])
async def list_all_twilio_configs(_: Dict[str, Any] = Depends(require_superadmin)):
    """Returns Twilio configuration status across all client organizations."""
    orgs = await UserRepository.list_organizations()
    all_configs = await twilio_repo.list_all()
    config_by_org = {c.organization_id: c for c in all_configs}

    summaries = []
    for org in orgs:
        org_id = org["organization_id"]
        cfg = config_by_org.get(org_id)
        summaries.append(OrganizationTwilioSummary(
            organization_id=org_id,
            org_name=org["org_name"],
            account_sid=cfg.account_sid if cfg else None,
            phone_number=cfg.phone_number if cfg else None,
            twiml_app_sid=cfg.twiml_app_sid if cfg else None,
            api_key_sid=cfg.api_key_sid if cfg else None,
            inbound_forward_mode=cfg.inbound_forward_mode if cfg else "global",
            status=cfg.status if cfg else "NOT_CONFIGURED"
        ))
    return summaries

@router.get("/twilio/{organization_id}", response_model=Optional[TwilioConfigResponse])
async def get_org_twilio_config(
    organization_id: str,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Superadmin can view the Twilio configuration of any organization."""
    ctx = TenantContext(
        organization_id=organization_id,
        user_id="superadmin",
        email="admin@desireai.com",
        role="superadmin"
    )
    return await twilio_service.get_config(ctx)

@router.post("/twilio/{organization_id}", response_model=TwilioConfigResponse)
async def set_org_twilio_config(
    organization_id: str,
    payload: SaveTwilioConfigRequest,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Superadmin can set or update the Twilio configuration for any organization."""
    ctx = TenantContext(
        organization_id=organization_id,
        user_id="superadmin",
        email="admin@desireai.com",
        role="superadmin"
    )
    return await twilio_service.save_config(ctx, payload)


@router.patch("/organizations/{organization_id}/status", status_code=status.HTTP_200_OK)
async def toggle_org_status(
    organization_id: str,
    payload: ToggleOrganizationStatusPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Enables or disables an entire organization. If disabled, none of its users can log in."""
    if organization_id == "org_platform_root":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform Master root organization cannot be disabled."
        )

    updated_count = await UserRepository.toggle_organization_status(organization_id, payload.is_active)
    action = "enabled" if payload.is_active else "disabled"
    return {"message": f"Organization {organization_id} has been {action}. {updated_count} accounts updated.", "is_active": payload.is_active}

@router.delete("/organizations/{organization_id}", status_code=status.HTTP_200_OK)
async def delete_org(
    organization_id: str,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Totally deletes an organization and all its users."""
    if organization_id == "org_platform_root":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform Master root organization cannot be deleted."
        )

    deleted_count = await UserRepository.delete_organization(organization_id)
    return {"message": f"Organization {organization_id} and all its {deleted_count} accounts have been deleted permanently."}


@router.post("/organizations", response_model=SuperadminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_organization_and_admin(
    payload: CreateOrganizationPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Creates a new Organization and provisions its initial Organization Admin."""
    org_id = f"org_{uuid.uuid4().hex[:8]}"
    try:
        new_admin = await UserRepository.create_user(
            username=payload.admin_username,
            email=payload.admin_email,
            password=payload.admin_password,
            role="admin",
            organization_id=org_id,
            org_name=payload.org_name
        )
        return SuperadminUserResponse(
            id=new_admin["id"],
            username=new_admin["username"],
            email=new_admin["email"],
            role=new_admin["role"],
            organization_id=new_admin.get("organization_id"),
            org_name=new_admin.get("org_name"),
            is_active=new_admin.get("is_active", True),
            created_at=new_admin.get("created_at", "")
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create organization: {e}")

@router.get("/users", response_model=List[SuperadminUserResponse])
async def list_all_users(
    organization_id: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    _: Dict[str, Any] = Depends(require_superadmin)
):
    users = await UserRepository.list_users(organization_id=organization_id, role=role)
    return [
        SuperadminUserResponse(
            id=u["id"],
            username=u.get("username", "User"),
            email=u["email"],
            role=u.get("role", "user"),
            organization_id=u.get("organization_id"),
            org_name=u.get("org_name"),
            is_active=u.get("is_active", True),
            created_at=u.get("created_at", "")
        ) for u in users
    ]

@router.post("/admins", response_model=SuperadminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_org_admin(
    payload: CreateAdminPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Creates a new Admin for an existing organization."""
    try:
        new_admin = await UserRepository.create_user(
            username=payload.username,
            email=payload.email,
            password=payload.password,
            role="admin",
            organization_id=payload.organization_id,
            org_name=payload.org_name
        )
        return SuperadminUserResponse(
            id=new_admin["id"],
            username=new_admin["username"],
            email=new_admin["email"],
            role=new_admin["role"],
            organization_id=new_admin.get("organization_id"),
            org_name=new_admin.get("org_name"),
            is_active=new_admin.get("is_active", True),
            created_at=new_admin.get("created_at", "")
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create admin: {e}")

@router.put("/users/{user_id}", response_model=SuperadminUserResponse)
async def update_user_details(
    user_id: str,
    payload: UpdateUserPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    updated = await UserRepository.update_user(
        user_id=user_id,
        username=payload.username,
        role=payload.role,
        organization_id=payload.organization_id,
        org_name=payload.org_name,
        is_active=payload.is_active
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return SuperadminUserResponse(
        id=updated["id"],
        username=updated["username"],
        email=updated["email"],
        role=updated["role"],
        organization_id=updated.get("organization_id"),
        org_name=updated.get("org_name"),
        is_active=updated.get("is_active", True),
        created_at=updated.get("created_at", "")
    )

@router.put("/users/{user_id}/password", status_code=status.HTTP_200_OK)
async def superadmin_reset_password(
    user_id: str,
    payload: SuperadminResetPasswordPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    target_user = await UserRepository.get_by_id(user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    success = await UserRepository.update_password(user_id, payload.new_password)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to reset password.")

    return {"message": f"Password for {target_user['email']} successfully updated."}

@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def superadmin_delete_user(
    user_id: str,
    current_superadmin: Dict[str, Any] = Depends(require_superadmin)
):
    target_user = await UserRepository.get_by_id(user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target_user["id"] == current_superadmin["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmin cannot delete their own active account."
        )

    # Safety check: Do not delete the last superadmin
    if target_user.get("role") == "superadmin":
        all_users = await UserRepository.list_users()
        superadmin_count = sum(1 for u in all_users if u.get("role") == "superadmin")
        if superadmin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete this superadmin. At least one Superadmin must always exist."
            )

    success = await UserRepository.delete_user(target_user["id"], target_user["email"])
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete user.")

    return {"message": f"User {target_user['email']} deleted successfully."}


# ---------------------------------------------------------------------------
# Platform Voice Agent Rules Management
# ---------------------------------------------------------------------------

@router.get("/voice-rules", response_model=VoiceRulesResponse)
async def get_platform_voice_rules(_: Dict[str, Any] = Depends(require_superadmin)):
    """Retrieves all platform voice agent rules with their current enabled/disabled state."""
    data = await PlatformRulesRepository.get_all_rules()
    return VoiceRulesResponse(**data)


@router.put("/voice-rules", response_model=VoiceRulesResponse)
async def update_platform_voice_rules(
    payload: UpdateVoiceRulesPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """Updates enabled/disabled states for specified voice rules."""
    updated = await PlatformRulesRepository.update_rules_state(payload.rules)
    return VoiceRulesResponse(**updated)


@router.post("/voice-rules/reset", response_model=VoiceRulesResponse)
async def reset_platform_voice_rules(_: Dict[str, Any] = Depends(require_superadmin)):
    """Resets all platform voice rules to recommended defaults."""
    reset_data = await PlatformRulesRepository.reset_to_defaults()
    return VoiceRulesResponse(**reset_data)

