from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Market = Literal["domestic", "international", "both"]


class TelephonySettings(BaseModel):
    """How an organization places and receives calls.

    market: "domestic" (carried by Plivo), "international" (Twilio) or "both" (a platform operator that picks the
    provider per call by the number used). `provider` is the default provider. An absent document means Twilio.
    """

    organization_id: str
    provider: Literal["twilio", "plivo"] = "twilio"
    market: Market = "international"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="before")
    @classmethod
    def _derive_market_from_provider(cls, data):
        # Settings saved before markets existed only have a provider.
        if isinstance(data, dict) and not data.get("market"):
            data = {**data, "market": "domestic" if data.get("provider") == "plivo" else "international"}
        return data
