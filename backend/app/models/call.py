from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class Call(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    user_id: str
    twilio_configuration_id: str
    call_sid: Optional[str] = None
    from_number: str
    to_number: str
    duration: int = 0  # Talking time in seconds
    prompt: Optional[str] = None
    status: str = "initiated"
    created_at: datetime
    updated_at: datetime
