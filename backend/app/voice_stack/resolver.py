import os
from typing import Optional

from app.core.security import decrypt_token
from app.models.voice_credentials import (
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


class VoiceCredentialResolver:
    def __init__(self, repository: Optional[VoiceCredentialsRepository] = None):
        self._repo = repository or VoiceCredentialsRepository()

    @staticmethod
    def _platform_profile(tts_engine: str = "aura") -> ResolvedVoiceProfile:
        return ResolvedVoiceProfile(
            tts_engine=tts_engine,
            engine_key=(os.getenv("DEEPGRAM_API_KEY") or "").strip(),
            tts_key=(os.getenv("CARTESIA_API_KEY") or "").strip() or None,
            source="platform",
            billed_to="platform",
        )

    async def resolve(self, org_id: Optional[str], *, require_tts: bool = True) -> ResolvedVoiceProfile:
        if not org_id:
            return self._platform_profile()
        # Repository errors propagate; they must never degrade to the platform keys.
        creds: Optional[VoiceCredentials] = await self._repo.get_by_org(org_id)
        if creds is None:
            return self._platform_profile()
        if creds.credential_mode == "platform":
            return self._platform_profile(creds.tts_engine)

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
        )


async def resolve_voice_profile(org_id: Optional[str], *, require_tts: bool = True) -> ResolvedVoiceProfile:
    return await VoiceCredentialResolver().resolve(org_id, require_tts=require_tts)
