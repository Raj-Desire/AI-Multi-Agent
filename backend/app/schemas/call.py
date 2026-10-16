from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class MakeCallRequest(BaseModel):
    to: str
    from_number: Optional[str] = None
    prompt: Optional[str] = None
    agent_id: Optional[str] = None

class CallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    user_id: str
    twilio_configuration_id: str
    call_sid: Optional[str] = None
    session_id: Optional[str] = None
    call_session_id: Optional[str] = None
    from_number: str
    to_number: str
    duration: int
    prompt: Optional[str] = None
    status: str
    prospect_id: Optional[str] = None
    campaign_id: Optional[str] = None
    agent_id: Optional[str] = None
    agent_version: Optional[int] = 1
    agent_name: Optional[str] = None
    agent_scope: Optional[str] = None
    agent_config_snapshot: Optional[Dict[str, Any]] = None
    transcript: Optional[List[Dict[str, Any]]] = None
    outcome: Optional[str] = None
    business_outcome: Optional[str] = None
    summary: Optional[str] = None
    key_insights: Optional[List[str]] = None
    key_requirements: Optional[List[str]] = None
    customer_questions: Optional[List[str]] = None
    objections: Optional[List[str]] = None
    important_info: Optional[str] = None
    next_action: Optional[str] = None
    intent: Optional[str] = None
    sentiment: Optional[str] = None
    lead_score: Optional[int] = None
    interest_level: Optional[str] = None
    classification: Optional[str] = None
    callback_datetime: Optional[str] = None
    analytics_status: Optional[str] = "ready"
    analytics: Optional[Dict[str, Any]] = None
    latency_metrics: Optional[Dict[str, Any]] = None
    error_information: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


# Heavy fields that list views never need. They are OMITTED (not nulled) so a client can merge a list row
# over an already-loaded full record without wiping its details.
HEAVY_CALL_FIELDS = {
    "agent_config_snapshot", "transcript", "analytics", "latency_metrics", "error_information",
    "key_insights", "key_requirements", "customer_questions", "objections", "important_info",
}


def slim_call_dict(call) -> dict:
    """Summary row for call tables: everything except the heavy payload fields."""
    return CallResponse.model_validate(call).model_dump(mode="json", exclude=HEAVY_CALL_FIELDS)
