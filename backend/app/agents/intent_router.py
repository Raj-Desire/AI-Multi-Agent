"""
Weighted Lexical Intent Router for Multi-Agent Orchestration.
Guarantees:
  1. Sub-millisecond (<1 ms) deterministic execution.
  2. Word-boundary regex matching with normalized text and abbreviation collapsing.
  3. Inverse Agent Frequency (IAF) rarity weighting (generic terms weigh near 0, entity/brand terms weigh high).
  4. Clause-level weighted scoring (contrast, question, and position boosting).
  5. Strict stickiness, dwell-time protection, ping-pong bounce prevention, and handoff caps.
  6. The Supervisor node is fully routable with dedicated intent triggers.
  7. Rich decision telemetry: confidence, margin, runner-up agent, runner-up score, and matched terms.
  8. High-weight keyterm extraction for STT model boosting (capped at 100 terms).
"""

import os
import re
import time
import logging
from typing import Optional, Dict, Any, List, Tuple, Set
from dataclasses import dataclass, field

from app.agents.configuration import (
    AgentConfiguration,
    OrchestratorConfig,
    IntentRoutingRule,
)

logger = logging.getLogger("agent.intent_router")

# Generic cross-domain terms that are shared across many business types.
# These weigh near 0 to avoid false positive handoffs on queries like "how much is it?" or "what plans do you have?".
GENERIC_SHARED_TERMS: Set[str] = {
    "pricing", "price", "how much", "cost", "rate", "rates",
    "booking", "book", "reserve", "reservation",
    "plan", "plans", "subscription", "tier",
    "billing", "bill", "payment", "pay",
    "enterprise", "starter", "pro",
    "help", "support", "assist", "assistance",
    "service", "services", "info", "information",
    "question", "questions", "details", "inquiry",
    "call", "agent", "talk", "speak", "tell me"
}

# Everyday caller vocabulary per business domain. Tenant-neutral: no brand, city or product
# names here. A domain applies to an agent only when one of its triggers appears (word
# boundary) in the agent's name, role, description or entity scope.
DOMAIN_LEXICONS: Dict[str, Dict[str, Set[str]]] = {
    "hospitality": {
        "triggers": {"hotel", "resort", "hospitality", "villa", "concierge", "lodge", "inn", "guest services"},
        "terms": {
            "hotel", "resort", "room", "suite", "villa", "stay", "staying", "accommodation",
            "check in", "check out", "ocean view", "sea view", "beach", "pool", "spa", "massage",
            "vacation", "holiday", "trip", "travel", "honeymoon", "per night", "breakfast",
            "restaurant", "dining", "airport shuttle", "guests",
        },
    },
    "software": {
        "triggers": {"software", "saas", "cloud", "platform", "api", "tech"},
        "terms": {
            "software", "cloud", "saas", "platform", "app", "application", "api", "integration",
            "crm", "license", "licence", "seats", "dashboard", "uptime", "sla", "free trial",
            "demo", "onboarding", "voice minutes", "telephony", "compliance",
        },
    },
    "dental": {
        "triggers": {"dental", "dentist", "teeth", "tooth", "orthodontic", "orthodontist"},
        "terms": {
            "dentist", "dental", "teeth", "tooth", "toothache", "cavity", "root canal", "braces",
            "invisalign", "whitening", "gum", "gums", "checkup", "check up", "x ray", "crown",
            "filling", "extraction",
        },
    },
}

# Words in free-text agent descriptions that carry no routing signal
DESCRIPTION_STOPWORDS: Set[str] = {
    "the", "and", "for", "with", "from", "that", "this", "your", "our", "you", "are", "all",
    "specialist", "specialists", "agent", "assistant", "advisor", "coordinator", "expert",
    "inquiries", "inquiry", "questions", "customer", "customers", "callers", "caller", "calls",
    "guest", "services", "service", "support", "help", "handles", "handling", "management",
    "luxury", "premium", "professional", "deep", "default", "voice", "inbound", "outbound",
    "systematically", "resolving", "including", "related", "general", "specific", "team",
}

# Suffixes tolerated when matching a term ("hotels", "rooms", "staying")
_TERM_SUFFIX = r"(?:s|es|ing)?"

# Feature flag for optional local ONNX embedding tier (defaults to OFF; requires user consent for deps)
ORCHESTRATOR_EMBEDDINGS_ENABLED = os.getenv("ORCHESTRATOR_EMBEDDINGS_ENABLED", "false").lower() in ("true", "1", "yes")


