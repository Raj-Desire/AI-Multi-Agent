"""An Economy organization with no language model settings of its own may not make or take calls.

No silent fallback to Standard: the phone is never dialled / answered, and a stream that still arrives is hung up
before any greeting. The other Economy fallbacks (non-Cartesia voice, Python < 3.11) are unchanged.
"""
import asyncio
import re
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.v1 import voice as voice_api
from app.core.dependencies import TenantContext, get_tenant_context
from app.main import app
from app.models.campaign import (
    Campaign, CampaignCallingConfig, CampaignMember, CampaignMemberStatus, CampaignSchedule, CampaignStatus,
)
from app.models.voice_credentials import ResolvedVoiceProfile
from app.repositories.call_repository import CallRepository
from app.repositories.campaign_repository import CampaignMemberRepository, CampaignRepository
from app.services.call_service import CallService
from app.services.campaign_dialer import CampaignDialerEngine
from app.telephony import registry
from app.telephony.twilio_provider import TwilioProvider
from app.telephony.types import PlacedCall
from app.voice_stack import client_factory
from app.voice_stack.client_factory import (
    BLOCKED_MESSAGE, economy_blocked_reason, build_voice_client, engine_of, select_voice_engine,
)

LLM = dict(llm_endpoint="https://llm.example", llm_api_key="k-llm", llm_deployment="dep1")


def _profile(plan="custom", **over):
    base = dict(tts_engine="cartesia", engine_key="k", tts_key="t", source="own", billed_to="org_own_key",
                custom_pipeline_allowed=plan == "custom", voice_engine=plan)
    base.update(over)
    return ResolvedVoiceProfile(**base)


def _patch_profile(monkeypatch, profile):
    async def fake(org_id, **kw):
        return profile

    monkeypatch.setattr(client_factory, "resolve_voice_profile", fake)


# ---------------------------------------------------------------- helper table
@pytest.mark.parametrize("missing", ["llm_endpoint", "llm_api_key", "llm_deployment"])
def test_custom_with_any_missing_field_is_blocked(missing):
    vals = {**LLM, missing: None}
    assert economy_blocked_reason(_profile("custom", **vals)) == "model_setup_incomplete"
    vals[missing] = ""
    assert economy_blocked_reason(_profile("custom", **vals)) == "model_setup_incomplete"


def test_custom_with_nothing_is_blocked():
    assert economy_blocked_reason(_profile("custom")) == "model_setup_incomplete"


def test_custom_complete_is_not_blocked():
    assert economy_blocked_reason(_profile("custom", **LLM)) is None


def test_managed_is_never_blocked():
    assert economy_blocked_reason(_profile("managed")) is None
    assert economy_blocked_reason(_profile("managed", **LLM)) is None


def test_message_is_neutral():
    assert "setup incomplete" in BLOCKED_MESSAGE
    assert not re.search(r"deepgram|azure|openai|cartesia|twilio|plivo|desire", BLOCKED_MESSAGE, re.I)


# ---------------------------------------------------------------- other fallbacks unchanged
def test_non_cartesia_voice_still_falls_back_to_standard():
    cfg = SimpleNamespace(voice=SimpleNamespace(provider="deepgram", voice="aura-2-thalia-en"))
    assert select_voice_engine(_profile("custom", **LLM), cfg) == "managed"


def test_old_python_still_falls_back_to_standard(monkeypatch):
    monkeypatch.setattr(client_factory, "_python_supports_economy", lambda: False)
    c = asyncio.run(build_voice_client("o", profile=_profile("custom", **LLM), engine="custom"))
    assert engine_of(c) == "managed"


def test_complete_economy_still_builds_the_economy_client():
    c = asyncio.run(build_voice_client("o", profile=_profile("custom", **LLM), engine="custom"))
    assert engine_of(c) == "custom"


# ---------------------------------------------------------------- outbound: make_call (calls API + campaigns)
class FakeProvider(TwilioProvider):
    def __init__(self):
        self.name = "twilio"
        self.requests = []

    async def place_call(self, req):
        self.requests.append(req)
        return PlacedCall(call_id="CA1", status="queued")


@pytest.fixture
def env(monkeypatch):
    saved = []

    async def save(self, call):
        saved.append(call)
        return call

    monkeypatch.setattr(CallRepository, "save", save)
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://host.example")
    from app.voice import greeting_cache
    monkeypatch.setattr(greeting_cache.greeting_audio_cache, "prewarm", lambda *a, **k: None)
    from app.services.credit_service import credit_service

    async def allowed(org_id):
        return {"allowed": True}

    monkeypatch.setattr(credit_service, "check_call_authorization", allowed)
    fake = FakeProvider()
    monkeypatch.setattr(registry, "_PROVIDERS", {"twilio": fake})

    async def cfg(provider_name, org_id):
        return SimpleNamespace(id="cfg", phone_number="+14155550000", default_agent_id=None, public_base_url=None)

    monkeypatch.setattr(registry, "load_config_for", cfg)
    return SimpleNamespace(fake=fake, saved=saved)


