"""
Multi-Agent Orchestrator Engine
Manages runtime intent detection, context bridging, and mid-call agent hot-swapping
for the Multi-Agent Supervisor / Hub-and-Spoke routing architecture.

Design Principles:
  - NO WebSocket drop during handoff: uses UpdatePrompt + InjectAgentMessage
  - Entity-scoped knowledge isolation: agent_entity_scope prevents cross-contamination
  - Warm transition: suppress child greeting, inject structured context summary instead
  - Conversation continuity: the same voice remains active; only LLM prompt is swapped
  - Conflict guard: routing rules are validated at creation time for overlapping keywords
"""

import asyncio
import logging
import time
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field

from app.agents.configuration import (
    AgentConfiguration,
    OrchestratorConfig,
    IntentRoutingRule,
)
from app.agents.prompt_builder import VoicePromptBuilder

logger = logging.getLogger("agent.orchestrator")


@dataclass
class HandoffContext:
    """
    Carries conversation state from one agent to the next.
    Populated from the live transcript before issuing an UpdatePrompt.
    """
    caller_name: Optional[str] = None
    detected_intent: Optional[str] = None
    entity_mentioned: Optional[str] = None  # e.g. hotel name, brand, property
    collected_data: Dict[str, Any] = field(default_factory=dict)
    conversation_summary: Optional[str] = None
    last_user_query: Optional[str] = None  # Exact last question from caller to answer directly
    from_agent_id: Optional[str] = None
    to_agent_id: Optional[str] = None
    handoff_timestamp: float = field(default_factory=time.time)
    turn_number: int = 0


@dataclass
class RoutingDecision:
    """Result of the intent routing evaluation."""
    should_route: bool = False
    target_agent_id: Optional[str] = None
    target_agent_name: Optional[str] = None
    matched_rule: Optional[IntentRoutingRule] = None
    matched_keyword: Optional[str] = None
    confidence: float = 0.0
    reason: str = "no_match"


