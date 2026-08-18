from typing import Optional, Dict
from pydantic import BaseModel, ConfigDict

class SaveTwilioConfigRequest(BaseModel):
    account_sid: str
    auth_token: str
    phone_number: str
    twiml_app_sid: Optional[str] = None
    api_key_sid: Optional[str] = None
    api_key_secret: Optional[str] = None
    public_base_url: Optional[str] = None
    inbound_forward_mode: Optional[str] = "global"
    inbound_forward_global_number: Optional[str] = None
    inbound_forward_mapping: Optional[Dict[str, str]] = None
    default_agent_id: Optional[str] = None
    inbound_agent_mapping: Optional[Dict[str, str]] = None

class TwilioConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_sid: str
    auth_token_masked: str
    phone_number: str
    twiml_app_sid: Optional[str] = None
    api_key_sid: Optional[str] = None
    api_key_secret_masked: Optional[str] = None
    public_base_url: Optional[str] = None
    inbound_forward_mode: Optional[str] = "global"
    inbound_forward_global_number: Optional[str] = None
    inbound_forward_mapping: Optional[Dict[str, str]] = None
    default_agent_id: Optional[str] = None
    inbound_agent_mapping: Optional[Dict[str, str]] = None
    status: str
