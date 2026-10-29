import asyncio
from typing import List, Optional

from app.core.cosmos import get_appointments_container
from app.models.appointment import Appointment


class AppointmentRepository:
    """Every method requires organization_id: there is deliberately no unscoped query."""

    async def save(self, appt: Appointment) -> Appointment:
        def _sync():
            container = get_appointments_container()
            if not container:
                raise RuntimeError("Appointments store unavailable")
            container.upsert_item(body=appt.model_dump(mode="json"))
        await asyncio.to_thread(_sync)
        return appt

    async def get_by_id(self, organization_id: str, appointment_id: str) -> Optional[Appointment]:
        def _sync():
            container = get_appointments_container()
            if not container:
                return None
            try:
                return container.read_item(item=appointment_id, partition_key=organization_id)
            except Exception:
                return None
        item = await asyncio.to_thread(_sync)
        return Appointment.model_validate(item) if item else None

    async def list_range(self, organization_id: str, start_utc: str, end_utc: str, limit: int = 1000) -> List[Appointment]:
        query = (
            "SELECT * FROM c WHERE c.organization_id = @org AND c.start_at_utc >= @s AND c.start_at_utc < @e "
            f"ORDER BY c.start_at_utc OFFSET 0 LIMIT {int(limit)}"
        )
        params = [
            {"name": "@org", "value": organization_id},
            {"name": "@s", "value": start_utc},
            {"name": "@e", "value": end_utc},
        ]

        def _sync():
            container = get_appointments_container()
            if not container:
                return []
            return list(container.query_items(query=query, parameters=params, partition_key=organization_id))
        items = await asyncio.to_thread(_sync)
        return [Appointment.model_validate(i) for i in items]
