"""
Cost Calculator Service
Calculates multi-tenant infrastructure usage costs across:
1. Telephony (Twilio PSTN Carrier rates per minute)
2. Speech-to-Text (STT audio streaming rates per second/minute)
3. Large Language Model (LLM input & output tokens per 1K / 1M tokens)
4. Text-to-Speech (TTS synthesized audio characters)

Provides profit margin projections for platform client billing.
"""

from typing import List, Dict, Any, Optional
import math
from datetime import datetime, timezone, timedelta
from app.models.call import Call

# Default Industry Standard Provider Costs (Cost to Platform)
TELEPHONY_COST_PER_MINUTE = 0.0140    # ~$0.014 / min for carrier outbound/inbound PSTN
STT_COST_PER_MINUTE = 0.0043          # ~$0.0043 / min for Real-time streaming transcription

# Multi-Model Dynamic TTS Voice Synthesis Rates (Cost per 1,000 characters)
TTS_RATES_PER_1K: Dict[str, float] = {
    "flux": 0.0450,       # Flux Conversation-Native voices (flux-hannah-en, etc.)
    "aura-2": 0.0300,     # Aura Multilingual generation (aura-2-thalia-en, etc.)
    "aura": 0.0150,       # Standard Aura generation (aura-asteria-en, etc.)
    "cartesia": 0.0750,   # Sonic ultra-low latency voice synthesis
    "default": 0.0450,    # Default standard rate
}

# LLM Pricing Table per 1K Tokens (Input, Output)
LLM_RATES_PER_1K: Dict[str, Dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.00015, "output": 0.00060},
    "gpt-4o": {"input": 0.00250, "output": 0.01000},
    "claude-3-5-haiku": {"input": 0.00080, "output": 0.00400},
    "claude-3-5-sonnet": {"input": 0.00300, "output": 0.01500},
    "deepseek-chat": {"input": 0.00014, "output": 0.00028},
    "default": {"input": 0.00020, "output": 0.00080},
}

# Default Markup for client billings (e.g. 2.5x wholesale cost)
DEFAULT_BILLING_MARKUP = 2.50


