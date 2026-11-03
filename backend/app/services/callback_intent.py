"""Detects "call me back ..." requests in what a customer said and resolves the promised time in code.

The call-back time is computed here (never by an LLM), the same way appointment times are resolved
(see appointment_time.py): a relative request such as "after five minutes" becomes an exact UTC instant.
"""
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

MAX_ADVANCE_DAYS = 30
MIN_DELAY_SECONDS = 60

_UNITS = {
    "second": 1, "sec": 1,
    "minute": 60, "min": 60, "mint": 60,
    "hour": 3600, "hr": 3600, "ghanta": 3600, "ghante": 3600,
    "day": 86400,
    "week": 7 * 86400,
}

_WORD_NUMBERS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
    # Hinglish
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6, "saat": 7, "aath": 8,
    "nau": 9, "das": 10, "pandrah": 15, "bees": 20, "tees": 30,
}
_TENS = ("twenty", "thirty", "forty", "fifty", "sixty")
_ONES = ("one", "two", "three", "four", "five", "six", "seven", "eight", "nine")
_UNIT_RE = r"(?:seconds?|secs?|minutes?|mins?|mint|hours?|hrs?|ghanta|ghante|days?|weeks?)"

# "call me back", "ring me", "can you call me", "get back to me", "I'm busy" ...
_INTENT_RE = re.compile(
    r"\b(?:call|ring|phone|contact|reach|dial|try|connect|talk|speak|text|message)\b[^.?!]{0,30}\b(?:back|again|later|after|in|at|tomorrow|tonight|evening|morning|afternoon|next|on)\b"
    r"|\bcall\s*(?:me|us)\b|\bcall\s*back\b|\bcallback\b|\bget back to me\b|\bring\s*(?:me|us)\b"
    r"|\b(?:i am|i'm|im|we are|we're)\s+(?:currently |right now |really |very |a bit |a little )*(?:busy|driving|in a meeting|at work|not free|occupied)\b"
    r"|\b(?:busy|bad time|not a good time|not the right time|can't talk|cannot talk|can't speak|cannot speak|not free)\b"
    r"|\bbaad\b|\bkal\s*(?:call|baat|phone)\b|\bphir\s*(?:call|baat)\b|\b(?:call|phone)\s*(?:karo|karna|kar do|kardo|kijiye|kariye|karein)\b",
    re.IGNORECASE,
)
_LATER_RE = re.compile(r"\b(?:later|in a while|after some time|some other time|another time|another day|baad mein|baad me|phir se)\b", re.IGNORECASE)
_CANCEL_RE = re.compile(
    r"\b(?:don'?t|do not|dont|never|stop)\s+(?:call|calling|contact|bother|phone)\b"
    r"|\bno need\b|\bnot interested\b|\bno thanks\b|\bno thank you\b|\bremove (?:me|my number)\b|\bwrong number\b|\bleave me alone\b",
    re.IGNORECASE,
)

_TIME_OF_DAY = {"morning": (10, 0), "noon": (12, 0), "afternoon": (15, 0), "evening": (18, 0), "night": (20, 0),
                "lunch": (14, 0), "subah": (10, 0), "shaam": (18, 0), "dopahar": (14, 0), "raat": (20, 0)}
_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_CLOCK_RE = re.compile(r"\b(?:at\s+|around\s+|by\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)\b|\bat\s+(\d{1,2}):(\d{2})\b|\bat\s+(\d{1,2})\b(?!\s*(?:" + _UNIT_RE + r"))", re.IGNORECASE)


@dataclass
class CallbackRequest:
    at: datetime          # aware UTC instant to call back
    label: str            # human wording, e.g. "in 5 minutes"
    exact: bool           # True when the customer named a time, False when the campaign default delay was used
    source_text: str = ""


def _zone(iana: Optional[str]):
    if ZoneInfo:
        try:
            return ZoneInfo(iana or "UTC")
        except Exception:
            return ZoneInfo("UTC")
    return dt_timezone.utc  # pragma: no cover


