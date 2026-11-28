import asyncio
import io
import json
import wave
from collections.abc import AsyncIterator
from typing import Protocol

import httpx
from pydantic import ValidationError

from .config import Settings
from .contracts import Reply, Segment, Voice
from .reply_stream import ReplyStream


class LLM(Protocol):
    async def reply(self, messages: list[dict]) -> Reply: ...


class TTS(Protocol):
    async def synthesize(self, text: str) -> bytes | None: ...


def validate_wav(data: bytes) -> None:
    if len(data) > 8_000_000:
        raise ValueError("Audio response too large")
    with wave.open(io.BytesIO(data)) as w:
        if (
            w.getnchannels() not in (1, 2)
            or w.getsampwidth() != 2
            or not 8000 <= w.getframerate() <= 48000
            or not 0 < w.getnframes() / w.getframerate() <= 60
        ):
            raise ValueError("Expected bounded PCM16 WAV")
        expected = w.getnframes() * w.getnchannels() * w.getsampwidth()
        if len(w.readframes(w.getnframes())) != expected:
            raise ValueError("Truncated WAV")


class DemoLLM:
    async def reply(self, messages: list[dict]) -> Reply:
        return Reply.model_validate(
            {
                "segments": [
                    {
                        "text": (
                            "연결 확인용 고정 응답입니다. Windows 앱은 기본 옵션으로 열면 "
                            "Claude 구독으로 대화할 수 있어요. 웹에서는 설정된 로컬 Ollama "
                            "또는 클라우드 API를 선택해 주세요."
                        ),
                        "emotion": "happy",
                        "gesture": "greeting",
                    }
                ]
            }
        )


class SilentTTS:
    async def synthesize(self, text: str) -> None:
        return None


class OllamaLLM:
    def __init__(self, settings: Settings, transport=None):
        self.s = settings
        self.transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=self.s.timeout,
            trust_env=False,
            follow_redirects=False,
            transport=self.transport,
        )

    async def _check_local(self, client: httpx.AsyncClient) -> None:
        info = await client.post(self.s.ollama_url + "/api/show", json={"model": self.s.model})
        info.raise_for_status()
        metadata = info.json()
        if metadata.get("remote_host") or metadata.get("remote_model"):
            raise ValueError("Cloud models are forbidden")

    def _chat_body(self, messages: list[dict], stream: bool) -> dict:
        return {
            "model": self.s.model,
            "messages": messages,
            "stream": stream,
            "think": False,
            "format": Reply.model_json_schema(),
            "options": {"temperature": 0.65, "num_predict": 512, "num_ctx": 4096},
        }

    async def reply(self, messages: list[dict]) -> Reply:
        async with self._client() as c:
            await self._check_local(c)
            async with c.stream(
                "POST",
                self.s.ollama_url + "/api/chat",
                json=self._chat_body(messages, stream=False),
            ) as r:
                r.raise_for_status()
                body = bytearray()
                async for chunk in r.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > 128_000:
                        raise ValueError("Provider reply too large")
                payload = json.loads(body)
            if payload["message"].get("tool_calls"):
                raise ValueError("Tool calls are disabled")
            return Reply.model_validate_json(payload["message"]["content"])

    async def stream_segments(self, messages: list[dict]) -> AsyncIterator[Segment]:
        """Read local Ollama NDJSON and yield each complete structured segment."""
        parser = ReplyStream()
        done = False

        def consume(line: bytes) -> list[Segment]:
            nonlocal done
            if not line.strip():
                return []
            if done:
                raise ValueError("Data after terminal Ollama frame")
            payload = json.loads(line)
            if not isinstance(payload, dict) or payload.get("error"):
                raise ValueError("Invalid Ollama stream frame")
            message = payload.get("message")
            terminal = payload.get("done")
            if (
                not isinstance(message, dict)
                or message.get("role") != "assistant"
                or message.get("tool_calls")
                or message.get("function_call")
                or not isinstance(message.get("content"), str)
                or not isinstance(terminal, bool)
            ):
                raise ValueError("Invalid or unsupported Ollama stream message")
            if terminal and payload.get("done_reason") != "stop":
                raise ValueError("Incomplete Ollama reply")
            done = terminal
            return parser.feed(message["content"])

        async with self._client() as client:
            await self._check_local(client)
            async with client.stream(
                "POST",
                self.s.ollama_url + "/api/chat",
                json=self._chat_body(messages, stream=True),
            ) as response:
                response.raise_for_status()
                pending = bytearray()
                received = 0
                async for chunk in response.aiter_bytes():
                    received += len(chunk)
                    if received > 128_000:
                        raise ValueError("Provider reply too large")
                    pending.extend(chunk)
                    while (end := pending.find(b"\n")) >= 0:
                        line = bytes(pending[:end])
                        del pending[: end + 1]
                        for segment in consume(line):
                            yield segment
                if pending:
                    for segment in consume(bytes(pending)):
                        yield segment
        if not done:
            raise ValueError("Missing terminal Ollama frame")
        for segment in parser.finish():
            yield segment


