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
import functools
import logging
import os
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

from app.providers.pipeline.llm import (
    AzureChatStream, LlmTimeout, LlmUnavailable, TextDelta, ToolCall, to_chat_tools,
)
from app.providers.pipeline.sentences import SentenceChunker
from app.providers.pipeline.tts import StreamingTTS, TtsUnavailable
from app.providers.pipeline.turns import clean_transcript, is_real_interruption, turn_is_complete
from app.voice_stack.function_dispatch import answer_function_call, run_knowledge_search

logger = logging.getLogger(__name__)

APOLOGY_LINE = "માફ કરજો, થોડી વાર લાગે છે. ફરીથી કહેશો?"
TOOL_LIMIT_LINE = "માફ કરજો, હમણાં એ થઈ શકતું નથી. બીજું કંઈ મદદ કરું?"
MAX_TOOL_ROUNDS = 4
MAX_REPLY_TOKENS = 400
LLM_FIRST_TOKEN_TIMEOUT_S = 5.0  # keeps the worst-case silence under 6 s
UTTERANCE_END_SILENCE_MS = 1000
SUPPORTED_VOICE_TYPE = "cartesia"
_NOT_CONFIGURED = "Voice engine is not configured for this organization"

Callback = Optional[Callable[..., Awaitable[Any]]]


class PipelineVoiceClient:
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
    ):
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
        self._speaking = False
        self._tts_failures = 0

        self._user_parts: List[str] = []   # final caller text of the turn being collected
        self._overlap: List[str] = []      # caller text heard while the agent was talking
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
            key = os.getenv("AZURE_OPENAI_API_KEY")
            deployment = os.getenv("AZURE_OPENAI_VOICE_DEPLOYMENT_NAME") or agent.think.provider.model
            if not endpoint or not key or not deployment:
                raise ValueError(_NOT_CONFIGURED)
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
        self._speech_started_at = time.monotonic()
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
            heard = " ".join(self._overlap + [text])
            started = self._speech_started_at
            speech_ms = int((time.monotonic() - started) * 1000) if started is not None else 0
            if not is_real_interruption(heard, speech_ms, True):
                if is_final:
                    self._overlap.append(text)
                return
            earlier = list(self._overlap)
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
        self._interrupt()
        self._turn_task = self._spawn_speech(self._run_turn(user_text))

    def _spawn_speech(self, coro: Awaitable[Any]) -> asyncio.Task:
        task = asyncio.ensure_future(coro)
        self._speech_tasks.add(task)
        task.add_done_callback(self._speech_tasks.discard)
        return task

    def _interrupt(self) -> None:
        """Stops the reply now: no awaits, so no more audio is handed out once this returns."""
        me = asyncio.current_task()
        for t in list(self._speech_tasks):
            if t is not me and not t.done():
                t.cancel()
        ctx, self._ctx = self._ctx, None
        self._speaking = False
        self._overlap.clear()
        if ctx is not None and self._tts is not None:
            aux = asyncio.ensure_future(self._tts.cancel(ctx))
            self._aux_tasks.add(aux)
            aux.add_done_callback(self._aux_tasks.discard)

    async def _run_turn(self, user_text: str) -> None:
        try:
            self._history.append({"role": "user", "content": user_text})
            await self._emit("ConversationText", {"role": "user", "content": user_text})
            await self._call(self.on_transcript, "user", user_text)
            await self._emit("AgentThinking", {})
            await self._call(self.on_agent_thinking, {})
            await self._respond()
            await self._finish_speaking()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Economy] turn failed")
        finally:
            self._overlap.clear()

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
            except asyncio.CancelledError:
                self._record_assistant(spoken)  # cut off: keep only what was fully spoken
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
            self._history.append({
                "role": "assistant",
                "content": " ".join(spoken) or None,
                "tool_calls": [
                    {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments}}
                    for c in calls
                ],
            })
            for c in calls:
                answer = await answer_function_call(
                    c.name, c.arguments, state=self._numerology_state, knowledge_runner=self._knowledge_runner
                )
                self._history.append({"role": "tool", "tool_call_id": c.id, "content": answer})

    def _record_assistant(self, spoken: List[str]) -> None:
        if spoken:
            self._history.append({"role": "assistant", "content": " ".join(spoken)})

    async def _speak_line(self, text: str) -> None:
        spoken: List[str] = []
        try:
            await self._speak_sentence(text, spoken)
        finally:
            self._record_assistant(spoken)

    async def _speak_reply(self, text: str) -> None:
        """A whole reply spoken outside a caller turn (greeting, injected message)."""
        try:
            await self._speak_line(text)
            await self._finish_speaking()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Economy] speaking failed")

    async def _finish_speaking(self) -> None:
        if self._speaking:
            self._speaking = False
            await self._emit("AgentAudioDone", {})
            await self._call(self.on_agent_audio_done)

    async def _speak_sentence(self, text: str, spoken: List[str]) -> None:
        """Speaks one sentence; adds it to `spoken` only when all of its audio was handed out."""
        if self._closed or self._tts is None:
            return
        async with self._speak_lock:
            ctx = uuid.uuid4().hex
            self._ctx = ctx
            started = False
            try:
                async with contextlib.aclosing(self._tts.speak(text, context_id=ctx)) as audio:
                    async for chunk in audio:
                        if self._ctx != ctx or self._closed:
                            break
                        if not started:
                            started = True
                            if not self._speaking:
                                self._speaking = True
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
