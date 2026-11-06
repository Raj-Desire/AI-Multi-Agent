import base64
import hashlib
import hmac
import logging
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken, MultiFernet

logger = logging.getLogger(__name__)

# A value that used to be the built-in fallback in this file. It is public in the repository history,
# so it must be rotated.
_LEAKED_DEFAULT_SECRETS = {"d7e4a92c81f34b9e05267104b2a8f89c67d13b45e90a218f34c219087e5b61cd"}

_DEV_ENVIRONMENTS = {"dev", "development", "local", "test", "testing"}


def _is_dev_environment() -> bool:
    """Ephemeral secrets are only tolerated on a developer machine or under pytest."""
    app_env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    return app_env in _DEV_ENVIRONMENTS or "pytest" in sys.modules


def _resolve_jwt_secret() -> str:
    secret = (os.getenv("JWT_SECRET") or "").strip()
    strict = (os.getenv("STRICT_SECRETS") or "").strip().lower() in ("1", "true", "yes")

    if secret and secret not in _LEAKED_DEFAULT_SECRETS:
        return secret

    if not secret and _is_dev_environment():
        logger.warning(
            "JWT_SECRET is missing; using a random per-process secret. "
            "Sessions will be invalidated on every restart. Set JWT_SECRET for a stable value."
        )
        return secrets.token_hex(32)

    # Here the secret is either missing in a deployed environment or is the publicly known legacy value. Older
    # deployments run on that value and their stored credentials are encrypted with a key derived from it, so
    # refusing to boot by default would be an outage. It is allowed with a loud warning until the rotation steps in
    # docs/DATABASE_HARDENING_REPORT.md are done; STRICT_SECRETS=true then turns it into a hard startup error.
    if strict:
        raise RuntimeError(
            "JWT_SECRET is missing or a publicly known value. Set a unique random secret "
            "(python -c \"import secrets; print(secrets.token_hex(32))\") and rotate per docs/DATABASE_HARDENING_REPORT.md."
        )
    logger.critical("JWT_SECRET is missing or a publicly known value. Rotate it (see docs/DATABASE_HARDENING_REPORT.md).")
    return secret or next(iter(_LEAKED_DEFAULT_SECRETS))


# JWT configuration
JWT_SECRET = _resolve_jwt_secret()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = float(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))


# ---------------------------------------------------------------------------
# Field-level encryption (third-party credentials stored in the database)
# ---------------------------------------------------------------------------

_FERNET_PREFIX = "gAAAA"  # every Fernet token starts with the version byte + timestamp, base64-encoded


def _derived_key_from_jwt_secret() -> bytes:
    raw_key = hashlib.sha256(JWT_SECRET.encode()).digest()
    return base64.urlsafe_b64encode(raw_key)


def _build_cipher() -> MultiFernet:
    """Encrypts with ENCRYPTION_KEY when set, and can still read data written with the JWT-derived key.

    Older deployments never set ENCRYPTION_KEY, so their stored credentials were encrypted with a key derived
    from JWT_SECRET. Keeping that key as a secondary lets those rows keep decrypting while new writes use the
    dedicated key, so ENCRYPTION_KEY can be introduced without a flag-day migration.
    """
    keys = []
    configured = (os.getenv("ENCRYPTION_KEY") or "").strip()
    if configured:
        keys.append(Fernet(configured.encode()))
    else:
        logger.warning(
            "ENCRYPTION_KEY is not set; credentials are encrypted with a key derived from JWT_SECRET. "
            "Set a dedicated ENCRYPTION_KEY (Fernet.generate_key()) so the two secrets can be rotated independently."
        )
    keys.append(Fernet(_derived_key_from_jwt_secret()))
    return MultiFernet(keys)


_cipher: Optional[MultiFernet] = None


def get_fernet() -> MultiFernet:
    global _cipher
    if _cipher is None:
        _cipher = _build_cipher()
    return _cipher


def encrypt_token(plain_text: str) -> str:
    if not plain_text:
        return ""
    return get_fernet().encrypt(plain_text.encode()).decode()


def decrypt_token(cipher_text: str) -> str:
    """Returns the plaintext of a stored credential.

    A value that is not a Fernet token at all is a legacy un-encrypted row and is returned unchanged.
    A value that *is* a Fernet token but cannot be decrypted means the key is wrong; that is raised, not
    hidden, because passing ciphertext on as if it were the credential only fails later and confusingly.
    """
    if not cipher_text:
        return ""
    if not cipher_text.startswith(_FERNET_PREFIX):
        return cipher_text
    try:
        return get_fernet().decrypt(cipher_text.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored credential could not be decrypted with the configured encryption key.") from exc


def mask_auth_token(token: str) -> str:
    if not token or len(token) < 4:
        return "************"
    return "*" * (len(token) - 4) + token[-4:]


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")
_BCRYPT_MAX_BYTES = 72  # bcrypt ignores everything past 72 bytes; made explicit so hash and verify agree


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def _legacy_sha256(plain_password: str) -> str:
    salt = JWT_SECRET[:16]
    return hashlib.sha256((plain_password + salt).encode()).hexdigest()


def is_legacy_hash(hashed_password: str) -> bool:
    return bool(hashed_password) and not hashed_password.startswith(_BCRYPT_PREFIXES)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Checks a password. Legacy SHA-256 rows are still accepted so users are not locked out,
    and the caller is expected to upgrade them with `hash_password` after a successful login."""
    if not hashed_password:
        return False
    try:
        if hashed_password.startswith(_BCRYPT_PREFIXES):
            pwd_bytes = plain_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
            return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
        return hmac.compare_digest(_legacy_sha256(plain_password), hashed_password)
    except Exception as e:
        logger.error("verify_password error: %s", e)
        return False


# Verified against when the account does not exist, so a missing user and a wrong password take the same time.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_password_constant_time(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not hashed_password:
        verify_password(plain_password, _DUMMY_HASH)
        return False
    return verify_password(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# Access tokens
# ---------------------------------------------------------------------------

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    lifetime = expires_delta if expires_delta else timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": datetime.now(timezone.utc) + lifetime})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"require": ["exp"]})
    except Exception:
        return None
