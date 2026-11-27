"""PipelineVoiceClient with fake speech-to-text, language model and voice (no network, no wall-clock sleeps)."""
import asyncio
import json

import pytest

from app.models.voice_credentials import ResolvedVoiceProfile
from app.providers.deepgram.configuration import (
    DeepgramAgentConfig, DeepgramAgentContext, DeepgramSettingsConfiguration, DeepgramSpeakConfig,
    DeepgramSpeakProvider, DeepgramThinkConfig,
)
from app.providers.pipeline import client as pc
from app.providers.pipeline.client import PipelineVoiceClient
from app.providers.pipeline.llm import Finished, LlmTimeout, LlmUnavailable, TextDelta, ToolCall
from app.providers.pipeline.tts import TtsUnavailable
from app.voice_stack.protocol import VoiceClientProtocol

APOLOGY = "માફ કરજો, થોડી વાર લાગે છે. ફરીથી કહેશો?"
VENDORS = ("deepgram", "cartesia", "openai", "azure")


# ---------------- fakes ----------------
class FakeSTT:
    def __init__(self):
        self.connected = 0
        self.audio = []
        self.closed = 0

    async def connect(self):
        self.connected += 1

    async def send_audio(self, chunk):
        self.audio.append(chunk)

    async def close(self):
        self.closed += 1


class FakeLLM:
    """Each stream() call plays the next script: a list of events, exceptions to raise, or asyncio.Events to wait on."""

    def __init__(self, *scripts):
        self.scripts = list(scripts)
        self.requests = []
        self.closed = 0

    def stream(self, messages, tools, *, temperature, max_tokens):
        self.requests.append([dict(m) for m in messages])
        script = self.scripts.pop(0) if self.scripts else [TextDelta("ઠીક છે.")]
        return self._gen(script)

    async def _gen(self, script):
        try:
            for item in script:
                if isinstance(item, asyncio.Event):
                    await item.wait()
                elif isinstance(item, BaseException):
                    raise item
                else:
                    yield item
            yield Finished(10, 5, 0)
        finally:
            self.closed += 1


class FakeTTS:
    def __init__(self, fail=(), gate_after_first=None, gates=None):
        self.fail = set(fail)
        self.gate = gate_after_first  # event the voice waits on after the first chunk
        self.gates = gates or {}      # per-sentence events, waited on after that sentence's first chunk
        self.spoken = []
        self.contexts = []
        self.cancelled = []
        self.closed = 0

    async def speak(self, text, *, context_id):
        self.contexts.append(context_id)
        self.spoken.append(text)
        if text in self.fail:
            raise TtsUnavailable("Voice engine service unavailable")
        yield (text + "#1").encode()
        if self.gate is not None:
            await self.gate.wait()
        if text in self.gates:
            await self.gates[text].wait()
        yield (text + "#2").encode()

    async def cancel(self, context_id):
        self.cancelled.append(context_id)

    async def close(self):
        self.closed += 1


class Recorder:
    def __init__(self):
        self.calls = []
        self.events = []
        self.first_audio = asyncio.Event()

    def cbs(self):
        async def on_audio(b):
            self.calls.append(("audio", b))
            self.first_audio.set()

        async def on_event(t, d):
            self.events.append(t)

        async def on_transcript(role, text):
            self.calls.append(("transcript", role, text))

        async def on_user_speaking():
            self.calls.append(("user_speaking",))

        async def on_agent_thinking(d):
            self.calls.append(("thinking",))

        async def on_agent_speaking(d):
            self.calls.append(("agent_speaking",))

        async def on_agent_audio_done():
            self.calls.append(("audio_done",))

        async def on_error(msg):
            self.calls.append(("error", msg))

        return dict(on_audio=on_audio, on_event=on_event, on_transcript=on_transcript,
                    on_user_speaking=on_user_speaking, on_agent_thinking=on_agent_thinking,
                    on_agent_speaking=on_agent_speaking, on_agent_audio_done=on_agent_audio_done, on_error=on_error)

    def count(self, kind):
        return sum(1 for c in self.calls if c[0] == kind)


def profile():
    return ResolvedVoiceProfile(tts_engine="sonic", engine_key="ek", tts_key="tk", source="platform",
                                billed_to="platform", custom_pipeline_allowed=True)


def settings(prompt="SYSTEM PROMPT", speak_type="cartesia", context=None, functions=None):
    return DeepgramSettingsConfiguration(agent=DeepgramAgentConfig(
        think=DeepgramThinkConfig(prompt=prompt, functions=functions or []),
        speak=DeepgramSpeakConfig(provider=DeepgramSpeakProvider(
            type=speak_type, model_id="sonic-3", voice={"mode": "id", "id": "v1"}, language="gu")),
        context=DeepgramAgentContext(messages=context) if context else None,
    ))


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


class FakeSleep:
    """Records requested durations; every sleeper wakes when `release` is set."""

    def __init__(self):
        self.calls = []
        self.release = asyncio.Event()

    async def __call__(self, seconds):
        self.calls.append(seconds)
        await self.release.wait()


class PlaybackSleep:
    """Playback pacing waits: advance the fake clock by the requested time (audio plays in fake time)."""

    def __init__(self, clock):
        self.clock = clock
        self.calls = []

    async def __call__(self, seconds):
        self.calls.append(seconds)
        self.clock.now += seconds
        await asyncio.sleep(0)


async def make(llm=None, tts=None, greeting=None, s=None, clock=None, sleep=None, playback_sleep=None):
    rec = Recorder()
    stt = FakeSTT()
    clock = clock or FakeClock()
    client = PipelineVoiceClient(profile=profile(), stt=stt, llm=llm or FakeLLM(), tts=tts or FakeTTS(),
                                 clock=clock, sleep=sleep or FakeSleep(),
                                 playback_sleep=playback_sleep or PlaybackSleep(clock), **rec.cbs())
    assert await client.connect_and_configure(s or settings(), greeting=greeting)
    await settle(client)
    return client, rec, stt


async def settle(client):
    for _ in range(50):
        pending = [t for t in (*client._speech_tasks, *client._aux_tasks) if not t.done()]
        if not pending:
            await asyncio.sleep(0)
            return
        await asyncio.gather(*pending, return_exceptions=True)


async def caller_says(client, text):
    await client._on_speech_started()
    await client._on_stt_transcript(text, True, True)


def no_vendor(text):
    return not any(v in text.lower() for v in VENDORS)


# ---------------- (a) full turn ----------------
@pytest.mark.asyncio
async def test_a_full_turn_callbacks_in_order():
    llm = FakeLLM([TextDelta("નમસ્તે "), TextDelta("રાજ. કેમ"), TextDelta(" છો?")])
    client, rec, _ = await make(llm=llm)
    assert "SettingsApplied" in rec.events
    await caller_says(client, "મારું નામ રાજ છે")
    await settle(client)
    assert rec.calls == [
        ("user_speaking",),
        ("transcript", "user", "મારું નામ રાજ છે"),
        ("thinking",),
        ("agent_speaking",),
        ("transcript", "assistant", "નમસ્તે રાજ."),
        ("audio", "નમસ્તે રાજ.#1".encode()),
        ("audio", "નમસ્તે રાજ.#2".encode()),
        ("transcript", "assistant", "કેમ છો?"),
        ("audio", "કેમ છો?#1".encode()),
        ("audio", "કેમ છો?#2".encode()),
        ("audio_done",),
    ]
    assert llm.requests[0][0] == {"role": "system", "content": "SYSTEM PROMPT"}
    assert client._history == [
        {"role": "user", "content": "મારું નામ રાજ છે"},
        {"role": "assistant", "content": "નમસ્તે રાજ. કેમ છો?"},
    ]
    assert llm.closed == 1


