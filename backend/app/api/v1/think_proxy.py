"""
OpenAI-Compatible LLM Think Proxy
Routes caller intent directly inside the LLM request path, resolving the
one-turn prompt-swap latency limitation.

Exposes an OpenAI-compatible Chat Completions endpoint:
    POST /api/v1/think/chat/completions
with SSE streaming, passing through tools and tool_calls unchanged.
Authentication token passed in `Authorization: Bearer <call_token>` header,
with backwards-compatible path parameter support.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Callable, AsyncIterator, Tuple
import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from app.core.security import JWT_SECRET
from app.agents.configuration import AgentConfiguration
from app.agents.orchestrator import AgentOrchestrator, RoutingDecision, HandoffContext, HandoffPlan
from app.agents.prompt_builder import VoicePromptBuilder
from app.agents.spoken_text import sanitize_spoken_delta

logger = logging.getLogger("think_proxy")
logger.setLevel(logging.INFO)

router = APIRouter(tags=["Think Proxy"])


# =============================================================================
# In-Memory Per-Call Routing State Registry & HMAC Token Management
# =============================================================================

@dataclass
class CallRoutingState:
    """In-memory active state for a live voice call handled by Think Proxy."""
    call_id: str
    tenant_id: str
    token: str
    orchestrator: AgentOrchestrator
    platform_rules: Optional[List[str]] = None
    on_committed: Optional[Callable[[AgentConfiguration, RoutingDecision, HandoffContext], Any]] = None
    telemetry_callback: Optional[Callable[[Dict[str, Any]], Any]] = None
    created_at: float = field(default_factory=time.time)
    expires_at: float = field(default_factory=lambda: time.time() + 3600)
    turn_count: int = 0
    handoff_count: int = 0
    is_switch_turn: bool = False
    last_decision: Optional[RoutingDecision] = None
    pending_plan: Optional[HandoffPlan] = None
    cached_prompts: Dict[str, str] = field(default_factory=dict)
    last_system_prompt: Optional[str] = None


# Thread-safe in-memory registry mapping token string -> CallRoutingState
CALL_ROUTING_REGISTRY: Dict[str, CallRoutingState] = {}


def generate_call_token(call_id: str, tenant_id: str, ttl_seconds: int = 3600) -> str:
    """
    Generates a cryptographically signed HMAC token for a live call session.
    Never exposes caller's personal information in the token.
    Format: ct_{session_nonce}_{expiry_timestamp}_{hmac_signature}
    """
    nonce = secrets.token_hex(8)
    exp = int(time.time() + ttl_seconds)
    payload = f"{nonce}:{exp}:{tenant_id}"
    sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return f"ct_{nonce}_{exp}_{sig}"


def verify_call_token(token: str) -> CallRoutingState:
    """
    Verifies that a call_token is well-formed, cryptographically signed,
    unexpired, and mapped to an active CallRoutingState.
    Raises HTTPException(401) on any verification failure.
    """
    if not token or not token.startswith("ct_"):
        logger.warning(f"[ThinkProxy] Rejected invalid token format: '{token}'")
        raise HTTPException(status_code=401, detail="Invalid call token")

    parts = token.split("_")
    if len(parts) != 4:
        logger.warning(f"[ThinkProxy] Rejected malformed token: '{token}'")
        raise HTTPException(status_code=401, detail="Invalid call token format")

    _, nonce, exp_str, sig = parts
    try:
        exp = int(exp_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token expiry")

    if time.time() > exp:
        logger.warning(f"[ThinkProxy] Rejected expired token: '{token}'")
        CALL_ROUTING_REGISTRY.pop(token, None)
        raise HTTPException(status_code=401, detail="Call token has expired")

    state = CALL_ROUTING_REGISTRY.get(token)
    if not state:
        logger.warning(f"[ThinkProxy] Unknown call token or terminated session: '{token}'")
        raise HTTPException(status_code=401, detail="Unknown or terminated call token")

    # Verify HMAC signature
    payload = f"{nonce}:{exp}:{state.tenant_id}"
    expected_sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    if not hmac.compare_digest(sig, expected_sig):
        logger.warning(f"[ThinkProxy] HMAC signature mismatch on token: '{token}'")
        raise HTTPException(status_code=401, detail="Token signature verification failed")

    return state


def register_call_state(
    call_id: str,
    tenant_id: str,
    orchestrator: AgentOrchestrator,
    platform_rules: Optional[List[str]] = None,
    on_committed: Optional[Callable[[AgentConfiguration, RoutingDecision, HandoffContext], Any]] = None,
    telemetry_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ttl_seconds: int = 3600,
) -> str:
    """Registers a live call session into the Think Proxy registry and returns its signed token."""
    token = generate_call_token(call_id=call_id, tenant_id=tenant_id, ttl_seconds=ttl_seconds)
    state = CallRoutingState(
        call_id=call_id,
        tenant_id=tenant_id,
        token=token,
        orchestrator=orchestrator,
        platform_rules=platform_rules,
        on_committed=on_committed,
        telemetry_callback=telemetry_callback,
        expires_at=time.time() + ttl_seconds,
    )
    CALL_ROUTING_REGISTRY[token] = state
    logger.info(f"[ThinkProxy] Registered call state for call_id='{call_id}', token='{token[:15]}...'")
    return token


def think_proxy_requested(orchestrator_cfg: Any = None) -> bool:
    """True when the env flag or the orchestrator's own config asks for the think proxy."""
    env_flag = os.getenv("ORCHESTRATOR_THINK_PROXY", "false").lower() in ("true", "1", "yes")
    return env_flag or bool(getattr(orchestrator_cfg, "think_proxy_enabled", False))


