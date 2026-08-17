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

from app.providers.deepgram.configuration import DeepgramSettingsConfiguration, DeepgramInjectAgentMessage
from app.providers.deepgram.events import DeepgramEventType

logger = logging.getLogger("deepgram.voice_agent")
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
        self._is_connected = False
        self._is_ready = False
        self._session_id: Optional[str] = None

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
            self._welcome_event.clear()
            self._settings_applied_event.clear()

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

            self._is_ready = True
            logger.info("Deepgram Voice Agent initialized successfully.")

            # Step 5: Inject initial greeting only if not already declared in settings.agent.greeting
            if not getattr(settings.agent, "greeting", None) and greeting and greeting.strip():
                await self.inject_agent_message(greeting.strip())

            return True

        except Exception as e:
            logger.error(f"Failed to connect/configure Deepgram Voice Agent: {e}")
            if self.on_error:
                await self.on_error(str(e))
            await self.close()
            raise

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

    async def update_prompt(self, prompt: str):
        """Swaps the LLM prompt mid-conversation without disconnecting."""
        if not self.is_ready or not self._ws:
            return
        payload = {"type": "UpdatePrompt", "prompt": prompt}
        try:
            await self._ws.send(json.dumps(payload))
            logger.info("Sent UpdatePrompt to Deepgram.")
        except Exception as e:
            logger.error(f"Error updating prompt: {e}")

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
                    err_msg = data.get("message", "Unknown Deepgram error")
                    logger.error(f"Deepgram Error event: {err_msg}")
                    if self.on_error:
                        await self.on_error(err_msg)

                elif event_type == DeepgramEventType.WARNING:
                    logger.warning(f"Deepgram Warning: {data.get('message')}")

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
        logger.info("Deepgram Voice Agent client closed cleanly.")
