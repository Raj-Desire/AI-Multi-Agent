"""Import of the platform language model settings, and proof that each organisation's calls use only its own
three credentials (listening key, speaking voice key, language model) with no other-org or environment fallback."""
import logging

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1 import voice_profiles as vp
from app.core.dependencies import get_current_user
from app.core.security import decrypt_token, encrypt_token
from app.main import app
from app.models.voice_credentials import KeySlot, LlmSlot, VoiceCredentials, VoiceCredentialsMissing
from app.providers.deepgram.configuration import (
    DeepgramAgentConfig, DeepgramSettingsConfiguration, DeepgramSpeakConfig, DeepgramSpeakProvider, DeepgramThinkConfig,
)
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.services.voice_credentials_service import VoiceCredentialsService
from app.voice_stack import resolver
from app.voice_stack.client_factory import build_voice_client
from app.voice_stack.registry import build_speak_provider

ROOT = "org_platform_root"
SUPER = {"id": "u_super", "email": "s@example.com", "role": "superadmin", "organization_id": ROOT}
ADMIN_A = {"id": "u_a", "email": "a@example.com", "role": "admin", "organization_id": "org_a"}
SA = "/api/v1/superadmin/voice-profiles"
ROOT_LLM_KEY = "root-llm-secret-RRRR9999"
OLD_LLM_KEY = "org-old-llm-secret-OOOO0000"

SECRETS = {
    "A": {"engine": "a-engine-secret-AAA1", "tts": "a-tts-secret-AAA2", "llm": "a-llm-secret-AAA3",
          "endpoint": "https://a-llm.example", "deployment": "dep-a", "version": "2025-01-01"},
    "B": {"engine": "b-engine-secret-BBB1", "tts": "b-tts-secret-BBB2", "llm": "b-llm-secret-BBB3",
          "endpoint": "https://b-llm.example", "deployment": "dep-b", "version": "2025-02-02"},
}
ENV_SECRETS = ("env-engine-secret-EEE1", "env-tts-secret-EEE2", "env-llm-secret-EEE3")


class FakeRepo:
    def __init__(self):
        self.docs = {}

    async def get_by_org(self, org_id):
        return self.docs.get(org_id)

    async def save(self, creds):
        self.docs[creds.organization_id] = creds.model_copy(deep=True)
        return creds

    async def list_all(self):
        return list(self.docs.values())


def llm_slot(key, endpoint="https://root.example", deployment="root-dep", version="2024-12-12"):
    return LlmSlot(endpoint=endpoint, encrypted_api_key=encrypt_token(key), key_hint="…" + key[-4:],
                   deployment=deployment, api_version=version, status="valid")


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", ENV_SECRETS[0])
    monkeypatch.setenv("CARTESIA_API_KEY", ENV_SECRETS[1])
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", ENV_SECRETS[2])
    monkeypatch.setenv("AZURE_OPENAI_KEY", ENV_SECRETS[2])
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://env-llm.example")
    monkeypatch.setenv("AZURE_OPENAI_VOICE_DEPLOYMENT_NAME", "env-dep")
    monkeypatch.delenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", raising=False)


