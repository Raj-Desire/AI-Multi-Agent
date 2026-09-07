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
        if self.azure_endpoint and self.azure_api_key:
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
                    {"role": "user", "content": user_prompt}
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

        return None

    async def analyze_call_transcript(self, transcript_array: List[Dict[str, Any]]) -> Dict[str, Any]:
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

        # Fallback default object for non-answered, silent, or machine calls
        empty_analysis = {
            "summary": "",
            "intent": "No Answer / Machine",
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

        if not transcript_array or not customer_spoke:
            return empty_analysis

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

CRITICAL RULE FOR SUMMARY:
If the customer did NOT reply meaningfully (e.g., call answered by voicemail greeting, automated IVR phone menu, answering machine, or disconnected with silence), set "summary" to "" (empty string) and "business_outcome" to "No Answer" or "Voicemail".
ONLY provide a non-empty summary if there was an actual conversation with a human.

BUSINESS OUTCOME (Choose precisely one simple, human-friendly status):
- "Interested": Customer showed positive interest, asked questions, requested pricing, or agreed to a meeting/appointment.
- "Callback Requested": Customer explicitly asked to be called back at a specific or later time.
- "Asked Details": Customer asked for information, brochure, or specific feature details.
- "Follow-up": Customer asked for follow-up via email or WhatsApp.
- "Not Interested": Customer declined, refused, or said not interested.
- "Do Not Call": Customer requested to be removed from calling list (DNC).
- "Voicemail": Answering machine or automated message detected.
- "No Answer": Call was not answered or disconnected immediately with silence.
- "Failed": Technical drop or audio error.

INTEREST LEVEL:
- "Hot": For Interested leads who agreed to next steps or asked for pricing/meetings.
- "Warm": For Callback Requested, Asked Details, or Follow-up.
- "Cold": For Not Interested, Do Not Call, Voicemail, or No Answer.

LEAD SCORE:
- Number from 0 to 100 reflecting commercial viability and interest.

JSON OUTPUT STRUCTURE:
{
  "summary": "Concise 2-3 sentence overview of the conversation. Set to empty string if no meaningful human dialogue.",
  "intent": "Primary customer intent, e.g., 'Pricing Inquiry', 'Callback Request', 'Not Interested', 'Technical Question'",
  "business_outcome": "One of: Highly Interested | Interested | Warm Interested | Callback Requested | Follow-up Required | Information Requested | Qualified | Converted | Not Interested | Do Not Contact | Voicemail | No Answer | Failed",
  "interest_level": "Hot | Warm | Cold",
  "lead_score": 0-100,
  "sentiment": "Positive | Neutral | Negative",
  "key_insights": ["Key point 1", "Key point 2"],
  "key_requirements": ["Requirement 1", "Requirement 2"],
  "customer_questions": ["Question asked by customer 1"],
  "objections": ["Any pricing/timeline objection raised"],
  "important_info": "Notable business details captured (e.g. current vendor, budget, timeline)",
  "next_action": "Clear, actionable recommended next step (e.g., 'Send pricing brochure via email', 'Call back tomorrow at 11:00 AM')",
  "callback_datetime": "Parsed date/time string if customer requested callback, or null",
  "customer_name": "Customer name if mentioned or null",
  "company_name": "Company name if mentioned or null"
}"""

        user_prompt = f"TRANSCRIPT:\n{formatted_transcript}"
        parsed = await self._execute_llm_json(system_prompt, user_prompt)

        if not parsed:
            return empty_analysis

        # Programmatic guardrails on extracted result
        customer_full_text = " ".join(
            (t.get("content") or t.get("text", "")).lower()
            for t in transcript_array
            if t.get("role") in ["user", "customer"]
        )
        customer_words = customer_full_text.strip().split()

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

        has_explicit_callback = any(
            phrase in customer_full_text
            for phrase in ["call me back", "call back", "call later", "call tomorrow", "busy right now", "another time", "call next week"]
        )

        has_explicit_dnc = any(
            phrase in customer_full_text
            for phrase in ["do not call", "remove my number", "don't call again", "stop calling", "remove me", "dnc"]
        )

        has_explicit_interest = any(
            phrase in customer_full_text
            for phrase in ["interested", "tell me more", "send details", "send email", "pricing", "schedule", "quote", "cost", "demo"]
        )

        if is_machine:
            parsed["business_outcome"] = "Voicemail"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = 0
            parsed["summary"] = ""
            parsed["next_action"] = "Retry at next calling window"
        elif len(customer_words) == 0:
            parsed["business_outcome"] = "No Answer"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = 0
            parsed["summary"] = ""
            parsed["next_action"] = "Retry at next calling window"
        elif has_explicit_dnc:
            parsed["business_outcome"] = "Do Not Contact"
            parsed["interest_level"] = "Cold"
            parsed["lead_score"] = 0
            parsed["next_action"] = "Mark contact as Do Not Contact (DNC)"
        elif has_explicit_callback and parsed.get("business_outcome") not in ["Callback Requested", "Interested", "Highly Interested", "Converted", "Qualified"]:
            parsed["business_outcome"] = "Callback Requested"
            parsed["interest_level"] = "Warm"
            if not parsed.get("next_action") or parsed.get("next_action") == "None":
                parsed["next_action"] = "Call back customer as requested"
        elif parsed.get("business_outcome") in ["No Answer", "Voicemail"] and len(customer_words) >= 3:
            # Customer spoke meaningful words, so it cannot be No Answer
            parsed["business_outcome"] = "Information Requested" if "?" in customer_full_text else "Warm Interested"
            parsed["interest_level"] = "Warm"
            if not parsed.get("lead_score") or parsed.get("lead_score") == 0:
                parsed["lead_score"] = 40

        # Normalization to simple user-friendly terms
        raw_outcome = parsed.get("business_outcome") or "Interested"
        norm = raw_outcome.strip().lower()
        if "converted" in norm or "meeting" in norm or "qualified" in norm or "highly" in norm or "warm" in norm:
            raw_outcome = "Interested"
        elif "information" in norm or "info" in norm or "asked" in norm:
            raw_outcome = "Asked Details"
        elif "follow" in norm:
            raw_outcome = "Follow-up"
        elif "callback" in norm:
            raw_outcome = "Callback Requested"
        elif "dnc" in norm or "do not" in norm:
            raw_outcome = "Do Not Call"
        elif "not interested" in norm:
            raw_outcome = "Not Interested"
        elif "no answer" in norm:
            raw_outcome = "No Answer"
        elif "voicemail" in norm:
            raw_outcome = "Voicemail"
        elif "busy" in norm:
            raw_outcome = "Busy"

        interest_lvl = parsed.get("interest_level") or ("Hot" if raw_outcome == "Interested" else "Warm")

        return {
            "summary": parsed.get("summary", ""),
            "intent": parsed.get("intent", "General Inquiry"),
            "business_outcome": raw_outcome,
            "interest_level": interest_lvl,
            "classification": interest_lvl,
            "lead_score": int(parsed.get("lead_score", 50) or 0),
            "sentiment": parsed.get("sentiment", "Neutral"),
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
