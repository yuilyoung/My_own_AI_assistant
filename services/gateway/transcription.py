"""Bounded, session-scoped transcription jobs, separate from persisted chat history."""

import asyncio
import time
from dataclasses import dataclass, field
from uuid import uuid4

from .contracts import TurnInput
from .speech import STT, validate_input_wav
from .store import Store


@dataclass
class Transcription:
    id: str
    session_id: str
    status: str = "queued"
    text: str | None = None
    error: str | None = None
    created: float = field(default_factory=time.monotonic)
    task: asyncio.Task | None = None

    def view(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "status": self.status,
            "text": self.text,
            "error": self.error,
        }


class Transcriptions:
    def __init__(self, store: Store, provider: STT | None):
        self.store, self.provider = store, provider
        self.jobs: dict[str, Transcription] = {}
        self.current: dict[str, str] = {}
        self.tasks: set[asyncio.Task] = set()
        self.inference = asyncio.Semaphore(1)

    def _prune(self):
        finished = [j for j in self.jobs.values() if j.status not in {"queued", "transcribing"}]
        ordered = sorted(finished, key=lambda j: j.created)
        for job in ordered:
            if time.monotonic() - job.created > 300 or len(self.jobs) > 50:
                self.jobs.pop(job.id, None)
                if self.current.get(job.session_id) == job.id:
                    self.current.pop(job.session_id, None)

    def start(self, sid: str, data: bytes) -> dict:
        self.store.session(sid)
        validate_input_wav(data)
        if self.provider is None:
            raise ValueError("STT disabled")
        self._prune()
        self.cancel_session(sid)
        if sum(j.status in {"queued", "transcribing"} for j in self.jobs.values()) >= 4:
            raise ValueError("Transcription queue full")
        job = Transcription(str(uuid4()), sid)
        self.jobs[job.id] = job
        self.current[sid] = job.id
        job.task = asyncio.create_task(self._run(job, data))
        self.tasks.add(job.task)
        job.task.add_done_callback(self.tasks.discard)
        return job.view()

    def _active(self, job):
        return self.current.get(job.session_id) == job.id and job.status in {
            "queued",
            "transcribing",
        }

    async def _run(self, job: Transcription, data: bytes):
        try:
            async with self.inference:
                if not self._active(job):
                    return
                job.status = "transcribing"
                text = await self.provider.transcribe(data)
                if self._active(job):
                    job.text = TurnInput(text=text).text
                    job.status = "completed"
        except asyncio.CancelledError:
            job.status = "cancelled"
            job.text = None
        except Exception:
            if self._active(job):
                job.status = "error"
                job.error = "STT_UNAVAILABLE_OR_INVALID_OUTPUT"
        finally:
            data = b""

    def snapshot(self, sid: str, tid: str) -> dict:
        self._prune()
        job = self.jobs.get(tid)
        if job is None or job.session_id != sid:
            raise KeyError(tid)
        return job.view()

    def cancel(self, sid: str, tid: str):
        self.snapshot(sid, tid)
        job = self.jobs[tid]
        already_cancelled = job.status == "cancelled"
        job.status, job.text, job.error = "cancelled", None, None
        if job.task and not job.task.done() and not already_cancelled:
            job.task.cancel()
        if self.current.get(sid) == tid:
            self.current.pop(sid, None)

    def cancel_session(self, sid: str):
        self._prune()
        tid = self.current.get(sid)
        if tid is not None:
            self.cancel(sid, tid)

    async def close(self):
        tasks = list(self.tasks)
        for job in list(self.jobs.values()):
            job.status, job.text = "cancelled", None
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.jobs.clear()
        self.current.clear()
