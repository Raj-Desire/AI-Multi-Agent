from typing import Any, Dict, List, Literal, Optional, Type, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.models.voice_credentials import DEFAULT_LLM_API_VERSION
from app.core.validation import parse_body_without_echo
from app.core.dependencies import require_admin, require_superadmin
from app.repositories.user_repository import UserRepository
from app.repositories.voice_credentials_repository import VoiceCredentialsRepository
from app.services.voice_credentials_service import VoiceCredentialsService
from app.voice_stack.resolver import PLATFORM_ROOT_ORG_ID, custom_pipeline_default_enabled, platform_keys

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
    voice_engine: Optional[Literal["managed", "custom"]] = None
    llm_endpoint: Optional[str] = Field(None, max_length=500)
    llm_api_key: Optional[str] = Field(None, repr=False, max_length=500)
    llm_deployment: Optional[str] = Field(None, max_length=200)
    llm_api_version: Optional[str] = Field(None, max_length=50)


_parse_body = parse_body_without_echo


def _empty_slot() -> Dict[str, Any]:
    return {"key_hint": "", "status": "unverified", "source": None, "last_verified_at": None, "configured": False}


def _empty_llm() -> Dict[str, Any]:
    return {
        "configured": False, "endpoint": "", "deployment": "", "api_version": DEFAULT_LLM_API_VERSION,
        "key_hint": "", "has_key": False, "status": "unverified", "last_verified_at": None,
    }


def _legacy_view() -> Dict[str, Any]:
    """Shape for organizations with no credentials document: unconfigured, platform keys apply."""
    return {
        "configured": False,
        "tts_engine": None,
        "credential_mode": "platform",
        "allow_org_edit": False,
        "voice_engine": "custom" if custom_pipeline_default_enabled() else "managed",
        "engine": _empty_slot(),
        "tts": _empty_slot(),
        "llm": _empty_llm(),
    }


async def _profile(repo: VoiceCredentialsRepository, service: VoiceCredentialsService, org_id: str) -> Dict[str, Any]:
    if await repo.get_by_org(org_id) is None:
        view = _legacy_view()
    else:
        view = {"configured": True, **await service.get_masked(org_id)}
    view["custom_pipeline_allowed"] = view["voice_engine"] == "custom"
    return view


def _org_safe(view: Dict[str, Any]) -> Dict[str, Any]:
    """Organization admins only learn whether the language model is set up and verified, never any detail."""
    llm = view.pop("llm", None) or _empty_llm()
    view["llm_configured"] = bool(llm["configured"])
    view["llm_verified"] = bool(llm["configured"]) and llm["status"] == "valid"
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


@superadmin_router.post("/{org_id}/llm/verify")
async def verify_llm(
    org_id: str,
    _: Dict[str, Any] = Depends(require_superadmin),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    return {"organization_id": org_id, "configured": True, **await service.verify_llm(org_id)}


@superadmin_router.delete("/{org_id}/llm")
async def delete_llm(
    org_id: str,
    user: Dict[str, Any] = Depends(require_superadmin),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    view = await service.clear_llm(org_id, actor_id=user["id"])
    return {"organization_id": org_id, "configured": True, **view}


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
        if current["llm"]["configured"] and org_id != PLATFORM_ROOT_ORG_ID and await service.platform_llm_slot() is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="This organization already has its own language model settings. Confirm to overwrite them.",
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


# ---------------- Org admin (read only; every write is superadmin-only) ----------------

@org_router.get("")
async def get_own_profile(
    user: Dict[str, Any] = Depends(require_admin),
    repo: VoiceCredentialsRepository = Depends(get_voice_repo),
    service: VoiceCredentialsService = Depends(get_voice_service),
):
    return _org_safe(await _profile(repo, service, user.get("organization_id") or user.get("id")))
