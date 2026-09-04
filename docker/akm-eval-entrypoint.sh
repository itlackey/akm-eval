#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tmp/akm-eval-home
export HOME=/tmp/akm-eval-home
export AKM_EVAL_IN_CONTAINER=1

# The source checkout is mounted for configs, datasets, outputs and git
# provenance.  Runtime dependencies remain image-owned under /opt/akm-eval.
export NODE_PATH="${AKM_EVAL_APP_ROOT:-/opt/akm-eval}/node_modules${NODE_PATH:+:$NODE_PATH}"

if [ "$#" -eq 0 ]; then
  exec bun "${AKM_EVAL_APP_ROOT:-/opt/akm-eval}/src/cli.ts"
fi

exec "$@"
