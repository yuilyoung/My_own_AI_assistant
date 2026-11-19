import asyncio
import json
import threading

import httpx
import pytest
from fastapi.testclient import TestClient
from gateway.api import create_app
from gateway.config import Settings
from gateway.contracts import SessionCreate
from gateway.store import Store
from gateway.tests.test_cloud_provider import completion
from gateway.tests.test_providers import wav_bytes
from gateway.tests.test_speech import wav_bytes as input_wav

TOKEN = "service-test-token-at-least-thirty-two-characters"


def client_for(app):
    # TestClient's default peer is "testclient", unlike a real loopback request.
    return TestClient(
        app,
        base_url="http://127.0.0.1:8765",
        headers={"Authorization": "Bearer " + TOKEN},
        client=("127.0.0.1", 50000),
    )


def create_session(client, service=None, mode="assistant"):
    body = {"mode": mode}
    if service is not None:
        body["service"] = service
    response = client.post("/api/sessions", json=body)
    assert response.status_code == 201, response.text
    result = response.json()
    if service:
        assert result["service"] == service
    return result["id"]


def finish(client, sid, tid):
    for _ in range(200):
        result = client.get(f"/api/sessions/{sid}/turns/{tid}").json()
        if result["status"] in {"completed", "cancelled", "error"}:
            return result
    pytest.fail("Turn did not settle")


@pytest.fixture
def transport(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/api/show":
            return httpx.Response(200, json={"details": {}})
        if request.url.path == "/api/chat":
            return httpx.Response(
                200, json={"message": {"content": '{"segments":[{"text":"local reply"}]}'}}
            )
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(200, json=completion())

    real_client = httpx.AsyncClient

    def with_transport(**kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(**kwargs)

    monkeypatch.setattr("gateway.providers.httpx.AsyncClient", with_transport)
    return requests


@pytest.mark.parametrize(
    "llm,expected", [("demo", "demo"), ("ollama", "local"), ("cloud", "cloud")]
)
def test_default_service_and_legacy_handles(tmp_path, llm, expected):
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            llm=llm,
            cloud_api_key="secret",
            cloud_model="chosen-model",
        )
    )
    with client_for(app) as client:
        result = client.post("/api/sessions", json={"mode": "assistant"}).json()
        assert result["service"] == expected
        assert app.state.engine.store.session(result["id"])["id"] == result["id"]
        assert app.state.transcriptions.store is app.state.engine.store
        status = client.get("/api/status").json()
        assert status["default_service"] == expected
        assert status["deployment"] == "local"
        assert (
            status["model"]
            == {"demo": None, "local": "qwen3:4b", "cloud": "chosen-model"}[expected]
        )


@pytest.mark.parametrize(
    "key,model,available",
    [("", "", False), ("key", "", False), ("", "model", False), ("key", "model", True)],
)
def test_status_availability_is_configuration_not_default(tmp_path, key, model, available):
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            cloud_api_key=key,
            cloud_model=model,
            local_llm_enabled=True,
            public_origin="https://assistant.example",
        )
    )
    with client_for(app) as client:
        status = client.get("/api/status").json()
        assert status["deployment"] == "cloud"
        assert status["default_service"] == "demo"
        services = {s["id"]: s for s in status["services"]}
        assert set(services) == {"demo", "local", "cloud"}
        assert {sid: s["label"] for sid, s in services.items()} == {
            "demo": "데모",
            "local": "로컬 Ollama",
            "cloud": "클라우드 API",
        }
        assert services["demo"]["available"] is True
        assert services["local"]["available"] is True
        assert services["cloud"]["available"] is available
        assert status["cloud_enabled"] is available
        assert all(isinstance(s["label"], str) for s in services.values())
        assert all(
            set(s) <= {"id", "label", "available", "model", "reason"} for s in services.values()
        )
        if not available:
            assert services["cloud"]["reason"]
        assert TOKEN not in json.dumps(status)


def test_unavailable_default_and_explicit_services_never_fall_back(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, token=TOKEN, llm="cloud"))
    with client_for(app) as client:
        for service in (None, "local", "cloud"):
            body = {"mode": "assistant", **({"service": service} if service else {})}
            assert client.post("/api/sessions", json=body).status_code == 503
        assert (
            client.post("/api/sessions", json={"mode": "assistant", "service": "bad"}).status_code
            == 422
        )
        create_session(client, "demo")


