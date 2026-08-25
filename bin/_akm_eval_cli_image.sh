#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$BIN_DIR/.." && pwd)"
IMAGE_TAG="${AKM_EVAL_CLI_IMAGE_TAG:-${AKM_EVAL_IMAGE_TAG:-akm-eval-cli:local}}"
WORKSPACE_DIR="${AKM_EVAL_WORKSPACE_DIR:-$REPO_ROOT}"
CONTAINER_WORKDIR="${AKM_EVAL_CONTAINER_WORKDIR:-$WORKSPACE_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Error: docker is required for bin/ operator commands.\n' >&2
  exit 1
fi

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
  docker_args+=(-t)
fi

# Run as the invoking user, not container root. The repo is bind-mounted, so
# everything the container writes -- run artifacts under runs/, and the akm
# backend's .akm-memory work dir inside them -- lands on the host owned by
# whoever docker ran as. As root that leaves the operator unable to read,
# archive or delete their own run output, and 0700 akm dirs then break
# `bun run check` on a clean tree.
#
# Skipped under rootless docker, where container root already maps to the
# invoking user and passing --user would map us to an unusable subuid --
# reintroducing exactly the ownership problem this avoids.
if ! docker info --format '{{range .SecurityOptions}}{{.}} {{end}}' 2>/dev/null | grep -q 'name=rootless'; then
  docker_args+=(--user "$(id -u):$(id -g)")
fi

docker_args+=(
  -v "$WORKSPACE_DIR:$WORKSPACE_DIR"
  -w "$CONTAINER_WORKDIR"
  -e AKM_EVAL_PROJECT_ROOT="$WORKSPACE_DIR"
  -e HOME=/tmp/akm-eval-home
)

for env_name in \
  OPENAI_API_KEY \
  OPENAI_BASE_URL \
  OPENCODE_API_KEY \
  AKM_EVAL_AKM_CMD \
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
    docker_args+=(-e "$env_name=${!env_name}")
  fi
done

for env_name in $(compgen -e); do
  case "$env_name" in
    *_API_KEY|*_BASE_URL|*_TOKEN)
      docker_args+=(-e "$env_name=${!env_name}")
      ;;
  esac
done

if [ -S /var/run/docker.sock ]; then
  docker_args+=(-v /var/run/docker.sock:/var/run/docker.sock)
  # As a non-root uid the socket is only reachable via its owning group.
  socket_gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"
  if [ -n "$socket_gid" ]; then
    docker_args+=(--group-add "$socket_gid")
  fi
fi

exec docker "${docker_args[@]}" "$IMAGE_TAG" "$@"
