from threading import Event

from gateway import cli
from gateway.config import Settings


def test_local_launcher_opens_browser_after_the_gateway_starts(monkeypatch):
    ready = Event()
    urls = []

    class Server:
        started = False
        should_exit = False

        def __init__(self, config):
            assert config.port == 8877

        def run(self):
            assert not urls
            self.started = True
            assert ready.wait(2)

    def open_browser(url):
        urls.append(url)
        ready.set()

    monkeypatch.setattr(Settings, "from_env", lambda: Settings(token="t" * 40, port=8877))
    monkeypatch.setattr(cli, "create_app", lambda settings: object())
    monkeypatch.setattr(cli.uvicorn, "Server", Server)
    monkeypatch.setattr("webbrowser.open", open_browser)

    cli.main(["--open-browser"])

    assert urls == ["http://127.0.0.1:8877/"]
