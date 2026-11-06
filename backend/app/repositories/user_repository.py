import logging
import uuid
import time
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from azure.cosmos import exceptions as cosmos_exceptions
from app.core.cosmos import get_users_container
from app.core.cosmos_metrics import timed_query
from app.core.security import hash_password

logger = logging.getLogger(__name__)

# Fields that must never leave this module through the cached / shared user object.
_SECRET_FIELDS = ("hashed_password",)

# In-memory user cache with TTL for ultra-fast auth token verification (<1ms).
# It only ever holds *sanitised* documents (no password hash).
_USER_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
_USER_EMAIL_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
CACHE_TTL_SECONDS = 60.0
_MAX_CACHE_ENTRIES = 5000

# list_users() is a cross-partition query. Results are cached briefly so that a loop resolving several
# organizations does not repeat it.
_USERS_LIST_CACHE: Dict[tuple, Tuple[List[Dict[str, Any]], float]] = {}
USERS_LIST_TTL_SECONDS = 10.0

# Columns the application needs from a user. The password hash is deliberately not in this list.
_PUBLIC_COLUMNS = "c.id, c.username, c.email, c.role, c.organization_id, c.org_name, c.is_active, c.created_at, c.token_version"


def _sanitize(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in doc.items() if k not in _SECRET_FIELDS}


def _get_cached_user(user_id: str) -> Optional[Dict[str, Any]]:
    cached = _USER_CACHE.get(user_id)
    if cached:
        data, ts = cached
        if time.time() - ts < CACHE_TTL_SECONDS:
            return data
        _USER_CACHE.pop(user_id, None)
    return None


def _set_cached_user(user_id: str, data: Dict[str, Any]):
    if len(_USER_CACHE) >= _MAX_CACHE_ENTRIES:
        _USER_CACHE.clear()
        _USER_EMAIL_CACHE.clear()
    safe = _sanitize(data)
    now = time.time()
    _USER_CACHE[user_id] = (safe, now)
    if "email" in safe:
        _USER_EMAIL_CACHE[safe["email"].lower().strip()] = (safe, now)


def _invalidate_user_cache(user_id: Optional[str] = None, email: Optional[str] = None):
    _USERS_LIST_CACHE.clear()
    if user_id:
        _USER_CACHE.pop(user_id, None)
    if email:
        _USER_EMAIL_CACHE.pop(email.lower().strip(), None)


def _clear_all_user_caches():
    _USERS_LIST_CACHE.clear()
    _USER_CACHE.clear()
    _USER_EMAIL_CACHE.clear()


