"""
Atomic Mid-Call Multi-Agent Handoff Controller.
Coordinates intent evaluation, prompt compilation, WebSocket update acknowledgement,
state commitment, and steady-state swaps across both Twilio telephony and browser preview pipelines.
"""

import asyncio
import logging
from typing import Optional, Callable, Dict, Any, List, Tuple, Awaitable

from app.agents.configuration import AgentConfiguration
from app.agents.orchestrator import AgentOrchestrator, RoutingDecision, HandoffContext, HandoffPlan

logger = logging.getLogger("agent.handoff_controller")


class HandoffController:
    """
    Manages mid-call agent handoffs for a single call session.
    Guarantees:
      1. Synchronous non-blocking submission (`submit(transcript, turn_number)`).
      2. Single drain worker with latest-request-wins semantics (no dropped intents).
      3. Pure preparation without premature state mutation.
      4. Atomic state commitment ONLY when the prompt update ack is confirmed.
      5. Automatic steady-state prompt swap on the first assistant turn following handoff.
      6. Clean cancellation on call termination.
    """

    def __init__(
        self,
        orchestrator: AgentOrchestrator,
        deepgram_client: Any,
        on_committed: Callable[[AgentConfiguration, RoutingDecision, HandoffContext], Awaitable[None]],
        on_failed: Optional[Callable[[Optional[RoutingDecision], str], Awaitable[None]]] = None,
        is_concluding: Optional[Callable[[], bool]] = None,
        get_transcript_turns: Optional[Callable[[], List[Dict[str, str]]]] = None,
        platform_rules: Optional[Any] = None,
        ack_timeout: float = 1.0,
    ):
        self._orchestrator = orchestrator
        self._deepgram_client = deepgram_client
        self._on_committed = on_committed
        self._on_failed = on_failed
        self._is_concluding = is_concluding
        self._get_transcript_turns = get_transcript_turns
        self._platform_rules = platform_rules
        self._ack_timeout = ack_timeout

        self._pending: Optional[Tuple[str, int]] = None
        self._worker_task: Optional[asyncio.Task] = None
        self._is_closed = False
        self.cumulative_appended_chars: int = 0
        self.cumulative_appended_tokens: int = 0

    @property
    def is_handling_handoff(self) -> bool:
        """True if the worker is actively draining or waiting for ack."""
        return self._worker_task is not None and not self._worker_task.done()

    def submit(self, transcript: str, turn_number: int) -> None:
        """
        Synchronously accepts a user transcript.
        Overwrites any pending un-drained transcript (newest request wins) and
        spawns the drain worker if not already running.
        """
        if self._is_closed:
            return
        if not transcript or not transcript.strip():
            return
        if self._is_concluding and self._is_concluding():
            return

        self._pending = (transcript.strip(), turn_number)

        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._drain_worker())

    async def on_assistant_turn(self, content: str) -> None:
        """
        Triggered when the assistant speaks.
        Under UpdatePrompt append semantics, steady-state prompt updates are deleted
        to avoid appending redundant duplicate copies to the session prompt.
        """
        pass

    async def _drain_worker(self) -> None:
        """
        Worker loop that runs while pending submissions exist.
        Drains the latest transcript, evaluates intent, builds pure plan, awaits ack,
        and atomically commits state only on verified success.
        """
        try:
            while self._pending is not None and not self._is_closed:
                if self._is_concluding and self._is_concluding():
                    self._pending = None
                    break

                transcript, turn_number = self._pending
                self._pending = None

                if not self._deepgram_client or not getattr(self._deepgram_client, "is_ready", False):
                    logger.debug("[HandoffController] Client not ready, skipping intent evaluation.")
                    continue

                decision = self._orchestrator.evaluate_intent(transcript, turn_number=turn_number)
                if not decision.should_route:
                    logger.debug(f"[HandoffController] No routing required. Reason: {decision.reason}")
                    continue

                logger.info(
                    f"[HandoffController] Routing triggered: target='{decision.target_agent_id}' "
                    f"| keyword='{decision.matched_keyword}' | reason='{decision.reason}'"
                )

                # Context extraction from conversation history
                all_entity_keywords = []
                for child_cfg in self._orchestrator.get_all_child_agents().values():
                    if child_cfg.agent_entity_scope:
                        all_entity_keywords.append(child_cfg.agent_entity_scope)

                turns = self._get_transcript_turns() if self._get_transcript_turns else []
                context = AgentOrchestrator.extract_context_from_transcript(
                    turns,
                    entity_keywords=all_entity_keywords if all_entity_keywords else None
                )
                context.detected_intent = decision.matched_keyword or decision.reason
                context.from_agent_id = self._orchestrator.get_current_agent_id()
                # Router's ping-pong window compares against user-turn numbers; the extractor
                # counts user + assistant entries, so pin it to the user turn that triggered routing.
                context.turn_number = turn_number

                # Pure preparation (no state mutation)
                try:
                    plan = self._orchestrator.prepare_handoff(
                        decision, context, platform_rules=self._platform_rules
                    )
                except Exception as prep_err:
                    logger.error(f"[HandoffController] Failed to prepare handoff plan: {prep_err}", exc_info=True)
                    if self._on_failed:
                        await self._on_failed(decision, f"prepare_failed: {prep_err}")
                    continue

                # Spoken transition intro (if non-empty)
                if plan.transition_intro and plan.transition_intro.strip():
                    try:
                        from app.voice.pronunciation_normalizer import PronunciationNormalizer
                        norm_intro = PronunciationNormalizer.normalize(
                            plan.transition_intro,
                            getattr(plan.target_agent, "pronunciation_rules", None)
                        )
                    except Exception:
                        norm_intro = plan.transition_intro

                    if norm_intro.strip():
                        try:
                            await self._deepgram_client.inject_agent_message(norm_intro, behavior="interrupt")
                            logger.info(f"[HandoffController] Injected transition intro: '{norm_intro[:60]}'")
                            await asyncio.sleep(0.35)
                        except Exception as intro_err:
                            logger.warning(f"[HandoffController] Failed to inject intro: {intro_err}")
                else:
                    logger.info("[HandoffController] Silent handoff enabled. Hot-swapping prompt directly.")

                # Dispatch compact role-switch delta (<= ~400 tokens) under UpdatePrompt append semantics
                delta_to_send = plan.role_switch_delta if getattr(plan, "role_switch_delta", None) else plan.handoff_prompt
                acked = False
                try:
                    acked = await self._deepgram_client.update_prompt_and_wait_ack(
                        delta_to_send, timeout=self._ack_timeout
                    )
                except Exception as send_err:
                    logger.error(f"[HandoffController] Error sending prompt update: {send_err}")

                if acked:
                    # ATOMIC COMMIT ONLY ON CONFIRMED ACK
                    self._orchestrator.commit_handoff(plan)
                    appended_chars = len(delta_to_send)
                    appended_tokens = len(delta_to_send.split())
                    self.cumulative_appended_chars += appended_chars
                    self.cumulative_appended_tokens += appended_tokens
                    logger.info(
                        f"[HandoffController] UpdatePrompt sent compact role-switch delta ({appended_chars} chars, "
                        f"~{appended_tokens} tokens). Cumulative appended size: {self.cumulative_appended_chars} chars across call."
                    )
                    logger.info(
                        f"[HandoffController] Handoff committed successfully to specialist '{plan.target_agent.name}'."
                    )
                    if self._on_committed:
                        await self._on_committed(plan.target_agent, decision, plan.context)
                else:
                    logger.warning(
                        f"[HandoffController] Handoff failed or timed out awaiting ack for target "
                        f"'{decision.target_agent_id}'. State NOT committed."
                    )
                    if self._on_failed:
                        await self._on_failed(decision, "ack_timeout_or_failed")

        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.error(f"[HandoffController] Unexpected error in drain worker: {err}", exc_info=True)

    def close(self) -> None:
        """Cleanly terminates the handoff controller and cancels running drain worker."""
        self._is_closed = True
        self._pending = None
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            self._worker_task = None
        logger.debug("[HandoffController] Closed cleanly.")
