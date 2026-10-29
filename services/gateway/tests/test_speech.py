import asyncio
import io
import wave
from pathlib import Path

import pytest


def wav_bytes(rate=16000, channels=1, width=2, frames=1600, silent=False):
    out = io.BytesIO()
    with wave.open(out, "wb") as f:
        f.setparams((channels, width, rate, 0, "NONE", "not compressed"))
        f.writeframes((b"\x00" if silent else b"\x01") * frames * channels * width)
    return out.getvalue()


def speech_module():
    from gateway import speech

    return speech


def test_pcm_validator_accepts_only_bounded_real_pcm():
    s = speech_module()
    assert s.validate_input_wav(wav_bytes()) == pytest.approx(0.1)
    assert s.validate_input_wav(wav_bytes(frames=480000)) == 30
    bad = [
        b"webm-not-wav",
        wav_bytes(rate=48000),
        wav_bytes(channels=2),
        wav_bytes(width=1),
        wav_bytes(frames=1599),
        wav_bytes(frames=480001),
        wav_bytes()[:-2],
        wav_bytes(silent=True),
    ]
    for data in bad:
        with pytest.raises(ValueError):
            s.validate_input_wav(data)


class FakeProcess:
    def __init__(self, finish=True, code=0):
        self.finish = finish
        self.returncode = None
        self.code = code
        self.killed = False

    async def wait(self):
        if not self.finish:
            await asyncio.Event().wait()
        self.returncode = self.code
        return self.code

    def kill(self):
        self.killed = True
        self.finish = True
        self.code = -9


def paths(tmp_path):
    exe = tmp_path / "whisper cli.exe"
    model = tmp_path / "ggml-small.bin"
    exe.touch()
    model.touch()
    return exe, model, tmp_path / "temp"


@pytest.mark.asyncio
async def test_cli_fixed_args_and_cleanup(tmp_path, monkeypatch):
    s = speech_module()
    captured = {}

    async def spawn(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        captured["input"] = Path(args[args.index("-f") + 1])
        assert captured["input"].read_bytes() == wav_bytes()
        Path(args[args.index("-of") + 1] + ".txt").write_text(" 안녕하세요. ", encoding="utf8")
        return FakeProcess()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    exe, model, temp = paths(tmp_path)
    provider = s.WhisperCpp(exe, model, temp, timeout=1)
    assert await provider.transcribe(wav_bytes()) == "안녕하세요."
    assert captured["args"][0] == str(exe)
    assert captured["args"][captured["args"].index("-l") + 1] == "ko"
    assert "shell" not in captured["kwargs"]
    assert captured["kwargs"]["stdout"] == asyncio.subprocess.DEVNULL
    assert not captured["input"].exists()
    assert list(temp.iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["timeout", "cancel", "exit", "large", "empty", "missing"])
async def test_cli_failures_cleanup(tmp_path, monkeypatch, reason):
    s = speech_module()
    started = asyncio.Event()
    proc = FakeProcess(
        finish=reason not in {"timeout", "cancel"}, code=1 if reason == "exit" else 0
    )

    async def spawn(*args, **kwargs):
        if reason != "missing":
            Path(args[args.index("-of") + 1] + ".txt").write_text(
                "가" * 3000 if reason == "large" else " ", encoding="utf8"
            )
        started.set()
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    exe, model, temp = paths(tmp_path)
    provider = s.WhisperCpp(exe, model, temp, timeout=0.02)
    task = asyncio.create_task(provider.transcribe(wav_bytes()))
    await started.wait()
    if reason == "cancel":
        task.cancel()
    with pytest.raises(
        (ValueError, RuntimeError, TimeoutError, asyncio.CancelledError, FileNotFoundError)
    ):
        await task
    assert list(temp.iterdir()) == []
    if reason in {"timeout", "cancel"}:
        assert proc.killed


def test_inconsistent_riff_length_rejected():
    s = speech_module()
    data = bytearray(wav_bytes())
    data[4:8] = (len(data) + 4096).to_bytes(4, "little")
    with pytest.raises(ValueError):
        s.validate_input_wav(bytes(data))
