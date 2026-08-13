from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, Field
from typing import List, Dict, Any
from app.repositories.user_repository import UserRepository
from app.core.dependencies import require_admin

router = APIRouter(prefix="/admin", tags=["Admin Management"])

class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = Field("user", description="Must be 'user'")

class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, description="New password for the user account")

class UserSummaryResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: str

@router.post("/users", response_model=UserSummaryResponse, status_code=status.HTTP_201_CREATED)
async def create_user(req: CreateUserRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    if req.role.lower() == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Creation of new Admin accounts is disabled. Only standard client user accounts can be created."
        )

    try:
        new_user = await UserRepository.create_user(
            username=req.username,
            email=req.email,
            password=req.password,
            role="user"  # Strictly enforce 'user' role
        )
        return UserSummaryResponse(
            id=new_user["id"],
            username=new_user["username"],
            email=new_user["email"],
            role=new_user["role"],
            is_active=new_user.get("is_active", True),
            created_at=new_user.get("created_at", "")
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create user: {e}")

@router.get("/users", response_model=List[UserSummaryResponse])
async def list_users(current_admin: Dict[str, Any] = Depends(require_admin)):
    users = await UserRepository.list_users()
    return [
        UserSummaryResponse(
            id=u["id"],
            username=u.get("username", "User"),
            email=u["email"],
            role=u.get("role", "user"),
            is_active=u.get("is_active", True),
            created_at=u.get("created_at", "")
        ) for u in users
    ]

@router.put("/users/{user_id}/password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: str,
    req: ResetPasswordRequest,
    current_admin: Dict[str, Any] = Depends(require_admin)
):
    target_user = await UserRepository.get_by_id(user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    success = await UserRepository.update_password(user_id, req.new_password)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update password.")

    return {"message": f"Password for user '{target_user['email']}' has been updated successfully."}

@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(user_id: str, current_admin: Dict[str, Any] = Depends(require_admin)):
    target_user = await UserRepository.get_by_id(user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target_user["id"] == current_admin["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot delete their own active account. At least one Admin must always exist."
        )

    # Check if target is an admin and verify remaining admin count
    if target_user.get("role") == "admin":
        all_users = await UserRepository.list_users()
        admin_count = sum(1 for u in all_users if u.get("role") == "admin")
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete this admin account. At least one Admin must always exist."
            )

    success = await UserRepository.delete_user(target_user["id"], target_user["email"])
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete user.")

    return {"message": f"User {target_user['email']} deleted successfully."}
