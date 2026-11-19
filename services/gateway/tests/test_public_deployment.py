import pytest
from fastapi.testclient import TestClient
from gateway.api import create_app
from gateway.config import Settings


def test_public_origin_preserves_authentication_and_origin_checks(tmp_path):
    token = "a" * 64
    settings = Settings(
        data_dir=tmp_path,
        token=token,
        host="0.0.0.0",
        public_origin="https://assistant.example",
    )
    with TestClient(create_app(settings), base_url=settings.public_origin) as client:
        assert client.get("/").status_code == 200
        assert client.get("/api/status").status_code == 401
        client.headers["Authorization"] = "Bearer " + token
        assert (
            client.get("/api/status", headers={"Origin": settings.public_origin}).status_code == 200
        )
        assert (
            client.get("/api/status", headers={"Origin": "https://evil.example"}).status_code == 403
        )
        assert client.get("/api/status", headers={"Host": "evil.example"}).status_code == 400
        assert (
            client.get("/api/status", headers={"Origin": "http://assistant.example"}).status_code
            == 403
        )


@pytest.mark.parametrize(
    "origin",
    [
        "http://example.com",
        "https://example.com/",
        "https://user@example.com",
        "https://example.com/path",
    ],
)
def test_invalid_public_origin_rejected(origin):
    with pytest.raises(ValueError):
        Settings(public_origin=origin, token="a" * 64)


def test_public_binding_requires_origin_and_token():
    with pytest.raises(ValueError):
        Settings(host="0.0.0.0")
    with pytest.raises(ValueError):
        Settings(public_origin="https://assistant.example")


def test_render_port_from_environment(monkeypatch):
    monkeypatch.setenv("PORT", "10000")
    assert Settings.from_env().port == 10000


def test_public_binding_rejects_remote_clients_spoofing_localhost(tmp_path):
    """A public listener must not treat a forged Host header as local access."""
    settings = Settings(
        data_dir=tmp_path,
        token="a" * 64,
        host="0.0.0.0",
        public_origin="https://assistant.example",
    )
    app = create_app(settings)
    for host in ("127.0.0.1", "localhost"):
        with TestClient(
            app,
            base_url=f"http://{host}:{settings.port}",
            client=("203.0.113.10", 50000),
        ) as remote:
            remote.headers["Authorization"] = "Bearer " + settings.token
            assert remote.get("/api/status").status_code == 400
            assert remote.get("/").status_code == 400
        with TestClient(
            app,
            base_url=f"http://{host}:{settings.port}",
            client=("127.0.0.1", 50000),
        ) as local:
            local.headers["Authorization"] = "Bearer " + settings.token
            assert local.get("/api/status").status_code == 200
