import io
import json
import wave

import httpx
import pytest
from pydantic import ValidationError

from gateway.config import Settings
from gateway.providers import MeloTTS, OllamaLLM, validate_wav


def wav_bytes(channels=1, width=2, rate=22050):
    buf=io.BytesIO()
    with wave.open(buf,"wb") as w:
        w.setnchannels(channels);w.setsampwidth(width);w.setframerate(rate);w.writeframes(b"\0"*(rate*channels*width//10))
    return buf.getvalue()


def test_valid_and_truncated_wav():
    validate_wav(wav_bytes())
    with pytest.raises(ValueError):validate_wav(wav_bytes()[:-10])

@pytest.mark.parametrize("args", [{"channels":3},{"width":1},{"rate":96000}])
def test_invalid_audio_contract(args):
    with pytest.raises(ValueError):validate_wav(wav_bytes(**args))

async def test_ollama_structured_request_and_no_thinking_output():
    calls=[]
    def handler(request):
        calls.append(request)
        if request.url.path=="/api/show":return httpx.Response(200,json={"details":{}})
        body=json.loads(request.content)
        assert body["think"] is False and body["stream"] is False
        assert body["format"]["additionalProperties"] is False
        return httpx.Response(200,json={"message":{"content":json.dumps({"segments":[{"text":"안녕"}]}),"thinking":"hidden"}})
    reply=await OllamaLLM(Settings(),httpx.MockTransport(handler)).reply([])
    assert reply.segments[0].text=="안녕"
    assert len(calls)==2

async def test_cloud_model_rejected_before_chat():
    def handler(request):
        assert request.url.path=="/api/show"
        return httpx.Response(200,json={"remote_host":"https://ollama.com"})
    with pytest.raises(ValueError):await OllamaLLM(Settings(),httpx.MockTransport(handler)).reply([])

async def test_provider_redirect_is_not_followed():
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(302,headers={"Location":"https://outside.example"})
    with pytest.raises(httpx.HTTPStatusError):await OllamaLLM(Settings(),httpx.MockTransport(handler)).reply([])
    assert len(calls)==1

async def test_invalid_provider_payload_fails_closed():
    def handler(request):
        if request.url.path=="/api/show":return httpx.Response(200,json={})
        return httpx.Response(200,json={"message":{"content":'{"segments":[{"text":"hi","gesture":"shell"}]}'}})
    with pytest.raises(ValidationError):await OllamaLLM(Settings(),httpx.MockTransport(handler)).reply([])

async def test_melo_http_and_auth():
    secret="worker-token-with-at-least-thirty-two-characters"
    def handler(request):
        assert request.headers["authorization"]=="Bearer "+secret
        assert json.loads(request.content)=={"text":"안녕하세요"}
        return httpx.Response(200,content=wav_bytes(),headers={"Content-Type":"audio/wav"})
    s=Settings(tts="melo",melo_token=secret)
    assert await MeloTTS(s,httpx.MockTransport(handler)).synthesize("안녕하세요")==wav_bytes()
