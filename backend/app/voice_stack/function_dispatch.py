"""Answers the model's client-side function calls for any voice engine client.

Shared by the Standard and Economy clients so both answer the same functions the same way.
`answer_function_call` never raises: every call gets an answer, even when the function fails.
"""
import asyncio
import json
import logging
import time
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger(__name__)

FAILED_FUNCTION_TEXT = "That could not be done just now. Say a short polite line and ask the caller to repeat."
UNKNOWN_FUNCTION_TEXT = "Unknown function."


async def answer_function_call(
    name: str,
    arguments: Any,
    *,
    state: Dict[str, Any],
    knowledge_runner: Optional[Callable[[Any], Awaitable[str]]],
) -> str:
    try:
        from app.numerology.tools import FUNCTION_NAMES as NUMEROLOGY_FUNCTION_NAMES, run_function
        if name in NUMEROLOGY_FUNCTION_NAMES:
            return run_function(name, arguments, state)
        if name != "search_knowledge":
            return UNKNOWN_FUNCTION_TEXT
        if knowledge_runner is None:
            return "No knowledge base is attached to this agent."
        return await knowledge_runner(arguments)
    except Exception as e:
        logger.exception(f"[VoiceEngine] Function '{name}' failed: {type(e).__name__}")
        return FAILED_FUNCTION_TEXT


async def run_knowledge_search(scope: Optional[Dict[str, Any]], raw_arguments: Any) -> str:
    """Live knowledge lookup for the `search_knowledge` function within the agent's knowledge scope."""
    if not scope:
        return "No knowledge base is attached to this agent."
    try:
        args = json.loads(raw_arguments) if isinstance(raw_arguments, str) else (raw_arguments or {})
        query = str(args.get("query", "")).strip()
        if not query:
            return "No query provided."
        started = time.perf_counter()
        from app.services.knowledge_service import knowledge_service
        context = await asyncio.wait_for(
            knowledge_service.get_grounding_context_for_call(
                organization_id=scope["organization_id"],
                user_transcript=query,
                document_ids=scope.get("document_ids"),
            ),
            timeout=5.0,
        )
        logger.info(f"[Knowledge] search '{query[:60]}' -> {'hit' if context else 'miss'} in {(time.perf_counter() - started) * 1000:.0f}ms")
        if not context:
            return "No matching information was found. Say you will have the solution team follow up; do not guess."
        return context
    except asyncio.TimeoutError:
        logger.warning("[Knowledge] search timed out")
        return "The lookup took too long. Answer briefly from what you already know, or offer a follow-up."
    except Exception as e:
        logger.error(f"[Knowledge] search failed: {e}")
        return "The lookup is unavailable right now. Offer a follow-up from the solution team."
