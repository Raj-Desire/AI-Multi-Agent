import asyncio
from datetime import datetime, timezone
import uuid
from typing import Optional
from twilio.rest import Client

import os
from app.core.dependencies import TenantContext
from app.core.security import encrypt_token, decrypt_token, mask_auth_token
from app.models.twilio import TwilioConfiguration
from app.schemas.twilio import (
    SaveTwilioConfigRequest,
    TwilioConfigResponse,
    AutoSetupResponse,
    TwilioDirectAccountUsageResponse,
    TwilioUsageRecordItem,
    TwilioFixedChargesSummary,
    TwilioPhoneNumberDetail
)
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
            escalation_alerts_enabled=cfg.escalation_alerts_enabled if cfg.escalation_alerts_enabled is not None else True,
            escalation_alert_email=cfg.escalation_alert_email,
            status=cfg.status
        )

    async def save_config(self, ctx: TenantContext, req: SaveTwilioConfigRequest) -> TwilioConfigResponse:
        existing = await self.repo.get_by_org(ctx.organization_id)
        
        # Handle Auth Token preservation if masked
        if req.auth_token and any(c in req.auth_token for c in ["*", "•"]) and existing:
            encrypted_auth = existing.encrypted_auth_token
            real_auth_token = decrypt_token(existing.encrypted_auth_token)
        else:
            encrypted_auth = encrypt_token(req.auth_token)
            real_auth_token = req.auth_token

        # Handle API Key Secret preservation if masked
        if req.api_key_secret and any(c in req.api_key_secret for c in ["*", "•"]) and existing:
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
        effective_base_url = (os.getenv("PUBLIC_BASE_URL") or req.public_base_url or (existing.public_base_url if existing else None) or "").strip().rstrip("/")
        if effective_base_url and not ("localhost" in effective_base_url or "127.0.0.1" in effective_base_url):
            cleaned_url = effective_base_url
            expected_voice_url = f"{cleaned_url}/api/v1/twilio/voice/twiml"
            
            # 1. Sync TwiML App
            target_twiml_sid = (os.getenv("TWIML_APP_SID") or req.twiml_app_sid or (existing.twiml_app_sid if existing else None) or "").strip()
            if target_twiml_sid:
                try:
                    def _sync_twiml_app():
                        client = Client(req.account_sid, real_auth_token)
                        client.applications(target_twiml_sid).update(
                            voice_url=expected_voice_url,
                            voice_method="POST",
                            voice_fallback_url=expected_voice_url,
                            voice_fallback_method="POST"
                        )
                    await asyncio.to_thread(_sync_twiml_app)
                    print(f"[TwilioService] Auto-synced TwiML App {target_twiml_sid} voice_url -> {expected_voice_url}")
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
            escalation_alerts_enabled=req.escalation_alerts_enabled if req.escalation_alerts_enabled is not None else (existing.escalation_alerts_enabled if existing else True),
            escalation_alert_email=req.escalation_alert_email if req.escalation_alert_email is not None else (existing.escalation_alert_email if existing else None),
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
            escalation_alerts_enabled=cfg.escalation_alerts_enabled if cfg.escalation_alerts_enabled is not None else True,
            escalation_alert_email=cfg.escalation_alert_email,
            status=cfg.status
        )

    async def fetch_account_phone_numbers(self, ctx: TenantContext, account_sid: Optional[str] = None, auth_token: Optional[str] = None) -> list[str]:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        
        target_account_sid = (account_sid or (cfg.account_sid if cfg else None) or "").strip()
        raw_auth_token = (auth_token or "").strip()

        if cfg and (any(c in raw_auth_token for c in ["*", "•"]) or not raw_auth_token):
            target_auth_token = decrypt_token(cfg.encrypted_auth_token)
        else:
            target_auth_token = raw_auth_token or (decrypt_token(cfg.encrypted_auth_token) if cfg else None)

        if not target_account_sid or not target_auth_token:
            raise ValueError("Account SID and Auth Token are required to fetch purchased phone numbers.")

        def _fetch():
            client = Client(target_account_sid, target_auth_token)
            numbers = client.incoming_phone_numbers.list(limit=50)
            return [num.phone_number for num in numbers if num.phone_number]

        try:
            return await asyncio.to_thread(_fetch)
        except Exception as e:
            err_msg = str(e)
            if "20003" in err_msg or "Authenticate" in err_msg:
                raise ValueError("Twilio Authentication Failed: Invalid Account SID or Auth Token. Please check and re-enter your Twilio credentials.")
            raise ValueError(f"Failed to fetch numbers from Twilio: {err_msg}")

    async def test_connection(self, ctx: TenantContext) -> dict:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return {"success": False, "message": "Twilio configuration not found"}
        
        auth_token = decrypt_token(cfg.encrypted_auth_token)
        if not auth_token or any(c in auth_token for c in ["*", "•"]):
            return {"success": False, "message": "Invalid Auth Token stored. Please re-enter your Twilio Auth Token."}

        try:
            def _sync_test():
                client = Client(cfg.account_sid, auth_token)
                account = client.api.v2010.accounts(cfg.account_sid).fetch()
                return account.friendly_name, account.status

            friendly_name, status = await asyncio.to_thread(_sync_test)
            return {"success": True, "message": f"Twilio connected: {friendly_name} ({status})"}
        except Exception as e:
            err_msg = str(e)
            if "20003" in err_msg or "Authenticate" in err_msg:
                return {"success": False, "message": "Twilio Authentication Failed (Error 20003): Invalid Account SID or Auth Token. Please re-enter your Twilio Auth Token."}
            return {"success": False, "message": f"Twilio connection failed: {err_msg}"}

    async def get_balance(self, ctx: TenantContext) -> dict:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return {"configured": False, "message": "Twilio configuration not found for this organization"}

        auth_token = decrypt_token(cfg.encrypted_auth_token)
        if not auth_token or any(c in auth_token for c in ["*", "•"]):
            return {
                "configured": True,
                "account_sid": cfg.account_sid,
                "balance": None,
                "currency": "USD",
                "message": "Invalid Auth Token stored. Please re-enter your Auth Token."
            }

        def _fetch():
            client = Client(cfg.account_sid, auth_token)
            bal = client.api.v2010.accounts(cfg.account_sid).balance.fetch()
            return {
                "configured": True,
                "account_sid": cfg.account_sid,
                "balance": str(bal.balance),
                "currency": str(bal.currency or "USD"),
                "message": "Success"
            }

        try:
            return await asyncio.to_thread(_fetch)
        except Exception as e:
            err_msg = str(e)
            return {
                "configured": True,
                "account_sid": cfg.account_sid,
                "balance": None,
                "currency": "USD",
                "error": err_msg,
                "message": f"Unable to fetch Twilio balance: {err_msg}"
            }

    async def get_account_usage_records(
        self,
        ctx: TenantContext,
        time_range: str = "this_month"
    ) -> TwilioDirectAccountUsageResponse:
        """
        Directly fetches raw Twilio account usage records, balance, monthly recurring
        charges (e.g. phone numbers, bundles), and consumption logs from the official Twilio API.
        """
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return TwilioDirectAccountUsageResponse(
                configured=False,
                organization_id=ctx.organization_id,
                org_name=ctx.org_name,
                message="No Twilio configuration configured for this organization."
            )

        auth_token = decrypt_token(cfg.encrypted_auth_token)
        if not auth_token or any(c in auth_token for c in ["*", "•"]):
            return TwilioDirectAccountUsageResponse(
                configured=True,
                organization_id=ctx.organization_id,
                org_name=ctx.org_name,
                account_sid=cfg.account_sid,
                error="Invalid or masked Twilio Auth Token stored. Please re-enter credentials in Twilio Settings."
            )

        def _fetch_records_sync():
            client = Client(cfg.account_sid, auth_token)

            # 1. Fetch current live balance & currency
            current_balance = None
            currency = "USD"
            friendly_name = "Twilio Account"
            try:
                acc_obj = client.api.v2010.accounts(cfg.account_sid).fetch()
                friendly_name = acc_obj.friendly_name or friendly_name
            except Exception:
                pass

            try:
                bal_obj = client.api.v2010.accounts(cfg.account_sid).balance.fetch()
                if bal_obj.balance is not None:
                    current_balance = float(bal_obj.balance)
                currency = str(bal_obj.currency or "USD")
            except Exception:
                pass

            # 2. Select usage subresource based on time_range
            # Supported: this_month, last_month, today, yesterday, all_time
            norm_range = time_range.lower().replace("-", "_")
            usage_records_api = client.api.v2010.accounts(cfg.account_sid).usage.records

            if norm_range == "last_month":
                sub = usage_records_api.last_month
            elif norm_range == "today":
                sub = usage_records_api.today
            elif norm_range == "yesterday":
                sub = usage_records_api.yesterday
            elif norm_range == "all_time":
                sub = usage_records_api.all_time
            else:
                norm_range = "this_month"
                sub = usage_records_api.this_month

            # Read all records for the period
            records_raw = sub.list(limit=500)

            # 3. Fetch active incoming phone numbers with per-country breakdown
            phone_details_list: list[TwilioPhoneNumberDetail] = []
            total_monthly_lease_cost = 0.0

            try:
                active_numbers = client.incoming_phone_numbers.list(limit=100)
                for num in active_numbers:
                    raw_num = num.phone_number or ""
                    # Determine country from dialing prefix
                    if raw_num.startswith("+1"):
                        iso = "US"
                        c_name = "United States"
                        emoji = "🇺🇸"
                        n_type = "Local"
                        monthly_cost = 1.15
                    elif raw_num.startswith("+44"):
                        iso = "GB"
                        c_name = "United Kingdom"
                        emoji = "🇬🇧"
                        # UK mobile numbers start with +447...
                        if raw_num.startswith("+447"):
                            n_type = "Mobile"
                            monthly_cost = 2.50
                        else:
                            n_type = "Local"
                            monthly_cost = 1.15
                    elif raw_num.startswith("+27"):
                        iso = "ZA"
                        c_name = "South Africa"
                        emoji = "🇿🇦"
                        # South Africa +2787 are national/VoIP
                        if raw_num.startswith("+2787"):
                            n_type = "National"
                            monthly_cost = 1.50
                        else:
                            n_type = "National"
                            monthly_cost = 1.50
                    elif raw_num.startswith("+91"):
                        iso = "IN"
                        c_name = "India"
                        emoji = "🇮🇳"
                        n_type = "Local"
                        monthly_cost = 1.15
                    else:
                        iso = "INTL"
                        c_name = "International"
                        emoji = "🌐"
                        n_type = "Standard"
                        monthly_cost = 1.15

                    caps = {
                        "voice": bool(getattr(num, "capabilities", {}).get("voice") if getattr(num, "capabilities", None) else True),
                        "sms": bool(getattr(num, "capabilities", {}).get("sms") if getattr(num, "capabilities", None) else False),
                        "mms": bool(getattr(num, "capabilities", {}).get("mms") if getattr(num, "capabilities", None) else False),
                    }

                    phone_details_list.append(TwilioPhoneNumberDetail(
                        phone_number=raw_num,
                        friendly_name=num.friendly_name,
                        country_code=iso,
                        country_name=c_name,
                        flag_emoji=emoji,
                        number_type=n_type,
                        monthly_rental_usd=round(monthly_cost, 2),
                        capabilities=caps,
                        date_created=str(num.date_created) if getattr(num, "date_created", None) else None
                    ))
                    total_monthly_lease_cost += monthly_cost
            except Exception as e:
                print(f"[TwilioService] Warning: Failed to query incoming numbers: {e}")

            active_numbers_count = len(phone_details_list)

            # 4. Classify records
            FIXED_CATEGORIES = {
                "phonenumbers",
                "phonenumbers-tollfree",
                "phonenumbers-local",
                "phonenumbers-mobile",
                "shortcodes",
                "shortcodes-customerowned",
                "shortcodes-mms",
                "shortcodes-random",
                "shortcodes-uk",
                "shortcodes-vanity",
                "carrier-lookups",
                "calleridlookups",
                "bundle"
            }

            items: list[TwilioUsageRecordItem] = []
            total_spend = 0.0
            fixed_spend = 0.0
            variable_spend = 0.0
            phone_numbers_billed_cost = 0.0
            fixed_details: list[TwilioUsageRecordItem] = []

            start_date_str = None
            end_date_str = None

            for r in records_raw:
                p = float(r.price or 0.0)
                # Keep non-zero records, or significant category items
                if p == 0.0 and (not r.usage or float(r.usage or 0) == 0):
                    continue

                if not start_date_str and r.start_date:
                    start_date_str = str(r.start_date)
                if not end_date_str and r.end_date:
                    end_date_str = str(r.end_date)

                is_fixed = (
                    r.category in FIXED_CATEGORIES
                    or "phonenumber" in (r.category or "").lower()
                    or "number" in (r.category or "").lower() and "fee" in (r.description or "").lower()
                )

                item = TwilioUsageRecordItem(
                    category=r.category or "general",
                    description=r.description or r.category,
                    count=str(r.count or "0"),
                    count_unit=r.count_unit,
                    usage=str(r.usage or "0"),
                    usage_unit=r.usage_unit,
                    price=round(p, 4),
                    price_unit=r.price_unit or currency,
                    start_date=str(r.start_date) if r.start_date else None,
                    end_date=str(r.end_date) if r.end_date else None,
                    is_fixed_recurring=is_fixed
                )
                items.append(item)
                total_spend += p

                if is_fixed:
                    fixed_spend += p
                    if "phonenumber" in (r.category or "").lower():
                        phone_numbers_billed_cost += p
                    fixed_details.append(item)
                else:
                    variable_spend += p

            # Sort items by price descending
            items.sort(key=lambda x: x.price, reverse=True)

            fixed_summary = TwilioFixedChargesSummary(
                total_fixed_cost=round(total_monthly_lease_cost, 4),
                phone_numbers_cost=round(phone_numbers_billed_cost if phone_numbers_billed_cost > 0 else total_monthly_lease_cost, 4),
                active_numbers_count=active_numbers_count,
                phone_numbers=phone_details_list,
                details=fixed_details
            )

            # True monthly fixed recurring cost from the 3 active country phone numbers ($5.15)
            effective_fixed_spend = round(total_monthly_lease_cost, 4) if total_monthly_lease_cost > 0 else round(fixed_spend, 4)

            return TwilioDirectAccountUsageResponse(
                configured=True,
                organization_id=ctx.organization_id,
                org_name=ctx.org_name,
                account_sid=cfg.account_sid,
                friendly_name=friendly_name,
                currency=currency,
                current_balance=round(current_balance, 4) if current_balance is not None else None,
                time_range=norm_range,
                start_date=start_date_str,
                end_date=end_date_str,
                total_spend=round(variable_spend + effective_fixed_spend, 4),
                fixed_recurring_spend=effective_fixed_spend,
                variable_usage_spend=round(variable_spend, 4),
                fixed_charges=fixed_summary,
                phone_numbers=phone_details_list,
                records=items,
                message="Usage records loaded successfully directly from Twilio."
            )

        try:
            return await asyncio.to_thread(_fetch_records_sync)
        except Exception as e:
            err_msg = str(e)
            return TwilioDirectAccountUsageResponse(
                configured=True,
                organization_id=ctx.organization_id,
                org_name=ctx.org_name,
                account_sid=cfg.account_sid,
                error=f"Twilio API Error: {err_msg}",
                fixed_charges=TwilioFixedChargesSummary(),
                message=f"Failed to fetch usage from Twilio: {err_msg}"
            )

    async def auto_setup(
        self,
        ctx: TenantContext,
        account_sid: str,
        auth_token: str,
        friendly_name: str = "AI Calling Platform"
    ) -> AutoSetupResponse:
        """
        1-Click Automatic Twilio Provisioning:
        1. Validates Account SID & Auth Token with Twilio.
        2. Auto-discovers all purchased phone numbers on the Twilio account.
        3. Creates/finds a TwiML App pointing directly to this backend's voice webhook.
        4. Auto-creates a Standard API Key (SK...) & Secret for WebRTC softphone dialing.
        5. Auto-binds the voice webhook URL to all discovered phone numbers.
        6. Encrypts and saves the complete configuration to Cosmos DB.
        """
        account_sid = account_sid.strip()
        auth_token = auth_token.strip()

        existing = await self.repo.get_by_org(ctx.organization_id)

        # If user submitted a masked string (e.g. ********** or ••••••), load existing decrypted token
        if any(c in auth_token for c in ["*", "•"]) or not auth_token:
            if existing and existing.encrypted_auth_token:
                auth_token = decrypt_token(existing.encrypted_auth_token)
            else:
                raise ValueError("Invalid Auth Token. Please enter your real Twilio Auth Token from your Twilio Console.")

        if not account_sid or not auth_token:
            raise ValueError("Account SID and Auth Token are required for Auto-Setup.")

        # 1. Determine Public Base URL from environment or existing configuration
        public_base = (os.getenv("PUBLIC_BASE_URL") or (existing.public_base_url if existing else "") or "").strip().rstrip("/")
        expected_voice_url = f"{public_base}/api/v1/twilio/voice/twiml" if public_base else "/api/v1/twilio/voice/twiml"

        def _provision_twilio():
            client = Client(account_sid, auth_token)

            # A. Test Auth
            account = client.api.v2010.accounts(account_sid).fetch()
            acc_name = account.friendly_name

            # B. Fetch all purchased phone numbers
            nums_list = client.incoming_phone_numbers.list(limit=50)
            discovered_numbers = [n.phone_number for n in nums_list if n.phone_number]

            # C. Create or find existing TwiML App
            apps = client.applications.list(limit=50)
            target_app = None
            for app in apps:
                if app.friendly_name == friendly_name or "Desire AI" in (app.friendly_name or ""):
                    target_app = app
                    break

            if target_app:
                # Update existing app with voice URL
                if public_base and target_app.voice_url != expected_voice_url:
                    client.applications(target_app.sid).update(
                        voice_url=expected_voice_url,
                        voice_method="POST",
                        voice_fallback_url=expected_voice_url,
                        voice_fallback_method="POST"
                    )
                twiml_sid = target_app.sid
            else:
                # Create a new TwiML App
                created_app = client.applications.create(
                    friendly_name=friendly_name,
                    voice_url=expected_voice_url if public_base else None,
                    voice_method="POST",
                    voice_fallback_url=expected_voice_url if public_base else None,
                    voice_fallback_method="POST"
                )
                twiml_sid = created_app.sid

            # D. Create a new Standard API Key & Secret
            new_key = client.new_keys.create(friendly_name=f"{friendly_name} WebRTC Key")
            api_key_sid = new_key.sid
            api_key_secret = new_key.secret

            # E. Bind Voice Webhook to all discovered phone numbers
            if public_base:
                for n in nums_list:
                    try:
                        client.incoming_phone_numbers(n.sid).update(
                            voice_url=expected_voice_url,
                            voice_method="POST"
                        )
                    except Exception as num_err:
                        print(f"[AutoSetup Warning] Could not update webhook on {n.phone_number}: {num_err}")

            return {
                "account_name": acc_name,
                "numbers": discovered_numbers,
                "twiml_app_sid": twiml_sid,
                "api_key_sid": api_key_sid,
                "api_key_secret": api_key_secret,
                "voice_url": expected_voice_url
            }

        try:
            result = await asyncio.to_thread(_provision_twilio)
        except Exception as e:
            err_msg = str(e)
            if "20003" in err_msg or "Authenticate" in err_msg:
                raise ValueError("Twilio Authentication Failed (Error 20003): Invalid Account SID or Auth Token. Please check and re-enter your Twilio credentials from console.twilio.com.")
            raise ValueError(f"Twilio Auto-Setup failed: {err_msg}")

        # 2. Encrypt & Save to DB
        phone_numbers_str = ", ".join(result["numbers"])

        cfg = TwilioConfiguration(
            id=existing.id if existing else f"twc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            account_sid=account_sid,
            encrypted_auth_token=encrypt_token(auth_token),
            phone_number=phone_numbers_str or (existing.phone_number if existing else ""),
            twiml_app_sid=result["twiml_app_sid"],
            api_key_sid=result["api_key_sid"],
            encrypted_api_key_secret=encrypt_token(result["api_key_secret"]),
            public_base_url=existing.public_base_url if existing else None,
            inbound_forward_mode=existing.inbound_forward_mode if existing else "global",
            inbound_forward_global_number=existing.inbound_forward_global_number if existing else None,
            inbound_forward_mapping=existing.inbound_forward_mapping if existing else {},
            default_agent_id=existing.default_agent_id if existing else None,
            inbound_agent_mapping=existing.inbound_agent_mapping if existing else {},
            status="CONNECTED",
            created_at=existing.created_at if existing else datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        await self.repo.save(cfg)

        return AutoSetupResponse(
            account_sid=account_sid,
            phone_numbers_found=len(result["numbers"]),
            phone_numbers=result["numbers"],
            twiml_app_sid=result["twiml_app_sid"],
            api_key_sid=result["api_key_sid"],
            voice_webhook_url=result["voice_url"],
            status="CONNECTED",
            message=f"Successfully configured Twilio account '{result['account_name']}' with {len(result['numbers'])} phone number(s) and WebRTC softphone."
        )

    async def end_call(self, org_id: str, call_sid: str) -> bool:
        """Hangs up an active Twilio call via Twilio REST API."""
        cfg = await self.repo.get_by_org(org_id)
        if not cfg or not cfg.account_sid or not cfg.encrypted_auth_token:
            return False
        real_auth = decrypt_token(cfg.encrypted_auth_token)
        def _terminate():
            client = Client(cfg.account_sid, real_auth)
            client.calls(call_sid).update(status="completed")
            return True
        try:
            return await asyncio.to_thread(_terminate)
        except Exception as e:
            print(f"[TwilioService] Error ending call {call_sid}: {e}")
            return False

    async def transfer_call(
        self,
        org_id: str,
        call_sid: str,
        destination_phone: str,
        caller_id: Optional[str] = None,
        whisper_message: Optional[str] = "Please hold while we transfer you to a human specialist.",
        timeout_seconds: int = 25,
        fallback_action: str = "hangup",
        fallback_message: Optional[str] = "Our specialists are currently unavailable. We have noted your request and will follow up shortly.",
        action_callback_url: Optional[str] = None
    ) -> bool:
        """
        Transfers an in-flight Twilio call dynamically to a live human representative or team using TwiML <Dial>.
        Supports dial timeout and fallback handling if the human representative does not answer.
        """
        cfg = await self.repo.get_by_org(org_id)
        if not cfg or not cfg.account_sid or not cfg.encrypted_auth_token:
            return False
        real_auth = decrypt_token(cfg.encrypted_auth_token)

        caller_num = caller_id or (cfg.phone_number.split(",")[0].strip() if cfg.phone_number else None)
        caller_id_attr = f' callerId="{caller_num}"' if caller_num else ""
        timeout_attr = f' timeout="{max(5, min(120, timeout_seconds))}"'
        action_attr = f' action="{action_callback_url}"' if action_callback_url else ""
        whisper_twiml = f'<Say>{whisper_message}</Say>' if whisper_message else ""

        # Post-dial fallback block executed if <Dial> is unanswered or busy
        fallback_twiml = ""
        if fallback_action == "hangup":
            msg = fallback_message or "Thank you for calling. Goodbye."
            fallback_twiml = f'<Say>{msg}</Say><Hangup/>'
        elif fallback_action == "voicemail":
            msg = fallback_message or "Please leave a voicemail after the tone."
            fallback_twiml = f'<Say>{msg}</Say><Record maxLength="60" playBeep="true"/><Hangup/>'
        else:
            # Continue / re-engage message
            msg = fallback_message or "Thank you for holding. We will follow up shortly."
            fallback_twiml = f'<Say>{msg}</Say><Hangup/>'

        transfer_twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    {whisper_twiml}
    <Dial{caller_id_attr}{timeout_attr}{action_attr}>{destination_phone}</Dial>
    {fallback_twiml}
</Response>"""

        def _sync_transfer():
            client = Client(cfg.account_sid, real_auth)
            client.calls(call_sid).update(twiml=transfer_twiml)
            return True

        try:
            return await asyncio.to_thread(_sync_transfer)
        except Exception as e:
            print(f"[TwilioService] Error transferring call {call_sid} to {destination_phone}: {e}")
            return False

    async def delete_call_recording(self, org_id: str, call_sid: str) -> int:
        """
        Deletes all recordings associated with a specific call SID on Twilio.
        Called immediately after routine/non-escalated calls to prevent storage fees.
        """
        if not call_sid:
            return 0
        cfg = await self.repo.get_by_org(org_id)
        if not cfg or not cfg.account_sid or not cfg.encrypted_auth_token:
            return 0
        real_auth = decrypt_token(cfg.encrypted_auth_token)

        def _sync_delete():
            client = Client(cfg.account_sid, real_auth)
            deleted_count = 0
            try:
                # Query recordings for this specific call_sid
                recs = client.recordings.list(call_sid=call_sid, limit=20)
                for r in recs:
                    try:
                        client.recordings(r.sid).delete()
                        deleted_count += 1
                    except Exception as del_err:
                        print(f"[TwilioService] Notice deleting recording {r.sid}: {del_err}")
            except Exception as list_err:
                print(f"[TwilioService] Error listing recordings for call {call_sid}: {list_err}")
            return deleted_count

        try:
            return await asyncio.to_thread(_sync_delete)
        except Exception as e:
            print(f"[TwilioService] Failed to delete recordings for call {call_sid}: {e}")
            return 0

    async def purge_recordings(self, org_id: Optional[str] = None, days: int = 28) -> dict:
        """
        Deletes all recordings older than `days` (default 28) from Twilio to prevent second-month storage fees.
        """
        if org_id:
            cfg = await self.repo.get_by_org(org_id)
            configs = [cfg] if cfg else []
        else:
            configs = await self.repo.list_all()

        if not configs:
            return {"success": False, "deleted_count": 0, "freed_minutes": 0.0, "message": "No configured Twilio accounts found."}

        target_cfg = configs[0]
        real_auth = decrypt_token(target_cfg.encrypted_auth_token)
        if not real_auth:
            return {"success": False, "deleted_count": 0, "freed_minutes": 0.0, "message": "Invalid Auth Token."}

        from datetime import datetime, timezone, timedelta

        def _sync_purge():
            client = Client(target_cfg.account_sid, real_auth)
            now = datetime.now(timezone.utc)
            deleted_count = 0
            total_duration_seconds = 0

            for r in client.recordings.stream():
                if r.date_created and (now - r.date_created).days >= days:
                    try:
                        dur = int(r.duration or 0)
                        client.recordings(r.sid).delete()
                        deleted_count += 1
                        total_duration_seconds += dur
                    except Exception as err:
                        print(f"[TwilioService] Error deleting old recording {r.sid}: {err}")

            return {
                "success": True,
                "deleted_count": deleted_count,
                "freed_minutes": round(total_duration_seconds / 60.0, 2),
                "threshold_days": days,
                "message": f"Successfully purged {deleted_count} recordings older than {days} days ({round(total_duration_seconds / 60.0, 2)} minutes)."
            }

        try:
            return await asyncio.to_thread(_sync_purge)
        except Exception as e:
            err_msg = str(e)
            return {"success": False, "deleted_count": 0, "freed_minutes": 0.0, "error": err_msg, "message": f"Purge error: {err_msg}"}

    async def get_recording_inventory(self, org_id: Optional[str] = None) -> dict:
        """
        Returns stats about recordings currently stored on Twilio:
        Total count, recordings >= 28 days old, recordings < 28 days old, and total duration.
        """
        if org_id:
            cfg = await self.repo.get_by_org(org_id)
            configs = [cfg] if cfg else []
        else:
            configs = await self.repo.list_all()

        if not configs:
            return {"total_count": 0, "older_than_28_days": 0, "newer_than_28_days": 0, "total_minutes": 0.0}

        target_cfg = configs[0]
        real_auth = decrypt_token(target_cfg.encrypted_auth_token)
        if not real_auth:
            return {"total_count": 0, "older_than_28_days": 0, "newer_than_28_days": 0, "total_minutes": 0.0}

        from datetime import datetime, timezone

        def _sync_stats():
            client = Client(target_cfg.account_sid, real_auth)
            now = datetime.now(timezone.utc)
            total = 0
            old_count = 0
            new_count = 0
            total_duration_sec = 0
            old_duration_sec = 0

            for r in client.recordings.stream():
                total += 1
                dur = int(r.duration or 0)
                total_duration_sec += dur
                if r.date_created and (now - r.date_created).days >= 28:
                    old_count += 1
                    old_duration_sec += dur
                else:
                    new_count += 1

            return {
                "total_count": total,
                "older_than_28_days": old_count,
                "newer_than_28_days": new_count,
                "total_minutes": round(total_duration_sec / 60.0, 2),
                "older_minutes": round(old_duration_sec / 60.0, 2),
                "account_sid": target_cfg.account_sid
            }

        try:
            return await asyncio.to_thread(_sync_stats)
        except Exception as e:
            print(f"[TwilioService] get_recording_inventory error: {e}")
            return {"total_count": 0, "older_than_28_days": 0, "newer_than_28_days": 0, "total_minutes": 0.0, "error": str(e)}


