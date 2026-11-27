import json
import logging

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1 import voice_profiles as vp
from app.core.dependencies import get_current_user
from app.core.security import decrypt_token, encrypt_token
from app.main import app
from app.models.voice_credentials import KeySlot, ResolvedVoiceProfile, VoiceCredentials
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.services.voice_credentials_service import VoiceCredentialsService
from app.voice_stack import resolver
from app.voice_stack.client_factory import build_voice_client, engine_of
from app.voice_stack.resolver import VoiceCredentialResolver

SUPER = {"id": "u_super", "email": "s@example.com", "role": "superadmin", "organization_id": "org_root"}
ADMIN_A = {"id": "u_a", "email": "a@example.com", "role": "admin", "organization_id": "org_a"}
USER_A = {"id": "u_u", "email": "u@example.com", "role": "user", "organization_id": "org_a"}
KEY_A = "llm-secret-key-AAAA1111"
KEY_B = "llm-secret-key-BBBB2222"
SA_A = "/api/v1/superadmin/voice-profiles/org_a"
SA_B = "/api/v1/superadmin/voice-profiles/org_b"


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


def sse_ok():
    body = (
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
        'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n'
        "data: [DONE]\n\n"
    )
    return httpx.Response(200, text=body)


class Net:
    """Fake HTTP layer: records requests, answers from `handler`."""

    def __init__(self, handler=None):
        self.requests = []
        self.handler = handler or (lambda req: sse_ok())

    def __call__(self, request):
        self.requests.append(request)
        return self.handler(request)

    @property
    def transport(self):
        return httpx.MockTransport(self)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "env-engine")
    monkeypatch.setenv("CARTESIA_API_KEY", "env-tts")
    monkeypatch.delenv("CUSTOM_PIPELINE_DEFAULT_ENABLED", raising=False)
    for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_KEY", "AZURE_OPENAI_VOICE_DEPLOYMENT_NAME"):
        monkeypatch.delenv(k, raising=False)


@pytest.fixture
def api(monkeypatch, env):
    repo = FakeRepo()
    net = Net()

    async def ok(_k):
        return True

    async def no_audit(*a, **k):
        return None

    monkeypatch.setattr("app.services.voice_credentials_service.validate_engine_key", ok)
    monkeypatch.setattr("app.services.voice_credentials_service.validate_tts_key", ok)
    service = VoiceCredentialsService(repo, audit=no_audit, llm_transport=net.transport)
    app.dependency_overrides[vp.get_voice_repo] = lambda: repo
    app.dependency_overrides[vp.get_voice_service] = lambda: service
    yield repo, net
    app.dependency_overrides.clear()


def as_user(user):
    app.dependency_overrides[get_current_user] = lambda: user


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


LLM_A = {"llm_endpoint": "https://a.example", "llm_api_key": KEY_A, "llm_deployment": "dep-a"}
LLM_B = {"llm_endpoint": "https://b.example", "llm_api_key": KEY_B, "llm_deployment": "dep-b", "llm_api_version": "2025-01-01"}


# ---------------- save ----------------

@pytest.mark.asyncio
async def test_superadmin_saves_encrypted_and_never_returns_key(api):
    repo, _ = api
    as_user(SUPER)
    async with client() as c:
        r = await c.put(SA_A, json=LLM_A)
        assert r.status_code == 200
        assert KEY_A not in r.text
        got = await c.get(SA_A)
        lst = await c.get("/api/v1/superadmin/voice-profiles")
    assert KEY_A not in got.text and KEY_A not in lst.text
    llm = r.json()["llm"]
    assert llm["configured"] is True and llm["deployment"] == "dep-a" and llm["key_hint"].endswith("1111")
    assert llm["api_version"] == "2024-08-01-preview"
    stored = repo.docs["org_a"].llm
    assert stored.encrypted_api_key != KEY_A and decrypt_token(stored.encrypted_api_key) == KEY_A


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [ADMIN_A, USER_A])
async def test_non_superadmin_cannot_write_or_verify(api, user):
    repo, _ = api
    as_user(user)
    async with client() as c:
        assert (await c.put(SA_A, json=LLM_A)).status_code == 403
        assert (await c.post(SA_A + "/llm/verify")).status_code == 403
        assert (await c.delete(SA_A + "/llm")).status_code == 403
        assert (await c.put("/api/v1/voice-profile", json=LLM_A)).status_code == 405
    assert "org_a" not in repo.docs


