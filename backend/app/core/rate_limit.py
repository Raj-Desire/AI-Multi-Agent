import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple


class FailureLimiter:
    """Sliding-window limiter for failed attempts (e.g. wrong passwords) per key.

    State is per process, which is enough to stop a single client hammering one worker and to cap the
    database work an unauthenticated caller can trigger; put a gateway/WAF rule in front for a hard global limit.
    """

    def __init__(self, max_failures: int = 8, window_seconds: float = 900.0, max_keys: int = 10000):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._failures: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> Deque[float]:
        events = self._failures.get(key)
        if events is None:
            return deque()
        while events and now - events[0] > self.window_seconds:
            events.popleft()
        if not events:
            self._failures.pop(key, None)
        return events

    def retry_after(self, key: str) -> int:
        """Seconds the caller must wait, or 0 when the attempt is allowed."""
        now = time.time()
        with self._lock:
            events = self._prune(key, now)
            if len(events) < self.max_failures:
                return 0
            return max(1, int(self.window_seconds - (now - events[0])))

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            if len(self._failures) >= self.max_keys:
                self._failures.clear()
            self._failures.setdefault(key, deque()).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


login_limiter = FailureLimiter()


def login_keys(ip: str, identifier: str) -> Tuple[str, str]:
    """Limit both per client IP and per account, so neither one IP spraying accounts nor
    many IPs guessing one account gets unlimited tries."""
    return f"ip:{ip}", f"id:{identifier.lower().strip()}"
