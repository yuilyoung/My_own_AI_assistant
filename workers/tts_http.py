"""Shared HTTP and PCM contracts for the optional local speech workers."""

import hmac
import io
import threading
import wave
from collections.abc import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=400)


def create_worker_app(
    token: str, name: str, port: int, body_type: type[TextInput], synthesize: Callable
):
    if len(token) < 32:
        raise ValueError("Worker token must have at least 32 characters")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    busy = threading.Lock()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.headers.get("host") not in {f"127.0.0.1:{port}", f"localhost:{port}"}:
            return JSONResponse({"detail": "Invalid host"}, status_code=400)
        if request.headers.get("origin"):
            return JSONResponse({"detail": "Browser access is disabled"}, status_code=403)
        if not hmac.compare_digest(
            request.headers.get("authorization", "").encode(), ("Bearer " + token).encode()
        ):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        size = 0
        body = bytearray()
        async for chunk in request.stream():
            size += len(chunk)
            if size > 4096:
                return JSONResponse({"detail": "Body too large"}, status_code=413)
            body.extend(chunk)
        # Starlette caches request.body(); subsequent parsing uses the same bytes.
        request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    def guarded_synthesis(body):
        # Remains locked even if the HTTP client disconnects during inference.
        if not busy.acquire(blocking=False):
            raise HTTPException(429, "Worker is busy")
        try:
            return synthesize(body)
        finally:
            busy.release()

    @app.get("/health")
    async def health():
        # Authentication is enforced by the shared middleware; no inference runs here.
        return {"status": "reachable", "worker": name}

    @app.post("/synthesize")
    async def tts(body: body_type):
        try:
            data = await run_in_threadpool(guarded_synthesis, body)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Synthesis failed") from None
        return Response(data, media_type="audio/wav")

    return app


def pcm16_wav(samples, rate: int) -> bytes:
    import numpy as np

    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim != 1 or not samples.size or not np.isfinite(samples).all():
        raise ValueError("Invalid audio")
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm)
    return buffer.getvalue()
