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
    if (
        u.scheme != "http"
        or not valid
        or u.username
        or u.password
        or u.path not in ("", "/")
        or u.query
        or u.fragment
        or not u.port
    ):
        raise ValueError("Provider URL must be http://<literal-loopback-IP>:<port>")
    return value.rstrip("/")


def default_web_dir() -> Path:
    built = Path("apps/web/dist")
    return built if (built / "index.html").is_file() else Path("apps/diagnostics")


def optional_env_bool(name: str) -> bool | None:
    value = os.getenv(name)
    if value is None:
        return None
    if value.strip().lower() in {"true", "1"}:
        return True
    if value.strip().lower() in {"false", "0"}:
        return False
    raise ValueError(f"{name} must be true/false or 1/0")


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(".local-data"))
    token: str = ""
    host: str = "127.0.0.1"
    public_origin: str = ""
    port: int = 8765
    llm: Literal["demo", "ollama", "cloud"] = "demo"
    local_llm_enabled: bool | None = None
    cloud_api_key: str = field(default="", repr=False)
    cloud_model: str = ""
    cloud_base_url: str = "https://api.openai.com/v1"
    tts: Literal["none", "melo"] = "none"
    stt: Literal["none", "whisper_cpp"] = "none"
    whisper_cli: Path | None = None
    whisper_model: Path | None = None
    ollama_url: str = "http://127.0.0.1:11434"
    melo_url: str = "http://127.0.0.1:8766"
    melo_token: str = ""
    model: str = "qwen3:4b"
    timeout: float = 90.0
    web_dir: Path = field(default_factory=default_web_dir)
    avatar_dir: Path | None = None

    @property
    def cloud_configured(self) -> bool:
        return bool(self.cloud_api_key and self.cloud_model)

    def __post_init__(self):
        if self.host not in {"127.0.0.1", "0.0.0.0"}:
            raise ValueError("Unsupported bind address")
        if self.public_origin:
            u = urlsplit(self.public_origin)
            if (
                u.scheme != "https"
                or not u.hostname
                or u.username
                or u.password
                or u.path
                or u.query
                or u.fragment
                or u.port not in (None, 443)
            ):
                raise ValueError("Public origin must be an HTTPS origin without a path")
            if len(self.token) < 32:
                raise ValueError("Public deployment requires an explicit access token")
        if self.host == "0.0.0.0" and not self.public_origin:
            raise ValueError("Public binding requires ASSISTANT_PUBLIC_ORIGIN")
        loopback_endpoint(self.ollama_url)
        loopback_endpoint(self.melo_url)
        if self.local_llm_enabled is None:
            object.__setattr__(self, "local_llm_enabled", self.llm == "ollama")
        elif type(self.local_llm_enabled) is not bool:
            raise ValueError("local_llm_enabled must be a boolean")
        try:
            cloud = urlsplit(self.cloud_base_url)
            cloud_port = cloud.port
        except ValueError:
            raise ValueError("Cloud base URL must be a valid HTTPS URL") from None
        if (
            cloud.scheme != "https"
            or not cloud.hostname
            or any(c.isspace() or c == "\\" for c in self.cloud_base_url)
            or cloud_port is not None
            and not 1 <= cloud_port <= 65535
            or cloud.username is not None
            or cloud.password is not None
            or cloud.query
            or cloud.fragment
        ):
            raise ValueError("Cloud base URL must be HTTPS without credentials, query or fragment")
        object.__setattr__(self, "cloud_base_url", self.cloud_base_url.rstrip("/"))
        if self.avatar_dir is not None and not self.avatar_dir.is_dir():
            raise ValueError("ASSISTANT_AVATAR_DIR must be an existing directory")
        if self.public_origin and self.avatar_dir is not None:
            # /avatar-local is a static mount, not covered by /api bearer
            # authentication. Never publish private Cubism exports by accident.
            raise ValueError(
                "Public avatar assets require authenticated delivery; "
                "ASSISTANT_AVATAR_DIR is supported only for loopback deployments"
            )
        if self.stt not in {"none", "whisper_cpp"}:
            raise ValueError("Unknown STT provider")
        if self.stt == "whisper_cpp":
            if (
                self.whisper_cli is None
                or self.whisper_model is None
                or not self.whisper_cli.is_file()
                or not self.whisper_model.is_file()
            ):
                raise ValueError("Configure existing WHISPER_CLI and WHISPER_MODEL files")
            if ".en." in self.whisper_model.name.lower():
                raise ValueError("Korean STT requires a multilingual model, not .en")
        if self.llm not in {"demo", "ollama", "cloud"} or self.tts not in {"none", "melo"}:
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
            web_dir=Path(os.environ["ASSISTANT_WEB_DIR"])
            if os.getenv("ASSISTANT_WEB_DIR")
            else default_web_dir(),
            data_dir=Path(os.getenv("ASSISTANT_DATA_DIR", ".local-data")),
            token=os.getenv("ASSISTANT_TOKEN", ""),
            host=os.getenv("ASSISTANT_HOST", "127.0.0.1"),
            public_origin=os.getenv("ASSISTANT_PUBLIC_ORIGIN", ""),
            port=int(os.getenv("PORT", os.getenv("ASSISTANT_PORT", "8765"))),
            llm=os.getenv("LLM_PROVIDER", "demo"),
            local_llm_enabled=optional_env_bool("LOCAL_LLM_ENABLED"),
            cloud_api_key=os.getenv("CLOUD_API_KEY", "").strip(),
            cloud_model=os.getenv("CLOUD_MODEL", "").strip(),
            cloud_base_url=os.getenv("CLOUD_BASE_URL", "https://api.openai.com/v1"),
            avatar_dir=Path(os.environ["ASSISTANT_AVATAR_DIR"])
            if os.getenv("ASSISTANT_AVATAR_DIR")
            else None,
            tts=os.getenv("TTS_PROVIDER", "none"),
            stt=os.getenv("STT_PROVIDER", "none"),
            whisper_cli=Path(os.environ["WHISPER_CLI"]) if os.getenv("WHISPER_CLI") else None,
            whisper_model=Path(os.environ["WHISPER_MODEL"]) if os.getenv("WHISPER_MODEL") else None,
            ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434"),
            melo_url=os.getenv("MELO_URL", "http://127.0.0.1:8766"),
            melo_token=os.getenv("MELO_TOKEN", ""),
            model=os.getenv("OLLAMA_MODEL", "qwen3:4b"),
        )
