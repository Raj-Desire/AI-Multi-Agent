import logging
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1 import voice_profiles as vp
from app.core.dependencies import get_current_user
from app.core.security import encrypt_token
from app.main import app
from app.models.voice_credentials import KeySlot, ResolvedVoiceProfile, VoiceCredentials
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.services.voice_credentials_service import VoiceCredentialsService
from app.voice_stack import resolver
from app.voice_stack.client_factory import build_voice_client, engine_of, select_voice_engine
from app.voice_stack.resolver import VoiceCredentialResolver

CARTESIA_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"
SUPER = {"id": "u_super", "email": "s@example.com", "role": "superadmin", "organization_id": "org_root"}
ADMIN_A = {"id": "u_a", "email": "a@example.com", "role": "admin", "organization_id": "org_a"}
SA = "/api/v1/superadmin/voice-profiles/org_a"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "env-engine")
    monkeypatch.setenv("CARTESIA_API_KEY", "env-tts")
    monkeypatch.delenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", raising=False)
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x.example")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "k")


def _profile(plan, llm=True):
    # adapted: Economy needs the organization's own language model settings, not the environment
    extra = dict(llm_endpoint="https://org.example", llm_api_key="org-llm-key", llm_deployment="org-dep") if llm else {}
    return ResolvedVoiceProfile(
        tts_engine="cartesia", engine_key="k", tts_key="t", source="own", billed_to="org_own_key",
        voice_engine=plan, custom_pipeline_allowed=plan == "custom", **extra,
    )


def _agent(stored, provider="cartesia", voice=CARTESIA_ID):
    return SimpleNamespace(voice_engine=stored, voice=SimpleNamespace(provider=provider, voice=voice))


# ---- engine decided by the organisation plan only ----

@pytest.mark.asyncio
@pytest.mark.parametrize("stored", ["managed", "custom"])
async def test_plan_custom_builds_economy_for_any_agent(stored):
    profile = _profile("custom")
    engine = select_voice_engine(profile, _agent(stored))
    assert engine == "custom"
    client = await build_voice_client("o", profile=profile, engine=engine)
    assert type(client).__name__ == "PipelineVoiceClient"
    assert engine_of(client) == "custom"


@pytest.mark.asyncio
@pytest.mark.parametrize("stored", ["managed", "custom"])
async def test_plan_managed_builds_standard_even_if_agent_says_custom(stored):
    profile = _profile("managed")
    engine = select_voice_engine(profile, _agent(stored))
    assert engine == "managed"
    client = await build_voice_client("o", profile=profile, engine=engine)
    assert isinstance(client, DeepgramVoiceAgentClient) and engine_of(client) == "managed"


def test_plan_custom_with_non_cartesia_voice_falls_back_to_standard():
    assert select_voice_engine(_profile("custom"), _agent("custom", "deepgram", "aura-2-thalia-en")) == "managed"
    assert select_voice_engine(_profile("custom"), SimpleNamespace(voice=None)) == "managed"


@pytest.mark.asyncio
async def test_plan_custom_without_azure_falls_back_neutral(monkeypatch, caplog):
    profile = _profile("custom", llm=False)
    with caplog.at_level(logging.WARNING):
        client = await build_voice_client("o", profile=profile, engine=select_voice_engine(profile, _agent("managed")))
    assert engine_of(client) == "managed"
    text = caplog.text.lower()
    assert "economy" in text and all(v not in text for v in ("deepgram", "cartesia", "openai", "azure"))


# ---- credentials model migration ----

def test_legacy_flag_true_migrates_to_custom():
    doc = VoiceCredentials.model_validate({"organization_id": "o", "custom_pipeline_enabled": True})
    assert doc.voice_engine == "custom"


def test_legacy_flag_false_or_missing_migrates_to_managed():
    assert VoiceCredentials.model_validate({"organization_id": "o", "custom_pipeline_enabled": False}).voice_engine == "managed"
    assert VoiceCredentials.model_validate({"organization_id": "o"}).voice_engine == "managed"


def test_stored_plan_wins_over_legacy_flag():
    doc = VoiceCredentials.model_validate({"organization_id": "o", "voice_engine": "managed", "custom_pipeline_enabled": True})
    assert doc.voice_engine == "managed"


