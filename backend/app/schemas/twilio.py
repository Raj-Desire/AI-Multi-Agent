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
    escalation_alerts_enabled: Optional[bool] = True
    escalation_alert_email: Optional[str] = None

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
    escalation_alerts_enabled: Optional[bool] = True
    escalation_alert_email: Optional[str] = None
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

class TwilioUsageRecordItem(BaseModel):
    category: str
    description: Optional[str] = None
    count: Optional[str] = "0"
    count_unit: Optional[str] = None
    usage: Optional[str] = "0"
    usage_unit: Optional[str] = None
    price: float = 0.0
    price_unit: str = "USD"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_fixed_recurring: bool = False

class TwilioPhoneNumberDetail(BaseModel):
    phone_number: str
    friendly_name: Optional[str] = None
    country_code: str
    country_name: str
    flag_emoji: str
    number_type: str
    monthly_rental_usd: float
    capabilities: Dict[str, bool] = {}
    date_created: Optional[str] = None

class TwilioFixedChargesSummary(BaseModel):
    total_fixed_cost: float = 0.0
    phone_numbers_cost: float = 0.0
    active_numbers_count: int = 0
    phone_numbers: list[TwilioPhoneNumberDetail] = []
    details: list[TwilioUsageRecordItem] = []

class TwilioDirectAccountUsageResponse(BaseModel):
    configured: bool
    organization_id: Optional[str] = None
    org_name: Optional[str] = None
    account_sid: Optional[str] = None
    friendly_name: Optional[str] = None
    currency: str = "USD"
    current_balance: Optional[float] = None
    time_range: str = "this_month"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_spend: float = 0.0
    fixed_recurring_spend: float = 0.0
    variable_usage_spend: float = 0.0
    fixed_charges: TwilioFixedChargesSummary
    phone_numbers: list[TwilioPhoneNumberDetail] = []
    records: list[TwilioUsageRecordItem] = []
    error: Optional[str] = None
    message: Optional[str] = None


