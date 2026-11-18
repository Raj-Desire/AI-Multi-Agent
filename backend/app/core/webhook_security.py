"""
Authentication for the two public entry points that Twilio talks to.

1. Webhooks (/twilio/voice/twiml, /voice/status, /voice/amd): Twilio signs every request with the account's auth token
   (X-Twilio-Signature). `require_twilio_signature` recomputes it with the stored, decrypted token of the account named in
   the request, so a forged message is rejected.

2. The audio WebSocket (/voice/stream): the platform signs (organization, agent, direction, session) into a short-lived
   token when it builds the call's TwiML, and the gateway checks it when the stream starts. Without it anyone could open
   a stream, name any organization and agent, and run AI sessions on that organization's credits.

Rollout switches (environment):
    PLIVO_WEBHOOK_VERIFY  = off | log | enforce   (default: log)  same meaning, for Plivo (X-Plivo-Signature-V3)
    TWILIO_WEBHOOK_VERIFY = off | log | enforce   (default: log)  log = verify and warn, never reject
    VOICE_STREAM_AUTH     = off | log | enforce   (default: enforce)

Webhook verification defaults to log because the signature only matches when the server sees the exact public URL Twilio
called (PUBLIC_BASE_URL behind a proxy); check the logs for "signature mismatch" on real calls, then set it to enforce.
"""

import hashlib
import hmac
import logging
import os
import time
from typing import Dict, List, Optional
from urllib.parse import urlsplit

from fastapi import HTTPException, Request

logger = logging.getLogger("webhook_security")

_MODES = ("off", "log", "enforce")


def _mode(env_name: str, default: str) -> str:
    value = (os.getenv(env_name) or default).strip().lower()
    return value if value in _MODES else default


def twilio_webhook_mode() -> str:
    return _mode("TWILIO_WEBHOOK_VERIFY", "log")


def plivo_webhook_mode() -> str:
    return _mode("PLIVO_WEBHOOK_VERIFY", "log")


def stream_auth_mode() -> str:
    return _mode("VOICE_STREAM_AUTH", "enforce")


# ----------------------------------------------------------------------------------------------------------------
# Twilio webhook signature
# ----------------------------------------------------------------------------------------------------------------

def _candidate_urls(request: Request, public_bases: List[str]) -> List[str]:
    """Every URL Twilio might have signed: the configured public base, the forwarded headers, and the raw request URL."""
    path = request.url.path
    query = f"?{request.url.query}" if request.url.query else ""
    urls: List[str] = []
    for base in public_bases:
        base = (base or "").strip().rstrip("/")
        if base:
            urls.append(f"{base}{path}{query}")
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if proto and host:
        urls.append(f"{proto}://{host}{path}{query}")
    urls.append(str(request.url))
    seen, ordered = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u)
            ordered.append(u)
    return ordered


async def verify_twilio_signature(request: Request) -> Optional[bool]:
    """True = valid, False = signature present but wrong or missing, None = nothing to verify against (no config)."""
    signature = request.headers.get("x-twilio-signature") or ""
    if not signature:
        return False

    params: Dict[str, str] = {}
    if request.method == "POST":
        try:
            form = await request.form()
            params = {k: v for k, v in form.items() if isinstance(v, str)}
        except Exception:
            params = {}
    account_sid = params.get("AccountSid") or request.query_params.get("AccountSid") or ""

    from twilio.request_validator import RequestValidator
    from app.core.security import decrypt_token
    from app.repositories.twilio_repository import TwilioRepository

    try:
        configs = await TwilioRepository().list_all()
    except Exception as e:
        logger.error(f"[WebhookSecurity] could not load Twilio configurations: {e}")
        return None
    if account_sid:
        configs = [c for c in configs if c.account_sid == account_sid]
    configs = configs[:25]
    if not configs:
        return None

    public_bases = [os.getenv("PUBLIC_BASE_URL") or ""] + [getattr(c, "public_base_url", None) or "" for c in configs]
    urls = _candidate_urls(request, public_bases)

    checked = False
    for cfg in configs:
        try:
            auth_token = decrypt_token(cfg.encrypted_auth_token)
        except Exception:
            continue
        if not auth_token:
            continue
        checked = True
        validator = RequestValidator(auth_token)
        for url in urls:
            if validator.validate(url, params, signature):
                return True
    return False if checked else None


