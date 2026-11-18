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


def next_allowed_time(to_number: str, now_utc: Optional[datetime] = None) -> Optional[datetime]:
    """None when the call may be placed now; otherwise the next time (UTC) the destination's calling window opens."""
    now = now_utc or _utcnow()
    if check_destination_allowed(to_number, now)[0]:
        return None
    local = now.astimezone(_IST)
    opens = local.replace(hour=_INDIA_OPEN.hour, minute=_INDIA_OPEN.minute, second=0, microsecond=0)
    if local.time() >= _INDIA_CLOSE:
        opens += timedelta(days=1)
    return opens.astimezone(timezone.utc)
