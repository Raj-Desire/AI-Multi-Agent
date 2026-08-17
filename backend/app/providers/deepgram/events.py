"""
Deepgram Voice Agent Event Types and Parsers
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class DeepgramEventType:
    WELCOME = "Welcome"
    SETTINGS_APPLIED = "SettingsApplied"
    CONVERSATION_TEXT = "ConversationText"
    USER_STARTED_SPEAKING = "UserStartedSpeaking"
    AGENT_THINKING = "AgentThinking"
    AGENT_STARTED_SPEAKING = "AgentStartedSpeaking"
    AGENT_AUDIO_DONE = "AgentAudioDone"
    FUNCTION_CALL_REQUEST = "FunctionCallRequest"
    LATENCY_REPORT = "LatencyReport"
    WARNING = "Warning"
    ERROR = "Error"


class DeepgramBaseEvent(BaseModel):
    type: str
    raw: Dict[str, Any] = Field(default_factory=dict)


class DeepgramWelcomeEvent(DeepgramBaseEvent):
    session_id: Optional[str] = None


class DeepgramConversationTextEvent(DeepgramBaseEvent):
    role: str = "assistant"  # "user" or "assistant"
    content: str = ""


class DeepgramLatencyEvent(DeepgramBaseEvent):
    total_latency: Optional[float] = None
    tts_latency: Optional[float] = None
    stt_latency: Optional[float] = None
    llm_latency: Optional[float] = None


class DeepgramErrorEvent(DeepgramBaseEvent):
    message: str = ""
    code: Optional[str] = None
