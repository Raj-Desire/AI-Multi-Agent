from typing import Any, Dict, Optional

from app.models.voice_credentials import ResolvedVoiceProfile
from app.providers.deepgram.configuration import (
    DeepgramSpeakConfig,
    DeepgramSpeakEndpoint,
    DeepgramSpeakProvider,
)

DEFAULT_AURA_VOICE = "flux-hannah-en"
DEFAULT_CARTESIA_VOICE = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"
CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes"
CARTESIA_API_VERSION = "2024-06-10"


def is_cartesia_voice(provider: Optional[str], voice_id: Optional[str]) -> bool:
    """True for an explicit cartesia/sonic provider or a UUID-looking voice id that is not an Aura/Flux id."""
    voice_id = voice_id or ""
    return (provider or "").lower() in ["cartesia", "sonic"] or (
        "-" in voice_id
        and len(voice_id) == 36
        and not voice_id.startswith("flux-")
        and not voice_id.startswith("aura-")
    )


def redact_settings_for_log(payload: Dict[str, Any]) -> Dict[str, Any]:
    """A copy of a settings payload that is safe to log: endpoint header values are masked."""
    import copy

    safe = copy.deepcopy(payload)

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            headers = node.get("headers")
            if isinstance(headers, dict):
                node["headers"] = {k: "***" for k in headers}
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for v in node:
                _walk(v)

    _walk(safe)
    return safe


def own_cartesia_endpoint(tts_key: str) -> DeepgramSpeakEndpoint:
    return DeepgramSpeakEndpoint(
        url=CARTESIA_TTS_URL,
        headers={"x-api-key": tts_key, "Cartesia-Version": CARTESIA_API_VERSION},
    )


def build_speak_provider(
    profile: Optional[ResolvedVoiceProfile],
    voice: Any,
    *,
    language: Optional[str],
) -> DeepgramSpeakConfig:
    """Speak config for the agent's voice. Own-key orgs are held to their engine and use their own Cartesia key."""
    voice_model = voice.voice or DEFAULT_AURA_VOICE
    raw_provider = getattr(voice, "provider", "deepgram") or "deepgram"
    is_cartesia = is_cartesia_voice(raw_provider, voice_model)
    own = profile is not None and profile.source == "own"

    if own:
        wants_cartesia = profile.tts_engine == "cartesia"
        if wants_cartesia != is_cartesia:
            voice_model = DEFAULT_CARTESIA_VOICE if wants_cartesia else DEFAULT_AURA_VOICE
            is_cartesia = wants_cartesia
            voice = None  # saved model/version/speed belong to the other engine

    def _attr(name: str, default: Any = None) -> Any:
        return getattr(voice, name, default) if voice is not None else default

    if is_cartesia:
        sonic_model_id = _attr("model", None)
        if not sonic_model_id or sonic_model_id in ["flux", "aura", "deepgram", "v1", "v2"] or sonic_model_id.startswith("sonic-3.5"):
            # Agents saved with the older Sonic 3.5 model move to 3.6 without needing a re-save.
            sonic_model_id = "sonic-3.6"
        byo = own and profile.tts_engine == "cartesia" and bool(profile.tts_key)
        speak_provider = DeepgramSpeakProvider(
            type="cartesia",
            model=None,
            version=None,
            model_id=sonic_model_id,
            voice={"mode": "id", "id": voice_model},
            language=language,
            # Speed is documented for the managed variant only.
            speed=None if byo else float(_attr("speed", 1.0) or 1.0),
        )
        endpoint = None
        if byo:
            endpoint = own_cartesia_endpoint(profile.tts_key)
        return DeepgramSpeakConfig(provider=speak_provider, endpoint=endpoint)

    voice_version = _attr("version", "v2") or ("v2" if "flux" in voice_model else "v1")
    # Aura v1 models do NOT support the 'speed' parameter and return HTTP 400 'Requested model does not support the speed parameter'
    supports_speed = voice_version == "v2" or "flux" in voice_model
    configured_speed = float(_attr("speed", 1.0) or 1.0)
    return DeepgramSpeakConfig(
        provider=DeepgramSpeakProvider(
            type="deepgram",
            version=voice_version,
            model=voice_model,
            speed=configured_speed if supports_speed else None,
        )
    )
