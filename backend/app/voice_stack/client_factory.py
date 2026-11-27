import logging
import sys
from typing import Any, Optional

from app.models.voice_credentials import ResolvedVoiceProfile, VoiceCredentialsMissing
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.voice_stack.protocol import VoiceClientProtocol
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

    engine="custom" returns the Economy client only when the organization is allowed and the organization's own language model
    settings exist (never the platform environment); otherwise it falls back to the Standard client.
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
            and profile.llm_endpoint
            and profile.llm_api_key
            and profile.llm_deployment
        ):
            from app.providers.pipeline.client import PipelineVoiceClient

            return PipelineVoiceClient(profile=profile, **callbacks)
        else:
            logger.warning("Economy engine unavailable for this call; using Standard engine")
    return DeepgramVoiceAgentClient(api_key=profile.engine_key, **callbacks)


def select_voice_engine(profile: ResolvedVoiceProfile, agent_config: Any) -> str:
    """The organization's voice plan decides: "custom" (Economy) only when the plan is Economy and the agent's
    voice is Cartesia; otherwise "managed" (Standard). The agent's own voice_engine field is not consulted."""
    if getattr(profile, "voice_engine", "managed") != "custom":
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


def backchannel_allowed(client: Any) -> bool:
    """Listening cues while the caller talks: Standard only. On Economy a queued cue would talk over the caller."""
    return engine_of(client) != "custom"
