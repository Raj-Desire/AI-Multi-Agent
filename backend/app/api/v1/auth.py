from datetime import timedelta
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from app.repositories.user_repository import UserRepository
from app.core.security import verify_password, create_access_token, decode_access_token
from app.core.dependencies import get_current_user
from app.core.totp import generate_totp_secret, get_totp_uri, verify_totp_code

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    organization_id: Optional[str] = None
    org_name: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LoginResponse(BaseModel):
    require_2fa: bool = False
    is_setup: Optional[bool] = None
    temp_token: Optional[str] = None
    secret_key: Optional[str] = None
    otpauth_url: Optional[str] = None
    email: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    user: Optional[UserResponse] = None

class Verify2FARequest(BaseModel):
    temp_token: str
    code: str

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    email_or_user = req.email.strip()
    user = await UserRepository.get_by_email(email_or_user)
    
    # If not found by email, try searching by username in user list
    if not user:
        users = await UserRepository.list_users()
        for u in users:
            if u.get("username", "").lower() == email_or_user.lower():
                user = await UserRepository.get_by_id(u["id"])
                break

    if not user or not verify_password(req.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/username or password."
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated."
        )

    # -------------------------------------------------------------
    # SuperAdmin Mandatory TOTP 2FA Verification (Microsoft / Google Authenticator)
    # -------------------------------------------------------------
    if user.get("role") == "superadmin":
        is_totp_enabled = bool(user.get("totp_enabled") and user.get("totp_secret"))

        if not is_totp_enabled:
            # First-time SuperAdmin setup: generate base32 secret and otpauth URI
            secret = generate_totp_secret()
            await UserRepository.save_totp_temp_secret(user["id"], secret)
            
            otpauth_url = get_totp_uri(
                secret=secret,
                email=user["email"],
                issuer="AI Voice Platform"
            )

            # Issue 10-minute temporary token for completing 2FA activation
            temp_token = create_access_token(
                data={
                    "sub": user["id"],
                    "email": user["email"],
                    "purpose": "2fa_setup"
                },
                expires_delta=timedelta(minutes=10)
            )

            return LoginResponse(
                require_2fa=True,
                is_setup=True,
                temp_token=temp_token,
                secret_key=secret,
                otpauth_url=otpauth_url,
                email=user["email"]
            )
        else:
            # Returning SuperAdmin: requires 6-digit code from Microsoft Authenticator
            temp_token = create_access_token(
                data={
                    "sub": user["id"],
                    "email": user["email"],
                    "purpose": "2fa_login"
                },
                expires_delta=timedelta(minutes=5)
            )

            return LoginResponse(
                require_2fa=True,
                is_setup=False,
                temp_token=temp_token,
                email=user["email"]
            )

    # Standard non-superadmin direct login
    access_token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "role": user.get("role", "user"),
        "organization_id": user.get("organization_id", user["id"]),
        "org_name": user.get("org_name")
    })

    return LoginResponse(
        require_2fa=False,
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            username=user.get("username", "User"),
            email=user["email"],
            role=user.get("role", "user"),
            organization_id=user.get("organization_id", user["id"]),
            org_name=user.get("org_name")
        )
    )


@router.post("/2fa/verify", response_model=TokenResponse)
async def verify_2fa(req: Verify2FARequest):
    """
    Verifies the 6-digit code from Microsoft Authenticator.
    For initial setup, it confirms the secret and activates 2FA.
    For returning logins, it authenticates the session and returns JWT.
    """
    payload = decode_access_token(req.temp_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid 2FA token. Please sign in again."
        )

    purpose = payload.get("purpose")
    user_id = payload.get("sub")
    if purpose not in ["2fa_setup", "2fa_login"] or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 2FA authentication token."
        )

    user = await UserRepository.get_by_id(user_id)
    if not user or not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or deactivated."
        )

    code = req.code.strip()

    if purpose == "2fa_setup":
        temp_secret = user.get("totp_temp_secret")
        if not temp_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA setup session expired. Please sign in again to generate a new QR code."
            )

        if not verify_totp_code(temp_secret, code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid 6-digit code. Please verify the code in Microsoft Authenticator and try again."
            )

        # Activate TOTP permanently
        await UserRepository.activate_totp(user["id"], temp_secret)
    else:  # 2fa_login
        secret = user.get("totp_secret")
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA is not properly configured on this account. Please contact support."
            )

        if not verify_totp_code(secret, code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid 6-digit code. Please verify the code in Microsoft Authenticator and try again."
            )

    # Issue full authenticated session token
    access_token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "role": user.get("role", "user"),
        "organization_id": user.get("organization_id", user["id"]),
        "org_name": user.get("org_name")
    })

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            username=user.get("username", "User"),
            email=user["email"],
            role=user.get("role", "user"),
            organization_id=user.get("organization_id", user["id"]),
            org_name=user.get("org_name")
        )
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        username=current_user.get("username", "User"),
        email=current_user["email"],
        role=current_user.get("role", "user"),
        organization_id=current_user.get("organization_id", current_user["id"]),
        org_name=current_user.get("org_name")
    )
