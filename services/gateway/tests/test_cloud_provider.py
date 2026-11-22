import json

import httpx
import pytest
from gateway.config import Settings


def provider(transport, **kwargs):
    from gateway.providers import CloudLLM

    settings = Settings(
        cloud_api_key="server-secret", cloud_model="configured-model", timeout=3, **kwargs
    )
    return CloudLLM(settings, httpx.MockTransport(transport))


def completion(content=None, **message):
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1,
        "model": "configured-model",
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": content
                    or json.dumps(
                        {"segments": [{"text": "안녕", "emotion": "happy", "gesture": "nod"}]}
                    ),
                    **message,
                },
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
    }


async def test_cloud_sends_authenticated_nonstreaming_strict_reply_schema():
    messages = [{"role": "user", "content": "hello"}]
    segment = {"text": "이 부분을 볼까요?", "emotion": "thoughtful", "gesture": "point"}

    def handler(request):
        assert str(request.url) == "https://provider.example/custom/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer server-secret"
        assert request.extensions["timeout"] == {"connect": 3, "read": 3, "write": 3, "pool": 3}
        body = json.loads(request.content)
        assert body["model"] == "configured-model"
        assert body["messages"] == messages
        assert body["stream"] is False
        assert body["max_completion_tokens"] == 4096
        assert "max_tokens" not in body
        assert "temperature" not in body
        response_format = body["response_format"]
        assert response_format["type"] == "json_schema"
        schema = response_format["json_schema"]
        assert schema["strict"] is True
        assert schema["schema"]["additionalProperties"] is False
        assert set(schema["schema"]["$defs"]["Segment"]["required"]) == {
            "text",
            "emotion",
            "gesture",
        }
        assert all(
            "default" not in value
            for value in schema["schema"]["$defs"]["Segment"]["properties"].values()
        )
        fields = schema["schema"]["$defs"]["Segment"]["properties"]
        assert "thoughtful" in fields["emotion"]["enum"]
        assert "point" in fields["gesture"]["enum"]
        return httpx.Response(200, json=completion(json.dumps({"segments": [segment]})))

    result = await provider(handler, cloud_base_url="https://provider.example/custom/v1/").reply(
        messages
    )
    assert result.segments[0].model_dump() == segment


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"choices": []},
        {"choices": "invalid"},
        {"choices": [None]},
        completion('{"segments": []}'),
        completion('{"segments": [{"text": "hi", "gesture": "shell"}]}'),
        completion('{"segments": [{"text": 10}]}'),
        completion('{"segments": [{"text": "hi"}], "tool": "shell"}'),
        completion("```json\n{}\n```"),
        completion(
            tool_calls=[
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "shell", "arguments": "{}"},
                }
            ]
        ),
        completion(function_call={"name": "shell", "arguments": "{}"}),
        completion(refusal="Refused"),
    ],
    ids=[
        "missing-choices",
        "empty-choices",
        "invalid-choices",
        "null-choice",
        "empty-segments",
        "invalid-gesture",
        "invalid-text",
        "extra-field",
        "code-fence",
        "tool-calls",
        "function-call",
        "refusal",
    ],
)
async def test_cloud_rejects_malformed_or_unsafe_reply(payload):
    with pytest.raises(ValueError):
        await provider(lambda _: httpx.Response(200, json=payload)).reply([])


@pytest.mark.parametrize("finish_reason", ["length", "content_filter", "tool_calls", None])
async def test_cloud_rejects_incomplete_completions(finish_reason):
    payload = completion()
    payload["choices"][0]["finish_reason"] = finish_reason
    with pytest.raises(ValueError):
        await provider(lambda _: httpx.Response(200, json=payload)).reply([])


@pytest.mark.parametrize("status", [302, 401, 429, 500])
async def test_cloud_errors_do_not_redirect_retry_or_expose_provider_body(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            status,
            text="server-secret private upstream details",
            headers={"location": "https://other.example"},
        )

    with pytest.raises(ValueError) as error:
        await provider(handler).reply([])
    assert "server-secret" not in str(error.value)
    assert len(calls) == 1


async def test_cloud_timeout_is_an_explicit_failure():
    def handler(request):
        raise httpx.ReadTimeout("server-secret", request=request)

    with pytest.raises(ValueError, match="Cloud") as error:
        await provider(handler).reply([])
    assert "server-secret" not in str(error.value)


async def test_cloud_uses_environment_proxy_and_ca_configuration(monkeypatch):
    from gateway.providers import CloudLLM

    real_client = httpx.AsyncClient
    configurations = []

    def configured_client(**kwargs):
        configurations.append(kwargs.get("trust_env", True))
        return real_client(**kwargs)

    monkeypatch.setattr("gateway.providers.httpx.AsyncClient", configured_client)
    result = await CloudLLM(
        Settings(cloud_api_key="key", cloud_model="chosen-model"),
        httpx.MockTransport(lambda _: httpx.Response(200, json=completion())),
    ).reply([])
    assert result.segments[0].text == "안녕"
    assert configurations == [True]


async def test_cloud_invalid_schema_errors_do_not_expose_provider_content():
    content = '{"segments":[{"text":"private upstream text","gesture":"server-secret"}]}'
    with pytest.raises(ValueError) as error:
        await provider(lambda _: httpx.Response(200, json=completion(content))).reply([])
    assert "server-secret" not in str(error.value)
    assert "private upstream text" not in str(error.value)


async def test_cloud_bounds_streamed_response_before_reading_the_rest():
    reads = []

    class Oversize(httpx.AsyncByteStream):
        async def __aiter__(self):
            for _ in range(20):
                reads.append(1)
                yield b"x" * 32_000

    with pytest.raises(ValueError, match="large"):
        await provider(lambda _: httpx.Response(200, stream=Oversize())).reply([])
    assert len(reads) <= 5


@pytest.mark.parametrize("kwargs", [{}, {"cloud_api_key": "key"}, {"cloud_model": "model"}])
async def test_cloud_requires_both_key_and_model_before_network(kwargs):
    from gateway.providers import CloudLLM

    def no_network(request):
        pytest.fail("Missing cloud configuration must never make a request")

    with pytest.raises(ValueError, match="CLOUD_API_KEY.*CLOUD_MODEL"):
        await CloudLLM(Settings(**kwargs), httpx.MockTransport(no_network)).reply([])
