"""Opt-in log file: set APP_LOG_FILE (relative paths resolve against the backend folder)."""
import logging
import logging.handlers
import os
from pathlib import Path
from typing import Optional

HANDLER_NAME = "app_file_log"
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
        target.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            target, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
        )
        handler.set_name(HANDLER_NAME)
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter(_FORMAT))
        root.addHandler(handler)
        if root.level > logging.INFO:  # the app's INFO lines must reach the file
            root.setLevel(logging.INFO)
        return str(target)
    except Exception as e:
        logging.getLogger(__name__).warning("Log file could not be opened (%s)", type(e).__name__)
        return None
