import asyncio
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from gateway.api import create_app
from gateway.config import Settings
from gateway.contracts import SessionCreate
from gateway.store import Store
from gateway.tests.test_speech import wav_bytes

TOKEN = 'local-transcription-test-token-at-least-32-characters'


class ImmediateSTT:
    async def transcribe(self, data):
        return '오늘 일정 알려 줘.'


async def finish(manager, sid, tid):
    for _ in range(100):
        result = manager.snapshot(sid, tid)
        if result['status'] not in {'queued', 'transcribing'}:
            return result
        await asyncio.sleep(0.001)
    raise AssertionError('job did not finish')


@pytest.mark.asyncio
async def test_job_success_is_scoped_and_not_persisted(tmp_path):
    from gateway.transcription import Transcriptions
    store = Store(tmp_path/'db.sqlite3')
    a = store.create_session(SessionCreate(mode='assistant'))['id']
    b = store.create_session(SessionCreate(mode='companion'))['id']
    manager = Transcriptions(store, ImmediateSTT())
    job = manager.start(a, wav_bytes())
    done = await finish(manager, a, job['id'])
    assert done['status'] == 'completed'
    assert done['text'] == '오늘 일정 알려 줘.'
    assert store.history(a) == []
    assert store.history(b) == []
    with pytest.raises(KeyError): manager.snapshot(b, job['id'])
    with pytest.raises(KeyError): manager.cancel(b, job['id'])
    manager.cancel(a, job['id'])
    assert manager.snapshot(a, job['id'])['text'] is None
    await manager.close(); store.close()


@pytest.mark.asyncio
async def test_cancel_discards_late_transcription_and_limits_queue(tmp_path):
    from gateway.transcription import Transcriptions
    entered = asyncio.Event()
    class SlowSTT:
        async def transcribe(self, data):
            entered.set()
            try: await asyncio.Event().wait()
            except asyncio.CancelledError: return 'late text must disappear'
    store = Store(tmp_path/'db.sqlite3')
    manager = Transcriptions(store, SlowSTT())
    sessions = [store.create_session(SessionCreate(mode='assistant'))['id'] for _ in range(5)]
    jobs = [manager.start(s, wav_bytes()) for s in sessions[:4]]
    with pytest.raises(ValueError): manager.start(sessions[4], wav_bytes())
    await entered.wait()
    manager.cancel(sessions[0], jobs[0]['id'])
    await asyncio.sleep(0.01)
    result = manager.snapshot(sessions[0], jobs[0]['id'])
    assert result['status'] == 'cancelled' and result['text'] is None
    await manager.close(); store.close()


@pytest.mark.asyncio
async def test_failure_and_new_job_invalidate_old_result(tmp_path):
    from gateway.transcription import Transcriptions
    class BrokenSTT:
        async def transcribe(self, data):
            raise RuntimeError('/private/path SECRET raw transcript')
    store = Store(tmp_path/'db.sqlite3')
    sid = store.create_session(SessionCreate(mode='assistant'))['id']
    manager = Transcriptions(store, BrokenSTT())
    first = manager.start(sid, wav_bytes())
    failed = await finish(manager, sid, first['id'])
    assert failed['error'] == 'STT_UNAVAILABLE_OR_INVALID_OUTPUT'
    assert 'SECRET' not in str(failed)
    manager.provider = ImmediateSTT()
    second = manager.start(sid, wav_bytes())
    assert manager.snapshot(sid, first['id'])['status'] == 'cancelled'
    assert (await finish(manager, sid, second['id']))['text']
    await manager.close(); store.close()


def test_settings_require_explicit_local_dependencies(tmp_path, monkeypatch):
    exe=tmp_path/'whisper-cli'; exe.touch()
    model=tmp_path/'ggml-small.bin'; model.touch()
    settings=Settings(token=TOKEN, data_dir=tmp_path, stt='whisper_cpp', whisper_cli=exe, whisper_model=model)
    assert settings.stt == 'whisper_cpp'
    with pytest.raises(ValueError): replace(settings, whisper_cli=tmp_path/'missing')
    english=tmp_path/'ggml-small.en.bin'; english.touch()
    with pytest.raises(ValueError): replace(settings, whisper_model=english)
    monkeypatch.setenv('STT_PROVIDER','whisper_cpp')
    monkeypatch.setenv('WHISPER_CLI',str(exe))
    monkeypatch.setenv('WHISPER_MODEL',str(model))
    assert Settings.from_env().whisper_model == model


def test_api_default_disabled_and_guard_limits(tmp_path):
    app=create_app(Settings(token=TOKEN,data_dir=tmp_path))
    with TestClient(app,base_url='http://127.0.0.1:8765') as client:
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'audio/wav'}
        assert client.post('/api/sessions/unknown/transcriptions',content=wav_bytes()).status_code == 401
        client.headers['Authorization']='Bearer '+TOKEN
        sid=client.post('/api/sessions',json={'mode':'assistant'}).json()['id']
        path=f'/api/sessions/{sid}/transcriptions'
        assert client.post(path,content=wav_bytes(),headers=headers).status_code == 503
        assert client.post(path,content=b'x'*964097,headers=headers).status_code == 413
        assert client.post('/api/sessions',content=b'x'*20000).status_code == 413
        assert client.get('/api/status').json()['stt_enabled'] is False


def test_api_recognition_contract_and_same_session_only(tmp_path):
    app=create_app(Settings(token=TOKEN,data_dir=tmp_path))
    # Replace only the unavailable external recognizer; exercise the actual manager/routes/guard.
    app.state.transcriptions.provider = ImmediateSTT()
    with TestClient(app,base_url='http://127.0.0.1:8765') as client:
        client.headers['Authorization']='Bearer '+TOKEN
        a=client.post('/api/sessions',json={'mode':'assistant'}).json()['id']
        b=client.post('/api/sessions',json={'mode':'companion'}).json()['id']
        path=f'/api/sessions/{a}/transcriptions'
        assert client.post(path,content=wav_bytes()).status_code == 415
        assert client.post(path,content=b'webm',headers={'Content-Type':'audio/wav'}).status_code == 422
        assert client.post('/api/sessions/missing/transcriptions',content=wav_bytes(),headers={'Content-Type':'audio/wav'}).status_code == 404
        response=client.post(path,content=wav_bytes(frames=16000),headers={'Content-Type':'audio/wav'})
        assert response.status_code == 202
        tid=response.json()['id']
        assert client.get(f'/api/sessions/{b}/transcriptions/{tid}').status_code == 404
        assert client.delete(f'/api/sessions/{b}/transcriptions/{tid}').status_code == 404
        for _ in range(100):
            result=client.get(path+'/'+tid).json()
            if result['status']=='completed': break
        assert result['text']=='오늘 일정 알려 줘.'
        assert client.get(f'/api/sessions/{a}/history').json()==[]
        assert client.post(f'/api/sessions/{a}/turns',json={'text':'새 메시지'}).status_code==202
        assert client.get(path+'/'+tid).json()['status']=='cancelled'
        assert client.delete(path+'/'+tid).status_code==204


@pytest.mark.asyncio
async def test_expired_transcript_does_not_block_a_new_text_turn(tmp_path):
    from gateway.transcription import Transcriptions
    store=Store(tmp_path/'db.sqlite3')
    sid=store.create_session(SessionCreate(mode='assistant'))['id']
    manager=Transcriptions(store, ImmediateSTT())
    job=manager.start(sid,wav_bytes())
    await finish(manager,sid,job['id'])
    manager.jobs[job['id']].created-=301
    manager.cancel_session(sid)
    assert sid not in manager.current
    await manager.close();store.close()
