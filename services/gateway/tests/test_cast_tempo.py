import numpy as np
import pytest

from workers import cast_tempo


@pytest.mark.parametrize("rate", [16000, 44100, 48000])
def test_cast_pauses_keep_all_voiced_samples_and_vary_long_pauses(rate):
    frame = rate // 100
    # The quietest phrase is weak relative to the loudest but must survive intact.
    lead = np.zeros(20 * frame, dtype=np.float32)
    quiet_phrase = np.full(12 * frame, 0.008, dtype=np.float32)
    short_pause = np.zeros(14 * frame, dtype=np.float32)
    loud_phrase = np.full(20 * frame, 0.4, dtype=np.float32)
    long_pause = np.zeros(75 * frame, dtype=np.float32)
    longer_pause = np.zeros(95 * frame, dtype=np.float32)
    tail = np.zeros(30 * frame, dtype=np.float32)
    source = np.concatenate(
        [
            lead,
            quiet_phrase,
            short_pause,
            loud_phrase,
            long_pause,
            quiet_phrase,
            longer_pause,
            loud_phrase,
            tail,
        ]
    )

    styled = cast_tempo.shape_cast_pauses(source, rate, pause_seconds=0.25)

    assert np.array_equal(styled[styled != 0], source[source != 0])
    silent = styled.reshape(-1, frame)[:, 0] == 0
    breaks = np.r_[0, np.flatnonzero(np.diff(silent)) + 1, len(silent)]
    pauses = [b - a for a, b in zip(breaks[:-1], breaks[1:], strict=True) if silent[a]]
    assert pauses == [6, 14, 37, 43, 11]


def test_cast_pauses_keep_short_and_silent_audio():
    for source in [np.zeros(7889, dtype=np.float32), [0.0, 0.2, 0.0]]:
        assert np.array_equal(cast_tempo.shape_cast_pauses(source, 44100, 0.25), np.float32(source))


@pytest.mark.parametrize(
    "source", [[], [0.0, float("nan"), 0.5], [float("inf"), 0.0], [[0.1], [0.2]]]
)
def test_cast_pauses_reject_invalid_audio(source):
    with pytest.raises(ValueError):
        cast_tempo.shape_cast_pauses(source, 44100, 0.25)
