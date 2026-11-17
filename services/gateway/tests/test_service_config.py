from dataclasses import replace

import pytest
from gateway.config import Settings
from gateway.contracts import SessionCreate
from pydantic import ValidationError


def test_cloud_env_is_explicit_and_key_is_not_in_repr(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "cloud")
    monkeypatch.setenv("CLOUD_API_KEY", "test-server-secret")
    monkeypatch.setenv("CLOUD_MODEL", "configured-model")
    monkeypatch.setenv("CLOUD_BASE_URL", "https://provider.example/custom/v1/")
    settings = Settings.from_env()
    assert settings.llm == "cloud"
    assert settings.cloud_api_key == "test-server-secret"
    assert settings.cloud_model == "configured-model"
    assert settings.cloud_base_url == "https://provider.example/custom/v1"
    assert "test-server-secret" not in repr(settings)
    assert settings.local_llm_enabled is False


def test_cloud_has_no_assumed_model_or_key():
    settings = Settings(llm="cloud")
    assert settings.cloud_model == ""
    assert settings.cloud_api_key == ""
    assert settings.cloud_base_url == "https://api.openai.com/v1"


@pytest.mark.parametrize(
    ("provider", "env_value", "expected"),
    [
        ("demo", None, False),
        ("ollama", None, True),
        ("cloud", None, False),
        ("demo", "true", True),
        ("ollama", "false", False),
        ("demo", "1", True),
        ("ollama", "0", False),
    ],
)
def test_local_opt_in_is_independent_of_default(monkeypatch, provider, env_value, expected):
    monkeypatch.setenv("LLM_PROVIDER", provider)
    monkeypatch.delenv("LOCAL_LLM_ENABLED", raising=False)
    if env_value is not None:
        monkeypatch.setenv("LOCAL_LLM_ENABLED", env_value)
    assert Settings.from_env().local_llm_enabled is expected


def test_local_opt_in_rejects_ambiguous_values(monkeypatch):
    monkeypatch.setenv("LOCAL_LLM_ENABLED", "sometimes")
    with pytest.raises(ValueError, match="LOCAL_LLM_ENABLED"):
        Settings.from_env()
    with pytest.raises(ValueError, match="local_llm_enabled"):
        Settings(local_llm_enabled="false")


@pytest.mark.parametrize(
    "url",
    [
        "http://provider.example/v1",
        "https://user:secret@provider.example/v1",
        "https://provider.example/v1?key=secret",
        "https://provider.example/v1#fragment",
        "file:///tmp/v1",
        "https:///v1",
        "https://provider.example:bad/v1",
        "https://provider.example:65536/v1",
        "https://provider.example:0/v1",
        "https://[bad/v1",
        "https://provider example/v1",
    ],
)
def test_cloud_endpoint_rejects_credentials_and_unsafe_urls(url):
    with pytest.raises(ValueError, match="Cloud"):
        Settings(cloud_base_url=url)


def test_avatar_directory_is_optional_and_must_exist(tmp_path, monkeypatch):
    assert Settings().avatar_dir is None
    monkeypatch.setenv("ASSISTANT_AVATAR_DIR", str(tmp_path))
    settings = Settings.from_env()
    assert settings.avatar_dir == tmp_path
    with pytest.raises(ValueError, match="AVATAR"):
        replace(settings, avatar_dir=tmp_path / "missing")
    file = tmp_path / "file"
    file.touch()
    with pytest.raises(ValueError, match="AVATAR"):
        replace(settings, avatar_dir=file)


def test_session_service_is_optional_and_closed():
    assert SessionCreate(mode="assistant").service is None
    for service in ("demo", "local", "cloud"):
        assert SessionCreate(mode="assistant", service=service).service == service
    with pytest.raises(ValidationError):
        SessionCreate(mode="assistant", service="remote")


def test_readiness_cloud_option_checks_configuration_without_inference(monkeypatch, capsys):
    from gateway import readiness_cli

    monkeypatch.setenv("CLOUD_API_KEY", "private-test-key")
    monkeypatch.setenv("CLOUD_MODEL", "configured-model")
    monkeypatch.delenv("LOCAL_LLM_ENABLED", raising=False)
    captured = []

    def inspect(settings, client, repository):
        captured.append(settings)
        return []

    monkeypatch.setattr(readiness_cli, "inspect_local_readiness", inspect)
    assert readiness_cli.main(["--provider", "cloud", "--json"]) == 0
    assert captured[0].llm == "cloud"
    assert captured[0].local_llm_enabled is False
    assert "private-test-key" not in capsys.readouterr().out
