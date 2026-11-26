"""Pure turn-taking and interruption rules (no I/O)."""

import unicodedata

BACKCHANNELS = frozenset(
    {
        "હા", "હમ", "જી", "હા જી", "હમમ", "ઠીક", "ઓકે",
        "ok", "okay", "yes", "yeah", "hmm", "uh",
    }
)

_SILENCE_MS = 900
_SPEECH_MS = 600


def _keep(ch: str) -> bool:
    return unicodedata.category(ch)[0] in ("L", "M", "N")


def clean_transcript(text: str) -> str:
    """Trim, collapse whitespace; "" when no letter or digit is present."""
    collapsed = " ".join((text or "").split())
    if not any(ch.isalnum() for ch in collapsed):
        return ""
    return collapsed


def _words(text: str) -> list[str]:
    words = []
    for raw in clean_transcript(text).split():
        w = "".join(ch for ch in raw if _keep(ch)).lower()
        if w:
            words.append(w)
    return words


def _is_backchannel(words: list[str]) -> bool:
    if not words:
        return False
    return " ".join(words) in BACKCHANNELS or all(w in BACKCHANNELS for w in words)


def turn_is_complete(final_text: str, speech_final: bool, ms_since_last_word: int) -> bool:
    words = _words(final_text)
    if not words:
        return False
    return speech_final or ms_since_last_word >= _SILENCE_MS


def is_real_interruption(partial_text: str, speech_ms: int, agent_speaking: bool) -> bool:
    if not agent_speaking:
        return False
    words = _words(partial_text)
    # Duration alone never interrupts: echo of the agent's own audio or line
    # noise gives long voice activity with no recognised words.
    if words and speech_ms >= _SPEECH_MS:
        return True
    return len(words) >= 2 and not _is_backchannel(words)
