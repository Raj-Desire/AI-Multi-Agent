from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from app.models.prospect import Prospect


class LeadKPISummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_leads: int = 0
    interested: int = 0
    callback_requested: int = 0
    needs_follow_up: int = 0
    not_interested: int = 0
    no_answer: int = 0
    avg_lead_score: float = 0.0
    avg_call_duration_seconds: int = 0

    # Comparison metrics (% change vs previous period, null if not comparable)
    total_leads_change_pct: Optional[float] = None
    interested_change_pct: Optional[float] = None
    callback_change_pct: Optional[float] = None
    needs_follow_up_change_pct: Optional[float] = None
    not_interested_change_pct: Optional[float] = None
    no_answer_change_pct: Optional[float] = None

    period_label: str = "Last 7 Days"
    comparison_label: Optional[str] = "vs Previous 7 Days"


class LeadTrendPoint(BaseModel):
    date: str  # YYYY-MM-DD or HH:00
    display_label: str  # e.g. "Sep 1" or "10:00 AM"
    total_leads: int = 0
    interested: int = 0
    callback_requested: int = 0
    needs_follow_up: int = 0
    not_interested: int = 0
    no_answer: int = 0


class LeadTrendsResponse(BaseModel):
    metric: str
    points: List[LeadTrendPoint]
    total_data_points: int


class LeadOutcomeDistributionItem(BaseModel):
    outcome: str
    count: int
    percentage: float
    color_hint: str


class LeadOutcomeDistributionResponse(BaseModel):
    total_analyzed_calls: int
    distribution: List[LeadOutcomeDistributionItem]


class CampaignLeadStat(BaseModel):
    campaign_id: str
    campaign_name: str
    status: str = "active"
    total_leads: int = 0
    interested: int = 0
    callback_requested: int = 0
    needs_follow_up: int = 0
    not_interested: int = 0
    no_answer: int = 0
    conversion_rate: float = 0.0
    last_lead_at: Optional[datetime] = None


class AgentLeadStat(BaseModel):
    agent_id: str
    agent_name: str
    total_calls: int = 0
    interested_leads: int = 0
    callback_leads: int = 0
    avg_lead_score: float = 0.0


class LeadListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prospect_id: str
    full_name: str
    company: Optional[str] = None
    phone_number: str
    email: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    business_outcome: str
    interest_level: str
    lead_score: int
    last_call_id: Optional[str] = None
    last_call_at: Optional[datetime] = None
    last_call_duration: int = 0
    next_action: Optional[str] = None
    prospect_status: str
    callback_datetime: Optional[str] = None
    summary: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class LeadListPaginationResponse(BaseModel):
    items: List[LeadListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool = False
    has_prev: bool = False


class CallbackListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prospect_id: str
    full_name: str
    company: Optional[str] = None
    phone_number: str
    email: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    requested_datetime: Optional[str] = None
    last_call_at: Optional[datetime] = None
    summary: Optional[str] = None
    next_action: Optional[str] = None
    business_outcome: str
    interest_level: str
    lead_score: int
    prospect_status: str


class CallbackListPaginationResponse(BaseModel):
    items: List[CallbackListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class LeadHighlightEvidence(BaseModel):
    icon: str = "check"
    text: str


class LeadDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Prospect Info
    prospect: Prospect
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None

    # Latest AI Intelligence
    latest_call_id: Optional[str] = None
    latest_call_at: Optional[datetime] = None
    business_outcome: str
    interest_level: str
    lead_score: int
    summary: Optional[str] = None
    intent: Optional[str] = None
    sentiment: Optional[str] = None
    key_insights: List[str] = Field(default_factory=list)
    key_requirements: List[str] = Field(default_factory=list)
    customer_questions: List[str] = Field(default_factory=list)
    objections: List[str] = Field(default_factory=list)
    important_info: Optional[str] = None
    next_action: Optional[str] = None
    callback_datetime: Optional[str] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None

    # "Why this lead is highlighted" synthesized evidence
    highlight_reasons: List[LeadHighlightEvidence] = Field(default_factory=list)

    # Full Turn-by-Turn Transcript
    transcript: List[Dict[str, Any]] = Field(default_factory=list)

    # Past Call History
    call_history: List[Dict[str, Any]] = Field(default_factory=list)


class LeadActionRequest(BaseModel):
    status: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    callback_datetime: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[List[str]] = None
    assigned_owner: Optional[str] = None
