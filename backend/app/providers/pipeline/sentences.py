"""Split streamed model text into speakable sentences."""
from typing import List, Optional

_ENDS = ".?!।\n"
MAX_CHARS = 90


class SentenceChunker:
    def __init__(self) -> None:
        self._buf = ""

    def _find_end(self) -> int:
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
        return out

    def flush(self) -> Optional[str]:
        rest = self._buf.strip()
        self._buf = ""
        return rest or None
