#!/usr/bin/env bash
set -uo pipefail
cd /work
akm search "stamp release" --type task
akm run tasks/stamp-release