def _aggregate_organizations(users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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

        role = u.get("role")
        if role == "admin":
            org_entry["admin_count"] += 1
            org_entry["admins"].append({
                "id": u["id"],
                "username": u.get("username", "Admin"),
                "email": u["email"],
                "is_active": u.get("is_active", True)
            })
        elif role == "user":
            org_entry["user_count"] += 1
        elif role == "superadmin":
            org_entry["admin_count"] += 1
            org_entry["admins"].append({
                "id": u["id"],
                "username": u.get("username", "Superadmin"),
                "email": u["email"],
                "is_active": u.get("is_active", True)
            })

    return list(org_map.values())


class UserRepository:
    # ------------------------------------------------------------------ reads

    @staticmethod
    async def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        """User by email, without the password hash (safe to cache and to pass around)."""
        clean_email = email.lower().strip()
        cached = _USER_EMAIL_CACHE.get(clean_email)
        if cached:
            data, ts = cached
            if time.time() - ts < CACHE_TTL_SECONDS:
                return data
            _USER_EMAIL_CACHE.pop(clean_email, None)

        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            query = f"SELECT {_PUBLIC_COLUMNS} FROM c WHERE c.email = @email"
            params = [{"name": "@email", "value": clean_email}]
            try:
                # Scoped directly to the email partition (single-partition query)
                items = [_sanitize(i) for i in container.query_items(query=query, parameters=params, partition_key=clean_email)]
                if items:
                    _set_cached_user(items[0]["id"], items[0])
                    return items[0]
                return None
            except Exception as e:
                logger.error("get_by_email failed: %s", e)
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def get_auth_record(identifier: str) -> Optional[Dict[str, Any]]:
        """Full user document INCLUDING the password hash, for the login flow only. Never cached.

        `identifier` is an email address or a username."""
        clean = identifier.lower().strip()

        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            try:
                items = list(container.query_items(
                    query="SELECT * FROM c WHERE c.email = @email",
                    parameters=[{"name": "@email", "value": clean}],
                    partition_key=clean,
                ))
                if not items and "@" not in clean:
                    # Username login: one filtered query instead of listing every user and scanning in Python.
                    items = list(container.query_items(
                        query="SELECT TOP 1 * FROM c WHERE LOWER(c.username) = @username",
                        parameters=[{"name": "@username", "value": clean}],
                        enable_cross_partition_query=True,
                    ))
                return items[0] if items else None
            except Exception as e:
                logger.error("get_auth_record failed: %s", e)
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def get_by_id(user_id: str, email_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """User by id, without the password hash.

        The container is partitioned by email, so an id alone needs a cross-partition query. Callers that know the
        email (the signed access token carries it) pass it as `email_hint`, which turns the lookup into a ~1 RU point read.
        """
        cached = _get_cached_user(user_id)
        if cached:
            return cached

        def _sync_get():
            container = get_users_container()
            if not container:
                return None
            try:
                if email_hint:
                    try:
                        item = container.read_item(item=user_id, partition_key=email_hint.lower().strip())
                        _set_cached_user(user_id, item)
                        return _sanitize(item)
                    except cosmos_exceptions.CosmosResourceNotFoundError:
                        pass  # stale hint (email changed or user deleted): fall through to the authoritative query

                query = f"SELECT {_PUBLIC_COLUMNS} FROM c WHERE c.id = @user_id"
                params = [{"name": "@user_id", "value": user_id}]
                items = [_sanitize(i) for i in timed_query(container, "users.get_by_id(xpart)", query, params, enable_cross_partition_query=True)]
                if items:
                    _set_cached_user(user_id, items[0])
                    return items[0]
                return None
            except Exception as e:
                logger.error("get_by_id failed: %s", e)
                return None
        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def list_users(
        organization_id: Optional[str] = None,
        role: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        cache_key = (organization_id, role)
        cached = _USERS_LIST_CACHE.get(cache_key)
        if cached and time.time() - cached[1] < USERS_LIST_TTL_SECONDS:
            return cached[0]

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
            query = f"SELECT {_PUBLIC_COLUMNS} FROM c{where_clause}"

            try:
                items = [_sanitize(i) for i in container.query_items(query=query, parameters=params, enable_cross_partition_query=True)]
                _USERS_LIST_CACHE[cache_key] = (items, time.time())
                return items
            except Exception as e:
                logger.error("list_users failed: %s", e)
                return []
        return await asyncio.to_thread(_sync_list)

    @staticmethod
    async def list_organizations() -> List[Dict[str, Any]]:
        """Aggregates organization metrics across all users (platform-admin screens only)."""
        return _aggregate_organizations(await UserRepository.list_users())

    @staticmethod
    async def get_organization(organization_id: str) -> Optional[Dict[str, Any]]:
        """Summary for ONE organization. Reads only that organization's users, not the whole platform."""
        users = await UserRepository.list_users(organization_id=organization_id)
        for org in _aggregate_organizations(users):
            if org["organization_id"] == organization_id:
                return org
        return None

    # ----------------------------------------------------------------- writes

    @staticmethod
    async def create_user(
        username: str,
        email: str,
        password: str,
        role: str = "user",
        organization_id: Optional[str] = None,
        org_name: Optional[str] = None
    ) -> Dict[str, Any]:
        _USERS_LIST_CACHE.clear()
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
                "token_version": 0,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            container.create_item(body=user_doc)
            return _sanitize(user_doc)

        return await asyncio.to_thread(_sync_create)

    @staticmethod
    async def _patch(user: Dict[str, Any], operations: List[Dict[str, Any]]) -> bool:
        """Partial update of one user document. Unlike read-modify-upsert it cannot overwrite a concurrent change to
        another field, and it works on the sanitised copy (which has no password hash to accidentally drop)."""
        def _sync_patch():
            container = get_users_container()
            if not container:
                return False
            try:
                container.patch_item(item=user["id"], partition_key=user["email"].lower().strip(), patch_operations=operations)
                return True
            except Exception as e:
                logger.error("user patch failed: %s", e)
                return False

        ok = await asyncio.to_thread(_sync_patch)
        _invalidate_user_cache(user_id=user["id"], email=user.get("email"))
        return ok

    @staticmethod
    async def toggle_organization_status(organization_id: str, is_active: bool) -> int:
        """Enables or disables all user accounts belonging to an organization."""
        _USERS_LIST_CACHE.clear()

        def _sync_toggle():
            container = get_users_container()
            if not container:
                return 0

            items = list(container.query_items(
                query="SELECT c.id, c.email, c.role FROM c WHERE c.organization_id = @org_id",
                parameters=[{"name": "@org_id", "value": organization_id}],
                enable_cross_partition_query=True,
            ))

            now = datetime.now(timezone.utc).isoformat()
            count = 0
            for u in items:
                # Do not deactivate platform master superadmin
                if u.get("role") == "superadmin":
                    continue
                ops = [{"op": "set", "path": "/is_active", "value": is_active}, {"op": "set", "path": "/updated_at", "value": now}]
                if not is_active:
                    ops.append({"op": "incr", "path": "/token_version", "value": 1})  # revokes tokens already issued
                try:
                    container.patch_item(item=u["id"], partition_key=u["email"].lower().strip(), patch_operations=ops)
                    count += 1
                except Exception as e:
                    logger.error("toggle_organization_status item failed: %s", e)
            return count

        count = await asyncio.to_thread(_sync_toggle)
        _clear_all_user_caches()
        return count

    @staticmethod
    async def delete_organization(organization_id: str) -> int:
        """Completely removes all users belonging to an organization."""
        _USERS_LIST_CACHE.clear()
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
                    logger.error("delete_organization item failed: %s", e)
            return count

        count = await asyncio.to_thread(_sync_delete_org)
        _clear_all_user_caches()
        return count

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

        updated = dict(target_user)
        ops: List[Dict[str, Any]] = []

        def _set(field: str, value: Any):
            updated[field] = value
            ops.append({"op": "set", "path": f"/{field}", "value": value})

        if username is not None:
            _set("username", username.strip())
        if role is not None and role in ["superadmin", "admin", "user"]:
            _set("role", role)
        if organization_id is not None:
            _set("organization_id", organization_id)
        if org_name is not None:
            _set("org_name", org_name)
        if is_active is not None:
            _set("is_active", is_active)
            if is_active is False and target_user.get("is_active", True):
                ops.append({"op": "incr", "path": "/token_version", "value": 1})  # revokes tokens already issued
                updated["token_version"] = int(target_user.get("token_version", 0)) + 1

        if not ops:
            return updated

        ok = await UserRepository._patch(target_user, ops)
        return updated if ok else None

    @staticmethod
    async def update_password(user_id: str, new_password: str) -> bool:
        target_user = await UserRepository.get_by_id(user_id)
        if not target_user:
            return False

        hashed = await asyncio.to_thread(hash_password, new_password)
        # Bumping token_version signs the user out everywhere: a stolen token dies with the old password.
        return await UserRepository._patch(target_user, [
            {"op": "set", "path": "/hashed_password", "value": hashed},
            {"op": "incr", "path": "/token_version", "value": 1},
        ])

    @staticmethod
    async def upgrade_password_hash(user: Dict[str, Any], plain_password: str) -> bool:
        """Re-hashes a verified password with the current algorithm (used to retire legacy SHA-256 rows at login)."""
        hashed = await asyncio.to_thread(hash_password, plain_password)
        return await UserRepository._patch(user, [{"op": "set", "path": "/hashed_password", "value": hashed}])

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
                logger.error("delete_user failed: %s", e)
                return False
        ok = await asyncio.to_thread(_sync_delete)
        _invalidate_user_cache(user_id=user_id, email=email)
        return ok
