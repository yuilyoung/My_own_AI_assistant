import io
import json
import wave
from typing import Protocol

import httpx

from .config import Settings
from .contracts import Reply


class LLM(Protocol):
    async def reply(self, messages: list[dict]) -> Reply: ...


class TTS(Protocol):
    async def synthesize(self, text: str) -> bytes | None: ...


def validate_wav(data: bytes) -> None:
    if len(data) > 8_000_000:
        raise ValueError("Audio response too large")
    with wave.open(io.BytesIO(data)) as w:
        if (w.getnchannels() not in (1, 2) or w.getsampwidth() != 2
                or not 8000 <= w.getframerate() <= 48000
                or not 0 < w.getnframes() / w.getframerate() <= 60):
            raise ValueError("Expected bounded PCM16 WAV")
        expected = w.getnframes() * w.getnchannels() * w.getsampwidth()
        if len(w.readframes(w.getnframes())) != expected:
            raise ValueError("Truncated WAV")


class DemoLLM:
    async def reply(self, messages: list[dict]) -> Reply:
        return Reply.model_validate({"segments": [{
            "text": "연결 확인용 고정 응답입니다. 실제 AI 대화는 Ollama를 설정한 뒤 사용할 수 있어요.",
            "emotion": "happy", "gesture": "greeting",
        }]})


class SilentTTS:
    async def synthesize(self, text: str) -> None:
        return None


class OllamaLLM:
    def __init__(self, settings: Settings, transport=None):
        self.s = settings
        self.transport = transport

    async def reply(self, messages: list[dict]) -> Reply:
        async with httpx.AsyncClient(timeout=self.s.timeout, trust_env=False,
                                     follow_redirects=False, transport=self.transport) as c:
            info = await c.post(self.s.ollama_url + "/api/show", json={"model": self.s.model})
            info.raise_for_status()
            metadata = info.json()
            if metadata.get("remote_host") or metadata.get("remote_model"):
                raise ValueError("Cloud models are forbidden")
            async with c.stream("POST", self.s.ollama_url + "/api/chat", json={
                "model": self.s.model, "messages": messages, "stream": False, "think": False,
                "format": Reply.model_json_schema(),
                "options": {"temperature": 0.65, "num_predict": 512, "num_ctx": 4096},
            }) as r:
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


class MeloTTS:
    def __init__(self, settings: Settings, transport=None):
        self.s = settings
        self.transport = transport

    async def synthesize(self, text: str) -> bytes:
        async with httpx.AsyncClient(timeout=self.s.timeout, trust_env=False,
                                     follow_redirects=False, transport=self.transport) as c:
            async with c.stream("POST", self.s.melo_url + "/synthesize", json={"text": text},
                                headers={"Authorization": "Bearer " + self.s.melo_token}) as r:
                r.raise_for_status()
                body = bytearray()
                async for chunk in r.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > 8_000_000:
                        raise ValueError("Audio response too large")
        data = bytes(body)
        validate_wav(data)
        return data
