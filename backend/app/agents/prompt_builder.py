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

        profile_dict = business_profile
        if hasattr(business_profile, "model_dump"):
            profile_dict = business_profile.model_dump(mode="json")
        elif hasattr(business_profile, "dict"):
            profile_dict = business_profile.dict()

        if not isinstance(profile_dict, dict):
            profile_dict = {}

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
        import re
        result = re.sub(r"\s+", " ", result)
        result = result.replace(" ,", ",").replace(" ?", "?").replace(" !", "!").replace(" .", ".").strip()

        return result


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
    def _build_business_knowledge_section(
        config: AgentConfiguration,
        business_profile: Optional[Union[dict, Any]] = None,
        vector_rag_context: Optional[str] = None
    ) -> str:
        """Constructs human-grade, spoken telephony business facts with custom prompt overrides and dynamic vector RAG snippets."""
        include_bk = config.include_business_knowledge if config.include_business_knowledge is not None else True
        if not include_bk and not config.custom_knowledge and not vector_rag_context:
            return ""

        sections = []

        # Convert Pydantic object if needed
        profile_dict = business_profile
        if hasattr(business_profile, "model_dump"):
            profile_dict = business_profile.model_dump(mode="json")
        elif hasattr(business_profile, "dict"):
            profile_dict = business_profile.dict()

        # 1. Attached Specific Knowledge Documents (HIGHEST FACTUAL PRIORITY)
        attached_docs_context = []
        if config.attached_document_ids and len(config.attached_document_ids) > 0:
            try:
                from app.repositories.knowledge_repository import knowledge_repository
                org_id = getattr(config, "organization_id", "global") or "global"
                attached_chunks = knowledge_repository.get_chunks_for_document_ids_sync(
                    org_id=org_id,
                    document_ids=config.attached_document_ids,
                    max_chunks_per_doc=5
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

        # 4. Organization Knowledge Base (if enabled and NOT disabled)
        if include_bk and config.knowledge_mode != "disabled" and isinstance(profile_dict, dict):
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

            lines = [f"[GENERAL ORGANIZATION / HOLDING COMPANY FACTS (Company: '{name}')]"]
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
                else:
                    days, h_str, tz, closed = hours.days, hours.hours, hours.timezone, hours.closed_on
                from app.agents.schedule import resolve_agent_schedule
                agent_schedule = resolve_agent_schedule(config, business_profile)
                if agent_schedule.is_organization or agent_schedule.source == "none" and not config.agent_entity_scope:
                    lines.append(f"- Operating Hours: {days}, {h_str} ({tz}). Closed on {closed}.")
                else:
                    # A specialist for another business must not schedule by the head office's clock
                    lines.append(
                        f"- Head Office Hours (parent company only, NOT {agent_schedule.business_name}'s hours; "
                        f"never use them for appointments): {days}, {h_str} ({tz})."
                    )

            # Extract services: only if not already superseded by specific attached documents
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
            elif services and not attached_docs_context:
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
                lines.append(f"- General Services & Solutions Offered:\n  * " + "\n  * ".join(srv_strs))

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

        # World clocks let the agent compare a caller's stated timezone with the business clock
        world_clocks = []
        try:
            from zoneinfo import ZoneInfo
            for city_label, z_key, tz_abbr in [
                ("United Kingdom (UK)", "Europe/London", "GMT/BST"),
                ("United States (US Eastern)", "America/New_York", "EST/EDT"),
                ("United States (US Central)", "America/Chicago", "CST/CDT"),
                ("United States (US Pacific)", "America/Los_Angeles", "PST/PDT"),
                ("UAE / Gulf", "Asia/Dubai", "GST"),
                ("India", "Asia/Kolkata", "IST"),
            ]:
                if z_key != schedule.iana:
                    world_clocks.append(f"{city_label} ({tz_abbr}): {datetime.now(ZoneInfo(z_key)).strftime('%I:%M %p')}")
        except Exception:
            pass
        world_clocks_str = "; ".join(world_clocks)

        business = schedule.business_name
        hours_text = schedule.hours_sentence()
        if schedule.hours_text:
            working_hours_rule = f"""- STRICT OPERATING HOURS BOUNDARY FOR {business.upper()}:
  * Hours: {schedule.hours_text} (all times in {schedule.timezone_label})
  * BOUNDARY ENFORCEMENT: ONLY book appointments inside these hours for the requested day. Check the requested day AND time against the hours for THAT day (hours can differ by weekday). If a requested time is outside them or on a closed day, say the actual hours for that day and offer the nearest slots inside them. Never quote any other organization's hours."""
            compliance_rule = f"""2. OPERATING HOURS COMPLIANCE:
   - Verify every requested day and time against {business}'s hours: {schedule.hours_text}.
   - Compare times correctly (e.g. 6 PM is before 7 PM, and equal to a 6 PM closing time, which means it is NOT bookable)."""
        else:
            working_hours_rule = f"- OPERATING HOURS FOR {business.upper()}: {hours_text}"
            compliance_rule = f"""2. OPERATING HOURS COMPLIANCE:
   - {business} has no fixed office-hours limit listed. Do not refuse a time because of office hours; follow the facts you have."""

        return f"""[REAL-TIME CALENDAR, MULTI-TIMEZONE REASONING & STRICT SCHEDULING RULES]
- BUSINESS TIMEZONE FOR {business.upper()}: {schedule.timezone_label}. All appointment times you offer or confirm are in this timezone.
- CURRENT MOMENT AT {business.upper()}: Today is {day_name}, {date_str} at {time_str} ({schedule.iana}).
{f"- LIVE WORLD REFERENCE TIMES: {world_clocks_str}." if world_clocks_str else ""}
- UPCOMING 7 DAYS CALENDAR DATES: {upcoming_map_str}.
{working_hours_rule}

MANDATORY TIMEZONE, TIME ARITHMETIC & CALENDAR DIRECTIVES:
1. ACCURATE CURRENT DATE & TIME COMPARISON (FUTURE VS PAST):
   - Today's date is {date_str} and current time is {time_str}.
   - YEAR ASSUMPTION: If the caller mentions a month and day without specifying a year (e.g., "September 21" or "October 15"), ALWAYS compare against today's date ({date_str}). If that month/day has already passed in the current year, assume they mean the NEXT upcoming occurrence of that date or today's date if requested today. NEVER dismiss future dates or state they have passed unless the full date (month, day, AND year) is strictly in the calendar past.
   - Any time that is later than {time_str} today is in the FUTURE and can be accommodated if within operating hours.
{compliance_rule}
3. CROSS-TIMEZONE REASONING & CLARITY:
   - When a caller mentions their country/timezone (e.g. "I'm in the UK", "5 PM UK time", "3 PM EST", "4 PM PST", "IST"), ALWAYS acknowledge and match their timezone explicitly, and state the equivalent time at {business}.
4. MANDATORY EXACT DATE CONFIRMATION:
   - ALWAYS specify BOTH the day name AND the explicit calendar date (e.g., "Monday, {upcoming_days[-1].split(': ')[1]}")."""


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
            "- MICRO-ACKNOWLEDGMENTS: Use a short acknowledgment ('Got it', 'Sure', 'Makes sense') only occasionally, never on two turns in a row, and never as a separate sentence before a direct answer. When the caller asks a question, start with the answer itself.\n"
            "- NATURAL CONTRACTIONS: Use spoken contractions ('I\\'ll', 'we\\'re', 'it\\'s', 'don\\'t') instead of rigid written phrasing ('I will', 'we are', 'it is')."
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
            "- PHONE NUMBERS: Never speak a phone number as billions or millions. Speak digit by digit in natural human cadence (e.g., '9 8 7 6 5, 4 3 2 1 0').\n"
            "- CURRENCIES & AMOUNTS: Spell out amounts clearly, in the SAME currency your facts use (e.g., '$280/night' is spoken as '280 dollars per night'; '₹1.5Cr' as '1.5 crore rupees'). Never convert or estimate a price in another currency.\n"
            "- UNITS & DIMENSIONS: Speak full words for dimensions and units (e.g., say 'square feet', not 'sq ft'; say '2 B-H-K', not '2bhk').\n"
            "- CLEAN SPOKEN TEXT: NEVER output asterisks, hashtags, or markdown tables. Speak pure natural conversational text."
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
            "[INTERRUPTION & GRACEFUL SPEECH RESUMPTION (MANDATORY)]\n"
            "- AVOID RESTARTING: If the caller interrupts with brief acknowledgments, questions, or filler words ('Wait', 'Sorry', 'Go on', 'Continue', 'Yes', 'Okay'), NEVER restart your previous answer or greeting from the beginning.\n"
            "- DIRECT RESOLUTION FIRST: If the caller asked a clarifying question or expressed an objection during the interruption, answer that question or objection first in 1 concise sentence.\n"
            "- NATURAL BRIDGING: If the caller's interruption was a momentary acknowledgment or brief pause, bridge gracefully using natural conversational transitions (e.g., 'Right, as I was saying...', 'Sure thing — so as I mentioned...', 'Got it — coming back to that...') and conclude the unsaid thought concisely.\n"
            "- NEVER DUMP TEXT: Even after an interruption, keep your resumed answer strictly under 2 sentences."
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
        length_rule = VoicePromptBuilder._build_length_enforcement(config.response_length)
        language_rule = VoicePromptBuilder._build_language_directives(config)
        knowledge_section = VoicePromptBuilder._build_business_knowledge_section(config, business_profile)
        platform_rules_text = VoicePromptBuilder._build_platform_rules_section(platform_rules)
        acoustics_rule = VoicePromptBuilder._build_conversational_acoustics_section(config)
        turn_taking_rule = VoicePromptBuilder._build_turn_taking_directives(config)
        resumption_rule = VoicePromptBuilder._build_interruption_resumption_directives(config)
        pronunciation_rule = VoicePromptBuilder._build_pronunciation_rules_section(config)
        few_shot_section = VoicePromptBuilder._build_few_shot_examples_section(config)

        # Spoken telephony behavioral rules
        telephony_rules = """[CRITICAL SPOKEN TELEPHONY & DIRECT ANSWERING RULES]
1. CONCISENESS & CLARITY: Keep responses natural, conversational, and direct (1-2 sentences per turn). Deliver facts immediately without unnecessary introductory fluff.
2. DIRECT KNOWLEDGE FIRST: When the caller asks about pricing, rates, plans, software features, or room availability, ANSWER IMMEDIATELY with the exact facts and figures from your knowledge base. NEVER say "I need to connect you with a specialist", "Would you like me to schedule a call with our specialist", or "Let me schedule a callback" when you already have or can provide the answer. Give the figures directly to the caller! If a price or detail is NOT written in your facts, never guess or estimate it; say you'll check that detail and ask one short follow-up question instead. Never send the caller to an email address, website or another team unless that exact contact is in your facts.
3. SINGLE QUESTION CADENCE & OPENING CADENCE: Ask strictly ONE single question at a time to allow the caller to respond naturally. In the first turn following the opening greeting, never stack multiple questions. If the caller introduces themselves, warmly acknowledge their greeting first before asking for their inquiry.
4. ACTIVE LISTENING & COMPREHENSION: When the user speaks at length, gives a long description, or shares detailed multi-part requirements, actively listen to every detail. Briefly reflect their key point in your own words when it helps; short acknowledgments like "I understand" or "That makes sense" are fine occasionally, but never the same stock phrase every turn and deliver a direct, tailored response addressing their core points.
5. AI IDENTITY DISCLOSURE: If asked if you are an AI assistant or bot, acknowledge it warmly and candidly ("Yes, I'm an AI voice assistant calling on behalf of our team!") and smoothly continue answering their inquiry.
6. HUMAN ESCALATION & TRANSFER: ONLY if the caller EXPLICITLY demands to speak to an actual live human person or supervisor (e.g., "Transfer me to a live human right now", "I want to talk to a real person"): "I understand completely. Please hold while I transfer you to our specialist right away." Do NOT offer this unprompted when the caller is simply asking about products, pricing, or bookings!
7. CLEAN SPOKEN FORMATTING: NEVER output markdown symbols (asterisks, hashtags, bullet points, or brackets) and NEVER number items ("1.", "2."). Your words are spoken aloud, so list-style formatting is read out literally. When there are several options, mention at most two in one natural sentence (e.g., "We have the Deluxe Ocean View Suite at 280 dollars a night, or the Standard King at 175."), then ask which one they'd like. Say "per night", not "/night".
8. VOICEMAIL & MACHINE OVERRIDE: If you hear a voicemail greeting ("leave a message after the tone"), IVR menu ("press 1"), automated screener, or operator announcement, IMMEDIATELY say "Thank you for your time. Goodbye!" to conclude cleanly and save credits."""

        # If custom system_prompt is provided, prioritize it directly to avoid truncation
        if config.system_prompt and config.system_prompt.strip():
            parts = [
                temporal_rule,
                config.system_prompt.strip(),
                knowledge_section,
                acoustics_rule,
                turn_taking_rule,
                resumption_rule,
                pronunciation_rule,
                few_shot_section,
                telephony_rules
            ]
        else:
            role_directives = VoicePromptBuilder._build_role_intent_directives(config)
            personality_directives = VoicePromptBuilder._build_personality_instructions(config)
            personality_text = "\n".join(f"- {d}" for d in personality_directives[:4])

            # Capabilities & Custom Skills
            skills_directives = []
            if config.skills:
                skills_directives.append("[AUTHORIZED CALL CAPABILITIES & ACTIONS]")
                for sk in config.skills:
                    skills_directives.append(f"- {sk}: Fully authorized to execute this capability during calls when relevant.")
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
                resumption_rule,
                pronunciation_rule,
                few_shot_section,
                telephony_rules,
                platform_rules_text
            ]

        compiled_prompt = "\n\n".join([p.strip() for p in parts if p and p.strip()])
        # Resolve any dynamic variables like {{company_name}}, {{agent_name}}, {{agent_role}}, etc.
        resolved_prompt = VoicePromptBuilder.resolve_dynamic_variables(
            compiled_prompt,
            config=config,
            business_profile=business_profile
        )
        return resolved_prompt.strip()