def resolve_public_base_url(twilio_cfg: Any = None) -> Optional[str]:
    """
    Public HTTPS base URL the Voice Engine cloud can reach, or None. Deepgram resolves
    think.endpoint when it applies Settings, so localhost/http would break the call.
    """
    base = (
        os.getenv("PUBLIC_BASE_URL")
        or getattr(twilio_cfg, "public_base_url", None)
        or os.getenv("THINK_PROXY_BASE_URL")
        or os.getenv("BACKEND_PUBLIC_URL")
        or ""
    ).strip().rstrip("/")
    lowered = base.lower()
    if not base.startswith("https://") or "localhost" in lowered or "127.0.0.1" in lowered:
        return None
    return base


def attach_think_proxy(
    deepgram_settings: Any,
    orchestrator: AgentOrchestrator,
    call_id: str,
    tenant_id: str,
    platform_rules: Optional[List[str]] = None,
    on_committed: Optional[Callable[[AgentConfiguration, RoutingDecision, HandoffContext], Any]] = None,
    telemetry_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    twilio_cfg: Any = None,
) -> Optional[str]:
    """
    Registers the call and points agent.think.endpoint at this proxy. Returns the call
    token, or None (caller should keep the UpdatePrompt path) when no public URL exists.
    """
    from app.providers.deepgram.configuration import DeepgramThinkEndpoint

    public_base_url = resolve_public_base_url(twilio_cfg)
    if not public_base_url:
        logger.error(
            "[ThinkProxy] PUBLIC_BASE_URL is missing, not https, or local. The Voice Engine cannot reach "
            "the think proxy; falling back to the UpdatePrompt path."
        )
        return None

    token = register_call_state(
        call_id=call_id,
        tenant_id=tenant_id,
        orchestrator=orchestrator,
        platform_rules=platform_rules,
        on_committed=on_committed,
        telemetry_callback=telemetry_callback,
    )
    endpoint_url = f"{public_base_url}/api/v1/think/chat/completions"
    deepgram_settings.agent.think.endpoint = DeepgramThinkEndpoint(
        url=endpoint_url,
        headers={"Authorization": f"Bearer {token}"},
    )
    logger.info(f"[ThinkProxy] Think proxy attached for call '{call_id}': {endpoint_url}")
    return token


def unregister_call_state(token: str) -> None:
    """Removes a call session from the registry when the call terminates."""
    if token in CALL_ROUTING_REGISTRY:
        CALL_ROUTING_REGISTRY.pop(token, None)
        logger.info(f"[ThinkProxy] Unregistered call token '{token[:15]}...'")


def get_call_state(token: str) -> Optional[CallRoutingState]:
    """Retrieves call state if present without verification check (for tests/status)."""
    return CALL_ROUTING_REGISTRY.get(token)


