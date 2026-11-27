"""Economy voice engine client: speech-to-text -> language model -> voice, orchestrated here.

Built from three streaming pieces (Deepgram live listen, Azure OpenAI chat, Cartesia Sonic voice) and exposes the
same surface and callbacks as the Standard client (DeepgramVoiceAgentClient), so the call gateway treats both alike.
Log, error and callback text is vendor-neutral and never contains a key.

Callback order for one caller turn (mirrors the events the Standard engine sends):
  on_user_speaking() / UserStartedSpeaking  -> caller starts talking (deferred while the agent talks, until it is a
                                               real interruption, so a lone backchannel never flushes agent audio)
  on_transcript("user", text)               -> complete caller turn
  on_agent_thinking({})                     -> model request starts
  on_agent_speaking({})                     -> first audio of the reply
  on_transcript("assistant", sentence)      -> each sentence, as its audio starts
  on_audio(bytes) ...                       -> audio chunks (8 kHz mu-law)
  on_agent_audio_done()                     -> after the last chunk of the reply
"""
import asyncio
import contextlib
import contextvars
import functools
import logging
import os
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

from app.providers.pipeline.llm import (
    AzureChatStream, LlmTimeout, LlmUnavailable, TextDelta, ToolCall, to_chat_tools,
)
from app.providers.pipeline.sentences import SentenceChunker
from app.providers.pipeline.tts import StreamingTTS, TtsUnavailable
from app.providers.pipeline.turns import clean_transcript, is_backchannel, is_real_interruption, turn_is_complete
from app.voice_stack.function_dispatch import answer_function_call, run_knowledge_search
from app.voice_stack.llm_env import resolve_llm_key

logger = logging.getLogger(__name__)

APOLOGY_LINE = "માફ કરજો, થોડી વાર લાગે છે. ફરીથી કહેશો?"
TOOL_LIMIT_LINE = "માફ કરજો, હમણાં એ થઈ શકતું નથી. બીજું કંઈ મદદ કરું?"
MAX_TOOL_ROUNDS = 4
MAX_REPLY_TOKENS = 400
FILLER_LINE = "એક ક્ષણ, હું જોઉં છું."
LLM_FIRST_TOKEN_TIMEOUT_S = 4.0  # with the silence watchdog, keeps the worst-case silence under 6 s
UTTERANCE_END_SILENCE_MS = 1000
SUPPORTED_VOICE_TYPE = "cartesia"
_NOT_CONFIGURED = "Voice engine is not configured for this organization"

Callback = Optional[Callable[..., Awaitable[Any]]]


class _Speaker:
    """One speaking unit: the reply to one caller turn, or one injected message."""

    def __init__(self, protected: bool = False):
        self.protected = protected            # never cancelled by an interruption
        self.audio = False                    # some audio was handed out
        self.last_sentence_at: Optional[float] = None  # clock time the latest sentence began playing
        self.filler_speaking = False


# The speaking unit of the running task; inherited by tasks it spawns (the silence watchdog).
_speaker: "contextvars.ContextVar[Optional[_Speaker]]" = contextvars.ContextVar("economy_speaker", default=None)


