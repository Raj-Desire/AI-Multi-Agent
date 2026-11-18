"""Provider-neutral types shared by the voice engine and every telephony adapter."""

from dataclasses import dataclass, field
from typing import Literal, Mapping, Optional

StreamEventKind = Literal["connected", "start", "media", "stop", "mark", "other"]


@dataclass(frozen=True)
class StreamEvent:
    """One inbound message from a provider's audio stream, in neutral form."""

    kind: StreamEventKind
    stream_id: Optional[str] = None
    call_id: Optional[str] = None
    audio: bytes = b""
    custom_params: Mapping[str, str] = field(default_factory=dict)
    mark_name: Optional[str] = None


@dataclass(frozen=True)
class PlaceCallRequest:
    organization_id: str
    to_number: str
    from_number: str
    stream_url: str
    stream_params: Mapping[str, str]
    public_base_url: str
    status_callback_url: Optional[str]
    amd_callback_url: Optional[str]
    ring_timeout_seconds: Optional[int]
    time_limit_seconds: int


@dataclass(frozen=True)
class PlacedCall:
    call_id: str
    status: str
    duration: int = 0


class TelephonyError(Exception):
    """A telephony failure. `public_message` is always vendor-neutral and safe to show to callers and users."""

    def __init__(self, public_message: str, detail: str = ""):
        super().__init__(detail or public_message)
        self.public_message = public_message
        self.detail = detail
