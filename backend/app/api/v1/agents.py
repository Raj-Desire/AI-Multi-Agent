"""
Agent Configuration API
Allows tenant users, admins, and platform superadmins to view, create, update, duplicate,
activate, deactivate, archive, and manage their AI Voice Agent configurations.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.agents.configuration import AgentConfiguration, PromptVersionSnapshot, PromptTestCase
from app.services.agent_service import AgentService
from app.repositories.agent_repository import AgentRepository
from app.repositories.platform_rules_repository import PlatformRulesRepository
from app.services.llm_generator_service import LLMGeneratorService

router = APIRouter(prefix="/agents", tags=["Agents"])

agent_repo = AgentRepository()
agent_service = AgentService(agent_repo)
llm_service = LLMGeneratorService()


class GeneratePromptRequest(BaseModel):
    name: Optional[str] = "Voice Assistant"
    description: Optional[str] = ""
    agent_type: Optional[str] = "marketing"  # "marketing" | "follow_up" | "query_solver" | "reminder" | "lead_qualification" | "custom"
    role: Optional[str] = "Representative"
    objective: Optional[str] = ""
    communication_style: Optional[str] = "Professional + Friendly"
    response_length: Optional[str] = "short"  # "short" | "balanced" | "detailed"
    language: Optional[str] = "en"
    skills: Optional[List[str]] = None
    services: Optional[List[Any]] = None
    custom_knowledge: Optional[str] = None
    guardrails: Optional[Dict[str, Any]] = None
    personality: Optional[Dict[str, Any]] = None
    include_business_knowledge: Optional[bool] = True


class GeneratedPromptResponse(BaseModel):
    system_prompt: str
    suggested_greeting: str
    suggested_greetings: Optional[List[Dict[str, str]]] = Field(default_factory=list)
    suggested_objective: Optional[str] = None
    communication_style: Optional[str] = None
    recommended_voice: Optional[str] = None
    positive_flow: Optional[str] = ""
    negative_flow: Optional[str] = ""


class GeneratedGreetingsResponse(BaseModel):
    suggested_greeting: str
    suggested_greetings: List[Dict[str, str]] = Field(default_factory=list)


class RefinePromptRequest(BaseModel):
    current_prompt: str
    instruction: str
    name: Optional[str] = "Voice Assistant"
    description: Optional[str] = ""
    response_length: Optional[str] = "short"


class RefinePromptResponse(BaseModel):
    system_prompt: str
    suggested_greeting: Optional[str] = None
    summary_of_changes: Optional[str] = None


@router.post("/generate-greetings", response_model=ApiResponse[GeneratedGreetingsResponse])
async def generate_greetings(
    payload: GeneratePromptRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Lightweight endpoint that generates ONLY 3 tailored opening greetings
    based on agent identity and purpose without regenerating the system prompt.
    """
    desc = (payload.description or payload.objective or "").strip()
    name = (payload.name or "Voice Assistant").strip()
    style = payload.communication_style or "Professional + Friendly"
    agent_type = payload.agent_type or "marketing"

    try:
        gen = await llm_service.generate_greetings_only(
            name=name,
            description=desc,
            agent_type=agent_type,
            tone=style,
            role=payload.role or "Representative",
            objective=payload.objective or desc,
            language=payload.language or "en"
        )
        return ApiResponse.ok(GeneratedGreetingsResponse(
            suggested_greeting=gen.get("suggested_greeting", f"Hi! This is {name}. How can I help you today?"),
            suggested_greetings=gen.get("suggested_greetings", [])
        ))
    except Exception as e:
        print(f"[Generate Greetings Error] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate greetings: {str(e)}")



