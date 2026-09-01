from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.models.prospect import ProspectStatus, ProspectSource


class CreateProspectRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: str
    email: Optional[str] = None
    alternate_phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    status: ProspectStatus = ProspectStatus.NEW
    source: ProspectSource = ProspectSource.MANUAL
    group_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    assigned_owner: Optional[str] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Phone number is required.")
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) < 7:
            raise ValueError("Phone number must contain at least 7 digits.")
        return v.strip()


class UpdateProspectRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    alternate_phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    status: Optional[ProspectStatus] = None
    source: Optional[ProspectSource] = None
    group_name: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    assigned_owner: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    next_follow_up_at: Optional[datetime] = None


class ProspectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str
    phone_number: str
    normalized_phone: str
    email: Optional[str] = None
    alternate_phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    status: str
    source: str
    group_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    assigned_owner: Optional[str] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    last_contacted_at: Optional[datetime] = None
    next_follow_up_at: Optional[datetime] = None
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    last_call_id: Optional[str] = None
    last_call_outcome: Optional[str] = None
    is_dnc: bool = False
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class ProspectPaginationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: List[ProspectResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool


class CSVValidateRowDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row_number: int
    is_valid: bool
    errors: List[str] = Field(default_factory=list)
    is_duplicate: bool = False
    duplicate_type: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class CSVValidateRequest(BaseModel):
    csv_content: str
    column_mapping: Dict[str, str] = Field(default_factory=dict)  # e.g. {"First Name": "first_name", "Phone": "phone_number"}


class CSVValidateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_rows: int
    valid_count: int
    invalid_count: int
    duplicate_count: int
    sample_rows: List[CSVValidateRowDetail] = Field(default_factory=list)
    all_errors: List[Dict[str, Any]] = Field(default_factory=list)


class CSVImportRequest(BaseModel):
    csv_content: str
    column_mapping: Dict[str, str] = Field(default_factory=dict)
    duplicate_policy: str = "skip"  # "skip" | "update"
    default_group_name: Optional[str] = None
    default_tags: List[str] = Field(default_factory=list)
    default_source: str = "CSV Import"


class CSVImportSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_rows: int
    imported_count: int
    updated_count: int
    skipped_count: int
    invalid_count: int
    errors: List[Dict[str, Any]] = Field(default_factory=list)


class BulkStatusUpdateRequest(BaseModel):
    prospect_ids: List[str]
    status: ProspectStatus


class BulkTagRequest(BaseModel):
    prospect_ids: List[str]
    tags: List[str]
    action: str = "add"  # "add" | "remove"


class BulkGroupUpdateRequest(BaseModel):
    prospect_ids: List[str]
    group_name: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    prospect_ids: List[str]


class AddTagRequest(BaseModel):
    tag: str


class DistinctGroupsResponse(BaseModel):
    groups: List[str] = Field(default_factory=list)

