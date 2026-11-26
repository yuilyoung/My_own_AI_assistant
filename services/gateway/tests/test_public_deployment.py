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


def test_public_origin_rejects_unprotected_local_avatar_mount(tmp_path):
    """A token on /api is not authentication for /avatar-local static files."""
    models = tmp_path / "private-cubism-export"
    models.mkdir()
    # Local-only use still serves explicitly installed model files.
    (models / "owned.model3.json").write_text('{"Version": 3}', encoding="utf-8")
    local_settings = Settings(
        data_dir=tmp_path / "data",
        token="b" * 64,
        avatar_dir=models,
    )
    with TestClient(
        create_app(local_settings),
        base_url="http://127.0.0.1:8765",
        client=("127.0.0.1", 50000),
    ) as local:
        model = local.get("/avatar-local/owned.model3.json")
        assert model.status_code == 200
        assert model.json() == {"Version": 3}

    with pytest.raises(ValueError, match="Public avatar assets"):
        Settings(
            token="a" * 64,
            host="0.0.0.0",
            public_origin="https://assistant.example",
            avatar_dir=models,
        )


def test_public_origin_never_serves_private_avatar_bytes_from_web_build(tmp_path):
    """Vite can copy public/avatar-local into dist even without avatar_dir."""
    web = tmp_path / "dist"
    asset = web / "avatar-local"
    asset.mkdir(parents=True)
    (web / "index.html").write_text("app", encoding="utf-8")
    (asset / "private.moc3").write_bytes(b"private-model-placeholder")

    settings = Settings(
        token="a" * 64,
        host="0.0.0.0",
        public_origin="https://assistant.example",
        web_dir=web,
        data_dir=tmp_path / "data",
    )
    with TestClient(create_app(settings), base_url=settings.public_origin) as client:
        assert client.get("/").status_code == 200
        assert client.get("/avatar-local/private.moc3").status_code == 404
        assert client.get("/avatar-local").status_code == 404
