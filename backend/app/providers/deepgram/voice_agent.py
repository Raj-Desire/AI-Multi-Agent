"""
Deepgram Voice Agent API Client
Manages async WebSocket connection, authentication, the strict Welcome -> Settings -> SettingsApplied lifecycle,
bidirectional audio streaming, server event dispatch, and clean teardown.
"""

import asyncio
import json
import logging
import os
import time
from typing import Optional, Callable, Dict, Any, Awaitable
import websockets

from app.providers.deepgram.configuration import (
    DeepgramSettingsConfiguration,
    DeepgramInjectAgentMessage,
    DeepgramInjectUserMessage
)
from app.providers.deepgram.events import DeepgramEventType

logger = logging.getLogger("deepgram.voice_agent")

HANDSHAKE_ATTEMPTS = 3
logger.setLevel(logging.INFO)


class DeepgramVoiceAgentClient:
    """
    Async client for Deepgram Voice Agent API (wss://agent.deepgram.com/v1/agent/converse).
    Enforces the official message flow:
    1. Connect
    2. Receive Welcome
    3. Send SettingsConfiguration
    4. Receive SettingsApplied
    5. Ready for bidirectional audio & events
    """

    DEFAULT_ENDPOINT = "wss://agent.deepgram.com/v1/agent/converse"

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        on_audio: Optional[Callable[[bytes], Awaitable[None]]] = None,
        on_event: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None,
        on_transcript: Optional[Callable[[str, str], Awaitable[None]]] = None,  # (role, text)
        on_user_speaking: Optional[Callable[[], Awaitable[None]]] = None,
        on_agent_thinking: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
        on_agent_speaking: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
        on_agent_audio_done: Optional[Callable[[], Awaitable[None]]] = None,
        on_error: Optional[Callable[[str], Awaitable[None]]] = None,
    ):
        self.api_key = (api_key or os.getenv("DEEPGRAM_API_KEY", "")).strip()
        self.endpoint = endpoint or self.DEFAULT_ENDPOINT
        self.on_audio = on_audio
        self.on_event = on_event
        self.on_transcript = on_transcript
        self.on_user_speaking = on_user_speaking
        self.on_agent_thinking = on_agent_thinking
        self.on_agent_speaking = on_agent_speaking
        self.on_agent_audio_done = on_agent_audio_done
        self.on_error = on_error

        self._ws: Optional[Any] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._welcome_event = asyncio.Event()
        self._settings_applied_event = asyncio.Event()
        self._prompt_updated_event = asyncio.Event()
        self._closed_event = asyncio.Event()
        self._is_connected = False
        self._is_ready = False
        self._handshake_error: Optional[str] = None
        self._session_id: Optional[str] = None

        self._audio_received_event = asyncio.Event()
        self._knowledge_scope: Optional[Dict[str, Any]] = None
        self._function_tasks: set = set()

    @property
    def is_ready(self) -> bool:
        return self._is_ready and self._is_connected

    @property
    def session_id(self) -> Optional[str]:
        return self._session_id

    async def connect_and_configure(
        self,
        settings: DeepgramSettingsConfiguration,
        greeting: Optional[str] = None,
        timeout: float = 10.0
    ) -> bool:
        """
        Opens the voice engine session. The engine occasionally refuses to start listening on a fresh session
        (FAILED_TO_START_LISTENING) even with valid settings; a brand-new session usually succeeds, so a failed
        handshake is retried instead of ending the call before the agent has said anything.
        """
        for attempt in range(1, HANDSHAKE_ATTEMPTS + 1):
            final = attempt == HANDSHAKE_ATTEMPTS
            try:
                return await self._connect_once(settings, greeting, timeout, final)
            except Exception as e:
                if final or self._closed_event.is_set() or isinstance(e, ValueError):
                    raise
                logger.warning(f"[VoiceEngine] Handshake attempt {attempt}/{HANDSHAKE_ATTEMPTS} failed ({e}); retrying with a new session.")

    async def _connect_once(
        self,
        settings: DeepgramSettingsConfiguration,
        greeting: Optional[str],
        timeout: float,
        final: bool,
    ) -> bool:
        """
        Executes the mandatory Deepgram initialization handshake:
        1. Open WebSocket
        2. Wait for Welcome
        3. Send SettingsConfiguration
        4. Wait for SettingsApplied
        5. Optionally inject initial greeting
        """
        if not self.api_key:
            err_msg = "Deepgram API key is missing. Set DEEPGRAM_API_KEY in environment or organization settings."
            logger.error(err_msg)
            if self.on_error:
                await self.on_error(err_msg)
            raise ValueError(err_msg)

        headers = {
            "Authorization": f"Token {self.api_key.strip()}"
        }

        try:
            logger.info(f"Connecting to Deepgram Voice Agent at {self.endpoint}...")
            # Support websockets 14+/15+ (additional_headers) and legacy (extra_headers)
            try:
                self._ws = await websockets.connect(
                    self.endpoint,
                    additional_headers=headers,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=5
                )
            except TypeError:
                self._ws = await websockets.connect(
                    self.endpoint,
                    extra_headers=headers,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=5
                )
            self._is_connected = True
            self._knowledge_scope = getattr(settings, "knowledge_scope", None)
            if self._knowledge_scope:
                from app.services.knowledge_service import knowledge_service
                warm = asyncio.create_task(knowledge_service.warm_up(
                    self._knowledge_scope["organization_id"], self._knowledge_scope.get("document_ids")
                ))
                self._function_tasks.add(warm)
                warm.add_done_callback(self._function_tasks.discard)
            self._welcome_event.clear()
            self._settings_applied_event.clear()
            self._handshake_error = None

            # Start listener loop
            self._receive_task = asyncio.create_task(self._receive_loop())

            # Step 2: Wait for Welcome
            logger.info("Waiting for Deepgram Welcome message...")
            try:
                await asyncio.wait_for(self._welcome_event.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                raise TimeoutError("Timed out waiting for Deepgram Welcome message.")

            # Step 3: Send SettingsConfiguration
            settings_json = settings.model_dump_json(exclude_none=True)
            logger.info("Sending SettingsConfiguration to Deepgram...")
            await self._ws.send(settings_json)

            # Step 4: Wait for SettingsApplied
            logger.info("Waiting for Deepgram SettingsApplied confirmation...")
            try:
                await asyncio.wait_for(self._settings_applied_event.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                raise TimeoutError("Timed out waiting for Deepgram SettingsApplied message.")
            if self._handshake_error:
                raise ConnectionError(self._handshake_error)

            self._is_ready = True
            logger.info("Deepgram Voice Agent initialized successfully.")

            # Step 5: Deliver opening greeting
            # If settings.agent.greeting was not declared, or if third-party TTS engine requires explicit injection,
            # wait briefly (up to 1.2s) for server-side greeting audio to start. If no audio frames arrive, explicitly inject it.
            if greeting and greeting.strip():
                clean_greeting = greeting.strip()
                if not getattr(settings.agent, "greeting", None):
                    logger.info(f"Explicitly injecting agent greeting: '{clean_greeting[:40]}...'")
                    await self.inject_agent_message(clean_greeting)
                else:
                    try:
                        await asyncio.wait_for(self._audio_received_event.wait(), timeout=1.2)
                        logger.info("Server-side greeting audio confirmed flowing from engine.")
                    except asyncio.TimeoutError:
                        logger.warning("No initial greeting audio detected after 1.2s; fallback injecting greeting.")
                        await self.inject_agent_message(clean_greeting)

            return True

        except Exception as e:
            logger.error(f"Failed to connect/configure Deepgram Voice Agent: {e}")
            if not final:
                await self._abort_handshake()
                raise
            if self.on_error:
                await self.on_error(str(e))
            await self.close()
            raise

    async def _abort_handshake(self):
        """Drops a half-started session so the next attempt starts clean (unlike close(), the client stays reusable)."""
        self._is_connected = False
        self._is_ready = False
        task, self._receive_task = self._receive_task, None
        if task:
            task.cancel()
            try:
                await task
            except BaseException:
                pass
        ws, self._ws = self._ws, None
        if ws:
            try:
                await ws.close()
            except Exception:
                pass
        self._welcome_event.clear()
        self._settings_applied_event.clear()

    async def send_audio(self, raw_audio_bytes: bytes):
        """Streams raw audio bytes (mulaw, 8kHz) directly to Deepgram."""
        if not self.is_ready or not self._ws:
            return
        try:
            await self._ws.send(raw_audio_bytes)
        except Exception as e:
            logger.error(f"Error sending audio to Deepgram: {e}")
            if self.on_error:
                await self.on_error(f"Audio send error: {str(e)}")

    async def inject_agent_message(self, message: str, behavior: str = "default"):
        """Forces the agent to speak an exact text message."""
        if not self.is_ready or not self._ws:
            return
        payload = DeepgramInjectAgentMessage(message=message, behavior=behavior)
        try:
            await self._ws.send(payload.model_dump_json())
            logger.info(f"Injected agent greeting/message: {message[:40]}...")
        except Exception as e:
            logger.error(f"Error injecting agent message: {e}")

    async def inject_user_message(self, content: str):
        """Simulates a user text message turn (e.g. from chat sidebar or manual testing) to prompt the agent to respond."""
        if not self.is_ready or not self._ws:
            return
        payload = DeepgramInjectUserMessage(content=content)
        try:
            await self._ws.send(payload.model_dump_json())
            logger.info(f"Injected user message: {content[:40]}...")
        except Exception as e:
            logger.error(f"Error injecting user message: {e}")


    async def update_speak(self, provider: dict) -> bool:
        """Sends UpdateSpeak so the voice changes mid-call (e.g. a multilingual voice told the new language)."""
        if not self.is_ready or not self._ws:
            return False
        try:
            await self._ws.send(json.dumps({"type": "UpdateSpeak", "speak": {"provider": provider}}))
            logger.info(f"Sent UpdateSpeak to Voice Engine (language={provider.get('language')}).")
            return True
        except Exception as e:
            logger.error(f"Error sending UpdateSpeak: {e}")
            return False

    async def update_prompt(self, prompt: str) -> bool:
        """Sends UpdatePrompt to Deepgram mid-conversation. Returns True if sent successfully, raises on error."""
        if not self.is_ready or not self._ws:
            logger.warning("[Deepgram] Cannot update prompt: client is not connected or ready.")
            return False
        payload = {"type": "UpdatePrompt", "prompt": prompt}
        try:
            await self._ws.send(json.dumps(payload))
            logger.info("Sent UpdatePrompt to Deepgram.")
            return True
        except Exception as e:
            logger.error(f"Error updating prompt on Deepgram: {e}")
            raise

    async def update_prompt_and_wait_ack(self, prompt: str, timeout: float = 1.0) -> bool:
        """
        Sends UpdatePrompt to Voice Engine and waits for the PromptUpdated acknowledgement event.
        Returns True if acknowledged within timeout, False on timeout, socket failure, or if closed while waiting.
        """
        if not self.is_ready or not self._ws or self._closed_event.is_set():
            logger.warning("[VoiceEngine] Cannot update prompt: client is not connected or ready.")
            return False

        self._prompt_updated_event.clear()
        try:
            await self.update_prompt(prompt)
        except Exception as e:
            logger.error(f"[VoiceEngine] Failed to dispatch UpdatePrompt: {e}")
            return False

        ack_task = asyncio.create_task(self._prompt_updated_event.wait())
        close_task = asyncio.create_task(self._closed_event.wait())
        try:
            done, pending = await asyncio.wait(
                [ack_task, close_task],
                timeout=timeout,
                return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()

            if ack_task in done and self._prompt_updated_event.is_set() and self._is_connected:
                logger.info("[VoiceEngine] PromptUpdated acknowledgement confirmed.")
                return True
            else:
                logger.warning("[VoiceEngine] Client closed or cancelled while waiting for PromptUpdated acknowledgement.")
                return False
        except asyncio.TimeoutError:
            logger.warning(f"[VoiceEngine] Timed out waiting {timeout}s for PromptUpdated acknowledgement.")
            return False
        except Exception as e:
            logger.warning(f"[VoiceEngine] Error waiting for PromptUpdated acknowledgement: {e}")
            return False

    async def _handle_function_call_request(self, data: Dict[str, Any]):
        """Answers client-side function calls (knowledge search) with a FunctionCallResponse."""
        for fn in data.get("functions") or []:
            if not fn.get("client_side", True):
                continue
            name = fn.get("name")
            call_id = fn.get("id")
            if name != "search_knowledge":
                content = "Unknown function."
            else:
                content = await self._run_knowledge_search(fn.get("arguments"))
            if not self._ws or not self._is_connected:
                return
            try:
                await self._ws.send(json.dumps({
                    "type": "FunctionCallResponse",
                    "id": call_id,
                    "name": name,
                    "content": content,
                }))
            except Exception as e:
                logger.error(f"Error sending FunctionCallResponse: {e}")

    async def _run_knowledge_search(self, raw_arguments: Any) -> str:
        scope = self._knowledge_scope
        if not scope:
            return "No knowledge base is attached to this agent."
        try:
            args = json.loads(raw_arguments) if isinstance(raw_arguments, str) else (raw_arguments or {})
            query = str(args.get("query", "")).strip()
            if not query:
                return "No query provided."
            started = time.perf_counter()
            from app.services.knowledge_service import knowledge_service
            context = await asyncio.wait_for(
                knowledge_service.get_grounding_context_for_call(
                    organization_id=scope["organization_id"],
                    user_transcript=query,
                    document_ids=scope.get("document_ids"),
                ),
                timeout=5.0,
            )
            logger.info(f"[Knowledge] search '{query[:60]}' -> {'hit' if context else 'miss'} in {(time.perf_counter() - started) * 1000:.0f}ms")
            if not context:
                return "No matching information was found. Say you will have the solution team follow up; do not guess."
            return context
        except asyncio.TimeoutError:
            logger.warning("[Knowledge] search timed out")
            return "The lookup took too long. Answer briefly from what you already know, or offer a follow-up."
        except Exception as e:
            logger.error(f"[Knowledge] search failed: {e}")
            return "The lookup is unavailable right now. Offer a follow-up from the solution team."

    async def send_keep_alive(self):
        """Sends KeepAlive to keep long-running sessions active."""
        if not self.is_ready or not self._ws:
            return
        payload = {"type": "KeepAlive"}
        try:
            await self._ws.send(json.dumps(payload))
        except Exception as e:
            logger.error(f"Error sending KeepAlive: {e}")

    async def _receive_loop(self):
        """Background task receiving messages from Deepgram WebSocket."""
        try:
            while self._is_connected and self._ws:
                msg = await self._ws.recv()

                # Handle binary audio frame from TTS
                if isinstance(msg, bytes):
                    self._audio_received_event.set()
                    if self.on_audio:
                        await self.on_audio(msg)
                    continue

                # Handle JSON text event
                try:
                    data = json.loads(msg)
                except Exception:
                    continue

                event_type = data.get("type")
                if not event_type:
                    continue

                # Dispatch generic event callback
                if self.on_event:
                    await self.on_event(event_type, data)

                if event_type == DeepgramEventType.WELCOME:
                    self._session_id = data.get("session_id")
                    self._welcome_event.set()
                    logger.info(f"Deepgram Welcome received. Session ID: {self._session_id}")

                elif event_type == DeepgramEventType.SETTINGS_APPLIED:
                    self._settings_applied_event.set()
                    logger.info("Deepgram SettingsApplied received.")

                elif event_type in (
                    DeepgramEventType.PROMPT_UPDATED,
                    DeepgramEventType.THINK_UPDATED,
                    "PromptUpdated",
                    "ThinkUpdated",
                ):
                    self._prompt_updated_event.set()
                    logger.info(f"Deepgram {event_type} acknowledgement received.")

                elif event_type == DeepgramEventType.FUNCTION_CALL_REQUEST:
                    # Run lookups off the receive loop so agent audio keeps flowing while the search executes.
                    task = asyncio.create_task(self._handle_function_call_request(data))
                    self._function_tasks.add(task)
                    task.add_done_callback(self._function_tasks.discard)

                elif event_type == DeepgramEventType.CONVERSATION_TEXT:
                    role = data.get("role", "assistant")
                    content = data.get("content", "")
                    if self.on_transcript:
                        await self.on_transcript(role, content)

                elif event_type == DeepgramEventType.USER_STARTED_SPEAKING:
                    logger.info("Deepgram: UserStartedSpeaking (Barge-in trigger)")
                    if self.on_user_speaking:
                        await self.on_user_speaking()

                elif event_type == DeepgramEventType.AGENT_THINKING:
                    if self.on_agent_thinking:
                        await self.on_agent_thinking(data)

                elif event_type == DeepgramEventType.AGENT_STARTED_SPEAKING:
                    if self.on_agent_speaking:
                        await self.on_agent_speaking(data)

                elif event_type == DeepgramEventType.AGENT_AUDIO_DONE:
                    if self.on_agent_audio_done:
                        await self.on_agent_audio_done()

                elif event_type == DeepgramEventType.ERROR:
                    err_msg = data.get("message") or data.get("description") or data.get("error") or str(data)
                    logger.error(f"Deepgram Error event: {err_msg} | Full payload: {data}")
                    if not self._is_ready:
                        # Refused while starting up: wake the handshake so it fails (and retries) at once, not after the timeout.
                        self._handshake_error = err_msg
                        self._welcome_event.set()
                        self._settings_applied_event.set()
                    elif self.on_error:
                        await self.on_error(err_msg)

                elif event_type == DeepgramEventType.WARNING:
                    warn_msg = data.get("message") or data.get("description") or data.get("warning") or data.get("warn") or str(data)
                    logger.warning(f"Deepgram Warning event: {warn_msg} | Full payload: {data}")

        except websockets.exceptions.ConnectionClosed:
            logger.info("Deepgram WebSocket connection closed.")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Deepgram receive loop error: {e}")
            if self.on_error:
                await self.on_error(str(e))
        finally:
            self._is_connected = False
            self._is_ready = False

    async def close(self):
        """Cleanly closes WebSocket connection and stops listener tasks."""
        self._is_connected = False
        self._is_ready = False
        self._closed_event.set()
        self._welcome_event.set()
        self._settings_applied_event.set()
        self._audio_received_event.set()
        # Note: Do not set _prompt_updated_event on close, so update_prompt_and_wait_ack returns False
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("Voice Agent client closed cleanly.")
