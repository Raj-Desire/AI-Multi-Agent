from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, EmailStr, Field
from typing import List, Dict, Any, Optional
import uuid
from app.repositories.user_repository import UserRepository
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.platform_rules_repository import PlatformRulesRepository
from app.repositories.call_repository import CallRepository
from app.services.twilio_service import TwilioService
from app.services.cost_calculator import CostCalculatorService
from app.schemas.twilio import SaveTwilioConfigRequest, TwilioConfigResponse, TwilioDirectAccountUsageResponse
from app.schemas.platform_rules import VoiceRulesResponse, UpdateVoiceRulesPayload
from app.core.dependencies import require_superadmin, TenantContext

router = APIRouter(prefix="/superadmin", tags=["Superadmin Management"])

twilio_repo = TwilioRepository()
twilio_service = TwilioService(twilio_repo)
call_repo = CallRepository()


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
            detail="Desire Infoweb root organization cannot be disabled."
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
            detail="Desire Infoweb root organization cannot be deleted."
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


# ---------------------------------------------------------------------------
# Multi-Tenant Cost, Token & Infrastructure Telemetry (SuperAdmin Only)
# ---------------------------------------------------------------------------

@router.get("/usage-cost-breakdown")
async def get_platform_usage_and_cost(
    time_range: str = Query("all", description="Time range: 'all', 'today', '7d', '30d'"),
    markup: float = Query(2.5, description="Client pricing markup multiplier (default 2.5x)"),
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """
    SuperAdmin exclusive telemetry calculating total telephony, STT, TTS, and LLM token usage
    across all tenant organizations, alongside billable margins and cost per organization.
    """
    from datetime import datetime, timezone, timedelta

    all_calls = await call_repo.list_all_calls(limit=10000)
    all_orgs = await UserRepository.list_organizations()

    # Filter calls by time_range
    now = datetime.now(timezone.utc)
    filtered_calls = all_calls

    if time_range == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        filtered_calls = [c for c in all_calls if c.created_at and c.created_at >= start_date]
    elif time_range == "7d":
        start_date = now - timedelta(days=7)
        filtered_calls = [c for c in all_calls if c.created_at and c.created_at >= start_date]
    elif time_range == "30d":
        start_date = now - timedelta(days=30)
        filtered_calls = [c for c in all_calls if c.created_at and c.created_at >= start_date]

    telemetry = CostCalculatorService.aggregate_organization_usage(
        calls=filtered_calls,
        organizations=all_orgs,
        markup_multiplier=max(1.0, markup)
    )

    telemetry["time_range"] = time_range
    return telemetry


# ---------------------------------------------------------------------------
# Direct Twilio Account Native Usage & Credit Telemetry (SuperAdmin Only)
# ---------------------------------------------------------------------------

@router.get("/twilio-account-usage", response_model=TwilioDirectAccountUsageResponse)
async def get_direct_twilio_usage(
    organization_id: Optional[str] = Query(None, description="Organization ID or blank for first connected account"),
    time_range: str = Query("this_month", description="this_month, last_month, today, yesterday, all_time"),
    current_admin: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Directly query official Twilio Usage Records and account balance.
    Provides true vendor billing logs, monthly recurring fixed lease charges (numbers),
    and pay-as-you-go variable itemization.
    """
    target_org_id = organization_id
    target_org_name = "Primary Organization"

    if not target_org_id:
        # Auto-pick the first organization that has an active Twilio configuration
        all_configs = await twilio_repo.list_all()
        if all_configs:
            first_cfg = all_configs[0]
            target_org_id = first_cfg.organization_id
            target_org_name = first_cfg.organization_id
            # Resolve friendly name if available
            org_info = await UserRepository.get_organization(target_org_id)
            if org_info:
                target_org_name = org_info.get("org_name", target_org_name)
        else:
            return TwilioDirectAccountUsageResponse(
                configured=False,
                message="No Twilio configurations found in the platform database."
            )
    else:
        org_info = await UserRepository.get_organization(target_org_id)
        if org_info:
            target_org_name = org_info.get("org_name", target_org_id)

    ctx = TenantContext(
        organization_id=target_org_id,
        user_id=current_admin.get("id", "superadmin"),
        email=current_admin.get("email", "admin@platform.com"),
        role="superadmin",
        org_name=target_org_name
    )

    res = await twilio_service.get_account_usage_records(ctx, time_range=time_range)
    if res.configured and not res.org_name:
        res.org_name = target_org_name
    return res


@router.get("/twilio-configured-organizations")
async def list_twilio_configured_organizations(_: Dict[str, Any] = Depends(require_superadmin)):
    """
    Returns list of all organizations that have Twilio configured for easy switching in the dashboard.
    """
    configs = await twilio_repo.list_all()
    org_list = []
    for cfg in configs:
        org_info = await UserRepository.get_organization(cfg.organization_id)
        org_name = org_info.get("org_name") if org_info else cfg.organization_id
        org_list.append({
            "organization_id": cfg.organization_id,
            "org_name": org_name or cfg.organization_id,
            "account_sid": cfg.account_sid,
            "phone_number": cfg.phone_number,
            "status": cfg.status
        })
    return org_list


@router.get("/twilio-recording-inventory")
async def get_twilio_recording_inventory(
    organization_id: Optional[str] = Query(None),
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Returns inventory of stored recordings on Twilio:
    Total count, recordings older than 28 days, recordings under 28 days, and total minutes.
    """
    return await twilio_service.get_recording_inventory(org_id=organization_id)


@router.post("/twilio-purge-recordings")
async def purge_old_twilio_recordings(
    days: int = Query(28, ge=1, le=365, description="Purge recordings older than this number of days"),
    organization_id: Optional[str] = Query(None),
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Deletes call recordings on Twilio older than `days` (default 28) to eliminate recurring storage fees.
    """
    res = await twilio_service.purge_recordings(org_id=organization_id, days=days)
    return res


class EscalationAlertConfigPayload(BaseModel):
    organization_id: Optional[str] = None
    enabled: bool = True
    recipient_email: str = Field(..., min_length=3)


@router.get("/escalation-alert-config")
async def get_escalation_alert_config(
    organization_id: Optional[str] = Query(None),
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Returns the current escalation recording alert settings (enabled, recipient email, sender, Graph status).
    """
    from app.services.graph_email_service import graph_email_service
    import os

    cfg = None
    if organization_id:
        cfg = await twilio_repo.get_by_org(organization_id)
    if not cfg:
        cfg = await twilio_repo.get_default()

    default_email = os.getenv("ESCALATION_ALERT_RECIPIENT", "ponkiyaraj7@gmail.com")
    enabled = cfg.escalation_alerts_enabled if cfg and cfg.escalation_alerts_enabled is not None else True
    recipient = (cfg.escalation_alert_email if cfg and cfg.escalation_alert_email else None) or default_email

    return {
        "organization_id": cfg.organization_id if cfg else organization_id,
        "enabled": enabled,
        "recipient_email": recipient,
        "mail_sender": graph_email_service.mail_sender,
        "graph_configured": graph_email_service.is_configured(),
        "sender": graph_email_service.mail_sender
    }


@router.post("/escalation-alert-config")
async def update_escalation_alert_config(
    payload: EscalationAlertConfigPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Updates the escalation recording alert settings (toggle ON/OFF and recipient email).
    """
    cfg = None
    if payload.organization_id:
        cfg = await twilio_repo.get_by_org(payload.organization_id)
    if not cfg:
        cfg = await twilio_repo.get_default()

    if not cfg:
        # Create or update a global default configuration if no tenant is connected yet
        org_id = payload.organization_id or "global"
        cfg = TwilioConfiguration(
            id=f"cfg_{org_id}",
            organization_id=org_id,
            account_sid="",
            encrypted_auth_token="",
            phone_number="",
            escalation_alerts_enabled=payload.enabled,
            escalation_alert_email=payload.recipient_email.strip(),
            status="CONNECTED",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
    else:
        cfg.escalation_alerts_enabled = payload.enabled
        cfg.escalation_alert_email = payload.recipient_email.strip()

    await twilio_repo.save(cfg)

    return {
        "success": True,
        "message": f"Escalation alert settings updated successfully. Notifications will route to {cfg.escalation_alert_email}.",
        "enabled": cfg.escalation_alerts_enabled,
        "recipient_email": cfg.escalation_alert_email
    }


class SendTestAlertPayload(BaseModel):
    recipient_email: str
    organization_id: Optional[str] = None


@router.post("/send-test-escalation-alert")
async def send_test_escalation_alert(
    payload: SendTestAlertPayload,
    _: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Dispatches a real formatted test alert email using Microsoft Graph API to verify delivery.
    """
    from app.services.graph_email_service import graph_email_service

    org_name = "AI Voice Platform (Production Tenant)"
    if payload.organization_id:
        org_info = await UserRepository.get_organization(payload.organization_id)
        if org_info and org_info.get("org_name"):
            org_name = org_info["org_name"]

    res = await graph_email_service.send_recording_escalation_alert(
        to_recipients=[payload.recipient_email.strip()],
        org_name=org_name,
        call_id="call_test_audit_verification",
        call_sid="CA_twilio_test_audit_example",
        customer_phone="+919023671902",
        call_duration_seconds=128,
        retention_reason="AI Confusion & Repeated Misunderstanding (Audit Trigger)",
        summary="Customer asked for clarification on monthly number pricing and regional tariffs. AI voice assistant repeated conflicting responses, triggering supervisory escalation and audio retention.",
        sentiment="Negative",
        transcript_excerpt="Customer: Can you explain the monthly DID rental for my UK number?\nAgent: I apologize, let me check that again for you...\nCustomer: You already said that twice. Are you unable to answer?\nAgent: I sincerely apologize for the confusion. I am flagging this call for audit.",
        retention_days=28
    )

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to dispatch email."))

    return res





