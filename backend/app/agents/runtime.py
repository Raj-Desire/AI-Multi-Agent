"""
Agent Runtime Builder
Translates high-level platform AgentConfiguration into provider-specific Deepgram Voice Agent
SettingsConfiguration, ensuring decoupled architecture and future extensibility.
"""

from app.agents.configuration import AgentConfiguration
from app.agents.prompt_builder import VoicePromptBuilder
from app.providers.deepgram.configuration import (
    DeepgramSettingsConfiguration,
    DeepgramAudioConfig,
    DeepgramAudioInput,
    DeepgramAudioOutput,
    DeepgramAgentConfig,
    DeepgramListenConfig,
    DeepgramListenProvider,
    DeepgramThinkConfig,
    DeepgramThinkProvider,
    DeepgramSpeakConfig,
    DeepgramSpeakProvider
)


class AgentRuntimeBuilder:
    """Converts tenant AgentConfiguration into Deepgram Voice Agent settings payload."""

    @staticmethod
    def build_deepgram_settings(config: AgentConfiguration) -> DeepgramSettingsConfiguration:
        # Build optimized spoken prompt
        system_prompt = VoicePromptBuilder.build_prompt(config)

        # 1. Audio formatting (standard telephony: mulaw 8000Hz)
        audio_config = DeepgramAudioConfig(
            input=DeepgramAudioInput(encoding="mulaw", sample_rate=8000),
            output=DeepgramAudioOutput(encoding="mulaw", sample_rate=8000, container="none")
        )

        # 2. Listen configuration (STT) - defaults to latest Nova-3
        listen_model = config.listen.model if config.listen.model and "nova" in config.listen.model else "nova-3"
        listen_provider = DeepgramListenProvider(
            type="deepgram",
            model=listen_model,
            language=config.listen.language or "en",
            smart_format=True,
            keyterms=config.listen.keyterms if config.listen.keyterms else None
        )
        listen_config = DeepgramListenConfig(
            provider=listen_provider
        )

        # 3. Think configuration (LLM)
        think_provider = DeepgramThinkProvider(
            type=config.llm.provider or "open_ai",
            model=config.llm.model or "gpt-4o-mini",
            temperature=config.llm.temperature if config.llm.temperature is not None else 0.7
        )
        think_config = DeepgramThinkConfig(
            provider=think_provider,
            prompt=system_prompt,
            functions=[]
        )

        # 4. Speak configuration (TTS)
        voice_model = config.voice.voice or "aura-orion-en"
        speak_provider = DeepgramSpeakProvider(
            type="deepgram",
            model=voice_model
        )
        speak_config = DeepgramSpeakConfig(
            provider=speak_provider
        )

        # 5. Combined Agent Config with Greeting
        agent_config = DeepgramAgentConfig(
            greeting=config.greeting if config.greeting else None,
            listen=listen_config,
            think=think_config,
            speak=speak_config
        )

        return DeepgramSettingsConfiguration(
            type="Settings",
            audio=audio_config,
            agent=agent_config
        )
