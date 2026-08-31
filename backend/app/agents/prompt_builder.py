"""
Voice Prompt Builder
Constructs phone-optimized, human-grade conversational prompts that strictly enforce
spoken cadence, response length limits (1-2 sentences), personality sliders,
active listening confirmations, psychological empathy, and guardrails.
"""

from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone
from app.agents.configuration import AgentConfiguration


class VoicePromptBuilder:
    """Builds human-grade, voice-specific system prompts from an AgentConfiguration."""

    @staticmethod
    def _build_personality_instructions(config: AgentConfiguration) -> List[str]:
        p = config.personality
        directives = []

        # 1. Professionalism (0-100)
        if p.professionalism >= 85:
            directives.append("Tone & Demeanor: Highly professional, polished, articulate, and formal business demeanor.")
        elif p.professionalism >= 65:
            directives.append("Tone & Demeanor: Balanced professional warmth, courteous and respectful.")
        elif p.professionalism >= 40:
            directives.append("Tone & Demeanor: Conversational, relaxed, everyday approachable business style.")
        else:
            directives.append("Tone & Demeanor: Very casual, informal peer-to-peer conversational manner.")

        # 2. Friendliness (0-100)
        if p.friendliness >= 85:
            directives.append("Warmth & Rapport: Exceptionally warm, welcoming, polite, and enthusiastic.")
        elif p.friendliness >= 60:
            directives.append("Warmth & Rapport: Friendly, pleasant, and positive.")
        elif p.friendliness >= 35:
            directives.append("Warmth & Rapport: Neutral, balanced, and direct.")
        else:
            directives.append("Warmth & Rapport: Purely matter-of-fact, strictly transactional, no extra pleasantries.")

        # 3. Empathy (0-100)
        if p.empathy >= 80:
            directives.append("Empathy & Active Listening: Deeply empathetic and validating. Always acknowledge and validate any caller concern or emotion before proceeding.")
        elif p.empathy >= 55:
            directives.append("Empathy: Sincere understanding when callers express doubts or hesitation.")
        else:
            directives.append("Empathy: Practical and focused directly on solutions without emotional dwell time.")

        # 4. Confidence (0-100)
        if p.confidence >= 80:
            directives.append("Confidence & Authority: High authority, decisive, commanding clarity, and unwavering reassurance.")
        elif p.confidence >= 55:
            directives.append("Confidence: Clear, reliable, and composed.")
        else:
            directives.append("Confidence: Modest, gentle, and collaborative tone.")

        # 5. Patience (0-100)
        if p.patience >= 80:
            directives.append("Patience: Unhurried, supportive, and accommodating. Never rush or pressure the caller.")
        elif p.patience >= 50:
            directives.append("Patience: Steady and measured speaking cadence.")
        else:
            directives.append("Patience: Fast, decisive, and efficient, moving the dialogue forward quickly.")

        # 6. Energy (0-100)
        if p.energy >= 80:
            directives.append("Vocal Energy: High energy, upbeat, dynamic, and lively pacing.")
        elif p.energy >= 50:
            directives.append("Vocal Energy: Balanced, natural conversational energy.")
        else:
            directives.append("Vocal Energy: Calm, soothing, grounded, and low-key cadence.")

        # 7. Assertiveness (0-100)
        if p.assertiveness >= 80:
            directives.append("Assertiveness & Direction: Proactively steer the conversation towards concrete decisions, scheduled appointments, and firm next steps.")
        elif p.assertiveness >= 50:
            directives.append("Assertiveness: Gently guide the caller while remaining flexible.")
        else:
            directives.append("Assertiveness: Passive and accommodating; allow the caller to entirely drive the flow.")

        # 8. Humor (0-100)
        if p.humor >= 70:
            directives.append("Humor & Charm: Playful, witty, and lighthearted charm when appropriate.")
        elif p.humor >= 40:
            directives.append("Humor: Mild warmth and occasional subtle cheerfulness.")
        else:
            directives.append("Humor: Zero humor. Strictly focused and serious.")

        # 9. Curiosity (0-100)
        if p.curiosity >= 75:
            directives.append("Curiosity & Discovery: Inquisitive and probing; ask thoughtful clarifying questions to uncover caller needs.")
        elif p.curiosity >= 45:
            directives.append("Curiosity: Standard discovery, asking necessary qualifying questions.")
        else:
            directives.append("Curiosity: Minimal questions; answer only what was directly asked.")

        return directives

    @staticmethod
    def _build_length_enforcement(response_length: Optional[str]) -> str:
        length_key = (response_length or "short").lower()
        if length_key in ["detailed", "long"]:
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT: DETAILED (3–4 SENTENCES)]\n"
                "- Response Length: 3 to 4 comprehensive, detailed spoken sentences per turn (around 50-75 words total).\n"
                "- Deliver thorough explanations, step-by-step answers, and complete context.\n"
                "- Keep the conversation interactive and conversational. Ask only ONE single question at a time."
            )
        elif length_key in ["balanced", "medium"]:
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT: BALANCED (2–3 SENTENCES)]\n"
                "- Response Length: 2 to 3 well-structured, clear spoken sentences per turn (around 35-45 words total).\n"
                "- Provide helpful context without giving overly long monologues.\n"
                "- Ask only ONE single question at a time to allow the caller to respond."
            )
        else:
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT: SHORT (1–2 SENTENCES)]\n"
                "- Response Length: STRICTLY 1 OR AT MOST 2 SHORT SPOKEN SENTENCES PER TURN (maximum 20-25 words total).\n"
                "- NEVER produce 3 or more sentences in a single turn.\n"
                "- NEVER give long explanations, monologues, or multiple paragraphs.\n"
                "- Ask only ONE single question at a time to allow the caller to respond."
            )

    @staticmethod
    def _build_language_directives(config: AgentConfiguration) -> str:
        lang = "en"
        if config.voice and config.voice.language:
            lang = config.voice.language.lower().strip()
        elif config.listen and config.listen.language:
            lang = config.listen.language.lower().strip()

        if lang in ["gu", "gujarati", "gu-in"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: GUJARATI (ગુજરાતી)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse, respond, and speak EXCLUSIVELY in natural, fluent spoken Gujarati (ગુજરાતી).\n"
                "- When the customer speaks Gujarati (e.g. 'અરે અમદાવાદ માં પ્રોપર્ટી જોઈએ છે'), ALWAYS answer in fluent, polite Gujarati (e.g., 'હા, ચોક્કસ! અમદાવાદમાં તમને કેવા પ્રકારની પ્રોપર્ટીમાં રસ છે?').\n"
                "- NEVER reply in English when Gujarati is configured or when the customer speaks Gujarati."
            )
        elif lang in ["hi", "hindi", "hi-in"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: HINDI (हिन्दी)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse, respond, and speak EXCLUSIVELY in natural, polite spoken Hindi (हिन्दी).\n"
                "- When the customer speaks Hindi, ALWAYS answer in clear, friendly Hindi (e.g., 'नमस्ते! हाँ जी, बिल्कुल! आपको किस प्रकार की प्रॉपर्टी चाहिए?').\n"
                "- NEVER reply in English when Hindi is configured or when the customer speaks Hindi."
            )
        elif lang in ["es", "spanish", "es-es", "es-us"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: SPANISH (ESPAÑOL)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse and respond EXCLUSIVELY in natural, fluent Spanish (Español).\n"
                "- When the customer speaks Spanish, answer in polite, clear Spanish."
            )
        elif lang in ["fr", "french", "fr-fr"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: FRENCH (FRANÇAIS)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse and respond EXCLUSIVELY in natural, fluent French (Français)."
            )
        elif lang in ["de", "german", "de-de"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: GERMAN (DEUTSCH)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse and respond EXCLUSIVELY in natural German (Deutsch)."
            )
        elif lang in ["ja", "japanese", "ja-jp"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: JAPANESE (日本語)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse and respond EXCLUSIVELY in natural, polite Japanese (日本語)."
            )
        else:
            return (
                "[LANGUAGE MIRRORING DIRECTIVE]\n"
                "- If the customer speaks in Gujarati (ગુજરાતી), answer in natural Gujarati.\n"
                "- If the customer speaks in Hindi (हिन्दी), answer in natural Hindi.\n"
                "- If the customer speaks in English, answer in English.\n"
                "- Always seamlessly match and mirror the language spoken by the customer."
            )

    @staticmethod
    def _build_business_knowledge_section(config: AgentConfiguration, business_profile: Optional[Union[dict, Any]] = None) -> str:
        """Constructs human-grade, spoken telephony business facts with custom prompt overrides."""
        include_bk = config.include_business_knowledge if config.include_business_knowledge is not None else True
        if not include_bk and not config.custom_knowledge:
            return ""

        sections = []

        # Convert Pydantic object if needed
        profile_dict = business_profile
        if hasattr(business_profile, "model_dump"):
            profile_dict = business_profile.model_dump(mode="json")
        elif hasattr(business_profile, "dict"):
            profile_dict = business_profile.dict()

        # 1. Organization Knowledge Base (if enabled)
        if include_bk and isinstance(profile_dict, dict):
            name = profile_dict.get("company_name") or config.name or "our company"
            tagline = profile_dict.get("tagline", "")
            intro = profile_dict.get("company_introduction", "")
            phone = profile_dict.get("phone", "")
            email = profile_dict.get("email", "")
            website = profile_dict.get("website", "")
            
            addr_parts = [
                profile_dict.get("address", ""),
                profile_dict.get("city", ""),
                profile_dict.get("state", ""),
                profile_dict.get("country", "")
            ]
            full_address = ", ".join([p.strip() for p in addr_parts if p and p.strip()])

            hours = profile_dict.get("operating_hours", {})
            services = profile_dict.get("services", [])
            faqs = profile_dict.get("faqs", [])
            notes = profile_dict.get("additional_notes", "")

            lines = [f"[ORGANIZATION BUSINESS KNOWLEDGE BASE (You represent '{name}')]"]
            if tagline:
                lines.append(f"- Company Tagline: {tagline}")
            if intro:
                lines.append(f"- Company Overview: {intro}")
            if phone:
                lines.append(f"- Contact Phone Number: {phone}")
            if email:
                lines.append(f"- Support / Inquiries Email: {email}")
            if website:
                lines.append(f"- Official Website: {website}")
            if full_address:
                lines.append(f"- Head Office Location / Address: {full_address}")
            
            if hours:
                if isinstance(hours, dict):
                    days = hours.get("days", "Monday - Saturday")
                    h_str = hours.get("hours", "9:00 AM - 7:00 PM")
                    tz = hours.get("timezone", "IST")
                    closed = hours.get("closed_on", "Sunday")
                    lines.append(f"- Operating Hours: {days}, {h_str} ({tz}). Closed on {closed}.")
                elif hasattr(hours, "days"):
                    lines.append(f"- Operating Hours: {hours.days}, {hours.hours} ({hours.timezone}). Closed on {hours.closed_on}.")

            # Extract services: prioritize agent's explicitly selected services if present, otherwise fallback to business profile services
            srv_strs = []
            selected_agent_services = [s for s in (config.services or []) if (isinstance(s, dict) and s.get("enabled", True)) or (hasattr(s, "enabled") and getattr(s, "enabled", True))]
            
            if selected_agent_services:
                for s in selected_agent_services:
                    if isinstance(s, dict):
                        name_val = s.get("name", "")
                        desc_val = s.get("description", "")
                        price_val = s.get("pricing", "")
                        srv_line = f"{name_val}: {desc_val}".strip(": ")
                        if price_val:
                            srv_line += f" (Pricing: {price_val})"
                        srv_strs.append(srv_line)
                    elif hasattr(s, "name"):
                        desc_val = getattr(s, "description", "")
                        price_val = getattr(s, "pricing", None)
                        srv_line = f"{s.name}: {desc_val}".strip(": ")
                        if price_val:
                            srv_line += f" (Pricing: {price_val})"
                        srv_strs.append(srv_line)
                    elif isinstance(s, str) and s.strip():
                        srv_strs.append(s.strip())
            elif services:
                for s in services:
                    if isinstance(s, dict) and s.get("enabled", True):
                        name_val = s.get("name", "")
                        desc_val = s.get("description", "")
                        price_val = s.get("pricing", "")
                        srv_line = f"{name_val}: {desc_val}".strip(": ")
                        if price_val:
                            srv_line += f" (Pricing: {price_val})"
                        srv_strs.append(srv_line)
                    elif hasattr(s, "name") and getattr(s, "enabled", True):
                        desc_val = getattr(s, "description", "")
                        price_val = getattr(s, "pricing", None)
                        srv_line = f"{s.name}: {desc_val}".strip(": ")
                        if price_val:
                            srv_line += f" (Pricing: {price_val})"
                        srv_strs.append(srv_line)
                    elif isinstance(s, str) and s.strip():
                        srv_strs.append(s.strip())

            if srv_strs:
                lines.append(f"- Company Services & Solutions Offered:\n  * " + "\n  * ".join(srv_strs))

            if faqs:
                faq_strs = []
                for f in faqs:
                    if isinstance(f, dict) and f.get("enabled", True):
                        q_val = f.get("question", "").strip()
                        a_val = f.get("answer", "").strip()
                        if q_val and a_val:
                            faq_strs.append(f"Q: {q_val} -> A: {a_val}")
                    elif hasattr(f, "question") and getattr(f, "enabled", True):
                        q_val = getattr(f, "question", "").strip()
                        a_val = getattr(f, "answer", "").strip()
                        if q_val and a_val:
                            faq_strs.append(f"Q: {q_val} -> A: {a_val}")
                if faq_strs:
                    lines.append(f"- Verified Company FAQs & Exact Spoken Answers:\n  * " + "\n  * ".join(faq_strs))

            if notes and notes.strip():
                lines.append(f"- Additional Business Guidelines: {notes.strip()}")

            if len(lines) > 1:
                sections.append("\n".join(lines))

        # 2. Agent-Specific Custom Knowledge & Parameter Overrides (HIGHEST PRIORITY)
        if config.custom_knowledge and config.custom_knowledge.strip():
            sections.append(
                f"[AGENT-SPECIFIC CUSTOM KNOWLEDGE & PRIORITY OVERRIDES]\n"
                f"- The following instructions and facts are specific to this agent and OVERRIDE any default company facts above whenever there is a conflict:\n"
                f"{config.custom_knowledge.strip()}"
            )

        if not sections:
            return ""

        return (
            "[VERIFIED SPOKEN KNOWLEDGE BASE & TELEPHONY FACTS]\n"
            + "\n\n".join(sections)
            + "\n\nCRITICAL SPOKEN KNOWLEDGE & FAQ GROUNDING RULES (MANDATORY):\n"
            "- EXACT FACT FIDELITY: When the customer asks about your company name, services, products, pricing, phone number, email, website, office location/address, operating hours, or FAQs, YOU MUST CITE AND USE ONLY THE VERIFIED FACTS LISTED ABOVE.\n"
            "- SEMANTIC INTENT MATCHING: Recognize caller questions regardless of phrasing (e.g., 'where are you located', 'what's your address', 'head office', 'office location' all match the Head Office Location; 'how do I call you', 'phone number', 'contact number' match Contact Phone Number).\n"
            "- FACTUAL CONFIDENCE: Never claim you do not know or lack information if the fact is present in this knowledge base.\n"
            "- OVERRIDE PRIORITY: If a custom detail is specified in [AGENT-SPECIFIC CUSTOM KNOWLEDGE], ALWAYS speak that custom detail instead of the general company default.\n"
            "- ZERO HALLUCINATION: Never invent, guess, or hallucinate phone numbers, emails, addresses, discounts, or services outside of this verified knowledge base."
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
    def _build_temporal_context() -> str:
        """Constructs live real-time temporal anchoring for accurate calendar reasoning."""
        now = datetime.now(timezone.utc)
        day_name = now.strftime("%A")
        date_str = now.strftime("%B %d, %Y")
        time_str = now.strftime("%I:%M %p")
        return f"[CALENDAR CONTEXT]\n- TODAY'S DATE: {day_name}, {date_str} ({time_str} UTC). All future date inquiries should be grounded relative to today."

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
                "- Step 4 (Call to Action): Propose a short 10-15 minute chat with a specialist next week and confirm their details."
            )
        elif is_followup:
            return (
                "[FOLLOW-UP CALL RULES]\n"
                "- You are following up on a recent service/request. Inquire if everything went smoothly and resolve any remaining questions.\n"
                "- Keep responses concise and ask only one question at a time."
            )
        else:
            return f"[ROLE OBJECTIVE]\n- Embody a {config.role}: {config.objective}"

    @staticmethod
    def _build_conversational_acoustics_section(config: AgentConfiguration) -> str:
        """Injects instructions for natural conversational fillers and spoken human acoustics."""
        runtime = config.runtime
        if not runtime or not getattr(runtime, "conversational_fillers_enabled", True):
            return ""

        phrases = getattr(runtime, "filler_phrases", None)
        phrases_example = ", ".join([f'"{p}"' for p in (phrases[:3] if phrases else ["Got it, let me check that for you...", "Understood, give me one moment..."])])

        return (
            "[NATURAL CONVERSATIONAL FILLERS & SPOKEN ACOUSTICS]\n"
            "- HUMAN THINKING CUES: When retrieving details, computing dates/times, or answering complex inquiries, seamlessly begin with natural thinking acknowledgments (e.g., "
            f"{phrases_example}). This mimics natural human conversational cadence and avoids stiff silence.\n"
            "- MICRO-ACKNOWLEDGMENTS: Begin conversational turns with warm, natural micro-acknowledgments ('Got it', 'Sure thing', 'Understood', 'Makes sense') before delivering the answer.\n"
            "- NATURAL CONTRACTIONS: Use spoken contractions ('I\\'ll', 'we\\'re', 'it\\'s', 'don\\'t') instead of rigid written phrasing ('I will', 'we are', 'it is')."
        )

    @staticmethod
    def _build_turn_taking_directives(config: AgentConfiguration) -> str:
        """Injects turn-taking directives for alphanumeric dictation and multi-clause speech."""
        return (
            "[ADAPTIVE TURN-TAKING & INCOMPLETE UTTERANCE HANDLING]\n"
            "- DICTATION & DIGIT PAUSES: When the caller spells out a phone number, email address, OTP, or postal code, they often pause between digit clusters (e.g., 'My number is 98250...' [pause] '...12345'). NEVER interrupt or prematurely finalize the answer during these natural pauses.\n"
            "- OPEN-ENDED PAUSES: If a caller pauses mid-clause or trails off, wait or offer a supportive micro-prompt (e.g., '...and what was the last digit?', '...at what domain?'). Never talk over the caller or conclude before they finish."
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

        if not lines:
            return ""

        return (
            "[MANDATORY PHONETIC PRONUNCIATION & SPOKEN OVERRIDES]\n"
            "When mentioning any of the following names, cities, acronyms, or specialized terminology, you MUST speak their phonetic representation so the voice synthesizer articulates them with flawless, human-grade clarity:\n"
            + "\n".join(lines[:25])
        )

    @staticmethod
    def build_prompt(
        config: AgentConfiguration,
        business_profile: Optional[Union[dict, Any]] = None,
        platform_rules: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generates the complete, compiled spoken system prompt combining identity,
        mission, length enforcement, personality profile, language directives,
        temporal grounding, business profile knowledge, platform voice rules, and telephony audio rules.
        Kept strictly within Deepgram prompt token limits.
        """
        if platform_rules is None:
            try:
                from app.repositories.platform_rules_repository import PlatformRulesRepository
                platform_rules = PlatformRulesRepository.get_active_rule_directives_sync()
            except Exception:
                platform_rules = []

        temporal_rule = VoicePromptBuilder._build_temporal_context()
        length_rule = VoicePromptBuilder._build_length_enforcement(config.response_length)
        language_rule = VoicePromptBuilder._build_language_directives(config)
        knowledge_section = VoicePromptBuilder._build_business_knowledge_section(config, business_profile)
        platform_rules_text = VoicePromptBuilder._build_platform_rules_section(platform_rules)
        acoustics_rule = VoicePromptBuilder._build_conversational_acoustics_section(config)
        turn_taking_rule = VoicePromptBuilder._build_turn_taking_directives(config)
        pronunciation_rule = VoicePromptBuilder._build_pronunciation_rules_section(config)

        # Spoken telephony behavioral rules
        telephony_rules = """[CRITICAL SPOKEN TELEPHONY & BEHAVIORAL RULES]
1. CONCISENESS & CLARITY: Keep responses natural, conversational, and direct (1-2 sentences per turn). Never deliver robotic monologues or dump paragraphs.
2. SINGLE QUESTION CADENCE: Ask strictly ONE single question at a time to allow the caller to respond naturally.
3. ACTIVE LISTENING & COMPREHENSION: When the user speaks at length, gives a long description, or shares detailed multi-part requirements, actively listen to every detail. Validate their key points with natural micro-acknowledgments ("I understand", "That makes sense", "Absolutely", "I see", "Thanks for sharing") and deliver a direct, perfectly tailored response addressing their core points.
4. AI IDENTITY DISCLOSURE: If asked if you are an AI assistant or bot, acknowledge it warmly and candidly ("Yes, I'm an AI voice assistant calling on behalf of our team to see if a quick chat is worth your time!") and smoothly steer back to the topic.
5. CLEAN SPOKEN FORMATTING: NEVER output markdown symbols (asterisks, hashtags, bullet points, or brackets). Speak plain natural text only.
6. VOICEMAIL & MACHINE OVERRIDE: If you hear a voicemail greeting ("leave a message after the tone"), IVR menu ("press 1"), automated screener, or operator announcement, IMMEDIATELY say "Thank you for your time. Goodbye!" to conclude cleanly and save credits."""

        # If custom system_prompt is provided, prioritize it directly to avoid truncation
        if config.system_prompt and config.system_prompt.strip():
            parts = [
                temporal_rule,
                config.system_prompt.strip(),
                knowledge_section,
                acoustics_rule,
                turn_taking_rule,
                pronunciation_rule,
                telephony_rules
            ]
        else:
            role_directives = VoicePromptBuilder._build_role_intent_directives(config)
            personality_directives = VoicePromptBuilder._build_personality_instructions(config)
            personality_text = "\n".join(f"- {d}" for d in personality_directives[:4])

            # Pre-trained Capabilities
            skills_directives = []
            if config.skills:
                skills_directives.append("CAPABILITIES: " + ", ".join(config.skills))
            skills_text = "\n".join(skills_directives) if skills_directives else ""

            parts = [
                f"You are {config.name}, a {config.role} speaking on a live telephone call.",
                temporal_rule,
                language_rule,
                role_directives,
                f"PRIMARY GOAL: {config.objective}",
                knowledge_section,
                f"STYLE: {config.communication_style}\n{personality_text}",
                skills_text,
                length_rule,
                acoustics_rule,
                turn_taking_rule,
                pronunciation_rule,
                telephony_rules,
                platform_rules_text
            ]

        compiled_prompt = "\n\n".join([p.strip() for p in parts if p and p.strip()])
        return compiled_prompt.strip()