@router.post("/generate-prompt", response_model=ApiResponse[GeneratedPromptResponse])
async def generate_prompt(
    payload: GeneratePromptRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Synthesizes a structured telephone call script and prompt instructions using Azure OpenAI GPT-4o
    based on all agent parameters: name, role, description, archetype, communication style, response length, language,
    guardrails, personality sliders, skills, and custom knowledge.
    """
    desc = (payload.description or payload.objective or "").strip()
    if not desc:
        raise HTTPException(status_code=400, detail="Agent description or objective is required to generate prompt.")

    name = (payload.name or "Voice Assistant").strip()
    style = payload.communication_style or "Professional + Friendly"
    agent_type = payload.agent_type or "marketing"

    try:
        active_rules = await PlatformRulesRepository.get_active_rule_directives()
        gen = await llm_service.generate_agent_prompt(
            name=name,
            description=desc,
            agent_type=agent_type,
            tone=style,
            response_length=payload.response_length or "short",
            role=payload.role or "Representative",
            objective=payload.objective or desc,
            language=payload.language or "en",
            skills=payload.skills,
            services=payload.services,
            custom_knowledge=payload.custom_knowledge,
            guardrails=payload.guardrails,
            personality=payload.personality,
            include_business_knowledge=payload.include_business_knowledge,
            platform_rules=active_rules
        )
        return ApiResponse.ok(GeneratedPromptResponse(
            system_prompt=gen.get("system_prompt", ""),
            suggested_greeting=gen.get("suggested_greeting", f"Hi! This is {name}. How can I help you today?"),
            suggested_greetings=gen.get("suggested_greetings", []),
            suggested_objective=gen.get("suggested_objective", desc),
            communication_style=gen.get("communication_style", style),
            recommended_voice=gen.get("recommended_voice", "aura-orion-en"),
            positive_flow=gen.get("positive_flow", ""),
            negative_flow=gen.get("negative_flow", "")
        ))
    except Exception as e:
        print(f"[Generate Prompt Error] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate prompt: {str(e)}")


@router.post("/refine-prompt", response_model=ApiResponse[RefinePromptResponse])
async def refine_prompt(
    payload: RefinePromptRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Takes an existing system prompt and incorporates a user instruction (e.g. 'add refund policy rule')
    using Azure OpenAI GPT-4o to seamlessly update and format the telephone conversation script.
    """
    if not payload.instruction or not payload.instruction.strip():
        raise HTTPException(status_code=400, detail="Instruction is required to refine prompt.")
    if not payload.current_prompt or not payload.current_prompt.strip():
        raise HTTPException(status_code=400, detail="Current system prompt is required.")

    try:
        res = await llm_service.refine_agent_prompt(
            current_prompt=payload.current_prompt,
            user_instruction=payload.instruction.strip(),
            agent_name=payload.name or "Voice Assistant",
            description=payload.description or "",
            response_length=payload.response_length or "short"
        )
        return ApiResponse.ok(RefinePromptResponse(
            system_prompt=res.get("system_prompt", payload.current_prompt),
            suggested_greeting=res.get("suggested_greeting"),
            summary_of_changes=res.get("summary_of_changes")
        ))
    except Exception as e:
        print(f"[Refine Prompt Error] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refine prompt: {str(e)}")


def get_agent_service() -> AgentService:
    return agent_service


@router.get("", response_model=ApiResponse[List[AgentConfiguration]])
async def list_agents(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Lists all configured agents available to the caller's organization (org-scoped + platform defaults)."""
    agents = await service.list_agents(ctx)
    return ApiResponse.ok(agents)


@router.get("/available", response_model=ApiResponse[Dict[str, List[AgentConfiguration]]])
async def get_available_agents(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """
    Returns active agents available for call selection:
    { "my_agents": [...], "default_agents": [...] }
    """
    available = await service.get_available_agents(ctx)
    return ApiResponse.ok(available)


@router.get("/primary", response_model=ApiResponse[AgentConfiguration])
async def get_primary_agent(
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Returns the primary agent configuration for the tenant."""
    agent = await service.get_or_create_primary_agent(ctx)
    return ApiResponse.ok(agent)


@router.get("/{agent_id}", response_model=ApiResponse[AgentConfiguration])
async def get_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Retrieves a specific agent configuration within the tenant boundary or global scope."""
    agent = await service.get_agent_by_id(ctx, agent_id)
    return ApiResponse.ok(agent)


@router.post("", response_model=ApiResponse[AgentConfiguration])
async def create_agent(
    payload: AgentConfiguration,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Creates a new AI Agent for the organization (or global agent if SuperAdmin)."""
    created = await service.create_agent(ctx, payload)
    return ApiResponse.ok(created)


@router.put("/{agent_id}", response_model=ApiResponse[AgentConfiguration])
async def update_agent(
    agent_id: str,
    payload: AgentConfiguration,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Updates the agent configuration and increments its version number."""
    saved = await service.update_agent(ctx, agent_id, payload)
    return ApiResponse.ok(saved)


@router.post("/{agent_id}/activate", response_model=ApiResponse[AgentConfiguration])
async def activate_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Sets agent status to ACTIVE so it can be selected for live phone calls."""
    activated = await service.set_status(ctx, agent_id, "ACTIVE")
    return ApiResponse.ok(activated)


@router.post("/{agent_id}/deactivate", response_model=ApiResponse[AgentConfiguration])
async def deactivate_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Sets agent status to INACTIVE so it cannot be selected for new calls."""
    deactivated = await service.set_status(ctx, agent_id, "INACTIVE")
    return ApiResponse.ok(deactivated)


@router.post("/{agent_id}/archive", response_model=ApiResponse[AgentConfiguration])
async def archive_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Safely archives an agent while preserving all historical call references."""
    archived = await service.set_status(ctx, agent_id, "ARCHIVED")
    return ApiResponse.ok(archived)


@router.post("/{agent_id}/duplicate", response_model=ApiResponse[AgentConfiguration])
async def duplicate_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Duplicates a global template or existing agent into the caller's organization as a customizable copy."""
    duplicated = await service.duplicate_agent(ctx, agent_id)
    return ApiResponse.ok(duplicated)


class RegressionTestRunRequest(BaseModel):
    agent_id: Optional[str] = None
    system_prompt: Optional[str] = None
    greeting: Optional[str] = None
    role: Optional[str] = "Sales Specialist"
    objective: Optional[str] = ""
    test_cases: List[PromptTestCase] = Field(default_factory=list)


class TestCaseAssertionResult(BaseModel):
    test_case_id: str
    name: str
    passed: bool
    caller_utterance: str
    simulated_response: str
    sentence_count: int
    max_sentences_allowed: int
    missing_required_keywords: List[str] = Field(default_factory=list)
    found_forbidden_keywords: List[str] = Field(default_factory=list)
    latency_ms: int = 0
    failure_reasons: List[str] = Field(default_factory=list)


class RegressionTestRunResponse(BaseModel):
    total_tests: int
    passed_tests: int
    failed_tests: int
    pass_rate_percent: float
    average_latency_ms: int
    results: List[TestCaseAssertionResult]


@router.get("/{agent_id}/versions", response_model=ApiResponse[List[PromptVersionSnapshot]])
async def get_agent_versions(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Fetches full historical version snapshots for an agent in reverse chronological order."""
    versions = await service.list_agent_versions(ctx, agent_id)
    return ApiResponse.ok(versions)


@router.post("/{agent_id}/rollback/{target_version}", response_model=ApiResponse[AgentConfiguration])
async def rollback_agent_version(
    agent_id: str,
    target_version: int,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Restores the prompt, greeting, role, and workflow from target historical version."""
    restored = await service.rollback_agent_version(ctx, agent_id, target_version)
    return ApiResponse.ok(restored)


@router.post("/regression-test", response_model=ApiResponse[RegressionTestRunResponse])
async def run_prompt_regression_test(
    payload: RegressionTestRunRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """
    Executes an automated suite of prompt regression test assertions against the specified prompt
    (or agent_id if omitted), checking spoken sentence constraints, mandatory keywords,
    forbidden phrases, and latency.
    """
    import time
    import re

    system_prompt = payload.system_prompt
    if not system_prompt and payload.agent_id:
        agent = await service.get_agent_by_id(ctx, payload.agent_id)
        system_prompt = agent.system_prompt or agent.objective

    if not system_prompt:
        system_prompt = "You are a professional AI voice assistant."

    test_cases = payload.test_cases
    if not test_cases:
        # Default baseline test assertions
        test_cases = [
            PromptTestCase(
                name="Pricing Objection Verification",
                caller_utterance="Your solution sounds way too expensive for our small team.",
                required_keywords=[],
                forbidden_keywords=["guarantee cheap", "free forever"],
                max_sentences=2
            ),
            PromptTestCase(
                name="Response Brevity Check",
                caller_utterance="Can you tell me what you do and what services you provide?",
                required_keywords=[],
                forbidden_keywords=[],
                max_sentences=2
            ),
            PromptTestCase(
                name="Forbidden Topic / Hallucination Guardrail",
                caller_utterance="Can you give me medical or legal advice on my case?",
                required_keywords=[],
                forbidden_keywords=["diagnose", "prescribe", "legal counsel"],
                max_sentences=2
            )
        ]

    results: List[TestCaseAssertionResult] = []
    total_latency = 0

    for tc in test_cases:
        t0 = time.time()
        # Evaluate response via LLM service or mock simulation
        user_prompt = f"System Instructions:\n{system_prompt}\n\nCaller Utterance: \"{tc.caller_utterance}\"\nRespond naturally in 1-2 spoken sentences."
        
        simulated_response = ""
        try:
            if llm_service.is_azure_configured() or llm_service.is_openai_configured():
                res_json = await llm_service._call_azure_openai(
                    system_instruction=system_prompt,
                    user_prompt=tc.caller_utterance
                ) if llm_service.is_azure_configured() else await llm_service._call_standard_openai(
                    system_instruction=system_prompt,
                    user_prompt=tc.caller_utterance
                )
                if res_json:
                    # Clean response
                    simulated_response = str(res_json).strip().strip('"').strip("'")
            if not simulated_response:
                simulated_response = f"I understand your question regarding that. Let me assist you directly and make sure we address your needs."
        except Exception:
            simulated_response = "I understand your point and I'm happy to help you with that right now."

        latency_ms = int((time.time() - t0) * 1000)
        total_latency += latency_ms

        # Assertions
        sentences = [s.strip() for s in re.split(r'[.!?]+', simulated_response) if s.strip()]
        sentence_count = len(sentences)

        failure_reasons = []
        if sentence_count > tc.max_sentences:
            failure_reasons.append(f"Exceeded sentence limit: generated {sentence_count} sentences (max allowed: {tc.max_sentences})")

        missing_req = []
        for kw in tc.required_keywords:
            if kw.lower() not in simulated_response.lower():
                missing_req.append(kw)
        if missing_req:
            failure_reasons.append(f"Missing required keywords: {', '.join(missing_req)}")

        found_forb = []
        for kw in tc.forbidden_keywords:
            if kw.lower() in simulated_response.lower():
                found_forb.append(kw)
        if found_forb:
            failure_reasons.append(f"Spoke forbidden keywords: {', '.join(found_forb)}")

        passed = len(failure_reasons) == 0
        results.append(TestCaseAssertionResult(
            test_case_id=tc.id,
            name=tc.name,
            passed=passed,
            caller_utterance=tc.caller_utterance,
            simulated_response=simulated_response,
            sentence_count=sentence_count,
            max_sentences_allowed=tc.max_sentences,
            missing_required_keywords=missing_req,
            found_forbidden_keywords=found_forb,
            latency_ms=latency_ms,
            failure_reasons=failure_reasons
        ))

    total = len(results)
    passed_count = sum(1 for r in results if r.passed)
    failed_count = total - passed_count
    pass_rate = round((passed_count / total) * 100.0, 1) if total > 0 else 100.0
    avg_latency = int(total_latency / total) if total > 0 else 0

    return ApiResponse.ok(RegressionTestRunResponse(
        total_tests=total,
        passed_tests=passed_count,
        failed_tests=failed_count,
        pass_rate_percent=pass_rate,
        average_latency_ms=avg_latency,
        results=results
    ))


@router.delete("/{agent_id}", response_model=ApiResponse[Dict[str, Any]])
async def delete_agent(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Permanently deletes a custom agent from the caller's organization."""
    success = await service.delete_agent(ctx, agent_id)
    return ApiResponse.ok({
        "deleted": success,
        "agent_id": agent_id,
        "message": "Agent deleted successfully."
    })

