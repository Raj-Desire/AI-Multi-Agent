from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class KeySlot(BaseModel):
    encrypted_api_key: str = ""
    key_hint: str = ""
    source: Literal["own", "imported"] = "own"
    imported_at: Optional[datetime] = None
    status: Literal["unverified", "valid", "invalid"] = "unverified"
    last_verified_at: Optional[datetime] = None


class VoiceCredentials(BaseModel):
    organization_id: str
    tts_engine: Literal["aura", "cartesia"] = "aura"
    credential_mode: Literal["platform", "own"] = "own"
    engine: KeySlot = Field(default_factory=KeySlot)
    tts: KeySlot = Field(default_factory=KeySlot)
    allow_org_edit: bool = False
    custom_pipeline_enabled: bool = False
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None


class ResolvedVoiceProfile(BaseModel):
    tts_engine: str
    engine_key: str
    tts_key: Optional[str] = None
    source: Literal["own", "platform"]
    billed_to: Literal["org_own_key", "platform"]
    custom_pipeline_allowed: bool = False


class VoiceCredentialsMissing(Exception):
    """Raised when an organization has no usable voice credentials configured."""

    def __init__(self, message: str = "Voice credentials are not configured for this organization"):
        super().__init__(message)
