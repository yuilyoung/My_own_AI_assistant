"""Pitch-preserving 6:5 tempo for the live and recorded Korean cast."""

import numpy as np


def speed_up_cast_speech(samples, sample_rate: int) -> np.ndarray:
    """Shorten mono speech to 5/6 of its length with waveform-similarity overlap-add."""
    source = np.asarray(samples, dtype=np.float32)
    if source.ndim != 1 or not source.size or not np.isfinite(source).all() or sample_rate <= 0:
        raise ValueError("Expected finite, nonempty mono audio and a positive sample rate")
    target = round(len(source) * 5 / 6)
    if target <= 4:
        # These sub-millisecond signals have no voiced cycle to align.
        return source[np.linspace(0, len(source) - 1, target).round().astype(int)]

    hop = min(max(1, round(0.020 * sample_rate)), target // 3)
    search = max(1, round(0.008 * sample_rate))
    fade = np.sin(np.linspace(0, np.pi / 2, hop, dtype=np.float32)) ** 2
    if hop == 1:
        fade[0] = 1

    # Each 40 ms frame retains its native sample rate. Align its overlap to a
    # matching waveform cycle near 1.2 × output time, then crossfade in phase.
    energy = np.empty(len(source) + 1, dtype=np.float64)
    energy[0] = 0
    np.cumsum(source * source, dtype=np.float64, out=energy[1:])
    result = np.empty(target, dtype=np.float32)
    result[: 2 * hop] = source[: 2 * hop]
    for out in range(hop, target - hop, hop):
        length = min(2 * hop, target - out)
        if out + length == target:
            # Anchor the final frame at the final source sample to keep word endings.
            start = len(source) - length
        else:
            nominal = round(out * 6 / 5)
            lo = max(0, nominal - search)
            hi = min(len(source) - length, nominal + search)
            start = min(nominal, hi)
            previous = result[out : out + hop]
            if np.any(previous):
                correlation = np.correlate(source[lo : hi + hop], previous, mode="valid")
                power = energy[lo + hop : hi + hop + 1] - energy[lo : hi + 1]
                start = lo + int(np.argmax(correlation / np.sqrt(np.maximum(power, 1e-12))))
        overlap = result[out : out + hop]
        overlap += fade * (source[start : start + hop] - overlap)
        result[out + hop : out + length] = source[start + hop : start + length]
    return result
