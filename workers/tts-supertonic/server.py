"""Local Korean multi-voice Supertonic 2 worker, using preinstalled CPU models."""

import os
import sys
from pathlib import Path
from typing import Literal, NamedTuple

# Both workers can run directly in their own virtual environment.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tts_http import TextInput, create_worker_app, pcm16_wav  # noqa: E402


class VoiceInput(TextInput):
    voice: Literal["hana", "seorin", "isol"] = "seorin"


class VoiceProfile(NamedTuple):
    speaker: int
    speech_rate: float  # Native syllable timing, applied by Supertonic.
    register: float  # Change resonance and pitch by this ratio after synthesis.


# The gallery and live turns use the same Korean stock speakers and direction.
VOICE_PROFILES = {
    "hana": VoiceProfile(speaker=3, speech_rate=0.82, register=1.20),
    "seorin": VoiceProfile(speaker=0, speech_rate=0.95, register=1.0),
    "isol": VoiceProfile(speaker=1, speech_rate=0.99, register=1.0),
}
MODEL_FILES = {
    "duration_predictor": "duration_predictor.int8.onnx",
    "text_encoder": "text_encoder.int8.onnx",
    "vector_estimator": "vector_estimator.int8.onnx",
    "vocoder": "vocoder.int8.onnx",
    "tts_json": "tts.json",
    "unicode_indexer": "unicode_indexer.bin",
    "voice_style": "voice.bin",
}


def create_app(token, synthesize):
    return create_worker_app(
        token, "supertonic-2", 8767, VoiceInput, lambda body: synthesize(body.text, body.voice)
    )


def load_synthesizer(directory: Path):
    paths = {key: str(directory / name) for key, name in MODEL_FILES.items()}
    for path in paths.values():
        if not Path(path).is_file():
            raise ValueError(f"Missing Supertonic 2 model file: {path}")

    import numpy as np
    import sherpa_onnx
    import soxr

    model = sherpa_onnx.OfflineTts(
        sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                supertonic=sherpa_onnx.OfflineTtsSupertonicModelConfig(**paths),
                num_threads=3,
                provider="cpu",
            )
        )
    )
    if model.num_speakers < 5:
        raise ValueError("Expected Supertonic 2 model with F1–F5 speaker styles")

    def synthesize(text, voice):
        config = sherpa_onnx.GenerationConfig()
        profile = VOICE_PROFILES[voice]
        config.sid = profile.speaker
        config.speed = profile.speech_rate
        config.num_steps = 24
        config.extra = {"lang": "ko"}
        audio = model.generate(text, config)
        samples = audio.samples
        if profile.register != 1.0:
            samples = soxr.resample(
                np.asarray(samples, dtype=np.float32),
                audio.sample_rate * profile.register,
                audio.sample_rate,
                quality="HQ",
            )
        return pcm16_wav(samples, audio.sample_rate)

    return synthesize


def main():
    import uvicorn

    token = os.environ.get("SUPERTONIC_TOKEN", "")
    directory = os.environ.get("SUPERTONIC_MODEL_DIR")
    if len(token) < 32 or not directory:
        raise SystemExit("Set SUPERTONIC_TOKEN (32+ characters) and SUPERTONIC_MODEL_DIR.")
    app = create_app(token, load_synthesizer(Path(directory)))
    uvicorn.run(app, host="127.0.0.1", port=8767, access_log=False)


if __name__ == "__main__":
    main()
