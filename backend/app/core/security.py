import base64
import os
from cryptography.fernet import Fernet

# 32 raw bytes base64 encoded
_DEFAULT_KEY = Fernet.generate_key().decode()

def get_fernet() -> Fernet:
    key_str = os.getenv("ENCRYPTION_KEY")
    if not key_str:
        key = _DEFAULT_KEY
    else:
        key = key_str
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt_token(plain_text: str) -> str:
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()

def decrypt_token(cipher_text: str) -> str:
    f = get_fernet()
    return f.decrypt(cipher_text.encode()).decode()

def mask_auth_token(token: str) -> str:
    if not token or len(token) < 4:
        return "************"
    return "*" * (len(token) - 4) + token[-4:]
