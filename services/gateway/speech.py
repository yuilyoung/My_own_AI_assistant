"""Opt-in local STT. No shell, remote API, auto-download, or transcript logging."""
import asyncio
import io
import wave
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Protocol

SAMPLE_RATE = 16_000
MAX_SECONDS = 30
MAX_WAV_BYTES = SAMPLE_RATE * MAX_SECONDS * 2 + 4096


class STT(Protocol):
    async def transcribe(self, data: bytes) -> str: ...


def validate_input_wav(data: bytes) -> float:
    """Validate decoded PCM, not the filename/MIME; reject truncated or silent input."""
    if len(data) > MAX_WAV_BYTES or len(data) < 44:
        raise ValueError('Invalid audio size')
    if data[:4] != b'RIFF' or int.from_bytes(data[4:8], 'little') != len(data) - 8:
        raise ValueError('Invalid RIFF length')
    try:
        with wave.open(io.BytesIO(data), 'rb') as audio:
            frames = audio.getnframes()
            if (audio.getnchannels() != 1 or audio.getsampwidth() != 2
                    or audio.getframerate() != SAMPLE_RATE or audio.getcomptype() != 'NONE'
                    or not 1600 <= frames <= SAMPLE_RATE * MAX_SECONDS):
                raise ValueError('Expected mono PCM16 16kHz, 0.1–30 seconds')
            pcm = audio.readframes(frames)
            if len(pcm) != frames * 2 or not any(pcm):
                raise ValueError('Truncated or silent audio')
    except (wave.Error, EOFError) as exc:
        raise ValueError('Invalid WAV') from exc
    return frames / SAMPLE_RATE


class WhisperCpp:
    def __init__(self, executable: Path, model: Path, temp_dir: Path, timeout: float = 90):
        self.executable = executable.resolve()
        self.model = model.resolve()
        self.temp_dir = temp_dir.resolve()
        self.timeout = timeout

    async def transcribe(self, data: bytes) -> str:
        validate_input_wav(data)
        if not self.executable.is_file() or not self.model.is_file():
            raise RuntimeError('STT dependency unavailable')
        self.temp_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        with TemporaryDirectory(prefix='stt-', dir=self.temp_dir) as directory:
            source = Path(directory) / 'input.wav'
            output = Path(directory) / 'transcript'
            source.write_bytes(data)
            process = None
            try:
                process = await asyncio.create_subprocess_exec(
                    str(self.executable), '-m', str(self.model), '-f', str(source),
                    '-l', 'ko', '-otxt', '-of', str(output), '-nt', '-np',
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                code = await asyncio.wait_for(process.wait(), self.timeout)
                if code != 0:
                    raise RuntimeError('STT process failed')
                with output.with_suffix('.txt').open('rb') as file:
                    raw = file.read(8001)
                if len(raw) > 8000:
                    raise ValueError('STT output too large')
                text = raw.decode('utf-8-sig').strip()
                if not 1 <= len(text) <= 2000 or '\x00' in text:
                    raise ValueError('Empty or invalid STT output')
                return text
            finally:
                if process is not None and process.returncode is None:
                    try:
                        process.kill()
                    except ProcessLookupError:
                        pass
                    await asyncio.shield(process.wait())
