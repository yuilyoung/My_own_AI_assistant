import json

import httpx
from gateway.config import Settings
from gateway.doctor import diagnose, main


def configured(tmp_path, **kwargs):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<html></html>")
    return Settings(web_dir=web, **kwargs)


def check(report, name):
    return next(item for item in report["checks"] if item["name"] == name)


def test_demo_is_ready_for_fixed_responses_only(tmp_path):
    report = diagnose(configured(tmp_path))
    assert report["configured_ready"] is True
    assert report["profile"] == "demo"
    assert report["inference_verified"] is False
    assert check(report, "llm")["status"] == "disabled"
    assert check(report, "avatar")["status"] == "missing"


def test_exact_local_ollama_model_is_checked_without_inference(tmp_path):
    requests = []

    def respond(request):
        requests.append(request)
        assert request.url.path == "/api/show"
        assert json.loads(request.content) == {"model": "qwen3:4b"}
        return httpx.Response(200, json={"model_info": {"general.architecture": "qwen3"}})

    report = diagnose(configured(tmp_path, llm="ollama"), httpx.MockTransport(respond))
    assert report["configured_ready"] is True
    assert len(requests) == 1
    assert report["inference_verified"] is False


def test_remote_model_is_not_ready_even_when_ollama_answers(tmp_path):
    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, json={"remote_host": "https://remote.invalid"})
    )
    report = diagnose(configured(tmp_path, llm="ollama"), transport)
    assert report["configured_ready"] is False
    assert check(report, "llm")["status"] == "error"


def test_missing_model_response_is_sanitized(tmp_path):
    token = "do-not-print-this-secret"
    transport = httpx.MockTransport(lambda _: httpx.Response(404, text=token))
    report = diagnose(configured(tmp_path, llm="ollama"), transport)
    assert report["configured_ready"] is False
    assert token not in json.dumps(report)
    assert "ollama pull" in check(report, "llm")["message"]


def test_melo_health_uses_auth_but_never_prints_token(tmp_path):
    token = "private-worker-token-" * 3

    def respond(request):
        assert request.url.path == "/health"
        assert request.headers["Authorization"] == "Bearer " + token
        return httpx.Response(200, json={"status": "ready", "provider": "melo"})

    report = diagnose(
        configured(tmp_path, tts="melo", melo_token=token), httpx.MockTransport(respond)
    )
    assert report["configured_ready"] is True
    assert check(report, "tts")["status"] == "ok"
    assert token not in json.dumps(report)


def test_melo_wrong_service_and_redirect_fail(tmp_path):
    settings = configured(tmp_path, tts="melo", melo_token="x" * 32)
    for response in [httpx.Response(200, json={"status": "other"}), httpx.Response(302)]:
        report = diagnose(settings, httpx.MockTransport(lambda _: response))
        assert report["configured_ready"] is False


def test_avatar_cannot_escape_web_root(tmp_path):
    settings = configured(tmp_path)
    avatar = settings.web_dir / "avatar-local"
    avatar.mkdir()
    (avatar / "manifest.json").write_text(
        json.dumps({"version": 1, "modelUrl": "/avatar-local/../../secret.model3.json"})
    )
    report = diagnose(settings)
    assert check(report, "avatar")["status"] == "error"
    assert report["configured_ready"] is True


def test_missing_frontend_is_required_failure(tmp_path):
    report = diagnose(Settings(web_dir=tmp_path / "missing"))
    assert report["configured_ready"] is False
    assert check(report, "web")["status"] == "missing"


