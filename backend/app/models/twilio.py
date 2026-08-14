from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class TwilioConfiguration(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    account_sid: str
    encrypted_auth_token: str
    phone_number: str
    twiml_app_sid: Optional[str] = None
    api_key_sid: Optional[str] = None
    encrypted_api_key_secret: Optional[str] = None
    public_base_url: Optional[str] = None
    status: str = "CONNECTED"
    created_at: datetime
    updated_at: datetime