# =============================================================================
# Shared HTTP Client & Injectable Completion Handler
# =============================================================================

SHARED_HTTP_CLIENT: Optional[httpx.AsyncClient] = None


def get_shared_http_client() -> httpx.AsyncClient:
    """Returns a module-level shared httpx.AsyncClient with keep-alive and connection pooling."""
    global SHARED_HTTP_CLIENT
    if SHARED_HTTP_CLIENT is None or SHARED_HTTP_CLIENT.is_closed:
        SHARED_HTTP_CLIENT = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=30.0),
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=100),
        )
    return SHARED_HTTP_CLIENT


async def close_shared_http_client() -> None:
    """Cleanly closes the module-level shared httpx.AsyncClient upon application shutdown."""
    global SHARED_HTTP_CLIENT
    if SHARED_HTTP_CLIENT is not None and not SHARED_HTTP_CLIENT.is_closed:
        await SHARED_HTTP_CLIENT.aclose()
        SHARED_HTTP_CLIENT = None


# Type for injected completion handler in tests
UPSTREAM_CHAT_COMPLETION_HANDLER: Optional[Callable[..., Any]] = None


def set_upstream_chat_completion_handler(handler: Optional[Callable[..., Any]]) -> None:
    """Sets an injectable upstream LLM completion handler (used primarily for unit tests)."""
    global UPSTREAM_CHAT_COMPLETION_HANDLER
    UPSTREAM_CHAT_COMPLETION_HANDLER = handler


# =============================================================================
# Helper: Extract User Transcript & Build Dynamic System Prompt
# =============================================================================

