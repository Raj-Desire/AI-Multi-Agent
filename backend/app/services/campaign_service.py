import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException

from zoneinfo import ZoneInfo

from app.core.dependencies import TenantContext
from app.models.campaign import (
    Campaign,
    CampaignMember,
    CampaignEvent,
    CampaignStatus,
    CampaignMemberStatus,
    CampaignEventType,
    CampaignCallingConfig,
    CampaignSchedule,
    CampaignStats,
)
from app.schemas.campaign import (
    CreateCampaignRequest,
    UpdateCampaignRequest,
    ProspectSelectionFilter,
)
from app.repositories.campaign_repository import (
    CampaignRepository,
    CampaignMemberRepository,
    CampaignEventRepository,
)
from app.repositories.agent_repository import AgentRepository
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.call_repository import CallRepository
from app.services.prospect_service import normalize_phone

logger = logging.getLogger("campaign_service")

# Centralized Retryable vs Terminal Outcomes
RETRYABLE_OUTCOMES = {"no_answer", "no-answer", "busy", "failed", "temporary_error", "voicemail", "initiated"}
TERMINAL_OUTCOMES = {"connected", "interested", "not_interested", "qualified", "converted", "do_not_contact", "dnc", "invalid", "callback_requested"}


class CampaignService:
    def __init__(
        self,
        campaign_repo: Optional[CampaignRepository] = None,
        member_repo: Optional[CampaignMemberRepository] = None,
        event_repo: Optional[CampaignEventRepository] = None,
        agent_repo: Optional[AgentRepository] = None,
        twilio_repo: Optional[TwilioRepository] = None,
        prospect_repo: Optional[ProspectRepository] = None,
        call_repo: Optional[CallRepository] = None,
    ):
        self.campaign_repo = campaign_repo or CampaignRepository()
        self.member_repo = member_repo or CampaignMemberRepository()
        self.event_repo = event_repo or CampaignEventRepository()
        self.agent_repo = agent_repo or AgentRepository()
        self.twilio_repo = twilio_repo or TwilioRepository()
        self.prospect_repo = prospect_repo or ProspectRepository()
        self.call_repo = call_repo or CallRepository()

    # -------------------------------------------------------------
    # Validations
    # -------------------------------------------------------------
    def _validate_schedule(self, schedule: CampaignSchedule):
        """Validates calling window times and timezone."""
        clean_tz = schedule.timezone.strip() if schedule.timezone else "UTC"
        if "(" in clean_tz and ")" in clean_tz:
            # Extract IANA tz e.g. "(UTC+05:30) Asia/Kolkata (Asia)" -> "Asia/Kolkata"
            parts = clean_tz.split(" ")
            for p in parts:
                if "/" in p:
                    clean_tz = p.strip("()")
                    break
        try:
            ZoneInfo(clean_tz)
            schedule.timezone = clean_tz
        except Exception:
            schedule.timezone = "UTC"

        try:
            start_parts = [int(p) for p in schedule.calling_start_time.split(":")]
            end_parts = [int(p) for p in schedule.calling_end_time.split(":")]
            start_mins = start_parts[0] * 60 + start_parts[1]
            end_mins = end_parts[0] * 60 + end_parts[1]
            if start_mins >= end_mins:
                # Default to safe window if inverted
                schedule.calling_start_time = "09:00"
                schedule.calling_end_time = "18:00"
        except Exception:
            schedule.calling_start_time = "09:00"
            schedule.calling_end_time = "18:00"

        if not schedule.calling_days:
            schedule.calling_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

    async def _validate_agent_and_caller(self, org_id: str, calling_config: CampaignCallingConfig):
        """Validates AI Agent and Twilio Caller ID ownership."""
        # 1. Agent verification
        if calling_config.agent_id:
            agent = await self.agent_repo.get_by_id(org_id, calling_config.agent_id)
            if not agent:
                agent = await self.agent_repo.get_by_id("global", calling_config.agent_id)
            if not agent:
                logger.warning(f"Voice agent '{calling_config.agent_id}' not found, fallback to default.")
        else:
            calling_config.agent_id = "agt_receptionist_default"

        # 2. Twilio phone number verification
        if calling_config.caller_phone_number:
            tw_cfg = await self.twilio_repo.get_by_org(org_id)
            if tw_cfg and tw_cfg.phone_number:
                configured_numbers = [n.strip() for n in tw_cfg.phone_number.split(",") if n.strip()]
                target_norm = normalize_phone(calling_config.caller_phone_number)
                is_matched = any(
                    normalize_phone(cn) == target_norm or cn == calling_config.caller_phone_number
                    for cn in configured_numbers
                )
                if not is_matched and configured_numbers:
                    logger.warning(f"Caller '{calling_config.caller_phone_number}' not strictly in configured Twilio numbers.")

    # -------------------------------------------------------------
    # State Machine Transitions
    # -------------------------------------------------------------
    def _validate_state_transition(self, current_status: CampaignStatus, target_status: CampaignStatus):
        """
        Enforces strict state machine transition rules:
        Draft     -> Scheduled, Running, Stopped
        Scheduled -> Running, Paused, Stopped
        Running   -> Paused, Completed, Stopped, Failed
        Paused    -> Running, Stopped
        Completed -> (Terminal - no direct resume without cloning/restart)
        Stopped   -> (Terminal)
        Failed    -> Draft, Stopped
        """
        curr = str(getattr(current_status, "value", current_status)).lower()
        target = str(getattr(target_status, "value", target_status)).lower()

        allowed_transitions = {
            "draft": {"scheduled", "running", "stopped"},
            "scheduled": {"running", "paused", "stopped"},
            "running": {"paused", "completed", "stopped", "failed"},
            "paused": {"running", "stopped"},
            "failed": {"draft", "stopped", "running"},
            "completed": set(),
            "stopped": set(),
        }

        if target not in allowed_transitions.get(curr, set()):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid state transition: Cannot change campaign status from '{curr.upper()}' to '{target.upper()}'. Only valid transitions: {', '.join(allowed_transitions.get(curr, [])) or 'None (Terminal state)'}"
            )

    # -------------------------------------------------------------
    # Audience Resolution
    # -------------------------------------------------------------
    async def _resolve_prospects_for_campaign(
        self,
        org_id: str,
        filter_spec: ProspectSelectionFilter
    ) -> List[Any]:
        """Resolves target prospects from selection criteria."""
        all_prospects, _ = await self.prospect_repo.list_by_org(
            organization_id=org_id,
            page=1,
            page_size=10000
        )

        selected = []
        if filter_spec.select_all:
            selected = all_prospects
        elif filter_spec.prospect_ids:
            id_set = set(filter_spec.prospect_ids)
            selected = [p for p in all_prospects if p.id in id_set]
        elif filter_spec.tags or filter_spec.statuses or filter_spec.sources:
            selected = all_prospects
            if filter_spec.tags:
                tag_set = {t.lower() for t in filter_spec.tags}
                selected = [p for p in selected if any(t.lower() in tag_set for t in p.tags)]
            if filter_spec.statuses:
                status_set = {s.lower() for s in filter_spec.statuses}
                selected = [p for p in selected if str(getattr(p.status, "value", p.status)).lower() in status_set]
            if filter_spec.sources:
                source_set = {s.lower() for s in filter_spec.sources}
                selected = [p for p in selected if str(getattr(p.source, "value", p.source)).lower() in source_set]
        else:
            selected = all_prospects

        # DNC filtering
        if filter_spec.exclude_dnc:
            selected = [p for p in selected if not getattr(p, "is_dnc", False) and str(getattr(p.status, "value", p.status)).lower() != "do not contact"]

        return selected

    # -------------------------------------------------------------
    # CRUD Operations
    # -------------------------------------------------------------
    async def create_campaign(
        self,
        ctx: TenantContext,
        payload: CreateCampaignRequest
    ) -> Campaign:
        # 1. Validations
        self._validate_schedule(payload.schedule)
        await self._validate_agent_and_caller(ctx.organization_id, payload.calling_config)

        # 2. Resolve audience
        prospects = await self._resolve_prospects_for_campaign(ctx.organization_id, payload.prospect_selection)
        if not prospects and payload.start_immediately:
            raise HTTPException(
                status_code=400,
                detail="Selected audience contains 0 eligible prospects. Please select contacts or contact groups to launch."
            )

        campaign_id = f"cmp_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)

        # Determine initial status
        initial_status = CampaignStatus.DRAFT
        if payload.start_immediately:
            # Check if schedule specifies a future start date
            if payload.schedule.start_date:
                today_str = now.strftime("%Y-%m-%d")
                if payload.schedule.start_date > today_str:
                    initial_status = CampaignStatus.SCHEDULED
                else:
                    initial_status = CampaignStatus.RUNNING
            else:
                initial_status = CampaignStatus.RUNNING

        # 3. Create Campaign Members
        members: List[CampaignMember] = []
        for p in prospects:
            norm_phone = getattr(p, "normalized_phone", None) or normalize_phone(p.phone_number)
            if not norm_phone:
                continue

            member = CampaignMember(
                id=f"cmpm_{uuid.uuid4().hex[:12]}",
                campaign_id=campaign_id,
                organization_id=ctx.organization_id,
                prospect_id=p.id,
                prospect_name=p.full_name or f"{p.first_name or ''} {p.last_name or ''}".strip() or "Unknown Contact",
                phone_number=p.phone_number,
                normalized_phone=norm_phone,
                status=CampaignMemberStatus.QUEUED,
                attempts=0,
                created_at=now,
                updated_at=now
            )
            members.append(member)

        if not members:
            raise HTTPException(status_code=400, detail="None of the selected prospects have valid phone numbers.")

        await self.member_repo.save_bulk(members)

        # 4. Create Campaign Document
        initial_stats = CampaignStats(
            total_prospects=len(members),
            queued=len(members)
        )

        campaign = Campaign(
            id=campaign_id,
            organization_id=ctx.organization_id,
            name=payload.name.strip(),
            description=payload.description.strip() if payload.description else None,
            status=initial_status,
            calling_config=payload.calling_config,
            schedule=payload.schedule,
            stats=initial_stats,
            created_at=now,
            updated_at=now,
            created_by=ctx.email or ctx.user_id,
            updated_by=ctx.email or ctx.user_id
        )

        saved = await self.campaign_repo.save(campaign)

        # 5. Log Events
        await self.event_repo.log_event(
            organization_id=ctx.organization_id,
            campaign_id=campaign_id,
            event_type=CampaignEventType.CREATED,
            message=f"Campaign '{campaign.name}' created with {len(members)} queued prospects.",
            details={"initial_status": initial_status.value, "prospect_count": len(members)}
        )

        if initial_status == CampaignStatus.RUNNING:
            await self.event_repo.log_event(
                organization_id=ctx.organization_id,
                campaign_id=campaign_id,
                event_type=CampaignEventType.STARTED,
                message=f"Campaign '{campaign.name}' started immediately."
            )

        return saved

    async def get_campaign(self, ctx: TenantContext, campaign_id: str) -> Campaign:
        campaign = await self.campaign_repo.get_by_id(ctx.organization_id, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found.")
        return campaign

    async def list_campaigns(
        self,
        ctx: TenantContext,
        search: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Campaign], int]:
        return await self.campaign_repo.list_by_org(
            organization_id=ctx.organization_id,
            search=search,
            status=status,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order
        )

    async def update_campaign(
        self,
        ctx: TenantContext,
        campaign_id: str,
        payload: UpdateCampaignRequest
    ) -> Campaign:
        campaign = await self.get_campaign(ctx, campaign_id)

        if campaign.status in [CampaignStatus.COMPLETED, CampaignStatus.STOPPED]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot edit campaign in {str(campaign.status).upper()} state."
            )

        if payload.name is not None:
            campaign.name = payload.name.strip()
        if payload.description is not None:
            campaign.description = payload.description.strip() if payload.description else None

        if payload.calling_config is not None:
            await self._validate_agent_and_caller(ctx.organization_id, payload.calling_config)
            campaign.calling_config = payload.calling_config

        if payload.schedule is not None:
            self._validate_schedule(payload.schedule)
            campaign.schedule = payload.schedule

        campaign.updated_at = datetime.now(timezone.utc)
        campaign.updated_by = ctx.email or ctx.user_id

        saved = await self.campaign_repo.save(campaign)
        await self.event_repo.log_event(
            organization_id=ctx.organization_id,
            campaign_id=campaign_id,
            event_type=CampaignEventType.UPDATED,
            message=f"Campaign '{campaign.name}' configuration was updated."
        )
        return saved

    async def delete_campaign(self, ctx: TenantContext, campaign_id: str) -> bool:
        campaign = await self.get_campaign(ctx, campaign_id)
        if campaign.status == CampaignStatus.RUNNING:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete an actively running campaign. Please stop the campaign first."
            )

        await self.member_repo.delete_by_campaign(ctx.organization_id, campaign_id)
        await self.campaign_repo.delete(ctx.organization_id, campaign_id)
        return True

    # -------------------------------------------------------------
    # Lifecycle Control Actions
    # -------------------------------------------------------------
    async def start_campaign(self, ctx: TenantContext, campaign_id: str) -> Campaign:
        campaign = await self.get_campaign(ctx, campaign_id)
        if campaign.status != CampaignStatus.RUNNING:
            self._validate_state_transition(campaign.status, CampaignStatus.RUNNING)

        # Refresh stats and verify queue is not empty
        await self.recalculate_campaign_stats(campaign_id)
        members = await self.member_repo.get_all_by_campaign(campaign_id)
        pending = [
            m for m in members
            if str(getattr(m.status, "value", m.status)).lower() in ["queued", "retrying", "calling"]
        ]
        if not pending:
            raise HTTPException(
                status_code=400,
                detail="Cannot start campaign: All prospects have already completed or exhausted retry attempts."
            )

        if campaign.status != CampaignStatus.RUNNING:
            campaign.status = CampaignStatus.RUNNING
            campaign.updated_at = datetime.now(timezone.utc)
            campaign.updated_by = ctx.email or ctx.user_id
            saved = await self.campaign_repo.save(campaign)

            await self.event_repo.log_event(
                organization_id=ctx.organization_id,
                campaign_id=campaign_id,
                event_type=CampaignEventType.STARTED,
                message=f"Campaign '{campaign.name}' started by {ctx.email or ctx.user_id}."
            )
            return saved
        return campaign

    async def pause_campaign(self, ctx: TenantContext, campaign_id: str) -> Campaign:
        campaign = await self.get_campaign(ctx, campaign_id)
        self._validate_state_transition(campaign.status, CampaignStatus.PAUSED)

        campaign.status = CampaignStatus.PAUSED
        campaign.updated_at = datetime.now(timezone.utc)
        campaign.updated_by = ctx.email or ctx.user_id
        saved = await self.campaign_repo.save(campaign)

        await self.event_repo.log_event(
            organization_id=ctx.organization_id,
            campaign_id=campaign_id,
            event_type=CampaignEventType.PAUSED,
            message=f"Campaign '{campaign.name}' was paused. In-flight calls will complete; no new calls will be placed."
        )
        return saved

    async def resume_campaign(self, ctx: TenantContext, campaign_id: str) -> Campaign:
        campaign = await self.get_campaign(ctx, campaign_id)
        self._validate_state_transition(campaign.status, CampaignStatus.RUNNING)

        campaign.status = CampaignStatus.RUNNING
        campaign.updated_at = datetime.now(timezone.utc)
        campaign.updated_by = ctx.email or ctx.user_id
        saved = await self.campaign_repo.save(campaign)

        await self.event_repo.log_event(
            organization_id=ctx.organization_id,
            campaign_id=campaign_id,
            event_type=CampaignEventType.RESUMED,
            message=f"Campaign '{campaign.name}' resumed."
        )
        return saved

    async def stop_campaign(self, ctx: TenantContext, campaign_id: str) -> Campaign:
        campaign = await self.get_campaign(ctx, campaign_id)
        self._validate_state_transition(campaign.status, CampaignStatus.STOPPED)

        campaign.status = CampaignStatus.STOPPED
        campaign.stopped_at = datetime.now(timezone.utc)
        campaign.updated_at = datetime.now(timezone.utc)
        campaign.updated_by = ctx.email or ctx.user_id
        saved = await self.campaign_repo.save(campaign)

        await self.event_repo.log_event(
            organization_id=ctx.organization_id,
            campaign_id=campaign_id,
            event_type=CampaignEventType.STOPPED,
            message=f"Campaign '{campaign.name}' was stopped."
        )
        return saved

    # -------------------------------------------------------------
    # Campaign Members & Queue
    # -------------------------------------------------------------
    async def list_campaign_members(
        self,
        ctx: TenantContext,
        campaign_id: str,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 25
    ) -> Tuple[List[CampaignMember], int]:
        await self.get_campaign(ctx, campaign_id)
        return await self.member_repo.list_by_campaign(
            organization_id=ctx.organization_id,
            campaign_id=campaign_id,
            status=status,
            search=search,
            page=page,
            page_size=page_size
        )

    async def add_prospects_to_campaign(
        self,
        ctx: TenantContext,
        campaign_id: str,
        filter_spec: ProspectSelectionFilter
    ) -> int:
        campaign = await self.get_campaign(ctx, campaign_id)
        if campaign.status in [CampaignStatus.COMPLETED, CampaignStatus.STOPPED]:
            raise HTTPException(
                status_code=400,
                detail="Cannot add prospects to a completed or stopped campaign."
            )

        prospects = await self._resolve_prospects_for_campaign(ctx.organization_id, filter_spec)
        existing_members = await self.member_repo.get_all_by_campaign(campaign_id)
        existing_pids = {m.prospect_id for m in existing_members}

        new_members: List[CampaignMember] = []
        now = datetime.now(timezone.utc)

        for p in prospects:
            if p.id in existing_pids:
                continue
            norm_phone = getattr(p, "normalized_phone", None) or normalize_phone(p.phone_number)
            if not norm_phone:
                continue

            member = CampaignMember(
                id=f"cmpm_{uuid.uuid4().hex[:12]}",
                campaign_id=campaign_id,
                organization_id=ctx.organization_id,
                prospect_id=p.id,
                prospect_name=p.full_name or f"{p.first_name or ''} {p.last_name or ''}".strip() or "Unknown Contact",
                phone_number=p.phone_number,
                normalized_phone=norm_phone,
                status=CampaignMemberStatus.QUEUED,
                attempts=0,
                created_at=now,
                updated_at=now
            )
            new_members.append(member)

        if new_members:
            await self.member_repo.save_bulk(new_members)
            await self.recalculate_campaign_stats(campaign_id)
            await self.event_repo.log_event(
                organization_id=ctx.organization_id,
                campaign_id=campaign_id,
                event_type=CampaignEventType.MEMBERS_ADDED,
                message=f"Added {len(new_members)} new prospects to campaign.",
                details={"added_count": len(new_members)}
            )

        return len(new_members)

    async def list_campaign_events(
        self,
        ctx: TenantContext,
        campaign_id: str,
        limit: int = 100
    ) -> List[CampaignEvent]:
        await self.get_campaign(ctx, campaign_id)
        return await self.event_repo.list_by_campaign(ctx.organization_id, campaign_id, limit=limit)

    # -------------------------------------------------------------
    # Stats & Metrics Recalculation
    # -------------------------------------------------------------
    async def recalculate_campaign_stats(self, campaign_id: str) -> CampaignStats:
        members = await self.member_repo.get_all_by_campaign(campaign_id)
        stats = CampaignStats()
        stats.total_prospects = len(members)

        total_duration = 0
        call_count_with_duration = 0

        for m in members:
            st = str(getattr(m.status, "value", m.status)).lower()
            if st == "queued":
                stats.queued += 1
            elif st == "calling":
                stats.calling += 1
            elif st == "retrying":
                stats.queued += 1
            elif st == "completed":
                stats.completed += 1
            elif st in ["failed", "skipped_invalid"]:
                stats.failed += 1
            elif st == "skipped_dnc":
                stats.dnc += 1

            # Outcome tallies
            outcome = (m.last_call_outcome or "").lower()
            if "connected" in outcome or outcome in ["interested", "qualified", "converted", "completed"]:
                stats.connected += 1
            elif any(w in outcome for w in ["no_answer", "no-answer", "no answer", "not_answer", "not answered", "not answer", "unanswered"]):
                stats.no_answer += 1
            elif "busy" in outcome:
                stats.busy += 1
            elif "voicemail" in outcome:
                stats.voicemail += 1
            elif "callback" in outcome:
                stats.callbacks += 1

            if outcome == "interested" or outcome == "qualified" or outcome == "converted":
                stats.interested += 1
            elif outcome == "not_interested" or outcome == "not interested":
                stats.not_interested += 1

            if m.last_call_duration and m.last_call_duration > 0:
                total_duration += m.last_call_duration
                call_count_with_duration += 1

        if stats.total_prospects > 0:
            stats.completion_rate = round(((stats.completed + stats.failed + stats.dnc) / stats.total_prospects) * 100.0, 1)
            stats.connection_rate = round((stats.connected / stats.total_prospects) * 100.0, 1)

        if call_count_with_duration > 0:
            stats.avg_duration_seconds = int(total_duration / call_count_with_duration)

        # Update Campaign record
        # Note: we use "global" to look up campaign regardless of tenant context for worker updates
        campaign = await self.campaign_repo.get_by_id("global", campaign_id)
        if campaign:
            campaign.stats = stats
            # Auto-complete campaign if everything is processed
            if stats.total_prospects > 0 and (stats.completed + stats.failed + stats.dnc) == stats.total_prospects:
                if campaign.status == CampaignStatus.RUNNING:
                    campaign.status = CampaignStatus.COMPLETED
                    campaign.completed_at = datetime.now(timezone.utc)
                    await self.event_repo.log_event(
                        organization_id=campaign.organization_id,
                        campaign_id=campaign.id,
                        event_type=CampaignEventType.COMPLETED,
                        message=f"Campaign '{campaign.name}' has completed. All {stats.total_prospects} prospects processed."
                    )
            await self.campaign_repo.save(campaign)

        return stats

    # -------------------------------------------------------------
    # Outcome Recording & Retry Calculation
    # -------------------------------------------------------------
    async def record_call_outcome(
        self,
        campaign_id: str,
        member_id: str,
        call_id: str,
        duration: int,
        outcome: Optional[str] = None,
        is_success: bool = True,
        error: Optional[str] = None
    ) -> CampaignMember:
        member = await self.member_repo.get_by_id("global", member_id)
        if not member:
            logger.warning(f"[CampaignService] Member {member_id} not found for outcome sync.")
            return None

        campaign = await self.campaign_repo.get_by_id("global", campaign_id)
        if not campaign:
            return None

        clean_outcome = (outcome or ("connected" if (is_success and duration > 0) else "failed")).lower()
        now = datetime.now(timezone.utc)

        member.last_call_id = call_id
        member.last_call_outcome = clean_outcome
        member.last_call_duration = duration
        member.last_error = error
        member.last_attempt_at = now
        member.updated_at = now

        max_attempts = campaign.calling_config.max_attempts_per_prospect
        retry_delay = campaign.calling_config.retry_delay_minutes

        # Check if outcome is terminal vs retryable
        is_terminal = any(term in clean_outcome for term in ["connected", "interested", "not_interested", "qualified", "converted", "dnc", "invalid"])
        if is_success and duration > 0:
            is_terminal = True

        if is_terminal or member.attempts >= max_attempts:
            if clean_outcome in ["dnc", "do_not_contact"]:
                member.status = CampaignMemberStatus.SKIPPED_DNC
            elif clean_outcome in ["invalid", "invalid_number"]:
                member.status = CampaignMemberStatus.SKIPPED_INVALID
            elif not is_success and member.attempts >= max_attempts:
                member.status = CampaignMemberStatus.FAILED
            else:
                member.status = CampaignMemberStatus.COMPLETED
            member.next_attempt_at = None

            await self.event_repo.log_event(
                organization_id=campaign.organization_id,
                campaign_id=campaign_id,
                event_type=CampaignEventType.CALL_COMPLETED,
                message=f"Call to {member.prospect_name} ({member.phone_number}) finished. Outcome: {clean_outcome}, Final Status: {member.status.value}",
                details={"member_id": member.id, "call_id": call_id, "duration": duration, "attempts": member.attempts}
            )
        else:
            # Schedule Retry
            member.status = CampaignMemberStatus.RETRYING
            member.next_attempt_at = now + timedelta(minutes=retry_delay)
            await self.event_repo.log_event(
                organization_id=campaign.organization_id,
                campaign_id=campaign_id,
                event_type=CampaignEventType.RETRY_SCHEDULED,
                message=f"Call to {member.prospect_name} ({member.phone_number}) resulted in '{clean_outcome}'. Retry attempt #{member.attempts + 1} scheduled for {member.next_attempt_at.strftime('%Y-%m-%d %H:%M:%S UTC')}.",
                details={"member_id": member.id, "next_attempt_at": member.next_attempt_at.isoformat(), "attempts": member.attempts}
            )

        await self.member_repo.save(member)
        await self.recalculate_campaign_stats(campaign_id)
        return member
