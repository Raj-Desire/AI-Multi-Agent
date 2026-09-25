"""
Call Analytics Service
Performs comprehensive post-call transcript analysis including:
- Lead scoring (0-100)
- Strict interest level classification (Not Answered, Wants Callback, Needs Follow-up, Not Interested, Highly Interested, Interested)
- Hot / Warm / Cold segmentation
- Sentiment analysis (Positive, Neutral, Negative)
- Actionable summary & key insights extraction
- Callback date/time & customer requirements parsing
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("call_analytics_service")


class CallAnalyticsService:
    def __init__(self):
        # Azure OpenAI configurations
        self.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
        self.azure_api_key = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY", "")
        self.azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") or os.getenv("AZURE_OPENAI_MODEL", "gpt-4o")
        self.azure_api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")

        # Standard OpenAI fallback
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o")

    async def _execute_llm_json(self, system_instruction: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """Executes LLM request with JSON object output formatting."""
        # Azure OpenAI and OpenAI require the word 'json' to appear in messages when response_format is json_object
        normalized_user_prompt = user_prompt
        if "json" not in normalized_user_prompt.lower() and "json" not in system_instruction.lower():
            normalized_user_prompt = f"{user_prompt}\n\nPlease respond with a valid JSON object."

        if self.azure_endpoint and self.azure_api_key:
            url = f"{self.azure_endpoint}/openai/deployments/{self.azure_deployment}/chat/completions?api-version={self.azure_api_version}"
            headers = {
                "Content-Type": "application/json",
                "api-key": self.azure_api_key
            }
            payload = {
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": normalized_user_prompt}
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"}
            }
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_content = data["choices"][0]["message"]["content"]
                        return json.loads(raw_content)
                    else:
                        logger.error(f"[CallAnalytics] Azure OpenAI error {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.error(f"[CallAnalytics] Azure OpenAI execution error: {e}")

        if self.openai_api_key:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.openai_api_key}"
            }
            payload = {
                "model": self.openai_model,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": normalized_user_prompt}
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"}
            }
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_content = data["choices"][0]["message"]["content"]
                        return json.loads(raw_content)
                    else:
                        logger.error(f"[CallAnalytics] OpenAI error {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.error(f"[CallAnalytics] OpenAI execution error: {e}")
                logger.error(f"[CallAnalytics] OpenAI execution error: {e}")

        return None

    async def analyze_call_transcript(
        self,
        transcript_array: List[Dict[str, Any]],
        call_duration: int = 0,
        call_status: str = "completed"
    ) -> Dict[str, Any]:
        """
        Analyzes full transcript turns and produces structured evaluation intelligence:
        - Business outcome (taxonomic)
        - Executive summary
        - Customer intent
        - Interest level (Hot / Warm / Cold)
        - Key requirements & customer questions
        - Objections & important info
        - Recommended next action
        - Callback date/time
        - Sentiment & Lead score (0-100)
        """
        user_messages = [
            t for t in (transcript_array or [])
            if (t.get("role") in ["user", "customer"]) and (t.get("content") or t.get("text", "")).strip()
        ]
        customer_spoke = len(user_messages) > 0

        # Check if call was received/connected vs completely unanswered/failed
        is_connected = (
            call_duration > 0
            or call_status in ["completed", "in-progress"]
            or len(transcript_array or []) > 0
        )
        is_unanswered = call_status in ["no-answer", "busy", "failed", "canceled"] and not customer_spoke

        # If call was not answered or failed completely
        if is_unanswered or (not is_connected and not customer_spoke):
            return {
                "summary": "",
                "intent": "No Answer / Unreachable",
                "business_outcome": "No Answer",
                "interest_level": "Cold",
                "classification": "Cold",
                "lead_score": 0,
                "sentiment": "Neutral",
                "key_insights": [],
                "key_requirements": [],
                "customer_questions": [],
                "objections": [],
                "important_info": None,
                "next_action": "Retry call at next scheduled window",
                "customer_name": None,
                "company_name": None,
                "business_requirements": None,
                "callback_datetime": None,
            }

        # If call was received/picked up, but customer cut/hung up directly without speaking anything
        if not customer_spoke:
            return {
                "summary": "Call connected but customer disconnected immediately without speaking.",
                "intent": "Connected - No Dialogue",
                "business_outcome": "Connected - No Dialogue",
                "interest_level": "Cold",
                "classification": "Cold",
                "lead_score": 10,  # Explicitly 10: Call received / connected
                "sentiment": "Neutral",
                "key_insights": ["Call was answered by prospect or device but disconnected without speaking."],
                "key_requirements": [],
                "customer_questions": [],
                "objections": [],
                "important_info": None,
                "next_action": "Follow up via SMS or retry call later",
                "customer_name": None,
                "company_name": None,
                "business_requirements": None,
                "callback_datetime": None,
            }

        formatted_transcript_lines = []
        for t in transcript_array:
            role_label = "Agent" if t.get("role") in ["agent", "assistant"] else "Customer"
            msg_text = t.get("content") or t.get("text", "")
            timestamp_str = t.get("timestamp") or t.get("created_at") or ""
            time_prefix = f"[{timestamp_str}] " if timestamp_str else ""
            formatted_transcript_lines.append(f"{time_prefix}{role_label}: {msg_text}")
        formatted_transcript = "\n".join(formatted_transcript_lines)

        system_prompt = """You are a senior sales lead analyst and conversational AI auditor.
