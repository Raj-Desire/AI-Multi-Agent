import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from app.core.security import hash_password

# Read configuration from environment variables
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT", "")
COSMOS_KEY = os.getenv("COSMOS_KEY", "")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "DesireAIDB")
COSMOS_CONTAINER_USERS = os.getenv("COSMOS_CONTAINER_USERS", "users")
COSMOS_CONTAINER_TWILIO = os.getenv("COSMOS_CONTAINER_TWILIO", "twilio_configs")
COSMOS_CONTAINER_CALLS = os.getenv("COSMOS_CONTAINER_CALLS", "calls")
COSMOS_CONTAINER_THEMES = os.getenv("COSMOS_CONTAINER_THEMES", "theme_configs")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@desireai.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

_client: Optional[CosmosClient] = None
_database = None
_users_container = None
_twilio_container = None
_calls_container = None
_themes_container = None

def get_cosmos_client() -> Optional[CosmosClient]:
    global _client
    if _client is None:
        if not COSMOS_ENDPOINT or not COSMOS_KEY:
            print("[CosmosDB Warning] COSMOS_ENDPOINT or COSMOS_KEY is not set.")
            return None
        try:
            _client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
        except Exception as e:
            print(f"[CosmosDB Error] Failed to create CosmosClient: {e}")
            return None
    return _client

def get_users_container():
    global _database, _users_container
    if _users_container is not None:
        return _users_container
    
    client = get_cosmos_client()
    if not client:
        return None

    try:
        db = client.create_database_if_not_exists(id=COSMOS_DATABASE)
        _database = db
        container = db.create_container_if_not_exists(
            id=COSMOS_CONTAINER_USERS,
            partition_key=PartitionKey(path="/email")
        )
        _users_container = container
        return _users_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get/create users container: {e}")
        return None

def get_twilio_container():
    global _database, _twilio_container
    if _twilio_container is not None:
        return _twilio_container

    client = get_cosmos_client()
    if not client:
        return None

    try:
        db = client.create_database_if_not_exists(id=COSMOS_DATABASE)
        _database = db
        container = db.create_container_if_not_exists(
            id=COSMOS_CONTAINER_TWILIO,
            partition_key=PartitionKey(path="/user_id")
        )
        _twilio_container = container
        return _twilio_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get/create twilio container: {e}")
        return None

def get_calls_container():
    global _database, _calls_container
    if _calls_container is not None:
        return _calls_container

    client = get_cosmos_client()
    if not client:
        return None

    try:
        db = client.create_database_if_not_exists(id=COSMOS_DATABASE)
        _database = db
        container = db.create_container_if_not_exists(
            id=COSMOS_CONTAINER_CALLS,
            partition_key=PartitionKey(path="/user_id")
        )
        _calls_container = container
        return _calls_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get/create calls container: {e}")
        return None

def get_themes_container():
    global _database, _themes_container
    if _themes_container is not None:
        return _themes_container

    client = get_cosmos_client()
    if not client:
        return None

    try:
        db = client.create_database_if_not_exists(id=COSMOS_DATABASE)
        _database = db
        container = db.create_container_if_not_exists(
            id=COSMOS_CONTAINER_THEMES,
            partition_key=PartitionKey(path="/organization_id")
        )
        _themes_container = container
        return _themes_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get/create themes container: {e}")
        return None

def init_cosmos_db():
    """Initializes database, containers, and seeds/syncs initial Admin user."""
    container = get_users_container()
    get_twilio_container()
    get_calls_container()
    get_themes_container()

    if not container:
        print("[CosmosDB Warning] Users container unavailable. Skipping initial admin seed.")
        return

    query = "SELECT * FROM c WHERE c.email = @email"
    params = [{"name": "@email", "value": ADMIN_EMAIL.lower()}]
    try:
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        desired_hash = hash_password(ADMIN_PASSWORD)
        if not items:
            admin_user = {
                "id": f"usr_{uuid.uuid4().hex[:12]}",
                "username": "Super Admin",
                "email": ADMIN_EMAIL.lower(),
                "hashed_password": desired_hash,
                "role": "superadmin",
                "organization_id": "org_platform_root",
                "org_name": "Platform Master",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            container.create_item(body=admin_user)
            print(f"[CosmosDB] Superadmin user successfully seeded: {ADMIN_EMAIL}")
        else:
            admin_doc = items[0]
            # Ensure superadmin role and password hash
            admin_doc["hashed_password"] = desired_hash
            admin_doc["role"] = "superadmin"
            if not admin_doc.get("organization_id"):
                admin_doc["organization_id"] = "org_platform_root"
            if not admin_doc.get("org_name"):
                admin_doc["org_name"] = "Platform Master"
            container.upsert_item(body=admin_doc)
            print(f"[CosmosDB] Superadmin user synced: {ADMIN_EMAIL}")
    except Exception as e:
        print(f"[CosmosDB Error] Error during admin user seed check: {e}")