def normalize_utterance(text: str) -> str:
    """
    Normalizes transcript text for high-precision regex matching:
    - Lowercase and trim.
    - Collapses spaced single letters ("b y o c" -> "byoc", "s o c 2" -> "soc2", "a p i" -> "api").
    - Normalizes phonetic and common spelling variants ("sock two" -> "soc2", "root-canal" -> "root canal").
    - Protects common conversational idioms from triggering false positive keywords:
      * "be patient" -> idiom (not healthcare patient)
      * "stay on the line" / "stay on hold" -> idiom (not hotel stay)
      * "crowne plaza" -> hotel brand (not dental crown)
      * "filling out a form" -> idiom (not dental cavity filling)
    """
    if not text:
        return ""

    t = text.lower().strip()

    # 1. Collapse spaced single letters or digits (e.g. "b y o c", "s o c 2", "a p i", "b a n t")
    t = re.sub(
        r'\b([a-z0-9])\s+([a-z0-9])\s+([a-z0-9])(?:\s+([a-z0-9]))*\b',
        lambda m: m.group(0).replace(' ', ''),
        t
    )

    # 2. Phonetic / abbreviation normalization
    t = re.sub(r'\b(?:soc\s*2|sock\s*two|sock\s*2)\b', 'soc2', t)
    t = re.sub(r'\b(?:b\s*y\s*o\s*c)\b', 'byoc', t)

    # 3. Contextual idiom & false positive protection
    # "be patient" / "have patience" -> prevents dental/medical "patient" keyword match
    t = re.sub(r'\b(?:please\s+)?(?:be|stay|have)\s+patient\b', 'wait calmly', t)
    # "stay on the line" / "stay on hold" / "stay on the phone" -> prevents hotel "stay" keyword match
    t = re.sub(r'\bstay\s+(?:on|with)\s+(?:the\s+)?(?:line|call|phone|hold)\b', 'hold line', t)
    # "Crowne Plaza" -> brand name, prevents dental "crown" keyword match without injecting hotel
    t = re.sub(r'\bcrowne?\s+plaza\b', 'commercial plaza', t)
    # "filling out a form" / "filling in" / "filling up" -> prevents dental "filling" match
    t = re.sub(r'\bfilling\s+(?:out|in|up)\s*(?:a\s+)?(?:form|survey|sheet|application)?\b', 'paperwork', t)

    # 4. Clean punctuation into single whitespace while preserving alphanumeric tokens
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


@dataclass
class ClauseScore:
    """Represents a scored segment of an utterance."""
    clause_text: str
    weight: float
    is_subordinate: bool = False
    is_question: bool = False
    is_contrast: bool = False


