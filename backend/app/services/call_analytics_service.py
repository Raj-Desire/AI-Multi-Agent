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
import re
import asyncio
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("call_analytics_service")


def _compile(phrases: List[str]) -> List["re.Pattern[str]"]:
    """Whole-word / whole-phrase patterns so 'dnc' never matches inside another word."""
    return [re.compile(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])") for p in phrases]


def _matches(patterns: List["re.Pattern[str]"], text: str) -> bool:
    return any(p.search(text) for p in patterns)


_DNC_PATTERNS = _compile(["do not call", "remove my number", "don't call again", "stop calling", "remove me", "dnc"])
_NOT_INTERESTED_PATTERNS = _compile(
    ["not interested", "no interest", "don't need it", "not looking", "no thank you", "no thanks"]
)
_CALLBACK_PATTERNS = _compile(
    ["call me back", "call back", "call later", "call tomorrow", "busy right now", "another time", "call next week"]
)
_BUYING_PATTERNS = _compile([
    "book a demo", "schedule a demo", "book demo", "schedule demo", "want a demo", "set up a demo",
    "ready to buy", "how much does it cost", "send proposal", "pricing quote", "sign up", "get started",
    "book an appointment", "schedule a meeting", "let's do it", "sounds great let's connect", "can we meet",
])
_INQUIRY_PATTERNS = _compile([
    "tell me more", "what do you do", "what services", "how does it work", "send details", "send me the details",
    "send email", "send brochure", "send me the brochure", "more information", "what are your services",
    "what kind of", "explain", "features",
])
_QUESTION_WORDS = _compile(["what", "how", "which", "why", "can you", "do you", "does", "could you", "is there"])
_BUDGET_PATTERNS = _compile(["budget", "price", "pricing", "cost", "quote", "how much"])
_TIMELINE_PATTERNS = _compile(["this week", "next week", "this month", "next month", "asap", "immediately", "by end of"])
_AUTHORITY_PATTERNS = _compile(["my team", "our team", "i decide", "i'm the owner", "my manager", "we are looking", "we need"])


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

    @staticmethod
    def _fallback_summary(transcript_array: List[Dict[str, Any]], outcome: str) -> str:
        """Plain-language summary built from the transcript when the analysis model is unavailable."""
        def _text(t):
            return (t.get("content") or t.get("text", "")).strip()

        customer_lines = [_text(t) for t in transcript_array if t.get("role") in ["user", "customer"] and _text(t)]
        agent_lines = [_text(t) for t in transcript_array if t.get("role") in ["agent", "assistant"] and _text(t)]
        parts = [f"The call had {len(customer_lines)} customer and {len(agent_lines)} agent turns."]
        if customer_lines:
            first = customer_lines[0][:160]
            last = customer_lines[-1][:160]
            parts.append(f"The customer first said: \"{first}\"." if len(customer_lines) == 1
                         else f"The customer first said: \"{first}\" and last said: \"{last}\".")
        if outcome:
            parts.append(f"Outcome: {outcome}.")
        return " ".join(parts)

    # ------------------------------------------------------------------
    # Deterministic lead scoring
    # ------------------------------------------------------------------
    # The LLM supplies signals (outcome, sentiment, requirements, objections);
    # the number itself is computed here so the same call always scores the same
    # and every point can be explained to the end user via `score_breakdown`.
    #
    #   engagement (0-25) + intent (0-40) + qualification (0-20)
    #   + sentiment (0-10) - objections (0-15)  ->  clamped to the outcome band

    OUTCOME_BANDS = {
        "Interested": (75, 95),
        "Transferred to Specialist": (60, 80),
        "Callback Requested": (45, 68),
        "Asked Details": (40, 65),
        "Minimal Engagement": (10, 25),
        "Not Interested": (0, 20),
        "Do Not Call": (0, 0),
        "Voicemail": (0, 0),
        "No Answer": (0, 0),
        "Connected - No Dialogue": (10, 10),
    }
    OUTCOME_LEVEL = {
        "Interested": "Hot",
        "Transferred to Specialist": "Warm",
        "Callback Requested": "Warm",
        "Asked Details": "Warm",
    }

    @staticmethod
    def _engagement_points(words: int, turns: int, duration: int) -> int:
        pts = 0 if words < 4 else 5 if words < 10 else 10 if words < 25 else 15 if words < 60 else 18
        pts += 5 if turns >= 4 else 3 if turns >= 2 else 0
        pts += 2 if duration >= 30 else 0
        return min(pts, 25)

    def _score_call(
        self,
        *,
        parsed: Dict[str, Any],
        customer_text: str,
        customer_word_count: int,
        customer_turns: int,
        call_duration: int,
        is_machine: bool,
        llm_available: bool,
    ) -> Dict[str, Any]:
        """Returns outcome, interest level, 0-100 score and an explainable breakdown."""
        has_dnc = _matches(_DNC_PATTERNS, customer_text)
        has_not_interested = _matches(_NOT_INTERESTED_PATTERNS, customer_text)
        has_buying = _matches(_BUYING_PATTERNS, customer_text)
        has_callback = _matches(_CALLBACK_PATTERNS, customer_text)
        has_inquiry = _matches(_INQUIRY_PATTERNS, customer_text) or (
            # A bare "?" is not intent: speech-to-text adds it to any short utterance.
            # Only count a question when the customer said enough to mean it.
            "?" in customer_text and customer_word_count >= 8 and _matches(_QUESTION_WORDS, customer_text)
        )

        llm_norm = str(parsed.get("business_outcome") or "").strip().lower()
        engaged = customer_word_count >= 6

        def result(outcome, score, breakdown, *, next_action=None, override_next=False, summary=None):
            return {
                "outcome": outcome,
                "interest_level": self.OUTCOME_LEVEL.get(outcome, "Cold"),
                "score": score,
                "breakdown": breakdown,
                "next_action": next_action,
                "override_next": override_next,
                "summary": summary,
            }

        def fixed(outcome, reason, **kw):
            lo, _hi = self.OUTCOME_BANDS[outcome]
            return result(outcome, lo, {"reason": reason, "total": lo}, **kw)

        # --- Hard overrides: facts, not estimates ---------------------------
        if is_machine:
            return fixed("Voicemail", "Automated answering machine", summary="",
                         next_action="Retry at next calling window", override_next=True)
        if customer_word_count == 0:
            return fixed("Connected - No Dialogue", "Customer did not speak",
                         summary="Call connected but prospect disconnected without speaking.",
                         next_action="Retry call later", override_next=True)
        if has_dnc:
            return fixed("Do Not Call", "Customer asked not to be contacted again",
                         next_action="Mark contact as Do Not Contact (DNC)", override_next=True)

        # --- Pick the outcome from the strongest evidence -------------------
        if has_not_interested and not has_buying:
            outcome, intent_pts = "Not Interested", 0
            next_action, override = "No further outreach required", True
        elif has_buying:
            outcome, intent_pts = "Interested", 40
            next_action, override = "Schedule demo presentation & send calendar invite", False
        elif has_callback:
            outcome, intent_pts = "Callback Requested", 20
            next_action, override = "Call back customer as requested", False
        elif has_inquiry and engaged:
            outcome, intent_pts = "Asked Details", 15
            next_action, override = "Send detailed product overview and follow up", False
        elif engaged and "transfer" in llm_norm:
            outcome, intent_pts = "Transferred to Specialist", 30
            next_action, override = None, False
        elif engaged and "interested" in llm_norm and "not interested" not in llm_norm:
            outcome, intent_pts = "Interested", 35
            next_action, override = None, False
        elif engaged and "callback" in llm_norm:
            outcome, intent_pts = "Callback Requested", 20
            next_action, override = None, False
        elif engaged and any(k in llm_norm for k in ("asked", "information", "detail", "follow")):
            outcome, intent_pts = "Asked Details", 15
            next_action, override = None, False
        elif engaged and "not interested" in llm_norm:
            outcome, intent_pts = "Not Interested", 0
            next_action, override = "No further outreach required", True
        else:
            # Customer spoke, but nothing that shows buying interest (e.g. "eight and eight").
            outcome, intent_pts = "Minimal Engagement", 0
            next_action, override = "Retry call later or follow up via SMS", False

        # --- Score components ----------------------------------------------
        engagement = self._engagement_points(customer_word_count, customer_turns, call_duration)

        qual_hits = [
            bool(_matches(_BUDGET_PATTERNS, customer_text)),
            bool(_matches(_TIMELINE_PATTERNS, customer_text)),
            bool(_matches(_AUTHORITY_PATTERNS, customer_text)),
            bool(parsed.get("key_requirements")),
        ]
        qualification = min(sum(qual_hits) * 5, 20) if outcome != "Minimal Engagement" else 0

        sentiment_label = str(parsed.get("sentiment") or "Neutral")
        sentiment = {"positive": 10, "neutral": 5, "negative": 0}.get(sentiment_label.lower(), 5)
        if outcome in ("Minimal Engagement", "Not Interested"):
            sentiment = 0

        objections = parsed.get("objections") or []
        objection_pts = -min(len(objections) * 5, 15) if isinstance(objections, list) else 0

        raw = engagement + intent_pts + qualification + sentiment + objection_pts
        lo, hi = self.OUTCOME_BANDS[outcome]
        score = max(lo, min(raw, hi))

        breakdown = {
            "engagement": engagement,
            "intent": intent_pts,
            "qualification": qualification,
            "sentiment": sentiment,
            "objections": objection_pts,
            "raw_total": raw,
            "total": score,
            "customer_words": customer_word_count,
            "customer_turns": customer_turns,
            "source": "llm+rules" if llm_available else "rules",
        }
        return result(outcome, score, breakdown, next_action=next_action, override_next=override)

    async def analyze_call_transcript(
        self,
        transcript_array: List[Dict[str, Any]],
        call_duration: int = 0,
        call_status: str = "completed",
        timezone_iana: Optional[str] = None,
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
            or call_status == "in-progress"
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

RECORDING RETENTION RULES (Cost Optimization):
- "needs_audio_recording" MUST BE true ONLY IF:
  1. The call experienced human agent escalation, supervisor request, or handoff.
  2. Customer expressed strong negative sentiment, anger, frustration, or severe complaint.
  3. The AI misunderstood the user multiple times, gave contradictory answers, or got confused.
  4. Dispute, legal, cancellation, or billing conflict keywords were raised.
- For all other standard, successful, routine inquiries, answered questions, or voicemail drops, set "needs_audio_recording": false.

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
  "scheduled_type": "meeting | callback | null. 'meeting' only when a demo/appointment/visit was explicitly agreed; 'callback' when a call-back time was agreed",
  "scheduled_date": "YYYY-MM-DD in the business timezone for the AGREED date, or null",
  "scheduled_time": "HH:MM 24-hour in the business timezone for the AGREED time, or null",
  "scheduled_confidence": "confirmed only if BOTH a specific date and a specific time were clearly agreed by the customer; otherwise tentative. Never guess; vague phrases like 'sometime next week' are tentative with null date/time",
  "customer_name": "Customer name if mentioned or null",
  "company_name": "Company name if mentioned or null",
  "needs_audio_recording": false,
  "recording_retention_reason": "Escalation / Negative Sentiment / AI Confusion / None"
}"""

        from app.services.appointment_time import local_reference
        system_prompt += (
            f"\n\nREFERENCE TIME: right now it is {local_reference(timezone_iana)}. Resolve words like 'tomorrow' or "
            f"'next Monday' to a concrete calendar date relative to this moment, in that timezone."
        )
        user_prompt = f"TRANSCRIPT:\n{formatted_transcript}\n\nPlease output valid JSON."
        parsed = await self._execute_llm_json(system_prompt, user_prompt)
        if not parsed:
            logger.warning("[CallAnalytics] First analysis attempt returned nothing; retrying once.")
            await asyncio.sleep(1.0)
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

        if not parsed:
            parsed = {}

        scoring = self._score_call(
            parsed=parsed,
            customer_text=customer_full_text,
            customer_word_count=len(customer_words),
            customer_turns=len(user_messages),
            call_duration=call_duration,
            is_machine=is_machine,
            llm_available=bool(parsed),
        )
        raw_outcome = scoring["outcome"]
        interest_lvl = scoring["interest_level"]
        final_score = scoring["score"]
        if scoring.get("next_action") and (scoring.get("override_next") or not parsed.get("next_action")):
            parsed["next_action"] = scoring["next_action"]
        if scoring.get("summary") is not None:
            parsed["summary"] = scoring["summary"]

        summary_text = parsed.get("summary", "")
        if not summary_text and not is_machine and customer_words:
            summary_text = self._fallback_summary(transcript_array, raw_outcome)

        # Fallback heuristic for recording retention if LLM did not provide flag
        has_escalation = any(
            phrase in customer_full_text or phrase in agent_full_text
            for phrase in [
                "speak to a manager", "speak to human", "talk to human", "transfer me",
                "supervisor", "human representative", "speak to representative"
            ]
        )
        has_negative_sentiment = (parsed.get("sentiment") == "Negative") or any(
            phrase in customer_full_text
            for phrase in [
                "angry", "furious", "unacceptable", "terrible service", "scam",
                "lawyer", "sue you", "complaint", "fraud", "cancel my subscription", "cancel service"
            ]
        )
        has_ai_confusion = any(
            phrase in agent_full_text
            for phrase in [
                "i apologize, i did not understand", "i am having trouble understanding",
                "could you repeat that again", "sorry, i didn't catch that"
            ]
        ) and (len(transcript_array) > 4)

        needs_recording = bool(parsed.get("needs_audio_recording", False))
        retention_reason = parsed.get("recording_retention_reason") or "None"

        if has_escalation:
            needs_recording = True
            retention_reason = "Human Escalation / Supervisor Transfer"
        elif has_negative_sentiment:
            needs_recording = True
            retention_reason = "Negative Sentiment / Customer Complaint"
        elif has_ai_confusion and not needs_recording:
            needs_recording = True
            retention_reason = "AI Confusion / Misunderstanding"

        return {
            "summary": summary_text,
            "intent": parsed.get("intent", "General Inquiry"),
            "business_outcome": raw_outcome,
            "interest_level": interest_lvl,
            "classification": interest_lvl,
            "lead_score": final_score,
            "score_breakdown": scoring["breakdown"],
            "sentiment": parsed.get("sentiment", "Positive" if interest_lvl in ["Hot", "Warm"] else "Neutral"),
            "key_insights": parsed.get("key_insights", []),
            "key_requirements": parsed.get("key_requirements", []),
            "customer_questions": parsed.get("customer_questions", []),
            "objections": parsed.get("objections", []),
            "important_info": parsed.get("important_info"),
            "next_action": parsed.get("next_action") or "Follow up with prospect",
            "callback_datetime": parsed.get("callback_datetime"),
            "scheduled_type": parsed.get("scheduled_type"),
            "scheduled_date": parsed.get("scheduled_date"),
            "scheduled_time": parsed.get("scheduled_time"),
            "scheduled_confidence": parsed.get("scheduled_confidence"),
            "scheduled_timezone": timezone_iana,
            "customer_name": parsed.get("customer_name"),
            "company_name": parsed.get("company_name"),
            "business_requirements": parsed.get("business_requirements"),
            "needs_audio_recording": needs_recording,
            "recording_retention_reason": retention_reason,
        }
