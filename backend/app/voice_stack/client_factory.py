import logging
import os
import sys
from typing import Any, Optional

from app.models.voice_credentials import ResolvedVoiceProfile, VoiceCredentialsMissing
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.voice_stack.protocol import VoiceClientProtocol
from app.voice_stack.llm_env import resolve_llm_key
from app.voice_stack.registry import is_cartesia_voice
from app.voice_stack.resolver import resolve_voice_profile

logger = logging.getLogger(__name__)

_NOT_CONFIGURED = "Voice engine is not configured for this organization"


def _python_supports_economy() -> bool:
    """The Economy engine needs Python 3.11 or newer; checked at call time."""
    return tuple(sys.version_info[:2]) >= (3, 11)


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
        if not _python_supports_economy():
            logger.warning("Economy engine needs Python 3.11 or newer; using Standard engine")
        elif (
            profile.custom_pipeline_allowed
            and os.getenv("AZURE_OPENAI_ENDPOINT")
            and resolve_llm_key()
        ):
            from app.providers.pipeline.client import PipelineVoiceClient

            return PipelineVoiceClient(profile=profile, **callbacks)
        else:
            logger.warning("Economy engine unavailable for this call; using Standard engine")
    return DeepgramVoiceAgentClient(api_key=profile.engine_key, **callbacks)


def select_voice_engine(agent_config: Any) -> str:
    """"custom" only when the agent asks for the Economy engine and its voice is Cartesia; otherwise "managed"."""
    if getattr(agent_config, "voice_engine", "managed") != "custom":
        return "managed"
    voice = getattr(agent_config, "voice", None)
    if voice is None:
        return "managed"
    provider = getattr(voice, "provider", None)
    voice_id = getattr(voice, "voice", None)
    return "custom" if is_cartesia_voice(provider, voice_id) else "managed"


def engine_of(client: Any) -> str:
    """The engine that actually runs for this client ("custom" for Economy, else "managed").

    Reads the marker the Economy client sets, so Standard calls never import the Economy package."""
    return "custom" if getattr(client, "VOICE_ENGINE", "managed") == "custom" else "managed"


def filler_behavior(client: Any) -> str:
    """Thinking fillers must speak while the model thinks: Economy queues wait for the whole turn, so it uses "default"."""
    return "default" if engine_of(client) == "custom" else "queue"