class CostCalculatorService:
    @staticmethod
    def estimate_tokens_from_text(text: str) -> int:
        """Approximates token count (~4 characters per token average)."""
        if not text:
            return 0
        return max(1, math.ceil(len(text) / 4.0))

    @classmethod
    def calculate_call_costs(cls, call: Call) -> Dict[str, Any]:
        """
        Calculates itemized infrastructure costs and token metrics for a single call.
        """
        duration_sec = max(0, call.duration or 0)
        minutes_billed = math.ceil(duration_sec / 60.0) if duration_sec > 0 else 0
        actual_minutes = duration_sec / 60.0

        # 1. Telephony Carrier Cost
        telephony_cost = minutes_billed * TELEPHONY_COST_PER_MINUTE

        # 2. STT Streaming Cost (calculated on actual speaking time)
        stt_cost = actual_minutes * STT_COST_PER_MINUTE

        # 3. LLM Tokens & Cost
        # Count input tokens (System prompt + user messages) & output tokens (agent messages)
        prompt_text = call.prompt or ""
        input_tokens = cls.estimate_tokens_from_text(prompt_text)
        output_tokens = 0
        tts_characters = 0

        transcript = call.transcript or []
        for turn in transcript:
            role = turn.get("role", "")
            content = turn.get("content", "") or ""
            if role == "user":
                input_tokens += cls.estimate_tokens_from_text(content)
            elif role == "assistant":
                out_t = cls.estimate_tokens_from_text(content)
                output_tokens += out_t
                tts_characters += len(content)

        # Detect LLM model from snapshot or default
        model_name = "gpt-4o-mini"
        voice_id = "flux-hannah-en"
        voice_provider = "deepgram"

        if call.agent_config_snapshot and isinstance(call.agent_config_snapshot, dict):
            # Model detection
            llm_section = call.agent_config_snapshot.get("llm")
            if isinstance(llm_section, dict) and llm_section.get("model"):
                model_name = str(llm_section["model"]).lower()
            elif call.agent_config_snapshot.get("model"):
                model_name = str(call.agent_config_snapshot.get("model")).lower()

            # Voice model detection
            voice_section = call.agent_config_snapshot.get("voice")
            if isinstance(voice_section, dict):
                voice_id = str(voice_section.get("voice") or voice_section.get("model_id") or "flux-hannah-en").lower()
                voice_provider = str(voice_section.get("provider") or "deepgram").lower()
            elif call.agent_config_snapshot.get("voice"):
                voice_id = str(call.agent_config_snapshot.get("voice")).lower()

        # Match LLM rates
        rates = LLM_RATES_PER_1K.get(model_name, LLM_RATES_PER_1K["default"])
        llm_input_cost = (input_tokens / 1000.0) * rates["input"]
        llm_output_cost = (output_tokens / 1000.0) * rates["output"]
        llm_cost = llm_input_cost + llm_output_cost

        # 4. Multi-Model TTS Voice Synthesis Cost
        tts_rate = TTS_RATES_PER_1K["default"]
        if voice_provider in ["cartesia", "sonic"] or ("-" in voice_id and len(voice_id) == 36 and not voice_id.startswith("flux-") and not voice_id.startswith("aura-")):
            tts_rate = TTS_RATES_PER_1K["cartesia"]
        elif voice_id.startswith("aura-2-") or "aura-2" in voice_id:
            tts_rate = TTS_RATES_PER_1K["aura-2"]
        elif voice_id.startswith("aura-") or "aura" in voice_id:
            tts_rate = TTS_RATES_PER_1K["aura"]
        elif voice_id.startswith("flux-") or "flux" in voice_id:
            tts_rate = TTS_RATES_PER_1K["flux"]

        tts_cost = (tts_characters / 1000.0) * tts_rate

        # Total Cost to platform
        total_cost = telephony_cost + stt_cost + llm_cost + tts_cost

        # Suggested billable charge to tenant
        suggested_billed = total_cost * DEFAULT_BILLING_MARKUP

        return {
            "call_id": call.id,
            "organization_id": call.organization_id,
            "model_name": model_name,
            "voice_id": voice_id,
            "tts_rate_per_1k": tts_rate,
            "duration_seconds": duration_sec,
            "billed_minutes": minutes_billed,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "tts_characters": tts_characters,
            "telephony_cost": round(telephony_cost, 5),
            "stt_cost": round(stt_cost, 5),
            "llm_cost": round(llm_cost, 5),
            "tts_cost": round(tts_cost, 5),
            "total_cost": round(total_cost, 4),
            "suggested_billed": round(suggested_billed, 4),
            "margin": round(suggested_billed - total_cost, 4),
        }

    @classmethod
    def aggregate_organization_usage(
        cls,
        calls: List[Call],
        organizations: List[Dict[str, Any]],
        markup_multiplier: float = DEFAULT_BILLING_MARKUP
    ) -> Dict[str, Any]:
        """
        Aggregates usage, token breakdown, and cost margins for all organizations.
        """
        org_map = {org["organization_id"]: org for org in organizations}
        aggregates_by_org: Dict[str, Dict[str, Any]] = {}
        model_usage_breakdown: Dict[str, Dict[str, Any]] = {}
        voice_usage_breakdown: Dict[str, Dict[str, Any]] = {}

        # Initialize empty stats for known organizations
        for org_id, org_data in org_map.items():
            aggregates_by_org[org_id] = {
                "organization_id": org_id,
                "org_name": org_data.get("org_name", org_id),
                "is_active": org_data.get("is_active", True),
                "total_calls": 0,
                "completed_calls": 0,
                "failed_calls": 0,
                "duration_seconds": 0,
                "billed_minutes": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "tts_characters": 0,
                "telephony_cost": 0.0,
                "stt_cost": 0.0,
                "llm_cost": 0.0,
                "tts_cost": 0.0,
                "total_cost": 0.0,
                "suggested_billed": 0.0,
                "margin": 0.0,
                "model_usage": {},
            }

        # Sum per-call metrics (Strictly for registered dashboard organizations)
        for call in calls:
            org_id = call.organization_id or ""
            # Only track organizations that actually exist in the platform directory
            if org_id not in aggregates_by_org:
                continue

            metrics = cls.calculate_call_costs(call)
            target = aggregates_by_org[org_id]

            target["total_calls"] += 1
            if call.status in ["completed", "answered"]:
                target["completed_calls"] += 1
            elif call.status in ["failed", "busy", "no-answer"]:
                target["failed_calls"] += 1

            target["duration_seconds"] += metrics["duration_seconds"]
            target["billed_minutes"] += metrics["billed_minutes"]
            target["input_tokens"] += metrics["input_tokens"]
            target["output_tokens"] += metrics["output_tokens"]
            target["total_tokens"] += metrics["total_tokens"]
            target["tts_characters"] += metrics["tts_characters"]
            target["telephony_cost"] += metrics["telephony_cost"]
            target["stt_cost"] += metrics["stt_cost"]
            target["llm_cost"] += metrics["llm_cost"]
            target["tts_cost"] += metrics["tts_cost"]
            target["total_cost"] += metrics["total_cost"]

            # Per-organization model breakdown
            m_name = metrics["model_name"]
            if m_name not in target["model_usage"]:
                target["model_usage"][m_name] = {
                    "model": m_name,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "cost": 0.0,
                    "calls_count": 0,
                }
            target["model_usage"][m_name]["input_tokens"] += metrics["input_tokens"]
            target["model_usage"][m_name]["output_tokens"] += metrics["output_tokens"]
            target["model_usage"][m_name]["total_tokens"] += metrics["total_tokens"]
            target["model_usage"][m_name]["cost"] = round(target["model_usage"][m_name]["cost"] + metrics["llm_cost"], 5)
            target["model_usage"][m_name]["calls_count"] += 1

            # Platform-wide LLM model aggregation
            if m_name not in model_usage_breakdown:
                model_usage_breakdown[m_name] = {
                    "model": m_name,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "cost": 0.0,
                    "calls_count": 0,
                }
            model_usage_breakdown[m_name]["input_tokens"] += metrics["input_tokens"]
            model_usage_breakdown[m_name]["output_tokens"] += metrics["output_tokens"]
            model_usage_breakdown[m_name]["total_tokens"] += metrics["total_tokens"]
            model_usage_breakdown[m_name]["cost"] = round(model_usage_breakdown[m_name]["cost"] + metrics["llm_cost"], 4)
            model_usage_breakdown[m_name]["calls_count"] += 1

            # Platform-wide Voice / TTS model aggregation
            # Group identical voice engine models (e.g. all Sonic voices share the same engine & rate)
            raw_v_id = metrics["voice_id"]
            if metrics["tts_rate_per_1k"] == TTS_RATES_PER_1K["cartesia"] or len(raw_v_id) == 36 and "-" in raw_v_id:
                group_key = "Sonic (Ultra-Low Latency)"
                display_label = "Sonic Voice Model"
            elif raw_v_id.startswith("flux-") or "flux" in raw_v_id:
                group_key = "Flux (Conversation-Native)"
                display_label = "Flux Voice Model"
            elif raw_v_id.startswith("aura-2-") or "aura-2" in raw_v_id:
                group_key = "Aura Multilingual"
                display_label = "Aura Multilingual Model"
            elif raw_v_id.startswith("aura-") or "aura" in raw_v_id:
                group_key = "Aura Standard"
                display_label = "Aura Standard Model"
            else:
                group_key = raw_v_id
                display_label = raw_v_id

            if group_key not in voice_usage_breakdown:
                voice_usage_breakdown[group_key] = {
                    "voice": group_key,
                    "display_name": display_label,
                    "rate_per_1k": metrics["tts_rate_per_1k"],
                    "characters": 0,
                    "cost": 0.0,
                    "calls_count": 0,
                }
            voice_usage_breakdown[group_key]["characters"] += metrics["tts_characters"]
            voice_usage_breakdown[group_key]["cost"] = round(voice_usage_breakdown[group_key]["cost"] + metrics["tts_cost"], 4)
            voice_usage_breakdown[group_key]["calls_count"] += 1

        # Calculate final billed and margins
        total_platform_calls = 0
        total_platform_seconds = 0
        total_platform_tokens = 0
        total_platform_cost = 0.0
        total_suggested_revenue = 0.0
        total_telephony_cost = 0.0
        total_stt_cost = 0.0
        total_llm_cost = 0.0
        total_tts_cost = 0.0

        org_list = []
        for org in aggregates_by_org.values():
            tot_c = org["total_cost"]
            sug_b = tot_c * markup_multiplier
            org["telephony_cost"] = round(org["telephony_cost"], 4)
            org["stt_cost"] = round(org["stt_cost"], 4)
            org["llm_cost"] = round(org["llm_cost"], 4)
            org["tts_cost"] = round(org["tts_cost"], 4)
            org["total_cost"] = round(tot_c, 4)
            org["suggested_billed"] = round(sug_b, 4)
            org["margin"] = round(sug_b - tot_c, 4)

            total_platform_calls += org["total_calls"]
            total_platform_seconds += org["duration_seconds"]
            total_platform_tokens += org["total_tokens"]
            total_platform_cost += tot_c
            total_suggested_revenue += sug_b
            total_telephony_cost += org["telephony_cost"]
            total_stt_cost += org["stt_cost"]
            total_llm_cost += org["llm_cost"]
            total_tts_cost += org["tts_cost"]

            org_list.append(org)

        # Sort orgs by total spend descending
        org_list.sort(key=lambda x: x["total_cost"], reverse=True)

        # Convert breakdown dictionaries to sorted lists
        models_list = list(model_usage_breakdown.values())
        models_list.sort(key=lambda x: x["total_tokens"], reverse=True)

        voices_list = list(voice_usage_breakdown.values())
        voices_list.sort(key=lambda x: x["characters"], reverse=True)

        return {
            "summary": {
                "total_organizations": len(org_list),
                "total_calls": total_platform_calls,
                "total_duration_minutes": round(total_platform_seconds / 60.0, 1),
                "total_tokens": total_platform_tokens,
                "total_infrastructure_cost": round(total_platform_cost, 4),
                "suggested_client_revenue": round(total_suggested_revenue, 4),
                "projected_gross_profit": round(total_suggested_revenue - total_platform_cost, 4),
                "gross_margin_percentage": round(
                    ((total_suggested_revenue - total_platform_cost) / total_suggested_revenue * 100.0)
                    if total_suggested_revenue > 0 else 0.0, 1
                ),
                "cost_by_service": {
                    "telephony": round(total_telephony_cost, 4),
                    "stt": round(total_stt_cost, 4),
                    "llm": round(total_llm_cost, 4),
                    "tts": round(total_tts_cost, 4),
                },
                "pricing_rates": {
                    "telephony_per_min": TELEPHONY_COST_PER_MINUTE,
                    "stt_per_min": STT_COST_PER_MINUTE,
                    "tts_rates_per_1k": TTS_RATES_PER_1K,
                    "llm_rates_per_1k": LLM_RATES_PER_1K,
                    "markup_multiplier": markup_multiplier
                },
                "models_usage": models_list,
                "voices_usage": voices_list,
            },
            "organizations": org_list
        }