def _normalise(text: str) -> str:
    """Lower-case and turn number words / fuzzy quantities into digits so one regex can read them."""
    t = " " + (text or "").lower().replace("-", " ") + " "
    t = re.sub(r"[,;]", " ", t)
    t = re.sub(r"\ban hour and a half\b|\bone and a half hours?\b|\bdeed ghanta\b|\bdedh ghanta\b", " 90 minutes ", t)
    t = re.sub(r"\bhalf an hour\b|\ba half hour\b|\bhalf hour\b|\badha ghanta\b", " 30 minutes ", t)
    t = re.sub(r"\ba quarter of an hour\b|\bquarter of an hour\b|\bquarter hour\b", " 15 minutes ", t)
    t = re.sub(r"\b(?:a )?couple of (" + _UNIT_RE + r")\b", r" 2 \1 ", t)
    t = re.sub(r"\b(?:a )?few (" + _UNIT_RE + r")\b", lambda m: f" {5 if m.group(1).startswith('min') else 3} {m.group(1)} ", t)
    t = re.sub(r"\b(?:an|a) (" + _UNIT_RE + r")\b", r" 1 \1 ", t)
    # compound tens: "forty five" -> 45
    t = re.sub(r"\b(" + "|".join(_TENS) + r") (" + "|".join(_ONES) + r")\b",
               lambda m: f" {_WORD_NUMBERS[m.group(1)] + _WORD_NUMBERS[m.group(2)]} ", t)
    # single number words, only when they sit right before a time unit ("do" / "char" are ordinary words otherwise)
    words = "|".join(sorted(_WORD_NUMBERS, key=len, reverse=True))
    t = re.sub(r"\b(" + words + r")\s+(?=" + _UNIT_RE + r"\b)", lambda m: f" {_WORD_NUMBERS[m.group(1)]} ", t)
    return re.sub(r"\s+", " ", t).strip()


def _relative_seconds(text: str) -> Optional[int]:
    """'after 5 minutes' -> 300. Sums several parts ('1 hour 30 minutes')."""
    total, found = 0.0, False
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(" + _UNIT_RE + r")\b", text):
        unit = re.sub(r"s$", "", m.group(2))
        if unit not in _UNITS:
            continue
        total += float(m.group(1)) * _UNITS[unit]
        found = True
    return int(total) if found else None


def _clock(text: str):
    """(hour, minute) from '5 pm', '17:30', 'at 5', '5 o'clock'; None when absent."""
    m = _CLOCK_RE.search(text)
    if not m:
        return None
    if m.group(1):
        hour, minute, suffix = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower().replace(".", "")
        if suffix.startswith("p") and hour < 12:
            hour += 12
        elif suffix.startswith("a") and hour == 12:
            hour = 0
        elif suffix.startswith("o") and 1 <= hour <= 6:  # "5 o'clock" in a call-back context means the afternoon
            hour += 12
    elif m.group(4):
        hour, minute = int(m.group(4)), int(m.group(5))
    else:
        hour, minute = int(m.group(6)), 0
        if 1 <= hour <= 6:
            hour += 12
    if hour > 23 or minute > 59:
        return None
    return hour, minute


def _label_for(delta_seconds: int) -> str:
    if delta_seconds < 3600:
        minutes = max(1, round(delta_seconds / 60))
        return f"in {minutes} minute{'s' if minutes != 1 else ''}"
    if delta_seconds < 86400:
        hours = delta_seconds / 3600
        return f"in {hours:g} hour{'s' if hours != 1 else ''}" if abs(hours - round(hours)) < 0.05 else f"in {round(delta_seconds / 60)} minutes"
    days = round(delta_seconds / 86400)
    return f"in {days} day{'s' if days != 1 else ''}"


