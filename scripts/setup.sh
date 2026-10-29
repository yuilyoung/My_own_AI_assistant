#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
diagnostics_only=false
skip_tests=false
for argument in "$@"; do
  case "$argument" in
    --diagnostics-only) diagnostics_only=true ;;
    --skip-tests) skip_tests=true ;;
    -h|--help)
      echo 'Usage: bash scripts/setup.sh [--diagnostics-only] [--skip-tests]'
      echo 'Installs Python dependencies and builds React. Models and SDK assets are installed separately.'
      exit 0 ;;
    *) echo "Unknown option: $argument" >&2; exit 2 ;;
  esac
done
if [[ ! -x .venv/bin/python ]]; then
  if [[ -d .venv ]]; then
    echo 'Existing .venv is not usable on this platform. Preserve or move it, then run setup again.' >&2
    exit 1
  fi
  if command -v python3 >/dev/null 2>&1; then
    assistant_python=python3
  elif command -v python >/dev/null 2>&1; then
    assistant_python=python
  else
    echo 'Install Python 3.11 or newer, then run setup again.' >&2
    exit 1
  fi
  "$assistant_python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else "Python 3.11 or newer is required.")'
  "$assistant_python" -m venv .venv
fi
.venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else "The existing .venv requires Python 3.11 or newer.")'
if [[ "$diagnostics_only" == false ]]; then
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo 'Install Node.js 22 or newer (including npm), or use --diagnostics-only.' >&2
    exit 1
  fi
  node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'
fi
.venv/bin/python -m pip install -r requirements-dev.txt
if [[ "$skip_tests" == false ]]; then
  .venv/bin/python -m pytest -q
fi
if [[ "$diagnostics_only" == false ]]; then
  (
    cd apps/web
    npm ci --no-audit --no-fund
    if [[ "$skip_tests" == false ]]; then npm test; fi
    npm run build
  )
  if [[ "$skip_tests" == false ]]; then node --test apps/diagnostics/tests/*.test.mjs; fi
fi
echo 'Setup complete. Start with: bash scripts/start.sh'
echo 'Default mode is fixed-response demo. Use --provider ollama for an installed local model.'
