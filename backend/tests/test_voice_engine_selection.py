import logging

import pytest

from app.agents.configuration import AgentConfiguration
from app.models.voice_credentials import ResolvedVoiceProfile
from app.providers.deepgram.voice_agent import DeepgramVoiceAgentClient
from app.voice_stack.client_factory import build_voice_client
from app.voice_stack.protocol import VoiceClientProtocol


def _profile(allowed=False, llm=False):
    # llm=True: the organization has its own language model settings (the Economy gate no longer reads the environment)
    extra = dict(llm_endpoint="https://org.example", llm_api_key="org-llm-key", llm_deployment="org-dep") if llm else {}
    return ResolvedVoiceProfile(
        tts_engine="aura", engine_key="k", tts_key="t", source="platform",
        billed_to="platform", custom_pipeline_allowed=allowed, **extra,
    )


def test_default_engine_is_managed():
    assert AgentConfiguration().voice_engine == "managed"


@pytest.mark.asyncio
async def test_managed_returns_standard_client():
    c = await build_voice_client("o", profile=_profile(), engine="managed")
    assert isinstance(c, DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_custom_without_azure_falls_back_with_one_warning(monkeypatch, caplog):
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_KEY", raising=False)
    with caplog.at_level(logging.WARNING):
        c = await build_voice_client("o", profile=_profile(True), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)
    assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 1


@pytest.mark.asyncio
async def test_custom_without_permission_falls_back(monkeypatch):
    c = await build_voice_client("o", profile=_profile(False, llm=True), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_custom_allowed_returns_pipeline_client(monkeypatch):
    c = await build_voice_client("o", profile=_profile(True, llm=True), engine="custom")
    assert type(c).__name__ == "PipelineVoiceClient"


def test_standard_client_satisfies_protocol():
    assert isinstance(DeepgramVoiceAgentClient(api_key="k"), VoiceClientProtocol)


# ---------------- final fix wave ----------------
@pytest.mark.asyncio
async def test_custom_with_only_env_key_alias_still_falls_back(monkeypatch):
    # replaced: the environment key alias no longer enables Economy; only the organization settings do
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x")
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("AZURE_OPENAI_KEY", "alias")
    c = await build_voice_client("o", profile=_profile(True), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)


@pytest.mark.asyncio
async def test_custom_with_no_key_at_all_falls_back(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x")
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_KEY", raising=False)
    c = await build_voice_client("o", profile=_profile(True), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)


def test_llm_key_helper_precedence(monkeypatch):
    from app.voice_stack.llm_env import resolve_llm_key
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_KEY", raising=False)
    assert resolve_llm_key() is None
    monkeypatch.setenv("AZURE_OPENAI_KEY", "alias")
    assert resolve_llm_key() == "alias"
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "primary")
    assert resolve_llm_key() == "primary"
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "")
    assert resolve_llm_key() == "alias"


@pytest.mark.asyncio
async def test_old_python_falls_back_to_standard(monkeypatch, caplog):
    from app.voice_stack import client_factory as cf
    from app.voice_stack.client_factory import engine_of
    monkeypatch.setattr(cf, "_python_supports_economy", lambda: False)
    with caplog.at_level(logging.WARNING):
        c = await build_voice_client("o", profile=_profile(True, llm=True), engine="custom")
    assert isinstance(c, DeepgramVoiceAgentClient)
    assert engine_of(c) == "managed"
    warns = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warns) == 1 and "Python" in warns[0]
    for v in ("deepgram", "cartesia", "openai", "azure"):
        assert v not in warns[0].lower()


def test_python_support_helper_reads_version_at_call_time(monkeypatch):
    import sys
    from app.voice_stack import client_factory as cf
    monkeypatch.setattr(sys, "version_info", (3, 10, 9))
    assert cf._python_supports_economy() is False
    monkeypatch.setattr(sys, "version_info", (3, 11, 0))
    assert cf._python_supports_economy() is True
