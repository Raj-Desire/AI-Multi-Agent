"""Opt-in log file: set APP_LOG_FILE (relative paths resolve against the backend folder)."""
import logging
import logging.handlers
import os
from pathlib import Path
from typing import Optional

HANDLER_NAME = "app_file_log"
CONSOLE_HANDLER_NAME = "app_console_warnings"
# Chatty libraries (request headers, connection details): only their warnings reach the log.
QUIET_LOGGERS = (
    "azure", "azure.core.pipeline.policies.http_logging_policy", "httpx", "httpcore", "openai",
    "websockets", "websockets.client",
)
BACKEND_DIR = Path(__file__).resolve().parents[2]
_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def attach_file_logging(path: Optional[str] = None) -> Optional[str]:
    """Attaches one rotating file handler (5 MB x 3, INFO) to the root logger. Idempotent; never raises."""
    try:
        raw = path or os.getenv("APP_LOG_FILE")
        if not raw:
            return None
        target = Path(raw)
        if not target.is_absolute():
            target = BACKEND_DIR / target
        target = target.resolve()
        root = logging.getLogger()
        for h in root.handlers:
            if h.get_name() == HANDLER_NAME:
                return getattr(h, "baseFilename", str(target))
        had_handlers = bool(root.handlers)
        target.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            target, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
        )
        handler.set_name(HANDLER_NAME)
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter(_FORMAT))
        root.addHandler(handler)
        if not had_handlers and not any(h.get_name() == CONSOLE_HANDLER_NAME for h in root.handlers):
            # before, warnings reached stderr through logging's last-resort handler; keep that
            console = logging.StreamHandler()
            console.set_name(CONSOLE_HANDLER_NAME)
            console.setLevel(logging.WARNING)
            console.setFormatter(logging.Formatter(_FORMAT))
            root.addHandler(console)
        for name in QUIET_LOGGERS:
            logging.getLogger(name).setLevel(logging.WARNING)
        if root.level > logging.INFO:  # the app's INFO lines must reach the file
            root.setLevel(logging.INFO)
        return str(target)
    except Exception as e:
        logging.getLogger(__name__).warning("Log file could not be opened (%s)", type(e).__name__)
        return None
