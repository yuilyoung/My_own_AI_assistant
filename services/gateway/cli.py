import argparse
import os
import secrets
import time
import webbrowser
from dataclasses import replace
from threading import Thread

import uvicorn

from .api import create_app
from .config import Settings


def open_browser_when_ready(server: uvicorn.Server, url: str) -> None:
    for _ in range(200):
        if server.should_exit:
            return
        if server.started:
            webbrowser.open(url)
            return
        time.sleep(0.1)


def main(argv: list[str] | None = None):
    parser = argparse.ArgumentParser(description="Start My own AI assistant")
    parser.add_argument(
        "--open-browser", action="store_true", help="Open the local app in a browser"
    )
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    if not settings.token:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        token_path = settings.data_dir / "access-token"
        try:
            fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(secrets.token_urlsafe(32))
        except FileExistsError:
            pass
        settings = replace(settings, token=token_path.read_text(encoding="utf-8").strip())
    if settings.public_origin:
        print(f"Public URL: {settings.public_origin}")
        print("Pair privately with /#token=<ASSISTANT_TOKEN>; token omitted from logs.")
    else:
        print("Local only. Keep this pairing URL private:")
        print(f"http://127.0.0.1:{settings.port}/#token={settings.token}")
    print(
        f"LLM={settings.llm}; TTS={settings.tts}; STT={settings.stt} (opt-in; transcript review before sending)."
    )
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(settings), host=settings.host, port=settings.port, access_log=False
        )
    )
    if args.open_browser and not settings.public_origin:
        Thread(
            target=open_browser_when_ready,
            args=(server, f"http://127.0.0.1:{settings.port}/"),
            daemon=True,
        ).start()
    server.run()


if __name__ == "__main__":
    main()
