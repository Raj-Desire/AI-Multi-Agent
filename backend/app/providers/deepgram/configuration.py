"""
Deepgram Voice Agent API Configuration Schemas
Follows Deepgram Voice Agent SettingsConfiguration specification (Agent V1 API).
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class DeepgramAudioInput(BaseModel):
    encoding: str = "mulaw"
    sample_rate: int = 8000


class DeepgramAudioOutput(BaseModel):
    encoding: str = "mulaw"
    sample_rate: int = 8000
    container: str = "none"


class DeepgramAudioConfig(BaseModel):
    input: DeepgramAudioInput = Field(default_factory=DeepgramAudioInput)
    output: DeepgramAudioOutput = Field(default_factory=DeepgramAudioOutput)


class DeepgramListenProvider(BaseModel):
    type: str = "deepgram"
    model: str = "nova-3"
    language: Optional[str] = "en"
    smart_format: Optional[bool] = True
    keyterms: Optional[List[str]] = None


class DeepgramListenConfig(BaseModel):
    provider: DeepgramListenProvider = Field(default_factory=DeepgramListenProvider)


class DeepgramThinkProvider(BaseModel):
    type: str = "open_ai"
    model: str = "gpt-4o-mini"
    temperature: float = 0.7


class DeepgramThinkConfig(BaseModel):
    provider: DeepgramThinkProvider = Field(default_factory=DeepgramThinkProvider)
    prompt: str
    functions: List[Dict[str, Any]] = Field(default_factory=list)


class DeepgramSpeakProvider(BaseModel):
    type: str = "deepgram"
    model: str = "aura-orion-en"


class DeepgramSpeakConfig(BaseModel):
    provider: DeepgramSpeakProvider = Field(default_factory=DeepgramSpeakProvider)


class DeepgramAgentConfig(BaseModel):
    greeting: Optional[str] = None
    listen: DeepgramListenConfig = Field(default_factory=DeepgramListenConfig)
    think: DeepgramThinkConfig
    speak: DeepgramSpeakConfig = Field(default_factory=DeepgramSpeakConfig)


class DeepgramSettingsConfiguration(BaseModel):
    """The root payload sent as Settings to Deepgram (wss://agent.deepgram.com/v1/agent/converse)."""
    type: str = "Settings"
    audio: DeepgramAudioConfig = Field(default_factory=DeepgramAudioConfig)
    agent: DeepgramAgentConfig


class DeepgramInjectAgentMessage(BaseModel):
    """Payload to force the agent to speak an exact text message or greeting."""
    type: str = "InjectAgentMessage"
    message: str
    behavior: str = "default"  # "default" | "queue" | "interrupt"


class DeepgramUpdatePrompt(BaseModel):
    """Payload to update the agent's prompt mid-session."""
    type: str = "UpdatePrompt"
    prompt: str


class DeepgramKeepAlive(BaseModel):
    """Payload to keep long-running WebSocket sessions active."""
    type: str = "KeepAlive"
