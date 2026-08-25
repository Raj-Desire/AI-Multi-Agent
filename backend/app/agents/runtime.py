"""
Agent Runtime Builder
Translates high-level platform AgentConfiguration into provider-specific Deepgram Voice Agent
SettingsConfiguration, ensuring decoupled architecture and future extensibility.
"""

from typing import Optional, Dict, Any
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
    def build_deepgram_settings(
        config: AgentConfiguration,
        business_profile: Optional[Dict[str, Any]] = None,
        audio_profile: str = "telephony",
        platform_rules: Optional[Any] = None
    ) -> DeepgramSettingsConfiguration:
        # Build optimized spoken prompt with optional business knowledge base and active platform rules
        system_prompt = VoicePromptBuilder.build_prompt(
            config,
            business_profile=business_profile,
            platform_rules=platform_rules
        )

        # 1. Audio formatting based on pipeline profile
        if audio_profile == "playground":
            # Studio-grade Linear PCM (16-bit, 24000Hz) for crisp in-browser web playground audio
            audio_config = DeepgramAudioConfig(
                input=DeepgramAudioInput(encoding="linear16", sample_rate=24000),
                output=DeepgramAudioOutput(encoding="linear16", sample_rate=24000, container="none")
            )
        else:
            # Standard Telephony: G.711 mu-law (8-bit, 8000Hz) for Twilio PSTN Media Streams
            audio_config = DeepgramAudioConfig(
                input=DeepgramAudioInput(encoding="mulaw", sample_rate=8000),
                output=DeepgramAudioOutput(encoding="mulaw", sample_rate=8000, container="none")
            )

        # 2. Listen configuration (STT) - defaults to latest Nova-3 with multilingual support
        configured_lang = "en"
        if config.listen and config.listen.language:
            configured_lang = config.listen.language.lower().strip()
        elif config.voice and config.voice.language:
            configured_lang = config.voice.language.lower().strip()

        listen_model = config.listen.model if config.listen and config.listen.model and "nova" in config.listen.model else "nova-3"
        listen_provider = DeepgramListenProvider(
            type="deepgram",
            model=listen_model,
            language=configured_lang,
            smart_format=True,
            keyterms=config.listen.keyterms if config.listen and config.listen.keyterms else None
        )
        listen_config = DeepgramListenConfig(
            provider=listen_provider
        )

        # 3. Think configuration (LLM)
        think_temp = config.llm.temperature if config.llm.temperature is not None else 0.35
        think_provider = DeepgramThinkProvider(
            type=config.llm.provider or "open_ai",
            model=config.llm.model or "gpt-4o-mini",
            temperature=think_temp
        )
        think_config = DeepgramThinkConfig(
            provider=think_provider,
            prompt=system_prompt,
            functions=[]
        )

        # 4. Speak configuration (TTS)
        voice_model = config.voice.voice or "aura-2-thalia-en"
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
