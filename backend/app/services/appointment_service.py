import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional

from app.core.dependencies import TenantContext
from app.models.appointment import Appointment
from app.repositories.appointment_repository import AppointmentRepository
from app.services.appointment_time import (
    DEFAULT_DURATION_MIN, UTC_FMT, agent_timezone, resolve_to_utc, to_utc_str,
)

logger = logging.getLogger("appointment_service")

MAX_RANGE_DAYS = 62


class AppointmentService:
    def __init__(self, repo: Optional[AppointmentRepository] = None):
        self.repo = repo or AppointmentRepository()

    # ---- creation from a finished, analysed call -------------------------------------------------

    async def upsert_from_call(self, call: Any, analytics: Dict[str, Any]) -> Optional[Appointment]:
        """Creates or updates the single appointment for `call`. Only concrete, confirmed times qualify;
        vague or past times are skipped (they stay in the Callbacks tab). Never raises."""
        try:
            if (analytics.get("scheduled_confidence") or "").lower() != "confirmed":
                return None
            kind = (analytics.get("scheduled_type") or "").lower()
            if kind not in ("meeting", "callback"):
                return None
            iana = analytics.get("scheduled_timezone") or agent_timezone(getattr(call, "agent_config_snapshot", None))
            start = resolve_to_utc(analytics.get("scheduled_date"), analytics.get("scheduled_time"), iana)
            if not start:
                return None

            org_id = call.organization_id
            appt_id = f"appt_{call.id}"
            existing = await self.repo.get_by_id(org_id, appt_id)
            now = datetime.now(dt_timezone.utc)

            prospect = await self._prospect(org_id, getattr(call, "prospect_id", None), getattr(call, "to_number", None))
            name = (getattr(prospect, "full_name", None) or analytics.get("customer_name") or "Prospect")
            campaign_name = await self._campaign_name(org_id, getattr(call, "campaign_id", None))

            appt = existing or Appointment(
                id=appt_id, organization_id=org_id, start_at_utc="", end_at_utc="",
                created_at=now, updated_at=now,
            )
            old_start = appt.start_at_utc
            appt.type = kind
            appt.start_at_utc = to_utc_str(start)
            appt.end_at_utc = to_utc_str(start + timedelta(minutes=DEFAULT_DURATION_MIN))
            appt.timezone = iana
            appt.title = f"{'Demo / meeting' if kind == 'meeting' else 'Call back'} with {name}"
            appt.prospect_id = getattr(call, "prospect_id", None)
            appt.prospect_name = name
            appt.phone = getattr(prospect, "phone_number", None) or getattr(call, "to_number", None)
            appt.email = getattr(prospect, "email", None)
            appt.company = getattr(prospect, "company", None) or analytics.get("company_name")
            appt.campaign_id = getattr(call, "campaign_id", None)
            appt.campaign_name = campaign_name
            appt.agent_id = getattr(call, "agent_id", None)
            appt.agent_name = getattr(call, "agent_name", None)
            appt.call_id = call.id
            appt.summary = analytics.get("summary")
            appt.next_action = analytics.get("next_action")
            appt.updated_at = now
            if not existing:
                appt.history.append({"at": now.isoformat(), "event": "created", "start_at_utc": appt.start_at_utc})
            elif old_start != appt.start_at_utc:
                appt.history.append({"at": now.isoformat(), "event": "rescheduled", "from": old_start, "to": appt.start_at_utc})
            await self.repo.save(appt)
            return appt
        except Exception as e:
            logger.error(f"[AppointmentService] upsert_from_call failed: {e}")
            return None

    async def _prospect(self, org_id: str, prospect_id: Optional[str], phone: Optional[str] = None):
        """The contact for the call: by id, or, for a call placed from the dialer, by the number that was dialled."""
        try:
            from app.repositories.prospect_repository import ProspectRepository
            repo = ProspectRepository()
            if prospect_id:
                return await repo.get_by_id(org_id, prospect_id)
            if phone:
                from app.services.prospect_service import normalize_phone
                normalized = normalize_phone(phone)
                return await repo.get_by_normalized_phone(org_id, normalized) if normalized else None
        except Exception:
            pass
        return None

    async def _campaign_name(self, org_id: str, campaign_id: Optional[str]) -> Optional[str]:
        if not campaign_id:
            return None
        try:
            from app.repositories.campaign_repository import CampaignRepository
            c = await CampaignRepository().get_by_id(org_id, campaign_id)
            return c.name if c else None
        except Exception:
            return None

    # ---- reads ----------------------------------------------------------------------------------

    @staticmethod
    def _present(appt: Appointment, now_str: str) -> Dict[str, Any]:
        data = appt.model_dump(mode="json")
        # Derived, not stored: a scheduled slot whose end has passed is shown as missed.
        if appt.status == "scheduled" and appt.end_at_utc < now_str:
            data["status"] = "missed"
        return data

    async def list_range(
        self, ctx: TenantContext, start: datetime, end: datetime,
        campaign_id: Optional[str] = None, agent_id: Optional[str] = None,
        type_: Optional[str] = None, status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if end <= start:
            raise ValueError("'to' must be after 'from'.")
        if end - start > timedelta(days=MAX_RANGE_DAYS):
            raise ValueError(f"Date range cannot exceed {MAX_RANGE_DAYS} days.")
        items = await self.repo.list_range(ctx.organization_id, to_utc_str(start), to_utc_str(end))
        now_str = datetime.now(dt_timezone.utc).strftime(UTC_FMT)
        out = []
        for a in items:
            if campaign_id and a.campaign_id != campaign_id:
                continue
            if agent_id and a.agent_id != agent_id:
                continue
            if type_ and a.type != type_:
                continue
            row = self._present(a, now_str)
            if status and row["status"] != status:
                continue
            out.append(row)
        return out

    async def get(self, ctx: TenantContext, appointment_id: str) -> Optional[Dict[str, Any]]:
        a = await self.repo.get_by_id(ctx.organization_id, appointment_id)
        return self._present(a, datetime.now(dt_timezone.utc).strftime(UTC_FMT)) if a else None
