"""Pre-rendered opening greeting audio.

Opening a voice engine session takes a few seconds (connect, settings, then text-to-speech for the greeting), and all
of it used to start only after the customer answered. The greeting text is known before the call is even dialed, so it
is rendered to phone-format audio (8 kHz mu-law, the format Twilio plays) while the phone rings and played the instant
the media stream starts; the voice engine connects in parallel and takes over from the customer's first reply.

Deepgram voices are rendered with its speech API; Sonic voices (served only through the voice engine) with a short
engine session that uses the exact speak settings of the call. Any failure is a cache miss and the call falls back to
the engine speaking the greeting itself, exactly as before.
"""

import asyncio
import copy
import hashlib
import logging
import os
import tempfile
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

MAX_MEMORY_ENTRIES = 256
MAX_TEXT_CHARS = 1900
MIN_AUDIO_BYTES = 1600  # 0.2s of audio: anything shorter is an error body, not speech
DISK_TTL_SECONDS = 7 * 24 * 3600


class GreetingAudioCache:
    def __init__(self) -> None:
        self._memory: "OrderedDict[str, bytes]" = OrderedDict()
        self._inflight: Dict[str, "asyncio.Task[Optional[bytes]]"] = {}
        self._dir = Path(os.getenv("GREETING_CACHE_DIR") or (Path(tempfile.gettempdir()) / "voice_greeting_cache"))
        self._pruned = False

    # ── keys ────────────────────────────────────────────────────────────────
    @staticmethod
    def renderable(provider: Any) -> bool:
        """True when this voice can be rendered here: a Deepgram voice at normal speed, or a Sonic voice."""
        if provider is None:
            return False
        ptype = getattr(provider, "type", "deepgram")
        if ptype == "cartesia":
            voice = getattr(provider, "voice", None)
            return bool(getattr(provider, "model_id", None) and isinstance(voice, dict) and voice.get("id"))
        if ptype != "deepgram" or not getattr(provider, "model", None):
            return False
        speed = getattr(provider, "speed", None)
        return speed is None or abs(float(speed) - 1.0) < 1e-6

    @staticmethod
    def key(text: str, provider: Any) -> str:
        voice = getattr(provider, "voice", None)
        voice_id = voice.get("id", "") if isinstance(voice, dict) else ""
        raw = "|".join(str(x) for x in (
            getattr(provider, "type", ""), getattr(provider, "version", ""), getattr(provider, "model", ""),
            getattr(provider, "model_id", ""), voice_id, getattr(provider, "language", ""),
            getattr(provider, "speed", ""), text.strip(),
        ))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    # ── lookup ──────────────────────────────────────────────────────────────
    def get(self, text: str, provider: Any) -> Optional[bytes]:
        """Instant lookup (memory, then disk). Never touches the network."""
        if not text or not text.strip() or not self.renderable(provider):
            return None
        key = self.key(text, provider)
        audio = self._memory.get(key)
        if audio is not None:
            self._memory.move_to_end(key)
            return audio
        path = self._dir / f"{key}.ulaw"
        try:
            if path.exists() and time.time() - path.stat().st_mtime < DISK_TTL_SECONDS:
                audio = path.read_bytes()
                if len(audio) >= MIN_AUDIO_BYTES:
                    self._remember(key, audio)
                    return audio
        except OSError as e:
            logger.debug(f"[GreetingCache] disk read notice: {e}")
        return None

    def _remember(self, key: str, audio: bytes) -> None:
        self._memory[key] = audio
        self._memory.move_to_end(key)
        while len(self._memory) > MAX_MEMORY_ENTRIES:
            self._memory.popitem(last=False)

    def _persist(self, key: str, audio: bytes) -> None:
        try:
            self._dir.mkdir(parents=True, exist_ok=True)
            tmp = self._dir / f"{key}.tmp"
            tmp.write_bytes(audio)
            tmp.replace(self._dir / f"{key}.ulaw")
            if not self._pruned:
                self._pruned = True
                cutoff = time.time() - DISK_TTL_SECONDS
                for old in self._dir.glob("*.ulaw"):
                    if old.stat().st_mtime < cutoff:
                        old.unlink(missing_ok=True)
        except OSError as e:
            logger.debug(f"[GreetingCache] disk write notice: {e}")

    # ── rendering ───────────────────────────────────────────────────────────
    async def ensure(self, text: str, provider: Any) -> Optional[bytes]:
        """Returns the audio, rendering it first when it is not cached. One render per greeting at a time."""
        cached = self.get(text, provider)
        if cached is not None:
            return cached
        if not text or not text.strip() or len(text) > MAX_TEXT_CHARS or not self.renderable(provider):
            return None
        key = self.key(text, provider)
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._render(key, text.strip(), provider))
            self._inflight[key] = task
            task.add_done_callback(lambda _t, k=key: self._inflight.pop(k, None))
        try:
            return await asyncio.shield(task)
        except Exception:
            return None

    async def _render(self, key: str, text: str, provider: Any) -> Optional[bytes]:
        started = time.perf_counter()
        if getattr(provider, "type", "deepgram") == "cartesia":
            from app.voice.preview_synth import synthesize_phone_audio
            try:
                audio = await synthesize_phone_audio(text, provider)
            except Exception as e:
                logger.warning(f"[GreetingCache] render failed: {e}")
                return None
            self._remember(key, audio)
            await asyncio.to_thread(self._persist, key, audio)
            logger.info(f"[GreetingCache] rendered {len(audio) / 8000.0:.1f}s greeting in {(time.perf_counter() - started) * 1000:.0f}ms")
            return audio
        api_key = (os.getenv("DEEPGRAM_API_KEY") or "").strip()
        if not api_key:
            return None
        model = provider.model
        version = getattr(provider, "version", None)
        path = "v2/speak" if (version == "v2" or "flux" in model.lower()) else "v1/speak"
        url = f"https://api.deepgram.com/{path}?model={model}&encoding=mulaw&sample_rate=8000&container=none"
        # IPv4 only: an unreachable IPv6 route otherwise stalls every connection attempt for its full timeout.
        transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=1)
        try:
            async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(20.0, connect=5.0)) as client:
                resp = await client.post(url, json={"text": text}, headers={"Authorization": f"Token {api_key}"})
            if resp.status_code != 200 or len(resp.content) < MIN_AUDIO_BYTES:
                logger.warning(f"[GreetingCache] render failed (HTTP {resp.status_code}, {len(resp.content)} bytes)")
                return None
        except Exception as e:
            logger.warning(f"[GreetingCache] render failed: {e}")
            return None
        audio = resp.content
        self._remember(key, audio)
        await asyncio.to_thread(self._persist, key, audio)
        logger.info(f"[GreetingCache] rendered {len(audio) / 8000.0:.1f}s greeting in {(time.perf_counter() - started) * 1000:.0f}ms")
        return audio

    # ── dial-time warm-up ───────────────────────────────────────────────────
    def prewarm(self, agent_config: Any, prospect_name: str = "", direction: str = "outbound") -> None:
        """Fire and forget: render the greeting this call will use while the phone is still ringing."""
        if agent_config is None or not (getattr(agent_config, "greeting", "") or "").strip():
            return

        async def _run() -> None:
            try:
                text, provider = resolve_greeting(agent_config, prospect_name, direction)
                if text and self.renderable(provider):
                    await self.ensure(text, provider)
            except Exception as e:
                logger.debug(f"[GreetingCache] prewarm notice: {e}")

        try:
            asyncio.get_running_loop().create_task(_run())
        except RuntimeError:
            pass


def resolve_greeting(agent_config: Any, prospect_name: str = "", direction: str = "outbound"):
    """The exact greeting text and voice the gateway will use for this call (same builder, same pronunciation rules)."""
    from app.agents.runtime import AgentRuntimeBuilder
    from app.voice.pronunciation_normalizer import PronunciationNormalizer

    cfg = copy.copy(agent_config)
    cfg._call_direction = direction
    cfg._prospect_data = {"name": prospect_name or ""} if prospect_name else {}
    settings = AgentRuntimeBuilder.build_deepgram_settings(cfg)
    raw = settings.agent.greeting or cfg.greeting
    text = PronunciationNormalizer.normalize(raw, getattr(cfg, "pronunciation_rules", None)) if raw else None
    return text, settings.agent.speak.provider


greeting_audio_cache = GreetingAudioCache()
