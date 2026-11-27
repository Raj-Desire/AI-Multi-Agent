import logging

import pytest
from httpx import AsyncClient, ASGITransport

from app.api.v1 import voice_profiles as vp
from app.core.dependencies import get_current_user
from app.main import app
from app.models.voice_credentials import KeySlot, ResolvedVoiceProfile, VoiceCredentials
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.services.voice_credentials_service import VoiceCredentialsService
from app.voice_stack import resolver
from app.voice_stack.client_factory import build_voice_client
from app.voice_stack.resolver import VoiceCredentialResolver
from app.core.security import encrypt_token

SUPER = {"id": "u_super", "email": "s@example.com", "role": "superadmin", "organization_id": "org_root"}
ADMIN_A = {"id": "u_a", "email": "a@example.com", "role": "admin", "organization_id": "org_a"}


def _repo(monkeypatch, creds=None):
    async def fake_get(self, org_id):
        return creds

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", fake_get)


@pytest.fixture(autouse=True)
def base_env(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "env-engine")
    monkeypatch.setenv("CARTESIA_API_KEY", "env-tts")
    monkeypatch.delenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)


def _own(enabled, mode="own"):
    return VoiceCredentials(
        organization_id="o",
        credential_mode=mode,
        engine=KeySlot(encrypted_api_key=encrypt_token("k1"), status="valid"),
        custom_pipeline_enabled=enabled,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["own", "platform"])
@pytest.mark.parametrize("enabled", [True, False])
async def test_org_flag_maps_to_profile(monkeypatch, mode, enabled):
    _repo(monkeypatch, _own(enabled, mode))
    p = await VoiceCredentialResolver().resolve("o")
    assert p.custom_pipeline_allowed is enabled


@pytest.mark.asyncio
async def test_org_flag_wins_over_env_default(monkeypatch):
    monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "true")
    _repo(monkeypatch, _own(False))
    assert (await VoiceCredentialResolver().resolve("o")).custom_pipeline_allowed is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "value,expected",
    [("1", True), ("true", True), (" YES ", True), ("On", True), ("TRUE", True),
     ("0", False), ("false", False), ("maybe", False), ("", False), (None, False)],
)
async def test_no_document_follows_env_default(monkeypatch, value, expected):
    _repo(monkeypatch, None)
    if value is not None:
        monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", value)
    assert (await VoiceCredentialResolver().resolve("org1")).custom_pipeline_allowed is expected
    assert (await VoiceCredentialResolver().resolve(None)).custom_pipeline_allowed is expected


