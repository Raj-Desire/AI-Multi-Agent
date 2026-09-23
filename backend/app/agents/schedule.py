"""
Per-agent business schedule (operating hours + timezone) resolution.

A multi-agent orchestrator mixes businesses with different hours and timezones: the
organization head office (e.g. Ahmedabad, IST, Mon-Sat 9-7), a dental clinic in Austin
(US Central, Mon-Fri 8-6) and a Goa resort (IST, open daily). The schedule used for
scheduling must belong to the agent currently speaking, never silently the organization's.

Precedence:
  1. Explicit `AgentConfiguration.operating_hours` fields
  2. The agent's own knowledge text ("Hours: ..." line; timezone inferred from its location)
  3. An explicitly passed business profile (legacy/tests; there is no organization-wide
     profile any more), ONLY for agents not scoped to another business. Otherwise the agent
     gets no office-hours restriction rather than someone else's hours.
"""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Optional, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

DEFAULT_TZ_LABEL = "Asia/Kolkata (IST, UTC+05:30)"
DEFAULT_IANA = "Asia/Kolkata"

# Location / abbreviation words -> IANA zone. Checked with word boundaries, in order.
_LOCATION_ZONES: Tuple[Tuple[str, str], ...] = (
    (r"india|goa|ahmedabad|gujarat|mumbai|delhi|bengaluru|bangalore|kolkata|chennai|pune|hyderabad|jaipur|\bist\b", "Asia/Kolkata"),
    (r"texas|austin|dallas|houston|san antonio|chicago|illinois|minnesota|central time|\bcst\b|\bcdt\b", "America/Chicago"),
    (r"new york|nyc|boston|florida|miami|atlanta|washington dc|new jersey|eastern time|\best\b|\bedt\b", "America/New_York"),
    (r"california|los angeles|san francisco|seattle|san diego|oregon|pacific time|\bpst\b|\bpdt\b", "America/Los_Angeles"),
    (r"phoenix|arizona", "America/Phoenix"),
    (r"denver|colorado|utah|mountain time|\bmst\b|\bmdt\b", "America/Denver"),
    (r"london|united kingdom|\buk\b|england|scotland|\bbst\b|\bgmt\b", "Europe/London"),
    (r"dubai|abu dhabi|\buae\b|\bgst\b", "Asia/Dubai"),
    (r"singapore|\bsgt\b", "Asia/Singapore"),
    (r"sydney|melbourne|australia|\baest\b|\baedt\b", "Australia/Sydney"),
    (r"tokyo|japan|\bjst\b", "Asia/Tokyo"),
    (r"paris|france|\bcet\b|\bcest\b", "Europe/Paris"),
    (r"berlin|germany", "Europe/Berlin"),
)

_HOURS_LINE = re.compile(
    r"(?im)^[\s\-*•]*(?:operating|business|opening|office|clinic|store|working)?\s*hours\s*:\s*(.+)$"
)
_SCHEDULE_TOKEN = re.compile(
    r"\b(?:mon|tue|wed|thu|fri|sat|sun|daily|weekday|weekend|24/7|24 hours|closed|open)\w*|\d\s*(?::\d\d)?\s*(?:am|pm)\b",
    re.IGNORECASE,
)


# "Emergency 24/7 line: (512) 555-0199" is a contact, not the schedule
_PHONE = re.compile(r"\(\d{3}\)|\b\d{3}[-.\s]\d{3,4}\b")


@dataclass
class AgentSchedule:
    """Resolved scheduling facts for the agent currently speaking."""
    business_name: str
    hours_text: Optional[str]      # e.g. "Monday - Saturday, 9:00 AM - 7:00 PM. Closed on Sunday."
    timezone_label: str            # human label, e.g. "America/Chicago (US Central)"
    iana: str
    source: str                    # "agent" | "agent_knowledge" | "organization" | "none"

    @property
    def is_organization(self) -> bool:
        return self.source == "organization"

    def now(self) -> datetime:
        if ZoneInfo:
            try:
                return datetime.now(ZoneInfo(self.iana))
            except Exception:
                pass
        return datetime.now(dt_timezone(timedelta(hours=5, minutes=30)))

    def local_moment_text(self) -> str:
        now = self.now()
        return f"{now.strftime('%A')}, {now.strftime('%B %d, %Y')} at {now.strftime('%I:%M %p')}"

    def hours_sentence(self) -> str:
        if self.hours_text:
            return self.hours_text
        return "No fixed office hours are listed; do not restrict bookings to office hours, follow the facts (e.g. check-in times)."


def to_iana(label: Optional[str]) -> Optional[str]:
    """Maps a timezone label ('IST (UTC+5:30)', 'America/Chicago', 'CST') to an IANA key."""
    if not label or not str(label).strip():
        return None
    label = str(label).strip()
    if ZoneInfo:
        for candidate in (label, *re.findall(r"[A-Za-z_]+/[A-Za-z_]+", label)):
            try:
                ZoneInfo(candidate)
                return candidate
            except Exception:
                continue
    if "+5:30" in label or "+05:30" in label:
        return "Asia/Kolkata"
    return infer_zone_from_text(label)


