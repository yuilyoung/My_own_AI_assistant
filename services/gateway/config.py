import ipaddress
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit


def loopback_endpoint(value: str) -> str:
    """No DNS resolution, proxy, credentials, paths or redirects for local providers."""
    u = urlsplit(value)
    try:
        valid = ipaddress.ip_address(u.hostname or "").is_loopback
    except ValueError:
        valid = False
    if (u.scheme != "http" or not valid or u.username or u.password
            or u.path not in ("", "/") or u.query or u.fragment or not u.port):
        raise ValueError("Provider URL must be http://<literal-loopback-IP>:<port>")
    return value.rstrip("/")


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(".local-data"))
    token: str = ""
    port: int = 8765
    llm: Literal["demo", "ollama"] = "demo"
    tts: Literal["none", "melo"] = "none"
    ollama_url: str = "http://127.0.0.1:11434"
    melo_url: str = "http://127.0.0.1:8766"
    melo_token: str = ""
    model: str = "qwen3:4b"
    timeout: float = 90.0
    web_dir: Path = field(default_factory=lambda: Path("apps/diagnostics"))

    def __post_init__(self):
        loopback_endpoint(self.ollama_url)
        loopback_endpoint(self.melo_url)
        if self.llm not in {"demo", "ollama"} or self.tts not in {"none", "melo"}:
            raise ValueError("Unknown provider; no fallback is allowed")
        if not 1024 <= self.port <= 65535 or self.timeout <= 0:
            raise ValueError("Invalid port/timeout")
        if not self.model or "cloud" in self.model.lower() or "/" in self.model:
            raise ValueError("Use an explicitly local Ollama model tag")
        if self.token and len(self.token) < 32:
            raise ValueError("Token must have at least 32 characters")
        if self.tts == "melo" and len(self.melo_token) < 32:
            raise ValueError("MELO_TOKEN must have at least 32 characters")

    @classmethod
    def from_env(cls):
        return cls(
            data_dir=Path(os.getenv("ASSISTANT_DATA_DIR", ".local-data")),
            token=os.getenv("ASSISTANT_TOKEN", ""),
            port=int(os.getenv("ASSISTANT_PORT", "8765")),
            llm=os.getenv("LLM_PROVIDER", "demo"),
            tts=os.getenv("TTS_PROVIDER", "none"),
            ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434"),
            melo_url=os.getenv("MELO_URL", "http://127.0.0.1:8766"),
            melo_token=os.getenv("MELO_TOKEN", ""),
            model=os.getenv("OLLAMA_MODEL", "qwen3:4b"),
        )
