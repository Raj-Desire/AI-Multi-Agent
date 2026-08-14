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
        
        decrypted_secret = decrypt_token(cfg.encrypted_api_key_secret) if cfg.encrypted_api_key_secret else None

        return TwilioConfigResponse(
            account_sid=cfg.account_sid,
            auth_token_masked=mask_auth_token(decrypt_token(cfg.encrypted_auth_token)),
            phone_number=cfg.phone_number,
            twiml_app_sid=cfg.twiml_app_sid,
            api_key_sid=cfg.api_key_sid,
            api_key_secret_masked=mask_auth_token(decrypted_secret) if decrypted_secret else None,
            public_base_url=cfg.public_base_url,
            status=cfg.status
        )

    async def save_config(self, ctx: TenantContext, req: SaveTwilioConfigRequest) -> TwilioConfigResponse:
        existing = await self.repo.get_by_org(ctx.organization_id)
        
        # Handle Auth Token preservation if masked
        if req.auth_token and ("*" in req.auth_token) and existing:
            encrypted_auth = existing.encrypted_auth_token
            real_auth_token = decrypt_token(existing.encrypted_auth_token)
        else:
            encrypted_auth = encrypt_token(req.auth_token)
            real_auth_token = req.auth_token

        # Handle API Key Secret preservation if masked
        if req.api_key_secret and ("*" in req.api_key_secret) and existing:
            encrypted_api_secret = existing.encrypted_api_key_secret
            real_api_secret = decrypt_token(existing.encrypted_api_key_secret) if existing.encrypted_api_key_secret else None
        elif req.api_key_secret:
            encrypted_api_secret = encrypt_token(req.api_key_secret)
            real_api_secret = req.api_key_secret
        else:
            encrypted_api_secret = existing.encrypted_api_key_secret if existing else None
            real_api_secret = decrypt_token(existing.encrypted_api_key_secret) if (existing and existing.encrypted_api_key_secret) else None

        # Auto-sync TwiML App voiceUrl if public_base_url and twiml_app_sid provided
        if req.twiml_app_sid and req.public_base_url:
            cleaned_url = req.public_base_url.strip().rstrip("/")
            if not ("localhost" in cleaned_url or "127.0.0.1" in cleaned_url):
                expected_voice_url = f"{cleaned_url}/api/v1/twilio/voice/twiml"
                try:
                    def _sync_twiml_app():
                        client = Client(req.account_sid, real_auth_token)
                        client.applications(req.twiml_app_sid).update(
                            voice_url=expected_voice_url,
                            voice_method="POST",
                            voice_fallback_url=expected_voice_url,
                            voice_fallback_method="POST"
                        )
                    await asyncio.to_thread(_sync_twiml_app)
                    print(f"[TwilioService] Auto-synced TwiML App {req.twiml_app_sid} voice_url -> {expected_voice_url}")
                except Exception as e:
                    print(f"[TwilioService Warning] Could not auto-sync TwiML App: {e}")

        cfg = TwilioConfiguration(
            id=existing.id if existing else f"twc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            account_sid=req.account_sid,
            encrypted_auth_token=encrypted_auth,
            phone_number=req.phone_number,
            twiml_app_sid=req.twiml_app_sid,
            api_key_sid=req.api_key_sid,
            encrypted_api_key_secret=encrypted_api_secret,
            public_base_url=req.public_base_url,
            status="CONNECTED",
            created_at=existing.created_at if existing else datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        await self.repo.save(cfg)
        return TwilioConfigResponse(
            account_sid=cfg.account_sid,
            auth_token_masked=mask_auth_token(real_auth_token),
            phone_number=cfg.phone_number,
            twiml_app_sid=cfg.twiml_app_sid,
            api_key_sid=cfg.api_key_sid,
            api_key_secret_masked=mask_auth_token(real_api_secret) if real_api_secret else None,
            public_base_url=cfg.public_base_url,
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
