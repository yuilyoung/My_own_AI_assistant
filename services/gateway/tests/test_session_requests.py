import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier
from uuid import uuid4

import pytest
from gateway.api import create_app
from gateway.config import Settings
from gateway.tests.test_services_api import TOKEN, client_for


def test_request_id_replays_after_restart_and_default_service_change(tmp_path):
    body = {"mode": "assistant", "service": "demo", "request_id": str(uuid4())}
    with client_for(create_app(Settings(data_dir=tmp_path, token=TOKEN))) as client:
        first = client.post("/api/sessions", json=body)
        assert first.status_code == 201
        session = first.json()
        assert set(session) == {"id", "mode", "character", "scope", "created_at", "service"}
        assert session["id"] != body["request_id"]

    with client_for(create_app(Settings(data_dir=tmp_path, token=TOKEN, llm="ollama"))) as client:
        replay = client.post("/api/sessions", json={**body, "character": "default"})
        assert replay.status_code == 201
        assert replay.json() == session
        other = client.post("/api/sessions", json={**body, "request_id": str(uuid4())})
        assert other.status_code == 201
        assert other.json()["id"] != session["id"]


def test_same_request_id_in_two_services_has_independent_sessions(tmp_path):
    settings = Settings(data_dir=tmp_path, token=TOKEN, local_llm_enabled=True)
    body = {"mode": "assistant", "request_id": str(uuid4())}
    with client_for(create_app(settings)) as client:
        sessions = {}
        for service in ("demo", "local"):
            payload = {**body, "service": service}
            first = client.post("/api/sessions", json=payload)
            assert first.status_code == 201
            assert first.json()["service"] == service
            assert client.post("/api/sessions", json=payload).json() == first.json()
            sessions[service] = first.json()["id"]
        assert sessions["demo"] != sessions["local"]
        notes = f"/api/sessions/{sessions['local']}/notes"
        assert client.post(notes, json={"text": "local only"}).status_code == 201
        assert client.get(f"/api/sessions/{sessions['demo']}/notes").json() == []


@pytest.mark.parametrize("second_mode", ["assistant", "companion"])
def test_concurrent_request_id_across_database_connections(tmp_path, second_mode):
    settings = Settings(data_dir=tmp_path, token=TOKEN)
    body = {"service": "demo", "request_id": str(uuid4())}
    barrier = Barrier(2)

    def post(client, mode):
        barrier.wait(timeout=5)
        return client.post("/api/sessions", json={**body, "mode": mode})

    with client_for(create_app(settings)) as first, client_for(create_app(settings)) as second:
        with ThreadPoolExecutor(max_workers=2) as pool:
            one = pool.submit(post, first, "assistant")
            two = pool.submit(post, second, second_mode)
            responses = [one.result(), two.result()]
        if second_mode == "assistant":
            assert [r.status_code for r in responses] == [201, 201]
            assert responses[0].json() == responses[1].json()
        else:
            assert sorted(r.status_code for r in responses) == [201, 409]
            winner = next(r.json() for r in responses if r.status_code == 201)
            replay = first.post("/api/sessions", json={**body, "mode": winner["mode"]})
            assert replay.json() == winner

    with closing(sqlite3.connect(tmp_path / "demo" / "state.sqlite3")) as db:
        assert db.execute("SELECT COUNT(*) FROM sessions").fetchone() == (1,)


def test_request_id_on_legacy_database_preserves_unkeyed_sessions(tmp_path):
    partition = tmp_path / "demo"
    partition.mkdir()
    old_id = str(uuid4())
    with closing(sqlite3.connect(partition / "state.sqlite3")) as db, db:
        db.execute("""CREATE TABLE sessions (
            id TEXT PRIMARY KEY, mode TEXT NOT NULL, character TEXT NOT NULL,
            scope TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        db.execute(
            "INSERT INTO sessions(id, mode, character, scope) VALUES (?, 'companion', 'default', 'companion:default')",
            (old_id,),
        )

    with client_for(create_app(Settings(data_dir=tmp_path, token=TOKEN))) as client:
        body = {"mode": "assistant", "service": "demo"}
        assert client.get(f"/api/sessions/{old_id}/history").status_code == 200
        ids = {old_id}
        for extra in ({}, {}, {"request_id": old_id}):
            response = client.post("/api/sessions", json={**body, **extra})
            assert response.status_code == 201
            assert response.json()["id"] not in ids
            ids.add(response.json()["id"])
        assert client.post("/api/sessions", json={**body, "request_id": "bad"}).status_code == 422
