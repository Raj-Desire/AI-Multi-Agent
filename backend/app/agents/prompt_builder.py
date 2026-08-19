"""
Voice Prompt Builder
Constructs phone-optimized, human-grade conversational prompts that strictly enforce
spoken cadence, response length limits (1-2 sentences), personality sliders,
active listening confirmations, psychological empathy, and guardrails.
"""

from typing import Optional, List
from app.agents.configuration import AgentConfiguration


class VoicePromptBuilder:
    """Builds human-grade, voice-specific system prompts from an AgentConfiguration."""

    @staticmethod
    def _build_personality_instructions(config: AgentConfiguration) -> List[str]:
        p = config.personality
        directives = []

        # Professionalism (0-100)
        if p.professionalism >= 80:
            directives.append("Tone: Highly professional, articulate, and respectful business tone.")
        elif p.professionalism <= 40:
            directives.append("Tone: Casual, relaxed, and approachable peer-to-peer conversation.")
        else:
            directives.append("Tone: Balanced professional warmth.")

        # Friendliness (0-100)
        if p.friendliness >= 80:
            directives.append("Warmth: Warm, welcoming, and encouraging voice with polite conversational ease.")
        elif p.friendliness <= 40:
            directives.append("Warmth: Direct, neutral, and matter-of-fact.")

        # Empathy (0-100)
        if p.empathy >= 70:
            directives.append("Empathy: If the caller shares any hesitation, stress, or problem, express sincere understanding before answering.")

        # Patience (0-100)
        if p.patience >= 75:
            directives.append("Patience: Unhurried and calm. Never rush the caller or pressure them.")

        # Confidence (0-100)
        if p.confidence >= 80:
            directives.append("Confidence: Speak with calm authority, clear knowledge, and reassuring confidence.")

        # Energy (0-100)
        if p.energy >= 75:
            directives.append("Energy: Upbeat, dynamic, and lively conversational energy.")
        elif p.energy <= 40:
            directives.append("Energy: Grounded, soothing, and calm speaking pace.")

        # Assertiveness (0-100)
        if p.assertiveness >= 75:
            directives.append("Assertiveness: Proactively guide the conversation forward toward the concrete next step or appointment.")
        elif p.assertiveness <= 40:
            directives.append("Assertiveness: Gentle and receptive; let the caller lead the pace.")

        # Humor (0-100)
        if p.humor >= 60:
            directives.append("Humor: Light, friendly charm and appropriate humor when welcomed by the caller.")
        else:
            directives.append("Humor: Strictly serious and business-focused.")

        # Curiosity (0-100)
        if p.curiosity >= 70:
            directives.append("Curiosity: Show genuine interest in uncovering the caller's specific requirements.")

        return directives

    @staticmethod
    def _build_length_enforcement(response_length: Optional[str]) -> str:
        length_key = (response_length or "short").lower()
        if length_key == "short":
            return (
                "[MANDATORY SPOKEN LENGTH CONSTRAINT]\n"
                "- Response Length: STRICTLY 1 OR AT MOST 2 SHORT SPOKEN SENTENCES PER TURN (maximum 20-25 words total).\n"
                "- NEVER produce 3 or more sentences in a single turn.\n"
                "- NEVER give long explanations, monologues, or multiple paragraphs.\n"
                "- Ask only ONE single question at a time to allow the caller to respond."
            )
        elif length_key == "medium":
            return (
                "[SPOKEN LENGTH CONSTRAINT]\n"
                "- Response Length: 2 to 3 concise spoken sentences per turn (maximum 35-40 words total).\n"
                "- Ask only ONE single question at a time. Do not give monologues."
            )
        else:
            return (
                "[SPOKEN LENGTH CONSTRAINT]\n"
                "- Response Length: 3 to 4 concise sentences per turn.\n"
                "- Keep responses crisp and conversational for phone audio."
            )

    @staticmethod
    def build_prompt(config: AgentConfiguration) -> str:
        """
        Generates the complete, compiled spoken system prompt combining identity,
        mission, length enforcement, personality profile, and telephony audio rules.
        """
        length_rule = VoicePromptBuilder._build_length_enforcement(config.response_length)
        personality_directives = VoicePromptBuilder._build_personality_instructions(config)
        personality_text = "\n".join(f"- {d}" for d in personality_directives)

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

        compiled_prompt = f"""You are {config.name}, a genuine, warm, and highly capable {config.role} speaking on a live telephone call.

{length_rule}

{custom_instructions}

BEHAVIOR & PERSONALITY MATRIX:
- Communication Style: {config.communication_style}
- {small_talk_rule}
{personality_text}

CRITICAL SPOKEN TELEPHONY RULES (NEVER BREAK):
1. SPOKEN BREVITY: Strictly 1 to 2 short, natural spoken sentences per turn. Never give long speeches.
2. AUDIO FORMAT: NEVER use markdown, bullet points, numbers, asterisks, bold text, emojis, or code syntax. Speak everyday conversational English.
3. ACTIVE LISTENING: Always acknowledge what the customer just said (e.g. 'Got it,', 'That makes sense,', 'I understand,') before asking your next single question.
4. SINGLE QUESTION PER TURN: Ask only ONE clear question at a time so the conversation feels collaborative and natural.
5. CONVERSATION FLOW:
   - Positive response: Validate warmly and take the next step.
   - Objection / Hesitation: Empathize sincerely in one sentence and offer a simple alternative.
   - Polite wrap-up: Thank them genuinely and wish them a great day.

{guardrails_text}

REMINDER: Keep EVERY turn to STRICTLY 1 to 2 short sentences (under 25 words total). Ask only ONE question."""

        return compiled_prompt.strip()
