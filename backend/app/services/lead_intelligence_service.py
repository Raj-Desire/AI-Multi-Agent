import io
import csv
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple

from app.core.dependencies import TenantContext
from app.models.call import Call
from app.models.prospect import Prospect, ProspectStatus
from app.models.campaign import Campaign
from app.repositories.call_repository import CallRepository
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.campaign_repository import CampaignRepository
from app.repositories.agent_repository import AgentRepository
from app.schemas.lead_intelligence import (
    LeadKPISummary,
    LeadTrendPoint,
    LeadTrendsResponse,
    LeadOutcomeDistributionItem,
    LeadOutcomeDistributionResponse,
    CampaignLeadStat,
    AgentLeadStat,
    LeadListItem,
    LeadListPaginationResponse,
    CallbackListItem,
    CallbackListPaginationResponse,
    LeadHighlightEvidence,
    LeadDetailResponse,
    LeadActionRequest
)

logger = logging.getLogger("lead_intelligence_service")


def normalize_outcome_bucket(raw_outcome: Optional[str]) -> str:
    """Normalizes raw call outcome strings into 4 standard categories: Interested, Callback Requested, Information Requested, No Answer."""
    if not raw_outcome:
        return "No Answer"
    o = raw_outcome.strip().lower().replace("-", " ").replace("_", " ")

    if "callback" in o:
        return "Callback Requested"
    if "information" in o or "detail" in o or "asked" in o or "follow" in o:
        return "Information Requested"
    if "interested" in o or "warm" in o or "highly" in o or "qualified" in o or "converted" in o or "positive" in o:
        return "Interested"

    # All remaining outcomes (not interested, dnc, voicemail, busy, error, etc.) go to No Answer
    return "No Answer"


def normalize_interest_level(raw_level: Optional[str], score: Optional[int] = None, outcome: Optional[str] = None) -> str:
    """Normalizes interest level to standard categories: Interested, Callback, No Answer."""
    norm_o = normalize_outcome_bucket(outcome or raw_level)
    if norm_o == "Callback Requested":
        return "Callback"
    if norm_o in ["Interested", "Information Requested"]:
        return "Interested"
    return "No Answer"


def is_high_value_outcome(outcome: str) -> bool:
    norm = normalize_outcome_bucket(outcome)
    return norm in [
        "Interested",
        "Callback Requested",
        "Information Requested",
    ]


