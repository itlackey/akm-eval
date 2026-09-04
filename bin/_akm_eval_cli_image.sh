#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$BIN_DIR/.." && pwd)"
# shellcheck source=bin/_akm_eval_image_lib.sh
source "$BIN_DIR/_akm_eval_image_lib.sh"
AKM_VERSION="${AKM_EVAL_AKM_VERSION:-}"
IMAGE_FLAVOR="${AKM_EVAL_IMAGE_FLAVOR:-core}"

akm_eval_validate_version "$AKM_VERSION" || {
  printf 'Error: invalid AKM_EVAL_AKM_VERSION for an image tag: %s\n' "$AKM_VERSION" >&2
  exit 2
}
case "$IMAGE_FLAVOR" in
  core|beam) ;;
  *) printf 'Error: AKM_EVAL_IMAGE_FLAVOR must be core or beam.\n' >&2; exit 2 ;;
esac

if ! RUNTIME_FINGERPRINT="$(akm_eval_runtime_fingerprint "$REPO_ROOT" "$IMAGE_FLAVOR")"; then
  printf 'Error: could not fingerprint the evaluator image inputs; is this a git checkout?\n' >&2
  exit 1
fi
DEFAULT_IMAGE_TAG="$(akm_eval_default_image_tag "$IMAGE_FLAVOR" "$AKM_VERSION" "$RUNTIME_FINGERPRINT")"
IMAGE_TAG="${AKM_EVAL_CLI_IMAGE_TAG:-${AKM_EVAL_IMAGE_TAG:-$DEFAULT_IMAGE_TAG}}"

if ! WORKSPACE_DIR="$(akm_eval_canonical_path "${AKM_EVAL_WORKSPACE_DIR:-$REPO_ROOT}")"; then
  printf 'Error: AKM_EVAL_WORKSPACE_DIR does not exist: %s\n' "${AKM_EVAL_WORKSPACE_DIR:-$REPO_ROOT}" >&2
  exit 1
fi
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
  AKM_EVAL_AKM_VERSION="$AKM_VERSION" \
    AKM_EVAL_IMAGE_FLAVOR="$IMAGE_FLAVOR" \
    AKM_EVAL_CLI_IMAGE_TAG="$IMAGE_TAG" \
    bash "$REPO_ROOT/bin/build-image"
fi

docker_args=(run --rm -i --init)
if [ -t 0 ] && [ -t 1 ]; then
  docker_args+=(-t)
fi

# Run as the invoking user, not container root. Writable result mounts must
# land on the host owned by whoever invoked Docker. As root they would leave
# the operator unable to archive or delete their own run output, and 0700 AKM
# state dirs would then break later checks on the checkout.
#
# Skipped under rootless docker, where container root already maps to the
# invoking user and passing --user would map us to an unusable subuid --
# reintroducing exactly the ownership problem this avoids.
if ! docker info --format '{{range .SecurityOptions}}{{.}} {{end}}' 2>/dev/null | grep -q 'name=rootless'; then
  docker_args+=(--user "$(id -u):$(id -g)")
fi

runs_dir="$WORKSPACE_DIR/runs"
datasets_dir="$WORKSPACE_DIR/datasets"
mkdir -p "$runs_dir" "$datasets_dir"

datasets_mount="type=bind,source=$datasets_dir,target=$datasets_dir,readonly"
if [ "${AKM_EVAL_DATASETS_WRITABLE:-0}" = "1" ]; then
  datasets_mount="type=bind,source=$datasets_dir,target=$datasets_dir"
fi

docker_args+=(
  --mount "type=bind,source=$WORKSPACE_DIR,target=$WORKSPACE_DIR,readonly"
  --mount "type=bind,source=$runs_dir,target=$runs_dir"
  --mount "$datasets_mount"
  --mount "type=volume,target=$WORKSPACE_DIR/node_modules,volume-nocopy"
  -w "$CONTAINER_WORKDIR"
  -e "AKM_EVAL_PROJECT_ROOT=$WORKSPACE_DIR"
  -e AKM_EVAL_IN_CONTAINER=1
  -e HOME=/tmp/akm-eval-home
  --add-host host.docker.internal:host-gateway
)

