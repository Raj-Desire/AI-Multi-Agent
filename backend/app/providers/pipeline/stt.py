"""Streaming speech-to-text client (Deepgram live /v1/listen WebSocket).

Vendor details stay in this module; log and error text is vendor-neutral.
"""
import asyncio
import json
import logging
import time
from typing import Awaitable, Callable, List, Optional
from urllib.parse import urlencode

import websockets

from app.providers.pipeline.log_safety import LogGuard, guard_connection_logs

logger = logging.getLogger(__name__)

_BYTES_PER_SEC = 8000  # 8 kHz mu-law mono
_MAX_PENDING_BYTES = int(1.5 * _BYTES_PER_SEC)


class StreamingSTT:
    def __init__(
        self,
        api_key: str,
        *,
        language: str = "gu",
        model: str = "nova-3",
        endpointing_ms: int = 300,
        utterance_end_ms: int = 1000,
        on_transcript: Callable[[str, bool, bool], Awaitable[None]],
        on_speech_started: Callable[[], Awaitable[None]],
        on_utterance_end: Callable[[], Awaitable[None]],
        on_lost: Callable[[str], Awaitable[None]],
        url: str = "wss://api.deepgram.com/v1/listen",
        reconnect_delay_s: float = 0.2,
        lost_window_s: float = 10.0,
        keepalive_s: float = 5.0,
    ):
        self._api_key = api_key
        self._language = language
        self._model = model
        self._endpointing_ms = endpointing_ms
        self._utterance_end_ms = utterance_end_ms
        self._on_transcript = on_transcript
        self._on_speech_started = on_speech_started
        self._on_utterance_end = on_utterance_end
        self._on_lost = on_lost
        self._url = url
        self._reconnect_delay_s = reconnect_delay_s
        self._lost_window_s = lost_window_s
        self._keepalive_s = keepalive_s

        self._ws = None
        self._recv_task: Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self._reconnect_task: Optional[asyncio.Task] = None
        self._closing = False
        self._lost = False
        self._reconnecting = False
        self._last_failure: Optional[float] = None
        self._pending: List[bytes] = []
        self._pending_bytes = 0
        self._log_guard: Optional[LogGuard] = None  # keeps the key out of connection logs while open

    def _full_url(self) -> str:
        params = {
            "model": self._model,
            "language": self._language,
            "encoding": "mulaw",
            "sample_rate": 8000,
            "channels": 1,
            "interim_results": "true",
            "vad_events": "true",
            "endpointing": self._endpointing_ms,
            "utterance_end_ms": self._utterance_end_ms,
        }
        return f"{self._url}?{urlencode(params)}"

    async def _open(self) -> None:
        self._ws = await websockets.connect(
            self._full_url(),
            additional_headers={"Authorization": f"Token {self._api_key.strip()}"},
            ping_interval=None,
            close_timeout=2,
        )
        self._recv_task = asyncio.create_task(self._recv_loop(self._ws))

    async def connect(self) -> None:
        self._closing = False
        if self._log_guard is None:
            self._log_guard = guard_connection_logs(self._api_key)
        try:
            await self._open()
        except BaseException:
            self._release_log_guard()
            raise
        if self._keepalive_task is None:
            self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info("[Listening] connected")

    async def send_audio(self, chunk: bytes) -> None:
        if self._closing or self._lost:
            return
        if self._reconnecting or self._ws is None:
            self._pending.append(chunk)
            self._pending_bytes += len(chunk)
            while self._pending_bytes > _MAX_PENDING_BYTES and self._pending:
                self._pending_bytes -= len(self._pending.pop(0))
            return
        try:
            await self._ws.send(chunk)
        except Exception:
            pass  # the receive loop notices the closed connection and recovers

    async def _keepalive_loop(self) -> None:
        try:
            while not self._closing:
                await asyncio.sleep(self._keepalive_s)
                ws = self._ws
                if ws is None or self._reconnecting:
                    continue
                try:
                    await ws.send(json.dumps({"type": "KeepAlive"}))
                except Exception:
                    pass
        except asyncio.CancelledError:
            pass

    async def _recv_loop(self, ws) -> None:
        try:
            async for raw in ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if not isinstance(msg, dict):
                    continue
                await self._dispatch(msg)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("[Listening] receive loop error: %s", type(e).__name__)
        if not self._closing and ws is self._ws:
            self._reconnect_task = asyncio.create_task(self._handle_failure())

    async def _dispatch(self, msg: dict) -> None:
        kind = msg.get("type")
        try:
            if kind == "Results":
                alts = (msg.get("channel") or {}).get("alternatives") or [{}]
                text = alts[0].get("transcript") or ""
                if text:
                    await self._on_transcript(
                        text, bool(msg.get("is_final")), bool(msg.get("speech_final"))
                    )
            elif kind == "SpeechStarted":
                await self._on_speech_started()
            elif kind == "UtteranceEnd":
                await self._on_utterance_end()
        except Exception:
            logger.exception("[Listening] callback failed")

    async def _handle_failure(self) -> None:
        now = time.monotonic()
        recent = self._last_failure is not None and now - self._last_failure <= self._lost_window_s
        self._last_failure = now
        if recent:
            await self._declare_lost("listening connection lost twice")
            return
        self._reconnecting = True
        logger.warning("[Listening] connection closed, reconnecting")
        await asyncio.sleep(self._reconnect_delay_s)
        try:
            if self._closing:
                return
            await self._open()
            while self._pending:
                chunk = self._pending.pop(0)
                self._pending_bytes -= len(chunk)
                await self._ws.send(chunk)
            self._reconnecting = False
        except Exception:
            self._reconnecting = False
            await self._declare_lost("listening reconnect failed")

    async def _declare_lost(self, reason: str) -> None:
        if self._lost or self._closing:
            return
        self._lost = True
        logger.error("[Listening] %s", reason)
        try:
            await self._on_lost(reason)
        except Exception:
            logger.exception("[Listening] on_lost callback failed")

    async def close(self) -> None:
        self._closing = True
        me = asyncio.current_task()
        ws, self._ws = self._ws, None
        tasks = [t for t in (self._keepalive_task, self._reconnect_task, self._recv_task)
                 if t and t is not me]
        for t in tasks:
            t.cancel()
        if ws is not None:
            try:
                await ws.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass
            try:
                await ws.close()
            except Exception:
                pass
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._release_log_guard()

    def _release_log_guard(self) -> None:
        guard, self._log_guard = self._log_guard, None
        if guard is not None:
            guard.release()
