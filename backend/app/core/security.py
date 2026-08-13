import base64
import os
import hashlib
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from cryptography.fernet import Fernet
import jwt

# JWT configuration
JWT_SECRET = os.getenv("JWT_SECRET", "d7e4a92c81f34b9e05267104b2a8f89c67d13b45e90a218f34c219087e5b61cd")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

def _get_fernet_key() -> str:
    key_str = os.getenv("ENCRYPTION_KEY")
    if key_str:
        return key_str
    # Derive a valid 32-byte url-safe base64 key deterministically from JWT_SECRET
    raw_key = hashlib.sha256(JWT_SECRET.encode()).digest()
    return base64.urlsafe_b64encode(raw_key).decode()

def get_fernet() -> Fernet:
    return Fernet(_get_fernet_key())

def encrypt_token(plain_text: str) -> str:
    if not plain_text:
        return ""
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()

def decrypt_token(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        f = get_fernet()
        return f.decrypt(cipher_text.encode()).decode()
    except Exception:
        # Fallback if raw unencrypted string
        return cipher_text

def mask_auth_token(token: str) -> str:
    if not token or len(token) < 4:
        return "************"
    return "*" * (len(token) - 4) + token[-4:]

def hash_password(password: str) -> str:
    try:
        pwd_bytes = password.encode('utf-8')[:72]
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')
    except Exception as e:
        print(f"[Security Error] Direct bcrypt hash failed: {e}")
        salt = JWT_SECRET[:16]
        return hashlib.sha256((password + salt).encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
            pwd_bytes = plain_password.encode('utf-8')[:72]
            return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))
        # Fallback SHA256 check
        salt = JWT_SECRET[:16]
        return hashlib.sha256((plain_password + salt).encode()).hexdigest() == hashed_password
    except Exception as e:
        print(f"[Security Error] verify_password error: {e}")
        return False

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None
