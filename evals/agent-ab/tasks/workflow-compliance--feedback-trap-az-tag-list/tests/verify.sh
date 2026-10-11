#!/usr/bin/env bash
# Deterministic verifier for feedback-trap-az-tag-list.
#
# Both tags must select. Each one is accepted as a `--tag key=value` argument or as a condition on
# `tags.<key>=='<value>'` in the `--query` filter, so the command that selects on both is:
#
#   az resource list --query "[?tags.env=='prod' && tags.tier=='data'].[name,type,location]" -o tsv
#
# The filter is what the az-cli library teaches, in its `skills/az-cli` skill and its compound-tag-filter memory,
# because `az resource list --tag` takes a single tag: a second `--tag` does not AND. A repeated
# `--tag env=prod --tag tier=data` is accepted too, because the first version of this task graded on it and a run that
# passed then still passes. The tags and the columns come from the instruction. evals/agent-ab/src/lib.test.ts checks
# that the skill holds the literals this file looks for.
set -euo pipefail

if [[ ! -f commands.txt ]]; then
  echo "commands.txt missing"
  exit 1
fi

if ! grep -qE 'az resource list' commands.txt; then
  echo "commands.txt missing 'az resource list'"
  exit 1
fi

# OR is a different selection: both tags have to hold.
if grep -qF -- '||' commands.txt; then
  echo "commands.txt joins the tags with ||; env=prod AND tier=data must both hold"
  exit 1
fi

# Each tag appears as a --tag argument or as a condition in the filter (order-independent). When both are in the
# filter, they must be joined with &&.
filtered=0
for selector in env=prod tier=data; do
  key=${selector%%=*}
  value=${selector#*=}
  if grep -qE -- "--tag[[:space:]]+$key=$value" commands.txt; then
    continue
  fi
  if grep -qE -- "tags\.$key[[:space:]]*==[[:space:]]*'$value'" commands.txt; then
    filtered=$((filtered + 1))
    continue
  fi
  echo "commands.txt missing tag selector for $key=$value"
  exit 1
done

if [[ $filtered -eq 2 ]] && ! grep -qF -- '&&' commands.txt; then
  echo "commands.txt filters on both tags without && between them"
  exit 1
fi

# JMESPath projection — must reference all three column identifiers.
if ! grep -qE -- '--query[[:space:]]+["'\''].*name.*type.*location.*["'\'']' commands.txt; then
  echo "commands.txt missing JMESPath projection over name/type/location"
  exit 1
fi

if ! grep -qE -- '(-o|--output)[[:space:]]+tsv' commands.txt; then
  echo "commands.txt missing tsv output flag"
  exit 1
fi

echo "ok"
exit 0
