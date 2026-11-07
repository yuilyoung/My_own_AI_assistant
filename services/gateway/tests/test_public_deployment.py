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