def test_all_services_isolate_memory_notes_history_and_provider_prompts(tmp_path, transport):
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            llm="ollama",
            cloud_api_key="server-secret",
            cloud_model="chosen-model",
        )
    )
    with client_for(app) as client:
        sessions = {
            service: create_session(client, service) for service in ("demo", "local", "cloud")
        }
        tids = {}
        for service, sid in sessions.items():
            assert (
                client.post(
                    f"/api/sessions/{sid}/memories", json={"text": f"{service}-only-memory"}
                ).status_code
                == 201
            )
            assert (
                client.post(
                    f"/api/sessions/{sid}/notes", json={"text": f"{service}-only-note"}
                ).status_code
                == 201
            )
        for service, sid in sessions.items():
            assert [m["text"] for m in client.get(f"/api/sessions/{sid}/memories").json()] == [
                f"{service}-only-memory"
            ]
            assert [n["text"] for n in client.get(f"/api/sessions/{sid}/notes").json()] == [
                f"{service}-only-note"
            ]
            tid = client.post(
                f"/api/sessions/{sid}/turns", json={"text": f"{service}-only-message"}
            ).json()["id"]
            tids[service] = tid
            assert finish(client, sid, tid)["status"] == "completed"
            history = client.get(f"/api/sessions/{sid}/history").json()
            assert history[0] == {"role": "user", "content": f"{service}-only-message"}
            companion = create_session(client, service, "companion")
            assert client.get(f"/api/sessions/{companion}/memories").json() == []
            assert client.get(f"/api/sessions/{companion}/notes").status_code == 403
        cloud_requests = [
            json.loads(r.content) for r in transport if r.url.path == "/v1/chat/completions"
        ]
        assert len(cloud_requests) == 1
        assert "cloud-only-memory" in json.dumps(cloud_requests)
        assert "local-only" not in json.dumps(cloud_requests)
        assert "demo-only" not in json.dumps(cloud_requests)
        for service, sid in sessions.items():
            for other, tid in tids.items():
                if service != other:
                    assert client.get(f"/api/sessions/{sid}/turns/{tid}").status_code == 404
                    assert client.delete(f"/api/sessions/{sid}/turns/{tid}").status_code == 404
        assert "server-secret" not in client.get("/api/status").text
    assert all(
        (tmp_path / p / "state.sqlite3").is_file()
        for p in ("demo", "local_private", "cloud_private")
    )


def test_busy_local_does_not_block_cloud_and_late_cancelled_reply_is_discarded(
    tmp_path, monkeypatch
):
    entered = threading.Event()
    real_client = httpx.AsyncClient

    async def handler(request):
        if request.url.path == "/api/show":
            return httpx.Response(200, json={})
        if request.url.path == "/api/chat":
            entered.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                return httpx.Response(
                    200, json={"message": {"content": '{"segments":[{"text":"late"}]}'}}
                )
        return httpx.Response(200, json=completion())

    monkeypatch.setattr(
        "gateway.providers.httpx.AsyncClient",
        lambda **kwargs: real_client(**{**kwargs, "transport": httpx.MockTransport(handler)}),
    )
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            llm="ollama",
            cloud_api_key="server-secret",
            cloud_model="chosen-model",
        )
    )
    with client_for(app) as client:
        local, cloud = create_session(client, "local"), create_session(client, "cloud")
        tid = client.post(f"/api/sessions/{local}/turns", json={"text": "local secret"}).json()[
            "id"
        ]
        assert entered.wait(timeout=2)
        cloud_tid = client.post(f"/api/sessions/{cloud}/turns", json={"text": "public"}).json()[
            "id"
        ]
        assert finish(client, cloud, cloud_tid)["status"] == "completed"
        assert client.get(f"/api/sessions/{local}/turns/{tid}").json()["status"] == "thinking"
        assert client.delete(f"/api/sessions/{local}/turns/{tid}").status_code == 204
        assert finish(client, local, tid)["status"] == "cancelled"
        assert client.get(f"/api/sessions/{local}/history").json() == []
        assert client.get(f"/api/sessions/{cloud}/history").json()[0]["content"] == "public"


