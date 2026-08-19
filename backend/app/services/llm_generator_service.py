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
        tone: Optional[str] = "Professional + Friendly"
    ) -> Dict[str, Any]:
        """
        Generates a tailored telephone voice agent prompt and spoken greeting line
        based on the Agent Archetype / Intent (Marketing, Follow-Up, Query Solver, Reminder, Lead Gen).
        """
        type_key = (agent_type or "marketing").lower()

        # Intent-specific guidance
        intent_guidance = ""
        greeting_instruction = ""

        if type_key in ["marketing", "sales", "outreach"]:
            intent_guidance = """INTENT: MARKETING & SALES OUTREACH
- The primary goal is to hook interest, pitch value concisely in 1 sentence, handle objections, and secure a demo or appointment.
- GREETING: Must be an engaging hook with a direct qualification question (e.g. 'Hi! This is {name}. I'm calling to see if you are currently looking to [key benefit]—do you have a quick 30 seconds?').
- OBJECTION HANDLING: When caller says 'Not interested' or doubts price, validate warmly, state one strong unique differentiator, and ask if they'd prefer a brief email or follow-up."""
            greeting_instruction = "Engaging sales hook asking a direct qualifying question like 'Are you currently interested in...?'"
        elif type_key in ["follow_up", "review"]:
            intent_guidance = """INTENT: CUSTOMER FOLLOW-UP & SATISFACTION REVIEW
- The primary goal is to check on an existing customer, verify if they received their product/service/documents, check satisfaction, and offer assistance.
- GREETING: Warm check-in (e.g. 'Hi! This is {name} following up on your recent service to see how everything went and if you received everything?').
- OBJECTION/ISSUE HANDLING: Express sincere empathy if items are missing or if caller is unhappy, log details, and offer immediate resolution."""
            greeting_instruction = "Warm follow-up check-in verifying satisfaction or receipt of services"
        elif type_key in ["query_solver", "support", "helpdesk"]:
            intent_guidance = """INTENT: INBOUND QUERY SOLVER & CUSTOMER SUPPORT
- The primary goal is to listen to caller questions, troubleshoot systematically, and provide clear 1-2 sentence answers.
- GREETING: Welcoming support greeting (e.g. 'Thank you for calling! This is {name}. How can I help you today?').
- TROUBLESHOOTING: Provide 1 clear step at a time, check if that resolved it, and escalate to human supervisor if unresolved."""
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

        system_instruction = f"""You are an elite conversational AI voice architect for real-time telephone voice agents.
Given an Agent Name, Description, Agent Type, and Tone, synthesize complete spoken telephone system prompt instructions.

{intent_guidance}

CRITICAL TELEPHONE SPOKEN VOICE RULES:
1. SPOKEN BREVITY: Spoken length MUST strictly be 1 to 2 short, crisp, natural conversational sentences per turn (maximum 20 to 25 words total). Under NO circumstances should the agent produce 3 or more sentences in one turn.
2. SINGLE QUESTION PER TURN: NEVER ask more than ONE single question per turn. Never combine multiple suggestions or questions.
3. AUDIO FORMAT: NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code blocks in the spoken script or greeting.
4. ACTIVE LISTENING: Always acknowledge what the customer said (e.g. 'Got it,', 'I understand,', 'That makes sense,') before asking the next single question.
5. GREETING: {greeting_instruction}.

Return ONLY a valid JSON object matching this schema:
{{
  "system_prompt": string (Full telephone system prompt instructions),
  "suggested_greeting": string (Warm, natural telephone opening line matching the intent),
  "suggested_objective": string (1-sentence primary objective),
  "communication_style": string,
  "recommended_voice": "aura-orion-en" | "aura-luna-en" | "aura-asteria-en" | "aura-stella-en" | "aura-arcas-en" | "aura-athena-en" | "aura-perseus-en",
  "recommended_temperature": float (0.2 to 0.4),
  "positive_flow": string,
  "negative_flow": string
}}"""

        user_prompt = f"""Agent Name: {name}
Agent Type / Archetype: {agent_type}
Description / Business Workflow: {description}
Communication Tone: {tone}

Synthesize the telephone conversation prompt instructions, opening greeting matching this archetype, and objection handling rules."""

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
                return json.loads(json_text)
            except Exception as e:
                print(f"[LLMGenerator] JSON parse error: {e}")

        # Fallback heuristic
        clean_name = name.strip() or "Voice Assistant"
        clean_desc = description.strip() or "General voice assistant for customer calls."
        
        fallback_greeting = f"Hi! This is {clean_name}. How can I help you today?"
        if type_key in ["marketing", "sales"]:
            fallback_greeting = f"Hi! This is {clean_name}. I'm calling regarding {clean_desc.lower().rstrip('.')}. Are you currently looking into this?"
        elif type_key in ["follow_up", "review"]:
            fallback_greeting = f"Hi! This is {clean_name} following up on your recent account. How has everything been going with you?"
        elif type_key in ["reminder"]:
            fallback_greeting = f"Hi! This is {clean_name} with a quick reminder regarding your scheduled appointment. Will you still be able to make it?"

        return {
            "system_prompt": f"""You are {clean_name}, a genuine, warm, and highly capable assistant speaking on a real-time telephone call.

PRIMARY MISSION:
{clean_desc}

SPOKEN TELEPHONE RULES:
- Communication Style: {tone}
- Spoken Length: STRICTLY 1 to 2 short, crisp, natural conversational sentences per turn (under 25 words).
- Telephone Audio Rules: NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code blocks.
- Pacing: Speak naturally at a calm, relaxed pace.

CALL FLOW & CONVERSATION BRANCHES:
1. WARM HUMAN GREETING: State who you are and ask your primary single question.
2. ATTENTIVE LISTENING: Acknowledge what the customer just said before asking your next single question.
3. POSITIVE RESPONSES: Validate enthusiastically, verify details, and offer next steps.
4. OBJECTIONS OR ISSUES: Respond with immediate empathy, explain key options simply, and never argue.
5. NATURAL POLITE CLOSING: Confirm everything is covered, thank them genuinely, and wish them a great day.""",
            "suggested_greeting": fallback_greeting,
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
        description: Optional[str] = ""
    ) -> Dict[str, Any]:
        """
        Takes an existing system prompt and incorporates a user instruction
        using Azure OpenAI GPT-4o to seamlessly update and format the telephone conversation script.
        """
        system_instruction = """You are an expert AI prompt engineer for real-time telephone voice agents.
The user has provided an existing telephone system prompt and wants to ADD or REFINE a specific behavior, business rule, FAQ, objection handling step, or capability.

YOUR TASK:
1. Seamlessly integrate the user's new instruction into the existing telephone prompt.
2. Keep the strict telephone audio rules intact (STRICTLY 1 to 2 short spoken sentences per turn under 25 words, ask only ONE single question at a time, never give monologues or multiple options, no markdown/bullets/asterisks/emojis).
3. Ensure the tone and personality remain coherent.
4. If the instruction affects the greeting, provide an updated suggested greeting as well.

Return ONLY a valid JSON object matching this schema:
{
  "system_prompt": string (The complete rewritten and updated system prompt),
  "suggested_greeting": string (Updated opening greeting if relevant, or current greeting),
  "summary_of_changes": string (1-sentence description of what was added/updated)
}"""

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
