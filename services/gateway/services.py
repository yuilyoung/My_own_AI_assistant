"""Per-service runtimes: persisted sessions determine routing, never the current default."""

from dataclasses import dataclass

from .config import Settings
from .contracts import Service
from .engine import Engine
from .providers import CloudLLM, DemoLLM, MeloTTS, OllamaLLM, SilentTTS
from .speech import WhisperCpp
from .store import Store
from .transcription import Transcriptions


@dataclass
class ServiceRuntime:
    id: Service
    label: str
    partition: str
    available: bool
    model: str | None
    reason: str | None
    engine: Engine
    transcriptions: Transcriptions

    @property
    def store(self) -> Store:
        return self.engine.store

    def view(self) -> dict:
        result = {
            "id": self.id,
            "label": self.label,
            "available": self.available,
            "model": self.model,
        }
        if self.reason:
            result["reason"] = self.reason
        return result


class Services:
    def __init__(self, settings: Settings):
        self.default_service: Service = {"demo": "demo", "ollama": "local", "cloud": "cloud"}[
            settings.llm
        ]
        cloud_available = bool(settings.cloud_api_key and settings.cloud_model)
        definitions = [
            ("demo", "데모", "demo", True, None, None, DemoLLM()),
            (
                "local",
                "로컬 Ollama",
                "local_private",
                settings.local_llm_enabled,
                settings.model,
                None
                if settings.local_llm_enabled
                else "서버에서 LOCAL_LLM_ENABLED=true를 설정하고 Ollama를 실행하세요.",
                OllamaLLM(settings),
            ),
            (
                "cloud",
                "클라우드 API",
                "cloud_private",
                cloud_available,
                settings.cloud_model or None,
                None if cloud_available else "서버에 CLOUD_API_KEY와 CLOUD_MODEL을 설정하세요.",
                CloudLLM(settings),
            ),
        ]
        self.runtimes: dict[Service, ServiceRuntime] = {}
        for service, label, partition, available, model, reason, llm in definitions:
            directory = settings.data_dir / partition
            store = Store(directory / "state.sqlite3")
            engine = Engine(
                store,
                llm,
                SilentTTS() if settings.tts == "none" else MeloTTS(settings),
                settings.timeout,
            )
            recognizer = (
                WhisperCpp(
                    settings.whisper_cli,
                    settings.whisper_model,
                    directory / "stt-tmp",
                    settings.timeout,
                )
                if settings.stt == "whisper_cpp"
                else None
            )
            self.runtimes[service] = ServiceRuntime(
                service,
                label,
                partition,
                available,
                model,
                reason,
                engine,
                Transcriptions(store, recognizer),
            )

    @property
    def default(self) -> ServiceRuntime:
        return self.runtimes[self.default_service]

    def for_session(self, sid: str) -> ServiceRuntime:
        # Also handles sessions created before service switching existed and
        # survives restarts/default changes without copying any private data.
        for runtime in self.runtimes.values():
            try:
                runtime.store.session(sid)
            except KeyError:
                continue
            return runtime
        raise KeyError(sid)

    async def close(self):
        for runtime in self.runtimes.values():
            await runtime.transcriptions.close()
            await runtime.engine.close()
            runtime.store.close()
