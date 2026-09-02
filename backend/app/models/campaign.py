from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, Field


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    STOPPED = "stopped"
    FAILED = "failed"


class CampaignMemberStatus(str, Enum):
    QUEUED = "queued"
    CALLING = "calling"
    COMPLETED = "completed"
    RETRYING = "retrying"
    UNANSWERED = "unanswered"
    FAILED = "failed"
    SKIPPED_DNC = "skipped_dnc"
    SKIPPED_INVALID = "skipped_invalid"


class CampaignEventType(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    STARTED = "started"
    PAUSED = "paused"
    RESUMED = "resumed"
    STOPPED = "stopped"
    COMPLETED = "completed"
    FAILED = "failed"
    CALL_DISPATCHED = "call_dispatched"
    CALL_COMPLETED = "call_completed"
    RETRY_SCHEDULED = "retry_scheduled"
    MEMBERS_ADDED = "members_added"


class CampaignCallingConfig(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    agent_id: str = Field(default="agt_receptionist_default", description="ID of the AI Voice Agent assigned to dial")
    caller_phone_number: str = Field(default="", description="Twilio phone number used as Caller ID")
    max_concurrent_calls: int = Field(default=5, ge=1, le=100, description="Max concurrent live calls allowed")
    max_attempts_per_prospect: int = Field(default=3, ge=1, le=20, description="Max dialing attempts before marking failed")
    retry_delay_minutes: int = Field(default=15, ge=0, description="Delay in minutes before retrying eligible unanswered calls")
    call_timeout_seconds: int = Field(default=30, ge=5, le=300, description="Ringing timeout before marking no answer")


class CampaignSchedule(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_date: Optional[str] = Field(default=None, description="ISO date (YYYY-MM-DD) when campaign can start")
    end_date: Optional[str] = Field(default=None, description="ISO date (YYYY-MM-DD) after which campaign stops")
    calling_days: List[str] = Field(
        default_factory=lambda: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        description="Allowed days of week for placing calls"
    )
    calling_start_time: str = Field(default="09:00", description="Start of calling window (HH:MM 24hr format)")
    calling_end_time: str = Field(default="18:00", description="End of calling window (HH:MM 24hr format)")
    timezone: str = Field(default="UTC", description="IANA Timezone (e.g. 'America/New_York', 'UTC', 'Asia/Kolkata')")


class CampaignStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_prospects: int = 0
    queued: int = 0
    calling: int = 0
    retrying: int = 0
    unanswered: int = 0
    completed: int = 0
    connected: int = 0
    failed: int = 0
    no_answer: int = 0
    busy: int = 0
    voicemail: int = 0
    callbacks: int = 0
    interested: int = 0
    warm_interested: int = 0
    highly_interested: int = 0
    not_interested: int = 0
    qualified: int = 0
    converted: int = 0
    follow_up_required: int = 0
    information_requested: int = 0
    dnc: int = 0
    connection_rate: float = 0.0  # percentage 0.0 - 100.0
    completion_rate: float = 0.0   # percentage 0.0 - 100.0
    avg_duration_seconds: int = 0


class Campaign(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    status: CampaignStatus = CampaignStatus.DRAFT

    # Configurations
    calling_config: CampaignCallingConfig
    schedule: CampaignSchedule

    # Live Aggregated Stats Cache
    stats: CampaignStats = Field(default_factory=CampaignStats)

    # Runtime Metadata
    last_dispatched_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    failure_reason: Optional[str] = None

    # Audit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class CampaignMember(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: str
    campaign_id: str
    organization_id: str
    prospect_id: str

    # Snapshot of prospect contact data for fast dialing without extra joins
    prospect_name: str
    phone_number: str
    normalized_phone: str

    status: CampaignMemberStatus = CampaignMemberStatus.QUEUED
    attempts: int = 0
    last_attempt_at: Optional[datetime] = None
    next_attempt_at: Optional[datetime] = None

    last_call_id: Optional[str] = None
    last_call_outcome: Optional[str] = None
    last_call_duration: int = 0
    last_error: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CampaignEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: str
    campaign_id: str
    organization_id: str
    event_type: CampaignEventType
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
