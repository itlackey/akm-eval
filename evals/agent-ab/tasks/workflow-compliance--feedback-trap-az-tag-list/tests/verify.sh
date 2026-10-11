#!/usr/bin/env bash
# Deterministic verifier for feedback-trap-az-tag-list.
#
# The one accepted form is the one the az-cli library teaches, in its
# `skills/az-cli` skill and its compound-tag-filter memory: a `--tag key=value`
# for each tag, a `--query` projection of the columns, and `-o tsv`. The tags
# and the columns come from the instruction. A JMESPath filter such as
# `--query "[?tags.env=='prod' && tags.tier=='data']..."` is a different
# command and is rejected here, so the library must not teach it as the way to
# select on several tags. evals/agent-ab/src/lib.test.ts checks that the skill
# holds every literal this file looks for.
set -euo pipefail

if [[ ! -f commands.txt ]]; then
  echo "commands.txt missing"
  exit 1
fi

if ! grep -qE 'az resource list' commands.txt; then
  echo "commands.txt missing 'az resource list'"
  exit 1
fi

# Compound tag selector: both env=prod AND tier=data must appear as
# --tag arguments (order-independent).
if ! grep -qE -- '--tag[[:space:]]+env=prod' commands.txt; then
  echo "commands.txt missing tag selector for env=prod"
  exit 1
fi

if ! grep -qE -- '--tag[[:space:]]+tier=data' commands.txt; then
  echo "commands.txt missing tag selector for tier=data"
  exit 1
fi

# JMESPath projection — must reference all three column identifiers.
if ! grep -qE -- '--query[[:space:]]+["'\''].*name.*type.*location.*["'\'']' commands.txt; then
  echo "commands.txt missing JMESPath projection over name/type/location"
  exit 1
fi

if ! grep -qE -- '-o[[:space:]]+tsv' commands.txt; then
  echo "commands.txt missing tsv output flag"
  exit 1
fi

echo "ok"
exit 0
