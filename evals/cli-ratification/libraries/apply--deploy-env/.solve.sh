#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/quill
replicas=$(akm show "$(akm search "fescue replicas" --type memory --filter project=quill --limit 1 --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE "[0-9]+" | tail -1)
window=$(akm show "$(akm search "fescue backed up" --type memory --filter project=quill --limit 1 --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE "[0-9]{2}:[0-9]{2}" | tail -1)
channel=$(akm show "$(akm search "alerts fescue chat channel" --type memory --filter project= --limit 1 --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE "#[a-z-]+" | tail -1)
printf 'REPLICAS=%s\nBACKUP_WINDOW=%s\nALERT_CHANNEL=%s\n' "$replicas" "$window" "$channel" > deploy.env
