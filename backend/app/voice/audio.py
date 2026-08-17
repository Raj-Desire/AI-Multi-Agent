"""
Audio Adapter Layer
Handles codec formatting and bidirectional conversion between Twilio Media Streams
and Deepgram Voice Agent API.

Twilio Media Streams:
- Format: G.711 mu-law (PCMU)
- Sample Rate: 8000 Hz
- Channels: 1 (mono)
- Framing: base64-encoded payload in JSON message (typically 20ms chunks / 160 bytes)

Deepgram Voice Agent API:
- Configured for: encoding="mulaw", sample_rate=8000
- Input: raw binary bytes over WebSocket
- Output: raw binary bytes over WebSocket
"""

import base64
import json
from typing import Optional, Dict, Any


class AudioAdapter:
    """Handles audio encoding, decoding, framing, and Twilio message formatting."""

    CODEC = "audio/x-mulaw"
    SAMPLE_RATE = 8000
    CHANNELS = 1
    BYTES_PER_SAMPLE = 1  # G.711 mu-law is 8-bit

    @staticmethod
    def twilio_media_to_bytes(payload_base64: str) -> bytes:
        """Decodes base64 payload from Twilio media packet into raw audio bytes."""
        if not payload_base64:
            return b""
        try:
            return base64.b64decode(payload_base64)
        except Exception:
            return b""

    @staticmethod
    def bytes_to_twilio_media_payload(raw_audio: bytes) -> str:
        """Encodes raw audio bytes to base64 string for Twilio media stream."""
        if not raw_audio:
            return ""
        return base64.b64encode(raw_audio).decode("utf-8")

    @staticmethod
    def create_twilio_media_message(stream_sid: str, raw_audio: bytes) -> str:
        """Constructs a Twilio 'media' WebSocket JSON message from raw audio bytes."""
        payload = AudioAdapter.bytes_to_twilio_media_payload(raw_audio)
        msg: Dict[str, Any] = {
            "event": "media",
            "streamSid": stream_sid,
            "media": {
                "payload": payload
            }
        }
        return json.dumps(msg)

    @staticmethod
    def create_twilio_clear_message(stream_sid: str) -> str:
        """
        Constructs a Twilio 'clear' WebSocket JSON message to immediately interrupt / flush
        Twilio's audio playback buffer upon barge-in.
        """
        msg = {
            "event": "clear",
            "streamSid": stream_sid
        }
        return json.dumps(msg)

    @staticmethod
    def create_twilio_mark_message(stream_sid: str, mark_name: str) -> str:
        """Constructs a Twilio 'mark' message for playback tracking."""
        msg = {
            "event": "mark",
            "streamSid": stream_sid,
            "mark": {
                "name": mark_name
            }
        }
        return json.dumps(msg)
