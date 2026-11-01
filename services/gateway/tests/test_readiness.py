from pathlib import Path

import httpx

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
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:4b"}]})
        if request.url.path == "/api/show":
            assert request.method == "POST"
            assert request.content == b'{"model":"qwen3:4b"}'
            return httpx.Response(200, json={"details": {"family": "qwen3"}})
        if request.url.path == "/synthesize":
            assert request.method == "GET"
            assert request.headers["Authorization"] == "Bearer " + "a" * 32
            return httpx.Response(405)
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
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": []})
        return httpx.Response(401)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    assert status_map(checks)["Ollama"] == "FAIL"
    assert status_map(checks)["MeloTTS"] == "FAIL"
    assert "/api/show" not in calls
    assert "secret" not in repr(checks)


def test_remote_model_metadata_is_rejected(tmp_path: Path):
    settings = Settings(llm="ollama")

    def handler(request: httpx.Request):
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:4b"}]})
        return httpx.Response(200, json={"remote_model": True})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        checks = inspect_local_readiness(settings, client, tmp_path)
    assert status_map(checks)["Ollama"] == "FAIL"
