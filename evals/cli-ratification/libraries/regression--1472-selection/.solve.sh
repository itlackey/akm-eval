#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
# --project alone prints the selection of that project; the filter flag on top is what #1472 is about, and the verifier takes either
out=$(akm search "gantry release tag prefix" --project quill --filter project=quill --format json)
printf '%s' "$out" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).project)' > selection.json
akm show "$(printf '%s' "$out" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE '`[^`]+`' | tr -d '`' | head -1 > tag.txt
