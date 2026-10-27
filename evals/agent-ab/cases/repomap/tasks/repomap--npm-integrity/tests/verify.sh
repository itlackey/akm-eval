#!/usr/bin/env bash
# Localization verifier: answer.txt must hold one non-empty line that names one of the accepted files below, relative
# to the repository root (a leading ./ or /app/repo/ is accepted, and a :line suffix), as the only .ts path on it,
# and that file's function as a whole word.
set -uo pipefail

FILE=answer.txt
# Two functions check an npm download against its sha512 integrity: the package fetcher's and the npm source's.
ANSWERS=("src/core/npm-package.ts verifyIntegrity" "src/sources/providers/tar-utils.ts verifyArchiveIntegrity")

if [[ ! -f "$FILE" ]]; then echo "$FILE missing"; exit 1; fi
mapfile -t lines < <(grep -v '^[[:space:]]*$' "$FILE")
if (( ${#lines[@]} != 1 )); then
  echo "$FILE must hold exactly one non-empty line; it holds ${#lines[@]}:"; cat "$FILE"; exit 1
fi
line=${lines[0]//\/app\/repo\//}
mapfile -t paths < <(grep -oE '[A-Za-z0-9_./-]+\.ts\b' <<<"$line" | sed -e 's#^\./##')
for a in "${ANSWERS[@]}"; do
  if (( ${#paths[@]} == 1 )) && [[ "${paths[0]}" == "${a%% *}" ]] && grep -qw -- "${a#* }" <<<"$line"; then echo "ok"; exit 0; fi
done
echo "expected one of: ${ANSWERS[*]}; the line names: ${paths[*]:-none}"; echo "$line"; exit 1
