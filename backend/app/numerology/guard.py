"""Call-end guard for the numerology agents.

The platform asks a language model whether the caller's last turn is a voicemail or a phone menu. Dates, months and
phone-number words ("તારીખ પાંચ, બે હજાર પાંચ", "નેવું બે છત્રીસ એકોતેર") look like a keypad menu to it, so real people were
hung up on. A short turn from a person answering the agent's question is never a machine.
"""

from typing import Any

from app.numerology.tools import AGENT_SCOPE

SHORT_ANSWER_WORDS = 16


def is_plain_answer(agent_config: Any, latest_text: str) -> bool:
    if getattr(agent_config, "agent_entity_scope", None) != AGENT_SCOPE:
        return False
    return 0 < len((latest_text or "").split()) <= SHORT_ANSWER_WORDS


_BARE_NO_WORDS = {"નહીં", "નહિ", "ના", "નથી", "જી", "no", "nope", "nahi", "nahin", "नहीं", "नही", "ना", "जी"}
_QUESTION_WORDS = ("શું", "કેમ", "ક્યારે", "ક્યાં", "કોણ", "કેવી", "કેટલા", "क्या", "क्यों", "कब", "कहाँ")
_EDGE_PUNCT = " \t\r\n.,!?;:-–—…'\"“”‘’()।॥"


def is_bare_no_to_question(latest_text: str, agent_last_line: str) -> bool:
    """A bare "no" answering the agent's yes/no question is an answer, not a refusal to continue the call."""
    words = [w.strip(_EDGE_PUNCT) for w in (latest_text or "").lower().split()]
    words = [w for w in words if w]
    if not words or len(words) > 3 or any(w not in _BARE_NO_WORDS for w in words):
        return False
    if all(w in ("જી", "जी") for w in words):
        return False
    line = (agent_last_line or "").strip()
    if not line:
        return False
    return line.endswith(("?", "？")) or any(w in _QUESTION_WORDS for w in line.split())
