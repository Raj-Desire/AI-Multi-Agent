import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Set, Tuple
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

# A CALLING member whose call shows no terminal status and no activity for this long is resolved by the watchdog.
STALE_CALLING_SECONDS = 20 * 60
TERMINAL_CALL_STATUSES = {"completed", "busy", "no-answer", "no_answer", "failed", "canceled"}


class CampaignDialerEngine:
    """
    Asynchronous Automated Outbound Dialer Engine.
    Handles scheduling, timezone calculations, concurrency limits, eligibility checks,
    idempotent dispatching, and retry lifecycles.
    Uses an Interruptible Event-Driven priority scheduler to eliminate idle CPU and database query waste.
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
        self._wake_event = asyncio.Event()

    # -------------------------------------------------------------
    # Event Wakeup Trigger
    # -------------------------------------------------------------
    def notify_schedule_changed(self):
        """
        Instantly wakes up the worker loop when any campaign is created,
        updated, started, resumed, or stopped.
        """
        self._wake_event.set()

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
        self._wake_event.set()
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("[CampaignDialer] Automated outbound dialer engine stopped.")

    async def _worker_loop(self):
        """
        Interruptible Priority Scheduler Loop.
        If calls are actively in flight or queue is actively dialing, sleeps briefly (3s).
        If all campaigns are in future schedules or empty, sleeps until the EARLIEST start
        time or until an event (like a new campaign created for an earlier time) awakens it!
        """
        while self._running:
            self._wake_event.clear()
            next_wake_delay = 300.0  # Default fallback sleep: 5 minutes if idle

            try:
                has_active_work, next_candidate_delay = await self.tick()
                if has_active_work:
                    # Campaign is actively dialing calls
                    next_wake_delay = self.poll_interval
                elif next_candidate_delay is not None:
                    # Cap minimum wait to 5s, max to 1 hour per evaluation cycle
                    next_wake_delay = max(5.0, min(next_candidate_delay, 3600.0))
                else:
                    # No active or scheduled campaigns exist
                    next_wake_delay = 300.0
            except Exception as e:
                logger.error(f"[CampaignDialer Error] Unexpected error in worker loop: {e}", exc_info=True)
                next_wake_delay = 10.0

            # Interruptible wait: sleeps until next_wake_delay OR until notify_schedule_changed() fires!
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=next_wake_delay)
            except asyncio.TimeoutError:
                pass

    # -------------------------------------------------------------
    # Single Tick: Evaluates all active campaigns
    # Returns (has_active_work: bool, next_earliest_delay_seconds: Optional[float])
    # -------------------------------------------------------------
    async def tick(self) -> Tuple[bool, Optional[float]]:
        active_campaigns = await self.campaign_repo.list_active_campaigns()
        has_active_work = False
        earliest_delays = []

        for campaign in active_campaigns:
            try:
                active, delay_needed = await self.process_campaign(campaign)
                if active:
                    has_active_work = True
                if delay_needed is not None and delay_needed > 0:
                    earliest_delays.append(delay_needed)
            except Exception as ce:
                logger.error(f"[CampaignDialer Error] Processing campaign {campaign.id}: {ce}", exc_info=True)

        next_delay = min(earliest_delays) if earliest_delays else None
        return has_active_work, next_delay

    # -------------------------------------------------------------
    # Calculate seconds until next calling window start
    # -------------------------------------------------------------
    def get_seconds_until_window_start(self, campaign: Campaign, now_utc: Optional[datetime] = None) -> Optional[float]:
        """Calculates precise seconds until this campaign's next allowed calling start time."""
        now = now_utc or datetime.now(timezone.utc)
        sched = campaign.schedule

        try:
            tz = ZoneInfo(sched.timezone)
            now_tz = now.astimezone(tz)
        except Exception:
            return 300.0

        try:
            start_parts = [int(p) for p in sched.calling_start_time.split(":")]
            target_time = now_tz.replace(hour=start_parts[0], minute=start_parts[1], second=0, microsecond=0)
            if target_time <= now_tz:
                # Target start time today has passed, check next day
                target_time += timedelta(days=1)

            # Advance day by day until date matches start_date and day is in allowed calling_days
            allowed_days = [d.strip().capitalize() for d in sched.calling_days]
            for _ in range(30):  # Look up to 30 days ahead
                day_name = target_time.strftime("%A")
                date_str = target_time.strftime("%Y-%m-%d")
                if sched.start_date and date_str < sched.start_date:
                    target_time += timedelta(days=1)
                    continue
                if sched.end_date and date_str > sched.end_date:
                    return None  # Campaign has expired
                if day_name in allowed_days:
                    # Found earliest match!
                    diff = (target_time - now_tz).total_seconds()
                    return max(0.0, diff)
                target_time += timedelta(days=1)
        except Exception as e:
            logger.warning(f"[CampaignDialer] Error calculating window start for {campaign.id}: {e}")
            return 300.0

        return None

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
    # Returns (is_actively_calling: bool, delay_until_next_attempt: Optional[float])
    # -------------------------------------------------------------
    async def process_campaign(self, campaign: Campaign) -> Tuple[bool, Optional[float]]:
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
                delay = self.get_seconds_until_window_start(campaign)
                return False, delay

        if campaign.status != CampaignStatus.RUNNING:
            return False, None

        # Resolve members stuck in CALLING (lost/late Twilio callbacks, crashed streams) so the
        # campaign can finish instead of showing RUNNING forever. Runs even outside the calling window.
        await self._reap_stale_calling_members(campaign)

        # 2. Check window for RUNNING campaign
        if not is_in_window:
            logger.debug(f"[CampaignDialer] Campaign {campaign.id} paused due to calling window: {reason}")
            delay = self.get_seconds_until_window_start(campaign)
            return False, delay

        # 2.5 Check Organization Credit Balance before dispatching campaign calls
        try:
            from app.services.credit_service import credit_service
            auth_check = await credit_service.check_call_authorization(campaign.organization_id)
            if not auth_check.get("allowed", True):
                logger.warning(f"[CampaignDialer] Auto-pausing Campaign {campaign.id}: Organization credits exhausted.")
                campaign.status = CampaignStatus.PAUSED
                await self.campaign_repo.save(campaign)
                await self.event_repo.log_event(
                    campaign_id=campaign.id,
                    organization_id=campaign.organization_id,
                    event_type=CampaignEventType.PAUSED,
                    message="Campaign paused automatically: You have reached your allocated organization calling limit (0 available minutes). Please contact your workspace administrator to top up your account."
                )
                return False, None
        except Exception as cred_err:
            logger.error(f"[CampaignDialer] Error checking credits for campaign {campaign.id}: {cred_err}")

        # 3. Calculate Concurrency Limit
        in_flight = await self.member_repo.count_in_flight_calls(campaign.id)
        max_concurrent = campaign.calling_config.max_concurrent_calls
        available_slots = max(0, max_concurrent - in_flight)

        if available_slots <= 0:
            logger.debug(f"[CampaignDialer] Campaign {campaign.id} at max concurrency ({in_flight}/{max_concurrent}).")
            return True, None

        # 4. Fetch Next Eligible Members (Queued or Retrying due for attempt)
        eligible_members = await self.member_repo.get_next_eligible_members(campaign.id, limit=available_slots)
        if not eligible_members:
            # Check if campaign has pending retries in the future to schedule next wake delay
            all_members = await self.member_repo.get_all_by_campaign(campaign.id)
            now = datetime.now(timezone.utc)
            pending_retry_delays = []
            for m in all_members:
                if str(getattr(m.status, "value", m.status)).lower() == "retrying" and m.next_attempt_at:
                    next_dt = m.next_attempt_at if m.next_attempt_at.tzinfo else m.next_attempt_at.replace(tzinfo=timezone.utc)
                    diff = (next_dt - now).total_seconds()
                    if diff > 0:
                        pending_retry_delays.append(diff)
            
            # Check if campaign is finished
            await self.campaign_service.recalculate_campaign_stats(campaign.id)
            earliest_retry = min(pending_retry_delays) if pending_retry_delays else None
            return (in_flight > 0), earliest_retry

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

        return True, None

    # -------------------------------------------------------------
    # Watchdog: resolve members stuck in CALLING
    # -------------------------------------------------------------
    async def _reap_stale_calling_members(self, campaign: Campaign):
        members = await self.member_repo.get_all_by_campaign(campaign.id)
        now = datetime.now(timezone.utc)

        def _aware(dt):
            if dt is None:
                return None
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

        for m in members:
            if str(getattr(m.status, "value", m.status)).lower() != "calling":
                continue
            async with self._lock_mutex:
                if m.id in self._dispatch_locks:
                    continue  # dispatch still in progress

            try:
                call_rec = await self.call_repo.get_by_id(m.last_call_id) if m.last_call_id else None
                call_status = ((call_rec.status or "") if call_rec else "").lower().strip()
                is_terminal = call_status in TERMINAL_CALL_STATUSES

                last_activity = _aware(m.updated_at) or _aware(m.last_attempt_at)
                call_updated = _aware(call_rec.updated_at) if call_rec else None
                if call_updated and (not last_activity or call_updated > last_activity):
                    last_activity = call_updated
                age = (now - last_activity).total_seconds() if last_activity else float("inf")

                if not is_terminal and age < STALE_CALLING_SECONDS:
                    continue  # still plausibly in progress

                duration = int((call_rec.duration if call_rec else 0) or m.last_call_duration or 0)
                if is_terminal:
                    spoke = bool(duration > 0 or (call_rec and call_rec.transcript))
                    rich = (call_rec.business_outcome or call_rec.outcome) if call_rec else None
                    if spoke:
                        outcome, is_success = (rich or "connected"), True
                    elif call_status in ("no-answer", "no_answer"):
                        outcome, is_success = "no_answer", False
                    elif call_status in ("busy", "failed", "canceled"):
                        outcome, is_success = call_status, False
                    else:  # completed with nothing recorded
                        outcome, is_success = (rich or "completed"), True
                    error = None
                else:
                    outcome, is_success = "failed", False
                    error = f"Call status not confirmed within {STALE_CALLING_SECONDS // 60} minutes."

                logger.warning(
                    f"[CampaignDialer] Resolving stale CALLING member {m.id} (call_status='{call_status or 'unknown'}', "
                    f"age={int(age) if age != float('inf') else 'n/a'}s) -> outcome='{outcome}'."
                )
                await self.campaign_service.record_call_outcome(
                    campaign_id=campaign.id,
                    member_id=m.id,
                    call_id=m.last_call_id,
                    duration=duration,
                    outcome=outcome,
                    is_success=is_success,
                    error=error,
                )
            except Exception as e:
                logger.error(f"[CampaignDialer] Failed to resolve stale member {m.id}: {e}", exc_info=True)

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
