import asyncio
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
        existing = await self.repo.get_by_org(ctx.organization_id)
        
        # If input token contains asterisks ('*') and existing configuration exists,
        # preserve the actual real encrypted auth token stored previously!
        if req.auth_token and ("*" in req.auth_token) and existing:
            encrypted = existing.encrypted_auth_token
            real_token = decrypt_token(existing.encrypted_auth_token)
        else:
            encrypted = encrypt_token(req.auth_token)
            real_token = req.auth_token

        cfg = TwilioConfiguration(
            id=existing.id if existing else f"twc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            account_sid=req.account_sid,
            encrypted_auth_token=encrypted,
            phone_number=req.phone_number,
            status="CONNECTED",
            created_at=existing.created_at if existing else datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        await self.repo.save(cfg)
        return TwilioConfigResponse(
            account_sid=cfg.account_sid,
            auth_token_masked=mask_auth_token(real_token),
            phone_number=cfg.phone_number,
            status=cfg.status
        )

    async def test_connection(self, ctx: TenantContext) -> dict:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return {"success": False, "message": "Twilio configuration not found"}
        
        auth_token = decrypt_token(cfg.encrypted_auth_token)
        if not auth_token or "*" in auth_token:
            return {"success": False, "message": "Invalid Auth Token stored. Please re-enter your Twilio Auth Token."}

        try:
            def _sync_test():
                client = Client(cfg.account_sid, auth_token)
                account = client.api.v2010.accounts(cfg.account_sid).fetch()
                return account.friendly_name, account.status

            friendly_name, status = await asyncio.to_thread(_sync_test)
            return {"success": True, "message": f"Twilio connected: {friendly_name} ({status})"}
        except Exception as e:
            return {"success": False, "message": f"Twilio connection failed: {str(e)}"}