@pytest.mark.asyncio
async def test_omitted_key_keeps_stored_key_and_empty_key_too(api):
    repo, _ = api
    as_user(SUPER)
    async with client() as c:
        await c.put(SA_A, json=LLM_A)
        await c.put(SA_A, json={"llm_deployment": "dep-new"})
        await c.put(SA_A, json={"llm_api_key": ""})
    stored = repo.docs["org_a"].llm
    assert decrypt_token(stored.encrypted_api_key) == KEY_A and stored.deployment == "dep-new"


@pytest.mark.asyncio
async def test_changing_config_resets_verified_status(api):
    repo, _ = api
    as_user(SUPER)
    async with client() as c:
        await c.put(SA_A, json=LLM_A)
        await c.post(SA_A + "/llm/verify")
        assert repo.docs["org_a"].llm.status == "valid"
        await c.put(SA_A, json={"llm_deployment": "other"})
    assert repo.docs["org_a"].llm.status == "unverified"


@pytest.mark.asyncio
async def test_clear_llm_removes_everything(api):
    repo, _ = api
    as_user(SUPER)
    async with client() as c:
        await c.put(SA_A, json=LLM_A)
        r = await c.delete(SA_A + "/llm")
    assert r.status_code == 200 and r.json()["llm"]["configured"] is False
    s = repo.docs["org_a"].llm
    assert not s.encrypted_api_key and not s.endpoint and not s.deployment


@pytest.mark.asyncio
async def test_key_not_logged_on_save_and_verify(api, caplog):
    as_user(SUPER)
    with caplog.at_level(logging.DEBUG):
        async with client() as c:
            await c.put(SA_A, json=LLM_A)
            await c.post(SA_A + "/llm/verify")
    assert KEY_A not in caplog.text


@pytest.mark.asyncio
async def test_extra_fields_rejected_without_echoing_key(api):
    as_user(SUPER)
    async with client() as c:
        r = await c.put(SA_A, json={"llm_api_key": KEY_A, "bogus": 1})
    assert r.status_code == 422 and KEY_A not in r.text


# ---------------- org view ----------------

@pytest.mark.asyncio
async def test_org_view_has_only_booleans(api):
    as_user(SUPER)
    async with client() as c:
        await c.put(SA_A, json=LLM_A)
        as_user(ADMIN_A)
        r = await c.get("/api/v1/voice-profile")
        assert r.json()["llm_configured"] is True and r.json()["llm_verified"] is False
        as_user(SUPER)
        await c.post(SA_A + "/llm/verify")
        as_user(ADMIN_A)
        r = await c.get("/api/v1/voice-profile")
    body = r.json()
    assert body["llm_verified"] is True
    assert "llm" not in body
    for secret in (KEY_A, "a.example", "dep-a", "1111"):
        assert secret not in r.text


@pytest.mark.asyncio
async def test_org_view_without_document(api):
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.get("/api/v1/voice-profile")
    assert r.json()["llm_configured"] is False and r.json()["llm_verified"] is False


# ---------------- verify ----------------

@pytest.mark.asyncio
async def test_verify_success_makes_one_tiny_request_with_org_config(api):
    repo, net = api
    as_user(SUPER)
    async with client() as c:
        await c.put(SA_B, json=LLM_B)
        r = await c.post(SA_B + "/llm/verify")
    assert r.status_code == 200
    assert r.json()["llm_check"]["ok"] is True
    assert r.json()["llm"]["status"] == "valid" and r.json()["llm"]["last_verified_at"]
    assert len(net.requests) == 1
    req = net.requests[0]
    assert req.url.host == "b.example" and "/deployments/dep-b/" in req.url.path
    assert req.url.params["api-version"] == "2025-01-01"
    assert req.headers["api-key"] == KEY_B
    assert json.loads(req.content)["max_tokens"] <= 8
    assert KEY_B not in r.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "handler, status, phrase",
    [
        (lambda req: httpx.Response(401), "invalid", "key"),
        (lambda req: httpx.Response(403), "invalid", "key"),
        (lambda req: httpx.Response(404), "invalid", "deployment"),
        (lambda req: httpx.Response(503), "unverified", "unavailable"),
    ],
)
async def test_verify_failure_mapping(api, handler, status, phrase):
    repo, net = api
    net.handler = handler
    as_user(SUPER)
    async with client() as c:
        await c.put(SA_A, json=LLM_A)
        r = await c.post(SA_A + "/llm/verify")
    check = r.json()["llm_check"]
    assert check["ok"] is False and phrase in check["message"].lower()
    assert repo.docs["org_a"].llm.status == status
    low = r.text.lower()
    for vendor in ("azure", "openai", "deepgram", "cartesia", KEY_A):
        assert vendor.lower() not in low


