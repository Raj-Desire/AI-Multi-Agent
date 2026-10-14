from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

class AssignCreditsRequest(BaseModel):
    total_minutes: int = Field(..., ge=0, description="Total subscription credit minutes")
    plan_name: str = Field(default="Standard", description="Plan name: Starter, Professional, Enterprise, Custom")
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    is_enforced: bool = Field(default=True, description="Enable credit limit enforcement")
    exhausted_action: Literal["block", "warn_only"] = Field(default="block", description="Action when balance is 0")
    low_threshold_pct: int = Field(default=20, ge=5, le=50, description="Warning threshold percentage")
    max_agents: Optional[int] = Field(default=None, description="Max agents allowed or null for unlimited")
    max_campaigns: Optional[int] = Field(default=None, description="Max campaigns allowed or null for unlimited")
    reason: Optional[str] = Field(default=None, description="Reason note for audit log")

class TopUpCreditsRequest(BaseModel):
    add_minutes: int = Field(..., ge=1, description="Minutes to add to total balance")
    reason: Optional[str] = Field(default=None, description="Audit reason note")

class DeductCreditsRequest(BaseModel):
    deduct_minutes: int = Field(..., ge=1, description="Minutes to deduct from total balance")
    reason: Optional[str] = Field(default=None, description="Audit reason note")

class ToggleEnforcementRequest(BaseModel):
    is_enforced: bool
    exhausted_action: Literal["block", "warn_only"] = "block"

class ResetUsageRequest(BaseModel):
    reason: Optional[str] = Field(default="Billing cycle reset", description="Audit reason note")

class OrgCreditStatusResponse(BaseModel):
    organization_id: str
    org_name: str
    plan_name: str
    total_credits_minutes: int
    used_minutes: float
    remaining_minutes: float
    usage_percentage: float
    status: str
    is_credit_enforced: bool
    credit_exhausted_action: str
    low_credit_threshold_pct: int
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    max_agents_allowed: Optional[int] = None
    max_campaigns_allowed: Optional[int] = None
    updated_at: Optional[str] = None

class SuperAdminOrgCreditItem(OrgCreditStatusResponse):
    total_agents: int = 0
    total_campaigns: int = 0
    total_calls: int = 0
    last_assigned_by: Optional[str] = None
    last_assigned_at: Optional[str] = None
