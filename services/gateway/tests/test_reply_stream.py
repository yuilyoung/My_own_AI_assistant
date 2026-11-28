import asyncio
import json
from contextlib import aclosing

import httpx
import pytest
from gateway.config import Settings
from gateway.providers import OllamaLLM
from gateway.reply_stream import ReplyStream
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
    def __init__(self):
        self.release = asyncio.Event()
        self.closed = False

    async def __aiter__(self):
        first = frame('{"segments":[{"text":"안녕"} ,', thinking="hidden")
        cut = first.index("안".encode()) + 1
        yield first[:cut]
        yield first[cut:]
        await self.release.wait()
        yield frame('{"text":"반가워요","emotion":"happy"}]}')
        yield frame(done=True)

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