def test_invalid_settings_return_json_failure_without_values(monkeypatch, capsys):
    monkeypatch.setenv("OLLAMA_URL", "https://secret-value.invalid/token")
    assert main(["--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["configured_ready"] is False
    assert "secret-value" not in json.dumps(report)
    assert report["checks"][0]["name"] == "configuration"


def test_stt_files_need_execution_permission(tmp_path):
    import os

    cli = tmp_path / "whisper-cli"
    model = tmp_path / "ggml-small.bin"
    cli.write_text("#!/bin/sh\nexit 0\n")
    model.write_bytes(b"model")
    settings = configured(tmp_path, stt="whisper_cpp", whisper_cli=cli, whisper_model=model)
    cli.chmod(0o644)
    if os.name != "nt":
        assert check(diagnose(settings), "stt")["status"] == "error"
    cli.chmod(0o755)
    assert check(diagnose(settings), "stt")["status"] == "ok"
    assert diagnose(settings)["inference_verified"] is False


def test_connection_failure_never_exposes_exception_content(tmp_path):
    def fail(request):
        raise httpx.ConnectError("secret-network-details", request=request)

    report = diagnose(configured(tmp_path, llm="ollama"), httpx.MockTransport(fail))
    assert report["configured_ready"] is False
    assert "secret-network-details" not in json.dumps(report)


def test_avatar_manifest_symlink_is_rejected_before_read(tmp_path, monkeypatch):
    import pytest

    settings = configured(tmp_path)
    avatar = settings.web_dir / "avatar-local"
    avatar.mkdir()
    external = tmp_path / "external.json"
    external.write_text("{}")
    try:
        (avatar / "manifest.json").symlink_to(external)
    except OSError:
        pytest.skip("OS does not grant symlink creation")
    from gateway import doctor

    original = doctor._json_file
    reads = []

    def track(path):
        reads.append(path)
        return original(path)

    monkeypatch.setattr(doctor, "_json_file", track)
    report = diagnose(settings)
    assert check(report, "avatar")["status"] == "error"
    assert reads == []


def test_avatar_files_are_distinct_from_rendering_and_bad_mapping_is_rejected(tmp_path):
    from gateway.doctor import SHADERS

    settings = configured(tmp_path)
    root = settings.web_dir
    avatar = root / "avatar-local"
    model = avatar / "Haru"
    model.mkdir(parents=True)
    manifest = {
        "version": 1,
        "modelUrl": "/avatar-local/Haru/Haru.model3.json",
        "emotionMappings": {},
        "gestureMappings": {},
    }
    (avatar / "manifest.json").write_text(json.dumps(manifest))
    (model / "Haru.model3.json").write_text(
        json.dumps(
            {"Version": 3, "FileReferences": {"Moc": "Haru.moc3", "Textures": ["texture.png"]}}
        )
    )
    for relative in [
        "avatar-local/Haru/Haru.moc3",
        "avatar-local/Haru/texture.png",
        "avatar-runtime/cubism-runtime.js",
        "avatar-runtime/live2dcubismcore.min.js",
        *("avatar-runtime/shaders/" + shader for shader in SHADERS),
    ]:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"test-only-placeholder")
    report = diagnose(settings)
    assert check(report, "avatar")["status"] == "ok"
    assert "미검증" in check(report, "avatar")["message"]
    manifest["gestureMappings"] = {"idle": {"group": "Idle", "index": -1}}
    (avatar / "manifest.json").write_text(json.dumps(manifest))
    assert check(diagnose(settings), "avatar")["status"] == "error"


def test_ollama_capabilities_require_exact_list_membership(tmp_path):
    settings = configured(tmp_path, llm="ollama")
    for capabilities in (
        "not-completion",
        {"completion": False},
        ["not-completion"],
        ["completion", 1],
    ):
        transport = httpx.MockTransport(
            lambda _, caps=capabilities: httpx.Response(
                200, json={"model_info": {"general.architecture": "qwen3"}, "capabilities": caps}
            )
        )
        assert diagnose(settings, transport)["configured_ready"] is False
    transport = httpx.MockTransport(
        lambda _: httpx.Response(
            200,
            json={"model_info": {"general.architecture": "qwen3"}, "capabilities": ["completion"]},
        )
    )
    assert diagnose(settings, transport)["configured_ready"] is True
