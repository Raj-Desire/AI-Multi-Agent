"""Log-safe description of spoken text: counts only, never the words themselves."""
from typing import Optional


def words_summary(text: Optional[str]) -> str:
    text = text or ""
    return f"{len(text.split())} words, {len(text)} chars"
