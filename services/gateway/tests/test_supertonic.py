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


@pytest.fixture
def worker():
    path = Path(__file__).resolve().parents[3] / "workers/tts-supertonic/server.py"
    spec = importlib.util.spec_from_file_location("supertonic_worker", path)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker


def test_supertonic_worker_contract_and_readiness(tmp_path, worker):
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


def test_live_synthesis_uses_the_cast_recording_profile_on_new_text(tmp_path, monkeypatch, worker):
    """Exercise the actual worker entry's model and output path without installing ML in the gateway."""
    import sys
    from types import SimpleNamespace
    from unittest.mock import Mock

    import numpy as np

    for name in worker.MODEL_FILES.values():
        (tmp_path / name).touch()
    raw, adjusted = np.float32([0.1, -0.1, 0.0]), np.float32([0.14, -0.08])
    model = Mock(num_speakers=10)
    model.generate.return_value = SimpleNamespace(samples=raw, sample_rate=44100)
    sherpa = SimpleNamespace(
        OfflineTts=Mock(return_value=model),
        OfflineTtsConfig=SimpleNamespace,
        OfflineTtsModelConfig=SimpleNamespace,
        OfflineTtsSupertonicModelConfig=SimpleNamespace,
        GenerationConfig=SimpleNamespace,
    )
    resample = Mock(return_value=adjusted)
    paced = np.float32([0.13])
    shape_pauses = Mock(return_value=paced)
    monkeypatch.setattr(worker, "shape_cast_pauses", shape_pauses)
    monkeypatch.setitem(sys.modules, "sherpa_onnx", sherpa)
    monkeypatch.setitem(sys.modules, "soxr", SimpleNamespace(resample=resample))
    monkeypatch.setattr(worker, "pcm16_wav", lambda samples, rate: (samples, rate))
    synthesize = worker.load_synthesizer(tmp_path, seed=2718)
    profiles = [
        ("hana", 1, 1.085, 1.035, 1.11, 1.0, 0.19, 1.085),
        ("isol", 3, 1.005, 0.97, 1.03, 1.025, 0.24, 1.005),
        ("seorin", 0, 1.01, 0.96, 1.01, 0.98, 0.36, 0.96),
    ]
    for name, speaker, statement, question, exclamation, register, pause, mixed in profiles:
        for text, speed in [
            ("함께 새 프로젝트를 시작해요.", statement),
            ("“어떤 일부터 함께 시작할까요？”", question),
            ("정말 반가워요！", exclamation),
            ("오늘 날씨가 정말 좋네요. 잠깐 같이 걸을래요?", mixed),
        ]:
            resample.reset_mock()
            shape_pauses.reset_mock()
            samples, rate = synthesize(text, name)
            spoken, config = model.generate.call_args.args
            assert (spoken, config.sid, config.speed, config.num_steps) == (
                text,
                speaker,
                speed,
                24,
            )
            assert config.extra == {"lang": "ko", "silence_duration": str(pause), "seed": "2718"}
            assert rate == 44100
            assert samples is paced
            if register == 1:
                resample.assert_not_called()
                shape_pauses.assert_called_once_with(raw, rate, pause)
            else:
                resample.assert_called_once_with(raw, rate * register, rate, quality="HQ")
                shape_pauses.assert_called_once_with(adjusted, rate, pause)

    worker.load_synthesizer(tmp_path)("나중에 다시 이야기해요.", "seorin")
    assert "seed" not in model.generate.call_args.args[1].extra

    shape_pauses.return_value = np.float32([1.2, -0.6, 0.0])
    samples, _ = synthesize("밝게 인사해요.", "isol")
    assert samples.tolist() == pytest.approx([0.9, -0.45, 0.0])
