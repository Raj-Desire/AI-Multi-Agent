"""Streaming text-to-speech client (Cartesia TTS WebSocket, 8 kHz mu-law).

Vendor docs used (verified live):
  https://docs.cartesia.ai/api-reference/tts/websocket  (generation/cancel
  requests, chunk/done/error messages, X-API-Key header)
  https://docs.cartesia.ai/api-reference/tts/bytes      (one-shot fallback)
The docs call the version parameter `cartesia_version` (required) and show
a newer value than the repo constant; they do not say header vs query. We send
the `Cartesia-Version` header (as the repo's existing client does) and also the
query parameter. Adjust API_VERSION default if the vendor rejects it.

Vendor details stay in this module; log and error text is vendor-neutral.
"""
import asyncio
import base64
import json
import logging
from typing import AsyncIterator, Dict, Optional, Set
from urllib.parse import urlencode

import httpx
import websockets

from app.voice_stack.registry import CARTESIA_API_VERSION

logger = logging.getLogger(__name__)
logging.getLogger("websockets").setLevel(logging.INFO)

WS_URL = "wss://api.cartesia.ai/tts/websocket"
BYTES_URL = "https://api.cartesia.ai/tts/bytes"
AUTH_HEADER = "X-API-Key"
VERSION_HEADER = "Cartesia-Version"
VERSION_QUERY = "cartesia_version"
OUTPUT_FORMAT = {"container": "raw", "encoding": "pcm_mulaw", "sample_rate": 8000}
KEY_MODEL = "model_id"
KEY_TRANSCRIPT = "transcript"
KEY_VOICE = "voice"
KEY_LANGUAGE = "language"
KEY_CONTEXT = "context_id"
KEY_OUTPUT = "output_format"
KEY_CONTINUE = "continue"
KEY_CANCEL = "cancel"
MSG_TYPE = "type"
MSG_CHUNK = "chunk"
MSG_DONE = "done"
MSG_ERROR = "error"
KEY_DATA = "data"

_BYTES_PER_MS = 8  # 8 kHz mu-law mono
FIRST_CHUNK_TIMEOUT_S = 5.0
IDLE_TIMEOUT_S = 10.0

_DONE = object()


class TtsUnavailable(Exception):
    pass


class _Failed:
    pass