Analyze the following transcript of an outbound/inbound telephone call between an AI voice assistant and a customer/prospect.
Extract actionable lead intelligence in JSON format. Output valid raw JSON only.

SCORING & CLASSIFICATION GUIDELINES (Production-Grade Commercial Intent):
- Base Score: A connected call with meaningful human dialogue starts at 30.
- POSITIVE BUYING INTENT (Score 70 - 95, Classification "Hot", Outcome "Interested"):
  Customer explicitly wants a demo, requests pricing/quote, asks to book/schedule an appointment, says "ready to buy", "sign up", or agrees to onboarding/trial.
- WARM ENGAGEMENT (Score 40 - 65, Classification "Warm", Outcome "Asked Details" or "Callback Requested"):
  Customer asks detailed questions about features, services, or pricing without committing to demo, or explicitly requests to be called back later ("call tomorrow", "busy right now", "send info first").
- COLD / LOW INTENT (Score 10 - 25, Classification "Cold", Outcome "Not Interested" or "Do Not Call"):
  Customer says "not interested", "wrong number", "don't call again", raises insurmountable objections ("no budget", "we use a competitor"), or hangs up shortly after greeting.
- DIRECT HANGUP / NO DIALOGUE (Score 10, Classification "Cold"):
  Customer answered phone but hung up immediately without dialogue.

CRITICAL RULE FOR SUMMARY:
If the customer did NOT reply meaningfully (e.g. voicemail greeting, automated IVR, answering machine, or disconnected with silence), set "summary" to "" (empty string) and "business_outcome" to "No Answer" or "Voicemail".
ONLY provide a non-empty summary if there was an actual conversation with a human.

BUSINESS OUTCOME (Choose precisely one):
- "Interested": Customer wants demo, pricing, trial, or positive next steps.
- "Callback Requested": Customer asked to be called back.
- "Asked Details": Customer asked for service information, brochure, or details without scheduling demo.
- "Follow-up": Customer requested follow-up via email or message.
- "Not Interested": Customer declined or said not interested.
- "Do Not Call": Customer requested DNC / stop calling.
- "Voicemail": Automated answering machine.
- "No Answer": Unanswered or drop.

