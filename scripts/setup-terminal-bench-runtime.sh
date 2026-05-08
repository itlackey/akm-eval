#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.akm/evals/venvs/terminal-bench"

if ! command -v uv >/dev/null 2>&1; then
  printf 'uv is required to manage the Terminal-Bench runtime environment. Install uv first.\n' >&2
  exit 1
fi

mkdir -p "$(dirname "$VENV_DIR")"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  uv venv --python 3.12 "$VENV_DIR" >/dev/null
fi

if [[ ! -x "$VENV_DIR/bin/tb" ]] || ! "$VENV_DIR/bin/python" -c 'import terminal_bench' >/dev/null 2>&1; then
  uv pip install --python "$VENV_DIR/bin/python" terminal-bench >/dev/null
fi
