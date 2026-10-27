"""
Agent Runtime Builder
Translates high-level platform AgentConfiguration into provider-specific Deepgram Voice Agent
SettingsConfiguration, ensuring decoupled architecture and future extensibility.
"""

import os
from typing import Optional, Dict, Any
from app.agents.configuration import AgentConfiguration
from app.agents.prompt_builder import VoicePromptBuilder
from app.voice.language_support import resolve_multilingual
from app.voice.language_switcher import sonic_language_mode
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
    DeepgramThinkEndpoint,
    DeepgramSpeakConfig,
    DeepgramSpeakProvider
)


RAPID_ENDPOINTING_MS = 100


def use_flux_multilingual() -> bool:
    """Flux multilingual recognizer for multi-language agents (STT_MULTI_ENGINE=nova switches back to nova-3 multi)."""
    return os.getenv("STT_MULTI_ENGINE", "flux").strip().lower() != "nova"
BALANCED_ENDPOINTING_MS = 160


def _sonic_language(multilingual: bool, voice_lang: Optional[str]) -> Optional[str]:
    """Language field for the Sonic speak provider; None leaves it out (see sonic_language_mode)."""
    mode = sonic_language_mode()
    if mode == "multi" and multilingual:
        return "multi"
    if mode == "auto":
        return None
    return (voice_lang or "en").split("-")[0]


SEARCH_KNOWLEDGE_FUNCTION = {
    "name": "search_knowledge",
    "description": (
        "Look up verified company facts in the knowledge base: services, projects and case studies, products, "
        "technologies, industries, team skills, FAQs. Call this BEFORE answering any question about what the "
        "company does or has delivered. Use the caller's own words plus key terms (service, industry, technology)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What the caller wants to know, e.g. 'SharePoint intranet for a bank' or 'Power BI dashboards experience'",
            }
        },
        "required": ["query"],
    },
}


