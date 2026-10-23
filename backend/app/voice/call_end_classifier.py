"""
Language-agnostic call-end classifier.

Regex rules in ivr_detector only cover languages we wrote patterns for. This asks the LLM to judge a
caller turn in ANY language: is it a voicemail / IVR / automated system, or a person who wants to stop
talking? It also returns a short goodbye written in the caller's own language, so the hangup message
always matches whoever is on the line.
"""

import json
import logging
from typing import Optional, List

from app.services.llm_generator_service import LLMGeneratorService, LANG_NAMES

logger = logging.getLogger(__name__)

_llm = LLMGeneratorService()

# call_sid -> Twilio AnsweredBy value (machine_*, fax). Filled by the AMD webhook, read by the voice gateway.
# Twilio decides from the audio itself, so this works for voicemail in any language.
MACHINE_CALLS: dict = {}

_SYSTEM = (
    "You supervise an outbound phone call made by an AI voice agent. You get the latest thing the other "
    "party said, in ANY language or script (including romanized text). Decide:\n"
    "- is_machine: true if it is a voicemail greeting, answering machine, IVR keypad menu ('press 1...'), "
    "hold/queue message, carrier announcement, or a third-party automated screener.\n"
    "- wants_to_end: true ONLY if a live person clearly says they do not want to talk, are not interested, "
    "do not need anything, or asks not to be called. A question, hesitation or 'busy right now, call later' "
    "is NOT wants_to_end unless they refuse outright.\n"
    "- language: ISO 639-1 code of the language the other party spoke.\n"
    "- closing: ONE short polite goodbye (max 25 words) in that same language and script, thanking them "
    "and saying they can get in touch if they need help later. For a machine, make it a brief "
    "'we will follow up later, thank you' style message.\n"
    'Reply with JSON only: {"is_machine":bool,"wants_to_end":bool,"language":"xx","closing":"..."}'
)


class CallEndVerdict:
    def __init__(self, is_machine: bool, wants_to_end: bool, language: str, closing: str):
        self.is_machine = is_machine
        self.wants_to_end = wants_to_end
        self.language = language
        self.closing = closing

    @property
    def should_end(self) -> bool:
        return self.is_machine or self.wants_to_end


async def classify_turn(text: str, agent_languages: Optional[List[str]] = None,
                        stt_language: Optional[str] = None, speaking: Optional[str] = None) -> Optional[CallEndVerdict]:
    """Returns a verdict, or None if no LLM is configured or the call failed (caller keeps regex result)."""
    if not text or len(text.split()) < 2:
        return None
    if not (_llm.is_azure_configured() or _llm.is_openai_configured()):
        return None

    hint = ""
    if agent_languages:
        names = [LANG_NAMES.get(c, c) for c in agent_languages if c]
        hint = f"\nLanguages this agent is configured for (hint only): {', '.join(names)}."
    if stt_language and stt_language != "multi":
        hint += (f"\nThe recognizer is tuned to {LANG_NAMES.get(stt_language, stt_language)}; anything the caller says in "
                 f"another language (English, Hindi, ...) is still written in that language's script as phonetic gibberish. "
                 f"Never answer '{stt_language}' just because of the script: decide from the words and sounds.")
    if speaking:
        hint += f"\nThe agent is currently replying in {LANG_NAMES.get(speaking, speaking)}."
    try:
        if _llm.is_azure_configured():
            raw = await _llm._call_azure_openai(_SYSTEM + hint, text)
        else:
            raw = await _llm._call_standard_openai(_SYSTEM + hint, text)
        if not raw:
            return None
        data = json.loads(raw)
        return CallEndVerdict(
            is_machine=bool(data.get("is_machine")),
            wants_to_end=bool(data.get("wants_to_end")),
            language=str(data.get("language") or "en"),
            closing=str(data.get("closing") or "").strip(),
        )
    except Exception as e:
        logger.warning(f"[CallEndClassifier] classification failed: {e}")
        return None
