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

class AutoSetupTwilioRequest(BaseModel):
    account_sid: str
    auth_token: str
    friendly_name: Optional[str] = "AI Calling Platform"

class AutoSetupResponse(BaseModel):
    account_sid: str
    phone_numbers_found: int
    phone_numbers: list[str]
    twiml_app_sid: str
    api_key_sid: str
    voice_webhook_url: str
    status: str
    message: str

class TwilioBalanceResponse(BaseModel):
    configured: bool
    account_sid: Optional[str] = None
    balance: Optional[str] = None
    currency: Optional[str] = "USD"
    error: Optional[str] = None
    message: Optional[str] = None
