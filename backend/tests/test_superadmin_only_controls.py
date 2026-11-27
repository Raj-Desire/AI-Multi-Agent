import pytest
from httpx import AsyncClient, ASGITransport

from app.agents.configuration import AgentConfiguration
from app.api.v1 import voice_profiles as vp
from app.api.v1.agents import agent_repo, get_agent_service
from app.core.dependencies import TenantContext, get_current_user, get_tenant_context
from app.main import app
from app.models.voice_credentials import VoiceCredentials
from app.services.agent_service import AgentService
from app.voice_stack.client_factory import select_voice_engine

SUPER = {"id": "u_super", "email": "s@example.com", "role": "superadmin", "organization_id": "org_root"}
ADMIN_A = {"id": "u_a", "email": "a@example.com", "role": "admin", "organization_id": "org_a"}
USER_A = {"id": "u_u", "email": "u@example.com", "role": "user", "organization_id": "org_a"}


def ctx_of(u):
    return TenantContext(organization_id=u["organization_id"], user_id=u["id"], email=u["email"], role=u["role"])


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture(autouse=True)
def cleanup():
    yield
    app.dependency_overrides.clear()


def as_user(u):
    app.dependency_overrides[get_current_user] = lambda: u
    app.dependency_overrides[get_tenant_context] = lambda: ctx_of(u)


_n = [0]


async def seed(engine, org="org_a", scope="ORGANIZATION"):
    _n[0] += 1
    svc = AgentService(agent_repo)
    sa = ctx_of({**SUPER, "organization_id": org})
    cfg = AgentConfiguration(agent_id=f"agt_so_{_n[0]}", name=f"SO Agent {_n[0]} {org}", scope=scope,
                             voice_engine=engine, role="r", objective="o")
    created = await svc.create_agent(sa, cfg)
    return created.agent_id


def body(engine, name):
    _n[0] += 1
    return AgentConfiguration(name=f"{name} {_n[0]}", scope="ORGANIZATION", role="r", objective="o",
                              voice_engine=engine).model_dump(mode="json")


@pytest.mark.asyncio
async def test_update_ignores_engine_change_to_custom():
    aid = await seed("managed")
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.put(f"/api/v1/agents/{aid}", json=body("custom", "Renamed one"))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == "managed"
    assert (await agent_repo.get_by_id("org_a", aid)).voice_engine == "managed"


@pytest.mark.asyncio
async def test_update_keeps_custom_when_admin_sends_managed():
    aid = await seed("custom")
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.put(f"/api/v1/agents/{aid}", json=body("managed", "Renamed two"))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == "custom"
    assert (await agent_repo.get_by_id("org_a", aid)).voice_engine == "custom"


@pytest.mark.asyncio
async def test_plain_user_service_update_keeps_engine():
    aid = await seed("managed")
    svc = AgentService(agent_repo)
    existing = await agent_repo.get_by_id("org_a", aid)
    existing.owner_user_id = USER_A["id"]
    payload = AgentConfiguration(name="User edit", role="r", objective="o", voice_engine="custom")
    out = await svc.update_agent(ctx_of(USER_A), aid, payload)
    assert out.voice_engine == "managed"


@pytest.mark.asyncio
async def test_admin_create_is_stored_managed():
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.post("/api/v1/agents", json=body("custom", "Brand new admin agent"))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == "managed"
    assert (await agent_repo.get_by_id("org_a", r.json()["data"]["agent_id"])).voice_engine == "managed"


@pytest.mark.asyncio
async def test_superadmin_create_keeps_custom():
    as_user(SUPER)
    async with client() as c:
        r = await c.post("/api/v1/agents", json=body("custom", "Brand new super agent"))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == "custom"


@pytest.mark.asyncio
@pytest.mark.parametrize("engine", ["managed", "custom"])
async def test_duplicate_keeps_source_engine(engine):
    aid = await seed(engine)
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.post(f"/api/v1/agents/{aid}/duplicate")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == engine
    # and the admin cannot alter it afterwards
    new_id = r.json()["data"]["agent_id"]
    other = "managed" if engine == "custom" else "custom"
    async with client() as c:
        r2 = await c.put(f"/api/v1/agents/{new_id}", json=body(other, "Copy edited"))
    assert r2.json()["data"]["voice_engine"] == engine


