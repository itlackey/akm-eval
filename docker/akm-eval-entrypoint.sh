#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tmp/akm-eval-home
export HOME=/tmp/akm-eval-home

if [ "$#" -eq 0 ]; then
  exec bun src/cli.ts
fi

exec "$@"
