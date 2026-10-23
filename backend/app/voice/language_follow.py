"""
Follows the caller's language during a live call (real phone calls and the browser live preview share this).

Each caller turn is classified instantly from its own words (no network call). When the language really
changes, the agent is told: through the per-call language proxy when one is attached (applied to the very next
reply), otherwise with a prompt update. A voice-language update is sent only in the optional "track" mode.
"""

import logging
from typing import Any, Callable, Optional

from app.voice.language_support import resolve_multilingual
from app.voice.language_switcher import (
    LanguageTracker,
    build_directive,
    detect_language,
    normalize_code,
    sonic_language_mode,
)

logger = logging.getLogger("language_follow")


class LanguageFollower:
    def __init__(
        self,
        get_config: Callable[[], Any],
        get_client: Callable[[], Any],
        get_settings: Callable[[], Any],
        get_proxy_token: Callable[[], Optional[str]],
        on_language: Optional[Callable[[str], None]] = None,
    ):
        self._get_config = get_config
        self._get_client = get_client
        self._get_settings = get_settings
        self._get_proxy_token = get_proxy_token
        self._on_language = on_language
        self._tracker: Optional[LanguageTracker] = None

    @property
    def tracker(self) -> LanguageTracker:
        """Built lazily from the languages the client selected that the voice and recognizer both support."""
        if self._tracker is None:
            plan = resolve_multilingual(self._get_config())
            self._tracker = LanguageTracker(plan.primary, plan.languages)
        return self._tracker

    def reset(self) -> None:
        """Forget the language state (a new preview session starts again in the opening language)."""
        self._tracker = None

    @property
    def enabled(self) -> bool:
        return resolve_multilingual(self._get_config()).enabled

    def stt_language(self) -> str:
        listen = getattr(getattr(getattr(self._get_settings(), "agent", None), "listen", None), "provider", None)
        return normalize_code(getattr(listen, "language", None))

    async def on_user_turn(self, text: str) -> None:
        """Instant path: classify this caller turn from its own words and switch when it clearly changed."""
        if not self.enabled:
            return
        code = detect_language(text)
        # A single recognizer-language script is no evidence on its own: foreign speech is written in it too.
        if code and code != self.tracker.current and code != self.stt_language():
            await self.follow(code, text, confident=True)

    async def follow(self, code: Optional[str], text: str, confident: bool = False) -> Optional[str]:
        client = self._get_client()
        if not client or not self.enabled:
            return None
        new_lang = self.tracker.observe(code, text, confident=confident)
        if not new_lang:
            return None
        if self._on_language:
            self._on_language(new_lang)
        logger.info(f"[LanguageFollow] Caller language changed -> '{new_lang}'.")

        token = self._get_proxy_token()
        if token:
            # The proxy classifies each turn itself and applies the language to that very reply; just record it.
            from app.api.v1.think_proxy import get_call_state
            state = get_call_state(token)
            if state:
                state.language_current = new_lang
            return new_lang

        settings = self._get_settings()
        agent = getattr(settings, "agent", None)
        base_prompt = getattr(getattr(agent, "think", None), "prompt", "") or getattr(self._get_config(), "system_prompt", "") or ""
        directive = build_directive(new_lang)
        await client.update_prompt_and_wait_ack(f"{base_prompt}\n\n{directive}" if base_prompt else directive, timeout=1.5)

        speak = getattr(agent, "speak", None)
        if speak and speak.provider.type == "cartesia" and sonic_language_mode() == "track":
            provider = speak.provider.model_dump(exclude_none=True)
            provider["language"] = new_lang
            await client.update_speak(provider)
        return new_lang
