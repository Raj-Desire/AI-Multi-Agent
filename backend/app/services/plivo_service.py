import asyncio
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.dependencies import TenantContext
from app.core.security import decrypt_token, encrypt_token, mask_auth_token
from app.models.plivo import PlivoConfiguration
from app.repositories.plivo_repository import PlivoRepository, normalize_number
from app.repositories.twilio_repository import TwilioRepository
from app.schemas.plivo import PlivoBalanceResponse, PlivoConfigResponse, SavePlivoConfigRequest

_AUTH_FAILED = "Telephony authentication failed. Check your Auth ID and Auth Token."


def _make_client(auth_id: str, auth_token: str):
    import plivo

    return plivo.RestClient(auth_id, auth_token)


def _is_masked(value: Optional[str]) -> bool:
    return bool(value) and any(c in value for c in ("*", "•"))


def _response(cfg: PlivoConfiguration, real_token: str) -> PlivoConfigResponse:
    return PlivoConfigResponse(
        auth_id=cfg.auth_id,
        auth_token_masked=mask_auth_token(real_token),
        phone_number=cfg.phone_number,
        application_id=cfg.application_id,
        public_base_url=cfg.public_base_url,
        inbound_forward_mode=cfg.inbound_forward_mode or "global",
        inbound_forward_global_number=cfg.inbound_forward_global_number,
        inbound_forward_mapping=cfg.inbound_forward_mapping or {},
        default_agent_id=cfg.default_agent_id,
        inbound_agent_mapping=cfg.inbound_agent_mapping or {},
        escalation_alerts_enabled=cfg.escalation_alerts_enabled if cfg.escalation_alerts_enabled is not None else True,
        escalation_alert_email=cfg.escalation_alert_email,
        status=cfg.status,
    )


