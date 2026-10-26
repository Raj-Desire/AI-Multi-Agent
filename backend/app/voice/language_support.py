"""
Single source of truth for which languages an agent can use in multi-language mode.

A language can be offered for mid-call switching only if the voice can SPEAK it and the speech recognizer
can HEAR it alongside the other selected languages. Everything else stays single-language, so a client can
never configure a call that gets stuck.
"""

from typing import Any, Dict, List, Optional

from app.voice.language_switcher import normalize_code, voice_languages

# Languages the multilingual recognizer hears together (code-switching).
LISTEN_MULTI_LANGUAGES = frozenset("en es fr de hi ru pt ja it nl".split())

LANGUAGE_LABELS = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German", "hi": "Hindi", "ru": "Russian",
    "pt": "Portuguese", "ja": "Japanese", "it": "Italian", "nl": "Dutch", "zh": "Chinese", "ko": "Korean",
    "ar": "Arabic", "he": "Hebrew", "sv": "Swedish", "pl": "Polish", "tr": "Turkish", "id": "Indonesian",
    "th": "Thai", "vi": "Vietnamese", "tl": "Tagalog", "ta": "Tamil", "te": "Telugu", "bn": "Bengali",
    "gu": "Gujarati", "pa": "Punjabi", "ur": "Urdu", "el": "Greek", "da": "Danish", "fi": "Finnish",
    "no": "Norwegian", "cs": "Czech", "hu": "Hungarian", "ro": "Romanian", "uk": "Ukrainian",
    "bg": "Bulgarian", "hr": "Croatian", "ms": "Malay", "sk": "Slovak", "ka": "Georgian",
    "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi",
}

_REASON_VOICE = "The selected voice cannot speak this language"
_REASON_LISTEN = "Not available for multi-language listening"


def language_options(voice_cfg: Any) -> List[Dict[str, Any]]:
    """Every language the voice can speak, flagged selectable when it also works for multi-language calls."""
    speakable = voice_languages(voice_cfg)
    options = []
    for code in sorted(set(LANGUAGE_LABELS) | set(speakable), key=lambda c: LANGUAGE_LABELS.get(c, c)):
        speaks, hears = code in speakable, code in LISTEN_MULTI_LANGUAGES
        options.append({
            "code": code,
            "label": LANGUAGE_LABELS.get(code, code),
            "selectable": speaks and hears,
            "reason": None if speaks and hears else (_REASON_VOICE if not speaks else _REASON_LISTEN),
        })
    return options


class MultilingualPlan:
    """What a call will actually do, derived from the agent configuration."""

    def __init__(self, enabled: bool, primary: str, languages: List[str], reason: Optional[str] = None):
        self.enabled = enabled
        self.primary = primary
        self.languages = languages
        self.reason = reason


def resolve_multilingual(config: Any) -> MultilingualPlan:
    """Turns the agent's language settings into the effective plan; any unsupported choice disables switching."""
    voice = getattr(config, "voice", None)
    lang_cfg = getattr(config, "language", None)
    primary = normalize_code(getattr(voice, "language", None) or getattr(lang_cfg, "primary", None))
    if lang_cfg is None or not getattr(lang_cfg, "multilingual", False):
        return MultilingualPlan(False, primary, [primary], "Multi-language is turned off")

    speakable = voice_languages(voice)
    if primary not in LISTEN_MULTI_LANGUAGES or primary not in speakable:
        return MultilingualPlan(False, primary, [primary], f"{LANGUAGE_LABELS.get(primary, primary)} cannot be used in multi-language mode")

    languages = [primary]
    for code in getattr(lang_cfg, "secondary", None) or []:
        code = normalize_code(code)
        if code not in languages and code in LISTEN_MULTI_LANGUAGES and code in speakable:
            languages.append(code)
    if len(languages) < 2:
        return MultilingualPlan(False, primary, languages, "Select at least one more language")
    return MultilingualPlan(True, primary, languages)
