import asyncio
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from app.models.credit import OrgCredits, LedgerEntry, OrgResourceCounters
from app.models.call import Call
from app.repositories.credit_repository import CreditRepository
from app.repositories.agent_repository import AgentRepository
from app.repositories.campaign_repository import CampaignRepository
from app.services.cost_calculator import CostCalculatorService

class CreditService:
    def __init__(
        self,
        credit_repo: Optional[CreditRepository] = None,
        agent_repo: Optional[AgentRepository] = None,
        campaign_repo: Optional[CampaignRepository] = None
    ):
        self.repo = credit_repo or CreditRepository()
        self.agent_repo = agent_repo or AgentRepository()
        self.campaign_repo = campaign_repo or CampaignRepository()

    async def check_call_authorization(self, organization_id: str) -> Dict[str, Any]:
        """
        Pre-call check: Verifies if organization has sufficient credits to place a live call.
        """
        creds = await self.repo.get_or_create_org_credits(organization_id)

        if not creds.is_credit_enforced:
            return {
                "allowed": True,
                "warning": False,
                "remaining_minutes": creds.remaining_minutes,
                "remaining_seconds": creds.remaining_credits_seconds,
                "is_credit_enforced": False,
                "credit_exhausted_action": creds.credit_exhausted_action,
                "status": creds.status,
                "reason": "Credit enforcement is disabled for this organization."
            }

        # If credits exhausted
        if creds.remaining_credits_seconds <= 0:
            if creds.credit_exhausted_action == "block":
                return {
                    "allowed": False,
                    "code": "CREDIT_EXHAUSTED",
                    "remaining_minutes": 0.0,
                    "remaining_seconds": 0,
                    "is_credit_enforced": True,
                    "credit_exhausted_action": "block",
                    "status": "exhausted",
                    "reason": "You have reached your allocated organization calling limit (0 available minutes). Please contact your workspace administrator to top up your account."
                }
            else:
                # warn_only mode
                return {
                    "allowed": True,
                    "warning": True,
                    "remaining_minutes": 0.0,
                    "remaining_seconds": 0,
                    "is_credit_enforced": True,
                    "credit_exhausted_action": "warn_only",
                    "status": "exhausted",
                    "reason": "Credit limit reached (Warn-only mode active)."
                }

        # Check if running low (below threshold)
        is_low = creds.usage_percentage >= (100 - creds.low_credit_threshold_pct)
        return {
            "allowed": True,
            "warning": is_low,
            "remaining_minutes": creds.remaining_minutes,
            "remaining_seconds": creds.remaining_credits_seconds,
            "is_credit_enforced": creds.is_credit_enforced,
            "credit_exhausted_action": creds.credit_exhausted_action,
            "status": creds.status,
            "reason": "Low balance warning" if is_low else "Authorized"
        }

    async def can_create_agent(self, organization_id: str) -> bool:
        """Verifies if organization has not exceeded its max agents quota."""
        creds = await self.repo.get_or_create_org_credits(organization_id)
        if creds.max_agents_allowed is None:
            return True

        agents = await self.agent_repo.list_agents(organization_id, include_global=False)
        return len(agents) < creds.max_agents_allowed

    async def can_create_campaign(self, organization_id: str) -> bool:
        """Verifies if organization has not exceeded its max campaigns quota."""
        creds = await self.repo.get_or_create_org_credits(organization_id)
        if creds.max_campaigns_allowed is None:
            return True

        campaigns_res = await self.campaign_repo.list_by_org(organization_id)
        if isinstance(campaigns_res, tuple):
            campaigns_count = campaigns_res[1]
        elif isinstance(campaigns_res, list):
            campaigns_count = len(campaigns_res)
        else:
            campaigns_count = 0
        return campaigns_count < creds.max_campaigns_allowed

    async def process_completed_call(self, call: Call) -> None:
        """
        Post-call hook: Deducts talk time atomically and writes an itemized usage_ledger entry.
        """
        org_id = call.organization_id or "default"
        duration_sec = max(0, call.duration or 0)

        # 1. Compute itemized telemetry tokens and costs
        cost_metrics = CostCalculatorService.calculate_call_costs(call)
        input_tokens = cost_metrics.get("input_tokens", 0)
        output_tokens = cost_metrics.get("output_tokens", 0)
        total_tokens = cost_metrics.get("total_tokens", 0)
        estimated_cost = cost_metrics.get("total_cost", 0.0)

        # 2. Atomic deduction
        updated_creds = await self.repo.atomic_deduct_seconds(org_id, duration_sec)

        # 3. Write Ledger Entry
        now = datetime.now(timezone.utc)
        date_key = now.strftime("%Y-%m-%d")
        hour_key = now.hour

        balance_after = updated_creds.remaining_credits_seconds
        balance_before = balance_after + duration_sec

        entry = LedgerEntry(
            id=f"ledger_{call.id}",
            organization_id=org_id,
            call_id=call.id,
            call_sid=call.call_sid,
            user_id=call.user_id,
            agent_id=call.agent_id,
            agent_name=call.agent_name,
            campaign_id=call.campaign_id,
            duration_seconds=duration_sec,
            credits_consumed_seconds=duration_sec,
            credits_consumed_minutes=round(duration_sec / 60.0, 2),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=round(estimated_cost, 4),
            balance_before_seconds=balance_before,
            balance_after_seconds=balance_after,
            date_key=date_key,
            hour_key=hour_key,
            created_at=now
        )
        await self.repo.record_ledger_entry(entry)

    async def get_org_resource_counters(self, organization_id: str) -> OrgResourceCounters:
        """Aggregates live count of agents, campaigns, and total calls."""
        agents, campaigns_res, creds, ledger = await asyncio.gather(
            self.agent_repo.list_agents(organization_id, include_global=False),
            self.campaign_repo.list_by_org(organization_id),
            self.repo.get_or_create_org_credits(organization_id),
            self.repo.list_ledger(organization_id, limit=1000),
        )
        if isinstance(campaigns_res, tuple):
            campaigns_count = campaigns_res[1]
        elif isinstance(campaigns_res, list):
            campaigns_count = len(campaigns_res)
        else:
            campaigns_count = 0

        total_duration = sum(item.duration_seconds for item in ledger)

        return OrgResourceCounters(
            total_agents=len(agents),
            max_agents_allowed=creds.max_agents_allowed,
            total_campaigns=campaigns_count,
            max_campaigns_allowed=creds.max_campaigns_allowed,
            total_calls_count=len(ledger),
            total_billed_minutes=round(total_duration / 60.0, 2)
        )

    async def get_org_dashboard_data(self, organization_id: str, days: int = 30) -> Dict[str, Any]:
        """Aggregates all telemetry, credit status, counters, daily chart, and ledger for Org Dashboard."""
        # The four lookups are independent: run them concurrently instead of one after another
        creds, counters, daily_breakdown, recent_ledger = await asyncio.gather(
            self.repo.get_or_create_org_credits(organization_id),
            self.get_org_resource_counters(organization_id),
            self.repo.get_daily_usage_aggregates(organization_id, days=days),
            self.repo.list_ledger(organization_id, limit=50),
        )

        # Project depletion date
        projected_depletion_date = self._calculate_projected_depletion(
            creds.remaining_credits_seconds,
            recent_ledger
        )

        return {
            "organization_id": creds.organization_id,
            "org_name": creds.org_name,
            "plan_name": creds.plan_name,
            "total_credits_minutes": creds.total_credits_minutes,
            "used_minutes": creds.used_minutes,
            "remaining_minutes": creds.remaining_minutes,
            "usage_percentage": creds.usage_percentage,
            "status": creds.status,
            "is_credit_enforced": creds.is_credit_enforced,
            "credit_exhausted_action": creds.credit_exhausted_action,
            "low_credit_threshold_pct": creds.low_credit_threshold_pct,
            "period_start": creds.period_start.isoformat() if creds.period_start else None,
            "period_end": creds.period_end.isoformat() if creds.period_end else None,
            "counters": counters.model_dump(),
            "daily_metrics": daily_breakdown,
            "recent_ledger": [item.model_dump(mode="json") for item in recent_ledger],
            "projected_depletion_date": projected_depletion_date,
            "updated_at": creds.updated_at.isoformat() if creds.updated_at else None
        }

    def _calculate_projected_depletion(
        self,
        remaining_seconds: int,
        ledger: List[LedgerEntry]
    ) -> Optional[str]:
        if remaining_seconds <= 0 or not ledger:
            return None

        # Look at last 7 days of consumption
        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)
        recent_seconds = sum(
            e.duration_seconds for e in ledger 
            if e.created_at and e.created_at >= seven_days_ago
        )
        avg_per_day = recent_seconds / 7.0
        if avg_per_day <= 0:
            return None

        days_left = remaining_seconds / avg_per_day
        if days_left > 365:
            return "> 1 year"
        depletion = now + timedelta(days=days_left)
        return depletion.strftime("%b %d, %Y")

credit_service = CreditService()
