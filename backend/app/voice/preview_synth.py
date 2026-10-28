"""
Voice previews rendered by the same voice engine that speaks on real calls.

Sonic voices on a call are served through the voice engine's own session (billed to its credits). Previews used
to call the Sonic vendor API directly with a separate key, so a preview could sound different from a call or
work while the call did not. Here a preview opens a short engine session whose greeting is the preview text,
collects the audio it streams back, and wraps it as a WAV file.
"""

import asyncio
import io
import logging
import time
import wave
from typing import Optional

from app.providers.deepgram.configuration import (
    DeepgramAgentConfig,
    DeepgramAudioConfig,
    DeepgramAudioInput,
    DeepgramAudioOutput,
    DeepgramListenConfig,
    DeepgramListenProvider,
    DeepgramSettingsConfiguration,
    DeepgramSpeakConfig,
    DeepgramSpeakProvider,
    DeepgramThinkConfig,
    DeepgramThinkProvider,
)
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient

logger = logging.getLogger(__name__)

PREVIEW_SAMPLE_RATE = 24000
IDLE_FINISH_SECONDS = 1.5


class PreviewSynthesisError(Exception):
    """The voice engine could not render the preview."""


def build_preview_settings(text: str, voice_id: str, language: Optional[str], model_id: str = "sonic-3.6",
                           speed: float = 1.0) -> DeepgramSettingsConfiguration:
    """Settings identical in shape to a real call's Sonic speak provider; the greeting is the preview text."""
    speak = DeepgramSpeakProvider(
        type="cartesia",
        model=None,
        version=None,
        model_id=model_id,
        voice={"mode": "id", "id": voice_id},
        language=(language or "en").split("-")[0],
        speed=float(speed or 1.0),
    )
    return DeepgramSettingsConfiguration(
        type="Settings",
        audio=DeepgramAudioConfig(
            input=DeepgramAudioInput(encoding="linear16", sample_rate=PREVIEW_SAMPLE_RATE),
            output=DeepgramAudioOutput(encoding="linear16", sample_rate=PREVIEW_SAMPLE_RATE, container="none"),
        ),
        agent=DeepgramAgentConfig(
            greeting=text,
            listen=DeepgramListenConfig(provider=DeepgramListenProvider(type="deepgram", model="nova-3", language="en")),
            think=DeepgramThinkConfig(
                provider=DeepgramThinkProvider(type="open_ai", model="gpt-4o-mini", temperature=0.0),
                prompt="You are a silent preview. Never reply.",
                functions=[],
            ),
            speak=DeepgramSpeakConfig(provider=speak),
        ),
    )


def pcm_to_wav(pcm: bytes, sample_rate: int = PREVIEW_SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def _synthesize_once(text: str, voice_id: str, language: Optional[str], model_id: str = "sonic-3.6",
                                   speed: float = 1.0, timeout: float = 20.0,
                                   client_factory=DeepgramVoiceAgentClient) -> bytes:
    """Returns WAV bytes of `text` spoken by the Sonic voice through the voice engine."""
    chunks: list = []
    done = asyncio.Event()
    errors: list = []

    last_chunk = [0.0]

    async def on_audio(data: bytes):
        chunks.append(data)
        last_chunk[0] = time.monotonic()

    async def on_done():
        done.set()

    async def on_error(message: str):
        errors.append(message)
        done.set()

    client = client_factory(on_audio=on_audio, on_agent_audio_done=on_done, on_error=on_error)
    settings = build_preview_settings(text, voice_id, language, model_id, speed)
    try:
        await client.connect_and_configure(settings, timeout=10.0)
        deadline = time.monotonic() + timeout
        # Finished when the engine says so, or when audio has flowed and then gone quiet (the done event can be late).
        while not done.is_set() and time.monotonic() < deadline:
            if chunks and time.monotonic() - last_chunk[0] > IDLE_FINISH_SECONDS:
                break
            await asyncio.sleep(0.05)
        if not done.is_set() and not chunks:
            raise PreviewSynthesisError("The voice engine did not finish the preview in time.")
    except PreviewSynthesisError:
        raise
    except Exception as e:
        raise PreviewSynthesisError(str(e))
    finally:
        try:
            await client.close()
        except Exception:
            pass

    pcm = b"".join(chunks)
    if errors and not pcm:
        raise PreviewSynthesisError(errors[0])
    if len(pcm) < PREVIEW_SAMPLE_RATE // 5 * 2:  # under ~0.2s of audio means nothing was really spoken
        raise PreviewSynthesisError("The voice engine returned no audio for the preview.")
    return pcm_to_wav(pcm)


async def synthesize_sonic_preview(text: str, voice_id: str, language: Optional[str], model_id: str = "sonic-3.6",
                                   speed: float = 1.0, timeout: float = 15.0, attempts: int = 2,
                                   client_factory=DeepgramVoiceAgentClient) -> bytes:
    """Retries once: a brand-new engine session occasionally stalls before it starts speaking."""
    last_error: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            return await _synthesize_once(text, voice_id, language, model_id, speed, timeout, client_factory)
        except PreviewSynthesisError as e:
            last_error = e
            logger.warning(f"[PreviewSynth] attempt {attempt + 1}/{attempts} failed: {e}")
    raise last_error  # type: ignore[misc]
