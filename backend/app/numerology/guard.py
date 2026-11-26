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