@pytest.fixture
def api(monkeypatch, env):
    repo = FakeRepo()

    async def ok(_k):
        return True

    async def no_audit(*a, **k):
        return None

    monkeypatch.setattr("app.services.voice_credentials_service.validate_engine_key", ok)
    monkeypatch.setattr("app.services.voice_credentials_service.validate_tts_key", ok)
    service = VoiceCredentialsService(repo, audit=no_audit)
    app.dependency_overrides[vp.get_voice_repo] = lambda: repo
    app.dependency_overrides[vp.get_voice_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: SUPER
    yield repo
    app.dependency_overrides.clear()


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ---------------- part 1: import copies the platform language model ----------------

@pytest.mark.asyncio
async def test_import_copies_root_language_model_to_the_org(api):
    api.docs[ROOT] = VoiceCredentials(organization_id=ROOT, llm=llm_slot(ROOT_LLM_KEY))
    async with client() as c:
        r = await c.post(f"{SA}/org_a/import-platform")
    assert r.status_code == 200
    assert ROOT_LLM_KEY not in r.text and ENV_SECRETS[2] not in r.text
    body = r.json()
    assert "llm" in body["import_report"]["imported"]
    assert body["llm"]["configured"] is True and body["llm"]["deployment"] == "root-dep"
    stored = api.docs["org_a"].llm
    assert (stored.endpoint, stored.deployment, stored.api_version) == ("https://root.example", "root-dep", "2024-12-12")
    assert decrypt_token(stored.encrypted_api_key) == ROOT_LLM_KEY
    assert stored.status == "unverified"
    # The org holds its own copy: the root document is untouched and later root edits do not reach the org.
    assert decrypt_token(api.docs[ROOT].llm.encrypted_api_key) == ROOT_LLM_KEY
    api.docs[ROOT].llm = llm_slot("root-rotated-key-ZZZZ", deployment="changed")
    assert decrypt_token(api.docs["org_a"].llm.encrypted_api_key) == ROOT_LLM_KEY
    assert api.docs["org_a"].llm.deployment == "root-dep"


@pytest.mark.asyncio
async def test_import_without_root_language_model_reports_neutrally_and_still_imports_keys(api):
    async with client() as c:
        r = await c.post(f"{SA}/org_a/import-platform")
    assert r.status_code == 200
    rep = r.json()["import_report"]
    assert "llm" not in rep["imported"] and "engine_key" in rep["imported"]
    msg = rep["llm_message"].lower()
    assert "language model" in msg and "not configured" in msg
    assert "azure" not in msg and "deepgram" not in msg
    assert api.docs["org_a"].llm.configured is False
    assert api.docs["org_a"].engine.source == "imported"


@pytest.mark.asyncio
async def test_import_never_falls_back_to_environment_language_model(api):
    async with client() as c:
        await c.post(f"{SA}/org_a/import-platform")
    assert api.docs["org_a"].llm.configured is False
    assert ENV_SECRETS[2] not in repr(api.docs["org_a"].model_dump())


@pytest.mark.asyncio
async def test_import_conflicts_when_org_has_own_language_model_unless_confirmed(api):
    api.docs[ROOT] = VoiceCredentials(organization_id=ROOT, llm=llm_slot(ROOT_LLM_KEY))
    api.docs["org_a"] = VoiceCredentials(organization_id="org_a", llm=llm_slot(OLD_LLM_KEY, deployment="mine"))
    async with client() as c:
        r = await c.post(f"{SA}/org_a/import-platform")
        assert r.status_code == 409 and OLD_LLM_KEY not in r.text and ROOT_LLM_KEY not in r.text
        assert api.docs["org_a"].llm.deployment == "mine"
        r2 = await c.post(f"{SA}/org_a/import-platform?overwrite=true")
    assert r2.status_code == 200
    assert api.docs["org_a"].llm.deployment == "root-dep"
    assert decrypt_token(api.docs["org_a"].llm.encrypted_api_key) == ROOT_LLM_KEY


@pytest.mark.asyncio
async def test_import_into_root_org_itself_does_not_touch_its_language_model(api):
    api.docs[ROOT] = VoiceCredentials(organization_id=ROOT, llm=llm_slot(ROOT_LLM_KEY))
    async with client() as c:
        r = await c.post(f"{SA}/{ROOT}/import-platform?overwrite=true")
    assert r.status_code == 200
    assert "llm" not in r.json()["import_report"]["imported"]
    assert decrypt_token(api.docs[ROOT].llm.encrypted_api_key) == ROOT_LLM_KEY


@pytest.mark.asyncio
async def test_import_is_superadmin_only(api):
    api.docs[ROOT] = VoiceCredentials(organization_id=ROOT, llm=llm_slot(ROOT_LLM_KEY))
    app.dependency_overrides[get_current_user] = lambda: ADMIN_A
    async with client() as c:
        r = await c.post(f"{SA}/org_a/import-platform")
    assert r.status_code == 403
    assert "org_a" not in api.docs


# ---------------- part 3: each org's calls use only its own credentials ----------------

def own_doc(org, tag, plan):
    s = SECRETS[tag]
    return VoiceCredentials(
        organization_id=org, credential_mode="own", tts_engine="cartesia", voice_engine=plan,
        engine=KeySlot(encrypted_api_key=encrypt_token(s["engine"]), status="valid"),
        tts=KeySlot(encrypted_api_key=encrypt_token(s["tts"]), status="valid"),
        llm=LlmSlot(endpoint=s["endpoint"], encrypted_api_key=encrypt_token(s["llm"]), deployment=s["deployment"],
                    api_version=s["version"], status="valid"),
    )


@pytest.fixture
def two_orgs(monkeypatch, env):
    docs = {}

    async def fake_get(self, org_id):
        return docs.get(org_id)

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", fake_get)
    return docs


def economy_settings():
    return DeepgramSettingsConfiguration(agent=DeepgramAgentConfig(
        think=DeepgramThinkConfig(prompt="p", functions=[]),
        speak=DeepgramSpeakConfig(provider=DeepgramSpeakProvider(
            type="cartesia", model_id="sonic-3", voice={"mode": "id", "id": "v1"}, language="gu")),
    ))


class Voice:
    provider = "cartesia"
    voice = "a0e99841-438c-4a64-b679-ae501e7d6091"
    model = "sonic-3"
    speed = 1.0
    version = None


def other(tag):
    return SECRETS["B" if tag == "A" else "A"]


@pytest.mark.asyncio
@pytest.mark.parametrize("tag", ["A", "B"])
async def test_standard_client_uses_only_its_orgs_keys(two_orgs, tag):
    two_orgs["org_a"], two_orgs["org_b"] = own_doc("org_a", "A", "managed"), own_doc("org_b", "B", "managed")
    org = "org_a" if tag == "A" else "org_b"
    client_ = await build_voice_client(org)
    assert isinstance(client_, DeepgramVoiceAgentClient)
    assert client_.api_key == SECRETS[tag]["engine"]
    speak = build_speak_provider(await resolver.resolve_voice_profile(org), Voice(), language="gu")
    assert speak.endpoint.headers["x-api-key"] == SECRETS[tag]["tts"]
    blob = repr(client_.__dict__) + repr(speak.model_dump())
    for foreign in (*other(tag).values(), *ENV_SECRETS):
        assert foreign not in blob


@pytest.mark.asyncio
@pytest.mark.parametrize("tag", ["A", "B"])
async def test_economy_client_uses_only_its_orgs_three_values(two_orgs, tag):
    two_orgs["org_a"], two_orgs["org_b"] = own_doc("org_a", "A", "custom"), own_doc("org_b", "B", "custom")
    org = "org_a" if tag == "A" else "org_b"
    client_ = await build_voice_client(org, engine="custom")
    assert client_.VOICE_ENGINE == "custom"
    client_._build_missing(economy_settings())
    mine = SECRETS[tag]
    assert client_._stt._api_key == mine["engine"]
    assert client_._tts._api_key == mine["tts"]
    assert client_._llm._api_key == mine["llm"]
    assert client_._llm._endpoint == mine["endpoint"]
    assert client_._llm._deployment == mine["deployment"]
    assert client_._llm._api_version == mine["version"]
    blob = repr(client_._stt.__dict__) + repr(client_._tts.__dict__) + repr(client_._llm.__dict__)
    for foreign in (*other(tag).values(), *ENV_SECRETS, "env-llm.example", "env-dep"):
        assert foreign not in blob


@pytest.mark.asyncio
async def test_economy_without_own_language_model_runs_standard_never_other_org_or_env(two_orgs):
    two_orgs["org_a"] = own_doc("org_a", "A", "custom")
    two_orgs["org_a"].llm = LlmSlot()
    two_orgs["org_b"] = own_doc("org_b", "B", "custom")
    client_ = await build_voice_client("org_a", engine="custom")
    assert isinstance(client_, DeepgramVoiceAgentClient)
    assert client_.api_key == SECRETS["A"]["engine"]


@pytest.mark.asyncio
async def test_economy_without_own_voice_key_never_borrows_env_or_other_org(two_orgs):
    doc = own_doc("org_a", "A", "custom")
    doc.tts = KeySlot()
    two_orgs["org_a"], two_orgs["org_b"] = doc, own_doc("org_b", "B", "custom")
    with pytest.raises(VoiceCredentialsMissing):
        await build_voice_client("org_a", engine="custom")


def test_standard_client_never_reads_the_environment_key(monkeypatch):
    # The engine key is passed explicitly; an empty one must not silently become the platform environment key.
    monkeypatch.setenv("DEEPGRAM_API_KEY", ENV_SECRETS[0])
    assert DeepgramVoiceAgentClient().api_key == ""


@pytest.mark.asyncio
async def test_building_clients_logs_no_key_material(two_orgs, caplog):
    caplog.set_level(logging.DEBUG)
    two_orgs["org_a"], two_orgs["org_b"] = own_doc("org_a", "A", "custom"), own_doc("org_b", "B", "managed")
    await build_voice_client("org_b")
    eco = await build_voice_client("org_a", engine="custom")
    eco._build_missing(economy_settings())
    await build_voice_client("org_b", engine="custom")  # Economy requested for a Standard-plan org
    text = caplog.text
    for tag in ("A", "B"):
        for key in ("engine", "tts", "llm"):
            assert SECRETS[tag][key] not in text
    for s in ENV_SECRETS:
        assert s not in text


def test_gateway_passes_the_orgs_own_resolved_profile_to_the_factory():
    """Campaign and phone calls resolve the profile of the session's organisation once and hand that same profile on."""
    import inspect
    from app.voice import gateway
    src = inspect.getsource(gateway)
    assert "resolve_voice_profile(org_id)" in src
    assert "profile=voice_profile" in src
    assert "select_voice_engine(voice_profile, agent_config)" in src
