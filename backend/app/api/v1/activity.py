from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from app.core.dependencies import TenantContext, get_tenant_context
from app.services.activity_log_service import log_action

router = APIRouter(prefix="/activity", tags=["Activity Log"])

# Only these client-side operations can be reported; the label is what superadmin sees.
CLIENT_EVENTS: Dict[str, str] = {
    "export_contacts_csv": "exported contacts (CSV)",
    "export_report_excel": "exported executive report (Excel)",
    "export_report_pdf": "exported executive report (PDF)",
}


class ClientEventRequest(BaseModel):
    event: str


@router.post("/event", status_code=status.HTTP_204_NO_CONTENT)
async def report_client_event(
    payload: ClientEventRequest,
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
):
    """Records major operations that happen in the browser (e.g. file exports)."""
    label = CLIENT_EVENTS.get(payload.event)
    if not label:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown event.")
    await log_action(request, ctx, label)
