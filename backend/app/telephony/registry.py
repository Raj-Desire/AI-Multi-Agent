"""Resolves which telephony provider adapter an organization (or an existing call) uses."""

import os
from typing import Dict

from app.repositories.telephony_settings_repository import TelephonySettingsRepository
from app.telephony.base import TelephonyProvider
from app.telephony.types import TelephonyError

DEFAULT_PROVIDER = "twilio"
_PROVIDERS: Dict[str, TelephonyProvider] = {}


def register_provider(provider: TelephonyProvider) -> None:
    _PROVIDERS[provider.name] = provider


def _plivo_enabled() -> bool:
    return (os.getenv("TELEPHONY_PLIVO_ENABLED") or "").strip().lower() == "true"


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


def provider_for_call(call_or_session) -> TelephonyProvider:
    """The provider stored on a call or live session (old records without one are Twilio)."""
    return get_provider(getattr(call_or_session, "provider", None) or DEFAULT_PROVIDER)
