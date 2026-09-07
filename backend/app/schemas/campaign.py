from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.campaign import (
    CampaignStatus,
    CampaignMemberStatus,
    CampaignEventType,
    CampaignCallingConfig,
    CampaignSchedule,
    CampaignStats,
)


class ProspectSelectionFilter(BaseModel):
    select_all: bool = False
    prospect_ids: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    statuses: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    exclude_dnc: bool = True


class CreateCampaignRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Campaign Name")
    description: Optional[str] = None
    calling_config: CampaignCallingConfig
    schedule: CampaignSchedule
    prospect_selection: ProspectSelectionFilter = Field(default_factory=ProspectSelectionFilter)
    start_immediately: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Campaign name cannot be empty.")
        return cleaned


class UpdateCampaignRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    calling_config: Optional[CampaignCallingConfig] = None
    schedule: Optional[CampaignSchedule] = None


class AddCampaignMembersRequest(BaseModel):
    prospect_selection: ProspectSelectionFilter


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    status: str
    calling_config: CampaignCallingConfig
    schedule: CampaignSchedule
    stats: CampaignStats
    last_dispatched_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class CampaignPaginationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: List[CampaignResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool


class CampaignMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    organization_id: str
    prospect_id: str
    prospect_name: str
    phone_number: str
    normalized_phone: str
    status: str
    attempts: int
    last_attempt_at: Optional[datetime] = None
    next_attempt_at: Optional[datetime] = None
    last_call_id: Optional[str] = None
    last_call_outcome: Optional[str] = None
    last_call_duration: int = 0
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CampaignMemberListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: List[CampaignMemberResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CampaignEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    organization_id: str
    event_type: str
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime
