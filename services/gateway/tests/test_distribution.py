import pytest
from gateway.config import Settings


def test_default_ui_is_independent_of_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert (Settings().web_dir / "index.html").is_file()
    assert (Settings().web_dir / "capture-worklet.mjs").is_file()


@pytest.mark.parametrize("variable", ["LLM_PROVIDER", "TTS_PROVIDER", "STT_PROVIDER"])
def test_invalid_environment_provider_is_rejected(variable, monkeypatch):
    monkeypatch.setenv(variable, "not-a-provider")
    with pytest.raises(ValueError):
        Settings.from_env()
