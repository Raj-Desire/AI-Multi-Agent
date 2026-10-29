"""Resolves an agreed local date/time into UTC in code, so the LLM never does timezone arithmetic."""
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from app.agents.schedule import DEFAULT_IANA

UTC_FMT = "%Y-%m-%dT%H:%M:%SZ"
DEFAULT_DURATION_MIN = 30
MAX_ADVANCE_DAYS = 366

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _zone(iana: Optional[str]):
    if ZoneInfo:
        try:
            return ZoneInfo(iana or DEFAULT_IANA), (iana or DEFAULT_IANA)
        except Exception:
            return ZoneInfo(DEFAULT_IANA), DEFAULT_IANA
    return dt_timezone.utc, "UTC"  # pragma: no cover


def agent_timezone(snapshot: Any) -> str:
    """IANA zone for an agent config snapshot (dict or model); falls back to the platform default."""
    if not snapshot:
        return DEFAULT_IANA
    try:
        from app.agents.configuration import AgentConfiguration
        from app.agents.schedule import resolve_agent_schedule
        cfg = AgentConfiguration.model_validate(snapshot) if isinstance(snapshot, dict) else snapshot
        return resolve_agent_schedule(cfg).iana or DEFAULT_IANA
    except Exception:
        return DEFAULT_IANA


def local_reference(iana: Optional[str], now_utc: Optional[datetime] = None) -> str:
    """Text anchoring 'today' for the LLM, in the business timezone."""
    zone, name = _zone(iana)
    now = (now_utc or datetime.now(dt_timezone.utc)).astimezone(zone)
    return f"{now.strftime('%A')}, {now.strftime('%Y-%m-%d')}, {now.strftime('%H:%M')} ({name})"


def resolve_to_utc(date_str: Any, time_str: Any, iana: Optional[str], now_utc: Optional[datetime] = None) -> Optional[datetime]:
    """Combines a local YYYY-MM-DD and HH:MM into aware UTC. None when missing, malformed, past or too far out."""
    if not isinstance(date_str, str) or not isinstance(time_str, str):
        return None
    date_str, time_str = date_str.strip(), time_str.strip()
    tm = _TIME_RE.match(time_str)
    if not _DATE_RE.match(date_str) or not tm:
        return None
    zone, _ = _zone(iana)
    try:
        y, mo, d = (int(x) for x in date_str.split("-"))
        local = datetime(y, mo, d, int(tm.group(1)), int(tm.group(2)), tzinfo=zone)
    except ValueError:
        return None
    utc = local.astimezone(dt_timezone.utc)
    now = now_utc or datetime.now(dt_timezone.utc)
    if utc <= now or utc > now + timedelta(days=MAX_ADVANCE_DAYS):
        return None
    return utc


def to_utc_str(dt: datetime) -> str:
    return dt.astimezone(dt_timezone.utc).strftime(UTC_FMT)
