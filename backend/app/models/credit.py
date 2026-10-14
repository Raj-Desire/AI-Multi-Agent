from datetime import datetime, timezone
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field

class OrgResourceCounters(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    total_agents: int = 0
    max_agents_allowed: Optional[int] = None  # None = unlimited
    total_campaigns: int = 0
    max_campaigns_allowed: Optional[int] = None
    total_calls_count: int = 0
    total_billed_minutes: float = 0.0

class OrgCredits(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str                                         # e.g. "credits_{org_id}"
    organization_id: str
    org_name: str = ""
    
    # Minutes & Seconds Accounting
    total_credits_minutes: int = 0
    used_credits_seconds: int = 0
    
    # Subscription metadata
    plan_name: str = "Standard"                     # "Starter", "Professional", "Enterprise", "Custom"
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    credit_period_start: Optional[datetime] = None
    credit_period_end: Optional[datetime] = None
    auto_renew: bool = False
    
    # Enforcement & Alerts
    is_credit_enforced: bool = True
    credit_exhausted_action: Literal["block", "warn_only"] = "block"
    low_credit_threshold_pct: int = 20              # Warn when remaining < 20%
    
    # Resource Limits
    max_agents_allowed: Optional[int] = None
    max_campaigns_allowed: Optional[int] = None

    # Audit
    last_assigned_by: Optional[str] = None
    last_assigned_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def remaining_credits_seconds(self) -> int:
        total_sec = self.total_credits_minutes * 60
        return max(0, total_sec - self.used_credits_seconds)

    @property
    def remaining_minutes(self) -> float:
        return round(self.remaining_credits_seconds / 60.0, 2)

    @property
    def used_minutes(self) -> float:
        return round(self.used_credits_seconds / 60.0, 2)

    @property
    def usage_percentage(self) -> float:
        if self.total_credits_minutes <= 0:
            return 100.0 if self.used_credits_seconds > 0 else 0.0
        used_min = self.used_credits_seconds / 60.0
        pct = (used_min / self.total_credits_minutes) * 100.0
        return min(100.0, round(pct, 1))

    @property
    def status(self) -> Literal["healthy", "warning", "critical", "exhausted"]:
        if self.remaining_credits_seconds <= 0 and self.total_credits_minutes > 0:
            return "exhausted"
        pct = self.usage_percentage
        if pct >= 95.0:
            return "critical"
        if pct >= (100 - self.low_credit_threshold_pct):
            return "warning"
        return "healthy"

class LedgerEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str                                         # "ledger_{call_id}"
    organization_id: str
    call_id: str
    call_sid: Optional[str] = None
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    campaign_id: Optional[str] = None
    
    # Consumption metrics
    duration_seconds: int = 0
    credits_consumed_seconds: int = 0
    credits_consumed_minutes: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    
    # Balances at time of call
    balance_before_seconds: int = 0
    balance_after_seconds: int = 0
    
    # Partitioning & Time Dimension
    date_key: str = ""                              # "YYYY-MM-DD"
    hour_key: int = 0                               # 0-23
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CreditAssignmentLog(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    organization_id: str
    action: Literal["assign", "add", "deduct", "reset", "plan_change", "toggle_enforcement"]
    previous_total_minutes: int
    new_total_minutes: int
    delta_minutes: int
    previous_used_seconds: int
    new_used_seconds: int
    assigned_by_user: str
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
