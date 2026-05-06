#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_TAG="akm-eval-beam:local"
REPO_PATH="${BEAM_REPO_PATH:-${ROOT_DIR}/vendor/BEAM}"
DATASET_PATH="${BEAM_DATASET_PATH:-}"
DATASET_10M_PATH="${BEAM_DATASET_10M_PATH:-}"

usage() {
  cat <<'EOF'
Usage: tools/beam/run-in-container.sh [--build] -- <command>

Builds or reuses a minimal local container with the pinned Python BEAM runtime,
then runs a command with the current repo mounted at /workspace.

Examples:
  tools/beam/run-in-container.sh --build -- bash scripts/setup-beam-runtime.sh --check
  tools/beam/run-in-container.sh -- bun src/cli.ts doctor

Environment:
  BEAM_REPO_PATH        Host path to the upstream BEAM checkout. Default: vendor/BEAM
  BEAM_DATASET_PATH     Host path to the prepared default BEAM dataset.
  BEAM_DATASET_10M_PATH Host path to the prepared BEAM 10M dataset.
  OPENAI_API_KEY        Optional judge credential passed through to the container.
  OPENAI_BASE_URL       Optional judge endpoint override passed through to the container.

This container only pins the repo-side Python base image and Python dependencies.
It does not pin the upstream dataset contents, judge credentials, GPU stack, or host Docker version.
EOF
}

BUILD_IMAGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_IMAGE=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      printf 'Unknown argument: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  printf 'A command is required.\n\n' >&2
  usage >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker not found in PATH\n' >&2
  exit 1
fi

if [[ "$BUILD_IMAGE" -eq 1 ]]; then
  docker build -t "$IMAGE_TAG" -f "$ROOT_DIR/tools/beam/Dockerfile" "$ROOT_DIR"
fi

DOCKER_ARGS=(
  run --rm -it
  -v "$ROOT_DIR:/workspace"
  -w /workspace
  -e BEAM_REPO_PATH="${REPO_PATH}"
)

if [[ -n "$DATASET_PATH" ]]; then
  DOCKER_ARGS+=( -e BEAM_DATASET_PATH="$DATASET_PATH" )
fi

if [[ -n "$DATASET_10M_PATH" ]]; then
  DOCKER_ARGS+=( -e BEAM_DATASET_10M_PATH="$DATASET_10M_PATH" )
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  DOCKER_ARGS+=( -e OPENAI_API_KEY )
fi

if [[ -n "${OPENAI_BASE_URL:-}" ]]; then
  DOCKER_ARGS+=( -e OPENAI_BASE_URL )
fi

docker "${DOCKER_ARGS[@]}" "$IMAGE_TAG" "$@"
