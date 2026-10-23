"""
Maximum call duration, built around how Twilio bills: per minute, counted from the moment the call is answered
and rounded UP. A call that is still connected a second past the limit pays for another whole minute, so the call
must be hung up with a margin BEFORE the limit, not at it.

Timeline for a limit L (all measured on the billing clock, i.e. from answer):
    L - GOODBYE_LEAD      the closing message is queued behind the sentence in progress (3s allowed to finish it)
    L - HANGUP_MARGIN     the call is hung up (about 1.7s after the last word: 1.2s buffer + the Twilio request)
"""

from typing import Optional

HANGUP_MARGIN_SECONDS = 5.0        # the call is over this long before the limit
GOODBYE_SPEECH_SECONDS = 4.0       # time allowed for the closing message itself
FINISH_SENTENCE_SECONDS = 3.0      # time allowed for the sentence in progress to finish before the goodbye
HANGUP_LATENCY_SECONDS = 1.7       # terminate_call buffer plus the Twilio hang-up request
GOODBYE_LEAD_SECONDS = HANGUP_MARGIN_SECONDS + GOODBYE_SPEECH_SECONDS + FINISH_SENTENCE_SECONDS + HANGUP_LATENCY_SECONDS  # 13.7s
CALLER_SPEAKING_GRACE_SECONDS = 1.0  # wait this long for a caller to finish a word before talking over them (keeps the margin)
NO_CONVERSATION_LIMIT_SECONDS = 60.0  # a call with no real conversation (voicemail, silence) ends sooner
STREAM_START_OFFSET_SECONDS = 1.5  # the media stream starts about this long after Twilio's answer (billing start)


def effective_limit(max_duration: float, real_conversation: bool, credit_limit: Optional[float] = None) -> float:
    """The limit in force right now: the configured maximum once a real conversation has happened, otherwise the
    shorter no-conversation cap; never more than the organization's remaining credit."""
    limit = max(10.0, float(max_duration))
    if credit_limit is not None:
        limit = max(3.0, min(limit, float(credit_limit)))
    return limit if real_conversation else min(NO_CONVERSATION_LIMIT_SECONDS, limit)


def billing_elapsed(stream_elapsed: float) -> float:
    """Seconds Twilio has been billing, from the seconds since the media stream started."""
    return stream_elapsed + STREAM_START_OFFSET_SECONDS


def limit_action(stream_elapsed: float, limit: float, caller_speaking: bool) -> str:
    """"none" or "conclude". There is deliberately no "cut now" answer: the call always ends with a spoken goodbye,
    and a goodbye that starts late is still spoken in full (end_call_gracefully enforces limit_deadline)."""
    elapsed = billing_elapsed(stream_elapsed)
    if limit >= 30:
        conclude_at = max(3.0, limit - GOODBYE_LEAD_SECONDS)
    else:  # very short limits: leave just enough time to say goodbye and hang up
        conclude_at = max(1.0, limit - 6.0)
    if elapsed >= conclude_at and (not caller_speaking or elapsed >= conclude_at + CALLER_SPEAKING_GRACE_SECONDS):
        return "conclude"
    return "none"


def limit_deadline(call_start_time: float, limit: float) -> float:
    """Wall-clock time by which the hang-up must have STARTED so the call is over before the limit's minute rolls
    over. Only reached if the goodbye ran far longer than planned."""
    return call_start_time + limit - STREAM_START_OFFSET_SECONDS - HANGUP_LATENCY_SECONDS - 0.5


def twilio_backstop_seconds(max_duration: float, credit_limit: Optional[int] = None) -> int:
    """Hard cap sent to Twilio when the call is created. It only fires if our server stops managing the call
    (crash, dropped connection), so it sits just above the longest limit the agent can reach."""
    cap = int(max(10.0, float(max_duration)) + 20)
    if credit_limit is not None:
        cap = min(cap, max(1, int(credit_limit)))
    return min(cap, 14400)