@pytest.mark.asyncio
async def test_flush_speaks_text_without_sentence_end_and_contexts_are_unique():
    llm = FakeLLM([TextDelta("એક. બે")], [TextDelta("એક.")])
    tts = FakeTTS()
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "પહેલું વાક્ય")
    await settle(client)
    await caller_says(client, "બીજું વાક્ય")
    await settle(client)
    assert tts.spoken == ["એક.", "બે", "એક."]
    assert len(set(tts.contexts)) == 3


# ---------------- (b)(c)(d) tools ----------------
@pytest.mark.asyncio
async def test_b_tool_round_trip():
    args = json.dumps({"spoken": "બાવીસ મે બે હજાર પાંચ"})
    llm = FakeLLM([ToolCall("c1", "parse_birth_date", args)], [TextDelta("તમારી તારીખ બરાબર છે?")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "મારી જન્મ તારીખ બાવીસ મે બે હજાર પાંચ")
    await settle(client)
    second = llm.requests[1]
    assert second[-2]["role"] == "assistant" and second[-2]["tool_calls"][0]["id"] == "c1"
    assert second[-1]["role"] == "tool" and second[-1]["tool_call_id"] == "c1"
    assert "confirm" in second[-1]["content"]
    assert ("transcript", "assistant", "તમારી તારીખ બરાબર છે?") in rec.calls
    assert client.numerology_state is client._numerology_state


@pytest.mark.asyncio
async def test_c_raising_function_still_answered(monkeypatch):
    from app.numerology import tools

    def boom(*a, **k):
        raise RuntimeError("bug")

    monkeypatch.setattr(tools, "run_function", boom)
    llm = FakeLLM([ToolCall("c1", "parse_birth_date", "{}")], [TextDelta("ફરી કહેશો?")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "મારી જન્મ તારીખ")
    await settle(client)
    tool_msg = llm.requests[1][-1]
    assert tool_msg["role"] == "tool" and "could not be done" in tool_msg["content"]
    assert rec.calls[-1] == ("audio_done",)


@pytest.mark.asyncio
async def test_unknown_function_answered():
    llm = FakeLLM([ToolCall("c1", "nope", "{}")], [TextDelta("ઠીક.")])
    client, _, _ = await make(llm=llm)
    await caller_says(client, "કંઈક કરો")
    await settle(client)
    assert llm.requests[1][-1]["content"] == "Unknown function."


@pytest.mark.asyncio
async def test_d_fifth_tool_round_refused():
    llm = FakeLLM(*[[ToolCall(f"c{i}", "nope", "{}")] for i in range(6)])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "કંઈક કરો")
    await settle(client)
    assert len(llm.requests) == 5
    assert sum(1 for m in client._history if m["role"] == "tool") == 4
    assert ("transcript", "assistant", pc.TOOL_LIMIT_LINE) in rec.calls
    # every recorded tool call has its answer right after it (the history stays a valid request)
    for i, m in enumerate(client._history):
        if m.get("tool_calls"):
            assert client._history[i + 1]["tool_call_id"] == m["tool_calls"][0]["id"]
    assert client._history[-1] == {"role": "assistant", "content": pc.TOOL_LIMIT_LINE}


# ---------------- (e)(f)(j) barge-in ----------------
@pytest.mark.asyncio
async def test_e_j_barge_in_cancels_model_and_voice_and_stops_audio():
    never = asyncio.Event()
    gate = asyncio.Event()
    llm = FakeLLM([TextDelta("પહેલું વાક્ય. "), never, TextDelta("બીજું વાક્ય.")])
    tts = FakeTTS(gate_after_first=gate)
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "મારે માહિતી જોઈએ")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    speaking_before = rec.count("user_speaking")

    await client._on_speech_started()
    assert rec.count("user_speaking") == speaking_before  # deferred while the agent talks
    await client._on_stt_transcript("ના ના રાહ જુઓ", False, False)
    audio_at_interrupt = rec.count("audio")

    await settle(client)
    gate.set()
    never.set()
    await settle(client)
    assert llm.closed == 1
    assert tts.cancelled == [tts.contexts[0]]
    assert rec.count("audio") == audio_at_interrupt == 1
    assert rec.count("user_speaking") == speaking_before + 1
    assert all("વાક્ય" not in (m.get("content") or "") for m in client._history)
    assert "બીજું વાક્ય." not in tts.spoken

    # the caller's words become the next turn
    await client._on_stt_transcript("ના ના રાહ જુઓ", True, True)
    await settle(client)
    assert client._history[-2] == {"role": "user", "content": "ના ના રાહ જુઓ"}


@pytest.mark.asyncio
async def test_f_lone_backchannel_does_not_interrupt():
    # a lone backchannel in the middle of a longer reply neither interrupts nor becomes a turn
    g1 = asyncio.Event()
    clock = FakeClock()
    llm = FakeLLM([TextDelta("પહેલું વાક્ય. બીજું વાક્ય.")])
    tts = FakeTTS(gates={"પહેલું વાક્ય.": g1})
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock)
    await caller_says(client, "મારે માહિતી જોઈએ")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    users = rec.count("user_speaking")
    clock.now = 1.0
    await client._on_speech_started()
    await client._on_stt_transcript("હા", True, True)
    await client._on_utterance_end()
    assert tts.cancelled == [] and rec.count("user_speaking") == users
    clock.now = 2.0
    g1.set()
    await settle(client)
    assert rec.count("audio") == 4 and rec.calls[-1] == ("audio_done",)
    assert client._history[-1] == {"role": "assistant", "content": "પહેલું વાક્ય. બીજું વાક્ય."}
    assert len(llm.requests) == 1