JSON OUTPUT STRUCTURE:
{
  "summary": "Concise 2-3 sentence overview of the conversation.",
  "intent": "Primary customer intent, e.g., 'Demo Request', 'Service Inquiry', 'Callback Request', 'Not Interested'",
  "business_outcome": "Interested | Asked Details | Callback Requested | Follow-up | Not Interested | Do Not Call | Voicemail | No Answer",
  "interest_level": "Hot | Warm | Cold",
  "lead_score": 0-100,
  "sentiment": "Positive | Neutral | Negative",
  "key_insights": ["Key point 1", "Key point 2"],
  "key_requirements": ["Requirement 1", "Requirement 2"],
  "customer_questions": ["Question asked by customer 1"],
  "objections": ["Any pricing/timeline objection raised"],
  "important_info": "Notable business details captured (e.g. budget, timeline)",
  "next_action": "Clear, actionable recommended next step",
  "callback_datetime": "Parsed date/time string if customer requested callback, or null",
  "customer_name": "Customer name if mentioned or null",
  "company_name": "Company name if mentioned or null"
}"""

        user_prompt = f"TRANSCRIPT:\n{formatted_transcript}\n\nPlease output valid JSON."
        parsed = await self._execute_llm_json(system_prompt, user_prompt)

        # Fallback heuristic calculation if LLM is unavailable or fails
        customer_full_text = " ".join(
            (t.get("content") or t.get("text", "")).lower()
            for t in transcript_array
            if t.get("role") in ["user", "customer"]
        )
        customer_words = [w for w in customer_full_text.strip().split() if w]

        agent_full_text = " ".join(
            (t.get("content") or t.get("text", "")).lower()
            for t in transcript_array
            if t.get("role") in ["agent", "assistant"]
        )

        is_machine = any(
            phrase in customer_full_text or phrase in agent_full_text
            for phrase in [
                "voicemail detected", "automated system detected", "leave a message",
                "after the tone", "after the beep", "press 1", "press 2",
                "call assistant", "automated screening", "not reachable", "currently unavailable"
            ]
        )

        has_explicit_dnc = any(
            phrase in customer_full_text
            for phrase in ["do not call", "remove my number", "don't call again", "stop calling", "remove me", "dnc"]
        )

        has_explicit_not_interested = any(
            phrase in customer_full_text
            for phrase in ["not interested", "no interest", "don't need it", "not looking", "no thank you", "no thanks"]
        )

        has_explicit_callback = any(
            phrase in customer_full_text
            for phrase in ["call me back", "call back", "call later", "call tomorrow", "busy right now", "another time", "call next week"]
        )

        # High-intent signals: wants demo, pricing quote, book meeting, buy
        has_positive_buying_signal = any(
            phrase in customer_full_text
            for phrase in [
                "book a demo", "schedule a demo", "book demo", "schedule demo", "want a demo",
                "set up a demo", "ready to buy", "how much does it cost", "send proposal",
                "pricing quote", "sign up", "get started", "book an appointment", "schedule a meeting",
                "let's do it", "sounds great let's connect", "can we meet"
            ]
        )

        # Service inquiry signals: curious, asking about service/features, but not booking demo
        has_service_inquiry = any(
            phrase in customer_full_text
            for phrase in [
                "tell me more", "what do you do", "what services", "how does it work",
                "send details", "send email", "send brochure", "explain", "features",
                "more information", "what are your services", "what kind of"
            ]
        ) or "?" in customer_full_text

        if not parsed:
            parsed = {}

        # Programmatic guardrails & score consistency
        if is_machine:
            parsed["business_outcome"] = "Voicemail"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = 0
            parsed["summary"] = ""
            parsed["next_action"] = "Retry at next calling window"
        elif len(customer_words) == 0:
            parsed["business_outcome"] = "Connected - No Dialogue"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = 10
            parsed["summary"] = "Call connected but prospect disconnected without speaking."
            parsed["next_action"] = "Retry call later"
        elif has_explicit_dnc:
            parsed["business_outcome"] = "Do Not Call"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = 0
            parsed["next_action"] = "Mark contact as Do Not Contact (DNC)"
        elif has_explicit_not_interested and not has_positive_buying_signal:
            parsed["business_outcome"] = "Not Interested"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = min(int(parsed.get("lead_score") or 20), 20)
            parsed["next_action"] = "No further outreach required"
        elif has_positive_buying_signal:
            # Positive demo or purchase intent MUST be high score (75-95) and Hot / Interested
            parsed["business_outcome"] = "Interested"
            parsed["interest_level"] = "Hot"
            current_score = int(parsed.get("lead_score") or 0)
            parsed["lead_score"] = max(current_score, 80)
            if not parsed.get("next_action") or parsed.get("next_action") == "Follow up with prospect":
                parsed["next_action"] = "Schedule demo presentation & send calendar invite"
        elif has_explicit_callback:
            parsed["business_outcome"] = "Callback Requested"
            parsed["interest_level"] = "Warm"
            current_score = int(parsed.get("lead_score") or 0)
            parsed["lead_score"] = max(min(current_score or 55, 65), 50)
            if not parsed.get("next_action") or parsed.get("next_action") == "None":
                parsed["next_action"] = "Call back customer as requested"
        elif has_service_inquiry:
            # Curious about service but not booking demo -> Warm / Asked Details
            if parsed.get("business_outcome") not in ["Interested", "Callback Requested"]:
                parsed["business_outcome"] = "Asked Details"
            parsed["interest_level"] = "Warm"
            current_score = int(parsed.get("lead_score") or 0)
            parsed["lead_score"] = max(min(current_score or 55, 65), 45)
            if not parsed.get("next_action"):
                parsed["next_action"] = "Send detailed product overview and follow up"

        # Strict score enforcement:
        # If outcome is Interested / positive demo, score MUST be at least 75
        # If outcome is Warm / Asked Details / Callback, score should be between 45 and 68
        # If outcome is Not Interested / Cold, score should be <= 25
        raw_outcome = parsed.get("business_outcome") or "Interested"
        norm = raw_outcome.strip().lower()

        final_score = int(parsed.get("lead_score", 50) or 0)

        if "not interested" in norm or "dnc" in norm or "do not" in norm:
            raw_outcome = "Do Not Call" if ("dnc" in norm or "do not" in norm) else "Not Interested"
            interest_lvl = "Cold"
            final_score = min(final_score, 20)
        elif "no answer" in norm:
            raw_outcome = "No Answer"
            interest_lvl = "Cold"
            final_score = 0
        elif "no dialogue" in norm or "connected - no" in norm:
            raw_outcome = "Connected - No Dialogue"
            interest_lvl = "Cold"
            final_score = 10
        elif "voicemail" in norm:
            raw_outcome = "Voicemail"
            interest_lvl = "Cold"
            final_score = 0
        elif "callback" in norm:
            raw_outcome = "Callback Requested"
            interest_lvl = "Warm"
            final_score = max(min(final_score or 55, 68), 45)
        elif "asked" in norm or "information" in norm or "detail" in norm or "follow" in norm:
            raw_outcome = "Asked Details"
            interest_lvl = "Warm"
            final_score = max(min(final_score or 55, 68), 45)
        elif "interested" in norm or "qualified" in norm or "converted" in norm or "meeting" in norm:
            raw_outcome = "Interested"
            interest_lvl = "Hot"
            # Never let an interested lead with positive buying response have a low score like 50!
            final_score = max(final_score, 75)
        else:
            interest_lvl = parsed.get("interest_level") or ("Hot" if final_score >= 70 else ("Warm" if final_score >= 40 else "Cold"))

        return {
            "summary": parsed.get("summary", ""),
            "intent": parsed.get("intent", "General Inquiry"),
            "business_outcome": raw_outcome,
            "interest_level": interest_lvl,
            "classification": interest_lvl,
            "lead_score": final_score,
            "sentiment": parsed.get("sentiment", "Positive" if interest_lvl in ["Hot", "Warm"] else "Neutral"),
            "key_insights": parsed.get("key_insights", []),
            "key_requirements": parsed.get("key_requirements", []),
            "customer_questions": parsed.get("customer_questions", []),
            "objections": parsed.get("objections", []),
            "important_info": parsed.get("important_info"),
            "next_action": parsed.get("next_action") or "Follow up with prospect",
            "callback_datetime": parsed.get("callback_datetime"),
            "customer_name": parsed.get("customer_name"),
            "company_name": parsed.get("company_name"),
            "business_requirements": parsed.get("business_requirements"),
        }
