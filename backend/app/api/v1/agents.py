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
from app.agents.configuration import AgentConfiguration
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


@router.get("/{agent_id}/versions", response_model=ApiResponse[Dict[str, Any]])
async def get_agent_versions(
    agent_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    service: AgentService = Depends(get_agent_service)
):
    """Fetches version and snapshot metadata for an agent."""
    agent = await service.get_agent_by_id(ctx, agent_id)
    return ApiResponse.ok({
        "agent_id": agent.agent_id,
        "name": agent.name,
        "current_version": agent.version,
        "status": agent.status,
        "updated_at": agent.updated_at
    })


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