# ---------------- (g) model failures ----------------
@pytest.mark.asyncio
async def test_g_llm_timeout_speaks_apology_and_stays_usable():
    llm = FakeLLM([LlmTimeout("x")], [TextDelta("હવે બરાબર.")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "પહેલો પ્રશ્ન")
    await settle(client)
    assert ("transcript", "assistant", APOLOGY) in rec.calls
    assert client.is_ready
    await caller_says(client, "બીજો પ્રશ્ન")
    await settle(client)
    assert ("transcript", "assistant", "હવે બરાબર.") in rec.calls
    users = [m["content"] for m in llm.requests[1] if m["role"] == "user"]
    assert users == ["પહેલો પ્રશ્ન", "બીજો પ્રશ્ન"]  # the failed turn is retried with the next one


@pytest.mark.asyncio
async def test_mid_stream_unavailable_drops_pending_tool_call():
    llm = FakeLLM([TextDelta("એક મિનિટ. "), ToolCall("c1", "nope", "{}"), LlmUnavailable("x")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert len(llm.requests) == 1
    assert not any(m.get("tool_calls") or m["role"] == "tool" for m in client._history)
    assert client._history[-1] == {"role": "assistant", "content": APOLOGY}
    assert client.is_ready


# ---------------- voice failures ----------------
@pytest.mark.asyncio
async def test_one_failed_sentence_is_skipped():
    llm = FakeLLM([TextDelta("ખરાબ. સારું.")])
    client, rec, _ = await make(llm=llm, tts=FakeTTS(fail={"ખરાબ."}))
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert client.is_ready and rec.count("error") == 0
    assert client._history[-1] == {"role": "assistant", "content": "સારું."}


@pytest.mark.asyncio
async def test_two_consecutive_voice_failures_end_the_engine():
    llm = FakeLLM([TextDelta("ખરાબ. બીજું ખરાબ.")])
    client, rec, _ = await make(llm=llm, tts=FakeTTS(fail={"ખરાબ.", "બીજું ખરાબ."}))
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert ("error", "Voice engine unavailable") in rec.calls
    assert not client.is_ready


@pytest.mark.asyncio
async def test_stt_lost_reports_and_not_ready():
    client, rec, _ = await make()
    await client._on_stt_lost("listening connection lost twice")
    assert not client.is_ready
    errors = [c[1] for c in rec.calls if c[0] == "error"]
    assert len(errors) == 1 and no_vendor(errors[0])


# ---------------- (h) injection ----------------
@pytest.mark.asyncio
async def test_h_inject_interrupt_cancels_and_speaks():
    gate = asyncio.Event()
    llm = FakeLLM([TextDelta("લાંબો જવાબ.")])
    tts = FakeTTS(gate_after_first=gate)
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    tts.gate = None
    await client.inject_agent_message("આવજો.", "interrupt")
    await settle(client)
    gate.set()
    await settle(client)
    assert tts.cancelled == [tts.contexts[0]]
    assert ("transcript", "assistant", "આવજો.") in rec.calls
    assert client._history[-1] == {"role": "assistant", "content": "આવજો."}
    assert not any(m.get("content") == "લાંબો જવાબ." for m in client._history)
    assert ("audio", "લાંબો જવાબ.#2".encode()) not in rec.calls


@pytest.mark.asyncio
async def test_inject_queue_waits_for_current_sentence():
    gate = asyncio.Event()
    tts = FakeTTS(gate_after_first=gate)
    client, rec, _ = await make(llm=FakeLLM([TextDelta("પહેલું.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    await client.inject_agent_message("પછી.", "queue")
    gate.set()
    await settle(client)
    assert tts.cancelled == [] and tts.spoken == ["પહેલું.", "પછી."]


@pytest.mark.asyncio
async def test_inject_user_message_starts_a_turn():
    llm = FakeLLM([TextDelta("જવાબ.")])
    client, rec, _ = await make(llm=llm)
    await client.inject_user_message("ટેક્સ્ટ પ્રશ્ન")
    await settle(client)
    assert client._history == [{"role": "user", "content": "ટેક્સ્ટ પ્રશ્ન"}, {"role": "assistant", "content": "જવાબ."}]


# ---------------- (i) close ----------------
@pytest.mark.asyncio
async def test_i_close_twice_is_safe():
    client, _, stt = await make()
    await client.close()
    await client.close()
    assert stt.closed == 1 and client._tts.closed == 1 and not client.is_ready


@pytest.mark.asyncio
async def test_close_from_inside_a_callback():
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક. બે.")]))

    async def closing_audio(b):
        rec.calls.append(("audio", b))
        await client.close()

    client.on_audio = closing_audio
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(settle(client), 2)
    assert rec.count("audio") == 1 and not client.is_ready


# ---------------- setup ----------------
@pytest.mark.asyncio
async def test_greeting_is_spoken_and_recorded():
    client, rec, _ = await make(greeting="નમસ્તે, હું મદદ કરીશ.")
    assert ("transcript", "assistant", "નમસ્તે, હું મદદ કરીશ.") in rec.calls
    assert client._history == [{"role": "assistant", "content": "નમસ્તે, હું મદદ કરીશ."}]


@pytest.mark.asyncio
async def test_preplayed_greeting_history_is_seeded_and_not_spoken():
    tts = FakeTTS()
    s = settings(context=[{"type": "History", "role": "assistant", "content": "પહેલેથી વાગેલું સ્વાગત."}])
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, _, _ = await make(llm=llm, tts=tts, s=s)
    assert tts.spoken == []
    await caller_says(client, "હેલો ત્યાં")
    await settle(client)
    assert llm.requests[0][1] == {"role": "assistant", "content": "પહેલેથી વાગેલું સ્વાગત."}


@pytest.mark.asyncio
async def test_non_sonic_voice_rejected_with_neutral_error():
    c = PipelineVoiceClient(profile=profile(), stt=FakeSTT(), llm=FakeLLM(), tts=FakeTTS())
    with pytest.raises(ValueError) as e:
        await c.connect_and_configure(settings(speak_type="deepgram"))
    assert no_vendor(str(e.value))


@pytest.mark.asyncio
async def test_stt_connect_failure_is_neutral():
    stt = FakeSTT()

    async def fail():
        raise OSError("refused by api.deepgram.com")

    stt.connect = fail
    rec = Recorder()
    c = PipelineVoiceClient(profile=profile(), stt=stt, llm=FakeLLM(), tts=FakeTTS(), **rec.cbs())
    with pytest.raises(ConnectionError) as e:
        await c.connect_and_configure(settings())
    assert no_vendor(str(e.value)) and all(no_vendor(c_[1]) for c_ in rec.calls if c_[0] == "error")
    assert not c.is_ready


@pytest.mark.asyncio
async def test_update_prompt_applies_to_later_requests_and_prefix_is_stable():
    llm = FakeLLM([TextDelta("એક.")], [TextDelta("બે.")], [TextDelta("ત્રણ.")])
    client, _, _ = await make(llm=llm)
    await caller_says(client, "પહેલું વાક્ય")
    await settle(client)
    await caller_says(client, "બીજું વાક્ય")
    await settle(client)
    assert llm.requests[0][0] == llm.requests[1][0]
    assert await client.update_prompt("NEW PROMPT") is True
    assert await client.update_prompt_and_wait_ack("NEW PROMPT") is True
    await caller_says(client, "ત્રીજું વાક્ય")
    await settle(client)
    assert llm.requests[2][0] == {"role": "system", "content": "NEW PROMPT"}


@pytest.mark.asyncio
async def test_send_audio_forwards_when_ready():
    client, _, stt = await make()
    await client.send_audio(b"\xff" * 160)
    assert stt.audio == [b"\xff" * 160]
    assert client.session_id


def test_protocol_conformance():
    c = PipelineVoiceClient(profile=profile(), stt=FakeSTT(), llm=FakeLLM(), tts=FakeTTS())
    assert isinstance(c, VoiceClientProtocol)


# ---------------- fix round 1 ----------------
async def until(pred, n=500):
    for _ in range(n):
        if pred():
            return
        await asyncio.sleep(0)
    raise AssertionError("condition never became true")


def assistant_lines(rec):
    return [c[2] for c in rec.calls if c[0] == "transcript" and c[1] == "assistant"]


class ValidatingLLM(FakeLLM):
    """Rejects a request whose history has an assistant tool_calls entry without all of its tool replies."""

    def stream(self, messages, tools, *, temperature, max_tokens):
        for i, m in enumerate(messages):
            if m.get("tool_calls"):
                ids = {c["id"] for c in m["tool_calls"]}
                replies = set()
                for later in messages[i + 1:]:
                    if later.get("role") != "tool":
                        break
                    replies.add(later["tool_call_id"])
                if ids != replies:
                    raise AssertionError("dangling tool_calls in history")
        return super().stream(messages, tools, temperature=temperature, max_tokens=max_tokens)


def slow_answer(monkeypatch, gate):
    calls = []

    async def answer(name, arguments, *, state, knowledge_runner):
        calls.append(name)
        await gate.wait()
        return "done"

    monkeypatch.setattr(pc, "answer_function_call", answer)
    return calls


@pytest.mark.asyncio
async def test_cancel_during_tool_call_keeps_history_valid(monkeypatch):
    tool_gate = asyncio.Event()
    calls = slow_answer(monkeypatch, tool_gate)
    llm = ValidatingLLM([ToolCall("c1", "search_knowledge", "{}")], [TextDelta("બરાબર.")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "માહિતી શોધો")
    await until(lambda: calls)
    await client._on_speech_started()
    await client._on_stt_transcript("ના ના રાહ જુઓ", True, True)  # barge-in while the function runs
    await settle(client)
    assert len(llm.requests) == 2
    assert "બરાબર." in assistant_lines(rec)
    assert not any(m.get("tool_calls") or m.get("role") == "tool" for m in client._history)
    assert client._history[-1] == {"role": "assistant", "content": "બરાબર."}


@pytest.mark.asyncio
async def test_queued_injection_waits_for_the_whole_reply():
    gate = asyncio.Event()
    tts = FakeTTS(gate_after_first=gate)
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક. બે. ત્રણ.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    await client.inject_agent_message("આવજો.", "queue")
    gate.set()
    await settle(client)
    assert assistant_lines(rec) == ["એક.", "બે.", "ત્રણ.", "આવજો."]
    # the reply finishes (audio done) before the goodbye starts
    i_done = rec.calls.index(("audio_done",))
    assert i_done < rec.calls.index(("transcript", "assistant", "આવજો.")) and rec.calls[-1] == ("audio_done",)


@pytest.mark.asyncio
async def test_goodbye_survives_barge_in_and_caller_is_answered_after():
    gate = asyncio.Event()
    tts = FakeTTS(gates={"આવજો.": gate})
    llm = FakeLLM([TextDelta("ઠીક છે.")])
    client, rec, _ = await make(llm=llm, tts=tts)
    await client.inject_agent_message("આવજો.", "queue")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    await client._on_speech_started()
    await client._on_stt_transcript("ના ના રાહ જુઓ", True, True)
    for _ in range(20):
        await asyncio.sleep(0)
    assert tts.cancelled == [] and llm.requests == []  # goodbye keeps playing, caller's turn waits
    gate.set()
    await settle(client)
    assert ("audio", "આવજો.#2".encode()) in rec.calls
    i_bye = rec.calls.index(("audio", "આવજો.#2".encode()))
    i_user = rec.calls.index(("transcript", "user", "ના ના રાહ જુઓ"))
    assert i_bye < i_user
    assert assistant_lines(rec)[-1] == "ઠીક છે."
    assert len(llm.requests) == 1


@pytest.mark.asyncio
async def test_queued_goodbye_survives_barge_in_during_reply():
    gate = asyncio.Event()
    tts = FakeTTS(gate_after_first=gate)
    llm = FakeLLM([TextDelta("એક. બે.")], [TextDelta("જવાબ.")])
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    await client.inject_agent_message("આવજો.", "queue")
    await client._on_speech_started()
    await client._on_stt_transcript("ના ના રાહ જુઓ", True, True)
    gate.set()
    await settle(client)
    lines = assistant_lines(rec)
    assert "આવજો." in lines and "બે." not in lines
    assert lines.index("આવજો.") < lines.index("જવાબ.")


@pytest.mark.asyncio
async def test_injection_finishing_mid_reply_does_not_fire_audio_done():
    gate = asyncio.Event()
    tts = FakeTTS(gates={"એક.": gate})
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક. બે.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    await client.inject_agent_message("વચ્ચે.", "default")
    gate.set()
    await settle(client)
    assert "વચ્ચે." in assistant_lines(rec)
    assert rec.count("agent_speaking") == 1
    assert rec.count("audio_done") == 1 and rec.calls[-1] == ("audio_done",)


FILLER = "એક ક્ષણ, હું જોઉં છું."


@pytest.mark.asyncio
async def test_watchdog_filler_once_when_model_stalls():
    stall = asyncio.Event()
    sleep = FakeSleep()
    llm = FakeLLM([stall, TextDelta("જવાબ.")])
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: sleep.calls)
    assert sleep.calls == [3.5] and assistant_lines(rec) == []
    sleep.release.set()
    await until(lambda: FILLER in assistant_lines(rec))
    stall.set()
    await settle(client)
    assert assistant_lines(rec) == [FILLER, "જવાબ."]
    assert sleep.calls == [3.5]
    assert all(m.get("content") != FILLER for m in client._history)
    assert client._history[-1] == {"role": "assistant", "content": "જવાબ."}
    assert rec.count("agent_speaking") == 1 and rec.count("audio_done") == 1


@pytest.mark.asyncio
async def test_watchdog_silent_when_reply_already_speaking():
    gate = asyncio.Event()
    sleep = FakeSleep()
    client, rec, _ = await make(llm=FakeLLM([TextDelta("જવાબ.")]), tts=FakeTTS(gate_after_first=gate), sleep=sleep)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    sleep.release.set()
    for _ in range(20):
        await asyncio.sleep(0)
    gate.set()
    await settle(client)
    assert FILLER not in assistant_lines(rec)


@pytest.mark.asyncio
async def test_watchdog_silent_after_interruption():
    stall = asyncio.Event()
    sleep = FakeSleep()
    client, rec, _ = await make(llm=FakeLLM([stall, TextDelta("જવાબ.")]), sleep=sleep)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: sleep.calls)
    await client._on_speech_started()
    await client._on_stt_transcript("ના ના રાહ જુઓ", False, False)  # interruption, turn not complete yet
    sleep.release.set()
    stall.set()
    await settle(client)
    assert assistant_lines(rec) == []


@pytest.mark.asyncio
async def test_watchdog_filler_during_slow_tool_call(monkeypatch):
    tool_gate = asyncio.Event()
    calls = slow_answer(monkeypatch, tool_gate)
    sleep = FakeSleep()
    llm = ValidatingLLM([ToolCall("c1", "search_knowledge", "{}")], [TextDelta("મળી ગયું.")])
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await caller_says(client, "માહિતી શોધો")
    await until(lambda: calls)
    sleep.release.set()
    await until(lambda: FILLER in assistant_lines(rec))
    tool_gate.set()
    await settle(client)
    assert assistant_lines(rec) == [FILLER, "મળી ગયું."]
    assert all(m.get("content") != FILLER for m in client._history)


@pytest.mark.asyncio
async def test_model_timeout_bound_and_apology():
    assert pc.LLM_FIRST_TOKEN_TIMEOUT_S == 4.0
    client, rec, _ = await make(llm=FakeLLM([LlmTimeout("x")]))
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert assistant_lines(rec) == [APOLOGY]


@pytest.mark.asyncio
async def test_backchannel_during_final_sentence_is_answered():
    g2 = asyncio.Event()
    clock = FakeClock()
    llm = FakeLLM([TextDelta("એક. બે?")], [TextDelta("સરસ.")])
    tts = FakeTTS(gates={"બે?": g2})
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: "બે?" in assistant_lines(rec))
    clock.now = 1.0
    await client._on_speech_started()
    await client._on_stt_transcript("હા", True, True)
    assert tts.cancelled == []
    g2.set()
    await settle(client)
    assert len(llm.requests) == 2
    assert llm.requests[1][-1] == {"role": "user", "content": "હા"}
    assert assistant_lines(rec)[-1] == "સરસ."


@pytest.mark.asyncio
async def test_real_words_heard_during_reply_are_answered_after_it():
    g1 = asyncio.Event()
    clock = FakeClock()
    llm = FakeLLM([TextDelta("એક. બે.")], [TextDelta("સરસ.")])
    tts = FakeTTS(gates={"એક.": g1})
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock)
    await caller_says(client, "પ્રશ્ન")
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    clock.now = 1.0
    await client._on_speech_started()
    clock.now = 1.2
    await client._on_stt_transcript("કેમ", True, True)  # one short word: not an interruption
    assert tts.cancelled == []
    clock.now = 2.0
    g1.set()
    await settle(client)
    assert assistant_lines(rec)[:2] == ["એક.", "બે."]
    assert len(llm.requests) == 2 and llm.requests[1][-1] == {"role": "user", "content": "કેમ"}


# ---------------- final fix wave: unexpected errors apologise ----------------
class RaisingLLM(FakeLLM):
    """stream() itself raises `exc` on the first call; later calls follow the normal scripts."""

    def __init__(self, exc, *scripts):
        super().__init__(*scripts)
        self.exc = exc

    def stream(self, messages, tools, *, temperature, max_tokens):
        if self.exc is not None:
            exc, self.exc = self.exc, None
            self.requests.append([dict(m) for m in messages])
            raise exc
        return super().stream(messages, tools, temperature=temperature, max_tokens=max_tokens)


def history_is_valid(history):
    for i, m in enumerate(history):
        if m.get("tool_calls"):
            ids = [c["id"] for c in m["tool_calls"]]
            answers = [h.get("tool_call_id") for h in history[i + 1: i + 1 + len(ids)]]
            if answers != ids:
                return False
    return True


@pytest.mark.asyncio
@pytest.mark.parametrize("exc", [RuntimeError("x"), KeyError("k"), AttributeError("a")])
async def test_unexpected_model_error_apologises_once_and_next_turn_works(exc):
    llm = RaisingLLM(exc, [TextDelta("હવે બરાબર.")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "પહેલો પ્રશ્ન")
    await settle(client)
    assert rec.calls.count(("transcript", "assistant", APOLOGY)) == 1
    assert rec.count("audio_done") == 1 and rec.calls[-1] == ("audio_done",)
    assert client.is_ready
    assert history_is_valid(client._history)
    await caller_says(client, "બીજો પ્રશ્ન")
    await settle(client)
    assert ("transcript", "assistant", "હવે બરાબર.") in rec.calls
    assert rec.calls.count(("transcript", "assistant", APOLOGY)) == 1


@pytest.mark.asyncio
async def test_unexpected_error_inside_stream_apologises():
    llm = FakeLLM([TypeError("bad shape")], [TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert rec.calls.count(("transcript", "assistant", APOLOGY)) == 1
    assert rec.calls[-1] == ("audio_done",)


@pytest.mark.asyncio
async def test_tool_answer_raising_apologises_and_history_stays_valid(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("tool bug")

    monkeypatch.setattr(pc, "answer_function_call", boom)
    llm = FakeLLM([ToolCall("c1", "nope", "{}")], [TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "કંઈક કરો")
    await settle(client)
    assert rec.calls.count(("transcript", "assistant", APOLOGY)) == 1
    assert rec.calls[-1] == ("audio_done",)
    assert history_is_valid(client._history)
    assert not any(m.get("tool_calls") or m["role"] == "tool" for m in client._history)
    monkeypatch.undo()
    await caller_says(client, "ફરી")
    await settle(client)
    assert ("transcript", "assistant", "ઠીક.") in rec.calls


@pytest.mark.asyncio
async def test_error_after_speech_does_not_apologise_on_top():
    llm = FakeLLM([TextDelta("પહેલું વાક્ય. "), RuntimeError("late")])
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert ("transcript", "assistant", "પહેલું વાક્ય.") in rec.calls
    assert ("transcript", "assistant", APOLOGY) not in rec.calls
    assert rec.count("audio_done") == 1 and rec.calls[-1] == ("audio_done",)
    assert client._history[-1] == {"role": "assistant", "content": "પહેલું વાક્ય."}
    assert client.is_ready


@pytest.mark.asyncio
async def test_unexpected_error_log_has_type_only(caplog):
    import logging
    caplog.set_level(logging.DEBUG)
    llm = RaisingLLM(RuntimeError("secret-detail-ek"))
    client, rec, _ = await make(llm=llm)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert "RuntimeError" in caplog.text
    assert "secret-detail-ek" not in caplog.text
    assert no_vendor(caplog.text)


# ---------------- final fix wave: deployment name logged, key alias ----------------
@pytest.mark.asyncio
async def test_build_uses_org_llm_settings_and_logs_deployment(monkeypatch, caplog):
    # adapted: the stream is built from the organization settings on the profile; the environment is ignored
    import logging
    caplog.set_level(logging.INFO)
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://env.test")
    monkeypatch.setenv("AZURE_OPENAI_KEY", "env-secret")
    monkeypatch.setenv("AZURE_OPENAI_VOICE_DEPLOYMENT_NAME", "env-dep")
    prof = profile()
    prof.llm_endpoint, prof.llm_api_key, prof.llm_deployment = "https://org.test", "org-secret", "voice-dep-1"
    rec = Recorder()
    client = PipelineVoiceClient(profile=prof, stt=FakeSTT(), tts=FakeTTS(), clock=FakeClock(),
                                 sleep=FakeSleep(), **rec.cbs())
    assert await client.connect_and_configure(settings())
    assert client._llm._api_key == "org-secret" and client._llm._endpoint == "https://org.test"
    assert "voice-dep-1" in caplog.text
    assert "org-secret" not in caplog.text and "env-secret" not in caplog.text
    await client.close()


# ---------------- real-time playback pacing ----------------
class SizedTTS:
    """Each sentence is `seconds` of audio in 0.1 s chunks (800 mu-law bytes); optional gate after `gate_at` chunks."""

    def __init__(self, seconds, gate=None, gate_at=None):
        self.seconds = seconds
        self.gate, self.gate_at = gate, gate_at
        self.spoken, self.contexts, self.cancelled = [], [], []

    async def speak(self, text, *, context_id):
        self.spoken.append(text)
        self.contexts.append(context_id)
        for i in range(round(self.seconds.get(text, 1.0) * 10)):
            if self.gate is not None and i == self.gate_at and text == self.spoken[0]:
                await self.gate.wait()
            yield bytes(800)

    async def cancel(self, context_id):
        self.cancelled.append(context_id)

    async def close(self):
        pass


def timed(client, clock, rec):
    """Records (kind, clock time) for audio chunks and AgentAudioDone."""
    log = []

    async def on_audio(b):
        log.append(("audio", clock.now))
        rec.first_audio.set()

    async def on_done():
        log.append(("done", clock.now))

    client.on_audio, client.on_agent_audio_done = on_audio, on_done
    return log


@pytest.mark.asyncio
async def test_pacing_three_seconds_handed_out_in_real_time():
    clock = FakeClock()
    client, rec, _ = await make(llm=FakeLLM([TextDelta("લાંબું વાક્ય.")]), tts=SizedTTS({"લાંબું વાક્ય.": 3.0}),
                                clock=clock)
    log = timed(client, clock, rec)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    audio = [t for k, t in log if k == "audio"]
    assert len(audio) == 30 and audio[0] == 0.0
    assert audio[-1] == pytest.approx(2.6)  # handed out over about 2.7 s, never more than 0.3 s ahead
    assert all(t >= i * 0.1 - pc.PLAYBACK_LEAD_S - 1e-9 for i, t in enumerate(audio))
    assert log[-1] == ("done", pytest.approx(3.0))  # AgentAudioDone when the audio has finished playing
    assert sum(1 for k, _ in log if k == "done") == 1
    assert pc.PLAYBACK_LEAD_S == 0.3


@pytest.mark.asyncio
async def test_pacing_two_sentences_one_continuous_timeline():
    clock = FakeClock()
    tts = SizedTTS({"એક વાક્ય.": 1.0, "બીજું વાક્ય.": 1.0})
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક વાક્ય. બીજું વાક્ય.")]), tts=tts, clock=clock)
    log = timed(client, clock, rec)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    audio = [t for k, t in log if k == "audio"]
    assert len(audio) == 20
    assert audio[10] == pytest.approx(0.7)  # second sentence's first chunk plays at 1.0, handed 0.3 s early
    assert client._play_until == pytest.approx(2.0)  # no gap, no overlap
    assert log[-1] == ("done", pytest.approx(2.0))
    assert client._history[-1] == {"role": "assistant", "content": "એક વાક્ય. બીજું વાક્ય."}


@pytest.mark.asyncio
async def test_pacing_barge_in_stops_audio_and_resets_timeline():
    clock = FakeClock()
    gate = asyncio.Event()
    tts = SizedTTS({"લાંબું વાક્ય.": 2.0, "જવાબ.": 1.0}, gate=gate, gate_at=10)
    llm = FakeLLM([TextDelta("લાંબું વાક્ય.")], [TextDelta("જવાબ.")])
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock)
    log = timed(client, clock, rec)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: sum(1 for k, _ in log if k == "audio") == 10)
    await asyncio.sleep(0)
    at = clock.now
    assert at == pytest.approx(0.6) and client._play_until == pytest.approx(1.0)
    await client._on_speech_started()
    await client._on_stt_transcript("ના ના રાહ જુઓ", False, False)
    assert client._play_until == at  # the old timeline is dropped at once
    handed = len(log)
    gate.set()
    await settle(client)
    assert len(log) == handed  # nothing more of the interrupted sentence
    await client._on_stt_transcript("ના ના રાહ જુઓ", True, True)
    await settle(client)
    new = [t for k, t in log[handed:] if k == "audio"]
    assert len(new) == 10 and new[0] == pytest.approx(at)  # starts from now, not from the old 1.0
    assert log[-1] == ("done", pytest.approx(at + 1.0))
    assert "લાંબું વાક્ય." not in " ".join(m.get("content") or "" for m in client._history)


@pytest.mark.asyncio
async def test_pacing_protected_goodbye_plays_completely_and_paced():
    clock = FakeClock()
    tts = SizedTTS({"આવજો.": 2.0})
    client, rec, _ = await make(tts=tts, clock=clock)
    log = timed(client, clock, rec)
    await client.inject_agent_message("આવજો.", behavior="interrupt")
    await until(lambda: sum(1 for k, _ in log if k == "audio") == 5)
    client._interrupt()  # a barge-in never cuts the protected goodbye
    await settle(client)
    audio = [t for k, t in log if k == "audio"]
    assert len(audio) == 20 and audio[-1] == pytest.approx(1.6)
    assert log[-1] == ("done", pytest.approx(2.0))


@pytest.mark.asyncio
async def test_pacing_watchdog_filler_is_paced():
    clock = FakeClock()
    stall = asyncio.Event()
    sleep = FakeSleep()
    tts = SizedTTS({FILLER: 1.0, "જવાબ.": 1.0})
    client, rec, _ = await make(llm=FakeLLM([stall, TextDelta("જવાબ.")]), tts=tts, clock=clock, sleep=sleep)
    log = timed(client, clock, rec)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: sleep.calls)
    sleep.release.set()
    await until(lambda: sum(1 for k, _ in log if k == "audio") == 10)
    stall.set()
    await settle(client)
    audio = [t for k, t in log if k == "audio"]
    assert len(audio) == 20
    assert audio[9] == pytest.approx(0.6)   # filler handed out in real time
    assert audio[10] == pytest.approx(0.7)  # the reply follows it on one timeline
    assert log[-1] == ("done", pytest.approx(2.0))


# ---------------- fix wave 2: voice activity alone is never announced ----------------
@pytest.mark.asyncio
async def test_speech_started_without_words_is_not_announced():
    client, rec, _ = await make()
    await client._on_speech_started()
    assert rec.count("user_speaking") == 0 and "UserStartedSpeaking" not in rec.events


@pytest.mark.asyncio
async def test_first_interim_word_announces_once_then_final_makes_one_turn():
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm)
    await client._on_speech_started()
    await client._on_stt_transcript("બાવીસ", False, False)
    assert rec.count("user_speaking") == 1 and rec.events.count("UserStartedSpeaking") == 1
    await client._on_stt_transcript("બાવીસ મે", False, False)
    await client._on_stt_transcript("બાવીસ મે બે હજાર પાંચ", True, True)
    await settle(client)
    assert rec.count("user_speaking") == 1
    assert [c for c in rec.calls if c[:2] == ("transcript", "user")] == [("transcript", "user", "બાવીસ મે બે હજાર પાંચ")]
    assert len(llm.requests) == 1


@pytest.mark.asyncio
async def test_noise_only_utterance_announces_nothing_and_starts_no_turn():
    llm = FakeLLM()
    client, rec, _ = await make(llm=llm)
    await client._on_speech_started()
    await client._on_stt_transcript("", False, False)
    await client._on_stt_transcript("  ", True, True)
    await client._on_utterance_end()
    await settle(client)
    assert rec.count("user_speaking") == 0 and "UserStartedSpeaking" not in rec.events
    assert llm.requests == [] and rec.count("transcript") == 0


@pytest.mark.asyncio
async def test_interim_only_then_utterance_end_finishes_the_turn():
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર", False, False)
    await client._on_utterance_end()
    await settle(client)
    assert rec.count("user_speaking") == 1
    assert ("transcript", "user", "હા બરાબર") in rec.calls
    assert len(llm.requests) == 1


@pytest.mark.asyncio
async def test_each_utterance_announces_again():
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક.")], [TextDelta("બે.")]))
    await caller_says(client, "પહેલું વાક્ય")
    await settle(client)
    await caller_says(client, "બીજું વાક્ય")
    await settle(client)
    assert rec.count("user_speaking") == 2


# ---------------- fix wave 3 ----------------
@pytest.mark.asyncio
async def test_late_final_after_interim_finish_is_ignored():
    gate = asyncio.Event()
    llm = FakeLLM([TextDelta("જવાબ.")])
    tts = FakeTTS(gate_after_first=gate)
    client, rec, _ = await make(llm=llm, tts=tts)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર છે", False, False)
    await client._on_utterance_end()
    await asyncio.wait_for(rec.first_audio.wait(), 2)
    await client._on_stt_transcript("હા બરાબર છે ને", True, True)  # late final of the same utterance
    await client._on_stt_transcript("હા બરાબર છે ને", False, False)
    assert tts.cancelled == []
    gate.set()
    await settle(client)
    assert len(llm.requests) == 1
    assert [m for m in client._history if m["role"] == "user"] == [{"role": "user", "content": "હા બરાબર છે"}]
    assert client._history[-1] == {"role": "assistant", "content": "જવાબ."}
    # the next utterance is heard normally
    await caller_says(client, "બીજો પ્રશ્ન")
    await settle(client)
    assert len(llm.requests) == 2


@pytest.mark.asyncio
async def test_empty_final_keeps_interim_for_utterance_end():
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર", False, False)
    await client._on_stt_transcript("", True, False)
    await client._on_utterance_end()
    await settle(client)
    assert [c for c in rec.calls if c[:2] == ("transcript", "user")] == [("transcript", "user", "હા બરાબર")]
    assert len(llm.requests) == 1


@pytest.mark.asyncio
async def test_queued_goodbye_follows_the_whole_paced_reply():
    clock = FakeClock()
    tts = SizedTTS({"એક.": 1.0, "બે.": 1.0, "આવજો.": 1.0})
    gate = asyncio.Event()
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક. "), gate, TextDelta("બે.")]), tts=tts, clock=clock)
    log = timed(client, clock, rec)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: sum(1 for k, _ in log if k == "audio") == 10)
    await client.inject_agent_message("આવજો.", behavior="queue")
    gate.set()
    await settle(client)
    assert tts.spoken == ["એક.", "બે.", "આવજો."]
    assert len([k for k, _ in log if k == "audio"]) == 30
    assert log[-1] == ("done", pytest.approx(3.0))


# ---------------- latency: early finish after a final result, first clause spoken early ----------------
@pytest.mark.asyncio
async def test_final_without_end_of_speech_finishes_after_a_short_pause():
    sleep = FakeSleep()
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર છે", True, False)
    await until(lambda: sleep.calls)
    assert sleep.calls == [pc.FINAL_WITHOUT_END_S] and pc.FINAL_WITHOUT_END_S < 1.0
    assert llm.requests == []          # not yet: the pause has not elapsed
    sleep.release.set()
    await until(lambda: llm.requests)
    await settle(client)
    assert len(llm.requests) == 1
    assert [m for m in client._history if m["role"] == "user"] == [{"role": "user", "content": "હા બરાબર છે"}]


@pytest.mark.asyncio
async def test_more_speech_during_the_pause_cancels_the_early_finish():
    sleep = FakeSleep()
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર છે", True, False)
    await until(lambda: sleep.calls)
    await client._on_speech_started()  # the caller carries on
    assert client._end_timer is None and llm.requests == []
    await client._on_stt_transcript("અને બીજું", True, True)
    await settle(client)
    assert [m["content"] for m in client._history if m["role"] == "user"] == ["હા બરાબર છે અને બીજું"]
    assert len(llm.requests) == 1


@pytest.mark.asyncio
async def test_interim_words_during_the_pause_cancel_the_early_finish():
    sleep = FakeSleep()
    llm = FakeLLM()
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર છે", True, False)
    await until(lambda: sleep.calls)
    await client._on_stt_transcript("અને", False, False)
    assert client._end_timer is None and llm.requests == []


@pytest.mark.asyncio
async def test_final_with_end_of_speech_does_not_use_the_timer():
    sleep = FakeSleep()
    client, rec, _ = await make(llm=FakeLLM([TextDelta("ઠીક.")]), sleep=sleep)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert pc.FINAL_WITHOUT_END_S not in sleep.calls and client._end_timer is None


@pytest.mark.asyncio
async def test_utterance_end_finishes_the_turn_and_clears_the_timer():
    sleep = FakeSleep()
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર છે", True, False)
    await until(lambda: sleep.calls)
    await client._on_utterance_end()
    await settle(client)
    assert len(llm.requests) == 1 and client._end_timer is None


@pytest.mark.asyncio
async def test_close_cancels_a_pending_early_finish():
    sleep = FakeSleep()
    llm = FakeLLM()
    client, rec, _ = await make(llm=llm, sleep=sleep)
    await client._on_speech_started()
    await client._on_stt_transcript("હા બરાબર છે", True, False)
    await until(lambda: sleep.calls)
    await client.close()
    sleep.release.set()
    await asyncio.sleep(0)
    assert llm.requests == [] and client._end_timer is None


@pytest.mark.asyncio
async def test_first_clause_is_spoken_before_the_sentence_is_complete():
    gate = asyncio.Event()
    tts = FakeTTS()
    llm = FakeLLM([TextDelta("તમારી જન્મતારીખ અને જન્મસમય મુજબ આજનો દિવસ શુભ છે, "), gate, TextDelta("બીજું વાક્ય.")])
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: tts.spoken)
    assert tts.spoken == ["તમારી જન્મતારીખ અને જન્મસમય મુજબ આજનો દિવસ શુભ છે,"]  # spoken while the model is still writing
    gate.set()
    await settle(client)
    assert tts.spoken[-1] == "બીજું વાક્ય."


@pytest.mark.asyncio
async def test_language_model_timing_and_token_use_are_logged(caplog):
    import logging
    caplog.set_level(logging.INFO)
    client, rec, _ = await make(llm=FakeLLM([TextDelta("જવાબ."), Finished(3700, 12, 3500)]))
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert "language model first word after" in caplog.text
    assert "language model tokens in=3700 out=12 cached=3500" in caplog.text
    assert no_vendor(caplog.text)


# ---------------- latency: hold line during a tool round, prompt-cache warm-up, tool log ----------------
@pytest.mark.asyncio
async def test_tool_round_speaks_one_hold_line_before_the_reply_and_keeps_it_out_of_history():
    tts = FakeTTS()
    gate = asyncio.Event()  # the model's second request is slow, as it is for real
    client, rec, _ = await make(llm=FakeLLM([ToolCall("c1", "nope", "{}")], [gate, TextDelta("ઠીક.")]), tts=tts)
    await caller_says(client, "મારી જન્મતારીખ")
    await until(lambda: tts.spoken)
    assert tts.spoken == [pc.FILLER_LINE]  # spoken while the second request is still waiting
    gate.set()
    await settle(client)
    assert tts.spoken == [pc.FILLER_LINE, "ઠીક."]
    assert [m for m in client._history if m["role"] == "assistant" and m.get("content")] == [
        {"role": "assistant", "content": "ઠીક."}]


@pytest.mark.asyncio
async def test_hold_line_is_spoken_once_across_several_tool_rounds():
    tts = FakeTTS()
    gate = asyncio.Event()
    llm = FakeLLM([ToolCall("c1", "nope", "{}")], [gate, ToolCall("c2", "nope", "{}")], [TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: tts.spoken)
    gate.set()
    await settle(client)
    assert tts.spoken.count(pc.FILLER_LINE) == 1 and tts.spoken[-1] == "ઠીક."


@pytest.mark.asyncio
async def test_no_hold_line_when_the_model_already_spoke_before_the_tool():
    tts = FakeTTS()
    llm = FakeLLM([TextDelta("એક મિનિટ. "), ToolCall("c1", "nope", "{}")], [TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert pc.FILLER_LINE not in tts.spoken


@pytest.mark.asyncio
async def test_hold_line_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("PIPELINE_TOOL_HOLD_LINE", "0")
    tts = FakeTTS()
    client, rec, _ = await make(llm=FakeLLM([ToolCall("c1", "nope", "{}")], [TextDelta("ઠીક.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert tts.spoken == ["ઠીક."]


@pytest.mark.asyncio
async def test_a_turn_without_tools_never_speaks_the_hold_line():
    tts = FakeTTS()
    client, rec, _ = await make(llm=FakeLLM([TextDelta("ઠીક.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert tts.spoken == ["ઠીક."]


@pytest.mark.asyncio
async def test_tool_calls_are_logged_by_name_only(caplog):
    import logging
    caplog.set_level(logging.INFO)
    client, rec, _ = await make(llm=FakeLLM([ToolCall("c1", "parse_birth_date", '{"spoken": "secret words"}')],
                                            [TextDelta("ઠીક.")]))
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert "tool call parse_birth_date" in caplog.text
    assert "secret words" not in caplog.text and no_vendor(caplog.text)


@pytest.mark.asyncio
async def test_prompt_cache_is_warmed_with_the_real_prompt_and_tools_at_connect():
    class WarmLLM(FakeLLM):
        warmed = []

        async def warm(self, messages=None, tools=None):
            self.warmed.append((messages, tools))

    llm = WarmLLM()
    WarmLLM.warmed = []
    client, rec, _ = await make(llm=llm)
    await settle(client)
    assert len(llm.warmed) == 1
    messages, tools = llm.warmed[0]
    assert messages[0] == {"role": "system", "content": "SYSTEM PROMPT"}


# ---------------- latency: date of birth read in code before the model request ----------------
def numerology_settings():
    from app.numerology.tools import NUMEROLOGY_FUNCTIONS
    return settings(functions=NUMEROLOGY_FUNCTIONS)


DOB_WORDS = "મારી જન્મ તારીખ બાવીસ મે બે હજાર પાંચ"


@pytest.mark.asyncio
async def test_date_words_are_read_in_code_and_the_model_answers_in_one_request():
    llm = FakeLLM([TextDelta("તમારી તારીખ બરાબર છે?")])
    client, rec, _ = await make(llm=llm, s=numerology_settings())
    await caller_says(client, DOB_WORDS)
    await settle(client)
    assert len(llm.requests) == 1                      # no separate round just to ask for the tool
    msgs = llm.requests[0]
    assert msgs[-2]["role"] == "assistant" and msgs[-2]["tool_calls"][0]["function"]["name"] == "parse_birth_date"
    assert msgs[-2]["tool_calls"][0]["id"].startswith("pre_")
    assert msgs[-1]["role"] == "tool" and msgs[-1]["tool_call_id"] == msgs[-2]["tool_calls"][0]["id"]
    assert "confirm" in msgs[-1]["content"]
    assert client._numerology_state.get("dob_status") == "confirm"
    assert ("transcript", "assistant", "તમારી તારીખ બરાબર છે?") in rec.calls


@pytest.mark.asyncio
async def test_no_date_words_means_no_pre_run():
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, s=numerology_settings())
    await caller_says(client, "હા")
    await settle(client)
    assert not any(m.get("tool_calls") for m in llm.requests[0])
    assert "dob_status" not in client._numerology_state


@pytest.mark.asyncio
async def test_no_pre_run_once_the_date_is_done():
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, s=numerology_settings())
    client._numerology_state["dob_status"] = "done"
    await caller_says(client, DOB_WORDS)
    await settle(client)
    assert not any(m.get("tool_calls") for m in llm.requests[0])


@pytest.mark.asyncio
async def test_no_pre_run_for_an_agent_without_the_date_tool():
    llm = FakeLLM([TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm)  # no functions
    await caller_says(client, DOB_WORDS)
    await settle(client)
    assert not any(m.get("tool_calls") for m in llm.requests[0]) and client._numerology_state == {}


@pytest.mark.asyncio
async def test_pre_run_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("PIPELINE_PRERUN_DATE", "0")
    llm = FakeLLM([ToolCall("c1", "parse_birth_date", json.dumps({"spoken": DOB_WORDS}))], [TextDelta("બરાબર?")])
    client, rec, _ = await make(llm=llm, s=numerology_settings())
    await caller_says(client, DOB_WORDS)
    await settle(client)
    assert len(llm.requests) == 2 and not any(m.get("tool_calls") for m in llm.requests[0])


@pytest.mark.asyncio
async def test_same_words_called_again_by_the_model_reuse_the_answer(monkeypatch):
    from app.numerology import spoken_date
    real = spoken_date.understand
    seen = []

    def counting(spoken, state):
        seen.append(spoken)
        return real(spoken, state)

    monkeypatch.setattr(spoken_date, "understand", counting)
    llm = FakeLLM([ToolCall("m1", "parse_birth_date", json.dumps({"spoken": DOB_WORDS}, ensure_ascii=False))],
                  [TextDelta("તમારી તારીખ બરાબર છે?")])
    client, rec, _ = await make(llm=llm, s=numerology_settings())
    await caller_says(client, DOB_WORDS)
    await settle(client)
    assert seen == [DOB_WORDS]                          # read once, in code; the model's repeat call is answered from it
    assert llm.requests[1][-1]["role"] == "tool" and llm.requests[1][-1]["tool_call_id"] == "m1"
    assert "confirm" in llm.requests[1][-1]["content"]


@pytest.mark.asyncio
async def test_different_words_called_by_the_model_still_run_the_reader(monkeypatch):
    from app.numerology import spoken_date
    real = spoken_date.understand
    seen = []
    monkeypatch.setattr(spoken_date, "understand", lambda s, st: (seen.append(s), real(s, st))[1])
    llm = FakeLLM([ToolCall("m1", "parse_birth_date", json.dumps({"spoken": "બીજો શબ્દ"}, ensure_ascii=False))],
                  [TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, s=numerology_settings())
    await caller_says(client, DOB_WORDS)
    await settle(client)
    assert seen == [DOB_WORDS, "બીજો શબ્દ"]


# ---------------- latency: speaking lane (model output never waits for playback; next voice made early) ----------------
class BlockedPlayback:
    """Playback pacing waits stay blocked until released: the sentence being played is still playing."""

    def __init__(self, clock):
        self.clock = clock
        self.release = asyncio.Event()
        self.calls = []

    async def __call__(self, seconds):
        self.calls.append(seconds)
        await self.release.wait()
        self.clock.now += seconds  # once released, audio plays in fake time
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_tool_runs_and_next_request_goes_out_while_the_first_sentence_is_still_playing():
    clock = FakeClock()
    block = BlockedPlayback(clock)
    tts = SizedTTS({})
    llm = FakeLLM([TextDelta("સરસ, હવે ગણતરી કરું છું. "), ToolCall("c1", "nope", "{}")], [TextDelta("ઠીક.")])
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock, playback_sleep=block)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: len(llm.requests) == 2 and block.calls)
    assert not block.release.is_set()                       # sentence 1 is still being played out, yet the tool already ran
    assert llm.requests[1][-1]["role"] == "tool"
    block.release.set()
    await settle(client)
    assert tts.spoken == ["સરસ, હવે ગણતરી કરું છું.", "ઠીક."]
    # the call carries what the model wrote, and the later reply is recorded once it is played
    assert [m for m in client._history if m["role"] == "assistant" and m.get("tool_calls")][0]["content"] == "સરસ, હવે ગણતરી કરું છું."
    assert client._history[-1] == {"role": "assistant", "content": "ઠીક."}


@pytest.mark.asyncio
async def test_next_sentence_voice_is_made_while_the_current_one_plays_but_only_one_ahead():
    clock = FakeClock()
    block = BlockedPlayback(clock)
    tts = SizedTTS({})
    llm = FakeLLM([TextDelta("એક વાક્ય. બીજું વાક્ય. ત્રીજું વાક્ય.")])
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock, playback_sleep=block)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: len(tts.spoken) == 2)
    await asyncio.sleep(0)
    assert tts.spoken == ["એક વાક્ય.", "બીજું વાક્ય."]        # the playing one and the next; the third waits
    assert not block.release.is_set()
    block.release.set()
    await settle(client)
    assert tts.spoken == ["એક વાક્ય.", "બીજું વાક્ય.", "ત્રીજું વાક્ય."]
    assert client._history[-1] == {"role": "assistant", "content": "એક વાક્ય. બીજું વાક્ય. ત્રીજું વાક્ય."}


@pytest.mark.asyncio
async def test_barge_in_drops_queued_and_prefetched_sentences():
    clock = FakeClock()
    block = BlockedPlayback(clock)
    tts = SizedTTS({})
    llm = FakeLLM([TextDelta("એક વાક્ય. બીજું વાક્ય. ત્રીજું વાક્ય.")])
    client, rec, _ = await make(llm=llm, tts=tts, clock=clock, playback_sleep=block)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: len(tts.spoken) == 2)
    handed_out = rec.count("audio")
    client._interrupt()
    block.release.set()
    await settle(client)
    assert rec.count("audio") == handed_out                  # nothing more reaches the caller
    assert "ત્રીજું વાક્ય." not in tts.spoken
    assert [m for m in client._history if m["role"] == "assistant"] == []  # nothing was fully played


@pytest.mark.asyncio
async def test_sentences_play_in_order_even_when_a_later_voice_is_ready_first():
    gate = asyncio.Event()
    tts = FakeTTS(gates={"એક.": gate})                       # the first sentence's voice stalls half way
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક. બે.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await until(lambda: len(tts.spoken) == 2)                # the second voice is already made
    gate.set()
    await settle(client)
    audio = [c[1] for c in rec.calls if c[0] == "audio"]
    assert audio == [b.encode() for b in ("એક.#1", "એક.#2", "બે.#1", "બે.#2")]


@pytest.mark.asyncio
async def test_a_sentence_whose_voice_fails_is_skipped_and_the_next_still_plays():
    tts = FakeTTS(fail={"એક."})
    client, rec, _ = await make(llm=FakeLLM([TextDelta("એક. બે.")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    audio = [c[1] for c in rec.calls if c[0] == "audio"]
    assert audio == [b.encode() for b in ("બે.#1", "બે.#2")]
    assert client._history[-1] == {"role": "assistant", "content": "બે."}


@pytest.mark.asyncio
async def test_model_failure_after_a_sentence_still_speaks_it_and_adds_no_apology():
    tts = FakeTTS()
    client, rec, _ = await make(llm=FakeLLM([TextDelta("પહેલું વાક્ય. "), LlmUnavailable("x")]), tts=tts)
    await caller_says(client, "પ્રશ્ન")
    await settle(client)
    assert tts.spoken[0] == "પહેલું વાક્ય." and tts.spoken[-1] == APOLOGY   # spoken in order: what was written, then the apology
