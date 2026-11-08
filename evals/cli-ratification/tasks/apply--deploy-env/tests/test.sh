#!/bin/bash
# Harbor entry point, run in the container after the agent has exited. verify.mjs judges the state left behind and writes
# /logs/verifier/reward.json and checks.json. A missing node is an unscored trial, not a failed one.
set -uo pipefail
mkdir -p /logs/verifier
exec node /tests/verify.mjs /tests/expected.json
