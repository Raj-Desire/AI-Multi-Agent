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
from app.agents.spoken_text import to_spoken_text
from app.agents.schedule import resolve_agent_schedule

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
    # Phase 2 precision scoring fields
    runner_up_agent_id: Optional[str] = None
    runner_up_score: float = 0.0
    margin: float = 0.0
    matched_terms: List[str] = field(default_factory=list)
    scores: Dict[str, float] = field(default_factory=dict)


@dataclass
class HandoffPlan:
    """Prepared handoff plan ready to be dispatched and committed."""
    decision: RoutingDecision
    context: HandoffContext
    target_agent: AgentConfiguration
    handoff_prompt: str
    steady_state_prompt: str
    transition_intro: str
    role_switch_delta: str = ""


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
        self.turns_with_active_agent: int = 1

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

        # Precision Weighted Lexical Intent Router (<1 ms)
        from app.agents.intent_router import IntentRouter
        self.intent_router = IntentRouter(
            orchestrator_config=orchestrator_config,
            child_agents=child_agents,
            explicit_rules=self._routing_rules_sorted,
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

        self.last_turn_number = turn_number

        if self.orch_cfg.routing_strategy == "intent":
            decision = self._evaluate_intent_routing(user_transcript, turn_number)
            if not decision.should_route:
                self.turns_with_active_agent += 1
            return decision
        elif self.orch_cfg.routing_strategy == "sequential":
            decision = self._evaluate_sequential_routing(turn_number)
            if not decision.should_route:
                self.turns_with_active_agent += 1
            return decision
        else:
            return RoutingDecision(reason=f"strategy_not_implemented:{self.orch_cfg.routing_strategy}")

    def build_role_switch_delta(
        self,
        target_agent: AgentConfiguration,
        context: Optional[HandoffContext] = None,
    ) -> str:
        """
        Builds a compact ROLE-SWITCH delta (<= 2400 chars) for UpdatePrompt.
        Voice Engine runtime appends UpdatePrompt payloads rather than replacing them, so the
        delta changes persona/scope and adds facts while keeping the general rules above it.
        Facts are flattened into plain spoken sentences (see spoken_text.to_spoken_text).
        """
        name = target_agent.name or "Specialist"

        # Returning to the supervisor: its full prompt is already the base of the
        # appended prompt stack, so only revoke the specialist persona.
        if target_agent.agent_id == self.config.agent_id:
            return (
                f"[ROLE UPDATE] You are again {name}, the original role described at the start of these "
                f"instructions. Specialist role updates added after it no longer apply, including their "
                f"timezone, current time and operating hours: use the organization's timezone and hours stated "
                f"at the start again. All general call, safety and speaking-style rules still apply. Do not "
                f"greet again or mention a transfer; answer the caller's latest question directly."
            )

        scope = target_agent.agent_entity_scope or target_agent.role or "specialist support"

        # Facts are written as plain sentences: list/markdown formatting here gets mirrored
        # by the LLM and read aloud by TTS ("star star Deluxe Suite").
        facts: List[str] = []
        if target_agent.objective:
            facts.append(f"Your goal: {target_agent.objective[:200].rstrip('.')}.")
        if target_agent.services:
            for s in target_agent.services[:8]:
                s_name = s.name if hasattr(s, "name") else str(s)
                if not s_name:
                    continue
                s_price = getattr(s, "price", None)
                s_desc = (getattr(s, "description", "") or "")[:160]
                sentence = f"{s_name}"
                if s_price:
                    sentence += f" costs {s_price}"
                if s_desc:
                    sentence += f": {s_desc}"
                facts.append(sentence.rstrip(".") + ".")
        knowledge = getattr(target_agent, "custom_knowledge", None) or target_agent.system_prompt
        if knowledge:
            facts.append(f"Reference facts: {knowledge[:900]}")

        facts_text = to_spoken_text(" ".join(facts)) if facts else (target_agent.description or "specialist support")

        # The appended-to base prompt carries the supervisor's (organization's) clock and hours;
        # this specialist may be a business in another city/timezone with different hours.
        schedule = resolve_agent_schedule(target_agent, self.business_profile)
        schedule_text = (
            f"Schedule for {schedule.business_name}: timezone {schedule.timezone_label}; it is now "
            f"{schedule.local_moment_text()} there; hours: {schedule.hours_sentence()} This replaces the "
            f"timezone, current time and operating hours stated earlier in these instructions for every "
            f"appointment you offer or confirm."
        )

        # Hard cap keeps each appended delta small (UpdatePrompt appends, never replaces)
        return (
            f"[ROLE UPDATE] From now on you are {name}, handling {scope}. This replaces any earlier "
            f"persona, role or scope update. All general call, safety and speaking-style rules above still apply. "
            f"Do not greet again or mention a transfer; answer the caller's latest question directly. "
            f"Quote only prices and details stated in these facts, in plain spoken sentences with no lists, "
            f"numbering or symbols. {schedule_text} Facts: {facts_text}"
        )[:2400]

    def prepare_handoff(
        self,
        decision: RoutingDecision,
        context: HandoffContext,
        platform_rules: Optional[Any] = None,
    ) -> HandoffPlan:
        """
        Pure function: builds the specialist prompt, context blocks, and transition intro.
        Does NOT mutate orchestrator state (active_agent_id, handoff_count, handoff_history).

        ORDER: Static specialist prompt FIRST, dynamic handoff block LAST
        (allows LLM prompt prefix caching of >=1024 tokens).
        """
        target_agent = self.child_agents.get(decision.target_agent_id)
        if not target_agent and decision.target_agent_id == self.config.agent_id:
            # Routing back to the supervisor node
            target_agent = self.config

        if not target_agent:
            logger.error(
                f"[Orchestrator] target_agent_id='{decision.target_agent_id}' not found in child_agents or supervisor"
            )
            raise ValueError(f"Target agent '{decision.target_agent_id}' is not loaded")

        if platform_rules is None:
            try:
                from app.repositories.platform_rules_repository import PlatformRulesRepository
                platform_rules = PlatformRulesRepository.get_active_rule_directives_sync()
            except Exception:
                platform_rules = []

        if getattr(context, "turn_number", 0) == 0 and hasattr(self, "last_turn_number"):
            context.turn_number = self.last_turn_number

        # 1. Build base specialist prompt (static prefix)
        specialist_prompt = VoicePromptBuilder.build_prompt(
            target_agent,
            business_profile=self.business_profile,
            platform_rules=platform_rules,
        )

        # 2. Build handoff-turn dynamic context block (one turn only)
        handoff_context_block = self._build_context_header(
            context, target_agent, is_handoff_turn=True
        )

        # 3. Build steady-state context block (for subsequent turns after handoff)
        steady_state_context_block = self._build_context_header(
            context, target_agent, is_handoff_turn=False
        )

        # 4. ORDER: static specialist prompt FIRST, dynamic block LAST
        # (reusing prefix cache for OpenAI/Groq >=1024 tokens)
        handoff_prompt = (
            f"{specialist_prompt}\n\n{handoff_context_block}".strip()
            if handoff_context_block
            else specialist_prompt
        )
        steady_state_prompt = (
            f"{specialist_prompt}\n\n{steady_state_context_block}".strip()
            if steady_state_context_block
            else specialist_prompt
        )

        # 5. Build warm transition intro (spoken aloud before prompt swap, if configured)
        transition_intro = self._build_transition_intro(decision, context, target_agent)

        # 6. Build compact ROLE-SWITCH delta for non-proxy UpdatePrompt path (<= 400 tokens)
        role_switch_delta = self.build_role_switch_delta(target_agent, context)

        return HandoffPlan(
            decision=decision,
            context=context,
            target_agent=target_agent,
            handoff_prompt=handoff_prompt,
            steady_state_prompt=steady_state_prompt,
            transition_intro=transition_intro,
            role_switch_delta=role_switch_delta,
        )

    def commit_handoff(self, plan: HandoffPlan) -> None:
        """
        Commits the prepared handoff plan to orchestrator runtime state.
        Only called AFTER the prompt update has been successfully acknowledged.
        """
        plan.context.to_agent_id = plan.decision.target_agent_id
        if hasattr(self, "last_turn_number") and getattr(plan.context, "turn_number", 0) == 0:
            plan.context.turn_number = self.last_turn_number
        self.handoff_count += 1
        self.handoff_history.append(plan.context)
        self.active_agent_id = plan.decision.target_agent_id
        self.turns_with_active_agent = 0

        logger.info(
            f"[Orchestrator] Handoff #{self.handoff_count} committed: "
            f"'{self.config.name}' → '{plan.target_agent.name}' | "
            f"intent='{plan.context.detected_intent}' | entity='{plan.context.entity_mentioned}'"
        )

    async def build_handoff_payload(
        self,
        decision: RoutingDecision,
        context: HandoffContext,
        platform_rules: Optional[Any] = None,
    ) -> Tuple[str, str]:
        """
        Deprecated wrapper around prepare_handoff + commit_handoff.
        Maintained for backwards compatibility.
        """
        plan = self.prepare_handoff(decision, context, platform_rules=platform_rules)
        self.commit_handoff(plan)
        return plan.handoff_prompt, plan.transition_intro

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
        from an agent's name, entity scope, role, services, intent_keywords, and example_utterances.
        Uses strict word-boundary matching and contains zero hardcoded demo terms.
        """
        import re
        from app.agents.intent_router import normalize_utterance
        keywords: set = set()

        # 1. Entity Scope (e.g. "Apex Dental & Wellness Clinic" -> "apex", "wellness")
        if agent.agent_entity_scope:
            scope_norm = normalize_utterance(agent.agent_entity_scope)
            if scope_norm:
                keywords.add(scope_norm)
                for token in scope_norm.split():
                    if len(token) >= 3 and token not in {"clinic", "group", "ltd", "inc", "corp", "and", "the", "for", "company"}:
                        keywords.add(token)

        # 2. Agent Name tokens
        name_norm = normalize_utterance(agent.name or "")
        for token in name_norm.split():
            if token not in {"agent", "assistant", "bot", "specialist", "coordinator", "advisor", "concierge"}:
                if len(token) >= 3:
                    keywords.add(token)

        # 3. Explicit intent_keywords & example_utterances from AgentConfiguration
        if getattr(agent, "intent_keywords", None):
            for kw in agent.intent_keywords:
                kw_norm = normalize_utterance(kw)
                if kw_norm:
                    keywords.add(kw_norm)

        if getattr(agent, "example_utterances", None):
            for utt in agent.example_utterances:
                utt_norm = normalize_utterance(utt)
                if utt_norm:
                    for token in utt_norm.split():
                        if len(token) >= 3 and token not in {"the", "and", "for", "with", "from", "that", "this", "help", "please", "can", "tell"}:
                            keywords.add(token)

        # 4. Services list: service names only (no description tokens)
        if agent.services:
            for s in agent.services:
                s_name = s.name if hasattr(s, "name") else str(s)
                if s_name:
                    s_norm = normalize_utterance(s_name)
                    if s_norm:
                        keywords.add(s_norm)
                        for token in s_norm.split():
                            if len(token) >= 3 and token not in {"and", "for", "the", "with"}:
                                keywords.add(token)

        # 5. Domain vocabulary enrichment using STRICT WORD BOUNDARY matching (no loose substrings)
        meta_text = normalize_utterance(f"{agent.name} {agent.role or ''} {agent.objective or ''} {agent.agent_entity_scope or ''}")

        # Strong Dental Signal: requires explicit dental/dentist/tooth/orthodontic word boundary
        if re.search(r'\b(?:dental|dentist|teeth|tooth|orthodontic|oral\s+care)\b', meta_text):
            keywords.update([
                "dental", "teeth", "tooth", "dentist", "cleaning", "whitening",
                "cavity", "filling", "crown", "invisalign", "root canal", "braces",
                "hygiene", "oral exam", "dentistry"
            ])

        # Strong Hospitality / Resort / Lodging Signal: requires explicit hotel/resort/villa/lodging word boundary
        if re.search(r'\b(?:resort|hotel|hospitality|motel|inn|villas?|lodging)\b', meta_text):
            keywords.update([
                "hotel", "resort", "room", "suite", "villa", "stay", "ocean view",
                "beach", "swimming pool", "spa", "massage", "check in", "checkout",
                "room reservation", "lodging"
            ])

        # Strong SaaS / Cloud Software Signal: requires explicit saas/software/platform word boundary
        if re.search(r'\b(?:saas|software|platform|cloud\s+computing|api\s+service)\b', meta_text):
            keywords.update([
                "software", "subscription", "pricing plan", "license",
                "api integration", "cloud service", "platform"
            ])

        # Clean and sort
        stop_words = {"the", "and", "for", "with", "from", "that", "this", "help", "please", "can", "tell"}
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

    def get_stt_keyterms(self, limit: int = 100) -> List[str]:
        """Returns deduplicated high-weight terms for voice engine STT keyterms boosting."""
        if hasattr(self, "intent_router") and self.intent_router:
            return self.intent_router.get_high_weight_keyterms(limit=limit)
        return []

    def _evaluate_intent_routing(
        self, transcript: str, turn_number: int
    ) -> RoutingDecision:
        """
        Sub-millisecond weighted lexical intent router.
        Evaluates clauses, rarity weights, stickiness, dwell time, and ping-pong guards.
        """
        router_res = self.intent_router.evaluate(
            user_transcript=transcript,
            active_agent_id=self.active_agent_id,
            turn_number=turn_number,
            turns_with_active_agent=self.turns_with_active_agent,
            handoff_history=self.handoff_history,
            handoff_count=self.handoff_count,
        )

        if router_res["should_route"]:
            matched_terms = router_res.get("matched_terms", [])
            first_kw = matched_terms[0] if matched_terms else None
            return RoutingDecision(
                should_route=True,
                target_agent_id=router_res["target_agent_id"],
                target_agent_name=router_res["target_agent_name"],
                matched_keyword=first_kw,
                confidence=router_res["confidence"],
                reason=router_res["reason"],
                runner_up_agent_id=router_res.get("runner_up_agent_id"),
                runner_up_score=router_res.get("runner_up_score", 0.0),
                margin=router_res.get("margin", 0.0),
                matched_terms=matched_terms,
                scores=router_res.get("scores", {}),
            )

        # Fallback agent routing (only allowed while supervisor is active)
        if (
            self.is_currently_orchestrator()
            and self.orch_cfg.fallback_agent_id
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
                scores=router_res.get("scores", {}),
            )

        return RoutingDecision(
            should_route=False,
            reason=router_res["reason"],
            target_agent_id=self.active_agent_id,
            target_agent_name=router_res.get("target_agent_name", self.active_agent_id),
            confidence=router_res["confidence"],
            margin=router_res["margin"],
            runner_up_agent_id=router_res.get("runner_up_agent_id"),
            runner_up_score=router_res.get("runner_up_score", 0.0),
            matched_terms=router_res.get("matched_terms", []),
            scores=router_res.get("scores", {}),
        )

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
        self,
        context: HandoffContext,
        target_agent: AgentConfiguration,
        is_handoff_turn: bool = True,
    ) -> str:
        """
        Builds a structured context injection block placed at the end of the specialist prompt.
        When is_handoff_turn=True, includes the positive direct answering instruction and worked examples.
        When is_handoff_turn=False, includes steady-state context only (omitting handoff-turn imperatives).
        """
        if not self.orch_cfg.handoff_summary_enabled:
            return ""

        lines = [
            "══════════════════════════════════════════════════",
            "  LIVE CALL HANDOFF — INTERNAL CONTEXT BRIEFING",
            "══════════════════════════════════════════════════",
            f"  Active Specialist: {target_agent.name}",
            f"  Transferred from: {self.config.name}",
        ]

        if context.caller_name:
            lines.append(f"  Caller Name: {context.caller_name}")
        if context.entity_mentioned:
            lines.append(f"  Entity/Property: {context.entity_mentioned}")
        if context.detected_intent:
            lines.append(f"  Detected Intent: {context.detected_intent}")

        # Entity scope conflict guard: reinforce which entity this agent handles
        if target_agent.agent_entity_scope:
            lines.append(
                f"  YOUR SCOPE: You answer questions about '{target_agent.agent_entity_scope}'. "
                f"If the caller asks about something outside it, say briefly that you'll get those details "
                f"for them; never refer them to an email address, website or another team."
            )

        # Structured fields from collected data
        if context.collected_data:
            for k, v in context.collected_data.items():
                if k in self.orch_cfg.shared_context_fields:
                    lines.append(f"  {k.replace('_', ' ').title()}: {v}")

        if is_handoff_turn:
            lines.append(
                "  DIRECT ANSWER INSTRUCTION: Answer the caller's most recent question directly "
                "using the facts above, in 1–2 spoken sentences. Continue the conversation naturally; "
                "do not greet or mention a transfer."
            )

            # Worked example exchanges generated from the specialist's own services (name + price only)
            worked_examples = []
            if target_agent.services:
                for s in target_agent.services[:2]:
                    s_name = s.name if hasattr(s, "name") else str(s)
                    s_price = getattr(s, "price", None)
                    if s_name and s_price:
                        worked_examples.append(
                            f'    Caller: "How much is {s_name}?"\n'
                            f'    Assistant: "{s_name} is {s_price}."'
                        )
            if worked_examples:
                lines.append("  WORKED EXAMPLES:\n" + "\n\n".join(worked_examples))

        if self.orch_cfg.suppress_child_greeting and is_handoff_turn:
            lines.append(
                "  CONTINUITY: Do NOT re-introduce yourself or say a new greeting. "
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

        # Scan for entity mentions: pick the entity mentioned most recently in the transcript
        if entity_keywords:
            for turn in reversed(transcript_turns):
                content = (turn.get("content") or "").lower()
                matches = []
                for entity in entity_keywords:
                    pos = content.rfind(entity.lower())
                    if pos != -1:
                        matches.append((pos, entity))
                if matches:
                    matches.sort(key=lambda m: m[0], reverse=True)
                    context.entity_mentioned = matches[0][1]
                    break

        return context
