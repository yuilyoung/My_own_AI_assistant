import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient
from test_providers import wav_bytes


def worker():
    path = Path(__file__).resolve().parents[3] / "workers/tts-melo/server.py"
    spec = importlib.util.spec_from_file_location("melo_worker", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_worker_auth_body_and_wave_contract():
    token = "separate-worker-test-token-of-long-length"
    app = worker().create_app(token, lambda text: wav_bytes())
    with TestClient(app, base_url="http://127.0.0.1:8766") as c:
        assert c.post("/synthesize", json={"text": "안녕"}).status_code == 401
        c.headers["Authorization"] = "Bearer " + token
        assert (
            c.post(
                "/synthesize", json={"text": "안녕"}, headers={"Origin": "http://127.0.0.1:8765"}
            ).status_code
            == 403
        )
        assert c.post("/synthesize", json={"text": "안녕"}).content == wav_bytes()
        assert c.post("/synthesize", json={"text": " "}).status_code == 422
        assert c.post("/synthesize", json={"text": "a" * 5000}).status_code == 413


def test_worker_does_not_leak_exception():
    token = "separate-worker-test-token-of-long-length"

    def broken(text):
        raise RuntimeError("SECRET")

    with TestClient(worker().create_app(token, broken), base_url="http://127.0.0.1:8766") as c:
        r = c.post(
            "/synthesize", json={"text": "안녕"}, headers={"Authorization": "Bearer " + token}
        )
        assert r.status_code == 503 and "SECRET" not in r.text


def test_worker_health_requires_auth_and_does_not_synthesize():
    def unexpected(text):
        raise AssertionError("Health probe must not run inference")

    token = "separate-worker-test-token-of-long-length"
    with TestClient(worker().create_app(token, unexpected), base_url="http://127.0.0.1:8766") as c:
        assert c.get("/health").status_code == 401
        response = c.get("/health", headers={"Authorization": "Bearer " + token})
        assert response.status_code == 200
        assert response.json() == {"status": "ready", "provider": "melo"}
        assert token not in response.text
