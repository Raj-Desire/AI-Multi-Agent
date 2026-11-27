import os
from typing import Optional, Tuple

from app.core.security import decrypt_token
from app.models.voice_credentials import (
    DEFAULT_LLM_API_VERSION,
    KeySlot,
    ResolvedVoiceProfile,
    VoiceCredentials,
    VoiceCredentialsMissing,
)
from app.repositories.voice_credentials_repository import VoiceCredentialsRepository

_NOT_CONFIGURED = "Voice engine is not configured for this organization"


def _slot_key(slot: KeySlot) -> str:
    if slot.status != "valid" or not slot.encrypted_api_key:
        return ""
    return (decrypt_token(slot.encrypted_api_key) or "").strip()


def _llm_fields(creds: VoiceCredentials) -> dict:
    """The organization's own language model settings, or nothing unless all three required values are stored."""
    slot = creds.llm
    if not slot.configured:
        return {}
    try:
        key = (decrypt_token(slot.encrypted_api_key) or "").strip()
    except ValueError:
        return {}
    if not key:
        return {}
    return {
        "llm_endpoint": slot.endpoint,
        "llm_api_key": key,
        "llm_deployment": slot.deployment,
        "llm_api_version": slot.api_version or DEFAULT_LLM_API_VERSION,
    }


def platform_keys() -> Tuple[str, str]:
    """Platform-level (engine, tts) keys from the environment."""
    return (
        (os.getenv("DEEPGRAM_API_KEY") or "").strip(),
        (os.getenv("CARTESIA_API_KEY") or "").strip(),
    )


def custom_pipeline_default_enabled() -> bool:
    """Platform default for organizations without a credentials document, read at call time."""
    return (os.getenv("CUSTOM_PIPELINE_DEFAULT_ENABLED") or "").strip().lower() in ("1", "true", "yes", "on")


class VoiceCredentialResolver:
    def __init__(self, repository: Optional[VoiceCredentialsRepository] = None):
        self._repo = repository or VoiceCredentialsRepository()

    @staticmethod
    def _platform_profile(
        tts_engine: str = "aura", custom_allowed: Optional[bool] = None, llm: Optional[dict] = None
    ) -> ResolvedVoiceProfile:
        custom = custom_pipeline_default_enabled() if custom_allowed is None else custom_allowed
        return ResolvedVoiceProfile(
            tts_engine=tts_engine,
            engine_key=(os.getenv("DEEPGRAM_API_KEY") or "").strip(),
            tts_key=(os.getenv("CARTESIA_API_KEY") or "").strip() or None,
            source="platform",
            billed_to="platform",
            custom_pipeline_allowed=custom,
            voice_engine="custom" if custom else "managed",
            **(llm or {}),
        )

    async def resolve(self, org_id: Optional[str], *, require_tts: bool = True) -> ResolvedVoiceProfile:
        if not org_id:
            return self._platform_profile()
        # Repository errors propagate; they must never degrade to the platform keys.
        creds: Optional[VoiceCredentials] = await self._repo.get_by_org(org_id)
        if creds is None:
            return self._platform_profile()
        if creds.credential_mode == "platform":
            return self._platform_profile(creds.tts_engine, creds.voice_engine == "custom", _llm_fields(creds))

        engine_key = _slot_key(creds.engine)
        if not engine_key:
            raise VoiceCredentialsMissing(_NOT_CONFIGURED)
        tts_key = _slot_key(creds.tts) or None
        if creds.tts_engine == "cartesia" and require_tts and not tts_key:
            raise VoiceCredentialsMissing(_NOT_CONFIGURED)
        return ResolvedVoiceProfile(
            tts_engine=creds.tts_engine,
            engine_key=engine_key,
            tts_key=tts_key,
            source="own",
            billed_to="org_own_key",
            custom_pipeline_allowed=creds.voice_engine == "custom",
            voice_engine=creds.voice_engine,
            **_llm_fields(creds),
        )


async def resolve_voice_profile(org_id: Optional[str], *, require_tts: bool = True) -> ResolvedVoiceProfile:
    return await VoiceCredentialResolver().resolve(org_id, require_tts=require_tts)
