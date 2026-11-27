from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.api.v1.voice as voice_module
import app.core.dependencies as deps
from app.main import app

URL = "/api/v1/voice/preview-stream"


def _cfg(org="org_B"):
    return {"name": "P", "role": "Assistant", "objective": "Help", "greeting": "Hi", "organization_id": org}


class _Engine:
    is_ready = True

    def __init__(self, **cb):
        pass

    async def connect_and_configure(self, settings=None, greeting=None, timeout=10.0):
        return True

    async def send_keep_alive(self):
        pass

    async def close(self):
        pass


def _wire(monkeypatch, role="admin"):
    seen = []

    async def fake_build(org_id, **cb):
        seen.append(org_id)
        return _Engine()

    async def fake_auth(token):
        if token != "good":
            raise HTTPException(status_code=401, detail="bad")
        return {"id": "u1", "organization_id": "org_A", "email": "e@example.com", "role": role}

    monkeypatch.setattr(voice_module, "build_voice_client", fake_build)
    monkeypatch.setattr(deps, "authenticate_token", fake_auth)
    return seen


def _first(ws, wanted):
    for _ in range(12):
        m = ws.receive_json()
        if m.get("type") in wanted:
            return m
    raise AssertionError("not seen")


def test_preview_without_token_is_rejected_before_any_key_resolution(monkeypatch):
    seen = _wire(monkeypatch)
    with TestClient(app).websocket_connect(URL) as ws:
        ws.send_json({"type": "configure", "agent_config": _cfg()})
        m = _first(ws, {"error"})
    assert m["fatal"] is True and m["message"] == "Authentication required"
    assert seen == []


def test_preview_with_invalid_token_is_rejected(monkeypatch):
    seen = _wire(monkeypatch)
    with TestClient(app).websocket_connect(URL) as ws:
        ws.send_json({"type": "configure", "token": "nope", "agent_config": _cfg()})
        assert _first(ws, {"error"})["message"] == "Authentication required"
    assert seen == []


def test_preview_uses_org_from_token_not_payload(monkeypatch):
    seen = _wire(monkeypatch)
    with TestClient(app).websocket_connect(URL) as ws:
        ws.send_json({"type": "configure", "token": "good", "agent_config": _cfg("org_B")})
        _first(ws, {"ready"})
    assert seen == ["org_A"]


def test_superadmin_token_may_name_org(monkeypatch):
    seen = _wire(monkeypatch, role="superadmin")
    with TestClient(app).websocket_connect(URL) as ws:
        ws.send_json({"type": "configure", "token": "good", "agent_config": _cfg("org_B")})
        _first(ws, {"ready"})
    assert seen == ["org_B"]


def test_non_superadmin_never_falls_through_to_the_platform_root_org(monkeypatch):
    # A non-superadmin whose org id is the legacy placeholder keeps that org; only a superadmin may use the root org.
    seen = _wire(monkeypatch, role="admin")

    async def fake_auth(token):
        return {"id": "u1", "organization_id": "default", "email": "e@example.com", "role": "admin"}

    monkeypatch.setattr(deps, "authenticate_token", fake_auth)
    with TestClient(app).websocket_connect(URL) as ws:
        ws.send_json({"type": "configure", "token": "good", "agent_config": _cfg("default")})
        _first(ws, {"ready"})
    assert seen == ["default"]
