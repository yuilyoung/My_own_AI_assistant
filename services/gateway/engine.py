import asyncio
import time
from dataclasses import dataclass, field
from uuid import uuid4

from .contracts import Reply
from .policy import system_prompt
from .providers import LLM, TTS, validate_wav
from .store import Store


@dataclass
class Turn:
    id: str
    session_id: str
    generation: int
    text: str
    status: str = "thinking"
    segments: list = field(default_factory=list)
    warning: str | None = None
    error: str | None = None
    created: float = field(default_factory=time.monotonic)
    task: asyncio.Task | None = None

    def view(self) -> dict:
        return {"id": self.id, "session_id": self.session_id, "generation": self.generation,
                "status": self.status, "segments": list(self.segments),
                "warning": self.warning, "error": self.error}


class Engine:
    def __init__(self, store: Store, llm: LLM, tts: TTS, timeout: float = 90):
        self.store, self.llm, self.tts, self.timeout = store, llm, tts, timeout
        self.turns: dict[str, Turn] = {}
        self.current: dict[str, str] = {}
        self.generations: dict[str, int] = {}
        self.audio: dict[str, tuple[str, str, float, bytes]] = {}
        self.tasks: set[asyncio.Task] = set()
        self.inference = asyncio.Semaphore(1)

    def _prune(self):
        now = time.monotonic()
        for aid, (_, _, created, _) in list(self.audio.items()):
            if now - created > 300:
                del self.audio[aid]
        completed = [t for t in self.turns.values() if t.status in {"completed", "cancelled", "error"}]
        for t in sorted(completed, key=lambda t: t.created)[:-50]:
            self.turns.pop(t.id, None)
            if self.current.get(t.session_id) == t.id:
                self.current.pop(t.session_id, None)

    def start(self, sid: str, text: str) -> dict:
        self.store.session(sid)
        self._prune()
        if sid in self.current:
            self.cancel(sid, self.current[sid])
        if sum(t.status in {"thinking", "synthesizing"} for t in self.turns.values()) >= 4:
            raise ValueError("Too many active turns")
        gen = self.generations.get(sid, 0) + 1
        self.generations[sid] = gen
        t = Turn(str(uuid4()), sid, gen, text)
        self.turns[t.id] = t
        self.current[sid] = t.id
        t.task = asyncio.create_task(self._run(t))
        self.tasks.add(t.task)
        t.task.add_done_callback(self.tasks.discard)
        return t.view()

    def _active(self, t: Turn):
        return self.current.get(t.session_id) == t.id and t.status not in {"cancelled", "error"}

    async def _run(self, t: Turn):
        try:
            s = self.store.session(t.session_id)
            prompt = [{"role": "system", "content": system_prompt(s["mode"], self.store.memories(s["id"]))}]
            prompt += self.store.history(s["id"])
            prompt += [{"role": "user", "content": t.text}]
            async with self.inference:
                if not self._active(t):
                    return
                reply = await asyncio.wait_for(self.llm.reply(prompt), self.timeout)
                reply = Reply.model_validate(reply)
                if not self._active(t):
                    return
                t.status = "synthesizing"
                for segment in reply.segments:
                    if not self._active(t):
                        return
                    audio_id = None
                    try:
                        wav = await asyncio.wait_for(self.tts.synthesize(segment.text), self.timeout)
                        if not self._active(t):
                            return
                        if wav:
                            validate_wav(wav)
                            audio_id = str(uuid4())
                            # Bound all in-memory audio, evict oldest; never persist recordings.
                            while self.audio and sum(len(a[3]) for a in self.audio.values()) + len(wav) > 32_000_000:
                                self.audio.pop(next(iter(self.audio)))
                            self.audio[audio_id] = (t.session_id, t.id, time.monotonic(), wav)
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        t.warning = "TTS_UNAVAILABLE"
                    if not self._active(t):
                        return
                    t.segments.append({**segment.model_dump(), "audio_id": audio_id})
                if self._active(t):
                    self.store.save_exchange(t.session_id, t.id, t.text, reply.model_dump())
                    t.status = "completed"
        except asyncio.CancelledError:
            t.status = "cancelled"
        except Exception:
            if self._active(t):
                t.status = "error"
                t.error = "LLM_UNAVAILABLE_OR_INVALID_REPLY"

    def snapshot(self, sid: str, tid: str) -> dict:
        t = self.turns.get(tid)
        if t is None or t.session_id != sid:
            raise KeyError(tid)
        return t.view()

    def cancel(self, sid: str, tid: str):
        self.snapshot(sid, tid)
        t = self.turns[tid]
        t.status = "cancelled"
        if t.task and not t.task.done():
            t.task.cancel()
        t.segments.clear()
        for aid, (owner, turn, _, _) in list(self.audio.items()):
            if owner == sid and turn == tid:
                del self.audio[aid]
        if self.current.get(sid) == tid:
            self.current.pop(sid)

    def get_audio(self, sid: str, aid: str) -> bytes:
        self._prune()
        record = self.audio.get(aid)
        if record is None or record[0] != sid:
            raise KeyError(aid)
        return record[3]

    async def close(self):
        tasks = list(self.tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.audio.clear()
