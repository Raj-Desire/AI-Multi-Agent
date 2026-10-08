"""
Spoken-text normalization for voice output.

TTS reads markdown literally ("star star Deluxe Suite"), so anything that reaches the
speech engine must be plain sentences. Used for:
  - facts injected into prompts (so the LLM doesn't mirror list/markdown formatting)
  - streamed LLM deltas relayed by the think proxy (last line of defence before TTS)
"""

import re

# "$280/night" -> "$280 per night"
_PER_UNIT = re.compile(
    r"\s*/\s*(night|hr|hour|month|mo|year|yr|min|minute|guest|person|day|week|seat|user)\b",
    re.IGNORECASE,
)
_UNIT_WORDS = {"hr": "hour", "mo": "month", "yr": "year", "min": "minute"}

# Underscores are left alone: they appear in emails and IDs the agent may need to read out
_MARKDOWN_EMPHASIS = re.compile(r"[*`]{1,3}")
_HEADING = re.compile(r"(^|\n)\s*#{1,6}\s*")
_BULLET = re.compile(r"(^|\n)\s*(?:[-•*]|\d{1,2}[.)])\s+")
_DELTA_BULLET = re.compile(r"(^|\n)\s*[-•*]\s+|(\n)\s*\d{1,2}[.)]\s+")


def _per_unit(match: re.Match) -> str:
    unit = match.group(1).lower()
    return f" per {_UNIT_WORDS.get(unit, unit)}"


def to_spoken_text(text: str) -> str:
    """Flattens prompt facts into one line of plain sentences (lists become sentences)."""
    if not text:
        return ""
    t = _HEADING.sub(r"\1", text)
    t = _BULLET.sub(r"\1", t)
    t = _MARKDOWN_EMPHASIS.sub("", t)
    t = _PER_UNIT.sub(_per_unit, t)
    # Section headers like "ROOMS & NIGHTLY RATES:" followed by newline read as labels
    t = re.sub(r"\s*\n+\s*", ". ", t)
    t = re.sub(r"\.\s*\.", ".", t)
    t = re.sub(r":\s*\.", ":", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def sanitize_spoken_delta(text: str) -> str:
    """
    Strips markdown from a streamed LLM delta without joining lines. Safe on chunk
    fragments: emphasis markers are removed character-wise, so a "**" split across
    two chunks is still removed.
    """
    if not text:
        return text
    t = _HEADING.sub(r"\1", text)
    # A fragment may start mid-sentence (" 2. " in "for 2. Then"), so numbered items are
    # only stripped after an explicit newline; dash/dot bullets are safe at fragment start.
    t = _DELTA_BULLET.sub(lambda m: m.group(1) or m.group(2) or "", t)
    t = _MARKDOWN_EMPHASIS.sub("", t)
    return _PER_UNIT.sub(_per_unit, t)
