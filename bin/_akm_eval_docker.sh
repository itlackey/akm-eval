#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$BIN_DIR/.." && pwd)"
IMAGE_TAG="${AKM_EVAL_IMAGE_TAG:-akm-eval:local}"
WORKSPACE_DIR="${AKM_EVAL_WORKSPACE_DIR:-$REPO_ROOT}"
CONTAINER_WORKDIR="${AKM_EVAL_CONTAINER_WORKDIR:-/workspace/akm-eval}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Error: docker is required for bin/ operator commands.\n' >&2
  exit 1
fi

HOST_DOCKER_BIN="$(command -v docker)"
HOST_BIN_DIR="${AKM_EVAL_HOST_BIN_DIR:-/tmp/akm-eval-host-bin}"
HOST_DOCKER_COPY="$HOST_BIN_DIR/docker"
CONTAINER_HOST_BIN_DIR="${AKM_EVAL_CONTAINER_HOST_BIN_DIR:-/akm-host-bin}"

mkdir -p "$HOST_BIN_DIR"
cp -f "$HOST_DOCKER_BIN" "$HOST_DOCKER_COPY"
chmod +x "$HOST_DOCKER_COPY"

build_if_missing="${AKM_EVAL_BUILD_IF_MISSING:-1}"
if ! docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  if [ "$build_if_missing" = "0" ]; then
    printf 'Error: Docker image %s not found. Run bin/build-image first.\n' "$IMAGE_TAG" >&2
    exit 1
  fi
  bash "$REPO_ROOT/bin/build-image"
fi

docker_args=(run --rm -i)
if [ -t 0 ] && [ -t 1 ]; then
  docker_args+=( -t )
fi

docker_args+=(
  -v "$WORKSPACE_DIR:$CONTAINER_WORKDIR"
  -v "$HOST_BIN_DIR:$CONTAINER_HOST_BIN_DIR:ro"
  -w "$CONTAINER_WORKDIR"
  -e AKM_EVAL_PROJECT_ROOT="$CONTAINER_WORKDIR"
  -e HOME=/tmp/akm-eval-home
  -e PATH="$CONTAINER_HOST_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin"
)

for env_name in \
  OPENAI_API_KEY \
  OPENAI_BASE_URL \
  OPENCODE_API_KEY \
  AKM_STASH_DIR \
  XDG_CACHE_HOME \
  XDG_CONFIG_HOME \
  DOCKER_HOST \
  DOCKER_TLS_VERIFY \
  DOCKER_CERT_PATH \
  DOCKER_CONTEXT \
  EVAL_OPENCODE_CONFIG \
  BEAM_REPO_PATH \
  BEAM_DATASET_PATH \
  BEAM_DATASET_10M_PATH \
  BEAM_PYTHON_BIN
do
  if [ -n "${!env_name:-}" ]; then
    docker_args+=( -e "$env_name=${!env_name}" )
  fi
done

if [ -S /var/run/docker.sock ]; then
  docker_args+=( -v /var/run/docker.sock:/var/run/docker.sock )
fi

exec docker "${docker_args[@]}" "$IMAGE_TAG" "$@"
