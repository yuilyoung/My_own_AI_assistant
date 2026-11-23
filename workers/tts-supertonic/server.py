"""Local Korean multi-voice Supertonic 2 worker, using preinstalled CPU models."""

import os
import sys
from pathlib import Path
from typing import Literal

# Both workers can run directly in their own virtual environment.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tts_http import TextInput, create_worker_app, pcm16_wav  # noqa: E402


class VoiceInput(TextInput):
    voice: Literal["hana", "seorin", "isol"] = "seorin"


# The distributed bank packs F1–F5 first. Rates match the portraits' recorded intros.
VOICE_PROFILES = {"hana": (1, 0.86), "seorin": (0, 0.95), "isol": (4, 0.95)}
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

    import sherpa_onnx

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
        config.sid, config.speed = VOICE_PROFILES[voice]
        config.num_steps = 24
        config.extra = {"lang": "ko"}
        audio = model.generate(text, config)
        return pcm16_wav(audio.samples, audio.sample_rate)

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
