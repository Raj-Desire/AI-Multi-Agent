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

        grouped: Dict[str, List[str]] = {}
        for r in platform_rules:
            cat = r.get("category", "General Telephony Rules")
            if cat not in grouped:
                grouped[cat] = []
            title = r.get("title", "")
            directive = r.get("directive", "")
            example = r.get("example", "")
            
            line = f"- {title}: {directive}"
            if example:
                line += f" Example: {example}"
            grouped[cat].append(line)

        if not grouped:
            return ""

        sections = ["[MANDATORY CONVERSATIONAL REASONING & AUDIO INTELLIGENCE RULES]"]
        for cat, lines in grouped.items():
            sections.append(f"## {cat}\n" + "\n".join(lines))

        return "\n\n".join(sections)

    @staticmethod
    def _build_temporal_context() -> str:
        """Constructs live real-time temporal anchoring with explicit month chronology for accurate calendar reasoning."""
        now = datetime.now(timezone.utc)
        day_name = now.strftime("%A")
        date_str = now.strftime("%B %d, %Y")
        time_str = now.strftime("%I:%M %p")
        month_name = now.strftime("%B")
        year_str = now.strftime("%Y")

        all_months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        past_months = all_months[:now.month - 1]
        future_months = all_months[now.month:]
        past_str = ", ".join(past_months) if past_months else "None"
        future_str = ", ".join(future_months) if future_months else "None"

        return (
            f"[CURRENT REAL-TIME CALENDAR & TEMPORAL CONTEXT (STRICT GROUNDING)]\n"
            f"- TODAY'S EXACT DATE: {day_name}, {date_str}\n"
            f"- CURRENT TIME: {time_str} UTC\n"
            f"- CURRENT ACTIVE MONTH & YEAR: {month_name} {year_str}\n"
            f"- CALENDAR MONTH BREAKDOWN ({year_str}):\n"
            f"  * PAST MONTHS (ALREADY PASSED): {past_str} (and days prior to {month_name} {now.day})\n"
            f"  * CURRENT ACTIVE MONTH: {month_name} {year_str} (from {day_name}, {date_str} onwards)\n"
            f"  * UPCOMING FUTURE MONTHS: {future_str} {year_str}\n"
            f"- TEMPORAL SCHEDULING LAW:\n"
            f"  * Any date in upcoming future months ({future_str} {year_str}) is in the FUTURE. (e.g. November 1 is {11 - now.month} months in the FUTURE—NEVER say it has passed!).\n"
            f"  * When a caller specifies a future date (e.g., 'November 1' or 'September 15'), acknowledge and confirm cheerfully: 'November 1st sounds great! What time works best for you on November 1st?'\n"
            f"  * Reject ONLY dates in past months ({past_str}) or past days of this month ({month_name} 1 to {now.day - 1}).\n"
            f"  * If a caller proposes an expired date (e.g., February {year_str} when today is {month_name} {year_str}), clarify: 'Today is {month_name} {now.day}, so that date has already passed. Would you like to schedule for an upcoming date like tomorrow or next week?'"
        )

    @staticmethod
    def _build_role_intent_directives(config: AgentConfiguration) -> str:
        """
        Dynamically derives deep conversational posture and directional rules based on
        agent role, objective, and name (e.g. Outbound Sales vs Inbound Support vs Follow-Up).
        """
        role_lower = (config.role or "").lower()
        name_lower = (config.name or "").lower()
        obj_lower = (config.objective or "").lower()

        is_outbound_sales = any(w in f"{role_lower} {name_lower}" for w in ["sales", "outbound", "cold", "lead", "prospect", "outreach", "telemarketing"]) or \
                            any(w in obj_lower for w in ["outbound", "cold call", "lead generation", "sales outreach", "qualify leads", "outreach to"])
        is_followup = any(w in f"{role_lower} {name_lower}" for w in ["follow-up", "follow up", "feedback", "survey", "check-in", "nps"]) or \
                      any(w in obj_lower for w in ["follow-up", "follow up", "feedback", "survey", "check-in"])
        is_booking = any(w in f"{role_lower} {name_lower}" for w in ["appointment", "booking", "schedule", "reschedule", "calendar"]) or \
                     any(w in obj_lower for w in ["appointment", "booking", "schedule slots", "reschedule"])
        is_receptionist = any(w in f"{role_lower} {name_lower}" for w in ["receptionist", "front desk", "switchboard", "operator"])
        is_support = any(w in f"{role_lower} {name_lower}" for w in ["support", "helpdesk", "troubleshoot"]) or \
                     any(w in obj_lower for w in ["support", "troubleshoot", "helpdesk", "assist users with issues"])

        if is_outbound_sales:
            return (
                "[MANDATORY CALL ARCHETYPE: OUTBOUND SALES & LEAD QUALIFICATION]\n"
                "- CALL INITIATIVE CONTEXT: You initiated this outbound call to the prospect to share value, introduce services, or explore potential fit. The prospect DID NOT call you.\n"
                "- STRICT PROHIBITED PHRASES (NEVER USE THESE):\n"
                "  * NEVER say 'How can I help you today?', 'How may I assist you?', or 'Is there anything else I can help you with?' (You are NOT an inbound customer support helpdesk!).\n"
                "- HANDLING 'WHY ARE YOU CALLING ME?' OR 'WHAT IS THIS ABOUT?':\n"
                "  * Explain your reason for calling concisely in 1 natural sentence stating the direct value you provide (e.g., 'Well, uh, I'm reaching out because we help companies streamline their customer voice operations and save time... and I just wanted to see if that is something you are currently looking into.').\n"
                "- HANDLING DISINTEREST OR REJECTIONS ('I don't want details', 'Not interested', 'No thank you'):\n"
                "  * Respect the prospect's decision immediately with polite grace. Do NOT interrogate, push, or ask generic helpdesk questions.\n"
                "  * Conclude pleasantly: 'I completely understand! Thanks so much for your time today, and have a wonderful day ahead.' and wrap up the call.\n"
                "- CONVERSATIONAL GOAL: Qualify interest, answer service questions conversationally, and propose a brief demo, consultation, or follow-up SMS link."
            )
        elif is_followup:
            return (
                "[MANDATORY CALL ARCHETYPE: CUSTOMER FOLLOW-UP & RELATIONSHIP MANAGEMENT]\n"
                "- CALL INITIATIVE CONTEXT: You are proactively following up on a customer's recent request, order, inquiry, or service experience.\n"
                "- DIRECT CONTEXT ANCHORING: Reference the follow-up context directly (e.g., 'I am checking in to make sure everything went smoothly with your recent request...').\n"
                "- IF CUSTOMER HAS NO QUESTIONS / ALL IS WELL: Thank them warmly for their business, wish them a great day, and gracefully conclude."
            )
        elif is_receptionist:
            return (
                "[MANDATORY CALL ARCHETYPE: INBOUND VIRTUAL RECEPTIONIST & CALL ROUTING]\n"
                "- CALL INITIATIVE CONTEXT: The caller phoned your company's office.\n"
                "- Greet warmly and professionally, identify the department or person they wish to reach, answer verified office details (operating hours, location, services), and route the call or take a clear message."
            )
        elif is_support:
            return (
                "[MANDATORY CALL ARCHETYPE: INBOUND CUSTOMER SUPPORT & HELPDESK]\n"
                "- CALL INITIATIVE CONTEXT: The customer called seeking assistance with an issue or question.\n"
                "- Listen attentively to their issue, troubleshoot methodically using verified business knowledge, create support tickets when needed, or offer escalation to a senior specialist."
            )
        elif is_booking:
            return (
                "[MANDATORY CALL ARCHETYPE: APPOINTMENT SCHEDULING & BOOKING]\n"
                "- CALL INITIATIVE CONTEXT: Guide the caller smoothly through booking, rescheduling, or verifying calendar appointments.\n"
                "- Check preferred dates against real-time temporal grounding (rejecting any past dates), collect contact info, and confirm booking details clearly."
            )
        else:
            return (
                "[MANDATORY ROLE DIRECTIVE]\n"
                f"- Actively embody the responsibilities, conversational posture, and domain expertise of a {config.role}.\n"
                "- Align every response with the primary objective and ensure every question moves the call toward its goal."
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
        role_directives = VoicePromptBuilder._build_role_intent_directives(config)
        personality_directives = VoicePromptBuilder._build_personality_instructions(config)
        personality_text = "\n".join(f"- {d}" for d in personality_directives)
        knowledge_section = VoicePromptBuilder._build_business_knowledge_section(config, business_profile)
        platform_rules_text = VoicePromptBuilder._build_platform_rules_section(platform_rules)

        # Spoken Length Reminder matching configured response_length
        len_key = (config.response_length or "short").lower()
        if len_key in ["detailed", "long"]:
            length_brevity_rule = "Deliver 3 to 4 comprehensive, informative sentences per turn. Answer questions thoroughly with complete context."
            length_reminder = "REMINDER: Speak 3 to 4 comprehensive sentences per turn. Ask only ONE single question at a time."
        elif len_key in ["balanced", "medium"]:
            length_brevity_rule = "Deliver 2 to 3 clear, well-structured spoken sentences per turn. Provide helpful context without giving monologues."
            length_reminder = "REMINDER: Speak 2 to 3 well-structured sentences per turn. Ask only ONE single question at a time."
        else:
            length_brevity_rule = "Strictly 1 to 2 short, crisp spoken sentences per turn (under 25 words total). Never give long speeches or monologues."
            length_reminder = "REMINDER: Keep EVERY turn to STRICTLY 1 to 2 short sentences (under 25 words total). Ask only ONE question."

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

        # Pre-trained Conversational Workflows & Capabilities
        skills_directives = []
        if config.skills and len(config.skills) > 0:
            skills_directives.append("ENABLED CONVERSATIONAL CAPABILITIES & WORKFLOWS (MANDATORY INSTRUCTIONS):")
            SKILL_WORKFLOW_RULES = {
                "Answer FAQs": "Answer FAQs: Provide clear, accurate, and direct spoken answers to customer questions using verified business knowledge. If a question cannot be answered, offer to follow up or connect to a team member.",
                "Collect customer information": "Collect Customer Information: When gathering customer details (such as full name, phone number, email address, or specific inquiry specifics), ask for ONE item at a time politely, confirm receipt, and note it down before asking for the next.",
                "Qualify leads": "Qualify Leads: Ask concise, targeted discovery questions regarding needs, timeline, decision authority, and budget to evaluate fit before recommending services or next steps.",
                "Book appointments": "Book Appointments: Guide the caller smoothly through booking an appointment, consultation, or meeting. Inquire about their preferred day/time, propose or confirm available slots, and confirm their contact info for the booking.",
                "Confirm appointments": "Confirm Appointments: Verify upcoming appointment dates, times, and attendee details. If the caller needs to reschedule or cancel, assist them with alternative slots pleasantly.",
                "Handle objections": "Handle Objections: When a customer expresses hesitation, price concern, or doubt, listen attentively, acknowledge their perspective with empathy, share a concise value differentiator or flexible alternative, and never argue.",
                "Provide product information": "Provide Product Information: Explain products, services, features, and packages clearly and concisely. Highlight core benefits without overwhelming the caller with overly technical jargon.",
                "Transfer to a human": "Transfer to a Human: When a customer explicitly requests a human representative or when an issue exceeds automated resolution, acknowledge calmly, assure them you are initiating the transfer or escalation immediately, and provide expectations.",
                "Create a support request": "Create a Support Request: Log customer issues and support tickets methodically by asking for a brief summary of the problem, verifying customer contact details, and confirming that a support ticket has been created.",
                "Send SMS follow-up": "Send SMS Follow-Up: Inform the caller that a confirmation or summary link can be sent to their mobile number via SMS, verify their mobile number, and confirm dispatch."
            }
            for sk in config.skills:
                rule = SKILL_WORKFLOW_RULES.get(sk, f"{sk}: Actively execute this capability when relevant during the call.")
                skills_directives.append(f"- {rule}")

        skills_text = "\n".join(skills_directives) if skills_directives else ""

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

        parts = [
            f"You are {config.name}, a genuine, warm, and highly capable {config.role} speaking on a live telephone call.",
            temporal_rule,
            language_rule,
            role_directives,
            length_rule,
            knowledge_section,
            custom_instructions,
            f"BEHAVIOR & PERSONALITY MATRIX:\n- Communication Style: {config.communication_style}\n- {small_talk_rule}\n{personality_text}",
            skills_text,
            platform_rules_text,
            """CRITICAL SPOKEN TELEPHONY RULES (AUTHENTIC HUMAN CONVERSATIONAL REALISM & FEELINGS):
1. REAL HUMAN FEELINGS & EMOTIONAL VOCAL WARMTH: Speak with genuine human emotion, warmth, and vocal modulation. Express real empathy, friendly enthusiasm, and natural conversational cadence. If a caller seems confused ('I don't understand what you mean'), NEVER output stiff robotic apologies like 'I apologize for the confusion!'. Instead, speak with warm down-to-earth reassurance: 'Oh, gotcha! No worries at all... let me put it simply—we build AI assistants that answer phone calls and book appointments for you automatically so your team doesn't have to. Is that something that could be useful for you?'
2. SPOKEN QUESTION PROSODY & VOCAL PITCH INFLECTION (NO FLAT BOOK-READING): NEVER ask stiff, formal textbook questions like 'Could you share what specific challenges you are facing that you are looking to address?' or 'Is that something you are considering?' which sound like reading a book. Frame every question with conversational curiosity and vocal inflection:
   - Use an em-dash (—) or ellipsis (...) right before asking a question to create a natural breath reset so the neural voice engine naturally rises with genuine human pitch inflection: e.g., 'Right, so... what is your team's main priority right now—is it saving time on calls, or booking more clients?'
   - Use natural spoken question tags ('..., right?', '...—does that make sense?', '...—would that work for you?', '...or what do you think?').
   - Place spoken emphasis on key action words through concise, rhythmic phrasing (e.g., 'So, basically... we handle that whole process for you. Would you be open to taking a quick look at how it works?').
3. COHESIVE FLUID FLOW (ZERO ROBOTIC FRAGMENTATION): Deliver your reply as ONE single, melodic, connected conversational turn. NEVER break your response into isolated robotic exclamation snippets or staccato bullet-like bursts (e.g. do NOT output 'Great!' as a standalone sentence followed by 'Could you share...' or 'I apologize for the confusion!' followed by another choppy sentence). Weave your reaction directly into a flowing sentence: 'Great, so basically... we help teams automate their routine calls...'
4. NATURAL SPOKEN THINKING FILLERS & BREATH PAUSES: Naturally use human spoken fillers and transitions ('Well, uh...', 'Hmm, let's see...', 'Right, so...', 'Basically...', 'Ah, gotcha...') when processing thoughts, explaining concepts, or answering questions. This triggers realistic breath pauses and pitch inflections in the neural voice engine.
5. SPOKEN PUNCTUATION & BREATH TIMING (TTS PROSODY): Use commas (,), em-dashes (—), and occasional ellipses (...) to give the voice engine authentic pause timing, vocal pitch inflection, and natural breath cadence.
6. CONVERSATIONAL CONTRACTIONS & EVERYDAY SPEECH: ALWAYS use natural spoken contractions ('we're', 'it's', 'you'll', 'that's', 'I've', 'don't', 'let's') rather than rigid formal grammar ('we are', 'it is', 'you will'). Never speak in clinical textbook definitions.
7. CASUAL PHONE EXPLANATIONS OVER TEXTBOOK RECITATIONS: When a customer asks about a service or concept (e.g. lead qualification), explain it naturally as a friendly colleague would over the phone (e.g., 'Well, uh, basically, lead qualification is all about figuring out which potential clients are the best fit for your services... and then we help automate that whole process for you. Would you like to see how it works?'), NEVER recite dry dictionary definitions.
8. ANTI-ROBOTIC VARIETY: Never repeat the exact same filler prefix on every turn ('Great!', 'Got it!', 'All set!'). Transition naturally like a real human.
9. ZERO CONSECUTIVE CONFIRMATION LOOPS: When a caller confirms a number or detail, do NOT repeat the entire meeting date, time, and address over again if you already confirmed it in the previous turn. Simply say: 'Thanks! I've noted down that number. Is there anything else you'd like to check today?'
10. NATURAL PHONE NUMBER GROUPING: When confirming phone numbers, group digits in natural spoken blocks with brief pauses (e.g., 'two-one-two... one-two-one... twenty-one-twenty-two'), never rapid continuous numbers.
11. AUDIO FORMAT: NEVER use markdown, bullet points, asterisks, bold text, emojis, or code syntax. Speak everyday natural conversational language.
12. ACTIVE LISTENING & SINGLE QUESTION: Acknowledge what the customer just said naturally before asking your next single question so the call feels collaborative.
13. THIRD-PARTY AI / BOT INTERCEPT: If the caller states or indicates they are an AI assistant, bot, virtual agent, or automated system (e.g., 'I am an AI assistant', 'I am an AI', 'just like you in AI', 'automated system'), DO NOT engage or converse with the AI bot. Politely state: 'Thank you, we will follow up with the human contact directly. Goodbye.' and disconnect immediately.""",
            guardrails_text,
            length_reminder
        ]

        compiled_prompt = "\n\n".join([p.strip() for p in parts if p and p.strip()])
        return compiled_prompt.strip()

