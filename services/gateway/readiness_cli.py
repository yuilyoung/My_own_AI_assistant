"""Print local installation checks without running inference or exposing secrets."""

import argparse
import json
from dataclasses import asdict, replace
from pathlib import Path

import httpx

from .config import Settings
from .readiness import inspect_local_readiness


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check local AI assistant MVP prerequisites")
    parser.add_argument("--provider", choices=["demo", "ollama"])
    parser.add_argument("--voice", action="store_true", help="Require MeloTTS worker")
    parser.add_argument("--microphone", action="store_true", help="Require whisper.cpp files")
    parser.add_argument("--json", action="store_true", help="Machine-readable, secret-free results")
    args = parser.parse_args(argv)
    try:
        settings = Settings.from_env()
        settings = replace(
            settings,
            llm=args.provider or settings.llm,
            tts="melo" if args.voice else settings.tts,
            stt="whisper_cpp" if args.microphone else settings.stt,
        )
    except (ValueError, TypeError) as exc:
        if args.json:
            print(json.dumps([{"component": "설정", "status": "FAIL", "detail": str(exc)}], ensure_ascii=False))
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