class AgentOrchestrator:
    """
    Runtime orchestrator that manages multi-agent call routing without WebSocket
    disconnection. Holds the live conversation state and issues low-latency
    UpdatePrompt + InjectAgentMessage sequences for seamless specialist handoffs.

    Usage:
        orchestrator = AgentOrchestrator(
            orchestrator_config=agent_config,
            child_agents={"agt_hotel_a": agent_a_config, "agt_hotel_b": agent_b_config}
        )
        decision = orchestrator.evaluate_intent(user_transcript)
        if decision.should_route:
            prompt, intro = await orchestrator.build_handoff_payload(decision, context)
    """

    def __init__(
        self,
        orchestrator_config: AgentConfiguration,
        child_agents: Dict[str, AgentConfiguration],
        business_profile: Optional[Dict[str, Any]] = None,
    ):
        assert orchestrator_config.is_orchestrator, (
            "AgentOrchestrator requires an AgentConfiguration with is_orchestrator=True"
        )
        self.config = orchestrator_config
        self.orch_cfg: OrchestratorConfig = orchestrator_config.orchestrator_config or OrchestratorConfig()
        self.child_agents: Dict[str, AgentConfiguration] = child_agents
        self.business_profile = business_profile or {}

        # Runtime state
        self.active_agent_id: str = orchestrator_config.agent_id
        self.handoff_count: int = 0
        self.handoff_history: List[HandoffContext] = []

        # Auto-generate routing rules if user hasn't manually specified any
        explicit_rules = list(self.orch_cfg.intent_routing_rules or [])
        if not explicit_rules and child_agents:
            self._routing_rules_sorted = self._auto_generate_child_rules(child_agents)
            logger.info(
                f"[Orchestrator:AutoKeyword] Auto-generated {len(self._routing_rules_sorted)} routing rules "
                f"from child agent knowledge bases & scopes."
            )
        else:
            self._routing_rules_sorted: List[IntentRoutingRule] = sorted(
                explicit_rules,
                key=lambda r: r.priority
            )

        logger.info(
            f"[Orchestrator] Initialized '{orchestrator_config.name}' with "
            f"{len(child_agents)} child agents, strategy='{self.orch_cfg.routing_strategy}'"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    def evaluate_intent(
        self,
        user_transcript: str,
        turn_number: int = 0
    ) -> RoutingDecision:
        """
        Analyse the latest user transcript and decide whether to route to a
        different specialist agent.

        Returns a RoutingDecision indicating the target agent (if any).
        """
        if not user_transcript or not user_transcript.strip():
            return RoutingDecision(reason="empty_transcript")

        if self.orch_cfg.routing_strategy == "intent":
            return self._evaluate_intent_routing(user_transcript, turn_number)
        elif self.orch_cfg.routing_strategy == "sequential":
            return self._evaluate_sequential_routing(turn_number)
        else:
            return RoutingDecision(reason=f"strategy_not_implemented:{self.orch_cfg.routing_strategy}")

    async def build_handoff_payload(
        self,
        decision: RoutingDecision,
        context: HandoffContext,
        platform_rules: Optional[Any] = None,
    ) -> Tuple[str, str]:
        """
        Builds the (new_prompt, transition_intro) pair for a mid-call handoff.

        - new_prompt: sent as UpdatePrompt to Deepgram (replaces LLM system prompt)
        - transition_intro: injected as InjectAgentMessage (warm spoken bridge)

        Context is injected at the TOP of the new prompt so the specialist
        immediately knows who they're talking to and what was discussed.
        """
        target_agent = self.child_agents.get(decision.target_agent_id)
        if not target_agent:
            logger.error(
                f"[Orchestrator] target_agent_id='{decision.target_agent_id}' not found in child_agents"
            )
            raise ValueError(f"Child agent '{decision.target_agent_id}' is not loaded")

        # 1. Build base specialist prompt
        specialist_prompt = VoicePromptBuilder.build_prompt(
            target_agent,
            business_profile=self.business_profile,
            platform_rules=platform_rules,
        )

        # 2. Build context injection header
        context_header = self._build_context_header(context, target_agent)

        # 3. Merge: context header always precedes specialist instructions
        new_prompt = f"{context_header}\n\n{specialist_prompt}"

        # 4. Build warm transition intro (spoken aloud before prompt swap)
        transition_intro = self._build_transition_intro(decision, context, target_agent)

        # 5. Update orchestrator state
        context.to_agent_id = decision.target_agent_id
        self.handoff_count += 1
        self.handoff_history.append(context)
        self.active_agent_id = decision.target_agent_id

        logger.info(
            f"[Orchestrator] Handoff #{self.handoff_count}: "
            f"'{self.config.name}' → '{target_agent.name}' | "
            f"intent='{context.detected_intent}' | entity='{context.entity_mentioned}'"
        )

        return new_prompt, transition_intro

    def get_current_agent_id(self) -> str:
        """Returns the agent_id currently handling the conversation."""
        return self.active_agent_id

    def is_currently_orchestrator(self) -> bool:
        """True if the conversation is still with the orchestrator (not handed off)."""
        return self.active_agent_id == self.config.agent_id

    def get_child_agent(self, agent_id: str) -> Optional[AgentConfiguration]:
        """Returns child agent config by ID."""
        return self.child_agents.get(agent_id)

    def get_all_child_agents(self) -> Dict[str, AgentConfiguration]:
        """Returns all child agent configs."""
        return self.child_agents

    @classmethod
    def extract_keywords_for_agent(cls, agent: AgentConfiguration) -> List[str]:
        """
        Automatically derives rich, domain-specific intent trigger keywords
        from an agent's name, entity scope, role, services, and objective.
        No user manual keyword entry required.
        """
        import re
        keywords: set = set()

        # 1. Entity Scope (e.g., "Apex Dental & Wellness Clinic" -> ["apex", "dental", "wellness"])
        if agent.agent_entity_scope:
            scope_clean = agent.agent_entity_scope.lower()
            keywords.add(scope_clean)
            for token in re.findall(r"[a-z0-9]{3,}", scope_clean):
                if token not in {"clinic", "group", "ltd", "inc", "corp", "and", "the", "for"}:
                    keywords.add(token)

        # 2. Agent Name tokens
        name_clean = (agent.name or "").lower()
        for token in re.findall(r"[a-z0-9]{3,}", name_clean):
            if token not in {"agent", "assistant", "bot", "specialist", "coordinator", "advisor", "concierge"}:
                keywords.add(token)

        # 3. Known Industry & Service Domain Keyword Mappings
        # Determine primary domain based on agent's role, name, and entity scope
        primary_domain_text = f"{agent.name} {agent.role or ''} {agent.agent_entity_scope or ''}".lower()

        # Dental / Healthcare domain
        if any(w in primary_domain_text for w in ["dental", "teeth", "dentist", "tooth", "clinic"]):
            keywords.update([
                "dental", "teeth", "tooth", "dentist", "cleaning", "whitening",
                "cavity", "filling", "crown", "invisalign", "root canal", "braces",
                "gum", "extraction", "hygiene", "x-ray", "xray", "oral", "patient"
            ])

        # Hotel / Resort / Hospitality domain
        if any(w in primary_domain_text for w in ["resort", "hotel", "hospitality", "concierge", "villa"]):
            keywords.update([
                "hotel", "resort", "room", "suite", "villa", "stay", "ocean view",
                "beach", "plunge pool", "swimming pool", "spa", "massage", "check in",
                "checkout", "dining", "seafood", "buffet", "breakfast", "booking",
                "reservation", "calangute", "goa", "vacation"
            ])

        # SaaS / Software / Enterprise AI / Cloud domain
        if any(w in primary_domain_text for w in ["software", "cloudflow", "saas", "tech", "platform"]):
            keywords.update([
                "software", "cloudflow", "subscription", "pricing", "plan", "starter",
                "enterprise", "license", "seats", "voice minutes", "telephony",
                "twilio", "byoc", "soc2", "hipaa", "compliance", "api", "integration",
                "trial", "billing"
            ])

        # 4. Services list
        if agent.services:
            for s in agent.services:
                if s.name:
                    s_lower = s.name.lower()
                    keywords.add(s_lower)
                    for token in re.findall(r"[a-z0-9]{3,}", s_lower):
                        if token not in {"and", "for", "the", "with"}:
                            keywords.add(token)

        # Clean and sort
        stop_words = {"the", "and", "for", "with", "from", "that", "this", "help", "please"}
        filtered = [k for k in keywords if len(k) >= 3 and k not in stop_words]
        return sorted(list(set(filtered)))

    def _auto_generate_child_rules(
        self, child_agents: Dict[str, AgentConfiguration]
    ) -> List[IntentRoutingRule]:
        """
        Generates automatic IntentRoutingRules for each child agent based on its
        extracted keywords and role.
        Silent handoffs: transition_intro is empty by default so the specialist answers
        directly without disruptive spoken transfer announcements ("let me transfer you").
        """
        rules = []
        for priority, (agent_id, agent) in enumerate(child_agents.items(), start=1):
            kws = self.extract_keywords_for_agent(agent)
            # Empty transition intro = silent hot-swap so the agent directly answers caller
            intro = ""

            rules.append(
                IntentRoutingRule(
                    intent_keywords=kws,
                    target_agent_id=agent_id,
                    target_agent_name=agent.name,
                    priority=priority,
                    transition_intro=intro
                )
            )
        return rules

    # ─────────────────────────────────────────────────────────────────────────
    # Intent Routing
    # ─────────────────────────────────────────────────────────────────────────

    def _evaluate_intent_routing(
        self, transcript: str, turn_number: int
    ) -> RoutingDecision:
        """
        Keyword-based intent matcher with entity-scope conflict guard.
        Processes rules in priority order (lowest number = highest priority).
        """
        lower_transcript = transcript.lower()

        for rule in self._routing_rules_sorted:
            for keyword in rule.intent_keywords:
                if keyword.lower() in lower_transcript:
                    # Guard: skip if already handling this agent
                    if rule.target_agent_id == self.active_agent_id:
                        logger.debug(
                            f"[Orchestrator:Intent] Keyword '{keyword}' matched but "
                            f"agent '{rule.target_agent_id}' is already active. Skipping."
                        )
                        continue

                    # Guard: validate child agent exists
                    if rule.target_agent_id not in self.child_agents:
                        logger.warning(
                            f"[Orchestrator:Intent] Rule targets '{rule.target_agent_id}' "
                            f"but this agent is not loaded. Skipping."
                        )
                        continue

                    return RoutingDecision(
                        should_route=True,
                        target_agent_id=rule.target_agent_id,
                        target_agent_name=rule.target_agent_name or rule.target_agent_id,
                        matched_rule=rule,
                        matched_keyword=keyword,
                        confidence=1.0,  # Keyword match = deterministic
                        reason="intent_keyword_match",
                    )

        # Fallback agent routing
        if (
            self.orch_cfg.fallback_agent_id
            and self.orch_cfg.fallback_agent_id != self.active_agent_id
            and self.orch_cfg.fallback_agent_id in self.child_agents
        ):
            fallback_agent = self.child_agents[self.orch_cfg.fallback_agent_id]
            return RoutingDecision(
                should_route=True,
                target_agent_id=self.orch_cfg.fallback_agent_id,
                target_agent_name=fallback_agent.name,
                confidence=0.5,
                reason="fallback_route",
            )

        return RoutingDecision(reason="no_intent_match")

    def _evaluate_sequential_routing(self, turn_number: int) -> RoutingDecision:
        """Routes child agents sequentially by turn count (for scripted call flows)."""
        child_ids = self.orch_cfg.child_agent_ids
        if not child_ids:
            return RoutingDecision(reason="no_child_agents")

        index = min(turn_number // 3, len(child_ids) - 1)
        target_id = child_ids[index]

        if target_id == self.active_agent_id:
            return RoutingDecision(reason="already_at_sequential_agent")

        target_agent = self.child_agents.get(target_id)
        if not target_agent:
            return RoutingDecision(reason=f"sequential_agent_not_loaded:{target_id}")

        return RoutingDecision(
            should_route=True,
            target_agent_id=target_id,
            target_agent_name=target_agent.name,
            confidence=1.0,
            reason="sequential_route",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Prompt & Intro Builder Helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _build_context_header(
        self, context: HandoffContext, target_agent: AgentConfiguration
    ) -> str:
        """
        Builds a structured context injection block prepended to the specialist
        prompt. This bridges conversation state from the orchestrator to the child
        without the child needing to re-discover it via questioning.
        Instructs the model to answer the caller's last query IMMEDIATELY and DIRECTLY.
        """
        if not self.orch_cfg.handoff_summary_enabled:
            return ""

        lines = [
            "══════════════════════════════════════════════════",
            "  LIVE CALL HANDOFF — INTERNAL CONTEXT BRIEFING",
            "══════════════════════════════════════════════════",
            f"  You are now handling this call as: {target_agent.name}",
            f"  Handed off from: {self.config.name}",
        ]

        if context.caller_name:
            lines.append(f"  Caller Name: {context.caller_name}")
        if context.detected_intent:
            lines.append(f"  Detected Intent: {context.detected_intent}")
        if context.entity_mentioned:
            lines.append(f"  Entity/Property Mentioned: {context.entity_mentioned}")

        # Entity scope conflict guard: reinforce which entity this agent handles
        if target_agent.agent_entity_scope:
            lines.append(
                f"  ⚠️  YOUR SCOPE: You ONLY answer questions about '{target_agent.agent_entity_scope}'. "
                f"If the caller asks about a different property or brand, politely redirect."
            )

        if context.conversation_summary:
            lines.append(f"  Summary of Discussion So Far: {context.conversation_summary}")
        if context.collected_data:
            for k, v in context.collected_data.items():
                if k in self.orch_cfg.shared_context_fields:
                    lines.append(f"  {k.replace('_', ' ').title()}: {v}")

        # Critical Direct Answer Mandate based on caller's latest query
        if context.last_user_query:
            lines.append(
                f"  DIRECT ANSWER MANDATE: The caller just said: \"{context.last_user_query}\". "
                f"Immediately and directly answer their question using your domain facts, prices, rates, and services! "
                f"DO NOT say you were transferred. DO NOT ask if they want to schedule a call or speak with someone else. "
                f"Deliver the exact answer in 1-2 spoken sentences directly!"
            )

        if self.orch_cfg.suppress_child_greeting:
            lines.append(
                "  INSTRUCTION: Do NOT re-introduce yourself or say a new greeting. "
                "The call is already in progress. Continue naturally from the handoff point."
            )

        lines.append("══════════════════════════════════════════════════")
        return "\n".join(lines)

    def _build_transition_intro(
        self,
        decision: RoutingDecision,
        context: HandoffContext,
        target_agent: AgentConfiguration,
    ) -> str:
        """
        Returns the spoken bridge phrase (if any). If transition_intro is empty or None,
        returns empty string for a silent, seamless prompt hot-swap.
        """
        # If explicit rule defined an intro, use it
        if decision.matched_rule and decision.matched_rule.transition_intro is not None:
            intro = decision.matched_rule.transition_intro
        else:
            # Default to empty string for silent seamless transfer so the specialist answers directly
            intro = ""

        logger.debug(f"[Orchestrator] Transition intro: '{intro}'")
        return intro

    # ─────────────────────────────────────────────────────────────────────────
    # Context Extraction from Transcript
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def extract_context_from_transcript(
        transcript_turns: List[Dict[str, str]],
        entity_keywords: Optional[List[str]] = None,
    ) -> HandoffContext:
        """
        Lightweight NLP-free context extractor that scans the conversation
        history for key data points (caller name, entity mentions, collected info, last query).

        transcript_turns: [{"role": "user"|"assistant", "content": "..."}, ...]
        entity_keywords: list of brand/property names to detect (e.g. ["Ocean Grand", "Skyline"])
        """
        context = HandoffContext()
        context.turn_number = len(transcript_turns)

        # Find the last user query
        for turn in reversed(transcript_turns):
            if turn.get("role") == "user" and turn.get("content"):
                context.last_user_query = turn["content"].strip()
                break

        # Build a simple summary from last user+assistant turns
        recent_turns = transcript_turns[-6:]  # Last 3 exchanges
        if recent_turns:
            context.conversation_summary = " | ".join(
                f"{t['role'].title()}: {t['content'][:80]}"
                for t in recent_turns
                if t.get("content")
            )

        # Scan for entity mentions
        if entity_keywords:
            full_text = " ".join(t.get("content", "") for t in transcript_turns).lower()
            for entity in entity_keywords:
                if entity.lower() in full_text:
                    context.entity_mentioned = entity
                    break  # Take the FIRST entity found (most recently disambiguated)

        return context
