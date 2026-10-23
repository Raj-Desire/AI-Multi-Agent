"""
When is it safe to hang up after a closing message?

The voice engine reports "audio done" as soon as it has FINISHED SENDING the audio, but the gateway plays it out
in real time, so for several seconds the caller is still listening. Hanging up on that event, or after a fixed
delay, cut goodbyes off mid-sentence. The hang-up must wait until the caller has heard everything.
"""

ENGINE_QUIET_SECONDS = 1.2    # no new audio from the engine for this long means it has finished sending
PLAYBACK_TAIL_SECONDS = 0.5   # extra time after the last audio is due to finish, for the phone network


def closing_audio_expected_seconds(closing_text: str) -> float:
    """Rough minimum seconds of speech the closing message should produce (about 2.6 words per second, at 45%)."""
    return max(1.2, 0.45 * len((closing_text or "").split()) / 2.6)


def playback_complete(
    now: float,
    audio_received_since_goodbye_s: float,
    expected_audio_s: float,
    last_audio_chunk_at: float,
    queue_empty: bool,
    playback_end_at: float,
) -> bool:
    """True only when the closing audio has really been produced, sent and played out."""
    heard_enough = audio_received_since_goodbye_s >= expected_audio_s
    engine_quiet = now - last_audio_chunk_at > ENGINE_QUIET_SECONDS
    played_out = queue_empty and now >= playback_end_at + PLAYBACK_TAIL_SECONDS
    return heard_enough and engine_quiet and played_out
