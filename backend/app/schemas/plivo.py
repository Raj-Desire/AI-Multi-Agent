from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


class SavePlivoConfigRequest(BaseModel):
    auth_id: str
    auth_token: str
    phone_number: str = ""
    application_id: Optional[str] = None
    public_base_url: Optional[str] = None
    inbound_forward_mode: Optional[str] = "global"
    inbound_forward_global_number: Optional[str] = None
    inbound_forward_mapping: Optional[Dict[str, str]] = None
    default_agent_id: Optional[str] = None
    inbound_agent_mapping: Optional[Dict[str, str]] = None
    escalation_alerts_enabled: Optional[bool] = True
    escalation_alert_email: Optional[str] = None


class PlivoConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    auth_id: str
    auth_token_masked: str
    phone_number: str
    application_id: Optional[str] = None
    public_base_url: Optional[str] = None
    inbound_forward_mode: Optional[str] = "global"
    inbound_forward_global_number: Optional[str] = None
    inbound_forward_mapping: Optional[Dict[str, str]] = None
    default_agent_id: Optional[str] = None
    inbound_agent_mapping: Optional[Dict[str, str]] = None
    escalation_alerts_enabled: Optional[bool] = True
    escalation_alert_email: Optional[str] = None
    status: str


class PlivoBalanceResponse(BaseModel):
    configured: bool
    balance: Optional[str] = None
    currency: Optional[str] = "USD"
    message: Optional[str] = None


class FetchPlivoNumbersRequest(BaseModel):
    auth_id: Optional[str] = None
    auth_token: Optional[str] = None


class SelectProviderRequest(BaseModel):
    provider: str


class ProviderResponse(BaseModel):
    provider: str