class CloudLLM:
    """Explicit server-side OpenAI-compatible chat, with no retries or fallback."""

    def __init__(self, settings: Settings, transport=None):
        self.s = settings
        self.transport = transport

    async def reply(self, messages: list[dict]) -> Reply:
        if not self.s.cloud_configured:
            raise ValueError("Cloud requires CLOUD_API_KEY and CLOUD_MODEL")
        schema = Reply.model_json_schema()
        # Strict structured-output APIs require every property to be required,
        # including the segment fields whose local validation supplies defaults.
        for definition in [schema, *schema.get("$defs", {}).values()]:
            if definition.get("type") == "object":
                definition["required"] = list(definition["properties"])
                for prop in definition["properties"].values():
                    prop.pop("default", None)
        try:
            async with httpx.AsyncClient(
                timeout=self.s.timeout,
                trust_env=True,
                follow_redirects=False,
                transport=self.transport,
            ) as client:
                async with client.stream(
                    "POST",
                    self.s.cloud_base_url + "/chat/completions",
                    headers={"Authorization": "Bearer " + self.s.cloud_api_key},
                    json={
                        "model": self.s.cloud_model,
                        "messages": messages,
                        "stream": False,
                        "max_completion_tokens": 4096,
                        "response_format": {
                            "type": "json_schema",
                            "json_schema": {"name": "reply", "strict": True, "schema": schema},
                        },
                    },
                ) as response:
                    response.raise_for_status()
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > 128_000:
                            raise ValueError("Cloud provider reply too large")
            payload = json.loads(body)
            choices = payload["choices"]
            if not isinstance(choices, list) or len(choices) != 1:
                raise ValueError("Cloud requires one completion")
            choice = choices[0]
            message = choice["message"]
            if (
                choice.get("finish_reason") != "stop"
                or message.get("role") != "assistant"
                or message.get("tool_calls")
                or message.get("function_call")
                or message.get("refusal")
                or not isinstance(message.get("content"), str)
            ):
                raise ValueError("Cloud completion is incomplete or unsupported")
            return Reply.model_validate_json(message["content"], strict=True)
        except httpx.HTTPError:
            raise ValueError("Cloud provider request failed") from None
        except (KeyError, TypeError, AttributeError, json.JSONDecodeError, ValidationError):
            raise ValueError("Cloud provider returned an invalid completion") from None


class WorkerTTS:
    def __init__(self, settings: Settings, transport=None):
        self.s = settings
        self.transport = transport

    async def _request(self, url: str, token: str, payload: dict) -> bytes:
        async with httpx.AsyncClient(
            timeout=self.s.timeout,
            trust_env=False,
            follow_redirects=False,
            transport=self.transport,
        ) as c:
            async with c.stream(
                "POST",
                url + "/synthesize",
                json=payload,
                headers={"Authorization": "Bearer " + token},
            ) as r:
                r.raise_for_status()
                body = bytearray()
                async for chunk in r.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > 8_000_000:
                        raise ValueError("Audio response too large")
        data = bytes(body)
        validate_wav(data)
        return data


class MeloTTS(WorkerTTS):
    async def synthesize(self, text: str) -> bytes:
        return await self._request(self.s.melo_url, self.s.melo_token, {"text": text})


class SupertonicTTS(WorkerTTS):
    async def synthesize(self, text: str) -> bytes:
        return await self.synthesize_voice(text, "seorin")

    async def synthesize_voice(self, text: str, voice: Voice) -> bytes:
        # A cancelled HTTP turn can leave the CPU finishing its last utterance.
        # 429 is emitted before the worker starts this synthesis.
        async with asyncio.timeout(self.s.timeout):
            while True:
                try:
                    return await self._request(
                        self.s.supertonic_url,
                        self.s.supertonic_token,
                        {"text": text, "voice": voice},
                    )
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code != 429:
                        raise
                    await asyncio.sleep(0.5)
