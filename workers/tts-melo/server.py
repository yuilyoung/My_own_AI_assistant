"""Optional isolated MeloTTS worker. ML imports/downloads happen only in main()."""

import os
import sys
from pathlib import Path

# Both workers can run directly in their own virtual environment.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tts_http import TextInput, create_worker_app, pcm16_wav  # noqa: E402


def create_app(token, synthesize):
    return create_worker_app(token, "melo-tts", 8766, TextInput, lambda body: synthesize(body.text))


def main():
    token = os.environ.get("MELO_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("Set MELO_TOKEN before starting this worker.")
    # This optional environment must contain a user-installed, reviewed MeloTTS revision.
    import uvicorn
    from melo.api import TTS

    model = TTS(language="KR", device=os.environ.get("MELO_DEVICE", "cpu"))
    speaker_id = model.hps.data.spk2id["KR"]

    def synthesize(text):
        samples = model.tts_to_file(text, speaker_id, output_path=None, quiet=True)
        return pcm16_wav(samples, model.hps.data.sampling_rate)

    uvicorn.run(create_app(token, synthesize), host="127.0.0.1", port=8766, access_log=False)


if __name__ == "__main__":
    main()
