"""
Mid-call language following.

Tracks which language the caller is speaking and decides when the agent should switch. A switch needs
either a clear non-Latin script, or two consecutive turns in the same new language, so one borrowed
word ("okay", "namaste") never flips the call.
"""

import re
from typing import Iterable, Optional

from app.services.llm_generator_service import LANG_NAMES

# Unicode block -> language. Shared scripts (Arabic, Cyrillic) are left to the LLM verdict instead.
_SCRIPTS = [
    (r"[઀-૿]", "gu"),
    (r"[ऀ-ॿ]", "hi"),
    (r"[ঀ-৿]", "bn"),
    (r"[਀-੿]", "pa"),
    (r"[஀-௿]", "ta"),
    (r"[ఀ-౿]", "te"),
    (r"[฀-๿]", "th"),
    (r"[가-힯]", "ko"),
    (r"[぀-ヿ]", "ja"),
    (r"[一-鿿]", "zh"),
]


def script_language(text: str) -> Optional[str]:
    for pattern, code in _SCRIPTS:
        if re.search(pattern, text or ""):
            return code
    return None


# Fallback when no LLM verdict is available: common function words per Latin-script language.
_STOPWORDS = {
    "en": "the is are you your what how can i me my we this that with for and not have yes no hello please thank thanks okay want need".split(),
    "hi": "hai hain nahi nahin kya aap mujhe mera hum ho kaise kripya haan ji bolo acha accha theek abhi lekin toh to".split(),
    "es": "el la los las que de en un una es por con para hola gracias quiero necesito usted como esta".split(),
    "fr": "le la les des est une un que pour avec bonjour merci je vous nous suis pas ce qui".split(),
    "de": "der die das und ist nicht ich sie wir mit für ein eine hallo danke bitte ja nein".split(),
    "pt": "o a os as que de em um uma é por com para olá obrigado quero preciso você não".split(),
    "it": "il lo la gli che di un una è per con ciao grazie voglio ho sono non".split(),
}


def guess_latin_language(text: str) -> Optional[str]:
    """Best-effort guess for Latin-script text; None if inconclusive."""
    words = re.findall(r"[a-zà-ÿ']+", (text or "").lower())
    if len(words) < 2:
        return None
    scores = {code: sum(w in vocab for w in words) for code, vocab in ((c, set(v)) for c, v in _STOPWORDS.items())}
    best = max(scores, key=scores.get)
    ranked = sorted(scores.values(), reverse=True)
    if scores[best] >= 2 and scores[best] > ranked[1]:
        return best
    return None


# Languages each voice family can actually speak (mirrors the voice picker in the agent creator).
SONIC_LANGUAGES = frozenset(
    "en hi es fr de it pt ja zh ko ar nl he sv pl tr id th ru vi tl ta te bn gu pa ur el da fi no cs hu ro uk".split()
)
AURA2_LANGUAGES = frozenset("en es fr de it ja".split())


def is_sonic_voice(voice_cfg) -> bool:
    voice_id = (getattr(voice_cfg, "voice", "") or "")
    provider = (getattr(voice_cfg, "provider", "") or "").lower()
    return provider in ("cartesia", "sonic") or (
        len(voice_id) == 36 and "-" in voice_id and not voice_id.startswith(("flux-", "aura-"))
    )


def voice_languages(voice_cfg) -> frozenset:
    """Languages the configured voice can speak. Replies in any other language would be mispronounced."""
    if voice_cfg is None:
        return frozenset({"en"})
    if is_sonic_voice(voice_cfg):
        return SONIC_LANGUAGES
    voice_id = (getattr(voice_cfg, "voice", "") or "")
    if voice_id.startswith("aura-2"):
        return AURA2_LANGUAGES
    return frozenset({normalize_code(getattr(voice_cfg, "language", None) or "en")})


def normalize_code(code: Optional[str]) -> str:
    return (code or "en").split("-")[0].split("_")[0].strip().lower() or "en"


def language_name(code: str) -> str:
    return "English" if code == "en" else LANG_NAMES.get(code, code)


def build_directive(code: str) -> str:
    name = language_name(code)
    return (
        f"LATEST LANGUAGE OVERRIDE (supersedes any earlier language instruction): the caller is now speaking "
        f"{name}. From your next reply onward, speak ONLY in {name}, written in its native script, with "
        f"natural phone-call phrasing. Keep the same persona, goals and facts. If the caller switches "
        f"language again, follow the newest language."
    )


class LanguageTracker:
    def __init__(self, primary: str, allowed: Optional[Iterable[str]] = None):
        self.current = normalize_code(primary)
        self.allowed = {normalize_code(c) for c in allowed} if allowed else None
        if self.allowed is not None:
            self.allowed.add(self.current)
        self._candidate: Optional[str] = None
        self._candidate_count = 0

    def observe(self, code: Optional[str], text: str, confident: bool = False) -> Optional[str]:
        """Feed the language of the latest caller turn. Returns the new language if we should switch.

        confident=True is for a model verdict on a full sentence: it switches at once instead of waiting for
        a second turn. Short fragments always need the confirmation turn.
        """
        # Chinese/Japanese have no spaces, so count characters too.
        if not code or (len(text.split()) < 2 and len(text.strip()) < 4):
            return None
        code = normalize_code(code)
        if self.allowed is not None and code not in self.allowed:
            return None
        if code == self.current:
            self._candidate, self._candidate_count = None, 0
            return None

        by_script = script_language(text) == code
        if code == self._candidate:
            self._candidate_count += 1
        else:
            self._candidate, self._candidate_count = code, 1

        if by_script or self._candidate_count >= 2 or (confident and len(text.split()) >= 2):
            self.current = code
            self._candidate, self._candidate_count = None, 0
            return code
        return None
