import asyncio
from types import SimpleNamespace

from app.models.voice_credentials import ResolvedVoiceProfile
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.providers.pipeline.client import PipelineVoiceClient
from app.voice_stack.client_factory import (
    backchannel_allowed,
    build_voice_client,
    engine_of,
    filler_behavior,
    select_voice_engine,
)

CARTESIA_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"


def _cfg(engine, provider="cartesia", voice=CARTESIA_ID):
    return SimpleNamespace(voice_engine=engine, voice=SimpleNamespace(provider=provider, voice=voice))


def _plan(plan):
    return ResolvedVoiceProfile(tts_engine="cartesia", engine_key="k", source="own", billed_to="org_own_key", voice_engine=plan)


def test_managed_default():
    assert select_voice_engine(_plan("managed"), SimpleNamespace(voice=None)) == "managed"
    assert select_voice_engine(_plan("managed"), _cfg("custom")) == "managed"  # org plan wins over the agent field


def test_custom_with_cartesia_voice():
    assert select_voice_engine(_plan("custom"), _cfg("managed")) == "custom"  # agent field no longer consulted


def test_custom_with_non_cartesia_voice_is_managed():
    assert select_voice_engine(_plan("custom"), _cfg("custom", "deepgram", "aura-2-thalia-en")) == "managed"


def test_engine_of_clients():
    profile = ResolvedVoiceProfile(tts_engine="cartesia", engine_key="k", tts_key="t", source="platform", billed_to="platform", custom_pipeline_allowed=True)
    p = PipelineVoiceClient.__new__(PipelineVoiceClient)
    d = DeepgramVoiceAgentClient(api_key="k")
    assert engine_of(p) == "custom"
    assert engine_of(d) == "managed"
    assert filler_behavior(p) == "default"
    assert filler_behavior(d) == "queue"
    assert profile


def test_fallback_is_tagged_managed(monkeypatch):
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_KEY", raising=False)
    profile = ResolvedVoiceProfile(tts_engine="cartesia", engine_key="k", tts_key="t", source="platform", billed_to="platform", custom_pipeline_allowed=True)
    client = asyncio.run(build_voice_client("o", profile=profile, engine="custom"))
    assert engine_of(client) == "managed"


# ---------------- final fix wave: no pipeline import for Standard calls ----------------
def test_engine_marker_on_fakes():
    marked = SimpleNamespace(VOICE_ENGINE="custom")
    plain = SimpleNamespace()
    assert engine_of(marked) == "custom" and filler_behavior(marked) == "default"
    assert engine_of(plain) == "managed" and filler_behavior(plain) == "queue"
    assert PipelineVoiceClient.VOICE_ENGINE == "custom"


def test_standard_engine_checks_do_not_import_the_pipeline():
    import subprocess
    import sys
    from pathlib import Path
    code = "; ".join([
        "import sys",
        "from types import SimpleNamespace",
        "from app.voice_stack.client_factory import engine_of, filler_behavior",
        "assert engine_of(SimpleNamespace()) == 'managed'",
        "assert filler_behavior(SimpleNamespace()) == 'queue'",
        "bad = [m for m in sys.modules if m.startswith('app.providers.pipeline')]",
        "assert not bad, bad",
    ])
    backend = Path(__file__).resolve().parents[1]
    r = subprocess.run([sys.executable, "-c", code], cwd=str(backend), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]


def test_backchannel_allowed_only_on_standard():
    assert backchannel_allowed(SimpleNamespace()) is True                      # Standard-shaped fake
    assert backchannel_allowed(SimpleNamespace(VOICE_ENGINE="managed")) is True
    assert backchannel_allowed(SimpleNamespace(VOICE_ENGINE="custom")) is False  # Economy-shaped fake
    assert backchannel_allowed(PipelineVoiceClient(profile=None)) is False


def test_gateway_backchannel_site_uses_helper():
    # the injection lives inside the gateway's call loop closure, so check the site in the source
    import inspect
    from app.voice import gateway
    src = inspect.getsource(gateway)
    assert "backchannel_allowed" in gateway.__dict__
    site = src.index("Injecting backchannel cue")
    guard = src.rindex("if ", 0, site)
    assert "backchannel_allowed(deepgram_client)" in src[guard:site]
    assert 'inject_agent_message(norm_bc, behavior="queue")' in src[site:site + 300]


# ---- fix wave 3: a queued goodbye after a long paced reply (Economy) ----
from app.voice.call_ending import (  # noqa: E402
    closing_audio_heard_s, closing_hard_stop, goodbye_start_wait_s, playback_complete,
)


def test_standard_closing_helpers_match_the_old_formulas():
    now = 1000.0
    for remaining in (0.0, 3.0, 30.0):
        assert goodbye_start_wait_s(False, now, now + 12.0, now + remaining) == max(0.5, min(8.0, remaining))
    assert closing_hard_stop(False, now, 25.0, now + 12.0, None) == now + 25.0
    assert closing_hard_stop(False, now, 25.0, now + 12.0, now + 10.0) == now + 10.0
    assert closing_audio_heard_s(False, 50.0, 40.0, None) == 10.0
    assert closing_audio_heard_s(False, 50.0, 40.0, 45.0) == 10.0  # Standard ignores the goodbye start


def test_economy_waits_for_the_reply_then_counts_only_goodbye_audio():
    now = 1000.0
    reply_left = 11.0  # a long reply still playing, the goodbye queued behind it
    hard_stop = closing_hard_stop(True, now, 25.0, now + reply_left, None)
    assert hard_stop == now + 25.0 + reply_left
    assert closing_hard_stop(True, now, 25.0, now + reply_left, now + 20.0) == now + 20.0  # max-duration bound
    assert goodbye_start_wait_s(True, now, now + reply_left, hard_stop) == reply_left + 8.0
    assert goodbye_start_wait_s(True, now, now - 5.0, hard_stop) == 8.0
    # before the goodbye starts, paced reply audio does not count as goodbye audio
    assert closing_audio_heard_s(True, 52.0, 40.0, None) == 0.0
    # once it starts, only audio after the start counts
    assert closing_audio_heard_s(True, 53.0, 40.0, 51.0) == 2.0


def test_economy_hangup_waits_for_whole_goodbye():
    # reply finished handing out at t=10 (engine quiet by t=11.2); goodbye starts at t=11.5 and is 3 s long
    expected = 2.0
    t = 11.3
    heard = closing_audio_heard_s(True, 20.0, 5.0, None)  # 15 s of reply audio arrived after the injection
    assert not playback_complete(t, heard, expected, 10.0, True, 11.0)
    # goodbye fully handed (paced) by 14.2, played out at 14.5
    heard = closing_audio_heard_s(True, 23.0, 5.0, 20.0)
    assert not playback_complete(14.3, heard, expected, 14.2, True, 14.5)
    assert playback_complete(15.5, heard, expected, 14.2, True, 14.5)
