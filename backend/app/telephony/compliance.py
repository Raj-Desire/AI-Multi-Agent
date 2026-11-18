"""Country calling rules that apply to a destination whichever telephony provider carries the call."""

from datetime import datetime, time, timedelta, timezone
from typing import Optional

# India has no daylight saving, so a fixed offset is exact and needs no timezone database.
_IST = timezone(timedelta(hours=5, minutes=30))
_INDIA_OPEN = time(9, 0)
_INDIA_CLOSE = time(21, 0)
INDIA_HOURS_MESSAGE = "Outside permitted calling hours (09:00–21:00 India time)"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def check_destination_allowed(to_number: str, now_utc: Optional[datetime] = None) -> tuple[bool, str]:
    """(allowed, reason). Calls to +91 numbers are only allowed from 09:00 up to (not including) 21:00 India time."""
    if (to_number or "").strip().startswith("+91"):
        local = (now_utc or _utcnow()).astimezone(_IST).time()
        if not (_INDIA_OPEN <= local < _INDIA_CLOSE):
            return False, INDIA_HOURS_MESSAGE
    return True, ""
