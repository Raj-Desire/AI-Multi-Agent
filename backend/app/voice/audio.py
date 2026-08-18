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

    # Precomputed ITU-T / Sun G.711 mu-law conversion tables
    _MU_TO_LINEAR = [0] * 256
    _LINEAR_TO_MU = [0] * 65536

    # Initialize lookup tables
    _BIAS = 0x84
    _CLIP = 32635
    for _i in range(256):
        _u_val = ~_i & 0xFF
        _sign = _u_val & 0x80
        _exponent = (_u_val >> 4) & 0x07
        _mantissa = _u_val & 0x0F
        _sample = ((_mantissa << 3) + _BIAS) << _exponent
        _sample -= _BIAS
        _MU_TO_LINEAR[_i] = -_sample if _sign != 0 else _sample

    for _sample in range(-32768, 32768):
        _s = _sample
        if _s < 0:
            _s = -_s
            _sign = 0x80
        else:
            _sign = 0x00
        if _s > _CLIP:
            _s = _CLIP
        _s += _BIAS

        if _s >= 0x4000:
            _exp = 7
        elif _s >= 0x2000:
            _exp = 6
        elif _s >= 0x1000:
            _exp = 5
        elif _s >= 0x0800:
            _exp = 4
        elif _s >= 0x0400:
            _exp = 3
        elif _s >= 0x0200:
            _exp = 2
        elif _s >= 0x0100:
            _exp = 1
        else:
            _exp = 0

        _mant = (_s >> (_exp + 3)) & 0x0F
        _ulawbyte = _sign | (_exp << 4) | _mant
        _LINEAR_TO_MU[_sample + 32768] = ~_ulawbyte & 0xFF

    @staticmethod
    def pcm16_to_mulaw(pcm16_bytes: bytes) -> bytes:
        """Converts raw 16-bit linear PCM (LE, 8000Hz mono) to 8-bit G.711 mu-law."""
        if not pcm16_bytes:
            return b""
        lut = AudioAdapter._LINEAR_TO_MU
        n = len(pcm16_bytes) // 2
        mulaw_out = bytearray(n)
        for i in range(n):
            sample = int.from_bytes(pcm16_bytes[i*2:(i+1)*2], byteorder='little', signed=True)
            mulaw_out[i] = lut[sample + 32768]
        return bytes(mulaw_out)

    @staticmethod
    def mulaw_to_pcm16(mulaw_bytes: bytes) -> bytes:
        """Converts 8-bit G.711 mu-law (8000Hz) to 16-bit linear PCM."""
        if not mulaw_bytes:
            return b""
        lut = AudioAdapter._MU_TO_LINEAR
        out = bytearray(len(mulaw_bytes) * 2)
        for i, b in enumerate(mulaw_bytes):
            sample = lut[b]
            out[i*2:(i+1)*2] = sample.to_bytes(2, byteorder='little', signed=True)
        return bytes(out)

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
