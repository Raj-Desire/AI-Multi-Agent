"""Streaming chat-completions client with function calling (Azure OpenAI).

Vendor details stay in this module; log and error text is vendor-neutral and
never contains the key or the endpoint query string.
"""
import asyncio
import json
import logging
from dataclasses import dataclass
from typing import AsyncIterator, Dict, List, Optional, Union

import httpx

logger = logging.getLogger(__name__)

_READ_TIMEOUT_S = 120.0  # overall gap allowed between chunks once streaming


class LlmTimeout(Exception):
    """No first token from the language model within the allowed time."""


class LlmUnavailable(Exception):
    """The language model service could not serve the request. status is the HTTP status when there was one."""

    def __init__(self, message: str = "", status: Optional[int] = None):
        super().__init__(message)
        self.status = status


@dataclass
class TextDelta:
    text: str


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class Finished:
    input_tokens: int
    output_tokens: int
    cached_tokens: int


def to_chat_tools(functions: List[dict]) -> List[dict]:
    return [{"type": "function", "function": f} for f in functions]


class AzureChatStream:
    def __init__(
        self,
        endpoint: str,
        api_key: str,
        *,
        deployment: str,
        api_version: str = "2024-08-01-preview",
        timeout_s: float = 8.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        self._endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._deployment = deployment
        self._api_version = api_version
        self._timeout_s = timeout_s
        self._transport = transport
        # One kept-alive HTTP client per call: a new client per request repeated the connection and
        # security handshake (about 0.2 s) before every reply.
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=self._timeout_s, read=_READ_TIMEOUT_S,
                    write=self._timeout_s, pool=self._timeout_s,
                ),
                transport=self._transport,
                limits=httpx.Limits(max_keepalive_connections=2, keepalive_expiry=60.0),
            )
        return self._client

    async def warm(self, messages: Optional[List[dict]] = None, tools: Optional[List[dict]] = None) -> None:
        """Gets ready for the first caller turn so that turn does not pay for it. Never raises.

        With a prompt: one tiny request (1 token) carrying the real system prompt and tools, so the provider's prompt
        cache already holds them when the caller first speaks (an uncached first request took about 1.5 s).
        Without: only opens the connection."""
        try:
            if messages:
                async for ev in self.stream(messages, tools or [], temperature=0.0, max_tokens=1):
                    if isinstance(ev, Finished):
                        logger.info("[Economy] language model warm-up tokens in=%d cached=%d",
                                    ev.input_tokens, ev.cached_tokens)
            else:
                await self._get_client().get(f"{self._endpoint}/", timeout=self._timeout_s)  # no key is sent
        except Exception:  # noqa: BLE001
            pass

    async def aclose(self) -> None:
        client, self._client = self._client, None
        if client is not None and not client.is_closed:
            try:
                await client.aclose()
            except Exception:  # noqa: BLE001
                pass

    async def stream(
        self,
        messages: List[dict],
        tools: List[dict],
        *,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[Union[TextDelta, ToolCall, Finished]]:
        url = (
            f"{self._endpoint}/openai/deployments/{self._deployment}"
            f"/chat/completions?api-version={self._api_version}"
        )
        body: dict = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            body["tools"] = tools

        client = self._get_client()
        calls: Dict[int, dict] = {}
        usage: dict = {}
        got_token = False

        deadline = asyncio.timeout(self._timeout_s)  # request start -> first token
        try:
            async with deadline:
                async with client.stream(
                    "POST", url, headers={"api-key": self._api_key}, json=body
                ) as resp:
                    if resp.status_code >= 400:
                        logger.warning("Language model request failed: status %s", resp.status_code)
                        raise LlmUnavailable(f"Language model unavailable (status {resp.status_code})", resp.status_code)
                    lines = resp.aiter_lines().__aiter__()
                    while True:
                        try:
                            line = await lines.__anext__()
                        except StopAsyncIteration:
                            break
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            data = json.loads(payload)
                        except ValueError:
                            continue
                        if not isinstance(data, dict):
                            continue
                        if data.get("usage"):
                            usage = data["usage"]
                        for choice in data.get("choices") or []:
                            delta = choice.get("delta") or {}
                            text = delta.get("content")
                            if text:
                                if not got_token:
                                    got_token = True
                                    deadline.reschedule(None)
                                yield TextDelta(text)
                            for tc in delta.get("tool_calls") or []:
                                if not got_token:
                                    got_token = True
                                    deadline.reschedule(None)
                                slot = calls.setdefault(
                                    tc.get("index", 0), {"id": "", "name": "", "args": ""})
                                if tc.get("id"):
                                    slot["id"] = tc["id"]
                                fn = tc.get("function") or {}
                                if fn.get("name"):
                                    slot["name"] = fn["name"]
                                if fn.get("arguments"):
                                    slot["args"] += fn["arguments"]
        except TimeoutError:
            raise LlmTimeout("Language model gave no response in time")
        except httpx.TimeoutException:
            raise LlmTimeout("Language model gave no response in time")
        except httpx.HTTPError:
            logger.warning("Language model connection error")
            raise LlmUnavailable("Language model unavailable")

        if not got_token and not calls and not usage:
            logger.warning("Language model returned an empty response")
            raise LlmUnavailable("Language model unavailable")
        for idx in sorted(calls):
            c = calls[idx]
            yield ToolCall(c["id"], c["name"], c["args"])
        details = usage.get("prompt_tokens_details") or {}
        yield Finished(
            int(usage.get("prompt_tokens") or 0),
            int(usage.get("completion_tokens") or 0),
            int(details.get("cached_tokens") or 0),
        )