def parse_date_range(
    date_range_preset: Optional[str],
    custom_start: Optional[str] = None,
    custom_end: Optional[str] = None
) -> Tuple[datetime, datetime, Optional[datetime], Optional[datetime], str, Optional[str]]:
    """
    Returns (start_dt, end_dt, prev_start_dt, prev_end_dt, period_label, comparison_label).
    All datetimes in UTC timezone.
    """
    now = datetime.now(timezone.utc)
    preset = (date_range_preset or "7d").lower()

    if preset == "today":
        start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        end = now
        prev_start = start - timedelta(days=1)
        prev_end = start
        return start, end, prev_start, prev_end, "Today", "vs Yesterday"

    elif preset == "yesterday":
        yest_start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc) - timedelta(days=1)
        yest_end = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        prev_start = yest_start - timedelta(days=1)
        prev_end = yest_start
        return yest_start, yest_end, prev_start, prev_end, "Yesterday", "vs Day Before"

    elif preset in ["7d", "last_7_days", "7_days"]:
        start = now - timedelta(days=7)
        end = now
        prev_start = start - timedelta(days=7)
        prev_end = start
        return start, end, prev_start, prev_end, "Last 7 Days", "vs Previous 7 Days"

    elif preset in ["30d", "last_30_days", "30_days"]:
        start = now - timedelta(days=30)
        end = now
        prev_start = start - timedelta(days=30)
        prev_end = start
        return start, end, prev_start, prev_end, "Last 30 Days", "vs Previous 30 Days"

    elif preset in ["this_month", "month"]:
        start = datetime(now.year, now.month, 1, 0, 0, 0, tzinfo=timezone.utc)
        end = now
        # Previous month
        if now.month == 1:
            prev_start = datetime(now.year - 1, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
            prev_end = datetime(now.year, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        else:
            prev_start = datetime(now.year, now.month - 1, 1, 0, 0, 0, tzinfo=timezone.utc)
            prev_end = start
        return start, end, prev_start, prev_end, "This Month", "vs Previous Month"

    elif preset in ["previous_month", "last_month"]:
        if now.month == 1:
            start = datetime(now.year - 1, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
            end = datetime(now.year, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
            prev_start = datetime(now.year - 1, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
            prev_end = start
        else:
            start = datetime(now.year, now.month - 1, 1, 0, 0, 0, tzinfo=timezone.utc)
            end = datetime(now.year, now.month, 1, 0, 0, 0, tzinfo=timezone.utc)
            if now.month == 2:
                prev_start = datetime(now.year - 1, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
            else:
                prev_start = datetime(now.year, now.month - 2, 1, 0, 0, 0, tzinfo=timezone.utc)
            prev_end = start
        return start, end, prev_start, prev_end, "Previous Month", "vs Month Prior"

    elif preset == "custom" and custom_start and custom_end:
        try:
            start = datetime.fromisoformat(custom_start)
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            end = datetime.fromisoformat(custom_end)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            delta = end - start
            prev_start = start - delta
            prev_end = start
            return start, end, prev_start, prev_end, "Custom Range", "vs Previous Period"
        except Exception:
            pass

    # Default fallback: last 7 days
    start = now - timedelta(days=7)
    end = now
    prev_start = start - timedelta(days=7)
    prev_end = start
    return start, end, prev_start, prev_end, "Last 7 Days", "vs Previous 7 Days"


class LeadIntelligenceService:
    def __init__(
        self,
        call_repo: Optional[CallRepository] = None,
        prospect_repo: Optional[ProspectRepository] = None,
        campaign_repo: Optional[CampaignRepository] = None,
        agent_repo: Optional[AgentRepository] = None,
    ):
        self.call_repo = call_repo or CallRepository()
        self.prospect_repo = prospect_repo or ProspectRepository()
        self.campaign_repo = campaign_repo or CampaignRepository()
        self.agent_repo = agent_repo or AgentRepository()
        self._org_data_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl_seconds: float = 15.0

    def invalidate_cache(self, org_id: Optional[str] = None):
        """Invalidates tenant cache when new calls or updates occur."""
        if org_id:
            self._org_data_cache.pop(org_id, None)
        else:
            self._org_data_cache.clear()

    async def _get_all_org_data(
        self,
        ctx: TenantContext,
        force_refresh: bool = False
    ) -> Tuple[List[Call], Dict[str, Prospect], Dict[str, Campaign]]:
        """Fetches all campaign-generated calls, prospects dictionary, and campaigns dictionary scoped to tenant with in-memory caching to eliminate DB latency & RU query costs."""
        org_id = ctx.organization_id
        import time
        now = time.time()

        # Check Cache
        if not force_refresh and org_id in self._org_data_cache:
            entry = self._org_data_cache[org_id]
            if now - entry["timestamp"] < self._cache_ttl_seconds:
                return entry["calls"], entry["prospects_dict"], entry["campaigns_dict"]

        # 1. Fetch Calls
        raw_calls = await self.call_repo.list_by_org(org_id)
        if not raw_calls and ctx.user_id and ctx.user_id != org_id:
            raw_calls = await self.call_repo.list_by_org(ctx.user_id)

        # Only retain calls generated by outbound AI campaigns
        calls = [c for c in raw_calls if c.campaign_id and c.campaign_id.strip()]

        # 2. Fetch Prospects dictionary
        prospects_list, _ = await self.prospect_repo.list_by_org(org_id, page=1, page_size=10000)
        prospects_dict: Dict[str, Prospect] = {p.id: p for p in prospects_list}
        # Also index by phone for fast fallback
        prospects_by_phone: Dict[str, Prospect] = {p.phone_number: p for p in prospects_list}
        for p in prospects_list:
            if getattr(p, "normalized_phone", None):
                prospects_by_phone[p.normalized_phone] = p

        # 3. Fetch Campaigns dictionary
        campaigns_list, _ = await self.campaign_repo.list_by_org(org_id, page=1, page_size=1000)
        campaigns_dict: Dict[str, Campaign] = {c.id: c for c in campaigns_list}

        # Store in cache
        self._org_data_cache[org_id] = {
            "timestamp": now,
            "calls": calls,
            "prospects_dict": prospects_dict,
            "campaigns_dict": campaigns_dict,
        }

        return calls, prospects_dict, campaigns_dict

    def _get_call_created_at(self, call: Call) -> datetime:
        dt = call.created_at
        if isinstance(dt, str):
            try:
                dt = datetime.fromisoformat(dt)
            except Exception:
                dt = datetime.now(timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    # -------------------------------------------------------------
    # 1. Top KPI Summary with Date Comparison
    # -------------------------------------------------------------
    async def get_summary_kpis(
        self,
        ctx: TenantContext,
        date_range: Optional[str] = "7d",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None,
        campaign_id: Optional[str] = None
    ) -> LeadKPISummary:
        calls, prospects_dict, campaigns_dict = await self._get_all_org_data(ctx)
        start_dt, end_dt, prev_start_dt, prev_end_dt, period_label, comp_label = parse_date_range(
            date_range, custom_start, custom_end
        )

        curr_calls: List[Call] = []
        prev_calls: List[Call] = []

        for c in calls:
            if campaign_id and campaign_id != "all" and c.campaign_id != campaign_id:
                continue

            cdt = self._get_call_created_at(c)
            if start_dt <= cdt <= end_dt:
                curr_calls.append(c)
            elif prev_start_dt and prev_end_dt and (prev_start_dt <= cdt < prev_end_dt):
                prev_calls.append(c)

        # Index latest call per unique prospect for current period
        latest_curr_by_prospect: Dict[str, Call] = {}
        total_score = 0
        scored_calls = 0
        total_duration = 0

        for c in curr_calls:
            dur = c.duration or 0
            total_duration += dur
            score = c.lead_score or (c.analytics.get("lead_score") if c.analytics else None) or 0
            if score > 0:
                total_score += score
                scored_calls += 1

            p_key = c.prospect_id or c.to_number
            if not p_key:
                continue
            existing = latest_curr_by_prospect.get(p_key)
            if not existing or self._get_call_created_at(c) > self._get_call_created_at(existing):
                latest_curr_by_prospect[p_key] = c

        curr_total = len(latest_curr_by_prospect)
        curr_interested = 0
        curr_callback = 0
        curr_needs_follow_up = 0
        curr_no_answer = 0

        for p_key, c in latest_curr_by_prospect.items():
            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)
            if outcome == "Interested":
                curr_interested += 1
            elif outcome == "Callback Requested":
                curr_callback += 1
            elif outcome == "Information Requested":
                curr_needs_follow_up += 1
            else:
                curr_no_answer += 1

        # Index latest call per unique prospect for previous period
        latest_prev_by_prospect: Dict[str, Call] = {}
        for c in prev_calls:
            p_key = c.prospect_id or c.to_number
            if not p_key:
                continue
            existing = latest_prev_by_prospect.get(p_key)
            if not existing or self._get_call_created_at(c) > self._get_call_created_at(existing):
                latest_prev_by_prospect[p_key] = c

        prev_total = len(latest_prev_by_prospect)
        prev_interested = 0
        prev_callback = 0
        prev_needs_follow_up = 0
        prev_no_answer = 0

        for p_key, c in latest_prev_by_prospect.items():
            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)
            if outcome == "Interested":
                prev_interested += 1
            elif outcome == "Callback Requested":
                prev_callback += 1
            elif outcome == "Information Requested":
                prev_needs_follow_up += 1
            else:
                prev_no_answer += 1

        def calc_pct_change(curr: int, prev: int) -> Optional[float]:
            if prev > 0:
                return round(((curr - prev) / prev) * 100, 1)
            elif curr > 0:
                return 100.0
            return None

        avg_score = round(total_score / scored_calls, 1) if scored_calls > 0 else 0.0
        avg_duration = round(total_duration / len(curr_calls)) if len(curr_calls) > 0 else 0

        return LeadKPISummary(
            total_leads=curr_total,
            interested=curr_interested,
            callback_requested=curr_callback,
            needs_follow_up=curr_needs_follow_up,
            not_interested=0,
            no_answer=curr_no_answer,
            avg_lead_score=avg_score,
            avg_call_duration_seconds=avg_duration,
            total_leads_change_pct=calc_pct_change(curr_total, prev_total),
            interested_change_pct=calc_pct_change(curr_interested, prev_interested),
            callback_change_pct=calc_pct_change(curr_callback, prev_callback),
            needs_follow_up_change_pct=calc_pct_change(curr_needs_follow_up, prev_needs_follow_up),
            not_interested_change_pct=None,
            no_answer_change_pct=calc_pct_change(curr_no_answer, prev_no_answer),
            period_label=period_label,
            comparison_label=comp_label
        )

    # -------------------------------------------------------------
    # 2. Main Analytics Chart: Lead Interest Over Time
    # -------------------------------------------------------------
    async def get_lead_trends(
        self,
        ctx: TenantContext,
        metric: Optional[str] = "all",  # "all" | "interested" | "callback" | "follow_up" | "not_interested" | "no_answer"
        date_range: Optional[str] = "7d",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None,
        campaign_id: Optional[str] = None
    ) -> LeadTrendsResponse:
        calls, _, _ = await self._get_all_org_data(ctx)
        start_dt, end_dt, _, _, _, _ = parse_date_range(date_range, custom_start, custom_end)

        is_hourly = (date_range or "").lower() in ["today", "yesterday"]
        buckets: Dict[str, Dict[str, Any]] = {}

        # Initialize time buckets so every interval appears even if 0
        if is_hourly:
            curr = start_dt
            while curr <= end_dt:
                key = curr.strftime("%Y-%m-%d %H:00")
                display = curr.strftime("%I %p").lstrip("0")
                buckets[key] = {
                    "display": display,
                    "total": 0,
                    "interested": 0,
                    "callback": 0,
                    "follow_up": 0,
                    "not_interested": 0,
                    "no_answer": 0
                }
                curr += timedelta(hours=1)
        else:
            curr = start_dt
            while curr <= end_dt:
                key = curr.strftime("%Y-%m-%d")
                display = curr.strftime("%b %d")
                buckets[key] = {
                    "display": display,
                    "total": 0,
                    "interested": 0,
                    "callback": 0,
                    "follow_up": 0,
                    "not_interested": 0,
                    "no_answer": 0
                }
                curr += timedelta(days=1)

        # Aggregate matching calls
        for c in calls:
            if campaign_id and campaign_id != "all" and c.campaign_id != campaign_id:
                continue

            cdt = self._get_call_created_at(c)
            if not (start_dt <= cdt <= end_dt):
                continue

            key = cdt.strftime("%Y-%m-%d %H:00" if is_hourly else "%Y-%m-%d")
            if key not in buckets:
                buckets[key] = {
                    "display": cdt.strftime("%I %p" if is_hourly else "%b %d"),
                    "total": 0,
                    "interested": 0,
                    "callback": 0,
                    "follow_up": 0,
                    "not_interested": 0,
                    "no_answer": 0
                }

            buckets[key]["total"] += 1
            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)

            if outcome == "Interested":
                buckets[key]["interested"] += 1
            elif outcome == "Callback Requested":
                buckets[key]["callback"] += 1
            elif outcome == "Information Requested":
                buckets[key]["follow_up"] += 1
            else:
                buckets[key]["no_answer"] += 1

        points: List[LeadTrendPoint] = []
        for k in sorted(buckets.keys()):
            b = buckets[k]
            points.append(LeadTrendPoint(
                date=k,
                display_label=b["display"],
                total_leads=b["total"],
                interested=b["interested"],
                callback_requested=b["callback"],
                needs_follow_up=b["follow_up"],
                not_interested=b["not_interested"],
                no_answer=b["no_answer"]
            ))

        return LeadTrendsResponse(
            metric=metric or "all",
            points=points,
            total_data_points=len(points)
        )

    # -------------------------------------------------------------
    # 3. Outcome Distribution Visualization
    # -------------------------------------------------------------
    async def get_outcome_distribution(
        self,
        ctx: TenantContext,
        date_range: Optional[str] = "7d",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None,
        campaign_id: Optional[str] = None
    ) -> LeadOutcomeDistributionResponse:
        calls, _, _ = await self._get_all_org_data(ctx)
        start_dt, end_dt, _, _, _, _ = parse_date_range(date_range, custom_start, custom_end)

        counts: Dict[str, int] = {
            "Interested": 0,
            "Callback Requested": 0,
            "Information Requested": 0,
            "No Answer": 0,
        }

        # Index latest call per unique prospect in date range
        latest_by_prospect: Dict[str, Call] = {}
        for c in calls:
            if campaign_id and campaign_id != "all" and c.campaign_id != campaign_id:
                continue
            cdt = self._get_call_created_at(c)
            if not (start_dt <= cdt <= end_dt):
                continue
            p_key = c.prospect_id or c.to_number
            if not p_key:
                continue
            existing = latest_by_prospect.get(p_key)
            if not existing or self._get_call_created_at(c) > self._get_call_created_at(existing):
                latest_by_prospect[p_key] = c

        total = len(latest_by_prospect)
        for p_key, c in latest_by_prospect.items():
            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)
            if outcome in counts:
                counts[outcome] += 1
            else:
                counts["No Answer"] += 1

        color_palette = {
            "Interested": "#10B981",         # Emerald green
            "Callback Requested": "#8B5CF6", # Purple
            "Information Requested": "#3B82F6", # Blue
            "No Answer": "#64748B",          # Slate
        }

        items: List[LeadOutcomeDistributionItem] = []
        for outcome, count in counts.items():
            if count > 0:
                pct = round((count / total) * 100, 1) if total > 0 else 0.0
                items.append(LeadOutcomeDistributionItem(
                    outcome=outcome,
                    count=count,
                    percentage=pct,
                    color_hint=color_palette.get(outcome, "#64748B")
                ))

        items.sort(key=lambda x: x.count, reverse=True)

        return LeadOutcomeDistributionResponse(
            total_analyzed_calls=total,
            distribution=items
        )

    # -------------------------------------------------------------
    # 4. Leads by Campaign Breakdown
    # -------------------------------------------------------------
    async def get_campaign_performance(
        self,
        ctx: TenantContext,
        date_range: Optional[str] = "7d",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None
    ) -> List[CampaignLeadStat]:
        calls, _, campaigns_dict = await self._get_all_org_data(ctx)
        start_dt, end_dt, _, _, _, _ = parse_date_range(date_range, custom_start, custom_end)

        stats_map: Dict[str, Dict[str, Any]] = {}

        # Pre-populate existing campaigns
        for cid, cmp in campaigns_dict.items():
            stats_map[cid] = {
                "name": cmp.name,
                "status": str(getattr(cmp.status, "value", cmp.status)),
                "total_leads": 0,
                "interested": 0,
                "callback": 0,
                "needs_follow_up": 0,
                "not_interested": 0,
                "no_answer": 0,
                "total_calls": 0,
                "last_lead_at": None
            }

        for c in calls:
            if not c.campaign_id:
                continue

            cdt = self._get_call_created_at(c)
            if not (start_dt <= cdt <= end_dt):
                continue

            cid = c.campaign_id
            if cid not in stats_map:
                cmp_obj = campaigns_dict.get(cid)
                stats_map[cid] = {
                    "name": cmp_obj.name if cmp_obj else f"Campaign {cid[:8]}",
                    "status": "completed",
                    "total_leads": 0,
                    "interested": 0,
                    "callback": 0,
                    "needs_follow_up": 0,
                    "not_interested": 0,
                    "no_answer": 0,
                    "total_calls": 0,
                    "last_lead_at": None
                }

            entry = stats_map[cid]
            entry["total_calls"] += 1
            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)

            if is_high_value_outcome(outcome):
                entry["total_leads"] += 1
                if not entry["last_lead_at"] or cdt > entry["last_lead_at"]:
                    entry["last_lead_at"] = cdt

            if outcome == "Interested":
                entry["interested"] += 1
            elif outcome == "Callback Requested":
                entry["callback"] += 1
            elif outcome == "Information Requested":
                entry["needs_follow_up"] += 1
            else:
                entry["no_answer"] += 1

        result: List[CampaignLeadStat] = []
        for cid, data in stats_map.items():
            if data["total_calls"] > 0 or data["total_leads"] > 0:
                conv_rate = round((data["total_leads"] / data["total_calls"]) * 100, 1) if data["total_calls"] > 0 else 0.0
                result.append(CampaignLeadStat(
                    campaign_id=cid,
                    campaign_name=data["name"],
                    status=data["status"],
                    total_leads=data["total_leads"],
                    interested=data["interested"],
                    callback_requested=data["callback"],
                    needs_follow_up=data["needs_follow_up"],
                    not_interested=data["not_interested"],
                    no_answer=data["no_answer"],
                    conversion_rate=conv_rate,
                    last_lead_at=data["last_lead_at"]
                ))

        result.sort(key=lambda x: x.total_leads, reverse=True)
        return result

        result: List[CampaignLeadStat] = []
        for cid, data in stats_map.items():
            if data["total_calls"] > 0 or data["total_leads"] > 0:
                conv_rate = round((data["total_leads"] / data["total_calls"]) * 100, 1) if data["total_calls"] > 0 else 0.0
                result.append(CampaignLeadStat(
                    campaign_id=cid,
                    campaign_name=data["name"],
                    status=data["status"],
                    total_leads=data["total_leads"],
                    interested=data["interested"],
                    warm_interested=data["warm"],
                    callback_requested=data["callback"],
                    qualified=data["qualified"],
                    converted=data["converted"],
                    conversion_rate=conv_rate,
                    last_lead_at=data["last_lead_at"]
                ))

        # Sort campaigns by total valuable leads generated descending
        result.sort(key=lambda x: x.total_leads, reverse=True)
        return result

    # -------------------------------------------------------------
    # 5. Leads by AI Voice Agent Breakdown
    # -------------------------------------------------------------
    async def get_agent_performance(
        self,
        ctx: TenantContext,
        date_range: Optional[str] = "7d",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None
    ) -> List[AgentLeadStat]:
        calls, _, _ = await self._get_all_org_data(ctx)
        start_dt, end_dt, _, _, _, _ = parse_date_range(date_range, custom_start, custom_end)

        agents_map: Dict[str, Dict[str, Any]] = {}

        for c in calls:
            cdt = self._get_call_created_at(c)
            if not (start_dt <= cdt <= end_dt):
                continue

            agent_id = c.agent_id or "default_agent"
            agent_name = c.agent_name or "AI Voice Assistant"

            if agent_id not in agents_map:
                agents_map[agent_id] = {
                    "name": agent_name,
                    "total_calls": 0,
                    "interested": 0,
                    "callbacks": 0,
                    "total_score": 0,
                    "scored_calls": 0
                }

            entry = agents_map[agent_id]
            entry["total_calls"] += 1

            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)
            if outcome in ["Interested", "Highly Interested", "Warm Interested", "Qualified", "Converted", "Information Requested"]:
                entry["interested"] += 1
            if outcome == "Callback Requested":
                entry["callbacks"] += 1

            score = c.lead_score or (c.analytics.get("lead_score") if c.analytics else None) or 0
            if score > 0:
                entry["total_score"] += score
                entry["scored_calls"] += 1

        result: List[AgentLeadStat] = []
        for aid, data in agents_map.items():
            if data["total_calls"] > 0:
                avg_score = round(data["total_score"] / data["scored_calls"], 1) if data["scored_calls"] > 0 else 0.0
                result.append(AgentLeadStat(
                    agent_id=aid,
                    agent_name=data["name"],
                    total_calls=data["total_calls"],
                    interested_leads=data["interested"],
                    callback_leads=data["callbacks"],
                    avg_lead_score=avg_score
                ))

        result.sort(key=lambda x: x.interested_leads, reverse=True)
        return result

    # -------------------------------------------------------------
    # 6. Main High-Priority Lead Table with Multi-Filtering & Pagination
    # -------------------------------------------------------------
    async def list_leads(
        self,
        ctx: TenantContext,
        search: Optional[str] = None,
        date_range: Optional[str] = "all",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None,
        campaign_id: Optional[str] = None,
        outcome: Optional[str] = None,
        interest_level: Optional[str] = None,
        min_score: Optional[int] = None,
        max_score: Optional[int] = None,
        agent_id: Optional[str] = None,
        prospect_status: Optional[str] = None,
        follow_up: Optional[str] = None,
        only_high_value: bool = True,
        page: int = 1,
        page_size: int = 25,
        sort_by: str = "last_call_at",
        sort_order: str = "desc"
    ) -> LeadListPaginationResponse:
        calls, prospects_dict, campaigns_dict = await self._get_all_org_data(ctx)

        # Index latest call by prospect_id or phone
        latest_calls_by_prospect: Dict[str, Call] = {}
        for c in calls:
            p_key = c.prospect_id or c.to_number
            if not p_key:
                continue
            existing = latest_calls_by_prospect.get(p_key)
            if not existing:
                latest_calls_by_prospect[p_key] = c
            else:
                cdt = self._get_call_created_at(c)
                ext_dt = self._get_call_created_at(existing)
                if cdt > ext_dt:
                    latest_calls_by_prospect[p_key] = c

        # Date range limits
        has_date_filter = date_range and date_range != "all"
        start_dt, end_dt, _, _, _, _ = parse_date_range(date_range, custom_start, custom_end) if has_date_filter else (datetime.min.replace(tzinfo=timezone.utc), datetime.max.replace(tzinfo=timezone.utc), None, None, "", None)

        lead_items: List[LeadListItem] = []

        # Iterate through calls/prospects with latest call
        for p_key, call_rec in latest_calls_by_prospect.items():
            call_dt = self._get_call_created_at(call_rec)

            # Date Range check
            if has_date_filter and not (start_dt <= call_dt <= end_dt):
                continue

            # Campaign filter
            if campaign_id and campaign_id != "all" and call_rec.campaign_id != campaign_id:
                continue

            # Agent filter
            if agent_id and agent_id != "all" and call_rec.agent_id != agent_id:
                continue

            # Resolve outcome & score
            norm_outcome = normalize_outcome_bucket(call_rec.business_outcome or call_rec.outcome)
            score = call_rec.lead_score or (call_rec.analytics.get("lead_score") if call_rec.analytics else None) or 0
            interest_lvl = normalize_interest_level(call_rec.interest_level or call_rec.classification, score=score, outcome=norm_outcome)

            # High value filter check
            if only_high_value and not (outcome and outcome != "all"):
                if not is_high_value_outcome(norm_outcome):
                    continue

            # Outcome filter check
            if outcome and outcome != "all":
                target_out = outcome.strip().lower()
                if target_out not in norm_outcome.lower() and norm_outcome.lower() not in target_out:
                    continue

            # Interest level check
            if interest_level and interest_level != "all":
                if interest_lvl.lower() != interest_level.strip().lower():
                    continue

            # Score range check
            if min_score is not None and score < min_score:
                continue
            if max_score is not None and score > max_score:
                continue

            # Resolve prospect details
            p = prospects_dict.get(call_rec.prospect_id or "")
            if not p:
                # Try finding by phone
                p = next((pr for pr in prospects_dict.values() if pr.phone_number == call_rec.to_number or getattr(pr, "normalized_phone", None) == call_rec.to_number), None)

            p_id = p.id if p else (call_rec.prospect_id or f"temp_{p_key}")
            p_name = p.full_name if p else (call_rec.to_number or "Contact")
            p_phone = p.phone_number if p else call_rec.to_number
            p_email = p.email if p else None
            p_company = p.company if p else (call_rec.analytics.get("company_name") if call_rec.analytics else None)
            p_status = str(getattr(p.status, "value", p.status)) if p else "Interested"
            p_tags = list(p.tags) if p else []

            # Prospect status check
            if prospect_status and prospect_status != "all":
                if p_status.lower() != prospect_status.strip().lower():
                    continue

            # Follow up status check
            if follow_up and follow_up != "all":
                fu = follow_up.strip().lower()
                has_callback = bool(call_rec.callback_datetime)
                if fu == "needs_follow_up" and (not call_rec.next_action or call_rec.next_action.lower() in ["none", "retry"]):
                    continue
                elif fu == "scheduled" and not has_callback:
                    continue
                elif fu == "none" and (call_rec.next_action or has_callback):
                    continue

            # Search query check (name, phone, email, company)
            if search and search.strip():
                s = search.strip().lower()
                matches = (
                    s in p_name.lower()
                    or s in p_phone.lower()
                    or (p_email and s in p_email.lower())
                    or (p_company and s in p_company.lower())
                    or (call_rec.summary and s in call_rec.summary.lower())
                )
                if not matches:
                    continue

            # Resolve Campaign & Agent names
            cmp = campaigns_dict.get(call_rec.campaign_id or "")
            cmp_name = cmp.name if cmp else ("Direct Inbound/Outbound" if not call_rec.campaign_id else f"Campaign {call_rec.campaign_id[:8]}")
            agent_label = call_rec.agent_name or "AI Voice Assistant"

            lead_items.append(LeadListItem(
                prospect_id=p_id,
                full_name=p_name,
                company=p_company,
                phone_number=p_phone,
                email=p_email,
                campaign_id=call_rec.campaign_id,
                campaign_name=cmp_name,
                agent_id=call_rec.agent_id,
                agent_name=agent_label,
                business_outcome=norm_outcome,
                interest_level=interest_lvl,
                lead_score=score,
                last_call_id=call_rec.id,
                last_call_at=call_dt,
                last_call_duration=call_rec.duration or 0,
                next_action=call_rec.next_action or "Follow up with prospect",
                prospect_status=p_status,
                callback_datetime=call_rec.callback_datetime,
                summary=call_rec.summary or "",
                tags=p_tags
            ))

        # Sorting
        reverse = (sort_order.lower() == "desc")
        if sort_by == "lead_score":
            lead_items.sort(key=lambda x: x.lead_score, reverse=reverse)
        elif sort_by == "name" or sort_by == "full_name":
            lead_items.sort(key=lambda x: x.full_name.lower(), reverse=reverse)
        elif sort_by == "campaign" or sort_by == "campaign_name":
            lead_items.sort(key=lambda x: (x.campaign_name or "").lower(), reverse=reverse)
        elif sort_by == "outcome":
            lead_items.sort(key=lambda x: x.business_outcome.lower(), reverse=reverse)
        elif sort_by == "callback_datetime":
            lead_items.sort(key=lambda x: x.callback_datetime or "", reverse=reverse)
        else:  # default last_call_at
            lead_items.sort(key=lambda x: x.last_call_at or datetime.min.replace(tzinfo=timezone.utc), reverse=reverse)

        total_count = len(lead_items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated = lead_items[start_idx:end_idx]
        total_pages = max(1, (total_count + page_size - 1) // page_size)

        return LeadListPaginationResponse(
            items=paginated,
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=(page < total_pages),
            has_prev=(page > 1)
        )

    # -------------------------------------------------------------
    # 7. Dedicated Callback Requests View
    # -------------------------------------------------------------
    async def list_callbacks(
        self,
        ctx: TenantContext,
        search: Optional[str] = None,
        campaign_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 25
    ) -> CallbackListPaginationResponse:
        calls, prospects_dict, campaigns_dict = await self._get_all_org_data(ctx)

        callback_items: List[CallbackListItem] = []
        for c in calls:
            outcome = normalize_outcome_bucket(c.business_outcome or c.outcome)
            has_callback = (outcome == "Callback Requested") or bool(c.callback_datetime)
            if not has_callback:
                continue

            if campaign_id and campaign_id != "all" and c.campaign_id != campaign_id:
                continue

            # Resolve prospect
            p = prospects_dict.get(c.prospect_id or "")
            if not p:
                p = next((pr for pr in prospects_dict.values() if pr.phone_number == c.to_number or getattr(pr, "normalized_phone", None) == c.to_number), None)

            p_id = p.id if p else (c.prospect_id or f"cal_{c.id}")
            p_name = p.full_name if p else (c.to_number or "Contact")
            p_phone = p.phone_number if p else c.to_number
            p_email = p.email if p else None
            p_company = p.company if p else (c.analytics.get("company_name") if c.analytics else None)
            p_status = str(getattr(p.status, "value", p.status)) if p else "Callback Requested"

            if search and search.strip():
                s = search.strip().lower()
                matches = (
                    s in p_name.lower()
                    or s in p_phone.lower()
                    or (p_email and s in p_email.lower())
                    or (p_company and s in p_company.lower())
                )
                if not matches:
                    continue

            cmp = campaigns_dict.get(c.campaign_id or "")
            cmp_name = cmp.name if cmp else ("Direct Inbound/Outbound" if not c.campaign_id else f"Campaign {c.campaign_id[:8]}")
            score = c.lead_score or (c.analytics.get("lead_score") if c.analytics else None) or 50

            callback_items.append(CallbackListItem(
                prospect_id=p_id,
                full_name=p_name,
                company=p_company,
                phone_number=p_phone,
                email=p_email,
                campaign_id=c.campaign_id,
                campaign_name=cmp_name,
                requested_datetime=c.callback_datetime or "Scheduled by customer",
                last_call_at=self._get_call_created_at(c),
                summary=c.summary or "Requested follow-up callback during voice call.",
                next_action=c.next_action or "Call back customer as requested",
                business_outcome=outcome,
                interest_level=normalize_interest_level(c.interest_level, score=score, outcome=outcome),
                lead_score=score,
                prospect_status=p_status
            ))

        callback_items.sort(key=lambda x: x.last_call_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

        total_count = len(callback_items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated = callback_items[start_idx:end_idx]
        total_pages = max(1, (total_count + page_size - 1) // page_size)

        return CallbackListPaginationResponse(
            items=paginated,
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )

    # -------------------------------------------------------------
    # 8. Lead Detail Experience (Drawer Data)
    # -------------------------------------------------------------
    async def get_lead_detail(
        self,
        ctx: TenantContext,
        prospect_id: str
    ) -> LeadDetailResponse:
        calls, prospects_dict, campaigns_dict = await self._get_all_org_data(ctx)

        # 1. Resolve Prospect
        prospect = prospects_dict.get(prospect_id)
        if not prospect:
            prospect = await self.prospect_repo.get_by_id(ctx.organization_id, prospect_id)
        if not prospect:
            # Check by phone or temporary ID
            for p in prospects_dict.values():
                if p.phone_number == prospect_id or getattr(p, "normalized_phone", None) == prospect_id:
                    prospect = p
                    break

        if not prospect:
            # Construct a synthetic prospect object from call records if standalone
            matched_call = next((c for c in calls if c.prospect_id == prospect_id or c.to_number == prospect_id), None)
            if matched_call:
                now = datetime.now(timezone.utc)
                prospect = Prospect(
                    id=prospect_id,
                    organization_id=ctx.organization_id,
                    full_name=matched_call.to_number,
                    phone_number=matched_call.to_number,
                    normalized_phone=matched_call.to_number,
                    status=ProspectStatus.INTERESTED,
                    created_at=now,
                    updated_at=now
                )
            else:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Lead / Prospect not found.")

        # 2. Gather All Calls for this Prospect
        prospect_calls: List[Call] = []
        for c in calls:
            if c.prospect_id == prospect.id or c.to_number == prospect.phone_number or (getattr(prospect, "normalized_phone", None) and c.to_number == prospect.normalized_phone):
                prospect_calls.append(c)

        prospect_calls.sort(key=lambda x: self._get_call_created_at(x), reverse=True)

        latest_call = prospect_calls[0] if prospect_calls else None

        # 3. Resolve Campaign
        campaign_name = None
        campaign_id = latest_call.campaign_id if latest_call else None
        if campaign_id:
            cmp = campaigns_dict.get(campaign_id)
            campaign_name = cmp.name if cmp else f"Campaign {campaign_id[:8]}"

        # 4. Extract Analytics & Intelligence
        outcome = normalize_outcome_bucket(latest_call.business_outcome or latest_call.outcome if latest_call else "Interested")
        score = latest_call.lead_score if latest_call and latest_call.lead_score is not None else 50
        interest_lvl = normalize_interest_level(latest_call.interest_level if latest_call else None, score=score, outcome=outcome)
        summary = latest_call.summary if latest_call else prospect.notes
        intent = latest_call.intent if latest_call else "Commercial Inquiry"
        sentiment = latest_call.sentiment if latest_call else "Positive"
        key_insights = latest_call.key_insights if latest_call and latest_call.key_insights else []
        key_requirements = latest_call.key_requirements if latest_call and latest_call.key_requirements else []
        customer_questions = latest_call.customer_questions if latest_call and latest_call.customer_questions else []
        objections = latest_call.objections if latest_call and latest_call.objections else []
        important_info = latest_call.important_info if latest_call else None
        next_action = latest_call.next_action if latest_call else "Follow up with prospect"
        callback_dt = latest_call.callback_datetime if latest_call else (prospect.next_follow_up_at.isoformat() if prospect.next_follow_up_at else None)
        agent_id = latest_call.agent_id if latest_call else None
        agent_name = latest_call.agent_name if latest_call else "AI Voice Assistant"

        # 5. Synthesize "Why this lead is highlighted" Evidence
        highlights: List[LeadHighlightEvidence] = []
        if is_high_value_outcome(outcome):
            highlights.append(LeadHighlightEvidence(icon="check", text=f"Customer responded with positive interest: {outcome}"))
        if key_requirements:
            for req in key_requirements[:2]:
                highlights.append(LeadHighlightEvidence(icon="sparkles", text=f"Key requirement noted: {req}"))
        if customer_questions:
            for q in customer_questions[:2]:
                highlights.append(LeadHighlightEvidence(icon="help", text=f"Customer asked: {q}"))
        if objections:
            for obj in objections[:1]:
                highlights.append(LeadHighlightEvidence(icon="shield", text=f"Discussed objection: {obj}"))
        if callback_dt:
            highlights.append(LeadHighlightEvidence(icon="calendar", text=f"Requested callback: {callback_dt}"))
        if score >= 70:
            highlights.append(LeadHighlightEvidence(icon="flame", text=f"High viability lead score: {score}/100"))
        if next_action and next_action.lower() not in ["none", "retry"]:
            highlights.append(LeadHighlightEvidence(icon="arrow", text=f"Recommended next action: {next_action}"))

        if not highlights:
            highlights.append(LeadHighlightEvidence(icon="check", text="Active customer response captured during AI voice call."))

        # 6. Transcript
        raw_transcript = latest_call.transcript if (latest_call and latest_call.transcript) else []

        # 7. Call History Summary
        history_list = []
        for c in prospect_calls:
            history_list.append({
                "call_id": c.id,
                "created_at": self._get_call_created_at(c).isoformat(),
                "duration": c.duration or 0,
                "outcome": normalize_outcome_bucket(c.business_outcome or c.outcome),
                "summary": c.summary or "",
                "agent_name": c.agent_name or "AI Voice Assistant",
                "campaign_id": c.campaign_id
            })

        return LeadDetailResponse(
            prospect=prospect,
            campaign_id=campaign_id,
            campaign_name=campaign_name,
            latest_call_id=latest_call.id if latest_call else None,
            latest_call_at=self._get_call_created_at(latest_call) if latest_call else None,
            business_outcome=outcome,
            interest_level=interest_lvl,
            lead_score=score,
            summary=summary,
            intent=intent,
            sentiment=sentiment,
            key_insights=key_insights,
            key_requirements=key_requirements,
            customer_questions=customer_questions,
            objections=objections,
            important_info=important_info,
            next_action=next_action,
            callback_datetime=callback_dt,
            agent_id=agent_id,
            agent_name=agent_name,
            highlight_reasons=highlights,
            transcript=raw_transcript,
            call_history=history_list
        )

    # -------------------------------------------------------------
    # 9. Execute Lead Actions (Update Status, Callback, Notes, Tags)
    # -------------------------------------------------------------
    async def execute_lead_action(
        self,
        ctx: TenantContext,
        prospect_id: str,
        payload: LeadActionRequest
    ) -> Prospect:
        prospect = await self.prospect_repo.get_by_id(ctx.organization_id, prospect_id)
        if not prospect:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Prospect not found.")

        now = datetime.now(timezone.utc)

        if payload.status:
            try:
                prospect.status = ProspectStatus(payload.status)
            except Exception:
                # Custom status or normalized match
                for ps in ProspectStatus:
                    if ps.value.lower() == payload.status.lower():
                        prospect.status = ps
                        break

        if payload.next_follow_up_at:
            try:
                dt = datetime.fromisoformat(payload.next_follow_up_at)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                prospect.next_follow_up_at = dt
            except Exception:
                pass

        if payload.note:
            if prospect.notes:
                prospect.notes = f"{prospect.notes}\n[{now.strftime('%Y-%m-%d %H:%M')}] {payload.note.strip()}"
            else:
                prospect.notes = f"[{now.strftime('%Y-%m-%d %H:%M')}] {payload.note.strip()}"

        if payload.tags is not None:
            prospect.tags = list(set(payload.tags))

        if payload.assigned_owner:
            prospect.assigned_owner = payload.assigned_owner

        prospect.updated_at = now
        prospect.updated_by = ctx.email or ctx.user_id

        saved = await self.prospect_repo.save(prospect)
        return saved

    # -------------------------------------------------------------
    # 10. CSV Export of Filtered Leads
    # -------------------------------------------------------------
    async def export_leads_csv(
        self,
        ctx: TenantContext,
        search: Optional[str] = None,
        date_range: Optional[str] = "all",
        custom_start: Optional[str] = None,
        custom_end: Optional[str] = None,
        campaign_id: Optional[str] = None,
        outcome: Optional[str] = None,
        interest_level: Optional[str] = None,
        min_score: Optional[int] = None,
        max_score: Optional[int] = None,
        agent_id: Optional[str] = None,
        prospect_status: Optional[str] = None,
        follow_up: Optional[str] = None
    ) -> str:
        # Fetch matching leads without pagination limit (up to 50,000)
        res = await self.list_leads(
            ctx=ctx,
            search=search,
            date_range=date_range,
            custom_start=custom_start,
            custom_end=custom_end,
            campaign_id=campaign_id,
            outcome=outcome,
            interest_level=interest_level,
            min_score=min_score,
            max_score=max_score,
            agent_id=agent_id,
            prospect_status=prospect_status,
            follow_up=follow_up,
            only_high_value=False if outcome and outcome != "all" else True,
            page=1,
            page_size=50000,
            sort_by="last_call_at",
            sort_order="desc"
        )

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        headers = [
            "Prospect Name",
            "Company",
            "Phone Number",
            "Email",
            "Campaign",
            "AI Voice Agent",
            "Business Outcome",
            "Interest Level",
            "Lead Score",
            "Last Call Date (UTC)",
            "Call Duration (sec)",
            "Callback Requested",
            "Next Action",
            "Prospect Status",
            "Summary"
        ]
        writer.writerow(headers)

        for lead in res.items:
            writer.writerow([
                lead.full_name,
                lead.company or "",
                lead.phone_number,
                lead.email or "",
                lead.campaign_name or "",
                lead.agent_name or "",
                lead.business_outcome,
                lead.interest_level,
                lead.lead_score,
                lead.last_call_at.strftime("%Y-%m-%d %H:%M:%S") if lead.last_call_at else "",
                lead.last_call_duration,
                lead.callback_datetime or "",
                lead.next_action or "",
                lead.prospect_status,
                lead.summary or ""
            ])

        return output.getvalue()
