from datetime import datetime, timezone
import uuid
from typing import Optional
from twilio.rest import Client

from app.core.dependencies import TenantContext
from app.core.security import encrypt_token, decrypt_token, mask_auth_token
from app.models.twilio import TwilioConfiguration
from app.schemas.twilio import SaveTwilioConfigRequest, TwilioConfigResponse
from app.repositories.twilio_repository import TwilioRepository


class TwilioService:
    def __init__(self, repo: TwilioRepository):
        self.repo = repo

    async def get_config(self, ctx: TenantContext) -> Optional[TwilioConfigResponse]:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return None
        return TwilioConfigResponse(
            account_sid=cfg.account_sid,
            auth_token_masked=mask_auth_token(decrypt_token(cfg.encrypted_auth_token)),
            phone_number=cfg.phone_number,
            status=cfg.status
        )

    async def save_config(self, ctx: TenantContext, req: SaveTwilioConfigRequest) -> TwilioConfigResponse:
        encrypted = encrypt_token(req.auth_token)
        cfg = TwilioConfiguration(
            id=f"twc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            account_sid=req.account_sid,
            encrypted_auth_token=encrypted,
            phone_number=req.phone_number,
            status="CONNECTED",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        await self.repo.save(cfg)
        return TwilioConfigResponse(
            account_sid=cfg.account_sid,
            auth_token_masked=mask_auth_token(req.auth_token),
            phone_number=cfg.phone_number,
            status=cfg.status
        )

    async def test_connection(self, ctx: TenantContext) -> dict:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return {"success": False, "message": "Twilio configuration not found"}
        auth_token = decrypt_token(cfg.encrypted_auth_token)
        try:
            client = Client(cfg.account_sid, auth_token)
            account = client.api.v2010.accounts(cfg.account_sid).fetch()
            return {"success": True, "message": f"Twilio connected: {account.friendly_name} ({account.status})"}
        except Exception as e:
            return {"success": False, "message": f"Twilio connection failed: {str(e)}"}