class AgentRuntimeBuilder:
    """Converts tenant AgentConfiguration into Deepgram Voice Agent settings payload."""

    @staticmethod
    def build_deepgram_settings(
        config: AgentConfiguration,
        business_profile: Optional[Dict[str, Any]] = None,
        audio_profile: str = "telephony",
        platform_rules: Optional[Any] = None,
        extra_keyterms: Optional[List[str]] = None,
        think_endpoint: Optional[str] = None,
        think_api_key: Optional[str] = None,
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
        # Synchronize listen language with voice language: if agent is configured for Hindi (or any target language),
        # speech recognition MUST listen in that language so user speech is recognized immediately.
        voice_lang = config.voice.language.lower().strip() if (config.voice and config.voice.language) else None
        listen_lang = config.listen.language.lower().strip() if (config.listen and config.listen.language) else None

        if voice_lang and voice_lang != "en":
            configured_lang = voice_lang
        elif listen_lang:
            configured_lang = listen_lang
        elif voice_lang:
            configured_lang = voice_lang
        else:
            configured_lang = "en"

        # Multi-language call: hear the selected languages together (code-switching). Otherwise listen only to
        # the primary language, which is the only mode that works for languages outside the multilingual set.
        plan = resolve_multilingual(config)
        if plan.enabled:
            configured_lang = "multi"

        listen_model = config.listen.model if config.listen and config.listen.model and "nova" in config.listen.model else "nova-3"
        
        # Ultra-responsive endpointing calculation for instantaneous human-level turn-taking
        # Silence (ms) the recognizer waits before deciding the caller has finished. Every millisecond here is added to
        # the reply delay, and measured end to end the reply is about 0.17s faster at 100ms than at 260ms. "rapid" used
        # to resolve to its configured 380ms, which made it SLOWER than "balanced"; both now have hard ceilings.
        mode = getattr(config.listen, "endpointing_mode", "balanced") if config.listen else "balanced"
        if mode == "rapid":
            listen_endpointing = min(getattr(config.listen, "rapid_endpointing", RAPID_ENDPOINTING_MS) or RAPID_ENDPOINTING_MS, RAPID_ENDPOINTING_MS)
        elif mode == "dictation":
            listen_endpointing = getattr(config.listen, "dictation_endpointing", 500) or 500
        else:  # "balanced" and "adaptive"
            raw_ep = getattr(config.listen, "endpointing", BALANCED_ENDPOINTING_MS) or BALANCED_ENDPOINTING_MS
            listen_endpointing = min(raw_ep, BALANCED_ENDPOINTING_MS)

        # Merge keyterms from listen config, router high-weight terms, and pronunciation rules
        combined_keyterms = list(config.listen.keyterms) if config.listen and config.listen.keyterms else []
        if extra_keyterms:
            for kt in extra_keyterms:
                if kt and kt.strip() and kt.strip() not in combined_keyterms:
                    combined_keyterms.append(kt.strip())
        if getattr(config, "pronunciation_rules", None):
            for rule in config.pronunciation_rules:
                w = getattr(rule, "word", "") if hasattr(rule, "word") else (rule.get("word", "") if isinstance(rule, dict) else "")
                if w and w.strip() and w.strip() not in combined_keyterms:
                    combined_keyterms.append(w.strip())

        # Cap to Deepgram recommended maximum of 100 keyterms
        combined_keyterms = combined_keyterms[:100]

        if plan.enabled and use_flux_multilingual():
            # Flux multilingual hears the selected languages together with its own turn detection. Measured end to end
            # it answers in about 1.0-1.2s versus 2.0-2.3s for the older multilingual recognizer, with the same
            # transcription accuracy in English, Hindi and Spanish.
            listen_provider = DeepgramListenProvider(
                type="deepgram",
                version="v2",
                model="flux-general-multi",
                language=None,
                smart_format=None,
                endpointing=None,
                language_hints=list(plan.languages),
                keyterms=combined_keyterms if combined_keyterms else None,
            )
        else:
            listen_provider = DeepgramListenProvider(
                type="deepgram",
                model=listen_model,
                language=configured_lang,
                smart_format=True,
                endpointing=listen_endpointing,
                keyterms=combined_keyterms if combined_keyterms else None
            )
        listen_config = DeepgramListenConfig(
            provider=listen_provider
        )

        # Live knowledge search: only for agents with attached documents (static prompt excerpts cannot cover a
        # large document, so the model looks up the answer on demand).
        knowledge_scope = None
        attached_ids = list(getattr(config, "attached_document_ids", None) or [])
        if attached_ids and getattr(config, "knowledge_mode", "auto") != "disabled":
            knowledge_scope = {
                "organization_id": getattr(config, "organization_id", None) or "global",
                "document_ids": attached_ids,
            }

        # 3. Think configuration (LLM)
        think_temp = config.llm.temperature if config.llm.temperature is not None else 0.35
        think_provider = DeepgramThinkProvider(
            type=config.llm.provider or "open_ai",
            model=config.llm.model or "gpt-4o-mini",
            temperature=think_temp,
        )
        think_endpoint_obj = None
        if think_endpoint:
            ep_headers = {}
            if think_api_key:
                ep_headers["Authorization"] = f"Bearer {think_api_key}"
            think_endpoint_obj = DeepgramThinkEndpoint(url=think_endpoint, headers=ep_headers)

        think_config = DeepgramThinkConfig(
            provider=think_provider,
            endpoint=think_endpoint_obj,
            prompt=system_prompt,
            functions=[SEARCH_KNOWLEDGE_FUNCTION] if knowledge_scope else []
        )

        # 4. Speak configuration (TTS - Flux vs Sonic)
        voice_model = config.voice.voice or "flux-hannah-en"
        raw_provider = getattr(config.voice, "provider", "deepgram") or "deepgram"
        # Determine if this is a Cartesia Sonic voice (either explicit provider or UUID-format voice ID)
        is_cartesia = raw_provider.lower() in ["cartesia", "sonic"] or ("-" in voice_model and len(voice_model) == 36 and not voice_model.startswith("flux-") and not voice_model.startswith("aura-"))

        if is_cartesia:
            sonic_model_id = getattr(config.voice, "model", None)
            if not sonic_model_id or sonic_model_id in ["flux", "aura", "deepgram", "v1", "v2"]:
                sonic_model_id = "sonic-3.5"
            speak_provider = DeepgramSpeakProvider(
                type="cartesia",
                model=None,
                version=None,
                model_id=sonic_model_id,
                voice={
                    "mode": "id",
                    "id": voice_model
                },
                language=_sonic_language(plan.enabled, voice_lang),
                speed=float(getattr(config.voice, "speed", 1.0) or 1.0)
            )
        else:
            voice_version = getattr(config.voice, "version", "v2") or ("v2" if "flux" in voice_model else "v1")
            # Aura v1 models do NOT support the 'speed' parameter and return HTTP 400 'Requested model does not support the speed parameter'
            supports_speed = voice_version == "v2" or "flux" in voice_model
            configured_speed = float(getattr(config.voice, "speed", 1.0) or 1.0)
            speak_provider = DeepgramSpeakProvider(
                type="deepgram",
                version=voice_version,
                model=voice_model,
                speed=configured_speed if supports_speed else None
            )
        speak_config = DeepgramSpeakConfig(
            provider=speak_provider
        )

        # 5. Combined Agent Config with Greeting (Resolved for dynamic variables)
        resolved_greeting = None
        if config.greeting and config.greeting.strip():
            resolved_greeting = VoicePromptBuilder.resolve_dynamic_variables(
                config.greeting.strip(),
                config=config,
                business_profile=business_profile
            )

        agent_config = DeepgramAgentConfig(
            greeting=resolved_greeting,
            listen=listen_config,
            think=think_config,
            speak=speak_config
        )

        settings = DeepgramSettingsConfiguration(
            type="Settings",
            audio=audio_config,
            agent=agent_config
        )
        settings.knowledge_scope = knowledge_scope
        return settings
