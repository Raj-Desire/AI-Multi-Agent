from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Dict, Any
from app.repositories.user_repository import UserRepository
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

@router.post("/login", response_model=TokenResponse)
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

    access_token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"]
    })

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            username=user.get("username", "User"),
            email=user["email"],
            role=user.get("role", "user")
        )
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        username=current_user.get("username", "User"),
        email=current_user["email"],
        role=current_user.get("role", "user")
    )
