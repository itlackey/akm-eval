#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_PATH="${ROOT_DIR}/vendor/BEAM"
VENV_PATH="${ROOT_DIR}/.venv-beam"
PYTHON_BIN="python3.11"
PINNED_COMMIT="3e12035532eb85768f1a7cd779832b650c4b2ef9"
CHECK_ONLY=0
DATASET_PATH="${BEAM_DATASET_PATH:-}"
DATASET_10M_PATH="${BEAM_DATASET_10M_PATH:-}"
REQUIRE_JUDGE=0
REQUIRE_10M=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-beam-runtime.sh [options]

Creates a local Python virtualenv for the upstream BEAM evaluator requirements,
or runs a non-installing runtime check.

Options:
  --repo PATH      Path to the upstream BEAM checkout.
  --venv PATH      Virtualenv path to create or check.
  --python BIN     Python interpreter to use. Default: python3.11.
  --dataset PATH   Prepared BEAM dataset root. Also reads BEAM_DATASET_PATH.
  --dataset10m PATH  Prepared BEAM 10M dataset root. Also reads BEAM_DATASET_10M_PATH.
  --require-10m    Fail if the prepared BEAM 10M dataset is not available.
  --check          Verify repo/layout/runtime expectations without installing.
  --require-judge  Fail if judge credentials are not configured.
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
    --dataset)
      DATASET_PATH="$2"
      shift 2
      ;;
    --dataset10m)
      DATASET_10M_PATH="$2"
      shift 2
      ;;
    --require-10m)
      REQUIRE_10M=1
      shift
      ;;
    --check)
      CHECK_ONLY=1
      shift
      ;;
    --require-judge)
      REQUIRE_JUDGE=1
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

if [[ -n "$DATASET_PATH" ]]; then
  DATASET_PATH="$(realpath -m "$DATASET_PATH")"
fi

if [[ -n "$DATASET_10M_PATH" ]]; then
  DATASET_10M_PATH="$(realpath -m "$DATASET_10M_PATH")"
fi

require_file() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    printf 'Missing required file: %s\n' "$file_path" >&2
    exit 1
  fi
}

require_directory() {
  local dir_path="$1"
  if [[ ! -d "$dir_path" ]]; then
    printf 'Missing required directory: %s\n' "$dir_path" >&2
    exit 1
  fi
}

resolve_dataset_path() {
  local configured_path="$1"
  shift
  if [[ -n "$configured_path" ]]; then
    printf '%s\n' "$configured_path"
    return 0
  fi

  local candidate
  for candidate in "$@"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
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

DEFAULT_DATASET_CANDIDATES=(
  "${REPO_PATH}/test_chats"
  "${REPO_PATH}/chats"
  "${REPO_PATH}/beam_dataset"
)

DEFAULT_DATASET_10M_CANDIDATES=(
  "${REPO_PATH}/test_chats/10M"
  "${REPO_PATH}/chats/10M"
  "${REPO_PATH}/beam_10M_dataset"
)

if ! DATASET_PATH="$(resolve_dataset_path "$DATASET_PATH" "${DEFAULT_DATASET_CANDIDATES[@]}")"; then
  printf 'Prepared BEAM dataset not found. Set --dataset /path/to/dataset, export BEAM_DATASET_PATH, or run the upstream dataset preparation from %s\n' "$REPO_PATH" >&2
  exit 1
fi

require_directory "$DATASET_PATH"

if [[ -z "$DATASET_10M_PATH" ]]; then
  if DATASET_10M_FOUND="$(resolve_dataset_path "" "${DEFAULT_DATASET_10M_CANDIDATES[@]}")"; then
    DATASET_10M_PATH="$DATASET_10M_FOUND"
  fi
fi

if [[ -n "$DATASET_10M_PATH" ]]; then
  require_directory "$DATASET_10M_PATH"
elif [[ "$REQUIRE_10M" -eq 1 ]]; then
  printf 'Prepared BEAM 10M dataset not found. Set --dataset10m /path/to/dataset, export BEAM_DATASET_10M_PATH, or run the upstream 10M dataset preparation from %s\n' "$REPO_PATH" >&2
  exit 1
fi

if [[ "$REQUIRE_JUDGE" -eq 1 && -z "${OPENAI_API_KEY:-}" && "${OPENAI_BASE_URL:-https://api.openai.com/v1}" = 'https://api.openai.com/v1' ]]; then
  printf 'Judge credentials missing. Set OPENAI_API_KEY or point OPENAI_BASE_URL at an OpenAI-compatible local judge endpoint.\n' >&2
  exit 1
fi

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
  printf 'Dataset: %s\n' "$DATASET_PATH"
  if [[ -n "$DATASET_10M_PATH" ]]; then
    printf 'Dataset 10M: %s\n' "$DATASET_10M_PATH"
  else
    printf 'Dataset 10M: not checked\n'
  fi
  if [[ "$REQUIRE_JUDGE" -eq 1 ]]; then
    printf 'Judge credentials: configured\n'
  else
    printf 'Judge credentials: not checked\n'
  fi
  exit 0
fi

"$PYTHON_BIN" -m venv "$VENV_PATH"
"${VENV_PATH}/bin/pip" install --upgrade pip
"${VENV_PATH}/bin/pip" install -r "${ROOT_DIR}/requirements-beam.txt"

printf 'BEAM runtime installed in %s\n' "$VENV_PATH"
printf 'Activate with: source %s/bin/activate\n' "$VENV_PATH"
