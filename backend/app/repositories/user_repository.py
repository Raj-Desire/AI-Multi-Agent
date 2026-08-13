import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.core.cosmos import get_users_container
from app.core.security import hash_password

class UserRepository:
    @staticmethod
    async def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            query = "SELECT * FROM c WHERE c.email = @email"
            params = [{"name": "@email", "value": email.lower().strip()}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                return items[0] if items else None
            except Exception as e:
                print(f"[UserRepository Error] get_by_email: {e}")
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def get_by_id(user_id: str) -> Optional[Dict[str, Any]]:
        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            query = "SELECT * FROM c WHERE c.id = @user_id"
            params = [{"name": "@user_id", "value": user_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                return items[0] if items else None
            except Exception as e:
                print(f"[UserRepository Error] get_by_id: {e}")
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def create_user(username: str, email: str, password: str, role: str = "user") -> Dict[str, Any]:
        existing = await UserRepository.get_by_email(email)
        if existing:
            raise ValueError(f"User with email {email} already exists")

        def _sync_create():
            container = get_users_container()
            if not container:
                raise Exception("Users container unavailable")
            user_doc = {
                "id": f"usr_{uuid.uuid4().hex[:12]}",
                "username": username.strip(),
                "email": email.lower().strip(),
                "hashed_password": hash_password(password),
                "role": role if role in ["admin", "user"] else "user",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            container.create_item(body=user_doc)
            return user_doc

        return await asyncio.to_thread(_sync_create)

    @staticmethod
    async def list_users() -> List[Dict[str, Any]]:
        def _sync_list():
            container = get_users_container()
            if not container:
                return []
            query = "SELECT c.id, c.username, c.email, c.role, c.is_active, c.created_at FROM c"
            try:
                items = list(container.query_items(query=query, enable_cross_partition_query=True))
                return items
            except Exception as e:
                print(f"[UserRepository Error] list_users: {e}")
                return []
        return await asyncio.to_thread(_sync_list)

    @staticmethod
    async def update_password(user_id: str, new_password: str) -> bool:
        target_user = await UserRepository.get_by_id(user_id)
        if not target_user:
            return False

        def _sync_update():
            container = get_users_container()
            if not container:
                return False
            try:
                target_user["hashed_password"] = hash_password(new_password)
                container.upsert_item(body=target_user)
                return True
            except Exception as e:
                print(f"[UserRepository Error] update_password: {e}")
                return False

        return await asyncio.to_thread(_sync_update)

    @staticmethod
    async def delete_user(user_id: str, email: str) -> bool:
        def _sync_delete():
            container = get_users_container()
            if not container:
                return False
            try:
                container.delete_item(item=user_id, partition_key=email.lower().strip())
                return True
            except Exception as e:
                print(f"[UserRepository Error] delete_user: {e}")
                return False
        return await asyncio.to_thread(_sync_delete)
