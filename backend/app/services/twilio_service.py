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
            inbound_forward_mode=cfg.inbound_forward_mode or "global",
            inbound_forward_global_number=cfg.inbound_forward_global_number,
            inbound_forward_mapping=cfg.inbound_forward_mapping or {},
            default_agent_id=cfg.default_agent_id,
            inbound_agent_mapping=cfg.inbound_agent_mapping or {},
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

        # If phone numbers are not explicitly supplied or user requests auto-fetch, fetch purchased numbers from Twilio API
        incoming_phone_numbers = req.phone_number.strip() if req.phone_number else ""
        if not incoming_phone_numbers:
            try:
                def _fetch_numbers():
                    client = Client(req.account_sid, real_auth_token)
                    nums = client.incoming_phone_numbers.list(limit=20)
                    return [n.phone_number for n in nums if n.phone_number]
                fetched = await asyncio.to_thread(_fetch_numbers)
                if fetched:
                    incoming_phone_numbers = ", ".join(fetched)
                    print(f"[TwilioService] Auto-fetched {len(fetched)} numbers from Twilio account: {incoming_phone_numbers}")
            except Exception as e:
                print(f"[TwilioService Warning] Could not auto-fetch phone numbers: {e}")

        # Auto-sync TwiML App voiceUrl AND incoming phone numbers webhook if public_base_url is provided
        effective_base_url = req.public_base_url or (existing.public_base_url if existing else None)
        if effective_base_url and not ("localhost" in effective_base_url or "127.0.0.1" in effective_base_url):
            cleaned_url = effective_base_url.strip().rstrip("/")
            expected_voice_url = f"{cleaned_url}/api/v1/twilio/voice/twiml"
            
            # 1. Sync TwiML App
            if req.twiml_app_sid:
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

            # 2. Sync Inbound Webhook on each purchased Twilio Phone Number
            all_numbers_list = [n.strip() for n in (incoming_phone_numbers or (existing.phone_number if existing else "")).split(",") if n.strip()]
            if all_numbers_list:
                try:
                    def _sync_inbound_numbers():
                        client = Client(req.account_sid, real_auth_token)
                        tw_numbers = client.incoming_phone_numbers.list(limit=50)
                        for tw_num in tw_numbers:
                            if tw_num.phone_number in all_numbers_list:
                                if tw_num.voice_url != expected_voice_url:
                                    client.incoming_phone_numbers(tw_num.sid).update(
                                        voice_url=expected_voice_url,
                                        voice_method="POST"
                                    )
                                    print(f"[TwilioService] Synced Inbound Webhook on {tw_num.phone_number} -> {expected_voice_url}")
                    await asyncio.to_thread(_sync_inbound_numbers)
                except Exception as e:
                    print(f"[TwilioService Warning] Could not auto-sync phone numbers webhook: {e}")

        cfg = TwilioConfiguration(
            id=existing.id if existing else f"twc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            account_sid=req.account_sid,
            encrypted_auth_token=encrypted_auth,
            phone_number=incoming_phone_numbers or (existing.phone_number if existing else ""),
            twiml_app_sid=req.twiml_app_sid,
            api_key_sid=req.api_key_sid,
            encrypted_api_key_secret=encrypted_api_secret,
            public_base_url=req.public_base_url,
            inbound_forward_mode=req.inbound_forward_mode or (existing.inbound_forward_mode if existing else "global"),
            inbound_forward_global_number=req.inbound_forward_global_number if req.inbound_forward_global_number is not None else (existing.inbound_forward_global_number if existing else None),
            inbound_forward_mapping=req.inbound_forward_mapping if req.inbound_forward_mapping is not None else (existing.inbound_forward_mapping if existing else {}),
            default_agent_id=req.default_agent_id if req.default_agent_id is not None else (existing.default_agent_id if existing else None),
            inbound_agent_mapping=req.inbound_agent_mapping if req.inbound_agent_mapping is not None else (existing.inbound_agent_mapping if existing else {}),
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
            inbound_forward_mode=cfg.inbound_forward_mode,
            inbound_forward_global_number=cfg.inbound_forward_global_number,
            inbound_forward_mapping=cfg.inbound_forward_mapping,
            default_agent_id=cfg.default_agent_id,
            inbound_agent_mapping=cfg.inbound_agent_mapping,
            status=cfg.status
        )

    async def fetch_account_phone_numbers(self, ctx: TenantContext, account_sid: Optional[str] = None, auth_token: Optional[str] = None) -> list[str]:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        
        target_account_sid = account_sid or (cfg.account_sid if cfg else None)
        target_auth_token = auth_token or (decrypt_token(cfg.encrypted_auth_token) if cfg else None)

        if not target_account_sid or not target_auth_token:
            raise ValueError("Account SID and Auth Token are required to fetch purchased phone numbers.")

        if "*" in target_auth_token and cfg:
            target_auth_token = decrypt_token(cfg.encrypted_auth_token)

        def _fetch():
            client = Client(target_account_sid, target_auth_token)
            numbers = client.incoming_phone_numbers.list(limit=50)
            return [num.phone_number for num in numbers if num.phone_number]

        return await asyncio.to_thread(_fetch)

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