@pytest.mark.asyncio
async def test_repository_error_still_propagates(monkeypatch):
    async def boom(self, org_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", boom)
    with pytest.raises(RuntimeError):
        await VoiceCredentialResolver().resolve("o")


def test_old_document_without_field_loads_false():
    doc = VoiceCredentials.model_validate({"organization_id": "o", "tts_engine": "aura"})
    assert doc.custom_pipeline_enabled is False


@pytest.mark.asyncio
async def test_flag_off_falls_back_to_standard(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x.example")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "k")
    _repo(monkeypatch, _own(False))
    client = await build_voice_client("o", engine="custom")
    assert isinstance(client, DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_flag_on_without_settings_falls_back_with_neutral_log(monkeypatch, caplog):
    _repo(monkeypatch, _own(True))
    with caplog.at_level(logging.WARNING):
        client = await build_voice_client("o", engine="custom")
    assert isinstance(client, DeepgramVoiceAgentClient)
    text = caplog.text.lower()
    assert "economy" in text
    for vendor in ("deepgram", "cartesia", "openai", "azure"):
        assert vendor not in text


@pytest.mark.asyncio
async def test_flag_on_with_settings_returns_economy(monkeypatch):
    from app.providers.pipeline.client import PipelineVoiceClient

    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x.example")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "k")
    _repo(monkeypatch, _own(True))
    client = await build_voice_client("o", engine="custom")
    assert isinstance(client, PipelineVoiceClient)


# ---------------- API ----------------

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


SA = "/api/v1/superadmin/voice-profiles/org_a"


@pytest.mark.asyncio
async def test_superadmin_sets_and_clears_flag(api):
    as_user(SUPER)
    async with client() as c:
        r = await c.put(SA, json={"voice_engine": "custom"})
        assert r.status_code == 200 and r.json()["voice_engine"] == "custom"
        assert api.docs["org_a"].custom_pipeline_enabled is True
        assert (await c.get(SA)).json()["voice_engine"] == "custom"
        r = await c.put(SA, json={"voice_engine": "managed"})
        assert r.json()["voice_engine"] == "managed"
        assert api.docs["org_a"].custom_pipeline_enabled is False


@pytest.mark.asyncio
async def test_saving_other_fields_preserves_flag(api):
    as_user(SUPER)
    async with client() as c:
        await c.put(SA, json={"voice_engine": "custom"})
        r = await c.put(SA, json={"engine_key": "k-new-1234", "tts_engine": "cartesia", "allow_org_edit": True})
        assert r.status_code == 200
        assert r.json()["voice_engine"] == "custom"
        assert api.docs["org_a"].custom_pipeline_enabled is True


@pytest.mark.asyncio
async def test_non_superadmin_rejected(api):
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.put(SA, json={"voice_engine": "custom"})
    assert r.status_code in (401, 403)
    assert "org_a" not in api.docs


@pytest.mark.asyncio
async def test_superadmin_list_includes_flag(api, monkeypatch):
    async def orgs():
        return [{"organization_id": "org_a", "org_name": "A"}, {"organization_id": "org_l", "org_name": "L"}]

    monkeypatch.setattr(vp.UserRepository, "list_organizations", staticmethod(orgs))
    api.docs["org_a"] = VoiceCredentials(organization_id="org_a", custom_pipeline_enabled=True)
    as_user(SUPER)
    async with client() as c:
        rows = {r["organization_id"]: r for r in (await c.get("/api/v1/superadmin/voice-profiles")).json()}
    assert rows["org_a"]["voice_engine"] == "custom"
    assert rows["org_l"]["voice_engine"] == "managed"


@pytest.mark.asyncio
async def test_org_read_route_exposes_allowed_and_keeps_fields(api, monkeypatch):
    as_user(ADMIN_A)
    async with client() as c:
        legacy = (await c.get("/api/v1/voice-profile")).json()
        assert legacy["custom_pipeline_allowed"] is False
        monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "yes")
        assert (await c.get("/api/v1/voice-profile")).json()["custom_pipeline_allowed"] is True
        api.docs["org_a"] = VoiceCredentials(organization_id="org_a", custom_pipeline_enabled=True)
        body = (await c.get("/api/v1/voice-profile")).json()
    assert body["custom_pipeline_allowed"] is True
    for field in ("configured", "tts_engine", "credential_mode", "allow_org_edit", "engine", "tts"):
        assert field in body
    assert "key" not in str(body).lower().replace("key_hint", "")


# ---------------- new document inherits the env default ----------------

def _svc(monkeypatch):
    repo = FakeRepo()

    async def ok(_k):
        return True

    async def no_audit(*a, **k):
        return None

    monkeypatch.setattr("app.services.voice_credentials_service.validate_engine_key", ok)
    monkeypatch.setattr("app.services.voice_credentials_service.validate_tts_key", ok)
    monkeypatch.setattr("app.services.voice_credentials_service.platform_keys", lambda: ("plat-engine-9999", None))

    async def fake_get(self, org_id):
        return repo.docs.get(org_id)

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", fake_get)
    return repo, VoiceCredentialsService(repo, audit=no_audit)


async def _allowed():
    return (await VoiceCredentialResolver().resolve("org_n", require_tts=False)).custom_pipeline_allowed


@pytest.mark.asyncio
@pytest.mark.parametrize("op", ["keys", "mode", "import", "clear"])
async def test_new_document_keeps_env_default_true(monkeypatch, op):
    monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "true")
    repo, svc = _svc(monkeypatch)
    assert await _allowed() is True
    if op == "keys":
        await svc.save("org_n", actor_id="a", engine_key="k-1234", tts_engine="aura")
    elif op == "mode":
        await svc.save("org_n", actor_id="a", credential_mode="platform")
    elif op == "import":
        await svc.import_platform("org_n", actor_id="a")
    else:
        await svc.clear("org_n", "engine", actor_id="a")
    assert repo.docs["org_n"].custom_pipeline_enabled is True
    if op != "clear":  # a cleared own-mode document has no key, so it cannot resolve at all
        assert await _allowed() is True


@pytest.mark.asyncio
async def test_explicit_false_wins_on_new_document(monkeypatch):
    monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "true")
    repo, svc = _svc(monkeypatch)
    await svc.save("org_n", actor_id="a", engine_key="k-1234", voice_engine="managed")
    assert repo.docs["org_n"].custom_pipeline_enabled is False


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [None, "false", "garbage"])
async def test_new_document_false_when_default_off(monkeypatch, value):
    if value is not None:
        monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", value)
    repo, svc = _svc(monkeypatch)
    await svc.save("org_n", actor_id="a", engine_key="k-1234")
    assert repo.docs["org_n"].custom_pipeline_enabled is False


@pytest.mark.asyncio
async def test_existing_false_document_not_overridden(monkeypatch):
    monkeypatch.setenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", "true")
    repo, svc = _svc(monkeypatch)
    repo.docs["org_n"] = VoiceCredentials(organization_id="org_n", custom_pipeline_enabled=False)
    await svc.save("org_n", actor_id="a", engine_key="k-1234")
    assert repo.docs["org_n"].custom_pipeline_enabled is False
    assert await _allowed() is False
