import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Set
from fastapi import HTTPException

from zoneinfo import ZoneInfo

from app.models.campaign import (
    Campaign,
    CampaignMember,
    CampaignStatus,
    CampaignMemberStatus,
    CampaignEventType,
)
from app.repositories.campaign_repository import (
    CampaignRepository,
    CampaignMemberRepository,
    CampaignEventRepository,
)
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.agent_repository import AgentRepository
from app.repositories.call_repository import CallRepository
from app.services.campaign_service import CampaignService
from app.services.prospect_service import ProspectService
from app.services.call_service import CallService
from app.core.dependencies import TenantContext

logger = logging.getLogger("campaign_dialer")


class CampaignDialerEngine:
    """
    Asynchronous Automated Outbound Dialer Engine.
    Handles scheduling, timezone calculations, concurrency limits, eligibility checks,
    idempotent dispatching, and retry lifecycles.
    """

    def __init__(
        self,
        campaign_repo: Optional[CampaignRepository] = None,
        member_repo: Optional[CampaignMemberRepository] = None,
        event_repo: Optional[CampaignEventRepository] = None,
        prospect_repo: Optional[ProspectRepository] = None,
        twilio_repo: Optional[TwilioRepository] = None,
        agent_repo: Optional[AgentRepository] = None,
        call_repo: Optional[CallRepository] = None,
        campaign_service: Optional[CampaignService] = None,
        poll_interval_seconds: float = 3.0,
        enable_dry_run_mode: bool = False
    ):
        self.campaign_repo = campaign_repo or CampaignRepository()
        self.member_repo = member_repo or CampaignMemberRepository()
        self.event_repo = event_repo or CampaignEventRepository()
        self.prospect_repo = prospect_repo or ProspectRepository()
        self.twilio_repo = twilio_repo or TwilioRepository()
        self.agent_repo = agent_repo or AgentRepository()
        self.call_repo = call_repo or CallRepository()
        self.campaign_service = campaign_service or CampaignService(
            campaign_repo=self.campaign_repo,
            member_repo=self.member_repo,
            event_repo=self.event_repo,
            agent_repo=self.agent_repo,
            twilio_repo=self.twilio_repo,
            prospect_repo=self.prospect_repo,
            call_repo=self.call_repo
        )
        self.poll_interval = poll_interval_seconds
        self.enable_dry_run_mode = enable_dry_run_mode

        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._dispatch_locks: Set[str] = set()  # Set of in-flight member_ids to prevent race conditions
        self._lock_mutex = asyncio.Lock()

    # -------------------------------------------------------------
    # Lifecycle: Start / Stop Background Worker
    # -------------------------------------------------------------
    def start(self):
        """Starts the background dialer worker loop."""
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        logger.info("[CampaignDialer] Automated outbound dialer engine started.")

    async def stop(self):
        """Gracefully stops the dialer worker loop."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("[CampaignDialer] Automated outbound dialer engine stopped.")

    async def _worker_loop(self):
        """Main periodic polling loop."""
        while self._running:
            try:
                await self.tick()
            except Exception as e:
                logger.error(f"[CampaignDialer Error] Unexpected error in worker loop: {e}", exc_info=True)
            await asyncio.sleep(self.poll_interval)

    # -------------------------------------------------------------
    # Single Tick: Evaluates all active campaigns
    # -------------------------------------------------------------
    async def tick(self):
        active_campaigns = await self.campaign_repo.list_active_campaigns()
        for campaign in active_campaigns:
            try:
                await self.process_campaign(campaign)
            except Exception as ce:
                logger.error(f"[CampaignDialer Error] Processing campaign {campaign.id}: {ce}", exc_info=True)

    # -------------------------------------------------------------
    # Timezone & Schedule Verification
    # -------------------------------------------------------------
    def is_inside_calling_window(self, campaign: Campaign, now_utc: Optional[datetime] = None) ->tuple[bool, str]:
        """
        Determines whether the current instant is inside the campaign's allowed schedule & window.
        Returns: (is_inside: bool, reason: str)
        """
        now = now_utc or datetime.now(timezone.utc)
        sched = campaign.schedule

        # 1. Timezone conversion
        try:
            tz = ZoneInfo(sched.timezone)
            now_tz = now.astimezone(tz)
        except Exception as e:
            return False, f"Invalid timezone '{sched.timezone}': {e}"

        today_str = now_tz.strftime("%Y-%m-%d")

        # 2. Start date check
        if sched.start_date and today_str < sched.start_date:
            return False, f"Campaign start date {sched.start_date} has not arrived yet (current date in {sched.timezone}: {today_str})."

        # 3. End date check
        if sched.end_date and today_str > sched.end_date:
            return False, f"Campaign end date {sched.end_date} has passed."

        # 4. Calling Days check
        current_day = now_tz.strftime("%A")  # e.g. "Monday", "Tuesday"
        allowed_days_clean = [d.strip().capitalize() for d in sched.calling_days]
        if current_day not in allowed_days_clean:
            return False, f"Today is {current_day}, which is not in allowed calling days: {', '.join(allowed_days_clean)}."

        # 5. Calling Window (Time of Day)
        try:
            start_parts = [int(p) for p in sched.calling_start_time.split(":")]
            end_parts = [int(p) for p in sched.calling_end_time.split(":")]
            start_mins = start_parts[0] * 60 + start_parts[1]
            end_mins = end_parts[0] * 60 + end_parts[1]
            current_mins = now_tz.hour * 60 + now_tz.minute

            if current_mins < start_mins:
                return False, f"Current time {now_tz.strftime('%H:%M')} is before calling window start ({sched.calling_start_time} {sched.timezone})."
            if current_mins >= end_mins:
                return False, f"Current time {now_tz.strftime('%H:%M')} is after calling window end ({sched.calling_end_time} {sched.timezone})."
        except Exception as te:
            return False, f"Error calculating window times: {te}"

        return True, "Inside calling window."

    # -------------------------------------------------------------
    # Process Single Campaign
    # -------------------------------------------------------------
    async def process_campaign(self, campaign: Campaign):
        # 1. Check if campaign status is SCHEDULED and time to activate
        is_in_window, reason = self.is_inside_calling_window(campaign)

        if campaign.status == CampaignStatus.SCHEDULED:
            if is_in_window:
                campaign.status = CampaignStatus.RUNNING
                campaign.updated_at = datetime.now(timezone.utc)
                await self.campaign_repo.save(campaign)
                await self.event_repo.log_event(
                    organization_id=campaign.organization_id,
                    campaign_id=campaign.id,
                    event_type=CampaignEventType.STARTED,
                    message=f"Campaign schedule activated. Status transitioned from SCHEDULED to RUNNING."
                )
            else:
                return

        if campaign.status != CampaignStatus.RUNNING:
            return

        # 2. Check window for RUNNING campaign
        if not is_in_window:
            logger.debug(f"[CampaignDialer] Campaign {campaign.id} paused due to calling window: {reason}")
            return

        # 3. Calculate Concurrency Limit
        in_flight = await self.member_repo.count_in_flight_calls(campaign.id)
        max_concurrent = campaign.calling_config.max_concurrent_calls
        available_slots = max(0, max_concurrent - in_flight)

        if available_slots <= 0:
            logger.debug(f"[CampaignDialer] Campaign {campaign.id} at max concurrency ({in_flight}/{max_concurrent}).")
            return

        # 4. Fetch Next Eligible Members (Queued or Retrying due for attempt)
        eligible_members = await self.member_repo.get_next_eligible_members(campaign.id, limit=available_slots)
        if not eligible_members:
            # Check if campaign is finished
            await self.campaign_service.recalculate_campaign_stats(campaign.id)
            return

        # 5. Dispatch calls for eligible members concurrently
        dispatch_tasks = []
        for member in eligible_members:
            # Idempotency lock check
            async with self._lock_mutex:
                if member.id in self._dispatch_locks:
                    continue
                self._dispatch_locks.add(member.id)

            dispatch_tasks.append(self._dispatch_member_call(campaign, member))

        if dispatch_tasks:
            await asyncio.gather(*dispatch_tasks, return_exceptions=True)

    # -------------------------------------------------------------
    # Dispatch Call for a Single Prospect Member
    # -------------------------------------------------------------
    async def _dispatch_member_call(self, campaign: Campaign, member: CampaignMember):
        try:
            now = datetime.now(timezone.utc)

            # 1. Eligibility Check: DNC list verification
            prospect_svc = ProspectService(self.prospect_repo, self.call_repo)
            is_dnc = await prospect_svc.is_dnc_blocked(campaign.organization_id, member.normalized_phone)
            if is_dnc:
                member.status = CampaignMemberStatus.SKIPPED_DNC
                member.last_call_outcome = "do_not_contact"
                member.last_error = "Prospect is on the Do Not Contact (DNC) list."
                member.updated_at = now
                await self.member_repo.save(member)
                await self.event_repo.log_event(
                    organization_id=campaign.organization_id,
                    campaign_id=campaign.id,
                    event_type=CampaignEventType.CALL_COMPLETED,
                    message=f"Skipped dial to {member.prospect_name} ({member.phone_number}): Registered on DNC list.",
                    details={"member_id": member.id, "reason": "dnc"}
                )
                await self.campaign_service.recalculate_campaign_stats(campaign.id)
                return

            # 2. Eligibility Check: Phone format
            digits = "".join(c for c in member.normalized_phone if c.isdigit())
            if len(digits) < 7:
                member.status = CampaignMemberStatus.SKIPPED_INVALID
                member.last_call_outcome = "invalid_number"
                member.last_error = "Invalid recipient phone number format."
                member.updated_at = now
                await self.member_repo.save(member)
                await self.event_repo.log_event(
                    organization_id=campaign.organization_id,
                    campaign_id=campaign.id,
                    event_type=CampaignEventType.CALL_COMPLETED,
                    message=f"Skipped dial to {member.prospect_name}: Phone number {member.phone_number} is invalid.",
                    details={"member_id": member.id, "reason": "invalid_phone"}
                )
                await self.campaign_service.recalculate_campaign_stats(campaign.id)
                return

            # 3. Transition member to CALLING and increment attempt counter
            member.status = CampaignMemberStatus.CALLING
            member.attempts += 1
            member.last_attempt_at = now
            member.updated_at = now
            await self.member_repo.save(member)
            await self.campaign_service.recalculate_campaign_stats(campaign.id)

            await self.event_repo.log_event(
                organization_id=campaign.organization_id,
                campaign_id=campaign.id,
                event_type=CampaignEventType.CALL_DISPATCHED,
                message=f"Dispatching outbound call attempt #{member.attempts} to {member.prospect_name} ({member.phone_number}).",
                details={
                    "member_id": member.id,
                    "prospect_id": member.prospect_id,
                    "agent_id": campaign.calling_config.agent_id,
                    "caller_number": campaign.calling_config.caller_phone_number,
                    "attempt": member.attempts
                }
            )

            # Update Campaign last_dispatched_at timestamp
            campaign.last_dispatched_at = now
            await self.campaign_repo.save(campaign)

            # 4. Initiate Call via Existing Call Engine
            ctx = TenantContext(
                organization_id=campaign.organization_id,
                user_id=campaign.created_by or "system_dialer",
                email=campaign.created_by or "dialer@platform.internal",
                role="admin",
                org_name="Voice Workspace"
            )

            call_svc = CallService(
                twilio_repo=self.twilio_repo,
                call_repo=self.call_repo,
                agent_repo=self.agent_repo
            )

            if self.enable_dry_run_mode:
                # Dry run simulation mode for fast unit tests or sandboxes
                simulated_call_id = f"cal_sim_{int(time.time()*1000)}"
                await asyncio.sleep(0.05)
                await self.campaign_service.record_call_outcome(
                    campaign_id=campaign.id,
                    member_id=member.id,
                    call_id=simulated_call_id,
                    duration=25,
                    outcome="connected",
                    is_success=True
                )
                return

            try:
                call_record = await call_svc.make_call(
                    ctx=ctx,
                    to_number=member.normalized_phone,
                    from_number=campaign.calling_config.caller_phone_number,
                    agent_id=campaign.calling_config.agent_id,
                    prospect_id=member.prospect_id,
                    campaign_id=campaign.id
                )

                # Link campaign_id to Call record for complete traceability
                call_record.campaign_id = campaign.id
                await self.call_repo.save(call_record)

                member.last_call_id = call_record.id
                await self.member_repo.save(member)

            except HTTPException as he:
                logger.warning(f"[CampaignDialer] Call dispatch HTTP error for member {member.id}: {he.detail}")
                await self.campaign_service.record_call_outcome(
                    campaign_id=campaign.id,
                    member_id=member.id,
                    call_id=None,
                    duration=0,
                    outcome="failed",
                    is_success=False,
                    error=str(he.detail)
                )
            except Exception as e:
                logger.error(f"[CampaignDialer] Call dispatch unexpected exception for member {member.id}: {e}")
                await self.campaign_service.record_call_outcome(
                    campaign_id=campaign.id,
                    member_id=member.id,
                    call_id=None,
                    duration=0,
                    outcome="failed",
                    is_success=False,
                    error=str(e)
                )

        finally:
            # Release Idempotency Lock
            async with self._lock_mutex:
                self._dispatch_locks.discard(member.id)


# Global singleton instance of CampaignDialerEngine
campaign_dialer_engine = CampaignDialerEngine()
