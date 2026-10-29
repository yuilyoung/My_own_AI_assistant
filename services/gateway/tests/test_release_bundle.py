import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "package_release.py"


@pytest.fixture
def distribution(tmp_path):
    wheel = tmp_path / "my_own_ai_assistant-0.2.0-py3-none-any.whl"
    with zipfile.ZipFile(wheel, "w") as archive:
        for name in (
            "gateway/cli.py",
            "gateway/config.py",
            "gateway_ui/index.html",
            "gateway_ui/app.mjs",
            "gateway_ui/capture-worklet.mjs",
        ):
            archive.writestr(name, "fixture")
        archive.writestr(
            "my_own_ai_assistant-0.2.0.dist-info/METADATA",
            "Name: my-own-ai-assistant\nVersion: 0.2.0\n",
        )
    (tmp_path / "my_own_ai_assistant-0.2.0.tar.gz").write_bytes(b"fixture-source")
    return tmp_path


def run_bundle(directory, *arguments):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--dist", str(directory), *arguments],
        capture_output=True,
        text=True,
        timeout=15,
    )


def test_bundle_allowlist_excludes_unrelated_local_files(distribution):
    (distribution / ".env").write_text("PRIVATE_TOKEN=do-not-package")
    (distribution / "conversation.sqlite3").write_text("private")
    result = run_bundle(distribution)
    assert result.returncode == 0, result.stderr
    with zipfile.ZipFile(next(distribution.glob("*.zip"))) as archive:
        names = set(archive.namelist())
        assert names == {
            "packages/my_own_ai_assistant-0.2.0-py3-none-any.whl",
            "INSTALL.md",
            "constraints.txt",
            "install.ps1",
            "install.sh",
            "run.ps1",
            "run.sh",
        }
        assert b"PRIVATE_TOKEN" not in b"".join(archive.read(n) for n in names)
    manifest = json.loads((distribution / "manifest.json").read_text())
    assert manifest["version"] == "0.2.0"
    for record in manifest["files"]:
        assert (
            hashlib.sha256((distribution / record["name"]).read_bytes()).hexdigest()
            == record["sha256"]
        )


def test_mismatched_tag_is_rejected(distribution):
    result = run_bundle(distribution, "--tag", "v9.9.9")
    assert result.returncode != 0
    assert "tag" in result.stderr.lower()
    assert not list(distribution.glob("*.zip"))


def test_incomplete_distribution_is_rejected(distribution):
    next(distribution.glob("*.whl")).unlink()
    assert run_bundle(distribution).returncode != 0


def test_private_file_inside_wheel_is_rejected(distribution):
    with zipfile.ZipFile(next(distribution.glob("*.whl")), "a") as archive:
        archive.writestr("gateway/.env", "PRIVATE")
    assert run_bundle(distribution).returncode != 0


def test_manifest_verification_detects_tampering(distribution):
    result = run_bundle(distribution)
    assert result.returncode == 0, result.stderr
    assert run_bundle(distribution, "--verify").returncode == 0
    assert run_bundle(distribution, "--verify", "--tag", "v9.9.9").returncode != 0
    next(distribution.glob("*.zip")).write_bytes(b"tampered")
    assert run_bundle(distribution, "--verify").returncode != 0
