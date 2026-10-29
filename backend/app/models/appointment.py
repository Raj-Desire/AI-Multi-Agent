from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class Appointment(BaseModel):
    """A meeting or agreed call-back extracted from a call. Partitioned by organization_id."""
    id: str                                  # "appt_{call_id}" so re-analysis updates instead of duplicating
    organization_id: str
    type: str = "meeting"                    # meeting | callback
    status: str = "scheduled"                # scheduled | cancelled (missed is derived at read time)
    start_at_utc: str                        # "YYYY-MM-DDTHH:MM:SSZ" (sortable string)
    end_at_utc: str
    timezone: str = "UTC"                    # IANA zone the time was agreed in
    title: str = ""
    prospect_id: Optional[str] = None
    prospect_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    call_id: Optional[str] = None
    source: str = "call_analysis"
    summary: Optional[str] = None
    next_action: Optional[str] = None
    confidence: str = "confirmed"
    history: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
