#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_PATH="${BEAM_REPO_PATH:-${ROOT_DIR}/vendor/BEAM}"
VENV_PATH="${ROOT_DIR}/.venv-beam"
PYTHON_BIN="${BEAM_PYTHON_BIN:-python3.11}"
PINNED_COMMIT="3e12035532eb85768f1a7cd779832b650c4b2ef9"
CHECK_ONLY=0
DATASET_PATH="${BEAM_DATASET_PATH:-}"
DATASET_10M_PATH="${BEAM_DATASET_10M_PATH:-}"
REQUIRE_JUDGE=0
REQUIRE_10M=0
PRINT_FINGERPRINT=0

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
   --print-fingerprint  Print a reproducibility-oriented runtime fingerprint after checks.
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
    --print-fingerprint)
      PRINT_FINGERPRINT=1
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

path_origin() {
  local candidate_path="$1"
  case "$candidate_path" in
    "$ROOT_DIR"|"$ROOT_DIR"/*)
      printf 'workspace\n'
      ;;
    *)
      printf 'external\n'
      ;;
  esac
}

sha256_file() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | cut -d' ' -f1
    return 0
  fi

  "$PYTHON_BIN" - <<'PY' "$file_path"
from pathlib import Path
import hashlib
import sys

print(hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

normalized_requirements_sha() {
  local file_path="$1"
  "$PYTHON_BIN" - <<'PY' "$file_path"
from pathlib import Path
import hashlib
import sys

lines = [
    line.strip()
    for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
    if line.strip() and not line.lstrip().startswith('#')
]
print(hashlib.sha256('\n'.join(lines).encode('utf-8')).hexdigest())
PY
}

count_numeric_directories() {
  local dir_path="$1"
  if [[ ! -d "$dir_path" ]]; then
    printf '0\n'
    return 0
  fi

  "$PYTHON_BIN" - <<'PY' "$dir_path"
from pathlib import Path
import sys

root = Path(sys.argv[1])
print(sum(1 for entry in root.iterdir() if entry.is_dir() and entry.name.isdigit()))
PY
}

print_runtime_fingerprint() {
  local repo_commit="$1"
  local python_version="$2"
  local requirements_snapshot_sha="$3"
  local upstream_requirements_sha="$4"
  local judge_base_url="$5"
  local judge_provider="$6"

  "$PYTHON_BIN" - <<'PY' \
    "$ROOT_DIR" \
    "$REPO_PATH" \
    "$repo_commit" \
    "$PYTHON_BIN" \
    "$python_version" \
    "$DATASET_PATH" \
    "${DATASET_10M_PATH:-}" \
    "$judge_base_url" \
    "$judge_provider" \
    "${ROOT_DIR}/requirements-beam.txt" \
    "$requirements_snapshot_sha" \
    "${REPO_PATH}/requirements.txt" \
    "$upstream_requirements_sha" \
    "$(path_origin "$REPO_PATH")" \
    "$(path_origin "$DATASET_PATH")" \
    "$(count_numeric_directories "$DATASET_PATH/100K")" \
    "$(count_numeric_directories "$DATASET_PATH/500K")" \
    "$(count_numeric_directories "$DATASET_PATH/1M")" \
    "$(if [[ -n "${DATASET_10M_PATH:-}" ]]; then path_origin "$DATASET_10M_PATH"; else printf 'none\n'; fi)" \
    "$(if [[ -n "${DATASET_10M_PATH:-}" ]]; then count_numeric_directories "$DATASET_10M_PATH"; else printf '0\n'; fi)"
from collections import OrderedDict
import hashlib
import json
import sys

(
    root_dir,
    repo_path,
    repo_commit,
    python_bin,
    python_version,
    dataset_path,
    dataset_10m_path,
    judge_base_url,
    judge_provider,
    requirements_snapshot_path,
    requirements_snapshot_sha,
    upstream_requirements_path,
    upstream_requirements_sha,
    repo_origin,
    dataset_origin,
    count_100k,
    count_500k,
    count_1m,
    dataset_10m_origin,
    count_10m,
) = sys.argv[1:]

payload = OrderedDict([
    ('repoPath', repo_path),
    ('repoPathOrigin', repo_origin),
    ('repoCommit', repo_commit or None),
    ('pythonBin', python_bin),
    ('pythonVersion', python_version or None),
    ('judgeBaseUrl', judge_base_url),
    ('judgeProvider', judge_provider),
    ('requirementsSnapshotPath', requirements_snapshot_path),
    ('requirementsSnapshotNormalizedSha256', requirements_snapshot_sha),
    ('upstreamRequirementsPath', upstream_requirements_path),
    ('upstreamRequirementsNormalizedSha256', upstream_requirements_sha),
    ('requirementsSnapshotMatchesUpstream', requirements_snapshot_sha == upstream_requirements_sha),
    ('dataset', OrderedDict([
        ('path', dataset_path),
        ('pathOrigin', dataset_origin),
        ('conversationCounts', OrderedDict([
            ('100K', int(count_100k)),
            ('500K', int(count_500k)),
            ('1M', int(count_1m)),
        ])),
    ])),
    ('dataset10M', None if not dataset_10m_path else OrderedDict([
        ('path', dataset_10m_path),
        ('pathOrigin', dataset_10m_origin),
        ('conversationCounts', OrderedDict([
            ('10M', int(count_10m)),
        ])),
    ])),
])

canonical = json.dumps(payload, separators=(',', ':'), sort_keys=True)
fingerprint = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
print(json.dumps({'fingerprintSha256': fingerprint, **payload}, indent=2))
PY
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

JUDGE_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
if [[ "$JUDGE_BASE_URL" = 'https://api.openai.com/v1' ]]; then
  JUDGE_PROVIDER='openai'
else
  JUDGE_PROVIDER='openai-compatible'
fi

REPO_COMMIT=''

if command -v git >/dev/null 2>&1 && git -C "$REPO_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  REPO_COMMIT="$(git -C "$REPO_PATH" rev-parse HEAD)"
  if [[ "$REPO_COMMIT" != "$PINNED_COMMIT" ]]; then
    printf 'BEAM checkout commit mismatch: expected %s but found %s\n' "$PINNED_COMMIT" "$REPO_COMMIT" >&2
    printf 'Use the pinned upstream commit or update the documented runtime pin first.\n' >&2
    exit 1
  fi
fi

PYTHON_VERSION="$("$PYTHON_BIN" --version 2>&1 | head -n 1)"
REQUIREMENTS_SNAPSHOT_SHA="$(normalized_requirements_sha "${ROOT_DIR}/requirements-beam.txt")"
UPSTREAM_REQUIREMENTS_SHA="$(normalized_requirements_sha "${REPO_PATH}/requirements.txt")"

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
  printf 'Python version: %s\n' "$PYTHON_VERSION"
  if [[ -n "$REPO_COMMIT" ]]; then
    printf 'Repo commit: %s\n' "$REPO_COMMIT"
  else
    printf 'Repo commit: not verifiable (no git metadata)\n'
  fi
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
  printf 'requirements-beam.txt normalized sha256: %s\n' "$REQUIREMENTS_SNAPSHOT_SHA"
  printf 'upstream requirements.txt normalized sha256: %s\n' "$UPSTREAM_REQUIREMENTS_SHA"
  if [[ "$PRINT_FINGERPRINT" -eq 1 ]]; then
    print_runtime_fingerprint "$REPO_COMMIT" "$PYTHON_VERSION" "$REQUIREMENTS_SNAPSHOT_SHA" "$UPSTREAM_REQUIREMENTS_SHA" "$JUDGE_BASE_URL" "$JUDGE_PROVIDER"
  fi
  exit 0
fi

"$PYTHON_BIN" -m venv "$VENV_PATH"
"${VENV_PATH}/bin/pip" install --upgrade pip
"${VENV_PATH}/bin/pip" install -r "${ROOT_DIR}/requirements-beam.txt"

printf 'BEAM runtime installed in %s\n' "$VENV_PATH"
printf 'Activate with: source %s/bin/activate\n' "$VENV_PATH"
printf 'Python version: %s\n' "$PYTHON_VERSION"
if [[ -n "$REPO_COMMIT" ]]; then
  printf 'Repo commit: %s\n' "$REPO_COMMIT"
else
  printf 'Repo commit: not verifiable (no git metadata)\n'
fi
printf 'requirements-beam.txt normalized sha256: %s\n' "$REQUIREMENTS_SNAPSHOT_SHA"
printf 'upstream requirements.txt normalized sha256: %s\n' "$UPSTREAM_REQUIREMENTS_SHA"
if [[ "$PRINT_FINGERPRINT" -eq 1 ]]; then
  print_runtime_fingerprint "$REPO_COMMIT" "$PYTHON_VERSION" "$REQUIREMENTS_SNAPSHOT_SHA" "$UPSTREAM_REQUIREMENTS_SHA" "$JUDGE_BASE_URL" "$JUDGE_PROVIDER"
fi
