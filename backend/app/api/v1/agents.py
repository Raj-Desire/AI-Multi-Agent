"""
Agent Configuration API
Allows tenant users, admins, and platform superadmins to view, create, update, duplicate,
activate, deactivate, archive, and manage their AI Voice Agent configurations.
"""

from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.dependencies import TenantContext, get_tenant_context
from app.schemas.common import ApiResponse
from app.agents.configuration import AgentConfiguration
from app.services.agent_service import AgentService
from app.repositories.agent_repository import AgentRepository
from app.agents.prompt_builder import VoicePromptBuilder

router = APIRouter(prefix="/agents", tags=["Agents"])

agent_repo = AgentRepository()
agent_service = AgentService(agent_repo)


class GeneratePromptRequest(BaseModel):
    name: Optional[str] = "Voice Agent"
    role: Optional[str] = "Professional Assistant"
    objective: str
    communication_style: Optional[str] = "Professional + Friendly"


class GeneratedPromptResponse(BaseModel):
    system_prompt: str
    suggested_greeting: str
    positive_flow: str
    negative_flow: str


@router.post("/generate-prompt", response_model=ApiResponse[GeneratedPromptResponse])
async def generate_prompt(
    payload: GeneratePromptRequest,
    ctx: TenantContext = Depends(get_tenant_context)
):
    """
    Synthesizes a structured telephone call script and prompt instructions based on the primary objective.
    Maps call handling branches: positive responses, negative/objection responses, clarification, and polite closure.
    """
    if not payload.objective or not payload.objective.strip():
        raise HTTPException(status_code=400, detail="Primary objective is required to generate prompt.")

    obj = payload.objective.strip()
    role = payload.role or "Representative"
    name = payload.name or "Desire AI Voice Assistant"
    style = payload.communication_style or "Professional + Friendly"

    # Produce structured voice prompt
    system_prompt = f"""You are {name}, a {role} representing our organization.

PRIMARY OBJECTIVE:
{obj}

COMMUNICATION & CADENCE:
- Tone: {style}
- Speak in strictly 1 to 2 short, crisp, natural conversational sentences per turn.
- NEVER use markdown, bullet points, numbers, asterisks, bold text, or long speeches.
- Speak in plain, clear spoken English at a relaxed pace. Never overwhelm the caller.

STRUCTURED CALL FLOW:
1. GREETING & CONTEXT:
   - Greet the caller warmly, state who you are and where you are calling from, and clearly state the reason for the call in one sentence.

2. IF CUSTOMER RESPONDS POSITIVELY (e.g. Yes, confirmed, received, interested):
   - Acknowledge warmly with gratitude.
   - Ask the next relevant verification question or confirm if they require any guidance or further assistance.
   - Complete the follow-up step and confirm satisfaction.

3. IF CUSTOMER RESPONDS NEGATIVELY / REPORTS A PROBLEM (e.g. No, haven't received, not interested, busy):
   - Empathize immediately without arguing (e.g. "I understand, thank you for letting me know.")
   - Offer the immediate resolution or note down their issue for escalation.
   - If they are busy, ask for a convenient time to follow up.

4. IF CUSTOMER ASKS QUESTIONS / ASKS FOR CLARIFICATION:
   - Provide direct, concise answers in 1 simple sentence.
   - Do not guess or fabricate information. If unsure, offer to have a specialist reach back out.

5. POLITE CLOSING:
   - Thank the customer for their time, provide any reference or next step, and close warmly."""

    # Default greeting derived from objective
    suggested_greeting = f"Hello! This is {name}. I am following up regarding {obj[:60]}... How are you doing today?"

    return ApiResponse.ok(GeneratedPromptResponse(
        system_prompt=system_prompt,
        suggested_greeting=suggested_greeting,
        positive_flow="Acknowledges, verifies receipt/details, and offers next steps or assistance.",
        negative_flow="Empathizes, captures missing items or concerns, and offers resolution or callback."
    ))


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