def _ctx(org="org_bw"):
    return TenantContext(organization_id=org, user_id="u1", role="admin", email="a@example.com")


def test_make_call_refuses_and_dials_nothing_for_economy_without_model(env, monkeypatch):
    _patch_profile(monkeypatch, _profile("custom"))
    svc = CallService(twilio_repo=object(), call_repo=CallRepository())
    with pytest.raises(HTTPException) as err:
        asyncio.run(svc.make_call(_ctx(), to_number="+919800000001"))
    assert 400 <= err.value.status_code < 500 and err.value.detail == BLOCKED_MESSAGE
    assert env.fake.requests == [] and env.saved == []


@pytest.mark.parametrize("plan,extra", [("managed", {}), ("custom", LLM)])
def test_make_call_unaffected_for_standard_and_complete_economy(env, monkeypatch, plan, extra):
    _patch_profile(monkeypatch, _profile(plan, **extra))
    svc = CallService(twilio_repo=object(), call_repo=CallRepository())
    asyncio.run(svc.make_call(_ctx(), to_number="+919800000001"))
    assert len(env.fake.requests) == 1


# ---------------------------------------------------------------- outbound: agent dialer test-call API
@pytest.fixture
def api(env, monkeypatch):
    ctx = _ctx()
    app.dependency_overrides[get_tenant_context] = lambda: ctx

    async def routes_here(base_url):
        return True

    monkeypatch.setattr(voice_api, "_routes_to_this_server", routes_here)
    yield SimpleNamespace(client=TestClient(app), fake=env.fake)
    app.dependency_overrides.pop(get_tenant_context, None)


def test_test_call_refused_with_neutral_error_and_no_dial(api, monkeypatch):
    _patch_profile(monkeypatch, _profile("custom"))
    monkeypatch.setattr(voice_api, "resolve_voice_profile", client_factory.resolve_voice_profile)
    res = api.client.post("/api/v1/voice/test-call", json={"to_number": "+919800000009"})
    assert 400 <= res.status_code < 500, res.text
    assert BLOCKED_MESSAGE in res.text
    assert api.fake.requests == []


def test_test_call_standard_org_still_dials(api, monkeypatch):
    _patch_profile(monkeypatch, _profile("managed"))
    monkeypatch.setattr(voice_api, "resolve_voice_profile", client_factory.resolve_voice_profile)
    res = api.client.post("/api/v1/voice/test-call", json={"to_number": "+919800000009"})
    assert res.status_code == 200, res.text
    assert len(api.fake.requests) == 1


# ---------------------------------------------------------------- campaigns
def _campaign(org):
    return Campaign(
        id=f"cmp_{org}", organization_id=org, name="C", status=CampaignStatus.RUNNING,
        calling_config=CampaignCallingConfig(agent_id="agt_default", caller_phone_number="+14155550000", max_concurrent_calls=2),
        schedule=CampaignSchedule(calling_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                                  calling_start_time="00:00", calling_end_time="23:59", timezone="UTC"),
    )


def test_campaign_pauses_and_skips_dialling_without_burning_contacts(env, monkeypatch):
    _patch_profile(monkeypatch, _profile("custom"))
    org = "org_bw_camp"
    campaign = _campaign(org)
    member = CampaignMember(id="m_bw", campaign_id=campaign.id, organization_id=org, prospect_id="p1", prospect_name="P",
                            phone_number="+14155550001", normalized_phone="+14155550001", status=CampaignMemberStatus.QUEUED)

    async def go():
        await CampaignRepository().save(campaign)
        await CampaignMemberRepository().save(member)
        await CampaignDialerEngine().process_campaign(campaign)

    asyncio.run(go())
    assert env.fake.requests == []
    assert campaign.status == CampaignStatus.PAUSED
    stored = asyncio.run(CampaignMemberRepository().get_all_by_campaign(campaign.id))
    assert [m.status for m in stored] == [CampaignMemberStatus.QUEUED]  # contact not burnt


def test_campaign_endpoints_refuse_start_resume_dial_now(env, monkeypatch):
    _patch_profile(monkeypatch, _profile("custom"))
    app.dependency_overrides[get_tenant_context] = lambda: _ctx("org_bw_ep")
    try:
        c = TestClient(app)
        for path in ("start", "resume", "dial-now"):
            res = c.post(f"/api/v1/campaigns/cmp_x/{path}")
            assert 400 <= res.status_code < 500 and BLOCKED_MESSAGE in res.text, (path, res.status_code, res.text)
    finally:
        app.dependency_overrides.pop(get_tenant_context, None)


