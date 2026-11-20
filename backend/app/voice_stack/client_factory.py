from typing import Any, Optional

from app.models.voice_credentials import ResolvedVoiceProfile, VoiceCredentialsMissing
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.voice_stack.resolver import resolve_voice_profile

_NOT_CONFIGURED = "Voice engine is not configured for this organization"


async def build_voice_client(
    org_id: Optional[str],
    *,
    profile: Optional[ResolvedVoiceProfile] = None,
    **callbacks: Any,
) -> DeepgramVoiceAgentClient:
    """Builds a voice engine client with the organization's own resolved key.

    Raises VoiceCredentialsMissing (neutral message) when no usable key exists, instead of connecting with an empty key.
    """
    profile = profile or await resolve_voice_profile(org_id)
    if not profile.engine_key:
        raise VoiceCredentialsMissing(_NOT_CONFIGURED)
    return DeepgramVoiceAgentClient(api_key=profile.engine_key, **callbacks)
