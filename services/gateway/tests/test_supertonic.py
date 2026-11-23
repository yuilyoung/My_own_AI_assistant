import importlib.util
import json
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from gateway.api import create_app
from gateway.config import Settings
from gateway.readiness import inspect_local_readiness
from test_providers import wav_bytes

TOKEN = "local-testing-voice-worker-token-0123456789"


def test_selected_turn_voice_reaches_worker_and_returns_session_audio(tmp_path):
    sent = []

    def synthesize(request):
        assert request.url == "http://127.0.0.1:8767/synthesize"
        assert request.headers["Authorization"] == "Bearer " + TOKEN
        sent.append(json.loads(request.content))
        return httpx.Response(200, content=wav_bytes(rate=44100))

    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            tts="supertonic",
            supertonic_token=TOKEN,
            supertonic_url="http://127.0.0.1:8767/",
        )
    )
    app.state.engine.tts.transport = httpx.MockTransport(synthesize)
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        client.headers["Authorization"] = "Bearer " + TOKEN
        sid = client.post("/api/sessions", json={"mode": "assistant"}).json()["id"]
        url = f"/api/sessions/{sid}/turns"
        for voice in ("hana", "isol", "seorin", None):
            body = {"text": "한국어 음성 확인"}
            if voice:
                body["voice"] = voice
            response = client.post(url, json=body)
            assert response.status_code == 202
            status_url = url + "/" + response.json()["id"]
            for _ in range(100):
                turn = client.get(status_url).json()
                if turn["status"] == "completed":
                    break
                time.sleep(0.01)
            segment = turn["segments"][0]
            assert sent[-1] == {"text": segment["text"], "voice": voice or "seorin"}
            assert client.get(
                f"/api/sessions/{sid}/audio/{segment['audio_id']}"
            ).content == wav_bytes(rate=44100)
        companion = client.post("/api/sessions", json={"mode": "companion"}).json()["id"]
        assert (
            client.post(
                f"/api/sessions/{companion}/turns", json={"text": "안녕", "voice": "hana"}
            ).status_code
            == 422
        )
        assert client.post(url, json={"text": "안녕", "voice": "unknown"}).status_code == 422
        assert len(sent) == 4


def test_supertonic_worker_contract_and_readiness(tmp_path):
    path = Path(__file__).resolve().parents[3] / "workers/tts-supertonic/server.py"
    spec = importlib.util.spec_from_file_location("supertonic_worker", path)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    received = []

    def synthesize(text, voice):
        received.append((text, voice))
        return wav_bytes(rate=44100)

    with TestClient(
        worker.create_app(TOKEN, synthesize), base_url="http://127.0.0.1:8767"
    ) as client:
        assert client.get("/health").status_code == 401
        client.headers["Authorization"] = "Bearer " + TOKEN
        settings = Settings(
            tts="supertonic", supertonic_token=TOKEN, supertonic_url="http://127.0.0.1:8767/"
        )
        checks = inspect_local_readiness(settings, client, tmp_path)
        assert any(c.component == "Supertonic 2" and c.status == "PASS" for c in checks)
        assert received == []
        assert client.post(
            "/synthesize", json={"text": "안녕", "voice": "isol"}
        ).content == wav_bytes(rate=44100)
        assert client.post("/synthesize", json={"text": "안녕"}).status_code == 200
        assert (
            client.post("/synthesize", json={"text": "안녕", "voice": "other"}).status_code == 422
        )
        assert received == [("안녕", "isol"), ("안녕", "seorin")]
    with pytest.raises(ValueError, match="SUPERTONIC_TOKEN"):
        Settings(tts="supertonic")
    with pytest.raises(ValueError):
        Settings(supertonic_url="https://example.com")


async def test_voice_for_new_turn_waits_if_worker_is_finishing_cancelled_speech():
    from gateway.providers import SupertonicTTS

    voices = []

    def worker(request):
        voices.append(json.loads(request.content)["voice"])
        if len(voices) == 1:
            return httpx.Response(429, json={"detail": "Worker is busy"})
        return httpx.Response(200, content=wav_bytes(rate=44100))

    tts = SupertonicTTS(
        Settings(tts="supertonic", supertonic_token=TOKEN, timeout=2),
        httpx.MockTransport(worker),
    )
    assert await tts.synthesize_voice("새 응답이에요.", "hana") == wav_bytes(rate=44100)
    assert voices == ["hana", "hana"]


def test_explicit_readiness_checks_selected_provider_before_validating_its_token(
    monkeypatch, capsys
):
    from gateway import readiness_cli

    monkeypatch.setenv("TTS_PROVIDER", "melo")
    monkeypatch.delenv("MELO_TOKEN", raising=False)
    monkeypatch.setenv("SUPERTONIC_TOKEN", TOKEN)
    selected = []

    def inspect(settings, client, root):
        selected.append(settings.tts)
        return []

    monkeypatch.setattr(readiness_cli, "inspect_local_readiness", inspect)
    for provider in ("none", "supertonic"):
        assert readiness_cli.main(["--tts-provider", provider, "--json"]) == 0
        assert json.loads(capsys.readouterr().out) == []
    assert selected == ["none", "supertonic"]
    assert readiness_cli.main(["--json"]) == 1
    assert "MELO_TOKEN" in json.loads(capsys.readouterr().out)[0]["detail"]


@pytest.mark.parametrize(
    ("saved", "token", "expected"),
    [
        (None, TOKEN, "supertonic"),
        ("none", TOKEN, "supertonic"),
        ("melo", TOKEN, "melo"),
        (None, "", "melo"),
    ],
)
def test_voice_switch_prefers_configured_character_worker(monkeypatch, saved, token, expected):
    from gateway import readiness_cli

    if saved is None:
        monkeypatch.delenv("TTS_PROVIDER", raising=False)
    else:
        monkeypatch.setenv("TTS_PROVIDER", saved)
    monkeypatch.setenv("SUPERTONIC_TOKEN", token)
    monkeypatch.setenv("MELO_TOKEN", TOKEN)
    selected = []

    def inspect(settings, client, root):
        selected.append(settings.tts)
        return []

    monkeypatch.setattr(readiness_cli, "inspect_local_readiness", inspect)
    assert readiness_cli.main(["--voice", "--json"]) == 0
    assert selected == [expected]
