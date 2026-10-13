#!/usr/bin/env bash
# Historical v0.4 reproduction: use a v0.4 checkout (matrix was removed in v0.6).
# For current direct commands, see the root README.
# Run from the repository root with MODEL_BASE_URL and JUDGE_BASE_URL set to your Bifrost /v1 endpoint.
set -euo pipefail
source lib/env.sh
: "${MODEL_BASE_URL:?Set the Bifrost endpoint}"
export MODEL_NAME=chat/qwen3.8-27b
export JUDGE_MODEL="${JUDGE_MODEL:-chat/qwen3.8-27b}"
export JUDGE_BASE_URL="${JUDGE_BASE_URL:-$MODEL_BASE_URL}"
export AKM_BIN="${AKM_BIN:-akm}"
[ "$("$AKM_BIN" --version)" = 0.10.261003-beta ] || { echo 'Install akm-cli@0.10.261003-beta first' >&2; exit 2; }

scripts/smoke/run --contract
scripts/smoke/run --strict
evals/retrieval/run --semantic off --repeat 3 --label akm-0.10-keyword
for name in judge-gate reflect distill consolidate extract nightly promotion bakeoff; do
  "evals/$name/run" --repeat 3 --label bifrost-qwen-akm-0.10
done

benchmarks/longmemeval/run --retrieval-only --label akm-0.10-public
benchmarks/skillret/run --label akm-0.10-public

matrix=reports/0.10.261003-beta/reproduction/reflect-matrix.json
scripts/matrix/run "$matrix" --stage screen
scripts/matrix/run "$matrix" --stage confirm --only filter-off
scripts/matrix/run "$matrix" --stage screen # unchanged rows should be skipped

# These larger agent benchmarks use GPT-120; the judge remains the existing Qwen judge.
# Harbor requires a nonempty key even for a keyless gateway. "local" is a dummy value.
MODEL_API_KEY="${MODEL_API_KEY:-local}" evals/agent-ab/run --repeat 3 --model freellm/gpt-oss:120b --akm akm-cli@0.10.261003-beta --label bifrost-gpt120-akm-0.10
MODEL_API_KEY="${MODEL_API_KEY:-local}" benchmarks/terminal-bench/run --attempts 3 --model freellm/gpt-oss:120b --akm akm-cli@0.10.261003-beta --label bifrost-gpt120-akm-0.10
benchmarks/longmemeval/run --model freellm/gpt-oss:120b --label bifrost-gpt120-akm-0.10