@pytest.mark.asyncio
async def test_verify_timeout_and_unreachable(api):
    repo, net = api

    def timeout(req):
        raise httpx.ConnectTimeout("t", request=req)

    def refused(req):
        raise httpx.ConnectError("c", request=req)

    as_user(SUPER)
    async with client() as c:
        await c.put(SA_A, json=LLM_A)
        net.handler = timeout
        t = (await c.post(SA_A + "/llm/verify")).json()["llm_check"]
        net.handler = refused
        u = (await c.post(SA_A + "/llm/verify")).json()["llm_check"]
    assert t["ok"] is False and "timed out" in t["message"].lower()
    assert u["ok"] is False and "reach" in u["message"].lower()
    assert t["message"] != u["message"]
    assert repo.docs["org_a"].llm.status == "unverified"


@pytest.mark.asyncio
async def test_verify_not_configured_makes_no_request(api):
    repo, net = api
    as_user(SUPER)
    async with client() as c:
        r = await c.post(SA_A + "/llm/verify")
    assert r.json()["llm_check"]["ok"] is False and "not configured" in r.json()["llm_check"]["message"].lower()
    assert net.requests == []


# ---------------- resolver / legacy ----------------

def _slot(endpoint, key, deployment, version="2024-08-01-preview"):
    return dict(endpoint=endpoint, encrypted_api_key=encrypt_token(key), key_hint="..." + key[-4:],
                deployment=deployment, api_version=version)


def _doc(org, llm=None, plan="custom", mode="own"):
    from app.models.voice_credentials import LlmSlot

    return VoiceCredentials(
        organization_id=org,
        credential_mode=mode,
        engine=KeySlot(encrypted_api_key=encrypt_token("ek"), status="valid"),
        tts=KeySlot(encrypted_api_key=encrypt_token("tk"), status="valid"),
        tts_engine="cartesia",
        voice_engine=plan,
        llm=LlmSlot(**llm) if llm else LlmSlot(),
    )


def _repos(monkeypatch, docs):
    async def fake_get(self, org_id):
        return docs.get(org_id)

    monkeypatch.setattr(resolver.VoiceCredentialsRepository, "get_by_org", fake_get)


def test_legacy_document_without_llm_loads():
    doc = VoiceCredentials(**{"organization_id": "o", "engine": {}, "tts": {}, "voice_engine": "custom"})
    assert doc.llm.endpoint == "" and doc.llm.status == "unverified"
    assert doc.llm.api_version == "2024-08-01-preview"


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["own", "platform"])
async def test_resolver_carries_org_llm(monkeypatch, env, mode):
    _repos(monkeypatch, {"o": _doc("o", _slot("https://a.example", KEY_A, "dep-a"), mode=mode)})
    p = await VoiceCredentialResolver().resolve("o")
    assert (p.llm_endpoint, p.llm_api_key, p.llm_deployment, p.llm_api_version) == (
        "https://a.example", KEY_A, "dep-a", "2024-08-01-preview")
    assert KEY_A not in repr(p)


@pytest.mark.asyncio
async def test_resolver_empty_llm_when_not_configured_or_no_doc(monkeypatch, env):
    _repos(monkeypatch, {"o": _doc("o")})
    p = await VoiceCredentialResolver().resolve("o")
    assert not p.llm_endpoint and not p.llm_api_key and not p.llm_deployment
    p = await VoiceCredentialResolver().resolve("nodoc")
    assert not p.llm_api_key


