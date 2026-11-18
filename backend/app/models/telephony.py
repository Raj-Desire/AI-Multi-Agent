from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class TelephonySettings(BaseModel):
    """Which telephony provider an organization places and receives calls through. Absent document means Twilio."""

    organization_id: str
    provider: Literal["twilio", "plivo"] = "twilio"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
