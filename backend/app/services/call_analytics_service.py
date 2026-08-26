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
        Analyzes full transcript turns and produces structured evaluation intelligence.
        """
        user_messages = [
            t for t in (transcript_array or [])
            if (t.get("role") in ["user", "customer"]) and (t.get("content") or t.get("text", "")).strip()
        ]
        customer_spoke = len(user_messages) > 0

        # Fallback default object for non-answered or machine calls
        empty_analysis = {
            "summary": "",
            "key_insights": [],
            "intent": "No Answer / Machine",
            "sentiment": "Neutral",
            "lead_score": 0,
            "interest_level": "Not Answered",
            "classification": "Cold",
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
            formatted_transcript_lines.append(f"{role_label}: {msg_text}")
        formatted_transcript = "\n".join(formatted_transcript_lines)

        system_prompt = """You are a senior sales lead analyst and conversational AI auditor.
Analyze the following transcript of an outbound/inbound telephone call between an AI voice assistant and a customer/prospect.
Extract actionable lead intelligence in JSON format. Output valid raw JSON only.

CRITICAL RULE FOR SUMMARY:
If the customer did NOT reply meaningfully (e.g., call answered by voicemail greeting, automated IVR phone menu, answering machine, or disconnected with silence), set "summary" to "" (empty string).
ONLY provide a non-empty summary if there was an actual conversation with a human.

STRICT INTEREST LEVEL RULES:
- "Not Answered": Answering machine, voicemail greeting, IVR phone menu, automated screener, silence, or no meaningful human dialogue.
- "Wants Callback": ONLY set if the customer EXPLICITLY requested a callback or stated a day/time to call back (e.g., "call me back tomorrow", "busy right now, call later").
- "Needs Follow-up": ONLY set if the customer asked for info via email/SMS/WhatsApp, asked questions about solutions, or showed genuine interest.
- "Not Interested": Customer explicitly rejected, refused, hung up, or said not interested.
- "Highly Interested" / "Interested": Clear interest expressed in services, products, or agreed to a specialist consultation.

CLASSIFICATION RULES:
- "Hot": For Highly Interested or clear immediate business requirements.
- "Warm": For Interested, Needs Follow-up, or Wants Callback.
- "Cold": For Not Interested, Not Answered, or machine answer.

LEAD SCORE:
- Number from 0 to 100 based on interest level, engagement, and willingness to connect further.

JSON OUTPUT STRUCTURE:
{
  "summary": "2-3 sentence overview of the conversation. Set to empty string if no meaningful human dialogue.",
  "key_insights": ["Bullet point 1", "Bullet point 2"],
  "intent": "Primary caller intent, e.g., 'Automation Inquiry', 'Callback Request', 'Not Interested', 'Support'",
  "sentiment": "Positive | Neutral | Negative",
  "lead_score": 0-100,
  "interest_level": "Not Answered | Wants Callback | Needs Follow-up | Not Interested | Highly Interested | Interested",
  "classification": "Hot | Warm | Cold",
  "customer_name": "Customer name if mentioned or null",
  "company_name": "Company name if mentioned or null",
  "business_requirements": "Requirements mentioned or null",
  "callback_datetime": "Parsed date/time string if customer requested a callback, or null"
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
            for phrase in ["call me back", "call back", "call later", "call tomorrow", "busy right now", "another time"]
        )

        has_explicit_interest = any(
            phrase in customer_full_text
            for phrase in ["interested", "tell me more", "send details", "send email", "pricing", "schedule", "quote"]
        )

        if is_machine or len(customer_words) < 4:
            parsed["interest_level"] = "Not Answered"
            parsed["classification"] = "Cold"
            parsed["lead_score"] = 0
            parsed["summary"] = ""
        elif parsed.get("interest_level") in ["Needs Follow-up", "Wants Callback"]:
            if not has_explicit_callback and not has_explicit_interest:
                parsed["interest_level"] = "Not Answered" if len(customer_words) < 6 else "Not Interested"
                parsed["classification"] = "Cold"
                parsed["lead_score"] = 0 if len(customer_words) < 6 else 10

        return {
            "summary": parsed.get("summary", ""),
            "key_insights": parsed.get("key_insights", []),
            "intent": parsed.get("intent", "Unknown"),
            "sentiment": parsed.get("sentiment", "Neutral"),
            "lead_score": parsed.get("lead_score", 0),
            "interest_level": parsed.get("interest_level", "Not Answered"),
            "classification": parsed.get("classification", "Cold"),
            "customer_name": parsed.get("customer_name"),
            "company_name": parsed.get("company_name"),
            "business_requirements": parsed.get("business_requirements"),
            "callback_datetime": parsed.get("callback_datetime"),
        }
