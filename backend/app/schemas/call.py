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
    from_number: str
    to_number: str
    duration: int
    prompt: Optional[str] = None
    status: str
    agent_id: Optional[str] = None
    agent_version: Optional[int] = 1
    agent_name: Optional[str] = None
    agent_scope: Optional[str] = None
    agent_config_snapshot: Optional[Dict[str, Any]] = None
    transcript: Optional[List[Dict[str, Any]]] = None
    outcome: Optional[str] = None
    latency_metrics: Optional[Dict[str, Any]] = None
    error_information: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
