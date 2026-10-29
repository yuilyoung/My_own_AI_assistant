import asyncio
import pytest
from gateway.contracts import Reply, SessionCreate
from gateway.store import Store
from gateway.engine import Engine
from gateway.providers import DemoLLM, SilentTTS


class CapturingLLM:
    def __init__(self): self.prompts = []
    async def reply(self, messages):
        self.prompts.append(messages)
        return Reply.model_validate({"segments": [{"text": "답변입니다."}]})

async def settled(engine, sid, tid):
    for _ in range(100):
        view = engine.snapshot(sid, tid)
        if view["status"] in {"completed", "cancelled", "error"}: return view
        await asyncio.sleep(.01)
    raise AssertionError("turn did not settle")


def test_scoped_memory_persists_and_deletes(tmp_path):
    path = tmp_path / "state.sqlite"
    s = Store(path)
    a = s.create_session(SessionCreate(mode="assistant"))
    c = s.create_session(SessionCreate(mode="companion"))
    memory = s.add_memory(a["id"], "업무 비밀")
    assert s.memories(c["id"]) == []
    assert not s.delete_memory(c["id"], memory["id"])
    s.close()
    s = Store(path)
    assert s.memories(a["id"])[0]["text"] == "업무 비밀"
    assert s.delete_memory(a["id"], memory["id"])
    assert s.memories(a["id"]) == []
    s.close()

async def test_mode_memory_not_in_other_prompt(tmp_path):
    s = Store(tmp_path / "db")
    a = s.create_session(SessionCreate(mode="assistant")); c = s.create_session(SessionCreate(mode="companion"))
    s.add_memory(a["id"], "SECRET_XYZ")
    llm = CapturingLLM(); e = Engine(s, llm, SilentTTS())
    t = e.start(c["id"], "안녕")
    assert (await settled(e,c["id"],t["id"]))["status"] == "completed"
    assert "SECRET_XYZ" not in str(llm.prompts)
    await e.close(); s.close()

async def test_late_provider_cannot_revive_cancelled_turn(tmp_path):
    class Slow:
        async def reply(self, messages):
            try: await asyncio.sleep(1)
            except asyncio.CancelledError: pass  # simulates a non-cancellable provider
            return Reply.model_validate({"segments": [{"text": "늦게 온 답변"}]})
    s=Store(tmp_path/"db"); a=s.create_session(SessionCreate(mode="assistant")); e=Engine(s,Slow(),SilentTTS())
    t=e.start(a["id"],"안녕"); await asyncio.sleep(.01)
    e.cancel(a["id"], t["id"]); await asyncio.sleep(.03)
    v=e.snapshot(a["id"], t["id"])
    assert v["status"] == "cancelled" and v["segments"] == []
    assert s.history(a["id"]) == []
    await e.close(); s.close()

async def test_new_turn_replaces_old_and_cross_session_lookup_denied(tmp_path):
    s=Store(tmp_path/"db"); a=s.create_session(SessionCreate(mode="assistant")); c=s.create_session(SessionCreate(mode="companion"))
    e=Engine(s,DemoLLM(),SilentTTS())
    one=e.start(a["id"],"one"); two=e.start(a["id"],"two")
    assert e.snapshot(a["id"],one["id"])["status"] == "cancelled"
    with pytest.raises(KeyError): e.snapshot(c["id"],two["id"])
    assert (await settled(e,a["id"],two["id"]))["generation"] == 2
    await e.close(); s.close()

async def test_provider_error_has_no_sensitive_detail(tmp_path):
    class Broken:
        async def reply(self, messages): raise RuntimeError("SECRET_API_KEY")
    s=Store(tmp_path/"db"); a=s.create_session(SessionCreate(mode="assistant")); e=Engine(s,Broken(),SilentTTS())
    t=e.start(a["id"],"hello"); v=await settled(e,a["id"],t["id"])
    assert v["status"] == "error" and "SECRET_API_KEY" not in str(v)
    await e.close(); s.close()

async def test_audio_is_session_bound_and_removed_on_cancel(tmp_path):
    from test_providers import wav_bytes
    class Voice:
        async def synthesize(self,text):return wav_bytes()
    s=Store(tmp_path/"db");a=s.create_session(SessionCreate(mode="assistant"));c=s.create_session(SessionCreate(mode="companion"))
    e=Engine(s,DemoLLM(),Voice());t=e.start(a["id"],"안녕");v=await settled(e,a["id"],t["id"])
    aid=v["segments"][0]["audio_id"]
    assert e.get_audio(a["id"],aid)==wav_bytes()
    with pytest.raises(KeyError):e.get_audio(c["id"],aid)
    e.cancel(a["id"],t["id"])
    with pytest.raises(KeyError):e.get_audio(a["id"],aid)
    await e.close();s.close()

async def test_tts_failure_keeps_text_and_explicit_warning(tmp_path):
    class Voice:
        async def synthesize(self,text):raise RuntimeError("secret")
    s=Store(tmp_path/"db");a=s.create_session(SessionCreate(mode="assistant"));e=Engine(s,DemoLLM(),Voice())
    t=e.start(a["id"],"안녕");v=await settled(e,a["id"],t["id"])
    assert v["status"]=="completed" and v["warning"]=="TTS_UNAVAILABLE"
    assert v["segments"][0]["audio_id"] is None
    assert "secret" not in str(v)
    await e.close();s.close()

async def test_pruned_session_current_can_start_again(tmp_path):
    s=Store(tmp_path/"db");a=s.create_session(SessionCreate(mode="assistant"));e=Engine(s,DemoLLM(),SilentTTS())
    old=e.start(a["id"],"first");await settled(e,a["id"],old["id"])
    for n in range(52):
        c=s.create_session(SessionCreate(mode="companion"));t=e.start(c["id"],str(n));await settled(e,c["id"],t["id"])
    t=e.start(a["id"],"return")
    assert (await settled(e,a["id"],t["id"]))["status"]=="completed"
    await e.close();s.close()
