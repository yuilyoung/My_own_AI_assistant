"""Print local installation checks without running inference or exposing secrets."""

import argparse
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

import httpx

from .config import Settings
from .readiness import inspect_local_readiness


def main(argv: list[str] | None = None) -> int:
    # Some Windows runners default stdout to cp1252, which cannot encode Korean.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    parser = argparse.ArgumentParser(description="Check local AI assistant MVP prerequisites")
    parser.add_argument("--provider", choices=["demo", "ollama", "cloud", "claude"])
    parser.add_argument(
        "--voice", action="store_true", help="Require the selected or configured voice worker"
    )
    parser.add_argument("--tts-provider", choices=["none", "melo", "supertonic"])
    parser.add_argument("--microphone", action="store_true", help="Require whisper.cpp files")
    parser.add_argument("--json", action="store_true", help="Machine-readable, secret-free results")
    args = parser.parse_args(argv)
    try:
        tts = args.tts_provider or os.getenv("TTS_PROVIDER", "none")
        if args.voice and not args.tts_provider and tts == "none":
            tts = "supertonic" if os.getenv("SUPERTONIC_TOKEN") else "melo"
        settings = Settings.from_env(
            llm=args.provider, tts=tts, stt="whisper_cpp" if args.microphone else None
        )
    except (ValueError, TypeError) as exc:
        if args.json:
            print(
                json.dumps(
                    [{"component": "설정", "status": "FAIL", "detail": str(exc)}],
                    ensure_ascii=True,
                )
            )
        else:
            print("[FAIL] 설정: " + str(exc))
        return 1
    repository = Path(__file__).resolve().parents[2]
    with httpx.Client(timeout=3.0, trust_env=False, follow_redirects=False) as client:
        checks = inspect_local_readiness(settings, client, repository)
    if args.json:
        print(json.dumps([asdict(item) for item in checks], ensure_ascii=False))
    else:
        for check in checks:
            print(f"[{check.status}] {check.component}: {check.detail}")
    return 1 if any(check.status == "FAIL" for check in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
