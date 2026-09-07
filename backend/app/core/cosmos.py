import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

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
COSMOS_CONTAINER_AGENTS = os.getenv("COSMOS_CONTAINER_AGENTS", "agents")
COSMOS_CONTAINER_PROFILES = os.getenv("COSMOS_CONTAINER_PROFILES", "business_profiles")
COSMOS_CONTAINER_PROSPECTS = os.getenv("COSMOS_CONTAINER_PROSPECTS", "prospects")
COSMOS_CONTAINER_CAMPAIGNS = os.getenv("COSMOS_CONTAINER_CAMPAIGNS", "campaigns")
COSMOS_CONTAINER_CAMPAIGN_MEMBERS = os.getenv("COSMOS_CONTAINER_CAMPAIGN_MEMBERS", "campaign_members")
COSMOS_CONTAINER_CAMPAIGN_EVENTS = os.getenv("COSMOS_CONTAINER_CAMPAIGN_EVENTS", "campaign_events")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@desireai.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

_client: Optional[CosmosClient] = None
_database = None
_users_container = None
_twilio_container = None
_calls_container = None
_themes_container = None
_agents_container = None
_profiles_container = None
_prospects_container = None
_campaigns_container = None
_campaign_members_container = None
_campaign_events_container = None

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

def get_database():
    global _database
    if _database is not None:
        return _database
    client = get_cosmos_client()
    if not client:
        return None
    try:
        _database = client.get_database_client(COSMOS_DATABASE)
        return _database
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get database client: {e}")
        return None

def get_users_container():
    global _users_container
    if _users_container is not None:
        return _users_container
    db = get_database()
    if not db:
        return None
    try:
        _users_container = db.get_container_client(COSMOS_CONTAINER_USERS)
        return _users_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get users container: {e}")
        return None

def get_twilio_container():
    global _twilio_container
    if _twilio_container is not None:
        return _twilio_container
    db = get_database()
    if not db:
        return None
    try:
        _twilio_container = db.get_container_client(COSMOS_CONTAINER_TWILIO)
        return _twilio_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get twilio container: {e}")
        return None

def get_calls_container():
    global _calls_container
    if _calls_container is not None:
        return _calls_container
    db = get_database()
    if not db:
        return None
    try:
        _calls_container = db.get_container_client(COSMOS_CONTAINER_CALLS)
        return _calls_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get calls container: {e}")
        return None

def get_themes_container():
    global _themes_container
    if _themes_container is not None:
        return _themes_container
    db = get_database()
    if not db:
        return None
    try:
        _themes_container = db.get_container_client(COSMOS_CONTAINER_THEMES)
        return _themes_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get themes container: {e}")
        return None

def get_agents_container():
    global _agents_container
    if _agents_container is not None:
        return _agents_container
    db = get_database()
    if not db:
        return None
    try:
        _agents_container = db.get_container_client(COSMOS_CONTAINER_AGENTS)
        return _agents_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get agents container: {e}")
        return None

def get_business_profiles_container():
    global _profiles_container
    if _profiles_container is not None:
        return _profiles_container
    db = get_database()
    if not db:
        return None
    try:
        _profiles_container = db.get_container_client(COSMOS_CONTAINER_PROFILES)
        return _profiles_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get business_profiles container: {e}")
        return None

def get_prospects_container():
    global _prospects_container
    if _prospects_container is not None:
        return _prospects_container
    db = get_database()
    if not db:
        return None
    try:
        _prospects_container = db.get_container_client(COSMOS_CONTAINER_PROSPECTS)
        return _prospects_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get prospects container: {e}")
        return None

def get_campaigns_container():
    global _campaigns_container
    if _campaigns_container is not None:
        return _campaigns_container
    db = get_database()
    if not db:
        return None
    try:
        _campaigns_container = db.get_container_client(COSMOS_CONTAINER_CAMPAIGNS)
        return _campaigns_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get campaigns container: {e}")
        return None

def get_campaign_members_container():
    global _campaign_members_container
    if _campaign_members_container is not None:
        return _campaign_members_container
    db = get_database()
    if not db:
        return None
    try:
        _campaign_members_container = db.get_container_client(COSMOS_CONTAINER_CAMPAIGN_MEMBERS)
        return _campaign_members_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get campaign_members container: {e}")
        return None

def get_campaign_events_container():
    global _campaign_events_container
    if _campaign_events_container is not None:
        return _campaign_events_container
    db = get_database()
    if not db:
        return None
    try:
        _campaign_events_container = db.get_container_client(COSMOS_CONTAINER_CAMPAIGN_EVENTS)
        return _campaign_events_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get campaign_events container: {e}")
        return None

def init_cosmos_db():
    """Initializes database, containers, and seeds/syncs initial Admin user."""
    global _database, _users_container, _twilio_container, _calls_container, _themes_container, _agents_container, _profiles_container, _prospects_container, _campaigns_container, _campaign_members_container, _campaign_events_container
    client = get_cosmos_client()
    if not client:
        print("[CosmosDB Warning] Cosmos client unavailable during startup.")
        return

    try:
        db = client.create_database_if_not_exists(id=COSMOS_DATABASE)
        _database = db
        _users_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_USERS, partition_key=PartitionKey(path="/email"))
        _twilio_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_TWILIO, partition_key=PartitionKey(path="/user_id"))
        _calls_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CALLS, partition_key=PartitionKey(path="/user_id"))
        _themes_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_THEMES, partition_key=PartitionKey(path="/organization_id"))
        _agents_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_AGENTS, partition_key=PartitionKey(path="/organization_id"))
        _profiles_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_PROFILES, partition_key=PartitionKey(path="/organization_id"))
        _prospects_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_PROSPECTS, partition_key=PartitionKey(path="/organization_id"))
        _campaigns_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CAMPAIGNS, partition_key=PartitionKey(path="/organization_id"))
        _campaign_members_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CAMPAIGN_MEMBERS, partition_key=PartitionKey(path="/organization_id"))
        _campaign_events_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CAMPAIGN_EVENTS, partition_key=PartitionKey(path="/organization_id"))
    except Exception as e:
        print(f"[CosmosDB Error] Container verification during startup: {e}")

    container = get_users_container()
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

