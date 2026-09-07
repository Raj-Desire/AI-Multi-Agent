from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, Field


class ProspectStatus(str, Enum):
    NEW = "New"
    CONTACTED = "Contacted"
    CONNECTED = "Connected"
    INTERESTED = "Interested"
    NOT_INTERESTED = "Not Interested"
    CALLBACK_REQUESTED = "Callback Requested"
    QUALIFIED = "Qualified"
    CONVERTED = "Converted"
    DO_NOT_CONTACT = "Do Not Contact"
    INVALID = "Invalid"


class ProspectSource(str, Enum):
    MANUAL = "Manual"
    CSV_IMPORT = "CSV Import"
    API = "API"
    WEB_FORM = "Web Form"
    CAMPAIGN = "Campaign"
    INBOUND_CALL = "Inbound Call"
    OTHER = "Other"


class Prospect(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    # Identity
    id: str
    organization_id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str

    # Contact Info
    phone_number: str
    normalized_phone: str
    email: Optional[str] = None
    alternate_phone: Optional[str] = None

    # Business Information
    company: Optional[str] = None
    job_title: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None

    # CRM Information
    status: ProspectStatus = ProspectStatus.NEW
    source: ProspectSource = ProspectSource.MANUAL
    group_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    assigned_owner: Optional[str] = None

    # Extensible Custom Fields (key-value dictionary)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

    # Calling & Activity Metrics
    last_contacted_at: Optional[datetime] = None
    next_follow_up_at: Optional[datetime] = None
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    last_call_id: Optional[str] = None
    last_call_outcome: Optional[str] = None

    # System & Audit Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    @property
    def is_dnc(self) -> bool:
        return self.status == ProspectStatus.DO_NOT_CONTACT
