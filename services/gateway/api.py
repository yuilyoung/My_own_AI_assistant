import hmac
import mimetypes
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .contracts import MemoryInput, SessionCreate, TurnInput
from .engine import Engine
from .providers import DemoLLM, MeloTTS, OllamaLLM, SilentTTS
from .speech import MAX_WAV_BYTES, WhisperCpp
from .store import Store
from .transcription import Transcriptions


class LocalGuard:
    """Reject hostile Host/Origin, authenticate all API calls and bound request bodies."""

    def __init__(self, app, settings: Settings):
        self.app, self.s = app, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        allowed_hosts = {f"127.0.0.1:{self.s.port}", f"localhost:{self.s.port}"}
        host = headers.get(b"host", b"").decode("latin1")
        origin = headers.get(b"origin", b"").decode("latin1")
        code = None
        if host not in allowed_hosts:
            code = 400
        elif origin and origin not in {"http://" + h for h in allowed_hosts}:
            code = 403
        elif scope["path"].startswith("/api/"):
            supplied = headers.get(b"authorization", b"")
            if not hmac.compare_digest(supplied, ("Bearer " + self.s.token).encode()):
                code = 401
        if code:
            return await JSONResponse({"detail": "Request not authorized"}, status_code=code)(
                scope, receive, send
            )
        audio_upload = (
            scope["method"] == "POST"
            and re.fullmatch(r"/api/sessions/[^/]+/transcriptions", scope["path"]) is not None
        )
        body_limit = MAX_WAV_BYTES if audio_upload else 16_384
        body = bytearray()
        if scope["method"] in {"POST", "PUT", "PATCH"}:
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > body_limit:
                    return await JSONResponse({"detail": "Body too large"}, status_code=413)(
                        scope, receive, send
                    )
                if not message.get("more_body", False):
                    break
            sent = False

            async def replay():
                nonlocal sent
                if not sent:
                    sent = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            receiver = replay
        else:
            receiver = receive

        async def secure_send(message):
            if message["type"] == "http.response.start":
                extra = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"x-frame-options", b"DENY"),
                    (
                        b"content-security-policy",
                        b"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
                    ),
                ]
                if scope["path"].startswith("/api/"):
                    extra.append((b"cache-control", b"no-store"))
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receiver, secure_send)


def create_app(settings: Settings) -> FastAPI:
    if not settings.token:
        raise ValueError("An access token is required; use python -m gateway.cli")
    # Separate demonstration data from genuine local conversations.
    partition = "demo" if settings.llm == "demo" else "local_private"
    store = Store(settings.data_dir / partition / "state.sqlite3")
    engine = Engine(
        store,
        DemoLLM() if settings.llm == "demo" else OllamaLLM(settings),
        SilentTTS() if settings.tts == "none" else MeloTTS(settings),
        settings.timeout,
    )

    recognizer = (
        WhisperCpp(
            settings.whisper_cli,
            settings.whisper_model,
            settings.data_dir / partition / "stt-tmp",
            settings.timeout,
        )
        if settings.stt == "whisper_cpp"
        else None
    )
    transcriptions = Transcriptions(store, recognizer)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await transcriptions.close()
        await engine.close()
        store.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine = engine
    app.state.transcriptions = transcriptions
    app.add_middleware(LocalGuard, settings=settings)

    @app.exception_handler(KeyError)
    async def missing(_, exc):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    @app.exception_handler(PermissionError)
    async def forbidden(_, exc):
        return JSONResponse({"detail": "Tool unavailable in this mode"}, status_code=403)

    @app.exception_handler(ValueError)
    async def invalid(_, exc):
        return JSONResponse({"detail": "Invalid request or capacity limit"}, status_code=422)

    @app.get("/api/status")
    async def status():
        return {
            "profile": partition,
            "llm": settings.llm,
            "tts": settings.tts,
            "model": settings.model if settings.llm == "ollama" else None,
            "cloud_enabled": False,
            "stt": settings.stt,
            "stt_enabled": transcriptions.provider is not None,
            "version": "0.2.0",
        }

    @app.post("/api/sessions", status_code=201)
    async def session(body: SessionCreate):
        return store.create_session(body)

    @app.get("/api/sessions/{sid}/history")
    async def history(sid: str):
        return store.history(sid)

    @app.post("/api/sessions/{sid}/turns", status_code=202)
    async def turn(sid: str, body: TurnInput):
        transcriptions.cancel_session(sid)
        return engine.start(sid, body.text)

    @app.get("/api/sessions/{sid}/turns/{tid}")
    async def turn_status(sid: str, tid: str):
        return engine.snapshot(sid, tid)

    @app.delete("/api/sessions/{sid}/turns/{tid}", status_code=204)
    async def cancel(sid: str, tid: str):
        engine.cancel(sid, tid)

    @app.get("/api/sessions/{sid}/audio/{aid}")
    async def audio(sid: str, aid: str):
        return Response(engine.get_audio(sid, aid), media_type="audio/wav")

    @app.post("/api/sessions/{sid}/transcriptions", status_code=202)
    async def transcribe(sid: str, request: Request):
        if transcriptions.provider is None:
            raise HTTPException(503, "STT disabled; configure local whisper.cpp")
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "audio/wav":
            raise HTTPException(415, "Expected audio/wav")
        job = transcriptions.start(sid, await request.body())
        if sid in engine.current:
            engine.cancel(sid, engine.current[sid])
        return job

    @app.get("/api/sessions/{sid}/transcriptions/{tid}")
    async def transcription_status(sid: str, tid: str):
        return transcriptions.snapshot(sid, tid)

    @app.delete("/api/sessions/{sid}/transcriptions/{tid}", status_code=204)
    async def cancel_transcription(sid: str, tid: str):
        transcriptions.cancel(sid, tid)

    @app.get("/api/sessions/{sid}/memories")
    async def memories(sid: str):
        return store.memories(sid)

    @app.post("/api/sessions/{sid}/memories", status_code=201)
    async def remember(sid: str, body: MemoryInput):
        return store.add_memory(sid, body.text)

    @app.delete("/api/sessions/{sid}/memories/{mid}", status_code=204)
    async def forget(sid: str, mid: str):
        if not store.delete_memory(sid, mid):
            raise KeyError(mid)

    @app.get("/api/sessions/{sid}/notes")
    async def notes(sid: str):
        return store.notes(sid)

    @app.post("/api/sessions/{sid}/notes", status_code=201)
    async def note(sid: str, body: MemoryInput):
        return store.add_note(sid, body.text)

    # Windows registry MIME mappings may classify .mjs as text/plain.
    mimetypes.add_type("text/javascript", ".mjs")
    if settings.web_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.web_dir, html=True), name="web")
    else:

        @app.get("/")
        async def no_frontend(request: Request):
            return JSONResponse({"detail": "Diagnostic UI missing. Run from the repository root."})

    return app