def _extract_last_user_message(messages: List[Dict[str, Any]]) -> str:
    """Finds the most recent user turn in the incoming chat messages array."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, str):
                return content.strip()
            elif isinstance(content, list):
                parts = []
                for p in content:
                    if isinstance(p, dict) and p.get("type") == "text":
                        parts.append(p.get("text", ""))
                return " ".join(parts).strip()
    return ""


def _get_or_build_steady_prompt(state: CallRoutingState, agent_cfg: AgentConfiguration) -> str:
    """
    Returns the cached steady-state prompt for the given agent configuration,
    or compiles and caches it using keyword arguments with business_profile and platform_rules.
    """
    aid = agent_cfg.agent_id
    if aid in state.cached_prompts:
        return state.cached_prompts[aid]

    business_prof = getattr(state.orchestrator, "business_profile", None)
    prompt = VoicePromptBuilder.build_prompt(
        agent_cfg,
        business_profile=business_prof,
        platform_rules=state.platform_rules,
    )
    state.cached_prompts[aid] = prompt
    return prompt


def _process_turn_and_prepare_prompt(
    state: CallRoutingState,
    user_transcript: str,
) -> tuple[str, bool, Optional[RoutingDecision], Optional[HandoffPlan], float]:
    """
    Evaluates caller intent using IntentRouter, prepares the appropriate system prompt,
    and returns (system_prompt, is_switch_turn, decision, plan, overhead_ms).
    On the switch turn: uses plan.handoff_prompt.
    On steady-state turns: uses cached steady-state prompt.
    """
    start_t = time.perf_counter()
    decision = None
    is_switch_turn = False
    pending_plan = None

    try:
        decision = state.orchestrator.evaluate_intent(
            user_transcript=user_transcript,
            turn_number=state.turn_count,
        )
    except Exception as router_err:
        logger.warning(
            f"[ThinkProxy] Router exception: {router_err}. Falling back to active agent '{state.orchestrator.active_agent_id}'"
        )
        decision = RoutingDecision(
            should_route=False,
            target_agent_id=state.orchestrator.active_agent_id,
            reason=f"router_fallback:{router_err}"
        )

    # Check if a switch should happen
    if decision and decision.should_route and decision.target_agent_id != state.orchestrator.active_agent_id:
        try:
            target_agent = state.orchestrator.get_child_agent(decision.target_agent_id)
            if not target_agent and decision.target_agent_id == state.orchestrator.config.agent_id:
                target_agent = state.orchestrator.config

            if target_agent:
                context = HandoffContext(
                    from_agent_id=state.orchestrator.active_agent_id,
                    to_agent_id=decision.target_agent_id,
                    detected_intent=decision.matched_keyword or "intent_switch",
                    turn_number=state.turn_count,
                )
                plan = state.orchestrator.prepare_handoff(
                    decision=decision,
                    context=context,
                    platform_rules=state.platform_rules
                )
                # Static specialist prompt + dynamic handoff block ONLY on this switch turn
                system_prompt = plan.handoff_prompt
                pending_plan = plan
                is_switch_turn = True

                # Pre-cache the target agent's steady-state prompt for subsequent turns
                _get_or_build_steady_prompt(state, target_agent)
            else:
                logger.warning(f"[ThinkProxy] Target agent '{decision.target_agent_id}' not found. Retaining active.")
                active_cfg = state.orchestrator.get_child_agent(state.orchestrator.active_agent_id) or state.orchestrator.config
                system_prompt = _get_or_build_steady_prompt(state, active_cfg)
                is_switch_turn = False
        except Exception as prep_err:
            logger.warning(f"[ThinkProxy] Prepare handoff exception: {prep_err}. Falling back to steady state.")
            active_cfg = state.orchestrator.get_child_agent(state.orchestrator.active_agent_id) or state.orchestrator.config
            system_prompt = _get_or_build_steady_prompt(state, active_cfg)
            is_switch_turn = False
    else:
        # Steady-state turn: cached static specialist prompt ONLY
        active_cfg = state.orchestrator.get_child_agent(state.orchestrator.active_agent_id) or state.orchestrator.config
        system_prompt = _get_or_build_steady_prompt(state, active_cfg)
        is_switch_turn = False

    overhead_ms = (time.perf_counter() - start_t) * 1000.0
    logger.info(
        f"[ThinkProxy] Routing overhead: {overhead_ms:.2f}ms (target <30ms) | "
        f"Active: '{state.orchestrator.active_agent_id}' -> "
        f"'{decision.target_agent_id if (decision and decision.should_route) else state.orchestrator.active_agent_id}' | "
        f"Switch turn: {is_switch_turn}"
    )

    return system_prompt, is_switch_turn, decision, pending_plan, overhead_ms


# =============================================================================
# Upstream Request Execution (Streaming & Non-Streaming)
# =============================================================================

def _resolve_upstream_url_and_headers(payload: Dict[str, Any]) -> Tuple[str, Dict[str, str]]:
    """Resolves upstream LLM URL and authentication headers from environment."""
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    azure_key = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY", "")
    azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") or os.getenv("AZURE_OPENAI_MODEL", "gpt-4o")
    azure_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")

    openai_key = os.getenv("OPENAI_API_KEY", "")

    if azure_endpoint and azure_key:
        url = f"{azure_endpoint}/openai/deployments/{azure_deployment}/chat/completions?api-version={azure_version}"
        headers = {
            "Content-Type": "application/json",
            "api-key": azure_key
        }
        return url, headers
    elif openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {openai_key}"
        }
        return url, headers
    else:
        raise ValueError("No upstream LLM credentials configured")


def _openai_error(status_code: int, message: str, err_type: str, code: Any) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"message": message, "type": err_type, "code": code}},
    )


async def _open_upstream_stream(
    url: str,
    headers: Dict[str, str],
    req_body: Dict[str, Any],
) -> httpx.Response:
    """
    Opens the upstream streaming request BEFORE the SSE response starts, so connection
    failures and non-2xx statuses reach the Voice Engine as real HTTP errors instead of
    a 200 stream carrying an error payload.
    """
    client = get_shared_http_client()
    req = client.build_request("POST", url, headers=headers, json=req_body)
    return await client.send(req, stream=True)


async def _relay_upstream_stream(
    resp: httpx.Response,
    commit_callback: Callable[[], None],
) -> AsyncIterator[str]:
    """
    Relays upstream SSE lines, commits routing state on the first data line, and strips
    markdown from spoken content deltas (tool_calls and other fields pass through unchanged).
    """
    committed = False
    try:
        async for line in resp.aiter_lines():
            if line:
                if not committed and line.startswith("data:") and "[DONE]" not in line:
                    commit_callback()
                    committed = True
                yield f"{_sanitize_sse_line(line)}\n\n"
    finally:
        await resp.aclose()


def _sanitize_sse_line(line: str) -> str:
    """Removes markdown from choices[].delta.content so TTS never reads "star star"."""
    if not line.startswith("data:") or "[DONE]" in line or '"content"' not in line:
        return line
    try:
        chunk = json.loads(line[5:].strip())
    except ValueError:
        return line
    changed = False
    for choice in chunk.get("choices") or []:
        delta = choice.get("delta") or {}
        content = delta.get("content")
        if isinstance(content, str) and content:
            cleaned = sanitize_spoken_delta(content)
            if cleaned != content:
                delta["content"] = cleaned
                changed = True
    return f"data: {json.dumps(chunk)}" if changed else line


# =============================================================================
# FastAPI Endpoint: POST /api/v1/think/chat/completions
# =============================================================================

@router.post("/think/chat/completions")
@router.post("/think/{call_token}/chat/completions")
async def think_proxy_chat_completions(
    request: Request,
    call_token: Optional[str] = None,
):
    """
    OpenAI-compatible Chat Completions endpoint.
    Voice Engine calls this when think proxy is configured as think.endpoint.
    Token is read from `Authorization: Bearer <call_token>` header, or from URL path.
    """
    # 1. Extract and validate call token
    token = None
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif call_token:
        token = call_token

    if not token:
        logger.warning("[ThinkProxy] Missing call token in Authorization header and URL path")
        raise HTTPException(status_code=401, detail="Missing call token")

    state = verify_call_token(token)

    # 2. Parse incoming JSON request
    try:
        body = await request.json()
    except Exception as parse_err:
        raise HTTPException(status_code=400, detail=f"Invalid JSON request body: {parse_err}")

    messages = body.get("messages", [])
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="'messages' must be a list")

    # 3. Check for function-call follow-up requests (last message role == "tool")
    is_tool_followup = bool(messages and messages[-1].get("role") == "tool")

    if is_tool_followup:
        # Function-call follow-up: do NOT re-run routing or increment turn/dwell counters
        active_cfg = state.orchestrator.get_child_agent(state.orchestrator.active_agent_id) or state.orchestrator.config
        system_prompt = _get_or_build_steady_prompt(state, active_cfg)
        is_switch_turn = False
        decision = None
        pending_plan = None
        overhead_ms = 0.0
    else:
        # 4. Extract latest caller utterance and evaluate intent
        user_transcript = _extract_last_user_message(messages)
        system_prompt, is_switch_turn, decision, pending_plan, overhead_ms = _process_turn_and_prepare_prompt(
            state=state,
            user_transcript=user_transcript,
        )

    # 5. Replace existing system message (or prepend if none exists)
    modified_messages = list(messages)
    replaced_system = False
    for idx, msg in enumerate(modified_messages):
        if msg.get("role") == "system":
            modified_messages[idx] = {"role": "system", "content": system_prompt}
            replaced_system = True
            break

    if not replaced_system:
        modified_messages.insert(0, {"role": "system", "content": system_prompt})

    body["messages"] = modified_messages
    state.last_system_prompt = system_prompt

    # 6. Define atomic state commitment callback
    committed = False

    def _commit_state():
        nonlocal committed
        if committed:
            return
        committed = True

        if is_tool_followup:
            return

        if is_switch_turn and pending_plan:
            state.orchestrator.commit_handoff(pending_plan)
            state.handoff_count += 1
            if state.on_committed:
                try:
                    res = state.on_committed(pending_plan.target_agent, decision, pending_plan.context)
                    if asyncio.iscoroutine(res):
                        asyncio.create_task(res)
                except Exception as cb_err:
                    logger.warning(f"[ThinkProxy] on_committed callback error: {cb_err}")

        state.turn_count += 1
        state.is_switch_turn = is_switch_turn
        state.last_decision = decision

        # Dispatch telemetry
        if state.telemetry_callback:
            try:
                res = state.telemetry_callback({
                    "event_type": "ThinkProxyRouting",
                    "call_session_id": state.call_id,
                    "organization_id": state.tenant_id,
                    "agent_id": state.orchestrator.active_agent_id,
                    "payload": {
                        "active_agent_id": state.orchestrator.active_agent_id,
                        "is_switch_turn": is_switch_turn,
                        "overhead_ms": round(overhead_ms, 2),
                        "decision_reason": decision.reason if decision else None,
                        "confidence": getattr(decision, "confidence", 0.0) if decision else 0.0,
                        "margin": getattr(decision, "margin", 0.0) if decision else 0.0,
                        "turn_number": state.turn_count,
                    }
                })
                if asyncio.iscoroutine(res):
                    asyncio.create_task(res)
            except Exception as telem_err:
                logger.warning(f"[ThinkProxy] Telemetry callback error: {telem_err}")

    is_stream = body.get("stream", True)

    # 7. Check for injected test completion handler
    if UPSTREAM_CHAT_COMPLETION_HANDLER is not None:
        handler_result = UPSTREAM_CHAT_COMPLETION_HANDLER(body, state, is_stream)
        if asyncio.iscoroutine(handler_result):
            handler_result = await handler_result

        if is_stream:
            async def _stream_injected():
                nonlocal committed
                has_error = False
                if hasattr(handler_result, "__aiter__"):
                    async for chunk in handler_result:
                        if isinstance(chunk, str) and ('"error"' in chunk or "[DONE]" in chunk):
                            if '"error"' in chunk:
                                has_error = True
                        elif not committed and not has_error:
                            _commit_state()
                            committed = True
                        yield chunk
                elif isinstance(handler_result, list):
                    for chunk in handler_result:
                        if isinstance(chunk, str) and ('"error"' in chunk or "[DONE]" in chunk):
                            if '"error"' in chunk:
                                has_error = True
                        elif not committed and not has_error:
                            _commit_state()
                            committed = True
                        yield chunk
                else:
                    if not (isinstance(handler_result, str) and '"error"' in handler_result):
                        _commit_state()
                    yield str(handler_result)

            return StreamingResponse(_stream_injected(), media_type="text/event-stream")
        else:
            if not (isinstance(handler_result, dict) and "error" in handler_result):
                _commit_state()
            return handler_result

    # 8. Real Upstream LLM Execution
    try:
        url, headers = _resolve_upstream_url_and_headers(body)
    except ValueError as ve:
        logger.error(f"[ThinkProxy] Upstream LLM credentials error: {ve}")
        return _openai_error(
            503, "Voice Engine upstream reasoning service unavailable",
            "service_unavailable", "llm_credentials_missing",
        )

    if is_stream:
        body["stream"] = True
        try:
            upstream_resp = await _open_upstream_stream(url=url, headers=headers, req_body=body)
        except Exception as conn_err:
            logger.error(f"[ThinkProxy] Upstream LLM connection error: {conn_err}")
            return _openai_error(503, "Upstream connection failed", "service_unavailable", "upstream_connect_error")

        if upstream_resp.status_code >= 400:
            err_content = await upstream_resp.aread()
            await upstream_resp.aclose()
            logger.error(
                f"[ThinkProxy] Upstream LLM returned HTTP {upstream_resp.status_code}: "
                f"{err_content.decode(errors='replace')[:500]}"
            )
            # Non-2xx: do NOT commit routing state
            return _openai_error(
                upstream_resp.status_code,
                f"Upstream LLM error: {upstream_resp.status_code}",
                "upstream_error",
                upstream_resp.status_code,
            )

        return StreamingResponse(
            _relay_upstream_stream(upstream_resp, commit_callback=_commit_state),
            media_type="text/event-stream"
        )
    else:
        # Real upstream non-streaming call
        body["stream"] = False
        client = get_shared_http_client()
        try:
            resp = await client.post(url, headers=headers, json=body)
        except Exception as conn_err:
            logger.error(f"[ThinkProxy] Upstream LLM connection error: {conn_err}")
            return _openai_error(503, "Upstream connection failed", "service_unavailable", "upstream_connect_error")

        if resp.status_code >= 400:
            logger.error(f"[ThinkProxy] Upstream LLM returned error {resp.status_code}: {resp.text}")
            # Do NOT commit state
            return _openai_error(
                resp.status_code, f"Upstream LLM error: {resp.status_code}", "upstream_error", resp.status_code
            )

        _commit_state()
        return resp.json()