class PlivoService:
    def __init__(self, repo: PlivoRepository):
        self.repo = repo

    async def get_config(self, ctx: TenantContext) -> Optional[PlivoConfigResponse]:
        cfg = await self.repo.get_by_org(ctx.organization_id)
        if not cfg:
            return None
        return _response(cfg, decrypt_token(cfg.encrypted_auth_token))

    async def save_config(self, ctx: TenantContext, req: SavePlivoConfigRequest) -> PlivoConfigResponse:
        existing = await self.repo.get_by_org(ctx.organization_id)
        if _is_masked(req.auth_token) and existing:
            encrypted, real_token = existing.encrypted_auth_token, decrypt_token(existing.encrypted_auth_token)
        else:
            encrypted, real_token = encrypt_token(req.auth_token), req.auth_token

        def keep(new, field, default=None):
            """The submitted value, else what was stored, else the default."""
            if new is not None:
                return new
            return getattr(existing, field) if existing else default

        phone_numbers = req.phone_number.strip() or (existing.phone_number if existing else "")
        await self._ensure_numbers_unclaimed(ctx.organization_id, phone_numbers)

        base_url = (os.getenv("PUBLIC_BASE_URL") or req.public_base_url or (existing.public_base_url if existing else None) or "").strip().rstrip("/")
        application_id = req.application_id or (existing.application_id if existing else None)
        if base_url and "localhost" not in base_url and "127.0.0.1" not in base_url:
            application_id = await self._sync_application(ctx.organization_id, req.auth_id.strip(), real_token, phone_numbers, base_url, application_id) or application_id

        cfg = PlivoConfiguration(
            id=existing.id if existing else f"plc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            auth_id=req.auth_id.strip(),
            encrypted_auth_token=encrypted,
            phone_number=phone_numbers,
            application_id=application_id,
            public_base_url=req.public_base_url,
            inbound_forward_mode=req.inbound_forward_mode or (existing.inbound_forward_mode if existing else "global"),
            inbound_forward_global_number=keep(req.inbound_forward_global_number, "inbound_forward_global_number"),
            inbound_forward_mapping=keep(req.inbound_forward_mapping, "inbound_forward_mapping", {}),
            default_agent_id=keep(req.default_agent_id, "default_agent_id"),
            inbound_agent_mapping=keep(req.inbound_agent_mapping, "inbound_agent_mapping", {}),
            escalation_alerts_enabled=keep(req.escalation_alerts_enabled, "escalation_alerts_enabled", True),
            escalation_alert_email=keep(req.escalation_alert_email, "escalation_alert_email"),
            status="CONNECTED",
            created_at=existing.created_at if existing else datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        await self.repo.save(cfg)
        return _response(cfg, real_token)

    async def _sync_application(self, org_id: str, auth_id: str, token: str, phone_numbers: str, base_url: str, app_id: Optional[str]) -> Optional[str]:
        """Points the provider at this server: one application whose answer/hangup URLs are ours, attached to every
        number of the organization. Best effort: a failure is logged and never blocks saving the credentials."""
        numbers = [re.sub(r"\D", "", n) for n in phone_numbers.split(",") if n.strip()]
        urls = dict(
            answer_url=f"{base_url}/api/v1/plivo/voice/answer", answer_method="POST",
            hangup_url=f"{base_url}/api/v1/plivo/voice/hangup", hangup_method="POST",
        )

        def _sync() -> str:
            client = _make_client(auth_id, token)
            current = app_id
            if current:
                client.applications.update(current, **urls)
            else:
                current = client.applications.create(app_name=re.sub(r"[^A-Za-z0-9_-]", "_", f"voice_{org_id}")[:60], **urls).app_id
            for number in numbers:
                client.numbers.update(number, app_id=current)
            return current

        try:
            return await asyncio.to_thread(_sync)
        except Exception as e:
            print(f"[PlivoService Warning] Could not sync the provider application: {e}")
            return None

    async def _ensure_numbers_unclaimed(self, org_id: str, phone_numbers: str) -> None:
        """A phone number belongs to one organization: inbound calls are routed to its owner by number."""
        wanted = {d for d in (normalize_number(n) for n in phone_numbers.split(",")) if d}
        if not wanted:
            return
        owners = [(c.organization_id, c.phone_number) for c in await self.repo.list_all()]
        owners += [(c.organization_id, c.phone_number) for c in await TwilioRepository().list_all()]
        for owner_org, numbers in owners:
            if owner_org != org_id and wanted & {d for d in (normalize_number(n) for n in (numbers or "").split(",")) if d}:
                raise ValueError("One or more phone numbers are already assigned to another organization.")

    async def _credentials(self, ctx: TenantContext, auth_id: Optional[str] = None, auth_token: Optional[str] = None):
        cfg = await self.repo.get_by_org(ctx.organization_id)
        token = (auth_token or "").strip()
        if cfg and (not token or _is_masked(token)):
            token = decrypt_token(cfg.encrypted_auth_token)
        return ((auth_id or (cfg.auth_id if cfg else "") or "").strip(), token, cfg)

    async def fetch_account_phone_numbers(self, ctx: TenantContext, auth_id: Optional[str] = None, auth_token: Optional[str] = None) -> list[str]:
        auth_id, token, _ = await self._credentials(ctx, auth_id, auth_token)
        if not auth_id or not token:
            raise ValueError("Auth ID and Auth Token are required to fetch phone numbers.")

        def _fetch():
            listing = _make_client(auth_id, token).numbers.list(limit=20)
            numbers = [getattr(n, "number", None) for n in getattr(listing, "objects", []) or []]
            return [n if str(n).startswith("+") else f"+{n}" for n in numbers if n]

        try:
            return await asyncio.to_thread(_fetch)
        except Exception:
            raise ValueError(_AUTH_FAILED)

    async def test_connection(self, ctx: TenantContext) -> dict:
        auth_id, token, cfg = await self._credentials(ctx)
        if not cfg:
            return {"success": False, "message": "Telephony configuration not found."}
        try:
            await asyncio.to_thread(lambda: _make_client(auth_id, token).account.get())
        except Exception:
            return {"success": False, "message": _AUTH_FAILED}
        return {"success": True, "message": "Telephony connection verified."}

    async def get_balance(self, ctx: TenantContext) -> PlivoBalanceResponse:
        auth_id, token, cfg = await self._credentials(ctx)
        if not cfg:
            return PlivoBalanceResponse(configured=False, message="Telephony is not configured.")
        try:
            account = await asyncio.to_thread(lambda: _make_client(auth_id, token).account.get())
            return PlivoBalanceResponse(configured=True, balance=str(getattr(account, "cash_credits", "")), currency="USD")
        except Exception:
            return PlivoBalanceResponse(configured=True, message=_AUTH_FAILED)
