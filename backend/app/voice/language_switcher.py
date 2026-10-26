"""
Mid-call language following.

Tracks which language the caller is speaking and decides when the agent should switch. A switch needs
either a clear non-Latin script, or two consecutive turns in the same new language, so one borrowed
word ("okay", "namaste") never flips the call.
"""

import os
import re
from typing import Iterable, Optional


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


# Common function words per Latin-script language, for an instant (no network) language guess on each caller turn.
_STOPWORDS = {
    "en": ("the is are was were you your what how can i me my we our this that these those with for and not have has had yes "
           "no hello please thank thanks okay yeah want need would could will about like get make one to of in on it be do "
           "so but or if its who when where why which from at by an there here some any all just also price cost tell "
           "know give help do does did").split(),
    "hi": "hai hain nahi nahin kya aap mujhe mera meri hum ho kaise kripya haan ji bolo acha accha theek abhi lekin toh karo kar raha rahi chahiye".split(),
    "es": "el la los las que de en un una es por con para hola gracias quiero necesito usted como esta cuanto cuesta puedo mis".split(),
    "fr": "le la les des est une un que pour avec bonjour merci je vous nous suis pas ce qui comment combien veux".split(),
    "de": "der die das und ist nicht ich sie wir mit für ein eine hallo danke bitte ja nein wie viel möchte".split(),
    "pt": "o os as que de em um uma é por com para olá obrigado quero preciso você não quanto custa".split(),
    "it": "il lo gli che di un una è per con ciao grazie voglio ho sono non quanto costa".split(),
    "nl": "de het een en ik je u niet is dat voor met hallo dank alstublieft ja nee hoeveel".split(),
}
_VOCAB = {code: frozenset(words) for code, words in _STOPWORDS.items()}


def guess_latin_language(text: str) -> Optional[str]:
    """Best-effort guess for Latin-script text; None if inconclusive."""
    words = re.findall(r"[a-zà-ÿ']+", (text or "").lower())
    if len(words) < 2:
        return None
    scores = {code: sum(w in vocab for w in words) for code, vocab in _VOCAB.items()}
    ranked = sorted(scores.values(), reverse=True)
    best = max(scores, key=scores.get)
    # One clear hit is enough when no other language scores at all (e.g. a short English sentence).
    if scores[best] > ranked[1] and (scores[best] >= 2 or len(words) >= 3):
        return best
    return None


def detect_language(text: str) -> Optional[str]:
    """Instant guess at the language of one caller turn: script first, then Latin-word vocabulary."""
    return script_language(text) or guess_latin_language(text)


# Languages each voice family can actually speak (mirrors the voice picker in the agent creator).
SONIC_LANGUAGES = frozenset(
    "en hi es fr de it pt ja zh ko ar nl he sv pl tr id th ru vi tl ta te bn gu pa ur el da fi no cs hu ro uk bg hr ms sk ka kn ml mr".split()
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


def sonic_language_mode() -> str:
    """How the Sonic voice learns the language.

    'auto' (default): send no language and never touch the voice mid-call. Sonic reads the language from the text,
    which is how calls worked before multi-language, and the caller's language is followed by the reply text alone,
    so a switch costs no extra round trip. 'track' sends an explicit language and updates it on each switch (an
    extra voice update per switch). 'multi' sends language "multi", which some Sonic models reject.
    """
    mode = os.getenv("SONIC_LANGUAGE_MODE", "auto").strip().lower()
    return mode if mode in ("track", "multi") else "auto"


def normalize_code(code: Optional[str]) -> str:
    return (code or "en").split("-")[0].split("_")[0].strip().lower() or "en"


def language_name(code: str) -> str:
    from app.services.llm_generator_service import LANG_NAMES  # lazy: that module imports this package
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
