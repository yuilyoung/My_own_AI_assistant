import asyncio
import io
import json
import wave
from contextlib import aclosing

import httpx
import pytest
from gateway.config import Settings
from gateway.contracts import SessionCreate
from gateway.engine import Engine
from gateway.providers import OllamaLLM
from gateway.reply_stream import ReplyStream
from gateway.store import Store
from pydantic import ValidationError


def frame(content="", *, done=False, reason="stop", **message):
    payload = {
        "message": {"role": "assistant", "content": content, **message},
        "done": done,
    }
    if done:
        payload["done_reason"] = reason
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode()


def test_structured_reply_stream_preserves_partial_korean_and_escapes():
    parser = ReplyStream()
    assert parser.feed('{"segments":[{"text":"안녕') == []
    assert parser.feed('하세요. \\"반갑습니다.\\""}') == []
    first = parser.feed(',{"text":"두')
    assert [s.text for s in first] == ['안녕하세요. "반갑습니다."']
    second = parser.feed(' 번째","emotion":"happy"}]}')
    assert [s.text for s in second] == ["두 번째"]
    assert second[0].emotion == "happy"
    assert parser.finish() == []


@pytest.mark.parametrize(
    "source",
    [
        '{"segments":[]}',
        '{"segments":[{"text":"안녕"},]}',
        '{"segments":[{"text":"안녕"}],"unexpected":true}',
        '{"segments":[{"text":"안녕"}],"segments":[{"text":"다른 응답"}]}',
        '{"segments":[{"text":"안녕","gesture":"invalid"}]}',
        '{"segments":[{"text":"안녕","text":"다른 응답"}]}',
        '{"segments":[{"text":"안녕"}]',
    ],
)
def test_stream_rejects_invalid_final_reply(source):
    parser = ReplyStream()
    with pytest.raises((ValueError, ValidationError)):
        parser.feed(source)
        parser.finish()


def test_stream_limits_reply_size():
    parser = ReplyStream()
    with pytest.raises(ValueError, match="too large"):
        parser.feed("x" * 128_001)


class GatedStream(httpx.AsyncByteStream):
    def __init__(self, reason="stop"):
        self.release = asyncio.Event()
        self.waiting = asyncio.Event()
        self.closed = False
        self.reason = reason

    async def __aiter__(self):
        first = frame('{"segments":[{"text":"안녕"} ,', thinking="hidden")
        cut = first.index("안".encode()) + 1
        yield first[:cut]
        yield first[cut:]
        self.waiting.set()
        await self.release.wait()
        yield frame('{"text":"반가워요","emotion":"happy"}]}')
        yield frame(done=True, reason=self.reason)

    async def aclose(self):
        self.closed = True


async def test_ollama_yields_valid_segment_before_terminal_frame():
    body_stream = GatedStream()
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/api/show":
            return httpx.Response(200, json={})
        payload = json.loads(request.content)
        assert payload["stream"] is True
        assert payload["think"] is False
        assert payload["format"]["additionalProperties"] is False
        return httpx.Response(200, stream=body_stream)

    llm = OllamaLLM(Settings(), httpx.MockTransport(handler))
    async with aclosing(llm.stream_segments([])) as stream:
        first = await asyncio.wait_for(anext(stream), 2)
        assert first.text == "안녕"
        assert not body_stream.release.is_set()
        body_stream.release.set()
        rest = [segment async for segment in stream]
    assert [s.text for s in rest] == ["반가워요"]
    assert rest[0].emotion == "happy"
    assert body_stream.closed
    assert len(requests) == 2


async def test_ollama_closes_stream_on_early_consumer_exit():
    body_stream = GatedStream()

    def handler(request):
        if request.url.path == "/api/show":
            return httpx.Response(200, json={})
        return httpx.Response(200, stream=body_stream)

    llm = OllamaLLM(Settings(), httpx.MockTransport(handler))
    async with aclosing(llm.stream_segments([])) as stream:
        assert (await asyncio.wait_for(anext(stream), 2)).text == "안녕"
    assert body_stream.closed


@pytest.mark.parametrize(
    "tail",
    [
        b"",
        frame(done=True, reason="length"),
        frame(done=True, tool_calls=[{"function": {"name": "unexpected"}}]),
        frame(done=True) + frame("unexpected"),
    ],
)
async def test_ollama_rejects_missing_or_invalid_terminal_frame(tail):
    def handler(request):
        if request.url.path == "/api/show":
            return httpx.Response(200, json={})
        return httpx.Response(200, content=frame('{"segments":[{"text":"안녕"}]}') + tail)

    llm = OllamaLLM(Settings(), httpx.MockTransport(handler))
    with pytest.raises(ValueError):
        async for _ in llm.stream_segments([]):
            pass


async def test_ollama_stream_rejects_remote_model_before_chat():
    def handler(request):
        assert request.url.path == "/api/show"
        return httpx.Response(200, json={"remote_model": "cloud"})

    llm = OllamaLLM(Settings(), httpx.MockTransport(handler))
    with pytest.raises(ValueError, match="Cloud models"):
        async for _ in llm.stream_segments([]):
            pass


class RecordingTTS:
    def __init__(self):
        self.texts = []

    async def synthesize(self, text):
        self.texts.append(text)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16_000)
            wav.writeframes(b"\0" * 640)
        return buf.getvalue()


@pytest.mark.parametrize("outcome", ["complete", "cancel", "invalid"])
async def test_engine_synthesizes_before_llm_finishes_and_only_saves_complete_reply(
    tmp_path, outcome
):
    body_stream = GatedStream(reason="length" if outcome == "invalid" else "stop")
    tts = RecordingTTS()

    def handler(request):
        if request.url.path == "/api/show":
            return httpx.Response(200, json={})
        return httpx.Response(200, stream=body_stream)

    store = Store(tmp_path / "voice.sqlite")
    llm = OllamaLLM(Settings(), httpx.MockTransport(handler))
    engine = Engine(store, llm, tts, timeout=5)
    try:
        sid = store.create_session(SessionCreate(mode="assistant"))["id"]
        other = store.create_session(SessionCreate(mode="companion"))["id"]
        tid = engine.start(sid, "안녕하세요")["id"]
        task = engine.turns[tid].task
        await asyncio.wait_for(body_stream.waiting.wait(), 2)
        snapshot = engine.snapshot(sid, tid)
        assert snapshot["status"] == "synthesizing"
        assert tts.texts == ["안녕"]
        aid = snapshot["segments"][0]["audio_id"]
        assert engine.get_audio(sid, aid).startswith(b"RIFF")
        with pytest.raises(KeyError):
            engine.get_audio(other, aid)
        assert store.history(sid) == []
        if outcome == "cancel":
            engine.cancel(sid, tid)
        else:
            body_stream.release.set()
        await asyncio.wait_for(task, 2)
        assert body_stream.closed
        final = engine.snapshot(sid, tid)
        if outcome == "complete":
            assert final["status"] == "completed"
            assert [s["text"] for s in final["segments"]] == ["안녕", "반가워요"]
            assert len(store.history(sid)) == 2
        elif outcome == "cancel":
            assert final["status"] == "cancelled"
            assert final["segments"] == []
            with pytest.raises(KeyError):
                engine.get_audio(sid, aid)
            assert store.history(sid) == []
        else:
            assert final["status"] == "error"
            assert store.history(sid) == []
        assert store.history(other) == []
    finally:
        await engine.close()
        store.close()
