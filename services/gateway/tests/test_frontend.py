from pathlib import Path

from fastapi.testclient import TestClient
from gateway.api import create_app
from gateway.config import Settings


def test_selects_built_react_only_when_index_exists(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert Settings().web_dir == Path("apps/diagnostics")
    built = Path("apps/web/dist")
    built.mkdir(parents=True)
    assert Settings().web_dir == Path("apps/diagnostics")
    (built / "index.html").write_text("<h1>React</h1>")
    assert Settings().web_dir == built


def test_frontend_environment_override(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSISTANT_WEB_DIR", str(tmp_path))
    assert Settings.from_env().web_dir == tmp_path


def test_serves_worklet_as_script_and_keeps_api_protected(tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<h1>React</h1>")
    (web / "capture.mjs").write_text('registerProcessor("capture", class {});')
    settings = Settings(data_dir=tmp_path / "data", token="t" * 32, web_dir=web)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:8765") as client:
        assert "React" in client.get("/").text
        response = client.get("/capture.mjs")
        assert response.status_code == 200
        assert "javascript" in response.headers["content-type"]
        assert "script-src 'self'" in response.headers["content-security-policy"]
        assert client.get("/api/status").status_code == 401
        assert (
            client.get(
                "/api/status",
                headers={
                    "Origin": "http://evil.example",
                    "Authorization": "Bearer " + settings.token,
                },
            ).status_code
            == 403
        )
