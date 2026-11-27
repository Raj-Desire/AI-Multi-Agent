"""Split streamed model text into speakable sentences."""
from typing import List, Optional

_ENDS = ".?!।\n"
_CLAUSE_ENDS = ",;:"
MAX_CHARS = 90


class SentenceChunker:
    """Splits streamed text into speakable pieces.

    `early_clause_chars` (latency): when set, the FIRST piece of a reply may also end at a comma / semicolon /
    colon once it holds at least that many characters, so the voice starts before the whole first sentence has
    been generated. Later pieces still end only at sentence ends."""

    def __init__(self, early_clause_chars: Optional[int] = None) -> None:
        self._buf = ""
        self._early = early_clause_chars
        self._emitted = 0

    def _find_clause_end(self) -> int:
        """Index just past the first clause break that leaves a long enough first piece, or -1."""
        b = self._buf
        for i, ch in enumerate(b):
            if ch in _ENDS:
                return -1  # a real sentence end comes first
            if ch not in _CLAUSE_ENDS:
                continue
            if len(b[: i + 1].strip()) < (self._early or 0):
                continue
            if i > 0 and b[i - 1].isdigit():
                if i + 1 >= len(b):
                    return -1  # "1,00,000" or "10:30": undecided until the next char arrives
                if b[i + 1].isdigit():
                    continue
            return i + 1
        return -1

    def _find_end(self) -> int:
        end = self._find_sentence_end()
        if self._early and self._emitted == 0:
            clause = self._find_clause_end()
            if clause != -1 and (end == -1 or clause < end):
                return clause
        return end

    def _find_sentence_end(self) -> int:
        """Index just past the first sentence end in the buffer, or -1."""
        b = self._buf
        for i, ch in enumerate(b):
            if ch not in _ENDS:
                continue
            if ch == ".":
                prev_digit = i > 0 and b[i - 1].isdigit()
                if prev_digit:
                    if i + 1 >= len(b):
                        return -1  # undecided until next char arrives
                    if b[i + 1].isdigit():
                        continue
            return i + 1
        if len(b) >= MAX_CHARS:
            sp = b.find(" ", MAX_CHARS)
            if sp != -1:
                return sp
        return -1

    def feed(self, text: str) -> List[str]:
        self._buf += text
        out: List[str] = []
        while True:
            end = self._find_end()
            if end == -1:
                break
            piece = self._buf[:end].strip()
            self._buf = self._buf[end:].lstrip(" ")
            if piece:
                out.append(piece)
                self._emitted += 1
        return out

    def flush(self) -> Optional[str]:
        rest = self._buf.strip()
        self._buf = ""
        return rest or None
