import pytest
from gateway.config import Settings
from gateway.contracts import Reply, SessionCreate, TurnInput
from gateway.policy import require_assistant, scope_for
from pydantic import ValidationError


def test_valid_korean_reply():
    assert (
        Reply.model_validate({"segments": [{"text": "안녕하세요."}]}).segments[0].emotion
        == "neutral"
    )


@pytest.mark.parametrize(
    "data",
    [
        {"segments": []},
        {"segments": [{"text": ""}]},
        {"segments": [{"text": "hello", "gesture": "run_shell"}]},
        {"segments": [{"text": "hello", "emotion": "execute"}]},
        {"segments": [{"text": "hi"}], "tool": "shell"},
    ],
)
def test_invalid_response_is_rejected(data):
    with pytest.raises(ValidationError):
        Reply.model_validate(data)


@pytest.mark.parametrize("text", ["", "   ", "x" * 2001])
def test_blank_and_overlong_turns_rejected(text):
    with pytest.raises(ValidationError):
        TurnInput(text=text)


def test_immutable_scope_derived_from_server_mode():
    assert scope_for(SessionCreate(mode="assistant")) == "assistant"
    assert scope_for(SessionCreate(mode="companion")) == "companion:default"
    with pytest.raises(PermissionError):
        require_assistant("companion")


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "http://127.0.0.1.evil.com",
        "http://localhost",
        "http://user@127.0.0.1:123",
        "http://127.0.0.1:123/a",
    ],
)
def test_provider_endpoint_is_literal_loopback_only(url):
    with pytest.raises(ValueError):
        Settings(ollama_url=url)


def test_valid_settings():
    assert Settings().ollama_url == "http://127.0.0.1:11434"
    with pytest.raises(ValueError):
        Settings(model="qwen3:cloud")
