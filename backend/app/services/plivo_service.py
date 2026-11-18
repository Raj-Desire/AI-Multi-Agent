import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.dependencies import TenantContext
from app.core.security import decrypt_token, encrypt_token, mask_auth_token
from app.models.plivo import PlivoConfiguration
from app.repositories.plivo_repository import PlivoRepository
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

        cfg = PlivoConfiguration(
            id=existing.id if existing else f"plc_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            auth_id=req.auth_id.strip(),
            encrypted_auth_token=encrypted,
            phone_number=req.phone_number.strip() or (existing.phone_number if existing else ""),
            application_id=req.application_id,
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
