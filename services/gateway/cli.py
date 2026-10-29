import os
import secrets
from dataclasses import replace

import uvicorn

from .api import create_app
from .config import Settings


def main():
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
    print("Local only. Keep this pairing URL private:")
    print(f"http://127.0.0.1:{settings.port}/#token={settings.token}")
    print(f"LLM={settings.llm}; TTS={settings.tts}; microphone/STT not implemented in this slice.")
    uvicorn.run(create_app(settings), host="127.0.0.1", port=settings.port, access_log=False)


if __name__ == "__main__":
    main()