def infer_zone_from_text(text: Optional[str]) -> Optional[str]:
    """Infers an IANA zone from location words in free text (earliest mention wins)."""
    if not text:
        return None
    lowered = text.lower()
    best: Optional[Tuple[int, str]] = None
    for pattern, zone in _LOCATION_ZONES:
        m = re.search(pattern, lowered)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), zone)
    return best[1] if best else None


def extract_hours_from_text(text: Optional[str]) -> Optional[str]:
    """Pulls the first 'Hours: ...' line, keeping only the sentences that describe a schedule."""
    if not text:
        return None
    m = _HOURS_LINE.search(text)
    if not m:
        return None
    kept = [
        seg.strip() for seg in re.split(r"(?<=[.;])\s+", m.group(1))
        if _SCHEDULE_TOKEN.search(seg) and not _PHONE.search(seg)
    ]
    hours = " ".join(kept).strip()
    return hours or None


def _profile_dict(business_profile: Any) -> dict:
    if business_profile is None:
        return {}
    if isinstance(business_profile, dict):
        return business_profile
    if hasattr(business_profile, "model_dump"):
        return business_profile.model_dump(mode="json")
    return {}


def _org_hours(profile: dict) -> Tuple[Optional[str], Optional[str]]:
    hours = profile.get("operating_hours") or {}
    if not isinstance(hours, dict):
        hours = hours.model_dump() if hasattr(hours, "model_dump") else {}
    if not hours:
        return None, None
    days = hours.get("days") or "Monday - Saturday"
    h = hours.get("hours") or "9:00 AM - 7:00 PM"
    closed = hours.get("closed_on") or "Sunday"
    return f"{days}, {h}. Closed on {closed}.", hours.get("timezone")


def _label(iana: str, raw: Optional[str] = None) -> str:
    if raw and raw.strip() and raw.strip() != iana:
        return f"{iana} ({raw.strip()})"
    return iana


def resolve_agent_schedule(config: Any = None, business_profile: Any = None) -> AgentSchedule:
    """Resolves the operating hours and timezone for `config` (see module docstring)."""
    profile = _profile_dict(business_profile)
    org_hours, org_tz_raw = _org_hours(profile)
    org_iana = to_iana(org_tz_raw) or DEFAULT_IANA
    company = (profile.get("company_name") or "").strip()

    if config is None:
        return AgentSchedule(company or "our company", org_hours, _label(org_iana, org_tz_raw or DEFAULT_TZ_LABEL), org_iana,
                             "organization" if org_hours else "none")

    business_name = (
        getattr(config, "agent_entity_scope", None) or getattr(config, "company_name", None)
        or company or getattr(config, "name", "") or "our company"
    ).strip()
    scoped = bool(getattr(config, "agent_entity_scope", None))

    explicit = getattr(config, "operating_hours", None)
    exp_days = getattr(explicit, "days", None) if explicit else None
    exp_hours = getattr(explicit, "hours", None) if explicit else None
    exp_closed = getattr(explicit, "closed_on", None) if explicit else None
    exp_tz = getattr(explicit, "timezone", None) if explicit else None

    own_text = " \n".join(
        t for t in (
            getattr(config, "custom_knowledge", None),
            getattr(config, "system_prompt", None),
        ) if t
    )
    location_text = " ".join(
        t for t in (
            getattr(config, "agent_entity_scope", None),
            getattr(config, "office_address", None),
            getattr(config, "description", None),
            own_text[:2500],
        ) if t
    )

    # Hours
    hours_text: Optional[str] = None
    source = "none"
    if exp_hours or exp_days:
        parts = [p for p in (exp_days, exp_hours) if p]
        hours_text = ", ".join(parts) + "."
        if exp_closed and exp_closed.strip().lower() not in ("none", "no", "-"):
            hours_text += f" Closed on {exp_closed}."
        source = "agent"
    else:
        extracted = extract_hours_from_text(own_text)
        if extracted:
            hours_text, source = extracted, "agent_knowledge"
        elif not scoped and org_hours:
            hours_text, source = org_hours, "organization"

    # Timezone: explicit > agent's own location > organization (unscoped agents share the org clock)
    iana = to_iana(exp_tz) if exp_tz else None
    raw_label = exp_tz
    if not iana:
        iana = infer_zone_from_text(location_text) if scoped or source != "organization" else None
        raw_label = None
    if not iana:
        iana, raw_label = org_iana, (org_tz_raw or DEFAULT_TZ_LABEL)

    return AgentSchedule(business_name, hours_text, _label(iana, raw_label), iana, source)