# ---------------------------------------------------------------- inbound
def test_twilio_inbound_ai_is_hung_up_without_speech_or_stream(monkeypatch):
    _patch_profile(monkeypatch, _profile("custom"))
    from app.repositories.twilio_repository import TwilioRepository
    svc = CallService(twilio_repo=TwilioRepository(), call_repo=CallRepository())
    cfg = SimpleNamespace(id="c1", organization_id="org_in", phone_number="+14155550000", inbound_agent_mapping={},
                          default_agent_id="agt_x", inbound_forward_mode="ai_agent", inbound_forward_global_number=None,
                          inbound_forward_mapping={}, public_base_url="https://h.example")

    async def get_by_org(org):
        return cfg

    async def get_agent(org, aid):
        from app.agents.configuration import get_default_receptionist_agent
        return get_default_receptionist_agent(organization_id=org)

    async def none(sid):
        return None

    async def save(call):
        return call

    async def by_phone(num):
        return cfg

    monkeypatch.setattr(svc.twilio_repo, "get_by_org", get_by_org)
    monkeypatch.setattr(svc.twilio_repo, "get_by_phone_number", by_phone)
    monkeypatch.setattr(svc.agent_repo, "get_by_id", get_agent)
    monkeypatch.setattr(svc.call_repo, "get_by_call_sid", none)
    monkeypatch.setattr(svc.call_repo, "save", save)
    xml = asyncio.run(svc.build_twiml_response(to="+14155550000", from_caller="+14155551111", called_number="+14155550000",
                                               call_sid="CA" + "d" * 32))
    assert "<Hangup" in xml and "<Say" not in xml and "<Stream" not in xml and "<Connect" not in xml


def test_plivo_inbound_ai_is_hung_up_without_speech_or_stream(monkeypatch):
    from app.repositories.plivo_repository import PlivoRepository
    monkeypatch.setenv("PLIVO_WEBHOOK_VERIFY", "off")
    _patch_profile(monkeypatch, _profile("custom"))
    cfg = SimpleNamespace(id="c1", organization_id="org_in_p", inbound_forward_mode="ai_agent", inbound_forward_mapping={},
                          inbound_forward_global_number=None, inbound_agent_mapping={}, default_agent_id="agt_x",
                          public_base_url="https://h.example")

    async def by_phone(self, number):
        return cfg

    monkeypatch.setattr(PlivoRepository, "get_by_phone_number", by_phone)
    res = TestClient(app).post("/api/v1/plivo/voice/answer", data={"To": "+14155550000", "From": "+14155551111", "CallUUID": "u1"})
    assert res.status_code == 200
    assert "<Hangup" in res.text and "<Speak" not in res.text and "<Stream" not in res.text


# ---------------------------------------------------------------- gateway safety net
def test_gateway_blocks_a_stream_for_economy_without_model(monkeypatch):
    from app.core.webhook_security import create_stream_token
    from app.voice import gateway
    call_session_service = gateway.call_session_service
    from app.voice.greeting_cache import greeting_audio_cache

    monkeypatch.setenv("VOICE_STREAM_AUTH", "enforce")
    built, played, finals, ended = [], [], [], []

    async def fake_profile(org_id, **kw):
        return _profile("custom")

    async def no_build(*a, **k):
        built.append(1)
        raise AssertionError("no client may be built")

    async def fake_final(session, final_status="completed"):
        finals.append((session.outcome, final_status))

    class Spy(TwilioProvider):
        def __init__(self):
            pass

        async def end_call(self, org_id, call_id):
            ended.append((org_id, call_id))
            return True

    async def fake_agent(ctx, agent_id):
        from app.agents.configuration import get_default_receptionist_agent
        return get_default_receptionist_agent(organization_id=ctx.organization_id)

    monkeypatch.setattr(gateway.agent_service, "get_agent_by_id", fake_agent)
    monkeypatch.setattr(gateway, "resolve_voice_profile", fake_profile)
    monkeypatch.setattr(gateway, "build_voice_client", no_build)
    monkeypatch.setattr(greeting_audio_cache, "get", lambda *a, **k: played.append(1))
    monkeypatch.setattr(call_session_service, "finalize_session", fake_final)
    monkeypatch.setitem(registry._PROVIDERS, "twilio", Spy())
    token = create_stream_token("org_gw", "agt_receptionist_default", "inbound")
    start = {"event": "start", "streamSid": "MZ1", "start": {"streamSid": "MZ1", "callSid": "CAgw1", "customParameters": {
        "organization_id": "org_gw", "agent_id": "agt_receptionist_default", "direction": "inbound", "stream_token": token}}}
    with TestClient(app).websocket_connect("/api/v1/voice/stream") as ws:
        ws.send_json({"event": "connected"})
        ws.send_json(start)
        try:
            ws.receive_text()
        except Exception:
            pass
    assert built == [] and played == []
    assert finals and finals[0][0] == "BLOCKED_MODEL_SETUP"
    assert ended == [("org_gw", "CAgw1")]