class PipelineVoiceClient:
    VOICE_ENGINE = "custom"  # marker read by engine_of() without importing this module

    def __init__(
        self,
        *,
        profile: Any,
        on_audio: Callback = None,
        on_event: Callback = None,
        on_transcript: Callback = None,
        on_user_speaking: Callback = None,
        on_agent_thinking: Callback = None,
        on_agent_speaking: Callback = None,
        on_agent_audio_done: Callback = None,
        on_error: Callback = None,
        stt: Any = None,
        llm: Any = None,
        tts: Any = None,
        silence_watchdog_s: float = 3.5,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ):
        self._watchdog_s = silence_watchdog_s
        self._clock = clock
        self._sleep = sleep
        self._profile = profile
        self.on_audio = on_audio
        self.on_event = on_event
        self.on_transcript = on_transcript
        self.on_user_speaking = on_user_speaking
        self.on_agent_thinking = on_agent_thinking
        self.on_agent_speaking = on_agent_speaking
        self.on_agent_audio_done = on_agent_audio_done
        self.on_error = on_error
        self._stt = stt
        self._llm = llm
        self._tts = tts

        self._ready = False
        self._closed = False
        self._session_id: Optional[str] = None
        self._numerology_state: Dict[str, Any] = {}
        self._knowledge_runner: Optional[Callable[[Any], Awaitable[str]]] = None

        self._system_prompt = ""
        self._tools: List[dict] = []
        self._temperature = 0.7
        self._history: List[dict] = []

        self._speak_lock = asyncio.Lock()
        self._turn_task: Optional[asyncio.Task] = None
        self._speech_tasks: Set[asyncio.Task] = set()  # turn + injected speech
        self._aux_tasks: Set[asyncio.Task] = set()     # voice cancels
        self._ctx: Optional[str] = None                # voice context currently allowed to play
        self._ctx_speaker: Optional[_Speaker] = None
        self._speakers: Set[_Speaker] = set()          # units with audio out; AgentAudioDone when it empties
        self._protected: Set[asyncio.Task] = set()     # injected messages an interruption never cancels
        self._inject_lock = asyncio.Lock()             # queued injections speak one at a time, in order
        self._deferred: List[str] = []                 # caller turns held while a protected message plays
        self._tts_failures = 0

        self._user_parts: List[str] = []   # final caller text of the turn being collected
        self._overlap: List[Tuple[str, float]] = []  # (caller text, clock time) heard while the agent talked
        self._speech_started_at: Optional[float] = None
        self._user_speaking_sent = False

    # ---- protocol properties ----
    @property
    def is_ready(self) -> bool:
        return self._ready and not self._closed

    @property
    def session_id(self) -> Optional[str]:
        return self._session_id

    @property
    def numerology_state(self) -> Dict[str, Any]:
        return self._numerology_state

    # ---- callbacks ----
    async def _call(self, cb: Callback, *args: Any) -> None:
        if cb is None:
            return
        try:
            await cb(*args)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Economy] callback failed")

    async def _emit(self, event_type: str, data: Dict[str, Any]) -> None:
        await self._call(self.on_event, event_type, data)

    # ---- setup ----
    async def connect_and_configure(self, settings: Any, greeting: Optional[str] = None, timeout: float = 10.0) -> bool:
        agent = settings.agent
        speak = agent.speak.provider
        if getattr(speak, "type", None) != SUPPORTED_VOICE_TYPE:
            raise ValueError("Voice not supported by this engine")
        if self._closed:
            raise ConnectionError("Voice engine client is closed")

        self._system_prompt = agent.think.prompt
        self._tools = to_chat_tools(list(agent.think.functions or []))
        self._temperature = float(agent.think.provider.temperature)
        scope = getattr(settings, "knowledge_scope", None)
        self._knowledge_runner = functools.partial(run_knowledge_search, scope) if scope else None
        context = getattr(agent, "context", None)
        for m in (getattr(context, "messages", None) or []):
            role, content = m.get("role"), m.get("content")
            if role in ("user", "assistant") and content:
                self._history.append({"role": role, "content": content})

        try:
            self._build_missing(settings)
            await asyncio.wait_for(self._stt.connect(), timeout)
        except Exception as e:
            logger.error("[Economy] could not start (%s)", type(e).__name__)
            await self._call(self.on_error, "Voice engine service unavailable")
            await self.close()
            if isinstance(e, ValueError):
                raise
            raise ConnectionError("Voice engine service unavailable") from None

        self._session_id = uuid.uuid4().hex
        self._ready = True
        logger.info("[Economy] voice engine ready")
        await self._emit("SettingsApplied", {})
        if greeting and greeting.strip():
            self._spawn_speech(self._speak_reply(greeting.strip()))
        return True

    def _build_missing(self, settings: Any) -> None:
        agent = settings.agent
        if self._stt is None:
            from app.providers.pipeline.stt import StreamingSTT
            listen = agent.listen.provider
            model = listen.model or "nova-3"
            if model.startswith("flux"):
                model = "nova-3"  # end-of-turn models are not served by the streaming listen endpoint
            self._stt = StreamingSTT(
                self._profile.engine_key,
                language=listen.language or "gu",
                model=model,
                on_transcript=self._on_stt_transcript,
                on_speech_started=self._on_speech_started,
                on_utterance_end=self._on_utterance_end,
                on_lost=self._on_stt_lost,
            )
        if self._tts is None:
            speak = agent.speak.provider
            voice = speak.voice if isinstance(speak.voice, dict) else {}
            if not self._profile.tts_key or not voice.get("id") or not speak.model_id:
                raise ValueError(_NOT_CONFIGURED)
            self._tts = StreamingTTS(
                self._profile.tts_key,
                voice_id=voice["id"],
                model_id=speak.model_id,
                language=speak.language or "gu",
            )
        if self._llm is None:
            endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
            key = resolve_llm_key()
            deployment = os.getenv("AZURE_OPENAI_VOICE_DEPLOYMENT_NAME") or agent.think.provider.model
            if not endpoint or not key or not deployment:
                raise ValueError(_NOT_CONFIGURED)
            logger.info("[Economy] language model deployment: %s", deployment)
            self._llm = AzureChatStream(endpoint, key, deployment=deployment, timeout_s=LLM_FIRST_TOKEN_TIMEOUT_S)

    # ---- caller audio and speech-to-text events ----
    async def send_audio(self, raw_audio_bytes: bytes) -> None:
        if self.is_ready and self._stt is not None:
            await self._stt.send_audio(raw_audio_bytes)

    def _agent_active(self) -> bool:
        return any(not t.done() for t in self._speech_tasks)

    async def _on_speech_started(self) -> None:
        if self._closed:
            return
        self._speech_started_at = self._clock()
        self._user_speaking_sent = False
        if not self._agent_active():
            await self._announce_user_speaking()

    async def _announce_user_speaking(self) -> None:
        if self._user_speaking_sent:
            return
        self._user_speaking_sent = True
        await self._emit("UserStartedSpeaking", {})
        await self._call(self.on_user_speaking)

    async def _on_stt_transcript(self, text: str, is_final: bool, speech_final: bool) -> None:
        if self._closed:
            return
        if self._agent_active():
            heard = " ".join([t for t, _ in self._overlap] + [text])
            started = self._speech_started_at
            speech_ms = int((self._clock() - started) * 1000) if started is not None else 0
            if not is_real_interruption(heard, speech_ms, True):
                if is_final:
                    self._overlap.append((text, self._clock()))
                return
            earlier = [t for t, _ in self._overlap]
            self._interrupt()  # synchronous: local playback stops before anything is awaited
            self._user_parts = earlier
            await self._announce_user_speaking()
            if not is_final:
                return
        if is_final:
            self._user_parts.append(text)
            if turn_is_complete(" ".join(self._user_parts), speech_final, 0):
                self._finish_user_turn()

    async def _on_utterance_end(self) -> None:
        if self._closed or self._agent_active() or not self._user_parts:
            return
        if turn_is_complete(" ".join(self._user_parts), False, UTTERANCE_END_SILENCE_MS):
            self._finish_user_turn()

    async def _on_stt_lost(self, reason: str) -> None:
        logger.error("[Economy] listening connection lost")
        self._ready = False
        await self._call(self.on_error, "Speech recognition connection lost")

    def _finish_user_turn(self) -> None:
        text = clean_transcript(" ".join(self._user_parts))
        self._user_parts = []
        if text:
            self._start_turn(text)

    # ---- turns ----
    def _start_turn(self, user_text: str) -> None:
        if self._protected_pending():
            self._deferred.append(user_text)  # answered once the protected message has played
            return
        self._interrupt()
        self._turn_task = self._spawn_speech(self._run_turn(user_text))

    def _spawn_speech(self, coro: Awaitable[Any], protected: bool = False) -> asyncio.Task:
        task = asyncio.ensure_future(coro)
        self._speech_tasks.add(task)
        task.add_done_callback(self._speech_tasks.discard)
        if protected:
            self._protected.add(task)
            task.add_done_callback(self._protected.discard)
        return task

    def _protected_pending(self) -> bool:
        me = asyncio.current_task()
        return any(t is not me and not t.done() for t in self._protected)

    def _interrupt(self) -> None:
        """Stops the reply now: no awaits, so no more audio is handed out once this returns.

        Protected injected messages (the goodbye) keep playing."""
        me = asyncio.current_task()
        for t in list(self._speech_tasks):
            if t is not me and not t.done() and t not in self._protected:
                t.cancel()
        self._speakers = {s for s in self._speakers if s.protected}
        self._overlap.clear()
        if self._ctx_speaker is not None and self._ctx_speaker.protected:
            return
        ctx, self._ctx = self._ctx, None
        self._ctx_speaker = None
        if ctx is not None and self._tts is not None:
            aux = asyncio.ensure_future(self._tts.cancel(ctx))
            self._aux_tasks.add(aux)
            aux.add_done_callback(self._aux_tasks.discard)

    async def _run_turn(self, user_text: str) -> None:
        turn = _Speaker()
        _speaker.set(turn)
        watchdog = self._spawn_speech(self._watchdog(turn, asyncio.current_task()))
        start = len(self._history)
        try:
            self._history.append({"role": "user", "content": user_text})
            await self._emit("ConversationText", {"role": "user", "content": user_text})
            await self._call(self.on_transcript, "user", user_text)
            await self._emit("AgentThinking", {})
            await self._call(self.on_agent_thinking, {})
            await self._respond()
            await self._end_watchdog(turn, watchdog)
            await self._finish_speaking()
            carry = self._take_overlap(turn)
            if carry and not self._closed:
                self._start_turn(carry)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("[Economy] turn failed (%s)", type(e).__name__)
            self._overlap.clear()
            await self._apologise_unless_replied(turn, watchdog, start)
            await self._finish_speaking()
        finally:
            if not watchdog.done():
                watchdog.cancel()

    async def _apologise_unless_replied(self, turn: _Speaker, watchdog: asyncio.Task, start: int) -> None:
        """After an unexpected failure: the apology, unless this turn already spoke part of its reply."""
        replied = any(m.get("role") == "assistant" and m.get("content") for m in self._history[start:])
        if replied or self._closed:
            return
        try:
            await self._end_watchdog(turn, watchdog)
            await self._speak_line(APOLOGY_LINE)
        except Exception as e:
            logger.error("[Economy] apology failed (%s)", type(e).__name__)

    async def _watchdog(self, turn: _Speaker, turn_task: Optional[asyncio.Task]) -> None:
        """Speaks one short filler line when the turn has produced no audio for a while."""
        await self._sleep(self._watchdog_s)

        def still_silent() -> bool:
            return not turn.audio and not self._closed and (turn_task is None or not turn_task.done())

        if not still_silent():
            return
        turn.filler_speaking = True
        try:
            await self._speak_sentence(FILLER_LINE, [], only_if=still_silent)  # not part of the model's history
        finally:
            turn.filler_speaking = False

    async def _end_watchdog(self, turn: _Speaker, watchdog: asyncio.Task) -> None:
        if watchdog.done():
            return
        if turn.filler_speaking:
            await asyncio.wait({watchdog})
        else:
            watchdog.cancel()

    def _take_overlap(self, turn: _Speaker) -> str:
        """Caller words heard during the reply that still need an answer.

        A lone backchannel counts only when it came while the final sentence was playing."""
        last = turn.last_sentence_at
        keep = [t for t, at in self._overlap if not is_backchannel(t) or (last is not None and at >= last)]
        self._overlap.clear()
        return clean_transcript(" ".join(keep))

    async def _respond(self) -> None:
        rounds = 0
        while not self._closed:
            spoken: List[str] = []
            calls: List[ToolCall] = []
            try:
                messages = [{"role": "system", "content": self._system_prompt}, *self._history]
                chunker = SentenceChunker()
                stream = self._llm.stream(
                    messages, self._tools, temperature=self._temperature, max_tokens=MAX_REPLY_TOKENS
                )
                async with contextlib.aclosing(stream) as events:
                    async for ev in events:
                        if isinstance(ev, TextDelta):
                            for sentence in chunker.feed(ev.text):
                                await self._speak_sentence(sentence, spoken)
                        elif isinstance(ev, ToolCall):
                            calls.append(ev)
                rest = chunker.flush()
                if rest:
                    await self._speak_sentence(rest, spoken)
            except (LlmTimeout, LlmUnavailable):
                logger.warning("[Economy] language model turn failed")
                self._record_assistant(spoken)  # pending tool calls are dropped
                await self._speak_line(APOLOGY_LINE)
                return
            except BaseException:
                self._record_assistant(spoken)  # cut off or failed: keep only what was fully spoken
                raise
            if not calls or rounds >= MAX_TOOL_ROUNDS:
                self._record_assistant(spoken)
            if not calls:
                return
            if rounds >= MAX_TOOL_ROUNDS:
                logger.warning("[Economy] tool round limit reached")
                await self._speak_line(TOOL_LIMIT_LINE)
                return
            rounds += 1
            answers: List[dict] = []
            try:
                for c in calls:
                    answer = await answer_function_call(
                        c.name, c.arguments, state=self._numerology_state, knowledge_runner=self._knowledge_runner
                    )
                    answers.append({"role": "tool", "tool_call_id": c.id, "content": answer})
            except BaseException:
                self._record_assistant(spoken)  # unanswered calls are dropped, so the history stays valid
                raise
            # the call and all of its answers enter the history together
            self._history.append({
                "role": "assistant",
                "content": " ".join(spoken) or None,
                "tool_calls": [
                    {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments}}
                    for c in calls
                ],
            })
            self._history.extend(answers)

    def _record_assistant(self, spoken: List[str]) -> None:
        if spoken:
            self._history.append({"role": "assistant", "content": " ".join(spoken)})

    async def _speak_line(self, text: str) -> None:
        spoken: List[str] = []
        try:
            await self._speak_sentence(text, spoken)
        finally:
            self._record_assistant(spoken)

    async def _speak_reply(self, text: str, *, protected: bool = False, queued: bool = False) -> None:
        """A whole reply spoken outside a caller turn (greeting, injected message).

        A queued message waits until the active reply has fully finished, then speaks in arrival order."""
        _speaker.set(_Speaker(protected))
        try:
            if queued:
                async with self._inject_lock:
                    while self._turn_task is not None and not self._turn_task.done():
                        await asyncio.wait({self._turn_task})
                    await self._speak_line(text)
            else:
                await self._speak_line(text)
            await self._finish_speaking()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Economy] speaking failed")
            await self._finish_speaking()
        finally:
            if protected and not self._closed:
                self._resume_deferred()

    def _resume_deferred(self) -> None:
        if self._deferred and not self._protected_pending():
            text = clean_transcript(" ".join(self._deferred))
            self._deferred.clear()
            if text:
                self._start_turn(text)

    async def _finish_speaking(self) -> None:
        """AgentAudioDone fires once, when the last speaking unit is done."""
        speaker = _speaker.get()
        if speaker is not None and speaker in self._speakers:
            self._speakers.discard(speaker)
            if not self._speakers:
                await self._emit("AgentAudioDone", {})
                await self._call(self.on_agent_audio_done)

    async def _speak_sentence(
        self, text: str, spoken: List[str], only_if: Optional[Callable[[], bool]] = None
    ) -> None:
        """Speaks one sentence; adds it to `spoken` only when all of its audio was handed out."""
        if self._closed or self._tts is None:
            return
        speaker = _speaker.get()
        if speaker is None:
            speaker = _Speaker()
            _speaker.set(speaker)
        async with self._speak_lock:
            if only_if is not None and not only_if():
                return
            ctx = uuid.uuid4().hex
            self._ctx = ctx
            self._ctx_speaker = speaker
            started = False
            try:
                async with contextlib.aclosing(self._tts.speak(text, context_id=ctx)) as audio:
                    async for chunk in audio:
                        if self._ctx != ctx or self._closed:
                            break
                        if not started:
                            started = True
                            speaker.audio = True
                            speaker.last_sentence_at = self._clock()
                            if speaker not in self._speakers:
                                first = not self._speakers
                                self._speakers.add(speaker)
                                if first:
                                    await self._emit("AgentStartedSpeaking", {})
                                    await self._call(self.on_agent_speaking, {})
                            await self._emit("ConversationText", {"role": "assistant", "content": text})
                            await self._call(self.on_transcript, "assistant", text)
                        if self._ctx != ctx:
                            break
                        await self._call(self.on_audio, chunk)
            except TtsUnavailable:
                await self._voice_failed()
                return
            finally:
                if self._ctx == ctx:
                    self._ctx = None
                    self._ctx_speaker = None
                    completed = not self._closed
                else:
                    completed = False
            if completed:
                self._tts_failures = 0
                spoken.append(text)

    async def _voice_failed(self) -> None:
        self._tts_failures += 1
        logger.warning("[Economy] sentence could not be spoken (%d in a row)", self._tts_failures)
        if self._tts_failures >= 2 and self._ready:
            self._ready = False
            await self._call(self.on_error, "Voice engine unavailable")

    # ---- gateway controls ----
    async def inject_agent_message(self, message: str, behavior: str = "default") -> None:
        text = (message or "").strip()
        if not self.is_ready or not text:
            return
        if behavior == "interrupt":
            self._interrupt()
            self._spawn_speech(self._speak_reply(text, protected=True), protected=True)
        elif behavior == "queue":
            self._spawn_speech(self._speak_reply(text, protected=True, queued=True), protected=True)
        else:
            self._spawn_speech(self._speak_reply(text))

    async def inject_user_message(self, content: str) -> None:
        text = clean_transcript(content or "")
        if self.is_ready and text:
            self._start_turn(text)

    async def update_speak(self, provider: dict) -> bool:
        # Changing the voice mid-call is not supported by this engine yet; the gateway keeps the current voice.
        return False

    async def update_prompt(self, prompt: str) -> bool:
        if self._closed:
            return False
        self._system_prompt = prompt
        return True

    async def update_prompt_and_wait_ack(self, prompt: str, timeout: float = 1.0) -> bool:
        return await self.update_prompt(prompt)

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._ready = False
        me = asyncio.current_task()
        self._interrupt()
        tasks = [t for t in (*self._speech_tasks, *self._aux_tasks) if t is not me and not t.done()]
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        for part in (self._stt, self._tts):
            if part is not None:
                try:
                    await part.close()
                except Exception:
                    logger.warning("[Economy] closing a connection failed")
        logger.info("[Economy] client closed")