@pytest.mark.asyncio
async def test_rollback_keeps_current_engine():
    aid = await seed("managed")
    svc = AgentService(agent_repo)
    sa = ctx_of({**SUPER, "organization_id": "org_a"})
    cur = await agent_repo.get_by_id("org_a", aid)
    v2 = AgentConfiguration(name=cur.name, role="r", objective="o2", voice_engine="custom")
    await svc.update_agent(sa, aid, v2)  # superadmin switches to custom (version 2)
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.post(f"/api/v1/agents/{aid}/rollback/1")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == "custom"


@pytest.mark.asyncio
@pytest.mark.parametrize("first,second", [("managed", "custom"), ("custom", "managed")])
async def test_superadmin_can_change_both_ways_including_other_org(first, second):
    aid = await seed(first)
    as_user({**SUPER, "organization_id": "org_a"})  # superadmin acting inside the client org
    async with client() as c:
        r = await c.put(f"/api/v1/agents/{aid}", json=body(second, "Super edited"))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["voice_engine"] == second
    assert (await agent_repo.get_by_id("org_a", aid)).voice_engine == second


@pytest.mark.asyncio
async def test_agent_config_override_path_cannot_set_engine():
    aid = await seed("managed")
    svc = AgentService(agent_repo)
    cfg = AgentConfiguration(agent_id=aid, name="Override edit", role="r", objective="o", voice_engine="custom")
    out = await svc.save_agent(ctx_of(ADMIN_A), cfg)
    assert out.voice_engine == "managed"


# ---- voice profile routes ----

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
def vrepo():
    repo = FakeRepo()
    app.dependency_overrides[vp.get_voice_repo] = lambda: repo
    return repo


@pytest.mark.asyncio
async def test_org_put_voice_profile_rejected_even_when_allow_org_edit(vrepo):
    vrepo.docs["org_a"] = VoiceCredentials(organization_id="org_a", allow_org_edit=True)
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.put("/api/v1/voice-profile", json={"engine_key": "secret-key-123456"})
    assert r.status_code == 405
    assert vrepo.docs["org_a"].engine.key_hint in (None, "")


@pytest.mark.asyncio
async def test_org_get_voice_profile_still_works(vrepo):
    as_user(ADMIN_A)
    async with client() as c:
        r = await c.get("/api/v1/voice-profile")
    assert r.status_code == 200 and "custom_pipeline_allowed" in r.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [ADMIN_A, USER_A])
async def test_superadmin_voice_profile_writes_rejected_for_non_superadmin(vrepo, user):
    as_user(user)
    base = "/api/v1/superadmin/voice-profiles/org_a"
    async with client() as c:
        rs = [
            await c.get(base),
            await c.put(base, json={"voice_engine": "custom"}),
            await c.post(base + "/verify"),
            await c.post(base + "/import-platform"),
            await c.delete(base + "/keys/engine"),
        ]
    assert [r.status_code for r in rs] == [403] * 5
    assert "org_a" not in vrepo.docs


def test_no_org_write_route_registered():
    methods = {m for r in vp.org_router.routes for m in r.methods}
    assert methods == {"GET"}


def test_engine_factory_ignores_the_agent_field():
    from app.models.voice_credentials import ResolvedVoiceProfile
    prof = lambda plan: ResolvedVoiceProfile(tts_engine="cartesia", engine_key="k", source="own", billed_to="org_own_key", voice_engine=plan)
    cfg = AgentConfiguration(name="x", voice_engine="custom")
    cfg.voice.provider, cfg.voice.voice = "cartesia", "a0e99841-438c-4a64-b679-ae501e7d6091"
    assert select_voice_engine(prof("managed"), cfg) == "managed"
    assert select_voice_engine(prof("custom"), cfg) == "custom"
    cfg.voice_engine = "managed"
    assert select_voice_engine(prof("custom"), cfg) == "custom"
