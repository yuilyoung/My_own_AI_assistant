#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/services"
export LLM_PROVIDER="${LLM_PROVIDER:-demo}"
export TTS_PROVIDER="${TTS_PROVIDER:-none}"
exec .venv/bin/python -m gateway.cli
