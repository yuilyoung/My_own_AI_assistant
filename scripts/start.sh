#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/services"
export LLM_PROVIDER="${LLM_PROVIDER:-demo}"
export TTS_PROVIDER="${TTS_PROVIDER:-none}"
export STT_PROVIDER="${STT_PROVIDER:-none}"
check_only=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      if [[ $# -lt 2 ]]; then echo '--provider requires demo or ollama.' >&2; exit 2; fi
      export LLM_PROVIDER="$2"; shift 2 ;;
    --voice) export TTS_PROVIDER=melo; shift ;;
    --microphone) export STT_PROVIDER=whisper_cpp; shift ;;
    --check) check_only=true; shift ;;
    -h|--help)
      echo 'Usage: bash scripts/start.sh [--provider demo|ollama] [--voice] [--microphone] [--check]'
      echo 'Existing provider environment variables are preserved unless a flag overrides them.'
      echo '--check diagnoses prerequisites without starting Gateway.'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
case "$LLM_PROVIDER" in demo|ollama) ;; *) echo 'LLM_PROVIDER must be demo or ollama.' >&2; exit 2 ;; esac
if [[ ! -x .venv/bin/python ]]; then
  echo 'Run bash scripts/setup.sh first.' >&2
  exit 1
fi
.venv/bin/python -m gateway.doctor
if [[ "$check_only" == true ]]; then exit 0; fi
exec .venv/bin/python -m gateway.cli
