#!/usr/bin/env bash
# Localization verifier: answer.txt must hold one non-empty line that names the file below, relative to the
# repository root (a leading ./ or /app/repo/ is accepted, and a :line suffix), as the only .ts path on it,
# and one of the accepted function names as a whole word.
set -uo pipefail

FILE=answer.txt
EXPECTED_PATH=src/workflows/parser.ts
SYMBOLS=(parseWorkflow)

if [[ ! -f "$FILE" ]]; then echo "$FILE missing"; exit 1; fi
mapfile -t lines < <(grep -v '^[[:space:]]*$' "$FILE")
if (( ${#lines[@]} != 1 )); then
  echo "$FILE must hold exactly one non-empty line; it holds ${#lines[@]}:"; cat "$FILE"; exit 1
fi
line=${lines[0]//\/app\/repo\//}
mapfile -t paths < <(grep -oE '[A-Za-z0-9_./-]+\.ts\b' <<<"$line" | sed -e 's#^\./##')
if (( ${#paths[@]} != 1 )) || [[ "${paths[0]}" != "$EXPECTED_PATH" ]]; then
  echo "expected the one file $EXPECTED_PATH; the line names: ${paths[*]:-none}"; echo "$line"; exit 1
fi
for s in "${SYMBOLS[@]}"; do
  if grep -qw -- "$s" <<<"$line"; then echo "ok"; exit 0; fi
done
echo "the line does not name the function (${SYMBOLS[*]})"; echo "$line"; exit 1
