from typing import Any, Dict, Optional, Protocol, runtime_checkable


@runtime_checkable
class VoiceClientProtocol(Protocol):
    """What the call handler needs from any voice engine client."""

    is_ready: bool
    session_id: Optional[str]
    numerology_state: Dict[str, Any]

    async def connect_and_configure(
        self,
        settings: Any,
        greeting: Optional[str] = None,
        timeout: float = 10.0,
    ) -> bool: ...

    async def send_audio(self, raw_audio_bytes: bytes) -> None: ...

    async def inject_agent_message(self, message: str, behavior: str = "default") -> None: ...

    async def inject_user_message(self, content: str) -> None: ...

    async def update_speak(self, provider: dict) -> bool: ...

    async def update_prompt(self, prompt: str) -> bool: ...

    async def update_prompt_and_wait_ack(self, prompt: str, timeout: float = 1.0) -> bool: ...

    async def close(self) -> None: ...
