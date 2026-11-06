import logging
import os
import threading
from typing import Any, Dict, Optional

from dotenv import load_dotenv

load_dotenv()

from azure.cosmos import CosmosClient, PartitionKey

logger = logging.getLogger(__name__)

# Read configuration from environment variables
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT", "")
COSMOS_KEY = os.getenv("COSMOS_KEY", "")
# Internal database identifier: renaming the default would silently point an unconfigured environment at an empty database.
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "DesireAIDB")
# Optional comma-separated region list (closest to the API first), e.g. "Central India,South India"
COSMOS_PREFERRED_LOCATIONS = [r.strip() for r in os.getenv("COSMOS_PREFERRED_LOCATIONS", "").split(",") if r.strip()]

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
COSMOS_CONTAINER_LEAD_RULES = os.getenv("COSMOS_CONTAINER_LEAD_RULES", "lead_rules")

# The calls container was historically partitioned by /user_id, but almost every read is "all calls of an
# organization", which made each of them a cross-partition fan-out. A partition key cannot be changed in place:
# create a new container partitioned by /organization_id, copy the data (scripts/migrate_calls_partition.py),
# then point COSMOS_CONTAINER_CALLS at it and set COSMOS_CALLS_PARTITION_FIELD=organization_id.
COSMOS_CALLS_PARTITION_FIELD = os.getenv("COSMOS_CALLS_PARTITION_FIELD", "user_id").strip().lstrip("/") or "user_id"

TTL_90_DAYS = 7776000
TTL_180_DAYS = 15552000


def _ttl_from_env(name: str) -> Optional[int]:
    """Opt-in retention: COSMOS_TTL_<NAME>_DAYS=<n> makes NEWLY created containers expire documents after n days.
    Unset (the default) keeps documents forever. Existing containers are changed in the Azure portal."""
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return None
    try:
        days = int(raw)
    except ValueError:
        logger.warning("%s=%r is not a whole number of days; ignoring", name, raw)
        return None
    return days * 86400 if days > 0 else None

_client: Optional[CosmosClient] = None
_database = None
_lock = threading.Lock()
_containers: Dict[str, Any] = {}


def _index_policy(*excluded_paths: str) -> Dict[str, Any]:
    """Index everything except large, never-filtered payloads (transcripts, embeddings...).
    Every indexed byte is paid for on every write, and these fields are only ever read back whole."""
    return {
        "indexingMode": "consistent",
        "automatic": True,
        "includedPaths": [{"path": "/*"}],
        "excludedPaths": [{"path": p} for p in excluded_paths] + [{"path": '/"_etag"/?'}],
    }


# container key -> spec (name, partition key path, optional TTL / indexing policy).
# Single source of truth for startup creation and for scripts/apply_cosmos_indexing.py.
CONTAINER_SPECS: Dict[str, Dict[str, Any]] = {
    "users": {"name": COSMOS_CONTAINER_USERS, "pk": "/email"},
    "twilio": {"name": COSMOS_CONTAINER_TWILIO, "pk": "/user_id"},
    "calls": {
        "name": COSMOS_CONTAINER_CALLS,
        "pk": "/" + COSMOS_CALLS_PARTITION_FIELD,
        "indexing_policy": _index_policy(
            "/transcript/*", "/agent_config_snapshot/*", "/analytics/*", "/latency_metrics/*",
            "/error_information/*", "/key_insights/*", "/key_requirements/*", "/customer_questions/*",
            "/objections/*", "/prompt/?", "/important_info/?",
        ),
    },
    "themes": {"name": COSMOS_CONTAINER_THEMES, "pk": "/organization_id"},
    "agents": {"name": COSMOS_CONTAINER_AGENTS, "pk": "/organization_id"},
    "prospects": {"name": COSMOS_CONTAINER_PROSPECTS, "pk": "/organization_id"},
    "campaigns": {"name": COSMOS_CONTAINER_CAMPAIGNS, "pk": "/organization_id"},
    "campaign_members": {"name": COSMOS_CONTAINER_CAMPAIGN_MEMBERS, "pk": "/organization_id"},
    "campaign_events": {"name": COSMOS_CONTAINER_CAMPAIGN_EVENTS, "pk": "/organization_id", "default_ttl": _ttl_from_env("COSMOS_TTL_CAMPAIGN_EVENTS_DAYS")},
    "knowledge_documents": {"name": COSMOS_CONTAINER_KNOWLEDGE_DOCUMENTS, "pk": "/organization_id"},
    "knowledge_chunks": {
        "name": COSMOS_CONTAINER_KNOWLEDGE_CHUNKS,
        "pk": "/organization_id",
        "indexing_policy": _index_policy("/embedding/*", "/content/?", "/metadata/*"),
    },
    "agent_versions": {"name": COSMOS_CONTAINER_AGENT_VERSIONS, "pk": "/organization_id", "default_ttl": _ttl_from_env("COSMOS_TTL_AGENT_VERSIONS_DAYS")},
    "credits": {"name": COSMOS_CONTAINER_ORG_CREDITS, "pk": "/organization_id"},
    "ledger": {"name": COSMOS_CONTAINER_USAGE_LEDGER, "pk": "/organization_id", "default_ttl": TTL_90_DAYS},
    "credit_logs": {"name": COSMOS_CONTAINER_CREDIT_LOGS, "pk": "/organization_id"},
    # Activity audit trail: auto-expire entries after 180 days
    "activity_logs": {"name": COSMOS_CONTAINER_ACTIVITY_LOGS, "pk": "/organization_id", "default_ttl": TTL_180_DAYS},
    "appointments": {"name": COSMOS_CONTAINER_APPOINTMENTS, "pk": "/organization_id"},
    "lead_rules": {"name": COSMOS_CONTAINER_LEAD_RULES, "pk": "/organization_id"},
}


