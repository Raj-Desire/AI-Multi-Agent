from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, Field
from typing import List, Dict, Any, Optional
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
    organization_id: Optional[str] = None
    org_name: Optional[str] = None
    is_active: bool
    created_at: str

@router.post("/users", response_model=UserSummaryResponse, status_code=status.HTTP_201_CREATED)
async def create_user(req: CreateUserRequest, current_admin: Dict[str, Any] = Depends(require_admin)):
    if req.role.lower() in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Org Admins can only create standard 'user' client accounts for their organization."
        )

    # Scoped strictly to the admin's organization
    admin_org_id = current_admin.get("organization_id") or current_admin["id"]
    admin_org_name = current_admin.get("org_name") or "Organization"

    try:
        new_user = await UserRepository.create_user(
            username=req.username,
            email=req.email,
            password=req.password,
            role="user",
            organization_id=admin_org_id,
            org_name=admin_org_name
        )
        return UserSummaryResponse(
            id=new_user["id"],
            username=new_user["username"],
            email=new_user["email"],
            role=new_user["role"],
            organization_id=new_user.get("organization_id"),
            org_name=new_user.get("org_name"),
            is_active=new_user.get("is_active", True),
            created_at=new_user.get("created_at", "")
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create user: {e}")

@router.get("/users", response_model=List[UserSummaryResponse])
async def list_users(current_admin: Dict[str, Any] = Depends(require_admin)):
    # Org admins only see users belonging to their own organization
    # Superadmins can see all users in this endpoint as well
    if current_admin.get("role") == "superadmin":
        users = await UserRepository.list_users()
    else:
        admin_org_id = current_admin.get("organization_id") or current_admin["id"]
        users = await UserRepository.list_users(organization_id=admin_org_id)

    return [
        UserSummaryResponse(
            id=u["id"],
            username=u.get("username", "User"),
            email=u["email"],
            role=u.get("role", "user"),
            organization_id=u.get("organization_id"),
            org_name=u.get("org_name"),
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

    # Isolation check: Org admins can only reset passwords for users in their own org
    if current_admin.get("role") != "superadmin":
        admin_org_id = current_admin.get("organization_id") or current_admin["id"]
        target_org_id = target_user.get("organization_id") or target_user["id"]
        if admin_org_id != target_org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage users from another organization."
            )

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
            detail="Admin cannot delete their own active account."
        )

    # Isolation check: Org admins can only delete users in their own org
    if current_admin.get("role") != "superadmin":
        admin_org_id = current_admin.get("organization_id") or current_admin["id"]
        target_org_id = target_user.get("organization_id") or target_user["id"]
        if admin_org_id != target_org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete users from another organization."
            )
        if target_user.get("role") in ["admin", "superadmin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Org Admins cannot delete Admin accounts. Contact Super Admin."
            )

    success = await UserRepository.delete_user(target_user["id"], target_user["email"])
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete user.")

    return {"message": f"User {target_user['email']} deleted successfully."}