# Docker reads this file on the host.  It is never copied into the build
# context or mounted into the container.
if [ -n "${AKM_EVAL_ENV_FILE:-}" ]; then
  env_file="$AKM_EVAL_ENV_FILE"
  if [[ "$env_file" != /* ]]; then
    env_file="$REPO_ROOT/$env_file"
  fi
  if [ ! -f "$env_file" ]; then
    printf 'Error: AKM_EVAL_ENV_FILE is not a file: %s\n' "$env_file" >&2
    exit 1
  fi
  env_file="$(akm_eval_canonical_path "$env_file")"
  docker_args+=(--env-file "$env_file")
fi

# Pass only variables the eval surface understands.  `-e NAME` asks Docker to
# inherit the value without exposing it in the docker command's argv.  Extra
# provider variables require an explicit, name-only allowlist.
for env_name in \
  OPENAI_API_KEY \
  OPENAI_BASE_URL \
  OPENCODE_API_KEY \
  ANTHROPIC_API_KEY \
  GOOGLE_API_KEY \
  MISTRAL_API_KEY \
  HF_TOKEN \
  LAB_API_KEY \
  LAB_AI_BASE_URL \
  AKM_EVAL_AKM_CMD \
  AKM_EVAL_AKM_VERSION \
  AKM_EVAL_JUDGE_API_KEY \
  AKM_EVAL_JUDGE_BASE_URL \
  AKM_EVAL_JUDGE_MAX_TOKENS \
  AKM_EVAL_JUDGE_MAX_UNPARSEABLE_RATE \
  BEAM_PYTHON_BIN
do
  if [ -n "${!env_name:-}" ]; then
    docker_args+=(-e "$env_name")
  fi
done

if [ -n "${AKM_EVAL_ENV_ALLOWLIST:-}" ]; then
  IFS=',' read -r -a extra_env_names <<<"$AKM_EVAL_ENV_ALLOWLIST"
  for env_name in "${extra_env_names[@]}"; do
    case "$env_name" in
      ''|[0-9]*|*[!A-Za-z0-9_]*)
        printf 'Error: invalid name in AKM_EVAL_ENV_ALLOWLIST: %s\n' "$env_name" >&2
        exit 2
        ;;
    esac
    if [ -n "${!env_name:-}" ]; then
      docker_args+=(-e "$env_name")
    fi
  done
fi

# External data/config/source paths must be opted in.  They are mounted at the
# same absolute path so existing configs and AKM_EVAL_AKM_CMD JSON remain
# truthful, and read-only so an evaluator cannot mutate source evidence.
for path_env_name in \
  AKM_EVAL_DATASET_DIR \
  AKM_EVAL_AKM_SOURCE_DIR \
  EVAL_OPENCODE_CONFIG \
  BEAM_REPO_PATH \
  BEAM_DATASET_PATH \
  BEAM_DATASET_10M_PATH
do
  configured_path="${!path_env_name:-}"
  if [ -z "$configured_path" ]; then
    continue
  fi
  if [[ "$configured_path" != /* ]]; then
    configured_path="$REPO_ROOT/$configured_path"
  fi
  if ! configured_path="$(akm_eval_canonical_path "$configured_path")"; then
    printf 'Error: %s does not exist: %s\n' "$path_env_name" "${!path_env_name}" >&2
    exit 1
  fi
  case "$configured_path" in
    *,*|*$'\n'*)
      printf 'Error: mounted path contains an unsupported comma or newline: %s\n' "$configured_path" >&2
      exit 2
      ;;
  esac
  printf -v "$path_env_name" '%s' "$configured_path"
  export "$path_env_name"
  docker_args+=(-e "$path_env_name")
  case "$configured_path" in
    "$WORKSPACE_DIR"|"$WORKSPACE_DIR"/*) ;;
    *) docker_args+=(--mount "type=bind,source=$configured_path,target=$configured_path,readonly") ;;
  esac
done

# Mount an explicitly selected output root read/write. Normal runs/ output is
# already covered by its dedicated writable mount.
if [ -n "${AKM_EVAL_OUTPUT_DIR:-}" ]; then
  output_dir="$AKM_EVAL_OUTPUT_DIR"
  if [[ "$output_dir" != /* ]]; then
    output_dir="$REPO_ROOT/$output_dir"
  fi
  mkdir -p "$output_dir"
  output_dir="$(akm_eval_canonical_path "$output_dir")"
  export AKM_EVAL_OUTPUT_DIR="$output_dir"
  docker_args+=(-e AKM_EVAL_OUTPUT_DIR)
  case "$output_dir" in
    "$runs_dir"|"$runs_dir"/*) ;;
    "$WORKSPACE_DIR")
      printf 'Error: AKM_EVAL_OUTPUT_DIR may not make the entire checkout writable.\n' >&2
      exit 2
      ;;
    *) docker_args+=(--mount "type=bind,source=$output_dir,target=$output_dir") ;;
  esac
fi

exec docker "${docker_args[@]}" "$IMAGE_TAG" "$@"
