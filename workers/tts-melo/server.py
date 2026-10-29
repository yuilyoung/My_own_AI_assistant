"""Optional isolated MeloTTS worker. ML imports/downloads happen only in main()."""
import hmac
import io
import os
import threading
import wave

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=400)


def create_app(token, synthesize):
    if len(token) < 32:
        raise ValueError("Set a random MELO_TOKEN with at least 32 characters")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    busy = threading.Lock()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.headers.get("host") not in {"127.0.0.1:8766", "localhost:8766"}:
            return JSONResponse({"detail": "Invalid host"}, status_code=400)
        if request.headers.get("origin"):
            return JSONResponse({"detail": "Browser access is disabled"}, status_code=403)
        if not hmac.compare_digest(request.headers.get("authorization", "").encode(),
                                   ("Bearer " + token).encode()):
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

    def guarded_synthesis(text):
        # Remains locked even if the HTTP client disconnects during inference.
        if not busy.acquire(blocking=False):
            raise HTTPException(429, "Worker is busy")
        try:
            return synthesize(text)
        finally:
            busy.release()

    @app.post("/synthesize")
    async def tts(body: TextInput):
        try:
            data = await run_in_threadpool(guarded_synthesis, body.text)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Synthesis failed") from None
        return Response(data, media_type="audio/wav")

    return app


def main():
    token = os.environ.get("MELO_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("Set MELO_TOKEN before starting this worker.")
    # This optional environment must contain a user-installed, reviewed MeloTTS revision.
    import numpy as np
    import uvicorn
    from melo.api import TTS

    model = TTS(language="KR", device=os.environ.get("MELO_DEVICE", "cpu"))
    speaker_id = model.hps.data.spk2id["KR"]

    def synthesize(text):
        samples = model.tts_to_file(text, speaker_id, output_path=None, quiet=True)
        if not np.isfinite(samples).all():
            raise ValueError("Invalid audio")
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(model.hps.data.sampling_rate)
            output.writeframes(pcm)
        return buffer.getvalue()

    uvicorn.run(create_app(token, synthesize), host="127.0.0.1", port=8766, access_log=False)


if __name__ == "__main__":
    main()
