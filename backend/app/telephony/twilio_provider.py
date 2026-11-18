"""Twilio adapter: everything Twilio-specific about calls and the media stream lives here."""

import asyncio
import json
import logging
import time
from typing import Dict, Optional
from xml.sax.saxutils import quoteattr

from fastapi import Request
from twilio.rest import Client

from app.core.security import decrypt_token
from app.core.webhook_security import verify_twilio_signature
from app.repositories.twilio_repository import TwilioRepository
from app.services.twilio_service import TwilioService
from app.telephony.base import TelephonyProvider
from app.telephony.types import PlaceCallRequest, PlacedCall, StreamEvent, TelephonyError
from app.voice.audio import AudioAdapter

logger = logging.getLogger("telephony.twilio")

_STATUS_CACHE: Dict[str, tuple] = {}  # call_sid -> (monotonic_ts, status, start_time_iso, duration)


class TwilioProvider(TelephonyProvider):
    name = "twilio"
    stream_path = "/voice/stream"
    status_callback_path = "/api/v1/twilio/voice/status"
    amd_callback_path = "/api/v1/twilio/voice/amd"

    # -- stream messages -------------------------------------------------------------------------------------------

    def parse_stream_message(self, raw: str) -> StreamEvent:
        try:
            data = json.loads(raw)
        except Exception:
            return StreamEvent(kind="other")
        if not isinstance(data, dict):
            return StreamEvent(kind="other")
        event = data.get("event")
        if event == "connected":
            return StreamEvent(kind="connected")
        if event == "start":
            start = data.get("start") or {}
            return StreamEvent(
                kind="start",
                stream_id=data.get("streamSid") or start.get("streamSid"),
                call_id=start.get("callSid"),
                custom_params=dict(start.get("customParameters") or {}),
            )
        if event == "media":
            payload = (data.get("media") or {}).get("payload")
            return StreamEvent(kind="media", stream_id=data.get("streamSid"), audio=AudioAdapter.twilio_media_to_bytes(payload or ""))
        if event == "stop":
            return StreamEvent(kind="stop", stream_id=data.get("streamSid"))
        if event == "mark":
            return StreamEvent(kind="mark", stream_id=data.get("streamSid"), mark_name=(data.get("mark") or {}).get("name"))
        return StreamEvent(kind="other")

    def build_media_message(self, stream_id: str, audio: bytes) -> str:
        return AudioAdapter.create_twilio_media_message(stream_id, audio)

    def build_clear_message(self, stream_id: str) -> str:
        return AudioAdapter.create_twilio_clear_message(stream_id)

    # -- call control ----------------------------------------------------------------------------------------------

    async def place_call(self, req: PlaceCallRequest) -> PlacedCall:
        cfg = await TwilioRepository().get_by_org(req.organization_id)
        if not cfg or not cfg.account_sid or not cfg.encrypted_auth_token:
            raise TelephonyError("Telephony is not configured for this organization.")

        params = "\n".join(
            f"            <Parameter name={quoteattr(str(k))} value={quoteattr(str(v))} />" for k, v in req.stream_params.items()
        )
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url={quoteattr(req.stream_url)}>
{params}
        </Stream>
    </Connect>
    <Hangup/>
</Response>"""

        def _sync_call():
            client = Client(cfg.account_sid, decrypt_token(cfg.encrypted_auth_token))
            kwargs = {"to": req.to_number, "from_": req.from_number, "twiml": twiml, "time_limit": req.time_limit_seconds}
            if req.ring_timeout_seconds:
                # How long the phone may ring before no-answer is reported (default is ~60s)
                kwargs["timeout"] = max(5, min(int(req.ring_timeout_seconds), 120))
            if req.amd_callback_url:
                # Audio-based voicemail detection: catches answering machines in any language.
                kwargs["machine_detection"] = "Enable"
                kwargs["async_amd"] = True
                kwargs["async_amd_status_callback"] = req.amd_callback_url
                kwargs["async_amd_status_callback_method"] = "POST"
            if req.status_callback_url:
                kwargs["status_callback"] = req.status_callback_url
                # Only these four events are accepted; busy / no-answer / canceled all arrive as "completed"
                kwargs["status_callback_event"] = ["initiated", "ringing", "answered", "completed"]
                kwargs["status_callback_method"] = "POST"
            return client.calls.create(**kwargs)

        try:
            call = await asyncio.to_thread(_sync_call)
        except Exception as e:
            logger.warning(f"[TwilioProvider] place_call failed: {e}")
            raise TelephonyError("The call could not be placed. Please check the number and try again.", detail=str(e))
        duration = int(call.duration) if call.duration and str(call.duration).isdigit() else 0
        return PlacedCall(call_id=call.sid, status=call.status or "initiated", duration=duration)

    async def end_call(self, org_id: str, call_id: str) -> bool:
        return await TwilioService(TwilioRepository()).end_call(org_id, call_id)

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
        # Passed through unchanged: None means "say nothing" (the gateway announces the transfer itself).
        return await TwilioService(TwilioRepository()).transfer_call(
            org_id,
            call_id,
            destination_phone,
            caller_id=caller_id,
            whisper_message=whisper_message,
            timeout_seconds=timeout_seconds,
            fallback_action=fallback_action,
            fallback_message=fallback_message,
            action_callback_url=action_callback_url,
        )

    async def delete_recording(self, org_id: str, call_id: str) -> int:
        return await TwilioService(TwilioRepository()).delete_call_recording(org_id, call_id)

    async def get_call_status(self, org_id: str, call_id: str) -> Optional[tuple]:
        """(status, start_time_iso, duration) straight from the provider, cached ~1.5 s."""
        cached = _STATUS_CACHE.get(call_id)
        if cached and time.monotonic() - cached[0] < 1.5:
            return cached[1:]
        cfg = await TwilioRepository().get_by_org(org_id)
        if not cfg:
            return None

        def _fetch():
            c = Client(cfg.account_sid, decrypt_token(cfg.encrypted_auth_token)).calls(call_id).fetch()
            return (c.status or "", c.start_time.isoformat() if c.start_time else None, int(c.duration or 0))

        try:
            result = await asyncio.to_thread(_fetch)
        except Exception as e:
            logger.warning(f"[TwilioProvider] Could not read call status for {call_id}: {e}")
            return None
        _STATUS_CACHE[call_id] = (time.monotonic(),) + result
        return result

    async def verify_webhook(self, request: Request) -> Optional[bool]:
        return await verify_twilio_signature(request)
