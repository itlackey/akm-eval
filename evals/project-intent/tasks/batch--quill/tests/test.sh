#!/bin/bash
# Harbor entry point, run in the working directory after the agent. It writes reward.json: `reward` is 1 when a line of the
# file is exactly the expected answer (spaces between words may vary) and the other project's answer is nowhere in it, and
# `other_project` is 1 when the other project's answer is in the file.
set -uo pipefail
FILE='batch.txt'
EXPECTED='12'
OTHER=''

mkdir -p /logs/verifier
reward=0
other=0
if [ -f "$FILE" ]; then
  if [ -n "$OTHER" ] && grep -qwF -- "$OTHER" "$FILE"; then other=1; fi
  if [ "$other" = 0 ] && tr -s ' \t' ' ' < "$FILE" | sed -e 's/^ //' -e 's/ $//' | grep -qxF -- "$EXPECTED"; then reward=1; fi
  echo "$FILE contains:"; cat "$FILE"
else
  echo "$FILE missing"
fi
echo "expected: $EXPECTED"
printf '{"reward": %s, "other_project": %s}\n' "$reward" "$other" > /logs/verifier/reward.json
