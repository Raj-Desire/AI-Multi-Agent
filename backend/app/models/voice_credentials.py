from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class KeySlot(BaseModel):
    encrypted_api_key: str = ""
    key_hint: str = ""
    source: Literal["own", "imported"] = "own"
    imported_at: Optional[datetime] = None
    status: Literal["unverified", "valid", "invalid"] = "unverified"
    last_verified_at: Optional[datetime] = None


DEFAULT_LLM_API_VERSION = "2024-08-01-preview"


class LlmSlot(BaseModel):
    """The organization's own language model settings (used only by the Economy plan). The key is stored encrypted."""

    endpoint: str = ""
    encrypted_api_key: str = ""
    key_hint: str = ""
    deployment: str = ""
    api_version: str = DEFAULT_LLM_API_VERSION
    status: Literal["unverified", "valid", "invalid"] = "unverified"
    last_verified_at: Optional[datetime] = None

    @property
    def configured(self) -> bool:
        return bool(self.endpoint and self.encrypted_api_key and self.deployment)


class VoiceCredentials(BaseModel):
    organization_id: str
    tts_engine: Literal["aura", "cartesia"] = "aura"
    credential_mode: Literal["platform", "own"] = "own"
    engine: KeySlot = Field(default_factory=KeySlot)
    tts: KeySlot = Field(default_factory=KeySlot)
    allow_org_edit: bool = False
    llm: LlmSlot = Field(default_factory=LlmSlot)
    # Voice plan of the organization: "managed" = Standard, "custom" = Economy. Single source of truth.
    voice_engine: Literal["managed", "custom"] = "managed"
    custom_pipeline_enabled: bool = False  # legacy input only: read when voice_engine is absent, then kept in sync
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_flag(cls, data):
        if isinstance(data, dict) and "voice_engine" not in data:
            data = {**data, "voice_engine": "custom" if data.get("custom_pipeline_enabled") else "managed"}
        return data

    @model_validator(mode="after")
    def _sync_legacy_flag(self):
        self.custom_pipeline_enabled = self.voice_engine == "custom"
        return self


class ResolvedVoiceProfile(BaseModel):
    tts_engine: str
    engine_key: str
    tts_key: Optional[str] = None
    source: Literal["own", "platform"]
    billed_to: Literal["org_own_key", "platform"]
    custom_pipeline_allowed: bool = False
    voice_engine: Literal["managed", "custom"] = "managed"
    # The organization's own language model settings, decrypted in memory only. Never log or return them.
    llm_endpoint: Optional[str] = None
    llm_api_key: Optional[str] = Field(None, repr=False)
    llm_deployment: Optional[str] = None
    llm_api_version: Optional[str] = None


class VoiceCredentialsMissing(Exception):
    """Raised when an organization has no usable voice credentials configured."""

    def __init__(self, message: str = "Voice credentials are not configured for this organization"):
        super().__init__(message)