async def require_twilio_signature(request: Request) -> None:
    """FastAPI dependency for Twilio webhooks. Behaviour depends on TWILIO_WEBHOOK_VERIFY."""
    mode = twilio_webhook_mode()
    if mode == "off":
        return
    result = await verify_twilio_signature(request)
    if result is True:
        return
    reason = {False: "signature mismatch or missing", None: "no Twilio configuration to verify against"}[result]
    path = urlsplit(str(request.url)).path
    if mode == "enforce":
        logger.warning(f"[WebhookSecurity] REJECTED {request.method} {path}: {reason}")
        raise HTTPException(status_code=403, detail="Invalid request signature")
    logger.warning(f"[WebhookSecurity] would reject {request.method} {path} ({reason}); TWILIO_WEBHOOK_VERIFY=log so it is allowed")


async def require_plivo_signature(request: Request) -> None:
    """FastAPI dependency for Plivo webhooks. Behaviour depends on PLIVO_WEBHOOK_VERIFY (off | log | enforce)."""
    mode = plivo_webhook_mode()
    if mode == "off":
        return
    from app.telephony.registry import get_provider

    result = await get_provider("plivo").verify_webhook(request)
    if result is True:
        return
    reason = {False: "signature mismatch or missing", None: "no Plivo configuration to verify against"}[result]
    path = urlsplit(str(request.url)).path
    if mode == "enforce":
        logger.warning(f"[WebhookSecurity] REJECTED {request.method} {path}: {reason}")
        raise HTTPException(status_code=403, detail="Invalid request signature")
    logger.warning(f"[WebhookSecurity] would reject {request.method} {path} ({reason}); PLIVO_WEBHOOK_VERIFY=log so it is allowed")


# ----------------------------------------------------------------------------------------------------------------
# Audio stream token
# ----------------------------------------------------------------------------------------------------------------

STREAM_TOKEN_TTL_SECONDS = 900


def _stream_key() -> bytes:
    from app.core.security import JWT_SECRET
    return hashlib.sha256(b"voice-stream-v1:" + JWT_SECRET.encode()).digest()


def _stream_message(org_id: str, agent_id: str, direction: str, call_session_id: str, exp: int) -> bytes:
    return f"{org_id}|{agent_id}|{direction}|{call_session_id}|{exp}".encode()


def create_stream_token(org_id: str, agent_id: str, direction: str, call_session_id: str = "", ttl_seconds: int = STREAM_TOKEN_TTL_SECONDS) -> str:
    """Signed token for one call's stream. Format: <expiry>.<hex signature> (safe inside an XML attribute)."""
    exp = int(time.time()) + int(ttl_seconds)
    sig = hmac.new(_stream_key(), _stream_message(org_id or "", agent_id or "", direction or "", call_session_id or "", exp), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def verify_stream_token(token: str, org_id: str, agent_id: str, direction: str, call_session_id: str = "") -> bool:
    if not token or "." not in token:
        return False
    exp_str, _, sig = token.partition(".")
    try:
        exp = int(exp_str)
    except ValueError:
        return False
    if exp < time.time():
        return False
    expected = hmac.new(_stream_key(), _stream_message(org_id or "", agent_id or "", direction or "", call_session_id or "", exp), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def check_stream_start(custom_params: Dict[str, str]) -> bool:
    """Gateway helper: is this stream's 'start' message backed by a token the platform issued for exactly these values?"""
    return verify_stream_token(
        str(custom_params.get("stream_token") or ""),
        str(custom_params.get("organization_id") or ""),
        str(custom_params.get("agent_id") or ""),
        str(custom_params.get("direction") or ""),
        str(custom_params.get("call_session_id") or ""),
    )
