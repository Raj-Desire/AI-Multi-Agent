import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable, Dict, List, Literal, Optional

from app.core.security import decrypt_token, encrypt_token
from app.models.voice_credentials import KeySlot, VoiceCredentials
from app.providers.cartesia.client import validate_key as validate_tts_key
from app.providers.deepgram.client_check import validate_engine_key
from app.repositories.activity_log_repository import ActivityLogRepository
from app.repositories.voice_credentials_repository import VoiceCredentialsRepository
from app.voice_stack.resolver import custom_pipeline_default_enabled, platform_keys

logger = logging.getLogger(__name__)

AuditHook = Callable[..., Awaitable[None]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _default_audit(action: str, organization_id: str, actor_id: str, fields: List[str]) -> None:
    await ActivityLogRepository.record(
        f"{action}: {', '.join(fields)}",
        {"id": actor_id, "organization_id": organization_id},
        "service",
    )


def _slot_view(slot: KeySlot) -> Dict:
    return {
        "key_hint": slot.key_hint,
        "status": slot.status,
        "source": slot.source,
        "last_verified_at": slot.last_verified_at.isoformat() if slot.last_verified_at else None,
        "configured": bool(slot.encrypted_api_key),
    }


def _view(creds: VoiceCredentials) -> Dict:
    return {
        "tts_engine": creds.tts_engine,
        "credential_mode": creds.credential_mode,
        "allow_org_edit": creds.allow_org_edit,
        "voice_engine": creds.voice_engine,
        "engine": _slot_view(creds.engine),
        "tts": _slot_view(creds.tts),
    }


def _apply_validation(slot: KeySlot, result: Optional[bool]) -> None:
    # None means the vendor result is unknown (outage, throttle): never mark a key invalid for that.
    if result is True:
        slot.status, slot.last_verified_at = "valid", _now()
    elif result is False:
        slot.status, slot.last_verified_at = "invalid", _now()
    # None: leave status and last_verified_at untouched. A new key is already reset by _set_key.


def _set_key(slot: KeySlot, key: str, source: Literal["own", "imported"]) -> None:
    slot.encrypted_api_key = encrypt_token(key)
    slot.key_hint = "…" + key[-4:]
    slot.source = source
    slot.imported_at = _now() if source == "imported" else None
    slot.status = "unverified"
    slot.last_verified_at = None


class VoiceCredentialsService:
    def __init__(
        self,
        repo: Optional[VoiceCredentialsRepository] = None,
        audit: Optional[AuditHook] = None,
    ):
        self._repo = repo or VoiceCredentialsRepository()
        self._audit = audit or _default_audit

    async def _record(self, action: str, org_id: str, actor_id: str, fields: List[str]) -> None:
        try:
            await self._audit(action, org_id, actor_id, fields)
        except Exception as exc:
            logger.warning("voice credentials audit failed: %s", type(exc).__name__)

    async def _load(self, org_id: str) -> VoiceCredentials:
        existing = await self._repo.get_by_org(org_id)
        if existing is not None:
            return existing
        # A new document must not change the effective Economy flag the organization already had.
        return VoiceCredentials(
            organization_id=org_id, voice_engine="custom" if custom_pipeline_default_enabled() else "managed"
        )

    @staticmethod
    async def _validate_slots(creds: VoiceCredentials, engine: bool, tts: bool) -> None:
        if engine and creds.engine.encrypted_api_key:
            result = await validate_engine_key(decrypt_token(creds.engine.encrypted_api_key))
            _apply_validation(creds.engine, result)
        if tts and creds.tts.encrypted_api_key:
            result = await validate_tts_key(decrypt_token(creds.tts.encrypted_api_key))
            _apply_validation(creds.tts, result)

    @staticmethod
    def view_of(creds: VoiceCredentials) -> Dict:
        return _view(creds)

    async def get_masked(self, org_id: str) -> Dict:
        return _view(await self._load(org_id))

    async def save(
        self,
        org_id: str,
        *,
        actor_id: str,
        tts_engine: Optional[str] = None,
        credential_mode: Optional[str] = None,
        engine_key: Optional[str] = None,
        tts_key: Optional[str] = None,
        allow_org_edit: Optional[bool] = None,
        voice_engine: Optional[Literal["managed", "custom"]] = None,
    ) -> Dict:
        creds = await self._load(org_id)
        changed: List[str] = []
        if voice_engine is not None:
            creds.voice_engine = voice_engine
            creds.custom_pipeline_enabled = voice_engine == "custom"
            changed.append("voice_engine")
        if tts_engine is not None:
            creds.tts_engine = tts_engine  # type: ignore[assignment]
            changed.append("tts_engine")
        if credential_mode is not None:
            creds.credential_mode = credential_mode  # type: ignore[assignment]
            changed.append("credential_mode")
        if allow_org_edit is not None:
            creds.allow_org_edit = allow_org_edit
            changed.append("allow_org_edit")
        engine_key = (engine_key or "").strip() or None
        tts_key = (tts_key or "").strip() or None
        if engine_key:
            _set_key(creds.engine, engine_key, "own")
            changed.append("engine_key")
        if tts_key:
            _set_key(creds.tts, tts_key, "own")
            changed.append("tts_key")
        await self._validate_slots(creds, bool(engine_key), bool(tts_key))
        creds.updated_by = actor_id
        creds.updated_at = _now()
        await self._repo.save(creds)
        if changed:
            await self._record("voice_credentials_updated", org_id, actor_id, changed)
        return _view(creds)

    async def import_platform(self, org_id: str, *, actor_id: str) -> Dict:
        creds = await self._load(org_id)
        engine_key, tts_key = platform_keys()
        imported: List[str] = []
        if engine_key:
            _set_key(creds.engine, engine_key, "imported")
            imported.append("engine_key")
        if tts_key:
            _set_key(creds.tts, tts_key, "imported")
            imported.append("tts_key")
        await self._validate_slots(creds, bool(engine_key), bool(tts_key))
        creds.updated_by = actor_id
        creds.updated_at = _now()
        await self._repo.save(creds)
        if imported:
            await self._record("voice_credentials_imported", org_id, actor_id, imported)
        return _view(creds)

    async def clear(self, org_id: str, slot: Literal["engine", "tts"], *, actor_id: str) -> Dict:
        creds = await self._load(org_id)
        setattr(creds, slot, KeySlot())
        creds.updated_by = actor_id
        creds.updated_at = _now()
        await self._repo.save(creds)
        await self._record("voice_credentials_cleared", org_id, actor_id, [f"{slot}_key"])
        return _view(creds)

    async def verify(self, org_id: str) -> Dict:
        creds = await self._load(org_id)
        await self._validate_slots(creds, True, True)
        await self._repo.save(creds)
        return _view(creds)