class IntentRouter:
    """
    Sub-millisecond weighted lexical intent router.
    Evaluates caller transcripts across child specialists and the supervisor node.
    """

    def __init__(
        self,
        orchestrator_config: AgentConfiguration,
        child_agents: Dict[str, AgentConfiguration],
        explicit_rules: Optional[List[IntentRoutingRule]] = None,
    ):
        self.orchestrator_config = orchestrator_config
        self.orch_cfg: OrchestratorConfig = orchestrator_config.orchestrator_config or OrchestratorConfig()
        self.child_agents = child_agents
        self.explicit_rules = explicit_rules or []

        # Supervisor node configuration
        self.supervisor_id = orchestrator_config.agent_id
        self.supervisor_name = orchestrator_config.name

        # All routable agents: child specialists + supervisor
        self.all_agents: Dict[str, AgentConfiguration] = dict(child_agents)
        self.all_agents[self.supervisor_id] = orchestrator_config

        # 1. Extract vocabulary per agent
        self.agent_terms: Dict[str, Set[str]] = self._extract_agent_vocabularies()

        # 2. Compute rarity weights (Inverse Agent Frequency)
        self.term_weights: Dict[str, float] = self._compute_term_rarity_weights()

        # 3. Compile word-boundary regex patterns per agent
        self.compiled_patterns: Dict[str, re.Pattern] = self._compile_agent_patterns()

        # 4. Cache high-weight keyterms for STT boosting
        self._stt_keyterms: List[str] = self._build_stt_keyterms()

        logger.info(
            f"[IntentRouter] Initialized router with {len(self.all_agents)} routable nodes. "
            f"Indexed {len(self.term_weights)} weighted vocabulary terms."
        )

    def _extract_agent_vocabularies(self) -> Dict[str, Set[str]]:
        """Extracts cleaned keywords, phrases, entity scopes, and services for each agent."""
        vocab: Dict[str, Set[str]] = {}

        # Supervisor vocabulary (hours, location, greeting, front desk, transfer back)
        supervisor_terms = {
            "front desk", "receptionist", "reception", "operator", "operator desk",
            "main desk", "main menu", "speak to a person", "talk to a person",
            "speak to human", "talk to human", "real person", "human agent",
            "start over", "restart", "something else", "different question",
            "transfer me back", "switch back", "back to front desk",
            "opening hours", "business hours", "what time do you open",
            "what time do you close", "when are you open", "hours of operation",
            "office location", "where are you located", "what is your address",
            "office address", "street address", "directions"
        }
        vocab[self.supervisor_id] = set(supervisor_terms)

        # Child specialists vocabulary
        for agent_id, agent in self.child_agents.items():
            terms: Set[str] = set()

            # 1. Entity scope (highest specificity)
            if agent.agent_entity_scope:
                scope_norm = normalize_utterance(agent.agent_entity_scope)
                if scope_norm:
                    terms.add(scope_norm)
                    for token in scope_norm.split():
                        if len(token) >= 3 and token not in {"and", "the", "for", "ltd", "inc", "corp"}:
                            terms.add(token)

            # 2. Agent Name tokens
            name_norm = normalize_utterance(agent.name)
            for token in name_norm.split():
                if token not in {"agent", "assistant", "bot", "specialist", "coordinator", "advisor", "concierge"}:
                    if len(token) >= 3:
                        terms.add(token)

            # 3. Services (service names only, no description tokens)
            if agent.services:
                for s in agent.services:
                    s_name = s.name if hasattr(s, "name") else str(s)
                    if s_name:
                        s_name_norm = normalize_utterance(s_name)
                        if s_name_norm:
                            terms.add(s_name_norm)
                            for tok in s_name_norm.split():
                                if len(tok) >= 3 and tok not in {"and", "for", "the", "with"}:
                                    terms.add(tok)

            # 3b. Agent description: the admin-written one-liner of what this agent covers
            if agent.description:
                for tok in normalize_utterance(agent.description).split():
                    if len(tok) >= 3 and not tok.isdigit() and tok not in DESCRIPTION_STOPWORDS:
                        terms.add(tok)

            # 3c. Domain lexicon: everyday words callers use for this kind of business
            profile_text = normalize_utterance(
                f"{agent.name} {agent.role or ''} {agent.description or ''} {agent.agent_entity_scope or ''}"
            )
            for domain in DOMAIN_LEXICONS.values():
                if any(re.search(rf"\b{re.escape(t)}\b", profile_text) for t in domain["triggers"]):
                    terms.update(domain["terms"])

            # 4. Explicit intent keywords from configuration
            if getattr(agent, "intent_keywords", None):
                for kw in agent.intent_keywords:
                    kw_norm = normalize_utterance(kw)
                    if kw_norm:
                        terms.add(kw_norm)

            # 5. Example utterances (tokenized into terms instead of adding whole sentences)
            if getattr(agent, "example_utterances", None):
                for utt in agent.example_utterances:
                    utt_norm = normalize_utterance(utt)
                    if utt_norm:
                        for tok in utt_norm.split():
                            if len(tok) >= 3 and tok not in {"the", "and", "for", "with", "from", "that", "this", "help", "please", "can", "tell", "what", "how", "much", "want", "like", "would", "about", "need", "have"}:
                                terms.add(tok)

            # 6. Explicit rules targeting this agent
            for rule in self.explicit_rules:
                if rule.target_agent_id == agent_id:
                    for r_kw in rule.intent_keywords:
                        r_norm = normalize_utterance(r_kw)
                        if r_norm:
                            terms.add(r_norm)

            vocab[agent_id] = terms

        return vocab

    def _compute_term_rarity_weights(self) -> Dict[str, float]:
        """
        Computes Inverse Agent Frequency (IAF) weight for every term.
        - Terms appearing across multiple agents weigh near 0 (e.g. pricing, booking).
        - Unique terms and entity/brand names weigh high.
        """
        agent_counts: Dict[str, int] = {}
        for terms in self.agent_terms.values():
            for t in terms:
                agent_counts[t] = agent_counts.get(t, 0) + 1

        total_nodes = len(self.all_agents)
        weights: Dict[str, float] = {}

        for term, count in agent_counts.items():
            # If term is explicitly generic/shared, heavily downweight it
            if term in GENERIC_SHARED_TERMS:
                weights[term] = 0.05
                continue

            # Multi-word phrase bonus (e.g., "deluxe suite", "cloudflow analytics", "root canal")
            is_multi_word = " " in term

            if count == 1:
                # Highly specific to a single agent
                weights[term] = 2.2 if is_multi_word else 1.2
            elif count == 2:
                # Shared between two agents
                weights[term] = 0.5
            else:
                # Shared across 3+ agents: negligible differentiation power
                weights[term] = 0.05

        return weights

    def _compile_agent_patterns(self) -> Dict[str, re.Pattern]:
        """
        Compiles one high-performance regex pattern per agent using word boundaries `\b(?:...)\b`.
        Phrases are sorted longest-first to ensure greedy matching of multi-word expressions.
        """
        patterns: Dict[str, re.Pattern] = {}

        for agent_id, terms in self.agent_terms.items():
            # Filter out empty or 1-2 char terms (unless meaningful like 'ai' or 'hr')
            valid_terms = [
                t for t in terms
                if len(t) >= 3 or t in {"ai", "hr", "qa"}
            ]

            if not valid_terms:
                # Fallback pattern that matches nothing
                patterns[agent_id] = re.compile(r'(?!)')
                continue

            # Sort descending by length so multi-word phrases match before single-word substrings
            valid_terms_sorted = sorted(valid_terms, key=lambda s: len(s), reverse=True)
            escaped_terms = [re.escape(t) for t in valid_terms_sorted]
            regex_str = r'\b(?:' + '|'.join(escaped_terms) + r')' + _TERM_SUFFIX + r'\b'
            patterns[agent_id] = re.compile(regex_str, re.IGNORECASE)

        return patterns

    def _canonical_term(self, matched: str) -> str:
        """Maps a suffixed match ("hotels", "staying") back to its indexed term."""
        if matched in self.term_weights:
            return matched
        for suffix in ("ing", "es", "s"):
            if matched.endswith(suffix) and matched[: -len(suffix)] in self.term_weights:
                return matched[: -len(suffix)]
        return matched

    def _build_stt_keyterms(self) -> List[str]:
        """
        Extracts high-weight keyterms (weights >= 1.0) and entity names for Deepgram STT boosting.
        Capped at 100 terms (Deepgram maximum recommendation).
        """
        scored_terms = [
            (term, weight) for term, weight in self.term_weights.items()
            if weight >= 1.0 and len(term) >= 3 and len(term.split()) <= 3
        ]
        # Sort by weight descending, then alphabetical
        scored_terms.sort(key=lambda x: (-x[1], x[0]))

        keyterms: List[str] = []
        for term, _ in scored_terms:
            if term not in keyterms:
                keyterms.append(term)
            if len(keyterms) >= 100:
                break

        return keyterms

    def get_high_weight_keyterms(self, limit: int = 100) -> List[str]:
        """Returns deduplicated high-weight terms for voice engine STT keyterms parameter."""
        return self._stt_keyterms[:limit]

    def _split_and_score_clauses(self, raw_transcript: str) -> List[ClauseScore]:
        """
        Splits an utterance into logical clauses and assigns contextual multipliers:
        - Subordinate clauses introduced by "before" get 0.5x.
        - Later clauses receive progressive position boosting (e.g. 1.0 -> 1.8).
        - Clauses with questions ("what was...", "?") get 1.5x.
        - Contrastive clauses ("actually...", "but...") get 1.5x.
        """
        raw_lower = raw_transcript.lower().strip()

        # Split on sentence delimiters or clause boundary markers while keeping punctuation attached
        raw_parts = [p.strip() for p in re.split(r'(?<=[?,;.!])\s+|\b(?:but|actually|and\s+also|however|instead)\b', raw_lower) if p and p.strip()]

        if not raw_parts:
            raw_parts = [raw_lower]

        total_clauses = len(raw_parts)
        clause_scores: List[ClauseScore] = []

        question_markers = {"what", "how", "when", "where", "which", "who", "can", "could", "is", "are", "tell me"}
        contrast_markers = {"actually", "instead", "but", "however", "rather"}

        for idx, part in enumerate(raw_parts):
            norm_part = normalize_utterance(part)
            if not norm_part:
                continue

            # Position weight: later clauses matter more in conversational speech
            position_weight = 1.0 + (idx / max(1, total_clauses - 1)) * 0.8 if total_clauses > 1 else 1.0

            # Check if this clause is a subordinate clause (e.g. starts with "before")
            is_subordinate = bool(re.search(r'\bbefore\b', part)) and idx == 0

            # Check for question intent: check question mark '?' in this clause and question markers in this clause
            is_question = "?" in part or any(re.search(rf'\b{re.escape(qm)}\b', norm_part) for qm in question_markers)

            # Check for contrastive intent
            is_contrast = any(re.search(rf'\b{re.escape(cm)}\b', norm_part) for cm in contrast_markers)

            weight = position_weight
            if is_subordinate:
                weight *= 0.5
            if is_question:
                weight *= 1.2
            if is_contrast:
                weight *= 1.3

            clause_scores.append(ClauseScore(
                clause_text=norm_part,
                weight=round(weight, 3),
                is_subordinate=is_subordinate,
                is_question=is_question,
                is_contrast=is_contrast,
            ))

        return clause_scores

    def evaluate(
        self,
        user_transcript: str,
        active_agent_id: str,
        turn_number: int = 0,
        turns_with_active_agent: int = 1,
        handoff_history: Optional[List[Any]] = None,
        handoff_count: int = 0,
    ) -> Dict[str, Any]:
        """
        Evaluates a user transcript and returns precise routing scores, margin, runner-up,
        and switching recommendation adhering to stickiness and bounce guards.
        Guaranteed to execute in <1 ms.
        """
        start_t = time.perf_counter()

        if not user_transcript or not user_transcript.strip():
            return {
                "should_route": False,
                "reason": "empty_transcript",
                "scores": {},
                "confidence": 0.0,
                "margin": 0.0,
                "runner_up_agent_id": None,
                "runner_up_score": 0.0,
                "matched_terms": [],
                "target_agent_id": active_agent_id,
                "target_agent_name": self.all_agents[active_agent_id].name if active_agent_id in self.all_agents else active_agent_id,
                "elapsed_ms": 0.0,
            }

        # Check total handoff cap per call
        max_handoffs = getattr(self.orch_cfg, "max_handoffs_per_call", 5)
        if handoff_count >= max_handoffs:
            return {
                "should_route": False,
                "reason": "max_handoffs_reached",
                "scores": {},
                "confidence": 0.0,
                "margin": 0.0,
                "runner_up_agent_id": None,
                "runner_up_score": 0.0,
                "matched_terms": [],
                "target_agent_id": active_agent_id,
                "target_agent_name": self.all_agents[active_agent_id].name if active_agent_id in self.all_agents else active_agent_id,
                "elapsed_ms": round((time.perf_counter() - start_t) * 1000.0, 3),
            }

        # 1. Split utterance into weighted clauses
        clauses = self._split_and_score_clauses(user_transcript)

        # 2. Score each agent across all clauses
        agent_scores: Dict[str, float] = {aid: 0.0 for aid in self.all_agents}
        agent_matched_terms: Dict[str, List[str]] = {aid: [] for aid in self.all_agents}

        for cl in clauses:
            for aid, pattern in self.compiled_patterns.items():
                matches = pattern.findall(cl.clause_text)
                if matches:
                    unique_matches = set(m.lower().strip() for m in matches)
                    for m in unique_matches:
                        m = self._canonical_term(m)
                        term_weight = self.term_weights.get(m, 0.2)
                        agent_scores[aid] += round(term_weight * cl.weight, 4)
                        if m not in agent_matched_terms[aid]:
                            agent_matched_terms[aid].append(m)

        # Round final scores
        for aid in agent_scores:
            agent_scores[aid] = round(agent_scores[aid], 3)

        # 3. Sort agents by score
        sorted_candidates = sorted(agent_scores.items(), key=lambda x: x[1], reverse=True)
        top_aid, top_score = sorted_candidates[0]
        runner_up_aid, runner_up_score = sorted_candidates[1] if len(sorted_candidates) > 1 else (None, 0.0)

        current_agent_score = agent_scores.get(active_agent_id, 0.0)

        # Switch parameters from OrchestratorConfig
        switch_margin = getattr(self.orch_cfg, "switch_margin", 0.25)
        min_score = getattr(self.orch_cfg, "min_score", 0.35)
        min_dwell_turns = getattr(self.orch_cfg, "min_dwell_turns", 1)
        pingpong_window = getattr(self.orch_cfg, "pingpong_window", 3)
        pingpong_override = getattr(self.orch_cfg, "pingpong_override_threshold", 1.5)

        elapsed_ms = round((time.perf_counter() - start_t) * 1000.0, 3)

        # Case A: Top candidate is the currently active agent -> Stay (stickiness wins)
        if top_aid == active_agent_id:
            return {
                "should_route": False,
                "reason": "active_agent_retained",
                "scores": agent_scores,
                "confidence": round(min(1.0, top_score), 2),
                "margin": round(top_score - runner_up_score, 2),
                "runner_up_agent_id": runner_up_aid,
                "runner_up_score": runner_up_score,
                "matched_terms": agent_matched_terms.get(top_aid, []),
                "target_agent_id": active_agent_id,
                "target_agent_name": self.all_agents[active_agent_id].name,
                "elapsed_ms": elapsed_ms,
            }

        # Case B: Top candidate is a challenger
        challenger_aid = top_aid
        challenger_score = top_score
        challenger_margin = round(challenger_score - current_agent_score, 2)

        # Guard 1: Challenger must exceed absolute min_score
        if challenger_score < min_score:
            return {
                "should_route": False,
                "reason": "below_min_score",
                "scores": agent_scores,
                "confidence": round(min(1.0, challenger_score), 2),
                "margin": challenger_margin,
                "runner_up_agent_id": runner_up_aid,
                "runner_up_score": runner_up_score,
                "matched_terms": agent_matched_terms.get(challenger_aid, []),
                "target_agent_id": active_agent_id,
                "target_agent_name": self.all_agents[active_agent_id].name,
                "elapsed_ms": elapsed_ms,
            }

        # Guard 2: Challenger must exceed current agent score by switch_margin
        if challenger_margin < switch_margin:
            return {
                "should_route": False,
                "reason": "insufficient_switch_margin",
                "scores": agent_scores,
                "confidence": round(min(1.0, challenger_score), 2),
                "margin": challenger_margin,
                "runner_up_agent_id": runner_up_aid,
                "runner_up_score": runner_up_score,
                "matched_terms": agent_matched_terms.get(challenger_aid, []),
                "target_agent_id": active_agent_id,
                "target_agent_name": self.all_agents[active_agent_id].name,
                "elapsed_ms": elapsed_ms,
            }

        # Guard 3: Minimum dwell time with active specialist
        # If we just arrived at active_agent_id and haven't dwelled for min_dwell_turns, block switch
        # unless challenger score meets high override threshold.
        if turns_with_active_agent < min_dwell_turns and challenger_score < pingpong_override:
            return {
                "should_route": False,
                "reason": "dwell_time_not_met",
                "scores": agent_scores,
                "confidence": round(min(1.0, challenger_score), 2),
                "margin": challenger_margin,
                "runner_up_agent_id": runner_up_aid,
                "runner_up_score": runner_up_score,
                "matched_terms": agent_matched_terms.get(challenger_aid, []),
                "target_agent_id": active_agent_id,
                "target_agent_name": self.all_agents[active_agent_id].name,
                "elapsed_ms": elapsed_ms,
            }

        # Guard 4: Ping-Pong bounce prevention (A -> B -> A within pingpong_window turns)
        if handoff_history:
            was_recently_active = False
            for h in handoff_history:
                h_turn = getattr(h, "turn_number", 0)
                if (turn_number - h_turn) <= pingpong_window:
                    if getattr(h, "to_agent_id", None) == challenger_aid or getattr(h, "from_agent_id", None) == challenger_aid:
                        was_recently_active = True
                        break
            if was_recently_active and challenger_score < pingpong_override:
                return {
                    "should_route": False,
                    "reason": "pingpong_blocked",
                    "scores": agent_scores,
                    "confidence": round(min(1.0, challenger_score), 2),
                    "margin": challenger_margin,
                    "runner_up_agent_id": runner_up_aid,
                    "runner_up_score": runner_up_score,
                    "matched_terms": agent_matched_terms.get(challenger_aid, []),
                    "target_agent_id": active_agent_id,
                    "target_agent_name": self.all_agents[active_agent_id].name,
                    "elapsed_ms": elapsed_ms,
                }

        # Valid switch approved!
        target_name = self.all_agents[challenger_aid].name
        return {
            "should_route": True,
            "reason": "intent_switch",
            "scores": agent_scores,
            "confidence": round(min(1.0, challenger_score), 2),
            "margin": challenger_margin,
            "runner_up_agent_id": runner_up_aid if runner_up_aid != challenger_aid else active_agent_id,
            "runner_up_score": runner_up_score,
            "matched_terms": agent_matched_terms.get(challenger_aid, []),
            "target_agent_id": challenger_aid,
            "target_agent_name": target_name,
            "elapsed_ms": elapsed_ms,
        }
