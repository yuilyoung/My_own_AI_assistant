"""Build an allowlisted local-runtime ZIP and verifiable distribution manifest."""

import argparse
import hashlib
import json
import os
import sys
import tomllib
import zipfile
from email.parser import Parser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "gateway/cli.py",
    "gateway/config.py",
    "gateway_ui/index.html",
    "gateway_ui/app.mjs",
    "gateway_ui/capture-worklet.mjs",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_wheel(path: Path, version: str) -> None:
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if not REQUIRED <= names:
            raise ValueError("Wheel is missing runtime or diagnostic UI files")
        metadata = f"my_own_ai_assistant-{version}.dist-info/METADATA"
        if metadata not in names:
            raise ValueError("Wheel metadata/version mismatch")
        if Parser().parsestr(archive.read(metadata).decode())["Version"] != version:
            raise ValueError("Wheel metadata/version mismatch")
        for name in names:
            parts = Path(name).parts
            if ".." in parts or name.startswith("/") or "\\" in name:
                raise ValueError("Unsafe archive member")
            if name.startswith(f"my_own_ai_assistant-{version}.dist-info/"):
                continue
            if not name.startswith(("gateway/", "gateway_ui/")):
                raise ValueError("Unexpected package in wheel")
            if len(parts) != 2 or Path(name).suffix not in {".py", ".mjs", ".html", ".css"}:
                raise ValueError("Private, test or model data must not be packaged")


def verify(dist: Path) -> None:
    manifest = json.loads((dist / "manifest.json").read_text(encoding="utf-8"))
    files = manifest["files"]
    expected = {record["name"]: record["sha256"] for record in files}
    expected["manifest.json"] = digest(dist / "manifest.json")
    checksum_lines = (dist / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines()
    recorded = {}
    for line in checksum_lines:
        value, name = line.split("  ", 1)
        if Path(name).name != name or name in recorded:
            raise ValueError("Invalid checksum filename")
        recorded[name] = value
    if recorded != expected:
        raise ValueError("Manifest/checksum list mismatch")
    for name, expected_hash in expected.items():
        path = dist / name
        if path.is_symlink() or digest(path) != expected_hash:
            raise ValueError(f"Checksum mismatch: {name}")


def build_bundle(dist: Path, tag: str | None = None) -> Path:
    version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"][
        "version"
    ]
    if tag is not None and tag != f"v{version}":
        raise ValueError(f"Release tag must equal v{version}")
    wheels = list(dist.glob("*.whl"))
    sources = list(dist.glob("*.tar.gz"))
    if len(wheels) != 1 or len(sources) != 1:
        raise ValueError("Expected exactly one wheel and one source distribution")
    wheel, source = wheels[0], sources[0]
    if wheel.is_symlink() or source.is_symlink():
        raise ValueError("Distribution inputs cannot be symlinks")
    if source.name != f"my_own_ai_assistant-{version}.tar.gz":
        raise ValueError("Source distribution version mismatch")
    check_wheel(wheel, version)
    archive_path = dist / f"my-own-ai-assistant-{version}-runtime.zip"
    install_ps = """$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw "Python 3.11+ is required" }
$wheel = Get-ChildItem packages/*.whl | Select-Object -First 1
& ./.venv/Scripts/python.exe -m pip install -c constraints.txt $wheel.FullName
if ($LASTEXITCODE -ne 0) { throw "Package installation failed" }
Write-Host "Installed. Run ./run.ps1"
"""
    install_sh = """#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -c constraints.txt packages/*.whl
printf 'Installed. Run sh run.sh\n'
"""
    run_ps = """$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& ./.venv/Scripts/python.exe -m gateway.cli
exit $LASTEXITCODE
"""
    run_sh = """#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec .venv/bin/python -m gateway.cli
"""
    instructions = f"""# Local runtime {version}

Requires Python 3.11+ and network access to install Python dependencies.
Windows PowerShell: run `./install.ps1`, then `./run.ps1`.
Linux/macOS: run `sh install.sh`, then `sh run.sh`.
Read the pairing URL from the terminal; keep it private.

Default mode is a fixed demo response, NOT a real AI model.
Ollama, whisper.cpp, MeloTTS and Live2D assets are NOT bundled.
Configure local providers separately as described in the repository README.
This is a Python runtime bundle, NOT an exe, a standalone/offline installer,
or a macOS/Windows device-certification result.
Never publish `.local-data`, tokens, recordings or your environment settings.
"""
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(wheel, f"packages/{wheel.name}")
        for name, content in {
            "INSTALL.md": instructions,
            "constraints.txt": (ROOT / "requirements.txt").read_text(encoding="utf-8"),
            "install.ps1": install_ps,
            "install.sh": install_sh,
            "run.ps1": run_ps,
            "run.sh": run_sh,
        }.items():
            archive.writestr(name, content)
    artifacts = [wheel, source, archive_path]
    manifest = {
        "version": version,
        "commit": os.getenv("GITHUB_SHA", "local-unpublished"),
        "includes_models": False,
        "files": [
            {"name": p.name, "bytes": p.stat().st_size, "sha256": digest(p)} for p in artifacts
        ],
    }
    manifest_path = dist / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    checksums = "".join(f"{digest(p)}  {p.name}\n" for p in [*artifacts, manifest_path])
    (dist / "SHA256SUMS.txt").write_text(checksums, encoding="utf-8")
    verify(dist)
    return archive_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    parser.add_argument("--tag")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    try:
        if args.verify:
            version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))[
                "project"
            ]["version"]
            if args.tag is not None and args.tag != f"v{version}":
                raise ValueError(f"Release tag must equal v{version}")
            verify(args.dist)
            print("Distribution checksums verified")
        else:
            print(build_bundle(args.dist, args.tag).name)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        print(f"Distribution validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
