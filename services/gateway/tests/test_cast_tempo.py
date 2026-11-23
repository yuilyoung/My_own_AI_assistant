import numpy as np
import pytest

from workers.cast_tempo import speed_up_cast_speech


@pytest.mark.parametrize("rate", [16000, 44100, 48000])
def test_cast_tempo_compresses_phrases_and_pause_without_changing_voiced_frequencies(rate):
    source = np.zeros(2 * rate, dtype=np.float32)
    for start, stop, pitch in [(0.10, 0.76, 187), (1.14, 1.88, 291)]:
        t = np.arange(round(rate * start), round(rate * stop)) / rate
        source[round(rate * start) : round(rate * stop)] = 0.7 * np.sin(2 * np.pi * pitch * t)

    result = speed_up_cast_speech(source, rate)
    assert len(result) == round(len(source) / 1.2)
    assert np.max(np.abs(result)) <= np.max(np.abs(source)) + 1e-6
    assert np.max(np.abs(result[round(0.82 / 1.2 * rate) : round(1.07 / 1.2 * rate)])) == 0
    for start, stop, pitch in [(0.2, 0.65, 187), (1.24, 1.78, 291)]:
        region = result[round(start / 1.2 * rate) : round(stop / 1.2 * rate)]
        spectrum = np.abs(np.fft.rfft(region * np.hanning(len(region))))
        assert np.argmax(spectrum) * rate / len(region) == pytest.approx(pitch, abs=2)
        assert np.sqrt(np.mean(region**2)) == pytest.approx(0.7 / np.sqrt(2), abs=0.018)


@pytest.mark.parametrize("frames", [1, 2, 3, 5, 12, 123, 1700, 2201, 5500])
def test_cast_tempo_keeps_short_inputs_and_both_ends(frames):
    signal = np.linspace(-0.8, 0.7, frames, dtype=np.float32)
    result = speed_up_cast_speech(signal, 44100)
    assert len(result) == round(frames / 1.2)
    assert result[0] == pytest.approx(signal[0])
    if len(result) > 1:
        assert result[-1] == pytest.approx(signal[-1])
    assert np.isfinite(result).all()
    assert np.all(np.diff(result) >= -1e-6)


def test_cast_tempo_preserves_silence():
    source = np.zeros(7889, dtype=np.float32)
    assert not np.any(speed_up_cast_speech(source, 44100))


@pytest.mark.parametrize(
    "source", [[], [0.0, float("nan"), 0.5], [float("inf"), 0.0], [[0.1], [0.2]]]
)
def test_compression_rejects_invalid_source_before_skipping_samples(source):
    with pytest.raises(ValueError):
        speed_up_cast_speech(source, 44100)
