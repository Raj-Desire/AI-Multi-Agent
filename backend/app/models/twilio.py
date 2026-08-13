from datetime import datetime
from pydantic import BaseModel, ConfigDict

class TwilioConfiguration(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    account_sid: str
    encrypted_auth_token: str
    phone_number: str
    status: str = "CONNECTED"
    created_at: datetime
    updated_at: datetime
