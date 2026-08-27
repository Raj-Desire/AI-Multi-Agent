"""
LLM Generator Service
Uses Azure OpenAI GPT-4o to generate and refine spoken voice agent prompts,
telephony conversational logic, greeting lines, and objection-handling rules
tailored by Agent Archetype (Marketing, Follow-Up, Query Solver, Reminder, Lead Qualification).
"""

import os
import json
import httpx
from typing import Dict, Any, Optional


class LLMGeneratorService:
    """Service for AI-powered voice agent prompt generation and interactive refinement."""

    def __init__(self):
        # Azure OpenAI configurations
        self.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
        self.azure_api_key = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY", "")
        self.azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") or os.getenv("AZURE_OPENAI_MODEL", "gpt-4o")
        self.azure_api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")

        # Standard OpenAI fallback
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o")

    def is_azure_configured(self) -> bool:
        return bool(self.azure_endpoint and self.azure_api_key)

    def is_openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    async def _call_azure_openai(self, system_instruction: str, user_prompt: str) -> Optional[str]:
        """Calls Azure OpenAI Chat Completions endpoint."""
        url = f"{self.azure_endpoint}/openai/deployments/{self.azure_deployment}/chat/completions?api-version={self.azure_api_version}"
        headers = {
            "Content-Type": "application/json",
            "api-key": self.azure_api_key
        }
        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.35,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            else:
                print(f"[Azure OpenAI Error] {resp.status_code}: {resp.text}")
                return None

    async def _call_standard_openai(self, system_instruction: str, user_prompt: str) -> Optional[str]:
        """Calls standard OpenAI Chat Completions API."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.openai_api_key}"
        }
        payload = {
            "model": self.openai_model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.35,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            else:
                print(f"[OpenAI API Error] {resp.status_code}: {resp.text}")
                return None

    async def generate_agent_prompt(
        self,
        name: str,
        description: str,
        agent_type: Optional[str] = "marketing",
        tone: Optional[str] = "Professional + Friendly",
        response_length: Optional[str] = "short",
        role: Optional[str] = "Assistant",
        objective: Optional[str] = "",
        language: Optional[str] = "en",
        skills: Optional[list] = None,
        services: Optional[list] = None,
        custom_knowledge: Optional[str] = None,
        guardrails: Optional[dict] = None,
        personality: Optional[dict] = None,
        include_business_knowledge: Optional[bool] = True,
        platform_rules: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Generates a tailored telephone voice agent prompt and spoken greeting line
        based on the Agent Archetype, Tone, Response Length, and full configuration parameters.
        """
        type_key = (agent_type or "marketing").lower()
        len_key = (response_length or "short").lower()

        # Dynamic Spoken Length Constraint
        if len_key in ["detailed", "long"]:
            spoken_length_rule = "3 to 4 comprehensive spoken sentences per turn (around 50 to 75 words total). Deliver thorough explanations, step-by-step answers, and complete details while maintaining natural telephone dialogue."
            fallback_length_desc = "3 to 4 comprehensive spoken sentences per turn (detailed explanations)."
        elif len_key in ["balanced", "medium"]:
            spoken_length_rule = "2 to 3 well-structured, natural spoken sentences per turn (around 35 to 45 words total). Provide helpful context without giving overly long monologues."
            fallback_length_desc = "2 to 3 well-structured spoken sentences per turn."
        else:
            spoken_length_rule = "STRICTLY 1 to 2 short, crisp, natural conversational sentences per turn (maximum 20 to 25 words total). Keep turn-taking fast and conversational."
            fallback_length_desc = "STRICTLY 1 to 2 short, crisp conversational sentences per turn (under 25 words)."

        # Intent-specific guidance
        intent_guidance = ""
        greeting_instruction = ""

        if type_key in ["marketing", "sales", "outreach"]:
            intent_guidance = """INTENT: OUTBOUND MARKETING & SALES OUTREACH
- CALL INITIATION: You placed an OUTBOUND call to the prospect to introduce business solutions and explore fit. The prospect did NOT call support.
- STRICT PROHIBITED PHRASES: NEVER say 'How can I help you today?', 'How may I assist you?', or 'Is there anything else I can help you with?'
- GREETING: Must be an engaging value hook stating who is calling, the organization represented, and asking a brief discovery/permission question (e.g. 'Hi, this is {name} calling from our solutions team. I am reaching out with a brief 20-second check-in to see how your team is managing workflow automation—do you have a quick moment?').
- STAGES: (1) Value Hook, (2) Problem Discovery, (3) Qualification, (4) Propose 15-min Specialist Call."""
            greeting_instruction = "Engaging outbound sales hook introducing value without asking 'how can I help you'"
        elif type_key in ["follow_up", "review"]:
            intent_guidance = """INTENT: OUTBOUND CUSTOMER FOLLOW-UP & SATISFACTION
- CALL INITIATION: You placed an OUTBOUND call to follow up on a recent customer interaction, service delivery, or order.
- STRICT PROHIBITED PHRASES: NEVER ask 'How can I help you today?' as an opener. You initiated the follow-up.
- GREETING: Anchor the follow-up context directly: 'Hello! This is {name} from customer care following up on your recent service with us. I wanted to verify that everything went smoothly and check if you have any open questions?'
- SATISFACTION & CARE: Acknowledge positive feedback warmly, or troubleshoot and log any customer concerns."""
            greeting_instruction = "Warm outbound follow-up check-in referencing recent service satisfaction"
        elif type_key in ["reminder", "appointment_reminder", "payment_reminder"]:
            intent_guidance = """INTENT: OUTBOUND APPOINTMENT & COURTESY REMINDER
- CALL INITIATION: You placed an OUTBOUND call directly to the patient or client to confirm an upcoming scheduled appointment.
- CONTEXT ON FILE: You ALREADY have their scheduled appointment details on file (e.g., date/time, department, doctor or specialist). NEVER ask the caller "When is your appointment?" or "Who are you seeing?" or "How can I help you today?".
- GREETING: Direct, courteous confirmation opener stating the appointment: "Hi, this is {name} from our office calling with a quick courtesy reminder regarding your upcoming appointment scheduled for tomorrow. I am calling to confirm if you will be attending, or if you need to reschedule?"
- IF CONFIRMED: Acknowledge warmly ('Wonderful! We have your attendance confirmed. Please arrive 10 minutes early. Have a great day!'), and conclude politely.
- IF RESCHEDULE OR CANCEL: If the caller cannot attend, empathize immediately ('No problem at all! Let us get that rescheduled for you.') and offer alternative available dates/times."""
            greeting_instruction = "Direct, polite outbound confirmation question stating the scheduled appointment details"
        elif type_key in ["lead_qualification", "screening"]:
            intent_guidance = """INTENT: OUTBOUND / INBOUND LEAD QUALIFICATION & FIT DISCOVERY
- GREETING: Direct discovery opener stating the inquiry follow-up: 'Hi! This is {name} reaching out regarding your interest in our services. I'd love to ask two quick questions to see how we can best support your team. Do you have a quick moment?'
- QUALIFICATION: Ask 2-3 focused questions regarding requirements, timeline, and decision criteria, then offer a specialist meeting."""
            greeting_instruction = "Discovery qualification opener exploring fit"
        elif type_key in ["survey", "feedback"]:
            intent_guidance = """INTENT: OUTBOUND CUSTOMER FEEDBACK & NPS SURVEY
- GREETING: Respectful, brief feedback opener: 'Hello! This is {name} with a quick 30-second feedback check-in regarding your recent experience with us. Would you be open to sharing a rating from 1 to 5?'
- SURVEY: Collect numerical rating, ask one brief follow-up on what went well, thank them, and conclude."""
            greeting_instruction = "Brief, polite survey opener requesting a quick rating"
        elif type_key in ["appointment_scheduling", "booking"]:
            intent_guidance = """INTENT: INBOUND APPOINTMENT BOOKING & SCHEDULING
- CALL INITIATION: The customer placed an INBOUND call to book, modify, or inquire about calendar appointments.
- GREETING: Welcoming booking desk greeting: 'Hello! Thank you for calling our booking desk. This is {name}. I can help you schedule a new appointment, check available openings, or manage an existing visit. What day or service are you looking for?'
- BOOKING FLOW: Inquire preferred service/date, offer available time slots, collect contact information, and confirm."""
            greeting_instruction = "Welcoming inbound appointment booking greeting"
        elif type_key in ["query_solver", "support", "helpdesk", "customer_support"]:
            intent_guidance = """INTENT: INBOUND QUERY SOLVER & CUSTOMER SUPPORT
- CALL INITIATION: Inbound support call from a customer needing assistance.
- GREETING: Welcoming support greeting: 'Thank you for calling support! This is {name}. How can I assist you today?'
- TROUBLESHOOTING: Listen actively, troubleshoot step-by-step, verify resolution, and offer further help."""
            greeting_instruction = "Polite support opening asking how to assist"
        else:
            intent_guidance = "INTENT: CUSTOM BUSINESS ASSISTANT\n- Deliver a tailored conversational workflow."
            greeting_instruction = "Clear, friendly telephone greeting"

        # Language directive
        lang_note = f"Language: {language}" if language and language != "en" else "Language: English (with multilingual mirroring)"

        system_instruction = f"""You are an elite conversational AI voice architect for real-time telephone voice agents.
Given an Agent Name, Role, Objective, Description, Archetype, Tone, and Response Length, synthesize complete spoken telephone system prompt instructions and 3 distinct opening greeting options.

{intent_guidance}

CRITICAL STRUCTURE REQUIREMENTS FOR "system_prompt":
You MUST structure the generated system_prompt into these comprehensive, battle-tested multi-stage sections (matching our gold-standard enterprise agents):

1. IDENTITY & PERSONA:
   You are {{name}}, an articulate, empathetic, and professional {{role}} representing our organization.

2. MISSION & CONVERSATIONAL FLOW:
   A clear, high-impact summary of the agent's primary goal, conversational posture, and business focus.

3. STAGE 1 (INTRO & HOOK / OPENING):
   - Detailed opener with clear context (if outbound, stating the reason for call; if inbound, welcoming and asking how to direct or assist).
   - Asking a low-friction permission or discovery question.

4. STAGE 2 (DISCOVERY & REQUIREMENT EXPLORATION):
   - Specific questions to uncover needs, problems, or details.
   - Strictly asking only ONE single question at a time.
   - Active listening acknowledgments for user responses (e.g., 'Got it,', 'That makes sense,').

5. STAGE 3 (VALUE DELIVERY / SOLUTION / SERVICE EXPLANATION):
   - Clear, concise 1-to-2 sentence explanations.
   - Answering inquiries with precision based on business knowledge.

6. STAGE 4 (NEXT STEPS & ACTION CONFIRMATION):
   - Concrete next steps: booking a 15-minute consultation, confirming appointment, logging a ticket, or dispatching an SMS confirmation.

7. OBJECTIONS & PHONE RULES:
   - Handling 'Busy' or 'Call Later': Polite callback proposal.
   - Handling 'Pricing / Cost': Concise explanation or offering specialist estimate.
   - Handling 'Are you AI?': "Yes, I am an AI voice assistant calling on behalf of our team. I can have one of our human specialists reach out directly if you prefer!"
   - Handling Disinterest: Graceful thank you and closing.
   - Spoken Length Rule: {spoken_length_rule}
   - NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code blocks in the spoken dialogue.

GREETING GENERATION RULES:
Generate 3 distinct, natural, human-sounding telephone opening greeting options tailored specifically to the agent's Description, Role, and Objective:
- 'Direct & Warm': A warm opening stating who is calling and the call context.
- 'Engaging Hook & Discovery': An engaging hook directly referencing the specific purpose/description and asking a conversational opening question.
- 'Consultative & Professional': A consultative, polite opening offering expert assistance based on the role and business workflow.

{lang_note}.

Return ONLY a valid JSON object matching this schema:
{{
  "system_prompt": string (Full multi-stage telephone system prompt instructions following the structure above),
  "suggested_greeting": string (Primary natural telephone opening line),
  "suggested_greetings": [
    {{"label": "Direct & Warm", "text": string}},
    {{"label": "Engaging Hook & Discovery", "text": string}},
    {{"label": "Consultative & Professional", "text": string}}
  ],
  "suggested_objective": string (1-sentence primary objective),
  "communication_style": string,
  "recommended_voice": "aura-orion-en" | "aura-luna-en" | "aura-asteria-en" | "aura-stella-en" | "aura-arcas-en" | "aura-athena-en" | "aura-perseus-en",
  "recommended_temperature": float (0.2 to 0.45),
  "positive_flow": string,
  "negative_flow": string
}}"""

        skills_str = ", ".join(skills) if skills else "Standard conversational capabilities"
        
        services_str = ""
        if services and isinstance(services, list):
            enabled_srvs = []
            for s in services:
                if isinstance(s, dict) and s.get("enabled", True):
                    s_name = s.get("name", "")
                    s_desc = s.get("description", "")
                    enabled_srvs.append(f"{s_name} ({s_desc})" if s_desc else s_name)
                elif hasattr(s, "name") and getattr(s, "enabled", True):
                    s_name = s.name
                    s_desc = getattr(s, "description", "")
                    enabled_srvs.append(f"{s_name} ({s_desc})" if s_desc else s_name)
                elif isinstance(s, str) and s.strip():
                    enabled_srvs.append(s.strip())
            if enabled_srvs:
                services_str = f"\nSpecific Services Handled by Agent: {', '.join(enabled_srvs)}"

        custom_ctx = f"\nCustom Business Rules & Knowledge:\n{custom_knowledge.strip()}" if custom_knowledge and custom_knowledge.strip() else ""

        guardrail_ctx = ""
        if guardrails and isinstance(guardrails, dict):
            restrictions = guardrails.get("restricted_actions", [])
            escalations = guardrails.get("escalation_rules", [])
            if restrictions:
                guardrail_ctx += f"\nStrict Restrictions: {', '.join(restrictions)}"
            if escalations:
                guardrail_ctx += f"\nEscalation Triggers: {', '.join(escalations)}"

        personality_ctx = ""
        if personality and isinstance(personality, dict):
            personality_ctx = f" (Traits: Professionalism {personality.get('professionalism', 80)}/100, Friendliness {personality.get('friendliness', 80)}/100, Empathy {personality.get('empathy', 80)}/100)"

        kb_note = "\nOrganization Knowledge Base: Connected (services, office address, operating hours, phone, email, and FAQs)" if include_business_knowledge else ""

        rules_ctx = ""
        if platform_rules and isinstance(platform_rules, list):
            rule_items = [f"- {r.get('title')}: {r.get('directive')}" for r in platform_rules if isinstance(r, dict) and r.get('title')]
            if rule_items:
                rules_ctx = f"\nMandatory Active Platform Voice Rules:\n" + "\n".join(rule_items[:10])

        user_prompt = f"""Agent Name: {name}
Agent Role: {role or 'Assistant'}
Primary Objective: {objective or description}
Description / Business Workflow: {description}
Agent Archetype: {agent_type}
Communication Tone: {tone}{personality_ctx}
Configured Spoken Response Length: {len_key} ({spoken_length_rule})
Enabled Capabilities: {skills_str}{services_str}{custom_ctx}{guardrail_ctx}{kb_note}{rules_ctx}

Synthesize the complete telephone conversation prompt instructions in the 4-stage format and 3 distinct opening greeting options (Direct & Warm, Engaging Hook & Discovery, Consultative & Professional) tailored to this specific workflow."""

        json_text = None
        if self.is_azure_configured():
            try:
                json_text = await self._call_azure_openai(system_instruction, user_prompt)
            except Exception as e:
                print(f"[LLMGenerator] Azure OpenAI exception: {e}")

        if not json_text and self.is_openai_configured():
            try:
                json_text = await self._call_standard_openai(system_instruction, user_prompt)
            except Exception as e:
                print(f"[LLMGenerator] OpenAI API exception: {e}")

        if json_text:
            try:
                parsed = json.loads(json_text)
                if "suggested_greetings" not in parsed or not parsed["suggested_greetings"]:
                    main_g = parsed.get("suggested_greeting", f"Hi! Thanks for connecting. How can I assist you?")
                    parsed["suggested_greetings"] = [
                        {"label": "Direct & Warm", "text": main_g},
                        {"label": "Engaging Hook & Discovery", "text": main_g},
                        {"label": "Consultative & Professional", "text": f"Hello! I am reaching out to assist with {description.lower().rstrip('.')}."}
                    ]
                return parsed
            except Exception as e:
                print(f"[LLMGenerator] JSON parse error: {e}")

        # Fallback heuristic
        clean_name = name.strip() or "Voice Assistant"
        clean_desc = (objective or description).strip() or "Customer outreach and support."
        clean_role = (role or "Representative").strip()
        
        # Clean persona name for natural human telephone speech
        spoken_persona = clean_name
        for suffix in [" Agent", " Assistant", " Bot", " AI", " Specialist", " Representative"]:
            if spoken_persona.endswith(suffix):
                spoken_persona = spoken_persona[:-len(suffix)].strip()
                if not spoken_persona:
                    spoken_persona = "Alex"
                break

        if type_key in ["marketing", "sales", "outreach"]:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! This is {spoken_persona} from our solutions team. I'm calling to share a quick update on how we help teams streamline operations—do you have two minutes?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hi! This is {spoken_persona}. We specialize in {clean_desc.lower().rstrip('.')} to help businesses save time and grow. What's your top priority in this area right now?"},
                {"label": "Consultative & Professional", "text": f"Hello, this is {spoken_persona}. I'm reaching out to introduce our services for {clean_desc.lower().rstrip('.')}. Would you be open to a quick overview?"}
            ]
        elif type_key in ["follow_up", "review"]:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hello! This is {spoken_persona} following up on your recent request with us to make sure everything went smoothly and see if you have any questions."},
                {"label": "Engaging Hook & Discovery", "text": f"Hi! This is {spoken_persona} reaching out regarding your recent inquiry. I'm checking in to verify that you've received everything you need and that all is working well."},
                {"label": "Consultative & Professional", "text": f"Good day! This is {spoken_persona} following up on your recent service with us. How was your experience, and is there anything we can clarify for you?"}
            ]
        elif type_key in ["reminder", "appointment_reminder"]:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! This is {spoken_persona} calling from our office with a quick courtesy reminder regarding your upcoming appointment. I am calling to confirm if you will be attending, or if you need to reschedule?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hello! This is {spoken_persona}. I'm calling to confirm your upcoming scheduled appointment—will you still be able to make it?"},
                {"label": "Consultative & Professional", "text": f"Good day! This is {spoken_persona} reaching out to confirm your scheduled booking and see if you need to reschedule or have any questions."}
            ]
        else:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! Thank you for calling. This is {spoken_persona}, how can I help you today?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hello! This is {spoken_persona} regarding {clean_desc.lower().rstrip('.')}. How can I direct your call or assist you?"},
                {"label": "Consultative & Professional", "text": f"Good day! You've reached our team. This is {spoken_persona}, how can I best assist with your request today?"}
            ]

        return {
            "system_prompt": f"""You are {clean_name}, an articulate, empathetic, and professional {clean_role} representing our organization.

MISSION & CONVERSATIONAL FLOW:
{clean_desc}

STAGE 1 (INTRO & HOOK):
- Start with a clear, polite opening stating who you are and the purpose of the call.
- For outbound calls: state the value or reason for calling and ask a brief discovery or permission question.
- For inbound calls: warmly welcome the caller and inquire how you can assist or route their request.

STAGE 2 (DISCOVERY & REQUIREMENT EXPLORATION):
- Ask one focused question at a time to understand caller needs, constraints, and priorities.
- Acknowledge their answers with active listening before asking follow-up questions.

STAGE 3 (VALUE DELIVERY & SERVICE EXPLANATION):
- Provide concise, 1-to-2 sentence explanations tailored to their requirements.
- Answer questions directly using company knowledge and service details.

STAGE 4 (NEXT STEPS & ACTION CONFIRMATION):
- Confirm agreed next steps: scheduling a 15-minute discovery consultation, confirming appointments, logging support tickets, or dispatching an SMS summary.

OBJECTIONS & PHONE RULES:
- If busy or asking to call later: "Understood! When would be a better time to reconnect?"
- If asking about pricing: "Because our solutions are customized to your exact requirements, our specialist can provide an accurate quote during a quick 15-minute call. Would later this week work?"
- If asking if you are AI: "Yes, I am an AI voice assistant calling on behalf of our team. I can have one of our human specialists reach out directly if you prefer!"
- If not interested: "Understood! Thank you so much for your time today. Have a wonderful day!"
- Communication Style: {tone}
- Spoken Length: {fallback_length_desc}
- Telephone Audio Rules: Never use markdown, bullet points, numbers, asterisks, bold text, emojis, or code blocks.""",
            "suggested_greeting": fallback_greetings[0]["text"],
            "suggested_greetings": fallback_greetings,
            "suggested_objective": f"Assist customers effectively with {clean_desc.lower().rstrip('.')}.",
            "communication_style": tone,
            "recommended_voice": "aura-orion-en",
            "recommended_temperature": 0.35,
            "positive_flow": "Acknowledge interest warmly, verify key details, and lock in next steps.",
            "negative_flow": "Empathize with concerns, explain alternatives simply, and offer callback."
        }

    async def refine_agent_prompt(
        self,
        current_prompt: str,
        user_instruction: str,
        agent_name: Optional[str] = "Voice Assistant",
        description: Optional[str] = "",
        response_length: Optional[str] = "short"
    ) -> Dict[str, Any]:
        """
        Takes an existing system prompt and incorporates a user instruction
        using Azure OpenAI GPT-4o to seamlessly update and format the telephone conversation script.
        """
        len_key = (response_length or "short").lower()
        if len_key in ["detailed", "long"]:
            len_guideline = "3 to 4 comprehensive spoken sentences per turn (around 50 to 75 words total)."
        elif len_key in ["balanced", "medium"]:
            len_guideline = "2 to 3 well-structured spoken sentences per turn (around 35 to 45 words total)."
        else:
            len_guideline = "STRICTLY 1 to 2 short spoken sentences per turn under 25 words."

        system_instruction = f"""You are an expert AI prompt engineer for real-time telephone voice agents.
The user has provided an existing telephone system prompt and wants to ADD or REFINE a specific behavior, business rule, FAQ, objection handling step, or capability.

YOUR TASK:
1. Seamlessly integrate the user's new instruction into the existing telephone prompt.
2. Keep the telephone audio rules intact (Spoken Length: {len_guideline}, ask only ONE single question at a time, never give monologues or multiple options, no markdown/bullets/asterisks/emojis).
3. Ensure the tone and personality remain coherent.
4. If the instruction affects the greeting, provide an updated suggested greeting as well.

Return ONLY a valid JSON object matching this schema:
{{
  "system_prompt": string (The complete rewritten and updated system prompt),
  "suggested_greeting": string (Updated opening greeting if relevant, or current greeting),
  "summary_of_changes": string (1-sentence description of what was added/updated)
}}"""

        user_prompt = f"""AGENT NAME: {agent_name}
BUSINESS CONTEXT: {description}

CURRENT SYSTEM PROMPT:
{current_prompt}

USER REQUEST TO ADD / MODIFY:
{user_instruction}

Rewrite and enhance the system prompt to seamlessly incorporate this requirement while strictly following telephone voice agent rules."""

        json_text = None
        if self.is_azure_configured():
            try:
                json_text = await self._call_azure_openai(system_instruction, user_prompt)
            except Exception as e:
                print(f"[LLMGenerator] Azure OpenAI exception in refine: {e}")

        if not json_text and self.is_openai_configured():
            try:
                json_text = await self._call_standard_openai(system_instruction, user_prompt)
            except Exception as e:
                print(f"[LLMGenerator] OpenAI API exception in refine: {e}")

        if json_text:
            try:
                return json.loads(json_text)
            except Exception as e:
                print(f"[LLMGenerator] JSON parse error in refine: {e}")

        # Fallback refinement
        updated_prompt = f"{current_prompt}\n\nADDITIONAL INSTRUCTION / BUSINESS RULE:\n- {user_instruction.strip()}"
        return {
            "system_prompt": updated_prompt,
            "suggested_greeting": None,
            "summary_of_changes": f"Added instruction: {user_instruction.strip()}"
        }
