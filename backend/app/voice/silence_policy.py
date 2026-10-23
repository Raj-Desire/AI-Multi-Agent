"""
Silence timeout shared by phone calls and the live preview: ask "are you still there?" after the configured
silence, then conclude and hang up if there is still no answer.
"""

MIN_SILENCE_SECONDS = 3.0
STUCK_SPEAKING_SECONDS = 15.0  # a caller turn this long with no transcript is noise, not speech


def silence_action(
    now: float,
    last_user_speech_time: float,
    agent_speech_done_at: float,
    is_user_speaking: bool,
    user_speech_start_time: float,
    has_reprompted: bool,
    reprompt_injected_at: float,
    silence_timeout: float,
    hangup_delay: float,
) -> str:
    """Returns "none", "reprompt" or "conclude" for this tick of the monitor."""
    # A noise blip can leave "user speaking" set with no words and no end event; ignore it once it is stale.
    caller_talking = is_user_speaking and (now - user_speech_start_time) <= STUCK_SPEAKING_SECONDS
    # Silence only counts after the agent's audio has finished playing and while the caller is not talking.
    if caller_talking or now < agent_speech_done_at:
        return "none"
    last_activity = max(last_user_speech_time, agent_speech_done_at)
    if not has_reprompted:
        return "reprompt" if now - last_activity >= max(MIN_SILENCE_SECONDS, silence_timeout) else "none"
    quiet_since = max(last_activity, reprompt_injected_at)
    return "conclude" if now - quiet_since >= max(MIN_SILENCE_SECONDS, hangup_delay) else "none"
