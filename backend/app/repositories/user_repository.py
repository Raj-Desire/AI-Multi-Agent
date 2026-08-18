import uuid
import time
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from app.core.cosmos import get_users_container
from app.core.security import hash_password

# In-memory user cache with TTL for ultra-fast auth token verification (<1ms)
_USER_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
_USER_EMAIL_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
CACHE_TTL_SECONDS = 60.0

def _get_cached_user(user_id: str) -> Optional[Dict[str, Any]]:
    cached = _USER_CACHE.get(user_id)
    if cached:
        data, ts = cached
        if time.time() - ts < CACHE_TTL_SECONDS:
            return data
        del _USER_CACHE[user_id]
    return None

def _set_cached_user(user_id: str, data: Dict[str, Any]):
    now = time.time()
    _USER_CACHE[user_id] = (data, now)
    if "email" in data:
        _USER_EMAIL_CACHE[data["email"].lower().strip()] = (data, now)

def _invalidate_user_cache(user_id: Optional[str] = None, email: Optional[str] = None):
    if user_id and user_id in _USER_CACHE:
        del _USER_CACHE[user_id]
    if email and email.lower().strip() in _USER_EMAIL_CACHE:
        del _USER_EMAIL_CACHE[email.lower().strip()]

class UserRepository:
    @staticmethod
    async def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        clean_email = email.lower().strip()
        cached = _USER_EMAIL_CACHE.get(clean_email)
        if cached:
            data, ts = cached
            if time.time() - ts < CACHE_TTL_SECONDS:
                return data
            del _USER_EMAIL_CACHE[clean_email]

        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            query = "SELECT * FROM c WHERE c.email = @email"
            params = [{"name": "@email", "value": clean_email}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    _set_cached_user(items[0]["id"], items[0])
                    return items[0]
                return None
            except Exception as e:
                print(f"[UserRepository Error] get_by_email: {e}")
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def get_by_id(user_id: str) -> Optional[Dict[str, Any]]:
        cached = _get_cached_user(user_id)
        if cached:
            return cached

        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            query = "SELECT * FROM c WHERE c.id = @user_id"
            params = [{"name": "@user_id", "value": user_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    _set_cached_user(user_id, items[0])
                    return items[0]
                return None
            except Exception as e:
                print(f"[UserRepository Error] get_by_id: {e}")
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def create_user(
        username: str,
        email: str,
        password: str,
        role: str = "user",
        organization_id: Optional[str] = None,
        org_name: Optional[str] = None
    ) -> Dict[str, Any]:
        existing = await UserRepository.get_by_email(email)
        if existing:
            raise ValueError(f"User with email {email} already exists")

        valid_role = role if role in ["superadmin", "admin", "user"] else "user"
        effective_org_id = organization_id or f"org_{uuid.uuid4().hex[:8]}"
        effective_org_name = org_name or ("Platform Admin" if valid_role == "superadmin" else "Default Organization")

        def _sync_create():
            container = get_users_container()
            if not container:
                raise Exception("Users container unavailable")
            user_doc = {
                "id": f"usr_{uuid.uuid4().hex[:12]}",
                "username": username.strip(),
                "email": email.lower().strip(),
                "hashed_password": hash_password(password),
                "role": valid_role,
                "organization_id": effective_org_id,
                "org_name": effective_org_name,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            container.create_item(body=user_doc)
            return user_doc

        return await asyncio.to_thread(_sync_create)

    @staticmethod
    async def list_users(
        organization_id: Optional[str] = None,
        role: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        def _sync_list():
            container = get_users_container()
            if not container:
                return []
            
            conditions = []
            params = []

            if organization_id:
                conditions.append("c.organization_id = @org_id")
                params.append({"name": "@org_id", "value": organization_id})

            if role:
                conditions.append("c.role = @role")
                params.append({"name": "@role", "value": role})

            where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
            query = f"SELECT c.id, c.username, c.email, c.role, c.organization_id, c.org_name, c.is_active, c.created_at FROM c{where_clause}"

            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                return items
            except Exception as e:
                print(f"[UserRepository Error] list_users: {e}")
                return []
        return await asyncio.to_thread(_sync_list)

    @staticmethod
    async def list_organizations() -> List[Dict[str, Any]]:
        """Aggregates organization metrics across all users."""
        users = await UserRepository.list_users()
        org_map: Dict[str, Dict[str, Any]] = {}

        for u in users:
            org_id = u.get("organization_id") or "org_default"
            org_name = u.get("org_name") or "Default Organization"

            if org_id not in org_map:
                org_map[org_id] = {
                    "organization_id": org_id,
                    "org_name": org_name,
                    "admin_count": 0,
                    "user_count": 0,
                    "total_members": 0,
                    "is_active": True,
                    "admins": [],
                    "created_at": u.get("created_at", "")
                }

            org_entry = org_map[org_id]
            org_entry["total_members"] += 1

            # If any user is active in org, or if all are disabled
            if u.get("is_active") is False and org_entry["total_members"] == 1:
                org_entry["is_active"] = False
            elif u.get("is_active") is True:
                org_entry["is_active"] = True

            if u.get("role") == "admin":
                org_entry["admin_count"] += 1
                org_entry["admins"].append({
                    "id": u["id"],
                    "username": u.get("username", "Admin"),
                    "email": u["email"],
                    "is_active": u.get("is_active", True)
                })
            elif u.get("role") == "user":
                org_entry["user_count"] += 1
            elif u.get("role") == "superadmin":
                org_entry["admin_count"] += 1
                org_entry["admins"].append({
                    "id": u["id"],
                    "username": u.get("username", "Superadmin"),
                    "email": u["email"],
                    "is_active": u.get("is_active", True)
                })

        return list(org_map.values())

    @staticmethod
    async def toggle_organization_status(organization_id: str, is_active: bool) -> int:
        """Enables or disables all user accounts belonging to an organization."""
        def _sync_toggle():
            container = get_users_container()
            if not container:
                return 0
            
            query = "SELECT * FROM c WHERE c.organization_id = @org_id"
            params = [{"name": "@org_id", "value": organization_id}]
            items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
            
            count = 0
            for u in items:
                # Do not deactivate platform master superadmin
                if u.get("role") == "superadmin":
                    continue
                u["is_active"] = is_active
                try:
                    container.upsert_item(body=u)
                    count += 1
                except Exception as e:
                    print(f"[UserRepository Error] toggle_organization_status item: {e}")
            return count

        return await asyncio.to_thread(_sync_toggle)


    @staticmethod
    async def delete_organization(organization_id: str) -> int:
        """Completely removes all users belonging to an organization."""
        org_users = await UserRepository.list_users(organization_id=organization_id)
        if not org_users:
            return 0

        def _sync_delete_org():
            container = get_users_container()
            if not container:
                return 0
            count = 0
            for u in org_users:
                # Safety: Never delete superadmin accounts
                if u.get("role") == "superadmin":
                    continue
                try:
                    container.delete_item(item=u["id"], partition_key=u["email"].lower().strip())
                    count += 1
                except Exception as e:
                    print(f"[UserRepository Error] delete_organization item: {e}")
            return count

        return await asyncio.to_thread(_sync_delete_org)

    @staticmethod
    async def update_user(
        user_id: str,
        username: Optional[str] = None,
        role: Optional[str] = None,
        organization_id: Optional[str] = None,
        org_name: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Optional[Dict[str, Any]]:
        target_user = await UserRepository.get_by_id(user_id)
        if not target_user:
            return None

        if username is not None:
            target_user["username"] = username.strip()
        if role is not None and role in ["superadmin", "admin", "user"]:
            target_user["role"] = role
        if organization_id is not None:
            target_user["organization_id"] = organization_id
        if org_name is not None:
            target_user["org_name"] = org_name
        if is_active is not None:
            target_user["is_active"] = is_active

        def _sync_update():
            container = get_users_container()
            if not container:
                return None
            try:
                container.upsert_item(body=target_user)
                _invalidate_user_cache(user_id=user_id, email=target_user.get("email"))
                return target_user
            except Exception as e:
                print(f"[UserRepository Error] update_user: {e}")
                return None

        return await asyncio.to_thread(_sync_update)

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
                _invalidate_user_cache(user_id=user_id, email=target_user.get("email"))
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
                _invalidate_user_cache(user_id=user_id, email=email)
                return True
            except Exception as e:
                print(f"[UserRepository Error] delete_user: {e}")
                return False
        return await asyncio.to_thread(_sync_delete)


