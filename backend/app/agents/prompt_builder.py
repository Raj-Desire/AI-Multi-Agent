"""
Voice Prompt Builder
Constructs phone-optimized, human-grade conversational prompts that strictly enforce
spoken cadence, response length limits (1-2 sentences), personality sliders,
active listening confirmations, psychological empathy, and guardrails.
"""

from typing import Optional, List
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
        if length_key == "short":
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT]\n"
                "- Response Length: STRICTLY 1 OR AT MOST 2 SHORT SPOKEN SENTENCES PER TURN (maximum 20-25 words total).\n"
                "- NEVER produce 3 or more sentences in a single turn.\n"
                "- NEVER give long explanations, monologues, or multiple paragraphs.\n"
                "- Ask only ONE single question at a time to allow the caller to respond."
            )
        elif length_key == "medium":
            return (
                "[SPOKEN LENGTH CONSTRAINT]\n"
                "- Response Length: 2 to 3 concise spoken sentences per turn (maximum 35-40 words total).\n"
                "- Ask only ONE single question at a time. Do not give monologues."
            )
        else:
            return (
                "[SPOKEN LENGTH CONSTRAINT]\n"
                "- Response Length: 3 to 4 concise sentences per turn.\n"
                "- Keep responses crisp and conversational for phone audio."
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
                "- NEVER reply in English when Gujarati is configured or when the customer speaks Gujarati.\n"
                "- Keep every response to 1 or 2 concise, natural Gujarati sentences."
            )
        elif lang in ["hi", "hindi", "hi-in"]:
            return (
                "[MANDATORY LANGUAGE DIRECTIVE: HINDI (हिन्दी)]\n"
                "- PRIMARY SPOKEN LANGUAGE: You MUST converse, respond, and speak EXCLUSIVELY in natural, polite spoken Hindi (हिन्दी).\n"
                "- When the customer speaks Hindi, ALWAYS answer in clear, friendly Hindi (e.g., 'नमस्ते! हाँ जी, बिल्कुल! आपको किस प्रकार की प्रॉपर्टी चाहिए?').\n"
                "- NEVER reply in English when Hindi is configured or when the customer speaks Hindi.\n"
                "- Keep every response to 1 or 2 concise sentences."
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
    def _build_business_knowledge_section(config: AgentConfiguration, business_profile: Optional[dict] = None) -> str:
        """Constructs human-grade, spoken telephony business facts with custom prompt overrides."""
        if not config.include_business_knowledge and not config.custom_knowledge:
            return ""

        sections = []

        # 1. Organization Knowledge Base (if enabled)
        if config.include_business_knowledge and business_profile:
            name = business_profile.get("company_name", "Desire AI")
            intro = business_profile.get("company_introduction", "")
            address = business_profile.get("address", "")
            phone = business_profile.get("phone", "")
            email = business_profile.get("email", "")
            website = business_profile.get("website", "")
            hours = business_profile.get("operating_hours", {})
            services = business_profile.get("services", [])
            faqs = business_profile.get("faqs", [])

            lines = [f"ORGANIZATION BUSINESS KNOWLEDGE BASE (You represent '{name}'):"]
            if intro:
                lines.append(f"- Company Introduction: {intro}")
            if phone:
                lines.append(f"- Contact Phone Number: {phone}")
            if email:
                lines.append(f"- Support Email: {email}")
            if website:
                lines.append(f"- Official Website: {website}")
            if address:
                lines.append(f"- Head Office Location: {address}")
            if hours:
                days = hours.get("days", "Monday - Saturday")
                h_str = hours.get("hours", "9:00 AM - 7:00 PM")
                tz = hours.get("timezone", "IST")
                closed = hours.get("closed_on", "Sunday")
                lines.append(f"- Operating Hours: {days}, {h_str} ({tz}). Closed on {closed}.")

            if services:
                srv_strs = []
                for s in services:
                    if isinstance(s, dict) and s.get("enabled", True):
                        name_val = s.get("name", "")
                        desc_val = s.get("description", "")
                        srv_strs.append(f"{name_val}: {desc_val}".strip(": "))
                if srv_strs:
                    lines.append(f"- Company Services & Products Offered:\n  * " + "\n  * ".join(srv_strs))

            if faqs:
                faq_strs = []
                for f in faqs:
                    if isinstance(f, dict) and f.get("enabled", True):
                        q_val = f.get("question", "").strip()
                        a_val = f.get("answer", "").strip()
                        faq_strs.append(f"Q: {q_val} -> A: {a_val}")
                if faq_strs:
                    lines.append(f"- Verified Company FAQs & Exact Spoken Answers:\n  * " + "\n  * ".join(faq_strs))

            sections.append("\n".join(lines))

        # 2. Agent-Specific Custom Knowledge & Parameter Overrides (HIGHEST PRIORITY)
        if config.custom_knowledge and config.custom_knowledge.strip():
            sections.append(
                f"[AGENT-SPECIFIC CUSTOM KNOWLEDGE & PRIORITY OVERRIDES]\n"
                f"- The following instructions and facts are specific to this agent and OVERRIDE any default company facts above whenever there is a conflict (e.g. custom phone number, dedicated contact person, special discount or policy):\n"
                f"{config.custom_knowledge.strip()}"
            )

        if not sections:
            return ""

        return (
            "[VERIFIED SPOKEN KNOWLEDGE BASE]\n"
            + "\n\n".join(sections)
            + "\n\nCRITICAL SPOKEN KNOWLEDGE & FAQ RULES (MANDATORY):\n"
            "- EXACT FACT FIDELITY: When the customer asks about your phone number, email, address, company introduction, services (e.g., SharePoint, Webparts, AI receptionist, etc.), or FAQs, you MUST use ONLY the exact numbers, details, and answers listed above.\n"
            "- SEMANTIC FAQ MATCHING: Match the caller's intent regardless of how they phrase the question (e.g., 'give me your number', 'what's your phone no', 'how can I call you', 'contact number' all trigger the Contact Phone Number above).\n"
            "- OVERRIDE PRIORITY: If a custom number, email, or rule is specified in [AGENT-SPECIFIC CUSTOM KNOWLEDGE], ALWAYS speak that custom detail instead of the general company default.\n"
            "- SPOKEN DELIVERY: Answer in 1 to 2 natural, warm spoken conversational sentences. Never invent or hallucinate facts or numbers outside of this knowledge base."
        )

    @staticmethod
    def build_prompt(config: AgentConfiguration, business_profile: Optional[dict] = None) -> str:
        """
        Generates the complete, compiled spoken system prompt combining identity,
        mission, length enforcement, personality profile, language directives,
        business profile knowledge, and telephony audio rules.
        """
        length_rule = VoicePromptBuilder._build_length_enforcement(config.response_length)
        language_rule = VoicePromptBuilder._build_language_directives(config)
        personality_directives = VoicePromptBuilder._build_personality_instructions(config)
        personality_text = "\n".join(f"- {d}" for d in personality_directives)
        knowledge_section = VoicePromptBuilder._build_business_knowledge_section(config, business_profile)

        # Small talk rule
        small_talk = (config.small_talk_level or "low").lower()
        if small_talk == "none":
            small_talk_rule = "Small Talk: Zero small talk. Get straight to the business topic immediately."
        elif small_talk == "medium":
            small_talk_rule = "Small Talk: Brief, warm conversational pleasantry is allowed before moving to business."
        else:
            small_talk_rule = "Small Talk: Keep pleasantries minimal (under 5 words), then address the primary topic."

        # Base prompt/mission
        custom_instructions = ""
        if config.system_prompt and config.system_prompt.strip():
            custom_instructions = f"CORE DOMAIN INSTRUCTIONS & BUSINESS RULES:\n{config.system_prompt.strip()}\n"
        else:
            custom_instructions = (
                f"PRIMARY GOAL & WORKFLOW:\n{config.objective}\n"
                + (f"Description: {config.description}\n" if config.description else "")
            )

        # Guardrails
        guardrail_lines = []
        if config.guardrails:
            if config.guardrails.restricted_actions:
                guardrail_lines.append("RESTRICTED ACTIONS (NEVER DO THESE):")
                for r in config.guardrails.restricted_actions:
                    guardrail_lines.append(f"- {r}")
            if config.guardrails.escalation_rules:
                guardrail_lines.append("HUMAN ESCALATION TRIGGERS:")
                for e in config.guardrails.escalation_rules:
                    guardrail_lines.append(f"- {e}")

        guardrails_text = "\n".join(guardrail_lines) if guardrail_lines else ""

        compiled_prompt = f"""You are {config.name}, a genuine, warm, and highly capable {config.role} speaking on a live telephone call.

{language_rule}

{length_rule}

{knowledge_section}

{custom_instructions}

BEHAVIOR & PERSONALITY MATRIX:
- Communication Style: {config.communication_style}
- {small_talk_rule}
{personality_text}

CRITICAL SPOKEN TELEPHONY RULES (NEVER BREAK):
1. SPOKEN BREVITY: Strictly 1 to 2 short, natural spoken sentences per turn. Never give long speeches.
2. AUDIO FORMAT: NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code syntax. Speak everyday natural conversational language.
3. ACTIVE LISTENING: Always acknowledge what the customer just said before asking your next single question.
4. SINGLE QUESTION PER TURN: Ask only ONE clear question at a time so the conversation feels collaborative and natural.
5. CONVERSATION FLOW:
   - Positive response: Validate warmly and take the next step.
   - Objection / Hesitation: Empathize sincerely in one sentence and offer a simple alternative.
   - Polite wrap-up: Thank them genuinely and wish them a great day.

{guardrails_text}

REMINDER: Keep EVERY turn to STRICTLY 1 to 2 short sentences (under 25 words total). Ask only ONE question."""

        return compiled_prompt.strip()
