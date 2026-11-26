import json
from pathlib import Path

import httpx
import pytest
from gateway.config import Settings
from gateway.readiness import inspect_local_readiness


def status_map(checks):
    return {check.component: check.status for check in checks}


def test_demo_is_explicitly_skipped_and_missing_react_is_not_passed(tmp_path: Path):
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500))) as client:
        checks = inspect_local_readiness(Settings(), client, tmp_path)
    result = status_map(checks)
    assert result["React"] == "FAIL"
    assert result["Ollama"] == "SKIP"
    assert result["whisper.cpp"] == "SKIP"
    assert result["MeloTTS"] == "SKIP"
    assert result["Live2D"] == "SKIP"


def test_local_provider_endpoints_and_files_are_checked_without_inference(tmp_path: Path):
    index = tmp_path / "apps" / "web" / "dist" / "index.html"
    index.parent.mkdir(parents=True)
    index.write_text("<html></html>", encoding="utf-8")
    cli = tmp_path / "whisper-cli.exe"
    model = tmp_path / "ggml-small.bin"
    cli.write_bytes(b"file")
    model.write_bytes(b"file")
    settings = Settings(
        llm="ollama",
        tts="melo",
        stt="whisper_cpp",
        melo_token="a" * 32,
        whisper_cli=cli,
        whisper_model=model,
    )
    calls = []

    def handler(request: httpx.Request):
        calls.append((request.method, request.url.path))
        if request.url.path == "/api/show":
            assert request.method == "POST"
            assert request.content == b'{"model":"qwen3:4b"}'
            return httpx.Response(200, json={"details": {"family": "qwen3"}})
        if request.url.path == "/health":
            assert request.method == "GET"
            assert request.headers["Authorization"] == "Bearer " + "a" * 32
            return httpx.Response(200, json={"status": "reachable", "worker": "melo-tts"})
        raise AssertionError("Unexpected endpoint")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    result = status_map(checks)
    assert result["React"] == "PASS"
    assert result["Ollama"] == "PASS"
    assert result["whisper.cpp"] == "PASS"
    assert result["MeloTTS"] == "PASS"
    assert result["Live2D"] == "SKIP"
    assert ("POST", "/api/chat") not in calls
    assert ("POST", "/synthesize") not in calls


def test_model_absence_and_worker_auth_error_fail_without_leaking_token(tmp_path: Path):
    settings = Settings(llm="ollama", tts="melo", melo_token="secret" + "x" * 32)
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.url.path)
        if request.url.path == "/api/show":
            return httpx.Response(404, json={"error": "model not found"})
        return httpx.Response(401)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    assert status_map(checks)["Ollama"] == "FAIL"
    assert status_map(checks)["MeloTTS"] == "FAIL"
    assert calls == ["/api/show", "/health"]
    assert "secret" not in repr(checks)


def test_remote_model_metadata_is_rejected(tmp_path: Path):
    settings = Settings(llm="ollama")

    def handler(request: httpx.Request):
        assert request.url.path == "/api/show"
        return httpx.Response(200, json={"remote_model": True})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    assert status_map(checks)["Ollama"] == "FAIL"


@pytest.mark.parametrize(
    ("model", "expected"),
    [("qwen3", "PASS"), ("qwen3:7b", "FAIL")],
    ids=["implicit-latest", "missing-explicit-tag"],
)
def test_ollama_readiness_with_only_latest_installed(tmp_path, model, expected):
    def handler(request):
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:latest"}]})
        assert (request.method, request.url.path) == ("POST", "/api/show")
        assert json.loads(request.content) == {"model": model}
        if model == "qwen3":
            return httpx.Response(200, json={"details": {"family": "qwen3"}})
        return httpx.Response(404, json={"error": "model not found"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        checks = inspect_local_readiness(Settings(llm="ollama", model=model), client, tmp_path)
    result = next(check for check in checks if check.component == "Ollama")
    assert result.status == expected
    if expected == "FAIL":
        assert "태그를 찾지 못했습니다" in result.detail


def test_cloud_default_does_not_probe_ollama_or_make_paid_requests(tmp_path):
    settings = Settings(llm="cloud", cloud_api_key="secret", cloud_model="chosen-model")

    def no_requests(request):
        raise AssertionError("Readiness must not contact disabled local or cloud providers")

    with httpx.Client(transport=httpx.MockTransport(no_requests)) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    assert status_map(checks)["Ollama"] == "SKIP"
    assert status_map(checks)["Cloud API"] == "PASS"
    assert "secret" not in repr(checks)


@pytest.mark.parametrize(
    ("provider", "key", "model", "expected", "exit_code"),
    [
        ("cloud", "", "", "FAIL", 1),
        ("cloud", "private-test-value", "", "FAIL", 1),
        ("cloud", "", "selected-model", "FAIL", 1),
        ("cloud", "private-test-value", "selected-model", "PASS", 0),
        ("demo", "", "", "SKIP", 0),
        ("demo", "private-test-value", "selected-model", "PASS", 0),
    ],
    ids=[
        "cloud-missing-both",
        "cloud-missing-model",
        "cloud-missing-key",
        "cloud-configured",
        "demo-unconfigured",
        "demo-cloud-configured",
    ],
)
def test_cloud_readiness_cli_reports_configuration(
    tmp_path, monkeypatch, capsys, provider, key, model, expected, exit_code
):
    from gateway import readiness_cli

    index = tmp_path / "apps/web/dist/index.html"
    index.parent.mkdir(parents=True)
    index.touch()
    monkeypatch.setattr(
        readiness_cli, "__file__", str(tmp_path / "services/gateway/readiness_cli.py")
    )
    monkeypatch.setenv("CLOUD_API_KEY", key)
    monkeypatch.setenv("CLOUD_MODEL", model)
    monkeypatch.setenv("LOCAL_LLM_ENABLED", "false")
    monkeypatch.setattr(httpx.Client, "request", lambda *a, **kw: pytest.fail("unexpected request"))
    assert readiness_cli.main(["--provider", provider, "--json"]) == exit_code
    output = capsys.readouterr().out
    assert "private-test-value" not in output
    cloud = next(item for item in json.loads(output) if item["component"] == "Cloud API")
    assert cloud["status"] == expected
    if expected == "FAIL":
        assert "CLOUD_MODEL" in cloud["detail"]
        assert "CLOUD_API_KEY" in cloud["detail"]


def test_selected_but_disabled_ollama_fails_without_network(tmp_path):
    settings = Settings(llm="ollama", local_llm_enabled=False)
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: pytest.fail("unexpected request"))
    ) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    assert status_map(checks)["Ollama"] == "FAIL"


def test_readiness_provider_override_preserves_local_start_command(tmp_path, monkeypatch, capsys):
    from gateway import readiness_cli

    index = tmp_path / "apps/web/dist/index.html"
    index.parent.mkdir(parents=True)
    index.touch()
    monkeypatch.setattr(
        readiness_cli, "__file__", str(tmp_path / "services/gateway/readiness_cli.py")
    )
    monkeypatch.setenv("LLM_PROVIDER", "demo")
    monkeypatch.delenv("LOCAL_LLM_ENABLED", raising=False)
    real_client = httpx.Client
    paths = []

    def handler(request):
        paths.append(request.url.path)
        return httpx.Response(200, json={})

    monkeypatch.setattr(
        readiness_cli.httpx,
        "Client",
        lambda **kwargs: real_client(**kwargs, transport=httpx.MockTransport(handler)),
    )
    assert readiness_cli.main(["--provider", "ollama", "--json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert next(c for c in report if c["component"] == "Ollama")["status"] == "PASS"
    assert paths == ["/api/show"]
