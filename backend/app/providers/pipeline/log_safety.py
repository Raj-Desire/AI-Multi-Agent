"""Keeps keys out of the connection library's logs while an Economy connection is open.

Instead of changing log levels for the whole process, a redacting filter is attached to the
connection library's loggers for the lifetime of each connection (reference-counted, so two
connections never remove each other's filter).
"""
import logging
import re
import threading
from typing import Dict

# Logger filters do not apply to records propagated from child loggers, so the client logger is named too.
_LOGGERS = ("websockets", "websockets.client")
_HEADER = re.compile(r"(?i)\b(authorization|x-api-key|api-key)(\s*[:=]\s*).*")
_REDACTED = "[redacted]"


class SecretRedactor(logging.Filter):
    def __init__(self) -> None:
        super().__init__()
        self.secrets: Dict[str, int] = {}

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            msg = str(record.msg)
        clean = _HEADER.sub(lambda m: f"{m.group(1)}{m.group(2)}{_REDACTED}", msg)
        for s in list(self.secrets):
            if s:
                clean = clean.replace(s, _REDACTED)
        if clean != msg:
            record.msg = clean
            record.args = None
        return True


_lock = threading.Lock()
_filter = SecretRedactor()
_active = 0


class LogGuard:
    """One connection's hold on the filter; release() is idempotent."""

    def __init__(self, secret: str) -> None:
        self._secret = secret
        self._released = False

    def release(self) -> None:
        global _active
        with _lock:
            if self._released:
                return
            self._released = True
            n = _filter.secrets.get(self._secret, 0) - 1
            if n > 0:
                _filter.secrets[self._secret] = n
            else:
                _filter.secrets.pop(self._secret, None)
            _active -= 1
            if _active == 0:
                for name in _LOGGERS:
                    logging.getLogger(name).removeFilter(_filter)


def guard_connection_logs(secret: str) -> LogGuard:
    """Adds the redacting filter (first holder attaches it); call release() on the result when the connection closes."""
    global _active
    secret = (secret or "").strip()
    with _lock:
        _filter.secrets[secret] = _filter.secrets.get(secret, 0) + 1
        _active += 1
        if _active == 1:
            for name in _LOGGERS:
                logging.getLogger(name).addFilter(_filter)
    return LogGuard(secret)
