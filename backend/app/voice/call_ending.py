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


# The Economy engine paces its audio in real time, so a goodbye queued behind a long reply only starts once the
# reply has played. These helpers keep the Standard formulas unchanged (custom=False) and, for Economy, wait for the
# reply first and count only the goodbye's own audio.
GOODBYE_START_WAIT_SECONDS = 8.0


def closing_hard_stop(custom: bool, now: float, max_wait: float, speech_done_at: float, deadline_at=None) -> float:
    """Latest hang-up time: Economy adds the reply playback still ahead; always bounded by the max-duration deadline."""
    stop = now + max_wait
    if custom:
        stop += max(0.0, speech_done_at - now)
    return stop if deadline_at is None else min(stop, deadline_at)


def goodbye_start_wait_s(custom: bool, now: float, speech_done_at: float, hard_stop: float) -> float:
    """How long to wait for the closing message to start speaking."""
    wait = GOODBYE_START_WAIT_SECONDS
    if custom:
        wait += max(0.0, speech_done_at - now)
    return max(0.5, min(wait, hard_stop - now))


def closing_audio_heard_s(custom: bool, total_audio_s: float, audio_before_s: float, goodbye_start_audio_s=None) -> float:
    """Closing audio received so far. Economy counts from the moment the goodbye started (nothing before it)."""
    if not custom:
        return total_audio_s - audio_before_s
    if goodbye_start_audio_s is None:
        return 0.0
    return total_audio_s - goodbye_start_audio_s
