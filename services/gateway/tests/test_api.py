import pytest
from fastapi.testclient import TestClient
from gateway.api import create_app
from gateway.config import Settings

TOKEN = "test-token-that-is-at-least-thirty-two-characters"


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, token=TOKEN, llm="demo", tts="none"))
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        c.headers["Authorization"] = "Bearer " + TOKEN
        yield c


def session(client, mode="assistant"):
    r = client.post("/api/sessions", json={"mode": mode})
    assert r.status_code == 201
    return r.json()["id"]


def test_auth_and_origin_and_host(client):
    assert client.get("/api/status").status_code == 200
    assert client.get("/api/status", headers={"Authorization": "bad"}).status_code == 401
    assert client.get("/api/status", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/status", headers={"Host": "evil.example"}).status_code == 400


def test_companion_cannot_write_assistant_notes(client):
    c = session(client, "companion")
    assert client.post(f"/api/sessions/{c}/notes", json={"text": "no"}).status_code == 403
    a = session(client)
    assert client.post(f"/api/sessions/{a}/notes", json={"text": "구매 목록"}).status_code == 201
    assert client.get(f"/api/sessions/{a}/notes").json()[0]["text"] == "구매 목록"


def test_empty_turn_and_unknown_session_rejected(client):
    s = session(client)
    assert client.post(f"/api/sessions/{s}/turns", json={"text": "  "}).status_code == 422
    assert client.post("/api/sessions/missing/turns", json={"text": "a"}).status_code == 404


def test_memory_scope_and_explicit_delete(client):
    a = session(client)
    c = session(client, "companion")
    r = client.post(f"/api/sessions/{a}/memories", json={"text": "기억"})
    assert r.status_code == 201
    mid = r.json()["id"]
    assert client.get(f"/api/sessions/{c}/memories").json() == []
    assert client.delete(f"/api/sessions/{c}/memories/{mid}").status_code == 404
    assert client.delete(f"/api/sessions/{a}/memories/{mid}").status_code == 204


def test_body_limit_and_no_secret_in_status(client):
    assert (
        client.post(
            "/api/sessions", content=b"x" * 20000, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    assert TOKEN not in str(client.get("/api/status").json())
