"""Resolves which telephony provider adapter an organization (or an existing call) uses."""

import os
from typing import Dict

from app.repositories.telephony_settings_repository import TelephonySettingsRepository
from app.telephony.base import TelephonyProvider
from app.telephony.types import TelephonyError

DEFAULT_PROVIDER = "twilio"
DEFAULT_MARKET = "international"
# Which provider carries each market by default ("both" is a platform operator that routes per number).
MARKET_PROVIDER = {"domestic": "plivo", "international": "twilio", "both": "twilio"}
_PROVIDERS: Dict[str, TelephonyProvider] = {}


def register_provider(provider: TelephonyProvider) -> None:
    _PROVIDERS[provider.name] = provider


def _plivo_enabled() -> bool:
    """Plivo is on unless TELEPHONY_PLIVO_ENABLED=false (an emergency switch to stop all Plivo traffic)."""
    return (os.getenv("TELEPHONY_PLIVO_ENABLED") or "true").strip().lower() != "false"


def get_provider(name: str) -> TelephonyProvider:
    if name == "plivo" and not _plivo_enabled():
        raise TelephonyError("This telephony provider is not enabled.")
    provider = _PROVIDERS.get(name)
    if provider is None:
        raise TelephonyError("Telephony provider is not available.")
    return provider


async def resolve_provider_name(org_id: str) -> str:
    settings = await TelephonySettingsRepository().get(org_id)
    return settings.provider if settings else DEFAULT_PROVIDER


async def provider_for_org(org_id: str) -> TelephonyProvider:
    return get_provider(await resolve_provider_name(org_id))


async def resolve_market(org_id: str) -> str:
    settings = await TelephonySettingsRepository().get(org_id)
    return settings.market if settings else DEFAULT_MARKET


def _digits(number: str) -> str:
    return "".join(c for c in (number or "") if c.isdigit())


def _config_numbers(cfg) -> list:
    return [n.strip() for n in (getattr(cfg, "phone_number", "") or "").split(",") if n.strip()]


async def provider_name_for_number(org_id: str, number: str) -> str:
    """Provider for a call made from `number`. Only a "both" organization routes by number; every other
    organization always uses its own provider."""
    default = await resolve_provider_name(org_id)
    if await resolve_market(org_id) != "both":
        return default
    wanted = _digits(number)
    for name in ("plivo", "twilio"):
        cfg = await load_config_for(name, org_id)
        if cfg and wanted and any(_digits(n) == wanted for n in _config_numbers(cfg)):
            return name
    return default


async def provider_for_number(org_id: str, number: str) -> TelephonyProvider:
    return get_provider(await provider_name_for_number(org_id, number))


async def list_numbers(org_id: str) -> list:
    """Numbers the organization can call from, each labelled with the provider that owns it."""
    names = ["twilio", "plivo"] if await resolve_market(org_id) == "both" else [await resolve_provider_name(org_id)]
    listing = []
    for name in names:
        cfg = await load_config_for(name, org_id)
        for number in _config_numbers(cfg) if cfg else []:
            listing.append({"number": number if number.startswith("+") else "+" + _digits(number), "provider": name})
    return listing


def is_available(name: str) -> bool:
    """True when the provider can actually carry calls: an adapter is registered and, for Plivo, the flag is on."""
    if name == "plivo" and not _plivo_enabled():
        return False
    return name in _PROVIDERS


async def load_config_for(provider_name: str, org_id: str):
    """The organization's configuration document for ONE provider (None when not configured).

    Call-scoped code (a live stream, an ended call) must use the provider that carried the call, not the
    organization's current selection, which may have changed since.
    Both configuration models expose the same fields used outside the adapters: phone_number, default_agent_id,
    public_base_url, inbound_agent_mapping, escalation_alerts_enabled, escalation_alert_email, inbound_forward_*.
    """
    if provider_name == "plivo":
        from app.repositories.plivo_repository import PlivoRepository

        return await PlivoRepository().get_by_org(org_id)
    from app.repositories.twilio_repository import TwilioRepository

    return await TwilioRepository().get_by_org(org_id)


async def load_org_config(org_id: str):
    """Configuration of the provider the organization currently has selected (use for NEW calls only)."""
    return await load_config_for(await resolve_provider_name(org_id), org_id)


def provider_for_call(call_or_session) -> TelephonyProvider:
    """The provider stored on a call or live session (old records without one are Twilio)."""
    return get_provider(getattr(call_or_session, "provider", None) or DEFAULT_PROVIDER)
