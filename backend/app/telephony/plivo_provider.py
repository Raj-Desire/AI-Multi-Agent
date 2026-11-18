"""Plivo adapter: everything Plivo-specific about calls and the audio stream lives here.

Wire formats follow Plivo's audio-streaming reference: the stream is started by an XML <Stream> element returned from
the answer URL; Plivo sends `start` / `media` / `playedStream` events and accepts `playAudio` / `clearAudio`.
Plivo's own `extraHeaders` only allows alphanumeric characters, so the platform's stream parameters (token, organization,
agent, ...) travel in the WebSocket URL query instead and the gateway merges them into the start event.
"""

import asyncio
import base64
import json
import logging
import os
from typing import Dict, Optional
from urllib.parse import urlencode, urlsplit
from xml.sax.saxutils import escape, quoteattr

from fastapi import Request

from app.core.security import decrypt_token
from app.core.webhook_security import _candidate_urls
from app.repositories.plivo_repository import PlivoRepository
from app.telephony.base import TelephonyProvider
from app.telephony.types import PlaceCallRequest, PlacedCall, StreamEvent, TelephonyError

logger = logging.getLogger("telephony.plivo")

_UNREACHABLE = "The server's public address is not reachable by the telephony provider. Set the Public Base URL in telephony settings."


def _make_client(auth_id: str, auth_token: str):
    import plivo

    return plivo.RestClient(auth_id, auth_token)


def check_signature(method: str, url: str, params: Optional[dict], nonce: str, signature: str, auth_token: str) -> bool:
    """Plivo V3 webhook signature (HMAC-SHA256 over URL + sorted POST params + nonce, keyed by the Auth Token)."""
    if not (nonce and signature and auth_token):
        return False
    try:
        from plivo.utils import validate_v3_signature

        return bool(validate_v3_signature(method.upper(), url, nonce, auth_token, signature, params if method.upper() == "POST" else None))
    except Exception:
        return False


def _is_public(base_url: str) -> bool:
    base = (base_url or "").strip().lower()
    return bool(base) and "localhost" not in base and "127.0.0.1" not in base


