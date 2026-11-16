"""
Voice Prompt Builder
Constructs phone-optimized, human-grade conversational prompts that strictly enforce
spoken cadence, response length limits (1-2 sentences), personality sliders,
active listening confirmations, psychological empathy, and guardrails.
"""

import re
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone
from app.agents.configuration import AgentConfiguration
from app.voice.language_support import resolve_multilingual
from app.voice.language_switcher import language_name


PROMPT_CHAR_LIMIT = 24000

# "Thursday, September 14th": a weekday plus month and day written into a saved prompt is a stale example, never a fact.
_EXAMPLE_DATE = re.compile(
    r"\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+"
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b"
)


class VoicePromptBuilder:
    """Builds human-grade, voice-specific system prompts from an AgentConfiguration."""

    @staticmethod
    def agent_business_profile(
        config: AgentConfiguration,
        business_profile: Optional[Union[dict, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Business details for prompts, taken from the agent itself (company name, phone,
        email, website, address). An explicitly passed profile dict is only a fallback for
        fields the agent leaves empty; there is no organization-wide business profile.
        """
        base: Dict[str, Any] = {}
        if hasattr(business_profile, "model_dump"):
            base = business_profile.model_dump(mode="json")
        elif isinstance(business_profile, dict):
            base = dict(business_profile)
        agent_fields = {
            "company_name": getattr(config, "company_name", None) or getattr(config, "agent_entity_scope", None),
            "phone": getattr(config, "company_phone", None),
            "email": getattr(config, "company_email", None),
            "website": getattr(config, "company_website", None),
            "address": getattr(config, "office_address", None),
        }
        for key, val in agent_fields.items():
            if val and str(val).strip():
                base[key] = str(val).strip()
                if key == "address":
                    base.pop("city", None)
                    base.pop("state", None)
                    base.pop("country", None)
        return base

    @staticmethod
    def resolve_dynamic_variables(
        text: str,
        config: AgentConfiguration,
        business_profile: Optional[Union[dict, Any]] = None
    ) -> str:
        """
        Substitutes dynamic template variables (e.g. {{company_name}}, {{agent_name}}, {{agent_role}}, etc.)
        with real values from the business profile or agent configuration.
        """
        if not text:
            return ""

        profile_dict = VoicePromptBuilder.agent_business_profile(config, business_profile)

        company_name = (
            profile_dict.get("company_name")
            or getattr(config, "company_name", None)
            or config.name
            or "our company"
        ).strip()

        agent_name = (config.name or "Alex").strip()
        # Clean persona name if it ends with "Agent" etc.
        spoken_agent_name = agent_name
        for suffix in [" Agent", " Assistant", " Bot", " AI", " Specialist", " Representative"]:
            if spoken_agent_name.endswith(suffix):
                spoken_agent_name = spoken_agent_name[:-len(suffix)].strip()
                if not spoken_agent_name:
                    spoken_agent_name = "Alex"
                break

        agent_role = (config.role or "Representative").strip()
        agent_objective = (config.objective or config.description or "assist you today").strip()

        # Location
        addr_parts = [
            profile_dict.get("address", ""),
            profile_dict.get("city", ""),
            profile_dict.get("state", ""),
            profile_dict.get("country", "")
        ]
        full_address = ", ".join([p.strip() for p in addr_parts if p and p.strip()]) or "our office"

        # Hours
        from app.agents.schedule import resolve_agent_schedule
        hours_str = resolve_agent_schedule(config, business_profile).hours_text or "our listed hours"

        caller_phone = profile_dict.get("phone", "")
        prospect_name = ""
        prospect_phone = ""
        prospect_company = ""
        direction = "inbound"

        if hasattr(config, "_call_direction"):
            direction = getattr(config, "_call_direction", "inbound")

        if hasattr(config, "_prospect_data") and isinstance(getattr(config, "_prospect_data"), dict):
            pdata = getattr(config, "_prospect_data")
            prospect_name = pdata.get("name") or pdata.get("prospect_name") or ""
            prospect_phone = pdata.get("phone") or pdata.get("phone_number") or ""
            prospect_company = pdata.get("company") or pdata.get("company_name") or ""

        # Human-like caller greeting resolution: if prospect name is known use it, else polite neutral fallback
        caller_name_resolved = prospect_name if prospect_name else ("there" if "Hi {{caller_name}}" in text or "Hello {{caller_name}}" in text else "")
        caller_name_clean = caller_name_resolved.strip()

        # Replacement mapping
        replacements = {
            "{{company_name}}": company_name,
            "{{agent_name}}": spoken_agent_name,
            "{{agent_role}}": agent_role,
            "{{agent_objective}}": agent_objective,
            "{{caller_name}}": caller_name_clean or "there",
            "{{prospect_name}}": prospect_name or "there",
            "{{prospect_company}}": prospect_company or "your team",
            "{{caller_phone}}": prospect_phone or caller_phone or "your phone number",
            "{{operating_hours}}": hours_str,
            "{{office_location}}": full_address,
            "{{current_time}}": "the current time"
        }

        result = text
        for token, val in replacements.items():
            result = result.replace(token, val)

        # Clean double spaces or awkward punctuation from empty dynamic substitutions
        # Collapse runs of spaces and blank lines only: the line breaks keep the prompt's structure (rule lists,
        # headings), which the model uses to tell one rule from the next.
        result = re.sub(r"[ \t]+", " ", result)
        result = re.sub(r" ?\n ?", "\n", result)
        result = re.sub(r"\n{3,}", "\n\n", result)
        result = result.replace(" ,", ",").replace(" ?", "?").replace(" !", "!").replace(" .", ".").strip()

        return result


    @staticmethod
    def _build_personality_instructions(config: AgentConfiguration) -> List[str]:
        p = config.personality
        directives = []

        # 1. Professionalism (0-100)
        if p.professionalism >= 85:
            directives.append("Tone & Demeanor (Professionalism): Highly professional, polished, articulate, and formal business demeanor. Use precise business vocabulary and avoid slang.")
        elif p.professionalism >= 65:
            directives.append("Tone & Demeanor (Professionalism): Balanced professional warmth, courteous, respectful, and polite.")
        elif p.professionalism >= 40:
            directives.append("Tone & Demeanor (Professionalism): Conversational, relaxed, everyday approachable business style.")
        else:
            directives.append("Tone & Demeanor (Professionalism): Very casual, informal peer-to-peer conversational manner.")

        # 2. Friendliness (0-100)
        if p.friendliness >= 85:
            directives.append("Warmth & Rapport (Friendliness): Exceptionally warm, welcoming, polite, and enthusiastic. Greet with bright positivity and make the caller feel appreciated.")
        elif p.friendliness >= 60:
            directives.append("Warmth & Rapport (Friendliness): Friendly, pleasant, positive, and hospitable.")
        elif p.friendliness >= 35:
            directives.append("Warmth & Rapport (Friendliness): Neutral, balanced, direct, and pragmatic.")
        else:
            directives.append("Warmth & Rapport (Friendliness): Purely matter-of-fact, strictly transactional, zero small talk or extra pleasantries.")

        # 3. Empathy (0-100)
        if p.empathy >= 80:
            directives.append("Empathy & Active Listening: Deeply empathetic and validating. Always explicitly acknowledge and validate any caller concern, frustration, or hesitation before moving to solutions.")
        elif p.empathy >= 55:
            directives.append("Empathy: Sincere understanding when callers express doubts or hesitation.")
        else:
            directives.append("Empathy: Practical and focused directly on solutions without emotional dwell time.")

        # 4. Confidence (0-100)
        if p.confidence >= 80:
            directives.append("Confidence & Authority: High authority, decisive, commanding clarity, and unwavering reassurance. Speak with strong conviction.")
        elif p.confidence >= 55:
            directives.append("Confidence: Clear, reliable, and composed tone.")
        else:
            directives.append("Confidence: Modest, gentle, humble, and collaborative tone.")

        # 5. Patience (0-100) - Influences spoken cadence and pause structure
        if p.patience >= 80:
            directives.append("Patience (Spoken Cadence): Unhurried, supportive, and accommodating. Use measured phrasing with natural micro-commas. Never rush, pressure, or interrupt the caller.")
        elif p.patience >= 50:
            directives.append("Patience: Steady and measured speaking cadence, comfortable with normal conversational pacing.")
        else:
            directives.append("Patience: Fast, decisive, and efficient, moving the dialogue forward quickly without pausing.")

        # 6. Energy (0-100) - Influences vocal punch, exclamations, and tempo
        if p.energy >= 80:
            directives.append("Vocal Energy: High energy, upbeat, dynamic, and lively pacing. Use spirited spoken openers ('Awesome!', 'Great!') and punchy phrasing.")
        elif p.energy >= 50:
            directives.append("Vocal Energy: Balanced, natural conversational energy.")
        else:
            directives.append("Vocal Energy: Calm, soothing, grounded, and low-key cadence. Speak softly and gently.")

        # 7. Assertiveness (0-100)
        if p.assertiveness >= 80:
            directives.append("Assertiveness & Direction: Proactively steer the conversation towards concrete decisions, scheduled appointments, and firm next steps without hesitation.")
        elif p.assertiveness >= 50:
            directives.append("Assertiveness: Gently guide the caller while remaining flexible.")
        else:
            directives.append("Assertiveness: Passive and accommodating; allow the caller to entirely drive the flow and topics.")

        # 8. Humor (0-100)
        if p.humor >= 70:
            directives.append("Humor & Charm: Playful, witty, and lighthearted charm when appropriate. Add subtle smile in your voice.")
        elif p.humor >= 40:
            directives.append("Humor: Mild warmth and occasional subtle cheerfulness.")
        else:
            directives.append("Humor: Zero humor. Strictly focused, serious, and matter-of-fact.")

        # 9. Curiosity (0-100)
        if p.curiosity >= 75:
            directives.append("Curiosity & Discovery: Inquisitive and probing; ask thoughtful clarifying questions to deeply uncover caller needs and underlying pain points.")
        elif p.curiosity >= 45:
            directives.append("Curiosity: Standard discovery, asking necessary qualifying questions.")
        else:
            directives.append("Curiosity: Minimal questions; answer only what was directly asked without probing.")

        return directives

    @staticmethod
    def _build_personality_summary(config: AgentConfiguration) -> str:
        """Compact persona: only the dimensions that deviate from the middle are spelled out. Nine long paragraphs
        used to be repeated on every turn and the model barely followed them."""
        p = config.personality
        # (attribute, label when 80+, label when below 35); the middle needs no instruction.
        dims = [
            ("professionalism", "polished and formal, no slang", "very casual, peer-to-peer"),
            ("friendliness", "very warm and welcoming", "matter-of-fact, no small talk"),
            ("empathy", "validate any concern or hesitation before solving it", "practical, straight to the solution"),
            ("confidence", "decisive and assured", "modest and collaborative"),
            ("patience", "unhurried, never pressure the caller", "fast and efficient"),
            ("energy", "upbeat and lively", "calm and low-key"),
            ("assertiveness", "steer firmly toward a concrete next step", "let the caller lead"),
            ("humor", "light and playful when it fits", "serious, no jokes"),
            ("curiosity", "ask thoughtful clarifying questions", "answer only what was asked"),
        ]
        traits = []
        for attr, high, low in dims:
            value = getattr(p, attr, 50)
            if value >= 80:
                traits.append(high)
            elif value < 35:
                traits.append(low)
        style = (config.communication_style or "Conversational").strip()
        line = f"Style: {style}. " + ("; ".join(traits) + "." if traits else "Warm, professional and natural.")
        return "[PERSONA]\n" + line

    @staticmethod
    def _build_length_enforcement(response_length: Optional[str]) -> str:
        length_key = (response_length or "short").lower()
        if length_key in ["detailed", "long"]:
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT: DETAILED (3–4 SENTENCES)]\n"
                "- Response Length: 3 to 4 comprehensive, detailed spoken sentences per turn (around 50-75 words total).\n"
                "- FIRST SENTENCE SPEED BURST: Keep your very first sentence short and punchy (under 8 words) so speech playback begins instantly on the caller's phone.\n"
                "- Deliver thorough explanations, step-by-step answers, and complete context.\n"
                "- Keep the conversation natural and interactive without interrogating the caller."
            )
        elif length_key in ["balanced", "medium"]:
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT: BALANCED (2–3 SENTENCES)]\n"
                "- Response Length: 2 to 3 well-structured, clear spoken sentences per turn (around 35-45 words total).\n"
                "- FIRST SENTENCE SPEED BURST: Start your response with an immediate, short conversational phrase or direct answer (under 7 words) so audio synthesizes instantly without hesitation.\n"
                "- Provide helpful context directly. Only ask a question if you need caller confirmation."
            )
        else:
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT: ULTRA-CRISP (1–2 SENTENCES)]\n"
                "- Response Length: 1 OR AT MOST 2 SHORT SPOKEN SENTENCES PER TURN (around 15-25 words total).\n"
                "- INSTANT FIRST CLAUSE (ZERO LATENCY): Start immediately with a brief confirmation or direct answer (under 6-8 words) so speech synthesis streams to the caller instantly without delay.\n"
                "- NEVER produce 3 or more sentences in a single turn.\n"
                "- NEVER give long explanations, monologues, or multiple paragraphs.\n"
                "- Deliver information directly as a clear, confident statement. Do NOT force a question at the end of every turn unless needed."
            )

    @staticmethod
    def _build_language_directives(config: AgentConfiguration) -> str:
        lang = "en"
        if config.voice and config.voice.language:
            lang = config.voice.language.lower().strip()
        elif config.listen and config.listen.language:
            lang = config.listen.language.lower().strip()

        # Comprehensive language metadata map: (Code, English Name, Native Name, Native Example Greeting/Phrase)
        LANGUAGE_SPECS = {
            "gu": ("Gujarati", "ગુજરાતી", "હા, ચોક્કસ! તમને કેવા પ્રકારની સહાયતા જોઈએ છે?"),
            "hi": ("Hindi", "हिन्दी", "नमस्ते! हाँ जी, बिल्कुल! आपको किस प्रकार की सहायता चाहिए?"),
            "es": ("Spanish", "Español", "¡Hola! Por supuesto, ¿en qué puedo ayudarte hoy?"),
            "fr": ("French", "Français", "Bonjour ! Absolument, comment puis-je vous aider aujourd'hui ?"),
            "de": ("German", "Deutsch", "Hallo! Sehr gerne, wie kann ich Ihnen heute helfen?"),
            "it": ("Italian", "Italiano", "Ciao! Certamente, come posso aiutarti oggi?"),
            "pt": ("Portuguese", "Português", "Olá! Com certeza, como posso ajudar você hoje?"),
            "ja": ("Japanese", "日本語", "こんにちは！はい、かしこまりました。本日はどのようなご用件でしょうか？"),
            "zh": ("Chinese (Mandarin)", "中文", "您好！没问题，请问有什么我可以协助您的？"),
            "ko": ("Korean", "한국어", "안녕하세요! 네, 무엇을 도와드릴까요?"),
            "ar": ("Arabic", "العربية", "أهلاً وسهلاً! بالتأكيد، كيف يمكنني مساعدتك اليوم؟"),
            "nl": ("Dutch", "Nederlands", "Hallo! Zeker, hoe kan ik u vandaag helpen?"),
            "he": ("Hebrew", "עברית", "שלום! בהחלט, איך אוכל לעזור לך היום?"),
            "sv": ("Swedish", "Svenska", "Hej! Absolut, vad kan jag hjälpa dig med idag?"),
            "pl": ("Polish", "Polski", "Cześć! Oczywiście, w czym mogę Ci dzisiaj pomóc?"),
            "tr": ("Turkish", "Türkçe", "Merhaba! Elbette, bugün size nasıl yardımcı olabilirim?"),
            "id": ("Indonesian", "Bahasa Indonesia", "Halo! Tentu saja, ada yang bisa saya bantu hari ini?"),
            "th": ("Thai", "ไทย", "สวัสดีค่ะ ยินดีเลยค่ะ วันนี้มีอะไรให้ช่วยไหมคะ?"),
            "ru": ("Russian", "Русский", "Здравствуйте! Конечно, чем я могу вам помочь сегодня?"),
            "vi": ("Vietnamese", "Tiếng Việt", "Xin chào! Rất sẵn lòng, tôi có thể giúp gì cho bạn hôm nay?"),
            "tl": ("Tagalog (Filipino)", "Filipino", "Kamusta! Walang problema, paano kita matutulungan ngayon?"),
            "ta": ("Tamil", "தமிழ்", "வணக்கம்! நிச்சயமாக, இன்று உங்களுக்கு நான் எவ்வாறு உதவ முடியும்?"),
            "te": ("Telugu", "తెలుగు", "నమస్కారం! తప్పకుండా, ఈరోజు మీకు నేను ఎలా సహాయపడగలను?"),
            "bn": ("Bengali", "বাংলা", "নমস্কার! হ্যাঁ নিশ্চয়ই, আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?"),
            "pa": ("Punjabi", "ਪੰਜਾਬੀ", "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਹਾਂਜੀ ਜ਼ਰੂਰ, ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?"),
            "ur": ("Urdu", "اردو", "السلام علیکم! جی بالکل، آج میں آپ کی کیا مدد کر سکتا ہوں؟"),
            "el": ("Greek", "Ελληνικά", "Γεια σας! Βεβαίως, πώς μπορώ να σας βοηθήσω σήμερα;"),
            "da": ("Danish", "Dansk", "Hej! Selvfølgelig, hvordan kan jeg hjælpe dig i dag?"),
            "fi": ("Finnish", "Suomi", "Hei! Totta kai, kuinka voin auttaa sinua tänään?"),
            "no": ("Norwegian", "Norsk", "Hei! Selvfølgelig, hvordan kan jeg hjelpe deg i dag?"),
            "cs": ("Czech", "Čeština", "Dobrý den! Jistě, jak vám mohu dnes pomoci?"),
            "hu": ("Hungarian", "Magyar", "Üdvözlöm! Természetesen, miben segíthetek ma?"),
            "ro": ("Romanian", "Română", "Bună! Sigur că da, cu ce te pot ajuta astăzi?"),
            "uk": ("Ukrainian", "Українська", "Вітаю! Звісно, чим я можу допомогти вам сьогодні?"),
            "bg": ("Bulgarian", "Български", "Здравейте! Разбира се, с какво мога да ви помогна днес?"),
            "hr": ("Croatian", "Hrvatski", "Pozdrav! Naravno, kako vam mogu pomoći danas?"),
            "ms": ("Malay", "Bahasa Melayu", "Hai! Sudah tentu, apa yang boleh saya bantu hari ini?"),
            "sk": ("Slovak", "Slovenčina", "Dobrý deň! Samozrejme, ako vám dnes môžem pomôcť?"),
            "ka": ("Georgian", "ქართული", "გამარჯობა! რა თქმა უნდა, როგორ შემიძლია დაგეხმაროთ დღეს?"),
            "kn": ("Kannada", "ಕನ್ನಡ", "ನಮಸ್ಕಾರ! ಖಂಡಿತ, ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"),
            "ml": ("Malayalam", "മലയാളം", "നമസ്കാരം! തീർച്ചയായും, ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?"),
            "mr": ("Marathi", "मराठी", "नमस्कार! नक्कीच, आज मी तुमची कशी मदत करू शकते?")
        }

        # Normalize prefix (e.g. "es-es" -> "es", "hi-in" -> "hi")
        base_code = lang.split("-")[0].split("_")[0].strip()

        # Match specific languages
        for code, (eng_name, native_name, sample_phrase) in LANGUAGE_SPECS.items():
            if lang == code or base_code == code or lang == eng_name.lower():
                plan = resolve_multilingual(config)
                if plan.enabled:
                    names = ", ".join(language_name(c) for c in plan.languages)
                    return (
                        f"[LANGUAGE DIRECTIVE: START IN {eng_name.upper()} ({native_name}), THEN MIRROR THE CALLER]\n"
                        f"- Open the call in {eng_name} ({native_name}), e.g. '{sample_phrase}'.\n"
                        f"- On EVERY turn, detect which of these languages the caller just spoke: {names}. Reply in THAT language, "
                        f"in its native script. If they switch language mid-call, switch with them immediately, starting with that "
                        f"very reply. If they switch back, switch back.\n"
                        f"- Mixed speech (e.g. Hinglish) -> reply in the dominant language of their last sentence.\n"
                        f"- Never reply in a language outside that list. Your opening language is {eng_name}.\n"
                        f"- The transcript can contain recognition errors; if a line looks garbled, use the surrounding conversation to "
                        f"infer the language, and only if you truly cannot tell, ask them to repeat.\n"
                        f"- Use natural everyday phone phrasing and correct grammar."
                    )
                return (
                    f"[MANDATORY LANGUAGE DIRECTIVE: {eng_name.upper()} ({native_name})]\n"
                    f"- PRIMARY CONVERSATIONAL LANGUAGE: The caller expects you to converse EXCLUSIVELY in {eng_name} ({native_name}).\n"
                    f"- LIVE TOKEN GENERATION: You MUST think, comprehend, and generate every single response token directly in natural, authentic spoken {eng_name} ({native_name}).\n"
                    f"- SPOKEN IDIOMATIC FLUENCY: Use natural everyday phrasing, polite conversational markers, and correct grammar suitable for a real telephone call (e.g. '{sample_phrase}'). When you open with an acknowledgment, use a natural {eng_name} one (for Hindi: 'हाँ जी', 'बिल्कुल', 'समझ गया') and vary it.\n"
                    f"- STRICT NO-ENGLISH RULE: NEVER revert to English, reply in English, or mix English sentences when the caller speaks {eng_name}. Stay 100% in {eng_name}.\n"
                    f"- ADAPTIVE CODE-SWITCHING: If the caller introduces bilingual loan words or code-switches (e.g. mixing everyday technical or local terms), understand them effortlessly and respond naturally in {eng_name} without breaking flow."
                )

        if lang.startswith("en") or lang == "english":
            plan = resolve_multilingual(config)
            if plan.enabled:
                names = ", ".join(language_name(c) for c in plan.languages)
                return (
                    "[LANGUAGE DIRECTIVE: START IN ENGLISH, THEN MIRROR THE CALLER]\n"
                    "- Open the call in natural, fluent spoken English.\n"
                    f"- On EVERY turn, detect which of these languages the caller just spoke: {names}. Reply in THAT language, "
                    "in its native script. If they switch language mid-call, switch with them in that very reply."
                )
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: ENGLISH]\n"
                "- PRIMARY CONVERSATIONAL LANGUAGE: Converse and respond in natural, fluent spoken English.\n"
                "- If the caller speaks another language, understand it but politely reply in English."
            )

        # Fallback mirroring directive for unlisted or custom locales
        return (
            "[LANGUAGE MIRRORING & COMPREHENSION DIRECTIVE]\n"
            "- Understand caller speech in whatever language they speak.\n"
            "- ALWAYS seamlessly match and mirror the caller's spoken language in your response.\n"
            "- Speak naturally and politely."
        )

    @staticmethod
    def _build_business_knowledge_section(
        config: AgentConfiguration,
        business_profile: Optional[Union[dict, Any]] = None,
        vector_rag_context: Optional[str] = None
    ) -> str:
        """Constructs human-grade, spoken telephony business facts with custom prompt overrides and dynamic vector RAG snippets."""
        sections = []
        profile_dict = VoicePromptBuilder.agent_business_profile(config, business_profile)

        # 1. Attached Specific Knowledge Documents (HIGHEST FACTUAL PRIORITY)
        attached_docs_context = []
        if config.attached_document_ids and len(config.attached_document_ids) > 0:
            try:
                from app.repositories.knowledge_repository import knowledge_repository
                org_id = getattr(config, "organization_id", "global") or "global"
                # Small documents fit in the prompt. Large ones (a 70+ page knowledge base) cannot: pasting only the
                # first chunks gives the model the preamble and nothing else, so those are answered through the live
                # `search_knowledge` tool instead.
                small_doc_ids = []
                large_doc_names = []
                for _doc_id in config.attached_document_ids:
                    _meta = knowledge_repository.get_document_by_id_sync(org_id, _doc_id)
                    if _meta and (_meta.total_chunks or 0) > 6:
                        large_doc_names.append(_meta.title or _meta.file_name)
                    else:
                        small_doc_ids.append(_doc_id)
                if large_doc_names:
                    sections.append(
                        "[KNOWLEDGE BASE LOOKUP - MANDATORY]\n"
                        f"- Your verified company knowledge ({', '.join(large_doc_names)}) is too large to be listed here. "
                        "You have a `search_knowledge` function. For ANY question about services, projects, case studies, "
                        "products, technologies, industries, team or company facts, call `search_knowledge` FIRST with the caller's "
                        "topic, then answer ONLY from what it returns.\n"
                        "- If the result contains a 'Spoken brief', say it almost word for word, then offer more detail.\n"
                        "- If nothing relevant is returned, say the solution team will follow up. Never invent projects, clients or numbers.\n"
                        "- Say a short natural filler (for example 'Let me check that for you') before the lookup."
                    )
                attached_chunks = knowledge_repository.get_chunks_for_document_ids_sync(
                    org_id=org_id,
                    document_ids=small_doc_ids,
                    max_chunks_per_doc=6
                )
                if attached_chunks:
                    doc_titles_seen = set()
                    for chk in attached_chunks:
                        d_meta = knowledge_repository.get_document_by_id_sync(org_id, chk.document_id)
                        d_name = d_meta.title if d_meta else "Knowledge Document"
                        doc_titles_seen.add(d_name)
                        attached_docs_context.append(f"[{d_name} - Excerpt]: {chk.content}")

                    if attached_docs_context:
                        doc_names_str = ", ".join(doc_titles_seen)
                        sections.append(
                            f"[ATTACHED SPECIFIC KNOWLEDGE DOCUMENTS & DOMAIN TRUTH (Source: {doc_names_str})]\n"
                            f"- The following verified facts are extracted from the specific document(s) attached to this agent. These facts take ABSOLUTE HIGHEST PRECEDENCE over any general organization details:\n"
                            + "\n\n".join(attached_docs_context)
                        )
            except Exception as e:
                print(f"[VoicePromptBuilder] Warning loading attached document chunks: {e}")

        # 2. Dynamic Vector RAG Grounding Passages (if retrieved during active turn)
        if vector_rag_context and vector_rag_context.strip():
            sections.append(
                f"[RELEVANT DOCUMENT EXCERPTS & VERIFIED KNOWLEDGE (RAG)]\n"
                f"- The following verified excerpts were retrieved from indexed organization documentation:\n"
                f"{vector_rag_context.strip()}"
            )

        # 3. Agent-Specific Custom Knowledge & Parameter Overrides (HIGH PRIORITY)
        if config.custom_knowledge and config.custom_knowledge.strip():
            sections.append(
                f"[AGENT-SPECIFIC CUSTOM KNOWLEDGE & PRIORITY OVERRIDES]\n"
                f"- The following instructions and facts are specific to this agent and OVERRIDE any default company facts below whenever there is a conflict:\n"
                f"{config.custom_knowledge.strip()}"
            )

        # 4. This agent's business details and services (set during agent creation)
        lines = []
        name = profile_dict.get("company_name")
        if name:
            lines.append(f"- Business Name: {name}")
        for label, key in (("Contact Phone Number", "phone"), ("Contact Email", "email"), ("Website", "website")):
            if profile_dict.get(key):
                lines.append(f"- {label}: {profile_dict[key]}")
        addr_parts = [profile_dict.get(k, "") for k in ("address", "city", "state", "country")]
        full_address = ", ".join(p.strip() for p in addr_parts if p and str(p).strip())
        if full_address:
            lines.append(f"- Address: {full_address}")

        srv_strs = []
        for srv in (config.services or []):
            if isinstance(srv, str):
                if srv.strip():
                    srv_strs.append(srv.strip())
                continue
            get = srv.get if isinstance(srv, dict) else (lambda k, d=None, _s=srv: getattr(_s, k, d))
            if not get("enabled", True) or not get("name", ""):
                continue
            srv_line = f"{get('name', '')}: {get('description', '') or ''}".strip(": ")
            price_val = get("price", None) or get("pricing", None)
            if price_val:
                srv_line += f" (Price: {price_val})"
            srv_strs.append(srv_line)
        if srv_strs:
            lines.append("- Services & Products Offered:" + "\n" + "  * " + ("\n" + "  * ").join(srv_strs))

        if lines:
            sections.append("[BUSINESS DETAILS & SERVICES]" + "\n" + "\n".join(lines))

        if not sections:
            return ""

        return (
            "[VERIFIED SPOKEN KNOWLEDGE BASE & TELEPHONY FACTS]\n"
            + "\n\n".join(sections)
            + "\n\nCRITICAL SPOKEN KNOWLEDGE, ENTITY DISTINCTION & GROUNDING RULES (MANDATORY):\n"
            "- ENTITY & PROPERTY NAME DISTINCTION:\n"
            "  * If the caller asks for the name of the resort, hotel, property, clinic, product, or specific location, ALWAYS provide the exact property/product name mentioned in [ATTACHED SPECIFIC KNOWLEDGE DOCUMENTS] or [AGENT-SPECIFIC CUSTOM KNOWLEDGE].\n"
            "  * NEVER confuse or substitute the holding organization/parent company name with the specific resort, hotel, clinic, or product name.\n"
            "- EXACT FACT FIDELITY: When the customer asks about available rooms, packages, services, pricing, amenities, check-in times, or policies, cite and use the verified details from the attached knowledge documents above.\n"
            "- COMPOUND REQUIREMENT & PREFERENCE HANDLING:\n"
            "  * If the caller provides multi-part criteria (e.g., party size, number of couples/guests, budget constraints, room preference vs ocean view), acknowledge all elements directly in your next response without getting stuck or pausing.\n"
            "  * Instantly match their criteria against the attached knowledge base (e.g. recommend 2 budget/standard rooms or a multi-bedroom family suite for 2 couples seeking affordable rates) and state the exact rates and features.\n"
            "- DYNAMIC CUSTOMER QUALIFICATION & CONSULTATIVE DISCOVERY:\n"
            "  * When a customer asks a broad or multi-option question (e.g. 'Which type of room is available and what is the cost?'), do NOT dump all options in a long list.\n"
            "  * Deliver a concise 1-sentence overview of the top options with starting prices, then immediately follow up with ONE natural, consultative qualifying question tailored to their needs (e.g., 'We offer our Standard King Suite from $250 and Deluxe Villas from $450 per night. How many guests will be joining you, and which dates are you planning?').\n"
            "  * Once the caller shares their preferences, dynamically recommend the exact best-fitting option from the knowledge base and offer to proceed with booking.\n"
            "- SEMANTIC INTENT MATCHING: Recognize caller questions regardless of phrasing, accents, or slight conversational hesitations.\n"
            "- ZERO HALLUCINATION: Never invent, guess, or hallucinate prices, discounts, rooms, or features outside of this verified knowledge base."
        )

    @staticmethod
    def _build_platform_rules_section(platform_rules: Optional[List[Dict[str, Any]]] = None) -> str:
        if not platform_rules:
            return ""

        directives = []
        for r in platform_rules:
            title = r.get("title", "")
            directive = r.get("directive", "")
            if directive:
                directives.append(f"- {title}: {directive}")

        if not directives:
            return ""

        return "[PLATFORM VOICE DIRECTIVES]\n" + "\n".join(directives[:4])

    @staticmethod
    def _build_temporal_context(
        business_profile: Optional[Union[dict, Any]] = None,
        config: Optional[AgentConfiguration] = None,
    ) -> str:
        """
        Live calendar anchoring and scheduling rules in the timezone and hours of the agent
        currently speaking (its own schedule overrides the organization profile; see
        app.agents.schedule.resolve_agent_schedule).
        """
        from datetime import timedelta
        from app.agents.schedule import resolve_agent_schedule

        schedule = resolve_agent_schedule(config, business_profile)
        now = schedule.now()
        day_name = now.strftime("%A")
        date_str = now.strftime("%B %d, %Y")
        time_str = now.strftime("%I:%M %p")

        upcoming_days = [
            f"{(now + timedelta(days=i)).strftime('%A')}: {(now + timedelta(days=i)).strftime('%B %d')}"
            for i in range(1, 8)
        ]
        upcoming_map_str = "; ".join(upcoming_days)

        business = schedule.business_name
        hours_text = schedule.hours_sentence()
        if schedule.hours_text:
            working_hours_rule = (
                f"- OPERATING HOURS FOR {business.upper()}: {schedule.hours_text} (all times in {schedule.timezone_label}). "
                "Hours can differ by weekday: check the requested day AND time against that day's hours. If it is outside them or on a "
                "closed day, say the real hours for that day and offer the nearest slot inside them (6 PM is NOT bookable when closing is 6 PM). "
                "Never quote another organization's hours."
            )
        else:
            working_hours_rule = (
                f"- OPERATING HOURS FOR {business.upper()}: {hours_text}. If no fixed hours are listed, do not refuse a time because of office hours."
            )

        return (
            "[SCHEDULING RULES]\n"
            f"- BUSINESS TIMEZONE FOR {business.upper()}: {schedule.timezone_label}. Every appointment time you offer or confirm is in this timezone.\n"
            f"{working_hours_rule}\n"
            f"- A month and day without a year means the next occurrence on or after today ({date_str}). Never call a future date past.\n"
            f"- Anything later than {time_str} today is in the future and can be booked if it is inside the hours.\n"
            f"- If the caller names their own timezone or country (\"5 PM UK time\", \"3 PM EST\"), acknowledge it once and say the equivalent time at {business}.\n"
            "- When you confirm, give the weekday AND the calendar date from the calendar above."
        )


    @staticmethod
    def _neutralize_example_dates(text: str) -> str:
        """A saved prompt may contain a sample line like 'How does Thursday, September 14th at 2 PM sound?'. The model
        repeats it as if it were real, so literal weekday-plus-date examples are turned into an instruction to use the calendar."""
        return _EXAMPLE_DATE.sub("a real upcoming weekday and date from today's calendar", text or "")

    @staticmethod
    def _build_speaking_limits(response_length: Optional[str]) -> str:
        """Hard limits placed right after the agent's own instructions. The longer rules further down are easy for the model
        to lose in a long prompt, which is how a 'short' agent ended up giving four-sentence explanations."""
        key = (response_length or "short").lower()
        if key in ("detailed", "long"):
            sentences, words = "4", "75"
        elif key in ("balanced", "medium"):
            sentences, words = "3", "45"
        else:
            sentences, words = "2", "30"
        return (
            "[HOW YOU SPEAK - HARD LIMITS, THEY BEAT EVERY OTHER INSTRUCTION]\n"
            f"- Every reply is at most {sentences} short sentences and about {words} words, even when the caller says \"explain\" or "
            "\"tell me more\". Give the single most useful point, then stop or ask ONE short question. Never list several services or tools; "
            "name one that fits what they said.\n"
            "- Ask only one question per reply. Open with a short first clause so speech starts quickly.\n"
            "- Don't start with filler like \"Perfect!\" or \"Glad to hear that!\" on every turn; answer what they said.\n"
            "- BOOKING FLOW, one step per reply. What you book is whatever YOUR instructions say (a technician visit, an appointment, a demo, "
            "a meeting, a call): use that exact kind of booking and never swap it for another, such as a \"call with a specialist\". "
            "If booking is your main goal and the caller has described what they need, offer the booking in one short sentence and ask for the "
            "day and time in the same reply (for example \"I can send a technician. What day and time suit you?\"). If booking is only a side "
            "step (sales or discovery), first ask whether they would like it and wait for a yes, then ask for the day and time.\n"
            "- BOOK DIRECTLY AND SAY IT ONCE. As soon as the caller gives a clear day and time (for example \"tomorrow 3\"), it is booked: say so in "
            "ONE short sentence with the weekday, date and time, like \"Done, you're booked for tomorrow, Friday, November 6, at 3 PM.\" Do NOT ask "
            "\"is that correct?\", do not ask them to confirm, and do not read it back again later; repeat it only if the caller asks. If they "
            "correct you (\"no, 2 PM\"), say the new time once the same way and carry on. If they gave only a day or only a time, ask for the "
            "missing part. Never say the time zone or a region name (such as Asia/Kolkata) in a sentence: say \"3 PM\", nothing more. Collect "
            "anything else your instructions require (address, name, device) one item per reply."
        )

    @staticmethod
    def _transfer_number(config: AgentConfiguration) -> Optional[str]:
        """The number this agent may forward callers to: its own, and only while forwarding is switched on."""
        guard = getattr(config, "guardrails", None)
        if not guard or not getattr(guard, "human_transfer_enabled", True):
            return None
        number = (getattr(guard, "human_transfer_phone_number", None) or "").strip()
        return number or None

    @staticmethod
    def _build_transfer_rule(config: AgentConfiguration) -> str:
        if VoicePromptBuilder._transfer_number(config):
            return (
                "[CALL TRANSFER - AVAILABLE, THIS BEATS ANY OTHER INSTRUCTION ABOUT TRANSFERS]\n"
                "- You can connect the caller to a specialist by phone. Do it only when the caller asks to speak to a person, a senior person or a "
                "specialist, or when you truly cannot help. Say one short line such as \"Sure, I'll connect you to a specialist now.\" and nothing more.\n"
                "- Do not offer a transfer when you can answer or book yourself."
            )
        return (
            "[CALL TRANSFER - NOT AVAILABLE ON THIS AGENT, THIS BEATS ANY OTHER INSTRUCTION ABOUT TRANSFERS]\n"
            "- You cannot transfer, forward or connect calls. Never offer it, never say \"I'll transfer you\", \"connect you\" or \"please hold\", "
            "even if your other instructions mention a live transfer or a specialist on the line.\n"
            "- If the caller asks for a person, a manager, a senior person or a specialist, say politely in one or two short sentences: "
            "\"I'm sorry, I can't connect you right now, but our team will reach out to you soon.\" Then, if your job includes booking, "
            "add \"Would you like me to schedule a meeting or a call with them?\" If it does not, add \"Is there anything I can note down for them?\"\n"
            "- If they accept the meeting or call, book it as usual. If they decline, thank them and finish politely."
        )

    @staticmethod
    def _outbound_rewrite(text: str) -> str:
        """A saved prompt written for inbound calls says 'Thank you for calling! How can I assist you today?'. On a call the
        agent placed, those lines are wrong and the model repeats them, so they are replaced for outbound calls only."""
        text = re.sub(r"Thank you for calling[^.!?\n]*[.!?]\s*", "", text or "", flags=re.I)
        return re.sub(r"(?:How can I|What can I) (?:help|assist)(?: you)?(?: with)?(?: today)?\s*\?", "Is now a good time for a quick chat?", text, flags=re.I)

    @staticmethod
    def _build_outbound_anchor() -> str:
        return (
            "[OUTBOUND CALL - YOU PLACED THIS CALL]\n"
            "- The customer did not call you. Never say \"Thank you for calling\", \"How can I help you today\" or \"How can I assist you today\", "
            "even if other instructions show those lines.\n"
            "- If the customer sounds confused, says something unclear or asks why you called, answer in ONE sentence with the reason for "
            "your call, then ask ONE short question. Never end the call yourself because of an unclear or odd reply, and never say "
            "goodbye unless the customer clearly refuses or says goodbye first."
        )

    @staticmethod
    def _build_date_anchor(
        business_profile: Optional[Union[dict, Any]] = None,
        config: Optional[AgentConfiguration] = None,
    ) -> str:
        """Short block placed right after the agent's own instructions so the prompt cut can never drop today's date."""
        from datetime import timedelta
        from app.agents.schedule import resolve_agent_schedule

        schedule = resolve_agent_schedule(config, business_profile)
        now = schedule.now()
        tomorrow = now + timedelta(days=1)
        following = ", ".join(
            f"{(now + timedelta(days=i)).strftime('%A %B %d')}" for i in range(2, 8)
        )
        return (
            "[TODAY'S DATE & BOOKING RULES - ALWAYS FOLLOW]\n"
            f"- Today is {now.strftime('%A, %B %d, %Y')}, {now.strftime('%I:%M %p')} ({schedule.timezone_label}) at the start of this call. "
            f"Tomorrow is {tomorrow.strftime('%A, %B %d')}. After that: {following}.\n"
            "- Take every date from this calendar. Never invent or recite a date from memory; a weekday or date written elsewhere in your "
            "instructions is only a pattern. A date before today is never valid.\n"
            "- When you ask for or offer a booking time, use real upcoming days from this calendar, for example "
            f"\"tomorrow, {tomorrow.strftime('%A %B %d')}, at 11 AM\".\n"
            "- When the caller names a day and a time (\"tomorrow 5 PM\", \"Friday 3\"), book it right away and say it ONCE with the weekday, "
            f"the calendar date and the time, for example \"Done, you're booked for {tomorrow.strftime('%A, %B %d')} at 5 PM.\" Do not ask them to confirm "
            "it and do not repeat it later unless they ask. If they change it, say the new time once. If they gave only a day or only a time, ask for the missing part.\n"
            "- Never say a time zone or region name (\"Asia/...\", \"IST\") in a sentence; say \"5 PM\". Mention a zone only if the caller says they are in a different one.\n"
            "- Speak only words meant for the caller. Never say bracketed notes or stage directions such as \"[Scheduling the meeting...]\" "
            "and never say \"please hold on\". Do not promise an email or calendar invite unless your facts say you send one.\n"
            "- When the caller says bye, thanks or that's all, reply with ONE short goodbye that includes the word \"goodbye\", then stop talking."
        )

    @staticmethod
    def _build_role_intent_directives(config: AgentConfiguration) -> str:
        """Dynamically derives conversational posture based on agent role and objective."""
        role_lower = (config.role or "").lower()
        name_lower = (config.name or "").lower()
        obj_lower = (config.objective or "").lower()

        is_outbound_sales = any(w in f"{role_lower} {name_lower}" for w in ["sales", "outbound", "cold", "lead", "prospect", "outreach", "telemarketing"]) or \
                            any(w in obj_lower for w in ["outbound", "cold call", "lead generation", "sales outreach", "qualify leads", "outreach to"])
        is_followup = any(w in f"{role_lower} {name_lower}" for w in ["follow-up", "follow up", "feedback", "survey", "check-in", "nps"]) or \
                      any(w in obj_lower for w in ["follow-up", "follow up", "feedback", "survey", "check-in"])

        if is_outbound_sales:
            return (
                "[OUTBOUND 4-STEP CONVERSATION FLOW & OBJECTION HANDLING]\n"
                "- Step 1 (Hook & Availability): You initiated this call. Never ask 'How can I help you today?'. State your brief 20-second intro and check if now is an okay time or if later is better.\n"
                "- Step 2 (Handle Availability & Objections):\n"
                "  * If busy / later: Respond politely: 'I completely understand. What would be a better day or time for me to call you back?'. Confirm their response and conclude.\n"
                "  * If not interested: Acknowledge politely: 'No problem at all. Thank you for your time today. Have a great day!' and conclude.\n"
                "  * If free / asking what this is about: Proceed to Step 3.\n"
                "- Step 3 (Needs Discovery): Ask ONE single concise question to understand their requirements. Keep responses under 20 words.\n"
                "- Step 4 (Call to Action): Answer their inquiry directly using your domain knowledge. If they want a detailed consultation, propose a short 10-15 minute chat."
            )
        elif is_followup:
            return (
                "[INBOUND / CUSTOMER INQUIRY & FOLLOW-UP RULES]\n"
                "- You are speaking with a customer. ALWAYS directly answer their questions about pricing, subscriptions, services, and bookings immediately.\n"
                "- NEVER deflect questions by offering to schedule a call if you can answer them. Give the factual answer directly."
            )
        else:
            return f"[ROLE OBJECTIVE]\n- Embody a {config.role}: {config.objective}"

    @staticmethod
    def _build_conversational_acoustics_section(config: AgentConfiguration) -> str:
        """Injects instructions for natural conversational fillers, phrasing rhythm, and spoken human acoustics."""
        # Spoken-style rules always apply (they used to vanish when thinking-fillers were switched off).
        speed = getattr(getattr(config, "voice", None), "speed", None) or 1.0
        p = getattr(config, "personality", None)
        energy_val = getattr(p, "energy", 70) if p else 70
        patience_val = getattr(p, "patience", 80) if p else 80

        if speed <= 0.9 or (patience_val >= 85 and energy_val <= 45):
            pacing_line = "- Pace: calm and unhurried, with gentle pauses at commas.\n"
        elif speed >= 1.05 or energy_val >= 80:
            pacing_line = "- Pace: lively and brisk, with short punchy sentences.\n"
        elif patience_val <= 35:
            pacing_line = "- Pace: brisk and direct, no lingering.\n"
        else:
            pacing_line = "- Pace: relaxed, natural conversational pace.\n"

        return (
            "[HOW TO SOUND HUMAN]\n"
            f"{pacing_line}"
            "- Talk like a person on the phone, not like written text: use contractions (I'm, we'll, don't), vary sentence length, and "
            "answer first, then add context only if it helps. No lists, no bullets, no stage directions.\n"
            "- Write everything the way it is said aloud: prices in words ('two hundred fifty dollars'), dates like 'March third', "
            "'per night' not '/night', 'square feet' not 'sq ft', no symbols, markdown, emojis or URLs read letter by letter.\n"
            "- Openers: vary them. Often start straight with the answer; sometimes use a short natural acknowledgment (in the language "
            "you are replying in), never the same one twice in a row.\n"
            "- React to how the caller sounds: if they are frustrated or unsure, acknowledge it in a few words before helping.\n"
            "- Use commas for micro-pauses. Never use ellipses (...) or trailing dots between sentences.\n"
            "- State facts as statements. Ask a question only when you need an answer from the caller."
        )

    @staticmethod
    def _build_turn_taking_directives(config: AgentConfiguration) -> str:
        """Injects turn-taking directives for large explanations, long notes, dictation and multi-clause speech."""
        return (
            "[ADAPTIVE TURN-TAKING & INCOMPLETE UTTERANCE HANDLING]\n"
            "- LONG EXPLANATIONS & DETAILED NOTES: When the caller is explaining a scenario, dictating a note, giving instructions, or speaking in multi-clause sentences, they naturally pause between clauses or thoughts. NEVER cut in prematurely or answer an incomplete fragment. Wait for their complete thought.\n"
            "- INCOMPLETE SENTENCES: If a caller's utterance ends on a conjunction, preposition, or trailing tone (e.g., 'and also...', 'because when I...', 'I was thinking that...'), they are still formulating their note. Do not answer half-sentences.\n"
            "- DICTATION & DIGIT PAUSES: When the caller spells out a phone number, email address, OTP, or postal code, they often pause between digit clusters (e.g., 'My number is 98250...' [pause] '...12345'). NEVER interrupt or prematurely finalize the answer during these natural pauses.\n"
            "- PATIENT LISTENING: Always give the caller sufficient breathing room to complete their entire train of thought."
        )

    @staticmethod
    def _build_pronunciation_rules_section(config: AgentConfiguration) -> str:
        """Injects explicit phonetic pronunciation rules so the TTS articulates Indian names, acronyms, and terms flawlessly."""
        rules = getattr(config, "pronunciation_rules", None)
        if not rules:
            return ""

        lines = []
        for r in rules:
            w = getattr(r, "word", "") if hasattr(r, "word") else r.get("word", "")
            p = getattr(r, "phonetic", "") if hasattr(r, "phonetic") else r.get("phonetic", "")
            if w and p:
                lines.append(f"- {w} -> Speak phonetically as \"{p}\"")

        articulation_guidelines = (
            "\nENTITY ARTICULATION & DIGIT GROUPING RULES (MANDATORY):\n"
            "- PHONE NUMBERS (CRITICAL): ALWAYS write every phone number, OTP, PIN, extension or ID as individual digit WORDS, grouped with commas so there is a natural breath between groups. Never write phone numbers as digits or as one big number, because the voice would read them as thousands or millions. "
            "Example: 9876543210 must be written as 'nine eight seven six five, four three two one zero'. A number with a country code such as +91 98765 43210 becomes 'plus nine one, nine eight seven six five, four three two one zero'. Use 'zero' for 0. "
            "When confirming a number the caller gave you, repeat it back in the same grouping and ask 'is that right?'.\n"
            "- CURRENCIES: say amounts in the SAME currency your facts use; never convert or estimate another currency.\n"
            "- Units in full words ('square feet', '2 B-H-K')."
        )

        if not lines:
            return f"[MANDATORY PHONETIC PRONUNCIATION & SPOKEN OVERRIDES]{articulation_guidelines}"

        return (
            "[MANDATORY PHONETIC PRONUNCIATION & SPOKEN OVERRIDES]\n"
            "When mentioning any of the following names, cities, acronyms, or specialized terminology, you MUST speak their phonetic representation so the voice synthesizer articulates them with flawless, human-grade clarity:\n"
            + "\n".join(lines[:30])
            + articulation_guidelines
        )

    @staticmethod
    def _build_interruption_resumption_directives(config: AgentConfiguration) -> str:
        """Injects directives on handling brief interruptions and resuming seamlessly."""
        runtime = getattr(config, "runtime", None)
        if runtime and not getattr(runtime, "graceful_resumption_enabled", True):
            return ""
        return (
            "[IF THE CALLER INTERRUPTS]\n"
            "- A brief interjection ('wait', 'sorry', 'go on', 'okay') is not a new question: do not restart your answer or greeting.\n"
            "- If they asked a question or raised an objection, answer that first in one sentence. Otherwise pick up the thought briefly "
            "('Right, as I was saying...') and finish it in under two sentences."
        )

    @staticmethod
    def _build_few_shot_examples_section(config: AgentConfiguration) -> str:
        """Injects 2-3 golden conversation transcripts tailored to the agent's role or custom examples."""
        examples = getattr(config, "few_shot_examples", None) or []
        if not examples:
            # Auto-select matching industry preset based on role or objective
            from app.agents.configuration import get_industry_few_shot_presets
            all_presets = get_industry_few_shot_presets()
            role_lower = (config.role or "").lower() + " " + (config.objective or "").lower()
            if any(k in role_lower for k in ["estate", "property", "realtor", "apartment", "villa"]):
                examples = [p for p in all_presets if p.industry == "real_estate"]
            elif any(k in role_lower for k in ["health", "doctor", "clinic", "hospital", "medical", "patient"]):
                examples = [p for p in all_presets if p.industry == "healthcare"]
            elif any(k in role_lower for k in ["tech", "software", "b2b", "automation", "solutions", "cloud"]):
                examples = [p for p in all_presets if p.industry == "b2b_tech"]
            elif any(k in role_lower for k in ["auto", "car", "service", "vehicle", "mechanic", "brake"]):
                examples = [p for p in all_presets if p.industry == "automotive"]
            else:
                examples = [p for p in all_presets if p.industry in ["support", "real_estate"]]

        if not examples:
            return ""

        formatted_dialogues = []
        for idx, ex in enumerate(examples[:2], start=1):
            turns = []
            for t in ex.dialogue:
                role_label = "Caller" if t.role == "user" else "Assistant"
                turns.append(f"  {role_label}: \"{t.content}\"")
            dialogue_str = "\n".join(turns)
            formatted_dialogues.append(f"Example #{idx} ({ex.title}):\n{dialogue_str}")

        return (
            "[FEW-SHOT TELEPHONY DIALOGUE REFERENCE (GOLDEN HUMAN PATTERNS)]\n"
            + "\n\n".join(formatted_dialogues)
        )

    @staticmethod
    def _build_workflow_stages_section(config: AgentConfiguration) -> str:
        """Translates structured conversational workflow canvas nodes & branches into clear telephone guidelines."""
        stages = getattr(config, "workflow_stages", None) or []
        if not stages:
            return ""

        def _get_val(obj: Any, key: str, default: Any = None):
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        sorted_stages = sorted(stages, key=lambda s: _get_val(s, "order", 0) or 0)
        lines = ["[STRUCTURED CONVERSATIONAL WORKFLOW & STAGE TRANSITIONS]"]
        for idx, stage in enumerate(sorted_stages, start=1):
            title = _get_val(stage, "title", f"Stage {idx}") or f"Stage {idx}"
            stype = _get_val(stage, "stage_type", "custom") or "custom"
            instruction = _get_val(stage, "instruction", "") or ""
            branches = _get_val(stage, "branches", []) or []
            key_pts = _get_val(stage, "key_points", []) or []

            lines.append(f"STAGE {idx}: {title.upper()} (Type: {stype.capitalize()})")
            if instruction:
                lines.append(f"  - Directive: {instruction.strip()}")
            if key_pts:
                lines.append("  - Key Points: " + "; ".join([str(kp).strip() for kp in key_pts if kp]))
            if branches:
                for b in branches:
                    cond = _get_val(b, "condition_label", "Condition") or "Condition"
                    target = _get_val(b, "target_stage_id", "Next Stage") or "Next Stage"
                    kw = _get_val(b, "keywords", []) or []
                    kw_str = f" (Triggers: {', '.join(kw)})" if kw else ""
                    lines.append(f"  - Transition: If {cond}{kw_str} -> Advance to {target}")

        return "\n".join(lines)

    @staticmethod
    def _build_guardrails_section(config: AgentConfiguration) -> str:
        """Injects agent-specific allowed actions, restricted actions, and boundary enforcement."""
        gr = getattr(config, "guardrails", None)
        if not gr:
            return ""

        allowed = getattr(gr, "allowed_actions", []) or []
        restricted = getattr(gr, "restricted_actions", []) or []

        lines = ["[STRICT BEHAVIORAL BOUNDARIES & SCOPE ENFORCEMENT]"]
        if allowed:
            lines.append("AUTHORIZED SCOPE ONLY:")
            for a in allowed:
                lines.append(f"- {a}")
        if restricted:
            lines.append("FORBIDDEN / OUT-OF-SCOPE TOPICS:")
            for r in restricted:
                lines.append(f"- {r}")

        lines.append(
            "- OUT-OF-SCOPE TOPICS (DO NOT CUT THE CALL): you assist strictly within your business services. Never end the call or say goodbye "
            "over an off-topic question unless the caller asks to end it or refuses to talk.\n"
            "  * Look before you decline: if you have a `search_knowledge` function, call it with the caller's topic first. Speech recognition "
            "garbles product names ('n eight n' is n8n, 'power ops' may be 'Power Apps'), so search the most likely real term. 'What other "
            "services do you offer?' is never off-topic: answer with two or three of your services in one sentence.\n"
            "  * If something is truly not covered, say so in one short friendly sentence and offer a follow-up from the team, with varied "
            "wording each time. English example: \"That's not something we've delivered so far, but I can have our solution team confirm. Want me to set up a quick call?\" "
            "For clearly unrelated consumer topics (internet, loans, phones): say it is not your area and ask whether they have a project in your field.\n"
            "  * Honor what the caller already told you; never repeat a fixed pitch they already answered.\n"
            "  * If the caller says they do not want to talk or are not interested, skip all of this and follow the refusal rule."
        )
        return "\n".join(lines)

    @staticmethod
    def build_prompt(
        config: AgentConfiguration,
        business_profile: Optional[Union[dict, Any]] = None,
        platform_rules: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        Synthesizes the dynamic system prompt with business knowledge, calendar context,
        acoustic directives, few-shot examples, and strict telephony guardrails.
        """
        if platform_rules is None:
            try:
                from app.repositories.platform_rules_repository import PlatformRulesRepository
                platform_rules = PlatformRulesRepository.get_active_rule_directives_sync()
            except Exception:
                platform_rules = []

        temporal_rule = VoicePromptBuilder._build_temporal_context(business_profile, config)
        date_anchor = VoicePromptBuilder._build_date_anchor(business_profile, config)
        is_outbound = getattr(config, "_call_direction", "") == "outbound"
        outbound_anchor = VoicePromptBuilder._build_outbound_anchor() if is_outbound else ""
        speaking_limits = VoicePromptBuilder._build_speaking_limits(config.response_length)
        transfer_rule = VoicePromptBuilder._build_transfer_rule(config)
        language_rule = VoicePromptBuilder._build_language_directives(config)
        knowledge_section = VoicePromptBuilder._build_business_knowledge_section(config, business_profile)
        platform_rules_text = VoicePromptBuilder._build_platform_rules_section(platform_rules)
        acoustics_rule = VoicePromptBuilder._build_conversational_acoustics_section(config)
        resumption_rule = VoicePromptBuilder._build_interruption_resumption_directives(config)
        pronunciation_rule = VoicePromptBuilder._build_pronunciation_rules_section(config)
        few_shot_section = VoicePromptBuilder._build_few_shot_examples_section(config)

        telephony_rules = """[SPOKEN TELEPHONY RULES]
1. ANSWER DIRECTLY: When asked about pricing, plans, features or availability, answer immediately with the exact facts from your knowledge, in one or two sentences. Never hand the caller to a specialist or offer a callback when you can answer. If a price or detail is NOT in your facts, never guess or estimate it; say you'll check that detail and ask one short follow-up. Never send the caller to an email address, website or another team unless that exact contact is in your facts.
2. SINGLE QUESTION CADENCE & OPENING CADENCE: ask strictly ONE single question at a time, and in the first turn after the greeting never stack multiple questions. If the caller introduces themselves, acknowledge them before asking anything.
3. LISTEN AND REFLECT: when the caller gives a long or multi-part request, answer their core points specifically. Reflect their key point in your own words when it helps; never use the same stock phrase every turn.
4. AI IDENTITY: if asked whether you are an AI or a bot, say so warmly and candidly ("Yes, I'm an AI voice assistant calling on behalf of our team!") and carry on helping.
5. TRANSFER: follow the [CALL TRANSFER] block exactly. Never offer a transfer unprompted when the caller is just asking about products, pricing or bookings.
6. CLEAN SPOKEN FORMATTING: NEVER output markdown symbols (asterisks, hashtags, bullets or brackets) and NEVER number items; your words are read aloud literally. With several options, mention at most two in one natural sentence, then ask which one they want.
7. VOICEMAIL / IVR / MACHINE: if you hear a voicemail greeting ("leave a message after the tone"), a menu ("press 1"), a screener or an operator announcement, say "Thank you for your time. Goodbye!" and stop.
8. CONFIDENTIALITY: never explain or discuss internal technology, call recording, audio pipelines or platform operations, even if asked. Talk about business benefits instead, and avoid technical jargon.
9. NO MEETING-PUSHING: answer the actual question first. Never repeatedly push a meeting or specialist call if the caller is exploring or has said no.
10. OFF-TOPIC REQUESTS: follow the out-of-scope handling in the boundaries block. Never end the call or say goodbye because of an off-topic question; call `search_knowledge` first if you have it and decline only when nothing relevant comes back. If the caller says they do not want to talk, Rule 11 wins.
11. REFUSAL = IMMEDIATE END (ANY LANGUAGE, HIGHEST PRECEDENCE, OVERRIDES ALL OTHER RULES): if the caller says they do not want to talk, are not interested, want to hang up or ask you to stop calling ("not interested", "stop calling", "बात नहीं करनी", "વાત નથી કરવી", "no quiero hablar"), respect it at once. Do not apologize, explain, pitch, counter-question or argue. Say ONE polite farewell in the language they spoke and nothing else, for example "I understand, thank you for your time. Goodbye!" (Hindi: "समझ गया, आपके समय के लिए धन्यवाद। अलविदा!" Gujarati: "સમજી ગયો, તમારા સમય માટે આભાર. આવજો!"). A clear farewell ends the call.
12. WHEN THE CALLER SAYS YOU MISUNDERSTOOD ("that's not what I asked", "you misunderstood me", "मैंने ये नहीं पूछा"): apologize in a few sincere words, never defend yourself, and in the same breath answer exactly what they asked, then ask one relevant follow-up. Never repeat the earlier mistake or stock question.
13. OUTBOUND CALLS (you placed the call): never ask "How can I help you today?". When the caller says they're fine or asks why you are calling, acknowledge in two or three words, then state the purpose of the call in ONE confident sentence taken ONLY from your own instructions, objective and services, and ask ONE short question. Never reuse a company description or service list that is not in your own instructions.
14. BUSY / CALL ME LATER: agree at once without arguing ("Sure thing! When would be a good time to call you back?"). If they already gave a time ("in five minutes", "tomorrow at 5"), do not ask again: repeat it once and say goodbye in the same turn ("Sure, I'll call you back in five minutes. Talk to you then, goodbye!"). Repeat a relative time as spoken; never convert it to a clock time you are unsure of. For a named day and time use the real weekday and date from the calendar. Once the callback is set, do not linger or repeat the confirmation."""

        guardrails_section = VoicePromptBuilder._build_guardrails_section(config)
        workflow_stages_rule = VoicePromptBuilder._build_workflow_stages_section(config)

        personality_section = VoicePromptBuilder._build_personality_summary(config)

        # If custom system_prompt is provided, prioritize it directly while ensuring personality, language and length directives apply
        if config.system_prompt and config.system_prompt.strip():
            # The prompt is cut at the tail when over the limit, so the facts the agent must answer from (knowledge
            # and the live-lookup instruction) come right after its own instructions instead of after ~20k of rules.
            parts = [
                VoicePromptBuilder._outbound_rewrite(VoicePromptBuilder._neutralize_example_dates(config.system_prompt.strip()))
                if is_outbound else VoicePromptBuilder._neutralize_example_dates(config.system_prompt.strip()),
                speaking_limits,
                transfer_rule,
                knowledge_section,
                personality_section,
                guardrails_section,
                telephony_rules,
                language_rule,
                workflow_stages_rule,
                acoustics_rule,
                resumption_rule,
                pronunciation_rule,
                few_shot_section,
                platform_rules_text
            ]
        else:
            role_directives = VoicePromptBuilder._build_role_intent_directives(config)

            # Capabilities & Custom Skills
            skills_directives = []
            if config.skills:
                skills_directives.append("[AUTHORIZED CALL CAPABILITIES & ACTIONS]")
                can_transfer = bool(VoicePromptBuilder._transfer_number(config))
                for sk in config.skills:
                    if "transfer" in sk.lower() and not can_transfer:
                        continue  # a listed skill must not promise forwarding when no transfer number is set
                    skills_directives.append(f"- {sk}: Fully authorized to execute this capability during calls when relevant.")
            skills_text = "\n".join(skills_directives) if skills_directives else ""

            parts = [
                f"You are {config.name}, a {config.role} speaking on a live telephone call.",
                f"PRIMARY GOAL: {config.objective}",
                speaking_limits,
                transfer_rule,
                personality_section,
                guardrails_section,
                telephony_rules,
                language_rule,
                role_directives,
                workflow_stages_rule,
                knowledge_section,
                skills_text,
                acoustics_rule,
                resumption_rule,
                pronunciation_rule,
                few_shot_section,
                platform_rules_text
            ]

        compiled_prompt = "\n\n".join([p.strip() for p in parts if p and p.strip()])
        # Resolve any dynamic variables like {{company_name}}, {{agent_name}}, {{agent_role}}, etc.
        resolved_prompt = VoicePromptBuilder.resolve_dynamic_variables(
            compiled_prompt,
            config=config,
            business_profile=business_profile
        ).strip()

        # Per-call text (today's date, scheduling rules, outbound anchor) goes LAST so the long stable part above stays
        # identical from call to call (friendlier to prompt caching) and the recent date sits where the model weighs it.
        dynamic_text = VoicePromptBuilder.resolve_dynamic_variables(
            "\n\n".join(p.strip() for p in (outbound_anchor, date_anchor, temporal_rule) if p and p.strip()),
            config=config,
            business_profile=business_profile,
        ).strip()

        # Deepgram managed LLMs have a hard 25,000 character limit. Only the stable part is ever cut; the per-call block
        # and the language rule are appended after trimming so they can never be dropped. The language rule goes last
        # and overrides any earlier "speak only X" wording, including a saved prompt.
        language_override = VoicePromptBuilder._build_language_override(config)
        reserved = (len(dynamic_text) + 2 if dynamic_text else 0) + (len(language_override) + 2 if language_override else 0)
        limit = PROMPT_CHAR_LIMIT - reserved
        if len(resolved_prompt) > limit:
            resolved_prompt = resolved_prompt[:limit]
        if dynamic_text:
            resolved_prompt = f"{resolved_prompt}\n\n{dynamic_text}"
        if language_override:
            resolved_prompt = f"{resolved_prompt}\n\n{language_override}"

        return resolved_prompt

    @staticmethod
    def _build_language_override(config: AgentConfiguration) -> str:
        """Final per-turn language rule for multi-language agents; empty when the agent is single-language."""
        plan = resolve_multilingual(config)
        if not plan.enabled:
            return ""
        names = ", ".join(language_name(c) for c in plan.languages)
        return (
            f"[FINAL LANGUAGE RULE - THIS OVERRIDES EVERY EARLIER LANGUAGE INSTRUCTION, INCLUDING 'SPEAK ONLY X']\n"
            f"Allowed languages: {names}. {language_name(plan.primary)} is only the language the call OPENED in.\n"
            f"Do this silently before EVERY reply:\n"
            f"1. Look at the caller's LAST message only. Decide its language from its words and letters: Devanagari letters = Hindi, "
            f"Latin letters with English words = English, Latin letters with Spanish words = Spanish, and so on. Broken or "
            f"ungrammatical English is still English.\n"
            f"2. Write your whole reply in THAT language, in its native script, even if every earlier reply was in another language. "
            f"Example: caller says 'I want an email system' -> you reply in English; caller then says 'हाँ बताइए' -> you reply in Hindi.\n"
            f"3. Never say you are switching. If the last message is a single filler word (like 'okay' or 'yes') or unclear, keep "
            f"the language of your previous reply.\n"
            f"A reply in the wrong language is a failure of this rule."
        )


