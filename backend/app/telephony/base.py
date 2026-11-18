"""The interface every telephony provider adapter implements. Vendor-specific code lives only in adapters."""

from abc import ABC, abstractmethod
from typing import ClassVar, Optional

from fastapi import Request

from app.telephony.types import PlaceCallRequest, PlacedCall, StreamEvent


class TelephonyProvider(ABC):
    name: ClassVar[str]
    stream_path: ClassVar[str]
    # Bytes per outbound audio frame (20 ms of 8 kHz G.711 mu-law).
    chunk_bytes: ClassVar[int] = 160

    @abstractmethod
    def parse_stream_message(self, raw: str) -> StreamEvent: ...

    @abstractmethod
    def build_media_message(self, stream_id: str, audio: bytes) -> str: ...

    @abstractmethod
    def build_clear_message(self, stream_id: str) -> str: ...

    @abstractmethod
    async def place_call(self, req: PlaceCallRequest) -> PlacedCall:
        """Dial out. Raises TelephonyError (vendor-neutral public_message) on failure."""

    @abstractmethod
    async def end_call(self, org_id: str, call_id: str) -> bool: ...

    @abstractmethod
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
    ) -> bool: ...

    @abstractmethod
    async def delete_recording(self, org_id: str, call_id: str) -> int: ...

    @abstractmethod
    async def get_call_status(self, org_id: str, call_id: str) -> Optional[tuple[str, int]]:
        """(status, duration_seconds), or None when it cannot be determined."""

    @abstractmethod
    async def verify_webhook(self, request: Request) -> Optional[bool]:
        """True valid, False invalid, None when there is nothing to verify against."""