def get_cosmos_client() -> Optional[CosmosClient]:
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is not None:
            return _client
        if not COSMOS_ENDPOINT or not COSMOS_KEY:
            logger.warning("COSMOS_ENDPOINT or COSMOS_KEY is not set.")
            return None
        try:
            options: Dict[str, Any] = {}
            if COSMOS_PREFERRED_LOCATIONS:
                options["preferred_locations"] = COSMOS_PREFERRED_LOCATIONS
            _client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY, **options)
        except Exception as e:
            logger.error("Failed to create CosmosClient: %s", e)
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
        logger.error("Failed to get database client: %s", e)
        return None


def _get_container(key: str):
    """Returns the (cached) container client for a CONTAINER_SPECS key, or None when the database is unreachable."""
    cached = _containers.get(key)
    if cached is not None:
        return cached
    db = get_database()
    if not db:
        return None
    try:
        container = db.get_container_client(CONTAINER_SPECS[key]["name"])
        _containers[key] = container
        return container
    except Exception as e:
        logger.error("Failed to get %s container: %s", key, e)
        return None


def get_users_container():
    return _get_container("users")


def get_twilio_container():
    return _get_container("twilio")


def get_calls_container():
    return _get_container("calls")


def get_themes_container():
    return _get_container("themes")


def get_agents_container():
    return _get_container("agents")


def get_prospects_container():
    return _get_container("prospects")


def get_campaigns_container():
    return _get_container("campaigns")


def get_campaign_members_container():
    return _get_container("campaign_members")


def get_campaign_events_container():
    return _get_container("campaign_events")


def get_knowledge_documents_container():
    return _get_container("knowledge_documents")


def get_knowledge_chunks_container():
    return _get_container("knowledge_chunks")


def get_agent_versions_container():
    return _get_container("agent_versions")


def get_credits_container():
    return _get_container("credits")


def get_ledger_container():
    return _get_container("ledger")


def get_credit_logs_container():
    return _get_container("credit_logs")


def get_activity_logs_container():
    return _get_container("activity_logs")


def get_appointments_container():
    return _get_container("appointments")


def get_lead_rules_container():
    return _get_container("lead_rules")


def init_cosmos_db():
    """Creates the database and any missing containers.

    Indexing policies and TTLs apply to containers created here. Existing containers are left untouched on
    purpose (changing an index policy triggers a background re-index); use scripts/apply_cosmos_indexing.py.
    """
    global _database
    client = get_cosmos_client()
    if not client:
        logger.warning("Cosmos client unavailable during startup.")
        return

    try:
        db = client.create_database_if_not_exists(id=COSMOS_DATABASE)
        _database = db
        for key, spec in CONTAINER_SPECS.items():
            kwargs: Dict[str, Any] = {}
            if spec.get("default_ttl"):
                kwargs["default_ttl"] = spec["default_ttl"]
            if "indexing_policy" in spec:
                kwargs["indexing_policy"] = spec["indexing_policy"]
            _containers[key] = db.create_container_if_not_exists(
                id=spec["name"], partition_key=PartitionKey(path=spec["pk"]), **kwargs
            )
    except Exception as e:
        logger.error("Container verification during startup: %s", e)