def test_transcription_audio_and_cancellation_route_to_the_session_service(
    tmp_path, monkeypatch, transport
):
    async def recognize(self, data):
        return "local transcription"

    async def speak(self, text):
        return wav_bytes()

    monkeypatch.setattr("gateway.speech.WhisperCpp.transcribe", recognize)
    monkeypatch.setattr("gateway.providers.MeloTTS.synthesize", speak)
    cli, model = tmp_path / "cli", tmp_path / "model.bin"
    cli.touch()
    model.touch()
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            llm="ollama",
            stt="whisper_cpp",
            whisper_cli=cli,
            whisper_model=model,
            tts="melo",
            melo_token=TOKEN,
            cloud_api_key="server-secret",
            cloud_model="chosen-model",
        )
    )
    with client_for(app) as client:
        local, cloud = create_session(client, "local"), create_session(client, "cloud")
        path = f"/api/sessions/{cloud}/transcriptions"
        response = client.post(path, content=input_wav(), headers={"Content-Type": "audio/wav"})
        assert response.status_code == 202
        job = response.json()["id"]
        for _ in range(200):
            result = client.get(f"{path}/{job}").json()
            if result["status"] == "completed":
                break
        assert result["text"] == "local transcription"
        assert client.get(f"/api/sessions/{local}/transcriptions/{job}").status_code == 404
        local_turn = client.post(f"/api/sessions/{local}/turns", json={"text": "hello"}).json()[
            "id"
        ]
        assert finish(client, local, local_turn)["status"] == "completed"
        assert client.get(f"{path}/{job}").json()["status"] == "completed"
        cloud_turn = client.post(f"/api/sessions/{cloud}/turns", json={"text": "hello"}).json()[
            "id"
        ]
        done = finish(client, cloud, cloud_turn)
        assert done["status"] == "completed"
        assert client.get(f"{path}/{job}").json()["status"] == "cancelled"
        aid = done["segments"][0]["audio_id"]
        assert client.get(f"/api/sessions/{cloud}/audio/{aid}").content == wav_bytes()
        assert client.get(f"/api/sessions/{local}/audio/{aid}").status_code == 404
        assert client.delete(f"/api/sessions/{cloud}/turns/{cloud_turn}").status_code == 204
        assert client.get(f"/api/sessions/{cloud}/audio/{aid}").status_code == 404
        assert client.delete(f"{path}/{job}").status_code == 204


def test_persisted_local_sessions_stay_local_after_default_changes(tmp_path, transport):
    # Represents an existing pre-switch installation, with no service column.
    store = Store(tmp_path / "local_private" / "state.sqlite3")
    sid = store.create_session(SessionCreate(mode="assistant"))["id"]
    store.add_memory(sid, "never-upload-this")
    store.close()
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            llm="cloud",
            cloud_api_key="server-secret",
            cloud_model="chosen-model",
        )
    )
    with client_for(app) as client:
        assert client.get(f"/api/sessions/{sid}/memories").json()[0]["text"] == "never-upload-this"
        assert client.post(f"/api/sessions/{sid}/turns", json={"text": "hello"}).status_code == 503
        cloud = create_session(client)
        tid = client.post(f"/api/sessions/{cloud}/turns", json={"text": "hello"}).json()["id"]
        assert finish(client, cloud, tid)["status"] == "completed"
        assert "never-upload-this" not in str([r.content for r in transport])


def test_cloud_failure_is_explicit_without_demo_or_local_fallback(tmp_path, monkeypatch):
    real_client = httpx.AsyncClient
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(429, text="server-secret")

    monkeypatch.setattr(
        "gateway.providers.httpx.AsyncClient",
        lambda **kwargs: real_client(**{**kwargs, "transport": httpx.MockTransport(handler)}),
    )
    app = create_app(
        Settings(
            data_dir=tmp_path,
            token=TOKEN,
            llm="cloud",
            cloud_api_key="server-secret",
            cloud_model="chosen-model",
        )
    )
    with client_for(app) as client:
        sid = create_session(client)
        tid = client.post(f"/api/sessions/{sid}/turns", json={"text": "hello"}).json()["id"]
        result = finish(client, sid, tid)
        assert result["status"] == "error"
        assert result["error"] == "LLM_UNAVAILABLE_OR_INVALID_REPLY"
        assert "server-secret" not in str(result)
        assert client.get(f"/api/sessions/{sid}/history").json() == []
        assert calls == ["https://api.openai.com/v1/chat/completions"]


def test_avatar_assets_are_mounted_before_web_without_symlink_escape(tmp_path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "model.json").write_text('{"model": "user-owned"}')
    secret = tmp_path / "private.txt"
    secret.write_text("private-file")
    (assets / "escape.txt").symlink_to(secret)
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("frontend")
    settings = Settings(data_dir=tmp_path / "data", token=TOKEN, avatar_dir=assets, web_dir=web)
    with client_for(create_app(settings)) as client:
        assert client.get("/").text == "frontend"
        assert client.get("/avatar-local/model.json").json() == {"model": "user-owned"}
        assert client.get("/avatar-local/escape.txt").status_code == 404
        assert client.get("/avatar-local/%2e%2e/private.txt").status_code == 404
        status = client.get("/api/status").json()
        assert status["avatar_local_enabled"] is True
        assert str(assets) not in json.dumps(status)
