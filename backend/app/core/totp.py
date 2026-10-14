import base64
import hashlib
import hmac
import secrets
import struct
import time
import urllib.parse
from typing import Optional


def generate_totp_secret(num_bytes: int = 20) -> str:
    """
    Generates a secure, cryptographically random base32 secret key.
    20 random bytes (160 bits) yields a 32-character base32 secret string.
    """
    raw_bytes = secrets.token_bytes(num_bytes)
    return base64.b32encode(raw_bytes).decode("utf-8").rstrip("=")


def get_totp_uri(secret: str, email: str, issuer: str = "AI Voice Platform") -> str:
    """
    Constructs an RFC 6238 otpauth URI compatible with Microsoft Authenticator,
    Google Authenticator, and other standard TOTP apps.
    Format: otpauth://totp/{issuer}:{email}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30
    """
    clean_secret = secret.strip().replace(" ", "").upper()
    encoded_issuer = urllib.parse.quote(issuer)
    encoded_email = urllib.parse.quote(email.strip())
    label = f"{encoded_issuer}:{encoded_email}"
    params = urllib.parse.urlencode({
        "secret": clean_secret,
        "issuer": issuer,
        "algorithm": "SHA1",
        "digits": 6,
        "period": 30,
    })
    return f"otpauth://totp/{label}?{params}"


def generate_totp_code(secret: str, interval: int = 30) -> str:
    """
    Generates the current 6-digit TOTP code for the given base32 secret.
    """
    clean_secret = secret.strip().replace(" ", "").upper()
    padded_secret = clean_secret + "=" * ((8 - len(clean_secret) % 8) % 8)
    key = base64.b32decode(padded_secret, casefold=True)
    counter = int(time.time() // interval)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
    return f"{code:06d}"


def verify_totp_code(secret: str, code: str, window: int = 1, interval: int = 30) -> bool:
    """
    Verifies a 6-digit TOTP code against the secret within a drift window.
    Window = 1 allows codes from [current - 30s, current, current + 30s] to account
    for minor time drift between the client phone and server clock.
    """
    if not secret or not code:
        return False

    clean_code = str(code).strip()
    if len(clean_code) != 6 or not clean_code.isdigit():
        return False

    try:
        clean_secret = secret.strip().replace(" ", "").upper()
        padded_secret = clean_secret + "=" * ((8 - len(clean_secret) % 8) % 8)
        key = base64.b32decode(padded_secret, casefold=True)
        current_counter = int(time.time() // interval)

        for delta in range(-window, window + 1):
            msg = struct.pack(">Q", current_counter + delta)
            digest = hmac.new(key, msg, hashlib.sha1).digest()
            offset = digest[-1] & 0x0F
            expected_code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
            if f"{expected_code:06d}" == clean_code:
                return True
        return False
    except Exception:
        return False
