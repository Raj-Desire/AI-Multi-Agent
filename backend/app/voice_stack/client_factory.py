import logging
import os
from typing import Any, Optional

from app.models.voice_credentials import ResolvedVoiceProfile, VoiceCredentialsMissing
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.voice_stack.protocol import VoiceClientProtocol
from app.voice_stack.resolver import resolve_voice_profile

logger = logging.getLogger(__name__)

_NOT_CONFIGURED = "Voice engine is not configured for this organization"


async def build_voice_client(
    org_id: Optional[str],
    *,
    profile: Optional[ResolvedVoiceProfile] = None,
    engine: str = "managed",
    **callbacks: Any,
) -> VoiceClientProtocol:
    """Builds a voice engine client with the organization's own resolved key.

    engine="custom" returns the Economy client only when the organization is allowed and the language model
    settings exist; otherwise it falls back to the Standard client.
    Raises VoiceCredentialsMissing (neutral message) when no usable key exists, instead of connecting with an empty key.
    """
    profile = profile or await resolve_voice_profile(org_id)
    if not profile.engine_key:
        raise VoiceCredentialsMissing(_NOT_CONFIGURED)
    if engine == "custom":
        if (
            profile.custom_pipeline_allowed
            and os.getenv("AZURE_OPENAI_ENDPOINT")
            and os.getenv("AZURE_OPENAI_API_KEY")
        ):
            from app.providers.pipeline.client import PipelineVoiceClient

            return PipelineVoiceClient(profile=profile, **callbacks)
        logger.warning("Economy engine unavailable for this call; using Standard engine")
    return DeepgramVoiceAgentClient(api_key=profile.engine_key, **callbacks)
