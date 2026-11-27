from typing import Any, Dict, List, Literal, Optional, Type, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.validation import parse_body_without_echo
from app.core.dependencies import require_admin, require_superadmin
from app.repositories.user_repository import UserRepository
from app.repositories.voice_credentials_repository import VoiceCredentialsRepository
from app.services.voice_credentials_service import VoiceCredentialsService
from app.voice_stack.resolver import custom_pipeline_default_enabled, platform_keys

superadmin_router = APIRouter(prefix="/superadmin/voice-profiles", tags=["Voice Profiles"])
org_router = APIRouter(prefix="/voice-profile", tags=["Voice Profiles"])

_repo = VoiceCredentialsRepository()
_service = VoiceCredentialsService(_repo)


def get_voice_repo() -> VoiceCredentialsRepository:
    return _repo


def get_voice_service() -> VoiceCredentialsService:
    return _service


class SuperadminProfilePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tts_engine: Optional[Literal["aura", "cartesia"]] = None
    credential_mode: Optional[Literal["platform", "own"]] = None
    engine_key: Optional[str] = Field(None, repr=False)
    tts_key: Optional[str] = Field(None, repr=False)
    allow_org_edit: Optional[bool] = None
    custom_pipeline_enabled: Optional[bool] = None


class OrgProfilePayload(BaseModel):
    """Org admins may only supply keys; engine, mode and edit flag are not declared, so they are rejected."""

    model_config = ConfigDict(extra="forbid")
    engine_key: Optional[str] = Field(None, repr=False)
    tts_key: Optional[str] = Field(None, repr=False)


_parse_body = parse_body_without_echo


def _empty_slot() -> Dict[str, Any]:
    return {"key_hint": "", "status": "unverified", "source": None, "last_verified_at": None, "configured": False}


def _legacy_view() -> Dict[str, Any]:
    """Shape for organizations with no credentials document: unconfigured, platform keys apply."""
    return {
        "configured": False,
        "tts_engine": None,
        "credential_mode": "platform",
        "allow_org_edit": False,
        "custom_pipeline_enabled": custom_pipeline_default_enabled(),
        "engine": _empty_slot(),
        "tts": _empty_slot(),
    }


async def _profile(repo: VoiceCredentialsRepository, service: VoiceCredentialsService, org_id: str) -> Dict[str, Any]:
    if await repo.get_by_org(org_id) is None:
        view = _legacy_view()
    else:
        view = {"configured": True, **await service.get_masked(org_id)}
    view["custom_pipeline_allowed"] = view["custom_pipeline_enabled"]
    return view


# ---------------- Superadmin ----------------

@superadmin_router.get("")
async def list_profiles(
    _: Dict[str, Any] = Depends(require_superadmin),
    repo: VoiceCredentialsRepository = Depends(get_voice_repo),
):
    orgs = await UserRepository.list_organizations()
    by_org = {c.organization_id: c for c in await repo.list_all()}
    result: List[Dict[str, Any]] = []
    for org in orgs:
        org_id = org["organization_id"]
        view = {"configured": True, **VoiceCredentialsService.view_of(by_org[org_id])} if org_id in by_org else _legacy_view()
        result.append({"organization_id": org_id, "org_name": org.get("org_name"), **view})
    return result


@superadmin_router.get("/{org_id}")
async def get_profile(
    org_id: str,
    _: Dict[str, Any] = Depends(require_superadmin),
    repo: VoiceCredentialsRepository = Depends(get_voice_repo),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    return {"organization_id": org_id, **await _profile(repo, service, org_id)}


@superadmin_router.put("/{org_id}")
async def put_profile(
    org_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_superadmin),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    body = await _parse_body(request, SuperadminProfilePayload)
    view = await service.save(org_id, actor_id=user["id"], **body.model_dump())
    return {"organization_id": org_id, "configured": True, **view}


@superadmin_router.post("/{org_id}/verify")
async def verify_profile(
    org_id: str,
    _: Dict[str, Any] = Depends(require_superadmin),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    return {"organization_id": org_id, "configured": True, **await service.verify(org_id)}


@superadmin_router.post("/{org_id}/import-platform")
async def import_platform(
    org_id: str,
    overwrite: bool = Query(False),
    user: Dict[str, Any] = Depends(require_superadmin),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    if not overwrite:
        current = await service.get_masked(org_id)
        engine_key, tts_key = platform_keys()
        for slot, key in (("engine", engine_key), ("tts", tts_key)):
            info = current[slot]
            if key and info["configured"] and info["source"] == "own":
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="This organization already has its own key configured. Confirm to overwrite it.",
                )
    view = await service.import_platform(org_id, actor_id=user["id"])
    return {"organization_id": org_id, "configured": True, **view}


@superadmin_router.delete("/{org_id}/keys/{slot}")
async def delete_key(
    org_id: str,
    slot: Literal["engine", "tts"],
    user: Dict[str, Any] = Depends(require_superadmin),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    view = await service.clear(org_id, slot, actor_id=user["id"])
    return {"organization_id": org_id, "configured": True, **view}


# ---------------- Org admin ----------------

@org_router.get("")
async def get_own_profile(
    user: Dict[str, Any] = Depends(require_admin),
    repo: VoiceCredentialsRepository = Depends(get_voice_repo),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    return await _profile(repo, service, user.get("organization_id") or user.get("id"))


@org_router.put("")
async def put_own_profile(
    request: Request,
    user: Dict[str, Any] = Depends(require_admin),
    repo: VoiceCredentialsRepository = Depends(get_voice_repo),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    org_id = user.get("organization_id") or user.get("id")
    creds = await repo.get_by_org(org_id)
    if creds is None or not creds.allow_org_edit:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Editing voice settings is not enabled for your organization.")
    body = await _parse_body(request, OrgProfilePayload)
    view = await service.save(org_id, actor_id=user["id"], engine_key=body.engine_key, tts_key=body.tts_key)
    return {"configured": True, **view}
