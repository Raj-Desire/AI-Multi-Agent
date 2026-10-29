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
COSMOS_CONTAINER_PROSPECTS = os.getenv("COSMOS_CONTAINER_PROSPECTS", "prospects")
COSMOS_CONTAINER_CAMPAIGNS = os.getenv("COSMOS_CONTAINER_CAMPAIGNS", "campaigns")
COSMOS_CONTAINER_CAMPAIGN_MEMBERS = os.getenv("COSMOS_CONTAINER_CAMPAIGN_MEMBERS", "campaign_members")
COSMOS_CONTAINER_CAMPAIGN_EVENTS = os.getenv("COSMOS_CONTAINER_CAMPAIGN_EVENTS", "campaign_events")
COSMOS_CONTAINER_KNOWLEDGE_DOCUMENTS = os.getenv("COSMOS_CONTAINER_KNOWLEDGE_DOCUMENTS", "knowledge_documents")
COSMOS_CONTAINER_KNOWLEDGE_CHUNKS = os.getenv("COSMOS_CONTAINER_KNOWLEDGE_CHUNKS", "knowledge_chunks")
COSMOS_CONTAINER_AGENT_VERSIONS = os.getenv("COSMOS_CONTAINER_AGENT_VERSIONS", "agent_versions")
COSMOS_CONTAINER_ORG_CREDITS = os.getenv("COSMOS_CONTAINER_ORG_CREDITS", "org_credits")
COSMOS_CONTAINER_USAGE_LEDGER = os.getenv("COSMOS_CONTAINER_USAGE_LEDGER", "usage_ledger")
COSMOS_CONTAINER_CREDIT_LOGS = os.getenv("COSMOS_CONTAINER_CREDIT_LOGS", "credit_assignment_log")
COSMOS_CONTAINER_ACTIVITY_LOGS = os.getenv("COSMOS_CONTAINER_ACTIVITY_LOGS", "activity_logs")
COSMOS_CONTAINER_APPOINTMENTS = os.getenv("COSMOS_CONTAINER_APPOINTMENTS", "appointments")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@desireai.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

_client: Optional[CosmosClient] = None
_database = None
_users_container = None
_twilio_container = None
_calls_container = None
_themes_container = None
_agents_container = None
_prospects_container = None
_campaigns_container = None
_campaign_members_container = None
_campaign_events_container = None
_knowledge_documents_container = None
_knowledge_chunks_container = None
_credits_container = None
_ledger_container = None
_credit_logs_container = None
_activity_logs_container = None
_appointments_container = None

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

def get_knowledge_documents_container():
    global _knowledge_documents_container
    if _knowledge_documents_container is not None:
        return _knowledge_documents_container
    db = get_database()
    if not db:
        return None
    try:
        _knowledge_documents_container = db.get_container_client(COSMOS_CONTAINER_KNOWLEDGE_DOCUMENTS)
        return _knowledge_documents_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get knowledge_documents container: {e}")
        return None

def get_knowledge_chunks_container():
    global _knowledge_chunks_container
    if _knowledge_chunks_container is not None:
        return _knowledge_chunks_container
    db = get_database()
    if not db:
        return None
    try:
        _knowledge_chunks_container = db.get_container_client(COSMOS_CONTAINER_KNOWLEDGE_CHUNKS)
        return _knowledge_chunks_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get knowledge_chunks container: {e}")
        return None

_agent_versions_container = None

def get_agent_versions_container():
    global _agent_versions_container
    if _agent_versions_container is not None:
        return _agent_versions_container
    db = get_database()
    if not db:
        return None
    try:
        _agent_versions_container = db.get_container_client(COSMOS_CONTAINER_AGENT_VERSIONS)
        return _agent_versions_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get agent_versions container: {e}")
        return None

def get_credits_container():
    global _credits_container
    if _credits_container is not None:
        return _credits_container
    db = get_database()
    if not db:
        return None
    try:
        _credits_container = db.get_container_client(COSMOS_CONTAINER_ORG_CREDITS)
        return _credits_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get credits container: {e}")
        return None

def get_ledger_container():
    global _ledger_container
    if _ledger_container is not None:
        return _ledger_container
    db = get_database()
    if not db:
        return None
    try:
        _ledger_container = db.get_container_client(COSMOS_CONTAINER_USAGE_LEDGER)
        return _ledger_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get ledger container: {e}")
        return None

def get_credit_logs_container():
    global _credit_logs_container
    if _credit_logs_container is not None:
        return _credit_logs_container
    db = get_database()
    if not db:
        return None
    try:
        _credit_logs_container = db.get_container_client(COSMOS_CONTAINER_CREDIT_LOGS)
        return _credit_logs_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get credit logs container: {e}")
        return None

def get_activity_logs_container():
    global _activity_logs_container
    if _activity_logs_container is not None:
        return _activity_logs_container
    db = get_database()
    if not db:
        return None
    try:
        _activity_logs_container = db.get_container_client(COSMOS_CONTAINER_ACTIVITY_LOGS)
        return _activity_logs_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get activity logs container: {e}")
        return None

def get_appointments_container():
    global _appointments_container
    if _appointments_container is not None:
        return _appointments_container
    db = get_database()
    if not db:
        return None
    try:
        _appointments_container = db.get_container_client(COSMOS_CONTAINER_APPOINTMENTS)
        return _appointments_container
    except Exception as e:
        print(f"[CosmosDB Error] Failed to get appointments container: {e}")
        return None

def init_cosmos_db():
    """Initializes database, containers, and seeds/syncs initial Admin user."""
    global _database, _users_container, _twilio_container, _calls_container, _themes_container, _agents_container, _prospects_container, _campaigns_container, _campaign_members_container, _campaign_events_container, _knowledge_documents_container, _knowledge_chunks_container, _agent_versions_container, _credits_container, _ledger_container, _credit_logs_container, _activity_logs_container, _appointments_container
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
        _prospects_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_PROSPECTS, partition_key=PartitionKey(path="/organization_id"))
        _campaigns_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CAMPAIGNS, partition_key=PartitionKey(path="/organization_id"))
        _campaign_members_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CAMPAIGN_MEMBERS, partition_key=PartitionKey(path="/organization_id"))
        _campaign_events_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CAMPAIGN_EVENTS, partition_key=PartitionKey(path="/organization_id"))
        _knowledge_documents_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_KNOWLEDGE_DOCUMENTS, partition_key=PartitionKey(path="/organization_id"))
        _knowledge_chunks_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_KNOWLEDGE_CHUNKS, partition_key=PartitionKey(path="/organization_id"))
        _agent_versions_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_AGENT_VERSIONS, partition_key=PartitionKey(path="/organization_id"))
        _credits_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_ORG_CREDITS, partition_key=PartitionKey(path="/organization_id"))
        _ledger_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_USAGE_LEDGER, partition_key=PartitionKey(path="/organization_id"), default_ttl=7776000)
        _credit_logs_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_CREDIT_LOGS, partition_key=PartitionKey(path="/organization_id"))
        # Activity audit trail: auto-expire entries after 180 days
        _activity_logs_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_ACTIVITY_LOGS, partition_key=PartitionKey(path="/organization_id"), default_ttl=15552000)
        _appointments_container = db.create_container_if_not_exists(id=COSMOS_CONTAINER_APPOINTMENTS, partition_key=PartitionKey(path="/organization_id"))
    except Exception as e:
        print(f"[CosmosDB Error] Container verification during startup: {e}")



