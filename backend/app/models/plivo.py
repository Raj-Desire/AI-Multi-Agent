from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


class PlivoConfiguration(BaseModel):
    """An organization's Plivo account. Mirrors TwilioConfiguration for the fields used outside the adapters."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    auth_id: str
    encrypted_auth_token: str
    phone_number: str  # comma-separated list of numbers owned by this organization
    application_id: Optional[str] = None
    public_base_url: Optional[str] = None
    inbound_forward_mode: Optional[str] = "global"  # "global", "per_number", or "disabled"
    inbound_forward_global_number: Optional[str] = None
    inbound_forward_mapping: Optional[Dict[str, str]] = None
    default_agent_id: Optional[str] = None
    inbound_agent_mapping: Optional[Dict[str, str]] = None
    escalation_alerts_enabled: Optional[bool] = True
    escalation_alert_email: Optional[str] = None
    status: str = "CONNECTED"
    created_at: datetime
    updated_at: datetime
