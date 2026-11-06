import asyncio
import logging
from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel, EmailStr
from typing import Dict, Any, Optional
from app.repositories.user_repository import UserRepository
from app.core.security import verify_password_constant_time, is_legacy_hash, create_access_token
from app.core.rate_limit import login_limiter, login_keys
from app.repositories.activity_log_repository import get_client_ip
from app.core.dependencies import get_current_user

logger = logging.getLogger(__name__)
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

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request):
    identifier = req.email.strip()
    keys = login_keys(get_client_ip(request), identifier)

    wait = max(login_limiter.retry_after(k) for k in keys)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Please try again later.",
            headers={"Retry-After": str(wait)},
        )

    # One lookup (email partition, or a single filtered username query). The record includes the password hash,
    # which is why it is used only here and never cached or returned.
    user = await UserRepository.get_auth_record(identifier)

    # Same work whether or not the account exists, so response time does not reveal valid accounts.
    password_ok = await asyncio.to_thread(
        verify_password_constant_time, req.password, user.get("hashed_password") if user else None
    )
    if not user or not password_ok:
        for k in keys:
            login_limiter.record_failure(k)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/username or password."
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated."
        )

    for k in keys:
        login_limiter.reset(k)

    if is_legacy_hash(user.get("hashed_password", "")):
        # Retire old SHA-256 hashes: the password was just proven correct, so store it with bcrypt.
        try:
            await UserRepository.upgrade_password_hash(user, req.password)
        except Exception as e:
            logger.warning("Password hash upgrade skipped: %s", e)

    access_token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "role": user.get("role", "user"),
        "organization_id": user.get("organization_id", user["id"]),
        "org_name": user.get("org_name"),
        "tv": int(user.get("token_version", 0)),
    })

    from app.services.activity_log_service import log_login
    await log_login(request, user)

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