def parse_callback_time(text: str, now_utc: datetime, tz_iana: Optional[str]) -> Optional[CallbackRequest]:
    """The call-back instant a customer named, or None when no time is mentioned."""
    t = _normalise(text)
    if not t:
        return None
    zone = _zone(tz_iana)
    local_now = now_utc.astimezone(zone)

    # 1. Relative: "after five minutes", "in 2 hours", "half an hour"
    seconds = _relative_seconds(t)
    if seconds is not None and seconds > 0:
        seconds = max(seconds, MIN_DELAY_SECONDS)
        if seconds > MAX_ADVANCE_DAYS * 86400:
            return None
        return CallbackRequest(at=now_utc + timedelta(seconds=seconds), label=_label_for(seconds), exact=True, source_text=text)

    # 2. Calendar words: tomorrow / today / tonight / weekday / next week, with an optional clock time or time of day
    day_offset: Optional[int] = None
    default_hm = None
    if re.search(r"\btomorrow\b|\bkal\b", t):
        day_offset = 1
    elif re.search(r"\btonight\b", t):
        day_offset, default_hm = 0, _TIME_OF_DAY["night"]
    elif re.search(r"\bthis (evening|afternoon|morning)\b", t):
        day_offset = 0
        default_hm = _TIME_OF_DAY[re.search(r"\bthis (evening|afternoon|morning)\b", t).group(1)]
    elif re.search(r"\bnext week\b", t):
        day_offset = 7
    elif re.search(r"\bday after tomorrow\b|\bparso\b", t):
        day_offset = 2
    else:
        for i, name in enumerate(_WEEKDAYS):
            if re.search(r"\b" + name + r"\b", t):
                day_offset = (i - local_now.weekday()) % 7 or 7
                break

    clock = _clock(t)
    tod = next((v for k, v in _TIME_OF_DAY.items() if re.search(r"\b" + k + r"\b", t)), None)
    if day_offset is None and clock is not None:
        # "call me at 5 pm": today if still ahead, otherwise tomorrow
        hm = clock
        target = local_now.replace(hour=hm[0], minute=hm[1], second=0, microsecond=0)
        if target <= local_now + timedelta(seconds=MIN_DELAY_SECONDS):
            target += timedelta(days=1)
    elif day_offset is not None:
        hm = clock or tod or default_hm or (10, 0)
        base = (local_now + timedelta(days=day_offset)).replace(hour=hm[0], minute=hm[1], second=0, microsecond=0)
        target = base
        if day_offset == 0 and target <= local_now + timedelta(seconds=MIN_DELAY_SECONDS):
            return None  # "this evening" said at night: no usable time
    else:
        return None

    at = target.astimezone(dt_timezone.utc)
    if at > now_utc + timedelta(days=MAX_ADVANCE_DAYS):
        return None
    label = target.strftime("%A %I:%M %p").replace(" 0", " ")
    return CallbackRequest(at=at, label=label, exact=True, source_text=text)


class CallbackTracker:
    """Follows what the customer says during one call and keeps the latest agreed call-back request.

    - "call me after five minutes"                  -> call-back request in 5 minutes
    - "I'm busy ..." then, later, "in ten minutes"  -> intent remembered, time applied when given
    - "call me later" (no time)                     -> the campaign's default retry delay
    - "don't call me again" / "not interested"      -> any pending request is cancelled
    """

    def __init__(self, tz_iana: Optional[str] = "UTC", default_minutes: int = 30, clock=None):
        self.tz_iana = tz_iana or "UTC"
        self.default_minutes = max(1, int(default_minutes or 30))
        self._clock = clock or (lambda: datetime.now(dt_timezone.utc))
        self.request: Optional[CallbackRequest] = None
        self._intent_pending = False

    def feed(self, customer_text: str) -> str:
        """Returns 'scheduled', 'cancelled' or '' (nothing changed)."""
        text = (customer_text or "").strip()
        if not text:
            return ""
        now = self._clock()
        has_intent = bool(_INTENT_RE.search(text))
        asks_later = bool(_LATER_RE.search(text))

        timed = parse_callback_time(text, now, self.tz_iana)
        # A time named after a call-back was already agreed ("actually make it after 20 minutes") replaces the old one
        if timed and (has_intent or self._intent_pending or asks_later or self.request is not None):
            self.request, self._intent_pending = timed, False
            return "scheduled"

        if _CANCEL_RE.search(text) and not (has_intent and timed):
            had = self.request is not None or self._intent_pending
            self.request, self._intent_pending = None, False
            return "cancelled" if had else ""

        if has_intent or asks_later:
            # Wants a call back but gave no time (yet): use the default delay now, and refine if a time follows
            self._intent_pending = True
            at = now + timedelta(minutes=self.default_minutes)
            self.request = CallbackRequest(at=at, label=_label_for(self.default_minutes * 60), exact=False, source_text=text)
            return "scheduled"
        return ""


_CONFIRM_RE = re.compile(
    r"\b(?:i(?:'ll| will| shall)|we(?:'ll| will)|i can|i am going to|i'm going to|let me)\s+(?:call|ring|phone|reach|contact|get back to|speak|talk)\b[^?]*"
    r"\b(?:back|again|then|later|at|in|after|tomorrow|soon)\b"
    r"|\bcall you (?:back|again)\b|\b(?:talk|speak) (?:to you )?(?:then|soon)\b",
    re.IGNORECASE,
)


def is_callback_confirmation(agent_text: str) -> bool:
    """True when the agent's turn is a statement promising a call back ("I'll call you back in five minutes.")."""
    text = (agent_text or "").strip()
    return bool(text) and not text.endswith(("?", "؟", "？")) and bool(_CONFIRM_RE.search(text))
