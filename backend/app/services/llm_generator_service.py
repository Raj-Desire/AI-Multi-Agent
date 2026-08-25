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
            intent_guidance = """INTENT: MARKETING & SALES OUTREACH
- The primary goal is to hook interest, pitch value concisely, handle objections, and secure a demo or appointment.
- GREETING: Must be an engaging hook with a direct qualification question (e.g. 'Hi! This is {name}. I'm calling to see if you are currently looking to [key benefit]—do you have a quick 30 seconds?').
- OBJECTION HANDLING: When caller says 'Not interested' or doubts price, validate warmly, state one strong unique differentiator, and ask if they'd prefer a brief email or follow-up."""
            greeting_instruction = "Engaging sales hook asking a direct qualifying question like 'Are you currently looking to...?'"
        elif type_key in ["follow_up", "review"]:
            intent_guidance = """INTENT: CUSTOMER FOLLOW-UP & SATISFACTION REVIEW
- The primary goal is to check on an existing customer, verify if they received their product/service/documents, check satisfaction, and offer assistance.
- GREETING: Warm check-in (e.g. 'Hi! This is {name} following up on your recent inquiry to see how everything went and if you have any questions?').
- OBJECTION/ISSUE HANDLING: Express sincere empathy if items are missing or if caller is unhappy, log details, and offer immediate resolution."""
            greeting_instruction = "Warm follow-up check-in verifying satisfaction or receipt of services"
        elif type_key in ["query_solver", "support", "helpdesk", "customer_support"]:
            intent_guidance = """INTENT: INBOUND QUERY SOLVER & CUSTOMER SUPPORT
- The primary goal is to listen to caller questions, troubleshoot systematically, and provide clear, helpful answers.
- GREETING: Welcoming support greeting (e.g. 'Thank you for calling! This is {name}. How can I help you today?').
- TROUBLESHOOTING: Provide clear steps, check if that resolved it, and offer further help."""
            greeting_instruction = "Polite support opening asking how to assist"
        elif type_key in ["reminder", "appointment_reminder", "payment_reminder"]:
            intent_guidance = """INTENT: APPOINTMENT & PAYMENT REMINDER
- The primary goal is to politely remind the customer of an upcoming date/time or payment due date, confirm attendance, and offer rescheduling.
- GREETING: Direct and respectful reminder (e.g. 'Hi! This is {name} with a quick reminder regarding your upcoming appointment scheduled for [Time]. Will you still be able to make it?').
- RESCHEDULING: If caller is busy or cannot make it, offer 2 alternative slots immediately."""
            greeting_instruction = "Direct, polite reminder with confirmation question"
        elif type_key in ["lead_qualification", "screening"]:
            intent_guidance = """INTENT: LEAD QUALIFICATION & SCREENING
- The primary goal is to qualify inbound/outbound leads using budget, timeline, and decision-maker criteria.
- GREETING: Direct qualification opener (e.g. 'Hi! This is {name} following up on your inquiry. Do you have 2 quick minutes to see if this is the right fit for your team?')."""
            greeting_instruction = "Fit discovery opener"
        else:
            intent_guidance = "INTENT: CUSTOM BUSINESS ASSISTANT\n- Deliver a tailored conversational workflow."
            greeting_instruction = "Clear, friendly telephone greeting"

        # Language directive
        lang_note = f"Language: {language}" if language and language != "en" else "Language: English (with multilingual mirroring)"

        system_instruction = f"""You are an elite conversational AI voice architect for real-time telephone voice agents.
Given an Agent Name, Role, Objective, Description, Archetype, Tone, and Response Length, synthesize complete spoken telephone system prompt instructions and 3 distinct opening greeting options.

{intent_guidance}

CRITICAL TELEPHONE SPOKEN VOICE RULES:
1. SPOKEN LENGTH RULE: {spoken_length_rule}
2. SINGLE QUESTION PER TURN: Ask only ONE single question at a time so the conversation feels collaborative and natural.
3. AUDIO FORMAT: NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code blocks in the spoken script or greeting.
4. ACTIVE LISTENING: Always acknowledge what the customer said (e.g. 'Got it,', 'I understand,', 'That makes sense,') before continuing.
5. GREETING GENERATION RULES:
   - Generate 3 distinct, natural, human-sounding telephone opening greeting options tailored specifically to the agent's Description, Role, and Objective:
     * 'Direct & Warm': A warm, welcoming opening stating who is speaking and asking how to help.
     * 'Engaging Hook & Discovery': An engaging hook directly referencing the specific purpose/description (e.g. 'I am following up regarding your recent inquiry about [topic]...') and asking a conversational opening question.
     * 'Consultative & Professional': A consultative, polite opening offering expert assistance based on the role and business workflow.
   - NEVER use robotic phrases like 'This is Customer Follow-Up Agent' or 'I am an AI assistant'. Speak naturally like an empathetic human representative.
6. {lang_note}.

Return ONLY a valid JSON object matching this schema:
{{
  "system_prompt": string (Full telephone system prompt instructions),
  "suggested_greeting": string (Primary natural telephone opening line),
  "suggested_greetings": [
    {{"label": "Direct & Warm", "text": string}},
    {{"label": "Engaging Hook & Discovery", "text": string}},
    {{"label": "Consultative & Professional", "text": string}}
  ],
  "suggested_objective": string (1-sentence primary objective),
  "communication_style": string,
  "recommended_voice": "aura-orion-en" | "aura-luna-en" | "aura-asteria-en" | "aura-stella-en" | "aura-arcas-en" | "aura-athena-en" | "aura-perseus-en",
  "recommended_temperature": float (0.2 to 0.4),
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

Synthesize the complete telephone conversation prompt instructions and 3 distinct opening greeting options (Direct & Warm, Engaging Hook & Discovery, Consultative & Professional) tailored to this specific workflow."""

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
                    main_g = parsed.get("suggested_greeting", f"Hi! Thanks for calling. How can I help you today?")
                    parsed["suggested_greetings"] = [
                        {"label": "Direct & Warm", "text": f"Hi! Thanks for calling. How can I assist you today?"},
                        {"label": "Engaging Hook & Discovery", "text": main_g},
                        {"label": "Consultative & Professional", "text": f"Hello! I am here to help with {description.lower().rstrip('.')}—how can I assist?"}
                    ]
                return parsed
            except Exception as e:
                print(f"[LLMGenerator] JSON parse error: {e}")

        # Fallback heuristic
        clean_name = name.strip() or "Voice Assistant"
        clean_desc = (objective or description).strip() or "Customer support and follow-up."
        clean_role = (role or "Representative").strip()
        
        # Clean persona name for natural human telephone speech
        spoken_persona = clean_name
        for suffix in [" Agent", " Assistant", " Bot", " AI"]:
            if spoken_persona.endswith(suffix):
                spoken_persona = "Alex"
                break

        if type_key in ["marketing", "sales", "outreach"]:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! Thanks for connecting with us today. My name is {spoken_persona}, how can I help you?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hi! This is {spoken_persona} reaching out regarding {clean_desc.lower().rstrip('.')}. Do you have a quick 30 seconds to chat?"},
                {"label": "Consultative & Professional", "text": f"Hello! This is {spoken_persona}, your {clean_role}. How can I best assist with your inquiry today?"}
            ]
        elif type_key in ["follow_up", "review"]:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! Thanks for taking my call. This is {spoken_persona}, following up to see how everything is going with you today?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hi! This is {spoken_persona} following up on {clean_desc.lower().rstrip('.')}. Did you have a moment to go over any questions?"},
                {"label": "Consultative & Professional", "text": f"Hello! This is {spoken_persona} with customer follow-up. I am checking in to ensure everything is resolved to your satisfaction."}
            ]
        elif type_key in ["reminder", "appointment_reminder"]:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! This is {spoken_persona} with a quick friendly reminder regarding {clean_desc.lower().rstrip('.')}. Will you still be able to make it?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hello! This is {spoken_persona}. I'm calling to confirm your upcoming scheduled appointment—do you have a quick moment?"},
                {"label": "Consultative & Professional", "text": f"Good day! This is {spoken_persona} reaching out to confirm your booking and see if you need to reschedule or have any questions."}
            ]
        else:
            fallback_greetings = [
                {"label": "Direct & Warm", "text": f"Hi! Thank you for calling. This is {spoken_persona}, how can I help you today?"},
                {"label": "Engaging Hook & Discovery", "text": f"Hello! This is {spoken_persona} regarding {clean_desc.lower().rstrip('.')}. How can I assist you?"},
                {"label": "Consultative & Professional", "text": f"Hi there! This is {spoken_persona}, your {clean_role}. How can I best assist with your request today?"}
            ]

        return {
            "system_prompt": f"""You are {clean_name}, a genuine, warm, and highly capable {role or 'assistant'} speaking on a real-time telephone call.

PRIMARY MISSION:
{clean_desc}

SPOKEN TELEPHONE RULES:
- Communication Style: {tone}
- Spoken Length: {fallback_length_desc}
- Telephone Audio Rules: NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code blocks.
- Pacing: Speak naturally at a calm, relaxed pace.

CALL FLOW & CONVERSATION BRANCHES:
1. WARM HUMAN GREETING: State who you are and ask your primary single question.
2. ATTENTIVE LISTENING: Acknowledge what the customer just said before asking your next single question.
3. POSITIVE RESPONSES: Validate warmly, verify details, and offer next steps.
4. OBJECTIONS OR ISSUES: Respond with immediate empathy, explain key options simply, and never argue.
5. NATURAL POLITE CLOSING: Confirm everything is covered, thank them genuinely, and wish them a great day.""",
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