class PlivoProvider(TelephonyProvider):
    name = "plivo"
    stream_path = "/voice/stream/plivo"
    status_callback_path = "/api/v1/plivo/voice/hangup"
    amd_callback_path = "/api/v1/plivo/voice/amd"
    answer_path = "/api/v1/plivo/voice/answer"
    ring_path = "/api/v1/plivo/voice/ring"
    transfer_path = "/api/v1/plivo/voice/transfer"

    CONTENT_TYPE = "audio/x-mulaw"
    STREAM_CONTENT_TYPE = "audio/x-mulaw;rate=8000"
    SAMPLE_RATE = 8000

    # -- stream messages -------------------------------------------------------------------------------------------

    def parse_stream_message(self, raw: str) -> StreamEvent:
        try:
            data = json.loads(raw)
        except Exception:
            return StreamEvent(kind="other")
        if not isinstance(data, dict):
            return StreamEvent(kind="other")
        event = data.get("event")
        if event == "start":
            start = data.get("start") or {}
            return StreamEvent(kind="start", stream_id=start.get("streamId") or data.get("streamId"), call_id=start.get("callId"))
        if event == "media":
            payload = (data.get("media") or {}).get("payload") or ""
            try:
                audio = base64.b64decode(payload) if payload else b""
            except Exception:
                audio = b""
            return StreamEvent(kind="media", stream_id=data.get("streamId"), audio=audio)
        if event in ("stop", "stopped"):
            return StreamEvent(kind="stop", stream_id=data.get("streamId"))
        if event == "playedStream":
            return StreamEvent(kind="mark", stream_id=data.get("streamId"), mark_name=data.get("name"))
        return StreamEvent(kind="other")

    def build_media_message(self, stream_id: str, audio: bytes) -> str:
        return json.dumps({
            "event": "playAudio",
            "media": {"contentType": self.CONTENT_TYPE, "sampleRate": self.SAMPLE_RATE, "payload": base64.b64encode(audio).decode("utf-8")},
        })

    def build_clear_message(self, stream_id: str) -> str:
        return json.dumps({"event": "clearAudio", "streamId": stream_id})

    # -- XML returned to Plivo -------------------------------------------------------------------------------------

    @classmethod
    def build_answer_xml(cls, stream_url: str, params: Dict[str, str]) -> str:
        url = f"{stream_url}?{urlencode({k: str(v) for k, v in params.items()})}" if params else stream_url
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<Response><Stream bidirectional="true" keepCallAlive="true" contentType="{cls.STREAM_CONTENT_TYPE}">{escape(url)}</Stream></Response>'
        )

    @staticmethod
    def build_transfer_xml(destination: str, caller_id: Optional[str], whisper: Optional[str], timeout: int, fallback_message: Optional[str]) -> str:
        speak = f"<Speak>{escape(whisper)}</Speak>" if whisper else ""
        caller = f" callerId={quoteattr(caller_id)}" if caller_id else ""
        fallback = f"<Speak>{escape(fallback_message)}</Speak>" if fallback_message else ""
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<Response>{speak}<Dial{caller} timeout="{max(5, min(120, int(timeout)))}"><Number>{escape(destination)}</Number></Dial>{fallback}<Hangup/></Response>'
        )

    # -- call control ----------------------------------------------------------------------------------------------

    async def _client(self, org_id: str):
        cfg = await PlivoRepository().get_by_org(org_id)
        if not cfg or not cfg.auth_id or not cfg.encrypted_auth_token:
            return None, None
        return cfg, _make_client(cfg.auth_id, decrypt_token(cfg.encrypted_auth_token))

    async def place_call(self, req: PlaceCallRequest) -> PlacedCall:
        cfg, client = await self._client(req.organization_id)
        if not cfg:
            raise TelephonyError("Telephony is not configured for this organization.")
        if not _is_public(req.public_base_url):
            raise TelephonyError(_UNREACHABLE)

        answer_url = f"{req.public_base_url.rstrip('/')}{self.answer_path}?{urlencode({k: str(v) for k, v in req.stream_params.items()})}"
        kwargs = {"from_": req.from_number, "to_": req.to_number, "answer_url": answer_url, "answer_method": "POST", "time_limit": req.time_limit_seconds}
        if req.ring_timeout_seconds:
            kwargs["ring_timeout"] = max(5, min(int(req.ring_timeout_seconds), 120))
        if req.status_callback_url:
            kwargs["hangup_url"] = req.status_callback_url
            kwargs["hangup_method"] = "POST"
            kwargs["ring_url"] = req.status_callback_url.replace(self.status_callback_path, self.ring_path, 1)
            kwargs["ring_method"] = "POST"
        if req.amd_callback_url:
            kwargs["machine_detection"] = "true"
            kwargs["machine_detection_url"] = req.amd_callback_url
            kwargs["machine_detection_method"] = "POST"

        try:
            response = await asyncio.to_thread(lambda: client.calls.create(**kwargs))
        except Exception as e:
            logger.warning(f"[PlivoProvider] place_call failed: {e}")
            raise TelephonyError("The call could not be placed. Please check the number and try again.", detail=str(e))
        # Plivo returns a request id now; the call id (CallUUID) arrives with the answer webhook, which re-keys the call.
        return PlacedCall(call_id=response.request_uuid, status="queued", duration=0)

    async def end_call(self, org_id: str, call_id: str) -> bool:
        cfg, client = await self._client(org_id)
        if not cfg:
            return False
        try:
            await asyncio.to_thread(lambda: client.calls.delete(call_uuid=call_id))
            return True
        except Exception as e:
            logger.warning(f"[PlivoProvider] Error ending call {call_id}: {e}")
            return False

    async def transfer_call(
        self,
        org_id: str,
        call_id: str,
        destination_phone: str,
        caller_id: Optional[str] = None,
        whisper_message: Optional[str] = None,
        timeout_seconds: int = 25,
        fallback_action: str = "hangup",
        fallback_message: Optional[str] = None,
        action_callback_url: Optional[str] = None,
    ) -> bool:
        cfg, client = await self._client(org_id)
        if not cfg:
            return False
        base = (os.getenv("PUBLIC_BASE_URL") or cfg.public_base_url or "").strip().rstrip("/")
        if not _is_public(base):
            return False
        query = {"to": destination_phone, "timeout": str(timeout_seconds)}
        if caller_id:
            query["caller_id"] = caller_id
        if whisper_message:
            query["whisper"] = whisper_message
        if fallback_message:
            query["fallback"] = fallback_message
        aleg_url = f"{base}{self.transfer_path}?{urlencode(query)}"
        try:
            await asyncio.to_thread(lambda: client.calls.transfer(call_uuid=call_id, legs="aleg", aleg_url=aleg_url, aleg_method="POST"))
            return True
        except Exception as e:
            logger.warning(f"[PlivoProvider] Error transferring call {call_id} to {destination_phone}: {e}")
            return False

    async def delete_recording(self, org_id: str, call_id: str) -> int:
        cfg, client = await self._client(org_id)
        if not cfg:
            return 0

        def _delete() -> int:
            listing = client.recordings.list(call_uuid=call_id)
            deleted = 0
            for rec in getattr(listing, "objects", []) or []:
                client.recordings.delete(recording_id=rec.recording_id)
                deleted += 1
            return deleted

        try:
            return await asyncio.to_thread(_delete)
        except Exception as e:
            logger.warning(f"[PlivoProvider] Could not delete recordings for {call_id}: {e}")
            return 0

    async def get_call_status(self, org_id: str, call_id: str) -> Optional[tuple]:
        cfg, client = await self._client(org_id)
        if not cfg:
            return None

        def _fetch():
            try:
                live = client.calls.live_call_get(call_uuid=call_id)
                state = (getattr(live, "call_status", "") or "").lower()
                return ("in-progress" if state in ("in-progress", "answered") else state or "ringing", None, 0)
            except Exception:
                cdr = client.calls.get(call_id)  # a call-detail record exists once the call has ended
                return ("completed", None, int(getattr(cdr, "bill_duration", 0) or 0))

        try:
            return await asyncio.to_thread(_fetch)
        except Exception as e:
            logger.warning(f"[PlivoProvider] Could not read call status for {call_id}: {e}")
            return None

    async def verify_webhook(self, request: Request) -> Optional[bool]:
        signature = request.headers.get("x-plivo-signature-v3") or ""
        nonce = request.headers.get("x-plivo-signature-v3-nonce") or ""
        if not signature or not nonce:
            return False

        params: Dict[str, str] = {}
        if request.method == "POST":
            try:
                form = await request.form()
                params = {k: v for k, v in form.items() if isinstance(v, str)}
            except Exception:
                params = {}

        # Which tenant's Auth Token signs this request: named in the URL (calls we placed) or owner of the number called
        repo = PlivoRepository()
        cfg = None
        org_id = request.query_params.get("organization_id")
        if org_id:
            cfg = await repo.get_by_org(org_id)
        if not cfg:
            for number in (params.get("To"), params.get("From")):
                if number:
                    cfg = await repo.get_by_phone_number(number)
                    if cfg:
                        break
        if not cfg:
            return None
        try:
            token = decrypt_token(cfg.encrypted_auth_token)
        except Exception:
            return False
        urls = _candidate_urls(request, [os.getenv("PUBLIC_BASE_URL") or "", getattr(cfg, "public_base_url", None) or ""])
        return any(check_signature(request.method, url, params, nonce, signature, token) for url in urls)
