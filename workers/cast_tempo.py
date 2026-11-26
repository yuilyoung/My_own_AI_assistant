"""Keep the model's articulation and shorten only long, quiet pauses."""

import numpy as np


def shape_cast_pauses(samples, sample_rate: int, pause_seconds: float) -> np.ndarray:
    source = np.asarray(samples, dtype=np.float32)
    if source.ndim != 1 or not source.size or not np.isfinite(source).all() or sample_rate <= 0:
        raise ValueError("Expected finite, nonempty mono audio and a positive sample rate")

    frame = max(1, round(sample_rate * 0.010))
    starts = np.arange(0, len(source), frame)
    peaks = np.maximum.reduceat(np.abs(source), starts)
    # Treat a frame as quiet only when every sample is below both limits. Keep
    # low-energy consonants and soft sentence endings whenever they are audible.
    quiet_limit = min(0.005, np.max(peaks) * 0.027)
    audible = np.flatnonzero(peaks > quiet_limit)
    if not audible.size:
        return source

    sentence_pause = max(1, round(pause_seconds * sample_rate / frame))
    cursor = max(0, (audible[0] - 6) * frame)
    end = min(len(source), (audible[-1] + 12) * frame)
    chunks = []
    gaps = np.diff(audible) - 1
    for gap_index in np.flatnonzero(gaps > sentence_pause):
        gap = gaps[gap_index]
        # A longer generated pause still reads as longer after reducing its
        # excess. Retain the original lead-in and lead-out at each boundary.
        keep = sentence_pause + round((gap - sentence_pause) / 4)
        left = (audible[gap_index] + 1 + keep // 2) * frame
        right = (audible[gap_index + 1] - (keep - keep // 2)) * frame
        chunks.append(source[cursor:left])
        cursor = right
    chunks.append(source[cursor:end])
    return np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