@pytest.mark.asyncio
@pytest.mark.parametrize("plan", ["custom", "managed"])
async def test_resolver_carries_plan(monkeypatch, plan):
    doc = VoiceCredentials(
        organization_id="o", voice_engine=plan,
        engine=KeySlot(encrypted_api_key=encrypt_token("k1"), status="valid"),
    )

    async def fake_get(self, org_id):
        return doc

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", fake_get)
    p = await VoiceCredentialResolver().resolve("o")
    assert p.voice_engine == plan and p.custom_pipeline_allowed is (plan == "custom")


@pytest.mark.asyncio
async def test_no_document_env_default_seeds_plan(monkeypatch):
    async def none(self, org_id):
        return None

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", none)
    assert (await VoiceCredentialResolver().resolve("o")).voice_engine == "managed"
    monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "true")
    assert (await VoiceCredentialResolver().resolve("o")).voice_engine == "custom"


# ---- API ----

class FakeRepo:
    def __init__(self):
        self.docs = {}

    async def get_by_org(self, org_id):
        return self.docs.get(org_id)

    async def save(self, creds):
        self.docs[creds.organization_id] = creds
        return creds

    async def list_all(self):
        return list(self.docs.values())


@pytest.fixture
def api(monkeypatch):
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
    yield repo
    app.dependency_overrides.clear()


def as_user(user):
    app.dependency_overrides[get_current_user] = lambda: user


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_superadmin_writes_and_reads_plan(api):
    as_user(SUPER)
    async with client() as c:
        r = await c.put(SA, json={"voice_engine": "custom"})
        assert r.status_code == 200 and r.json()["voice_engine"] == "custom"
        assert api.docs["org_a"].voice_engine == "custom"
        assert (await c.get(SA)).json()["voice_engine"] == "custom"
        r = await c.put(SA, json={"engine_key": "k-new-1234"})
        assert r.json()["voice_engine"] == "custom"  # other saves keep the plan
        r = await c.put(SA, json={"voice_engine": "managed"})
        assert r.json()["voice_engine"] == "managed"


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["economy", "", True, "Custom"])
async def test_invalid_plan_is_422(api, bad):
    as_user(SUPER)
    async with client() as c:
        r = await c.put(SA, json={"voice_engine": bad})
    assert r.status_code == 422
    assert "org_a" not in api.docs


@pytest.mark.asyncio
async def test_old_flag_field_no_longer_writable(api):
    as_user(SUPER)
    async with client() as c:
        r = await c.put(SA, json={"custom_pipeline_enabled": True})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_org_admin_cannot_write_plan(api):
    as_user(ADMIN_A)
    async with client() as c:
        r1 = await c.put(SA, json={"voice_engine": "custom"})
        r2 = await c.put("/api/v1/voice-profile", json={"voice_engine": "custom"})
    assert r1.status_code == 403 and r2.status_code == 405
    assert "org_a" not in api.docs


@pytest.mark.asyncio
async def test_org_profile_exposes_plan_without_secrets(api, monkeypatch):
    as_user(ADMIN_A)
    async with client() as c:
        assert (await c.get("/api/v1/voice-profile")).json()["voice_engine"] == "managed"
        monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "yes")
        assert (await c.get("/api/v1/voice-profile")).json()["voice_engine"] == "custom"
        api.docs["org_a"] = VoiceCredentials(organization_id="org_a", voice_engine="custom")
        body = (await c.get("/api/v1/voice-profile")).json()
    assert body["voice_engine"] == "custom" and body["custom_pipeline_allowed"] is True
    assert "key" not in str(body).lower().replace("key_hint", "")


@pytest.mark.asyncio
async def test_superadmin_list_shows_migrated_plan(api, monkeypatch):
    async def orgs():
        return [{"organization_id": "org_a", "org_name": "A"}, {"organization_id": "org_l", "org_name": "L"}]

    monkeypatch.setattr(vp.UserRepository, "list_organizations", staticmethod(orgs))
    api.docs["org_a"] = VoiceCredentials.model_validate({"organization_id": "org_a", "custom_pipeline_enabled": True})
    as_user(SUPER)
    async with client() as c:
        rows = {r["organization_id"]: r for r in (await c.get("/api/v1/superadmin/voice-profiles")).json()}
    assert rows["org_a"]["voice_engine"] == "custom" and rows["org_l"]["voice_engine"] == "managed"
