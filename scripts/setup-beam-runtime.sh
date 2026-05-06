#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_PATH="${ROOT_DIR}/vendor/BEAM"
VENV_PATH="${ROOT_DIR}/.venv-beam"
PYTHON_BIN="python3.11"
PINNED_COMMIT="3e12035532eb85768f1a7cd779832b650c4b2ef9"
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-beam-runtime.sh [options]

Creates a local Python virtualenv for the upstream BEAM evaluator requirements,
or runs a non-installing runtime check.

Options:
  --repo PATH      Path to the upstream BEAM checkout.
  --venv PATH      Virtualenv path to create or check.
  --python BIN     Python interpreter to use. Default: python3.11.
  --check          Verify repo/layout/runtime expectations without installing.
  --help           Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_PATH="$2"
      shift 2
      ;;
    --venv)
      VENV_PATH="$2"
      shift 2
      ;;
    --python)
      PYTHON_BIN="$2"
      shift 2
      ;;
    --check)
      CHECK_ONLY=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

REPO_PATH="$(realpath "$REPO_PATH")"
VENV_PATH="$(realpath -m "$VENV_PATH")"

require_file() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    printf 'Missing required file: %s\n' "$file_path" >&2
    exit 1
  fi
}

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  printf 'Required Python interpreter not found: %s\n' "$PYTHON_BIN" >&2
  exit 1
fi

if [[ ! -d "$REPO_PATH" ]]; then
  printf 'Upstream BEAM checkout not found: %s\n' "$REPO_PATH" >&2
  exit 1
fi

require_file "${ROOT_DIR}/requirements-beam.txt"
require_file "${REPO_PATH}/requirements.txt"
require_file "${REPO_PATH}/src/evaluation/run_evaluation.py"
require_file "${REPO_PATH}/src/beam/download_dataset.py"

if command -v git >/dev/null 2>&1 && git -C "$REPO_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  REPO_COMMIT="$(git -C "$REPO_PATH" rev-parse HEAD)"
  if [[ "$REPO_COMMIT" != "$PINNED_COMMIT" ]]; then
    printf 'BEAM checkout commit mismatch: expected %s but found %s\n' "$PINNED_COMMIT" "$REPO_COMMIT" >&2
    printf 'Use the pinned upstream commit or update the documented runtime pin first.\n' >&2
    exit 1
  fi
fi

if ! "$PYTHON_BIN" - <<'PY' "${ROOT_DIR}/requirements-beam.txt" "${REPO_PATH}/requirements.txt"; then
from pathlib import Path
import sys

def normalized_lines(file_path: str) -> list[str]:
    return [
        line.strip()
        for line in Path(file_path).read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.lstrip().startswith('#')
    ]

raise SystemExit(0 if normalized_lines(sys.argv[1]) == normalized_lines(sys.argv[2]) else 1)
PY
  printf 'requirements-beam.txt does not match %s/requirements.txt\n' "$REPO_PATH" >&2
  printf 'Refresh the snapshot before relying on this runtime pin.\n' >&2
  exit 1
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  "$PYTHON_BIN" -c 'import sys; major, minor = sys.version_info[:2]; raise SystemExit(0 if (major, minor) == (3, 11) else 1)'
  printf 'BEAM runtime check passed for repo %s using %s\n' "$REPO_PATH" "$PYTHON_BIN"
  exit 0
fi

"$PYTHON_BIN" -m venv "$VENV_PATH"
"${VENV_PATH}/bin/pip" install --upgrade pip
"${VENV_PATH}/bin/pip" install -r "${ROOT_DIR}/requirements-beam.txt"

printf 'BEAM runtime installed in %s\n' "$VENV_PATH"
printf 'Activate with: source %s/bin/activate\n' "$VENV_PATH"