class StreamingTTS:
    def __init__(
        self,
        api_key: str,
        *,
        voice_id: str,
        model_id: str,
        language: str,
        ws_url: str = WS_URL,
        bytes_url: str = BYTES_URL,
        api_version: str = CARTESIA_API_VERSION,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        chunk_ms: int = 40,
        first_chunk_timeout_s: float = FIRST_CHUNK_TIMEOUT_S,
        idle_timeout_s: float = IDLE_TIMEOUT_S,
    ):
        self._api_key = api_key
        self._voice_id = voice_id
        self._model_id = model_id
        self._language = language
        self._ws_url = ws_url
        self._bytes_url = bytes_url
        self._api_version = api_version
        self._transport = transport
        self._chunk_bytes = max(1, chunk_ms * _BYTES_PER_MS)
        self._first_timeout = first_chunk_timeout_s
        self._idle_timeout = idle_timeout_s

        self._ws = None
        self._recv_task: Optional[asyncio.Task] = None
        self._queues: Dict[str, asyncio.Queue] = {}
        self._cancelled: Set[str] = set()
        self._closing = False
        self._connect_lock = asyncio.Lock()

    # ---- connection ----
    def _headers(self) -> dict:
        return {AUTH_HEADER: self._api_key.strip(), VERSION_HEADER: self._api_version}

    def _full_ws_url(self) -> str:
        sep = "&" if "?" in self._ws_url else "?"
        return f"{self._ws_url}{sep}{urlencode({VERSION_QUERY: self._api_version})}"

    async def _ensure_ws(self):
        async with self._connect_lock:
            if self._closing:
                raise TtsUnavailable("Voice engine service unavailable")
            if self._ws is not None:
                return self._ws
            last: Optional[Exception] = None
            for _ in range(2):  # first attempt plus one reconnect
                try:
                    ws = await asyncio.wait_for(
                        websockets.connect(
                            self._full_ws_url(),
                            additional_headers=self._headers(),
                            ping_interval=None,
                            close_timeout=2,
                        ),
                        self._first_timeout,
                    )
                    self._ws = ws
                    self._recv_task = asyncio.create_task(self._recv_loop(ws))
                    return ws
                except Exception as exc:  # noqa: BLE001
                    last = exc
            logger.warning("[Speaking] connection failed (%s)", type(last).__name__)
            raise TtsUnavailable("Voice engine service unavailable")

    async def _recv_loop(self, ws) -> None:
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except Exception:  # noqa: BLE001
                    continue
                if not isinstance(msg, dict):
                    continue
                q = self._queues.get(msg.get(KEY_CONTEXT))
                if q is None:
                    continue
                mtype = msg.get(MSG_TYPE)
                if mtype == MSG_CHUNK:
                    data = msg.get(KEY_DATA)
                    if isinstance(data, str) and data:
                        try:
                            q.put_nowait(base64.b64decode(data))
                        except Exception:  # noqa: BLE001
                            pass
                elif mtype == MSG_DONE:
                    q.put_nowait(_DONE)
                elif mtype == MSG_ERROR:
                    q.put_nowait(_Failed())
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            pass
        finally:
            if self._ws is ws:
                self._ws = None
            for q in list(self._queues.values()):
                q.put_nowait(_Failed())

    # ---- public API ----
    def _request(self, text: str, context_id: str) -> dict:
        return {
            KEY_MODEL: self._model_id,
            KEY_TRANSCRIPT: text,
            KEY_VOICE: {"mode": "id", "id": self._voice_id},
            KEY_LANGUAGE: self._language,
            KEY_CONTEXT: context_id,
            KEY_OUTPUT: dict(OUTPUT_FORMAT),
            KEY_CONTINUE: False,
        }

    async def _send_cancel(self, context_id: str) -> None:
        ws = self._ws
        if ws is None:
            return
        try:
            await asyncio.wait_for(
                ws.send(json.dumps({KEY_CONTEXT: context_id, KEY_CANCEL: True})), 1.0
            )
        except Exception:  # noqa: BLE001
            pass

    async def cancel(self, context_id: str) -> None:
        q = self._queues.get(context_id)
        if q is None or context_id in self._cancelled:
            return
        self._cancelled.add(context_id)
        q.put_nowait(_DONE)
        await self._send_cancel(context_id)

    async def speak(self, text: str, *, context_id: str) -> AsyncIterator[bytes]:
        got_audio = False
        finished = False
        q: asyncio.Queue = asyncio.Queue()
        self._queues[context_id] = q
        buf = b""
        try:
            try:
                ws = await self._ensure_ws()
                await ws.send(json.dumps(self._request(text, context_id)))
                streaming = True
            except Exception:  # noqa: BLE001
                streaming = False
            while streaming:
                timeout = self._idle_timeout if got_audio else self._first_timeout
                try:
                    item = await asyncio.wait_for(q.get(), timeout)
                except asyncio.TimeoutError:
                    item = _Failed()
                if item is _DONE:
                    finished = True
                    break
                if isinstance(item, _Failed):
                    break
                buf += item
                while len(buf) >= self._chunk_bytes:
                    out, buf = buf[: self._chunk_bytes], buf[self._chunk_bytes:]
                    got_audio = True
                    yield out
            if streaming and finished:
                if buf and context_id not in self._cancelled:
                    yield buf
                return
            if got_audio:
                raise TtsUnavailable("Voice engine service unavailable")
            # nothing played: one-shot fallback for this sentence
            if streaming:
                await self._send_cancel(context_id)
            finished = True
            audio = await self._fallback(text)
            for i in range(0, len(audio), self._chunk_bytes):
                if context_id in self._cancelled:
                    return
                yield audio[i: i + self._chunk_bytes]
        finally:
            self._queues.pop(context_id, None)
            was_cancelled = context_id in self._cancelled
            self._cancelled.discard(context_id)
            if not finished and not was_cancelled:
                await self._send_cancel(context_id)

    async def _fallback(self, text: str) -> bytes:
        body = self._request(text, "")
        body.pop(KEY_CONTEXT)
        body.pop(KEY_CONTINUE)
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=self._idle_timeout
            ) as client:
                resp = await client.post(self._bytes_url, json=body, headers=self._headers())
            if resp.status_code != 200 or not resp.content:
                raise TtsUnavailable("Voice engine service unavailable")
            return resp.content
        except TtsUnavailable:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("[Speaking] fallback failed (%s)", type(exc).__name__)
            raise TtsUnavailable("Voice engine service unavailable") from None

    async def close(self) -> None:
        self._closing = True
        ws, self._ws = self._ws, None
        task, self._recv_task = self._recv_task, None
        if ws is not None:
            try:
                await ws.close()
            except Exception:  # noqa: BLE001
                pass
        if task is not None and task is not asyncio.current_task() and not task.done():
            task.cancel()
            try:
                await task
            except BaseException:  # noqa: BLE001
                pass
        for q in list(self._queues.values()):
            q.put_nowait(_Failed())