@pytest.mark.asyncio
async def test_partially_configured_llm_is_treated_as_not_configured(monkeypatch, env):
    _repos(monkeypatch, {"o": _doc("o", _slot("https://a.example", KEY_A, ""))})
    p = await VoiceCredentialResolver().resolve("o")
    assert not p.llm_api_key and not p.llm_endpoint


# ---------------- gate ----------------

def _settings():
    from tests.pipeline.test_client import settings

    return settings()


def _profile(**kw):
    base = dict(tts_engine="cartesia", engine_key="k", tts_key="t", source="own", billed_to="org_own_key",
                voice_engine="custom", custom_pipeline_allowed=True)
    base.update(kw)
    return ResolvedVoiceProfile(**base)


@pytest.mark.asyncio
async def test_two_orgs_build_streams_with_their_own_values(monkeypatch, env):
    docs = {
        "org_a": _doc("org_a", _slot("https://a.example", KEY_A, "dep-a")),
        "org_b": _doc("org_b", _slot("https://b.example", KEY_B, "dep-b", "2025-01-01")),
    }
    _repos(monkeypatch, docs)
    streams = {}
    for org in ("org_a", "org_b"):
        client_ = await build_voice_client(org, engine="custom")
        assert engine_of(client_) == "custom"
        client_._build_missing(_settings())
        streams[org] = client_._llm
    a, b = streams["org_a"], streams["org_b"]
    assert (a._endpoint, a._api_key, a._deployment, a._api_version) == (
        "https://a.example", KEY_A, "dep-a", "2024-08-01-preview")
    assert (b._endpoint, b._api_key, b._deployment, b._api_version) == (
        "https://b.example", KEY_B, "dep-b", "2025-01-01")


@pytest.mark.asyncio
async def test_economy_without_org_llm_falls_back_standard_neutral(caplog, env):
    with caplog.at_level(logging.WARNING):
        c = await build_voice_client("o", profile=_profile(), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient) and engine_of(c) == "managed"
    text = caplog.text.lower()
    assert "economy" in text
    assert all(v not in text for v in ("deepgram", "cartesia", "openai", "azure"))


@pytest.mark.asyncio
async def test_env_set_but_org_empty_still_standard(monkeypatch, env):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://env.example")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "env-llm-key")
    monkeypatch.setenv("AZURE_OPENAI_VOICE_DEPLOYMENT_NAME", "env-dep")
    c = await build_voice_client("o", profile=_profile(), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)
    # even a forced Economy client with an empty org config never reads the environment
    from app.providers.pipeline.client import PipelineVoiceClient

    p = PipelineVoiceClient(profile=_profile(), stt=object(), tts=object())
    with pytest.raises(ValueError):
        p._build_missing(_settings())


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["llm_endpoint", "llm_api_key", "llm_deployment"])
async def test_any_missing_org_value_falls_back(missing):
    vals = dict(llm_endpoint="https://a.example", llm_api_key=KEY_A, llm_deployment="dep-a")
    vals[missing] = None
    c = await build_voice_client("o", profile=_profile(**vals), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_org_with_llm_but_standard_plan_stays_standard():
    p = _profile(voice_engine="managed", custom_pipeline_allowed=False,
                 llm_endpoint="https://a.example", llm_api_key=KEY_A, llm_deployment="dep-a")
    c = await build_voice_client("o", profile=p, engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_old_python_still_falls_back(monkeypatch):
    from app.voice_stack import client_factory as cf

    monkeypatch.setattr(cf, "_python_supports_economy", lambda: False)
    p = _profile(llm_endpoint="https://a.example", llm_api_key=KEY_A, llm_deployment="dep-a")
    assert isinstance(await build_voice_client("o", profile=p, engine="custom"), DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_org_key_not_logged_when_building_stream(caplog, env):
    p = _profile(llm_endpoint="https://a.example", llm_api_key=KEY_A, llm_deployment="dep-a")
    with caplog.at_level(logging.DEBUG):
        c = await build_voice_client("o", profile=p, engine="custom")
        c._build_missing(_settings())
    assert KEY_A not in caplog.text and "dep-a" in caplog.text
