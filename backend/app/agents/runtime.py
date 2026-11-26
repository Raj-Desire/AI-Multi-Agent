"""
Agent Runtime Builder
Translates high-level platform AgentConfiguration into provider-specific Deepgram Voice Agent
SettingsConfiguration, ensuring decoupled architecture and future extensibility.
"""

import os
from typing import Optional, Dict, Any, List
from app.agents.configuration import AgentConfiguration
from app.agents.prompt_builder import VoicePromptBuilder
from app.voice.language_support import resolve_multilingual
from app.numerology.tools import AGENT_SCOPE as NUMEROLOGY_SCOPE, NUMEROLOGY_FUNCTIONS
from app.models.voice_credentials import ResolvedVoiceProfile
from app.voice_stack.registry import build_speak_provider
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

FLUX_ENGLISH_MODEL = "flux-general-en"

# End-of-turn presets for Flux, keyed by the agent's endpointing_mode. A higher eot_threshold waits for a more
# certain end of turn (fewer cut-offs, slightly later reply); eager_eot_threshold lets the reply start early on a
# likely end of turn. Starting values: tune against recorded calls (see the A/B notes in the review).
FLUX_EOT_PRESETS = {
    "rapid": {"eot_threshold": 0.6, "eager_eot_threshold": 0.4, "eot_timeout_ms": 3000},
    "balanced": {"eot_threshold": 0.7, "eager_eot_threshold": 0.5, "eot_timeout_ms": 4000},
    "adaptive": {"eot_threshold": 0.7, "eager_eot_threshold": 0.5, "eot_timeout_ms": 4000},
    # Phone numbers, emails and long notes: wait longer and never start a reply early.
    "dictation": {"eot_threshold": 0.8, "eager_eot_threshold": None, "eot_timeout_ms": 6000},
}


def use_flux_english(config: AgentConfiguration) -> bool:
    """Flux end-of-turn detection for single-language English agents.

    Off by default (the fixed-silence recognizer stays). Turn it on for every agent with STT_ENGLISH_ENGINE=flux,
    or per agent by saving a listen model that starts with "flux".
    """
    listen_model = (getattr(getattr(config, "listen", None), "model", "") or "").lower()
    if listen_model.startswith("flux"):
        return True
    return os.getenv("STT_ENGLISH_ENGINE", "nova").strip().lower() == "flux"


def flux_end_of_turn_settings(config: AgentConfiguration) -> Dict[str, Any]:
    """eot_threshold / eager_eot_threshold / eot_timeout_ms for the agent's listen config.

    A value set explicitly on the agent (listen.eot_threshold) wins over the preset; listen.eager_eot=False turns
    early replies off.
    """
    listen = getattr(config, "listen", None)
    mode = (getattr(listen, "endpointing_mode", "balanced") or "balanced").lower()
    settings = dict(FLUX_EOT_PRESETS.get(mode, FLUX_EOT_PRESETS["balanced"]))
    explicit = getattr(listen, "eot_threshold", None)
    if explicit is not None:
        settings["eot_threshold"] = min(max(float(explicit), 0.5), 0.9)
    if not getattr(listen, "eager_eot", True):
        settings["eager_eot_threshold"] = None
    eager = settings.get("eager_eot_threshold")
    if eager is not None:
        # The early-reply threshold must stay below the final one.
        settings["eager_eot_threshold"] = min(eager, settings["eot_threshold"] - 0.1)
    return settings


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
        voice_profile: Optional[ResolvedVoiceProfile] = None,
    ) -> DeepgramSettingsConfiguration:
        # Build optimized spoken prompt with optional business knowledge base and active platform rules
        if config.agent_entity_scope == NUMEROLOGY_SCOPE and config.system_prompt:
            # The business phone number and email are given as exact spoken words, so they are never garbled.
            from app.numerology.contact_speech import spoken_contact_block
            config = config.model_copy(update={
                "system_prompt": config.system_prompt + spoken_contact_block(config.company_phone or "", config.company_email or "", config.office_address or "")
            })
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
        elif (
            not plan.enabled
            and (configured_lang or "en").split("-")[0] == "en"
            and use_flux_english(config)
        ):
            # Single-language English: Flux decides the end of a turn from meaning, not a fixed silence timer, so it
            # waits through "um" and digit pauses but answers fast when the sentence is clearly finished.
            eot = flux_end_of_turn_settings(config)
            listen_provider = DeepgramListenProvider(
                type="deepgram",
                version="v2",
                model=FLUX_ENGLISH_MODEL,
                language=None,
                smart_format=None,
                endpointing=None,
                eot_threshold=eot["eot_threshold"],
                eager_eot_threshold=eot["eager_eot_threshold"],
                eot_timeout_ms=eot["eot_timeout_ms"],
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
            functions=(
                ([SEARCH_KNOWLEDGE_FUNCTION] if knowledge_scope else [])
                + (NUMEROLOGY_FUNCTIONS if config.agent_entity_scope == NUMEROLOGY_SCOPE else [])
            )
        )

        # 4. Speak configuration (TTS - Flux vs Sonic), per engine and the org's key
        speak_config = build_speak_provider(
            voice_profile,
            config.voice,
            language=_sonic_language(plan.enabled, voice_lang),
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
