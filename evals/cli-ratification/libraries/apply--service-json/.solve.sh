#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
port=$(akm show "$(akm search "approved listen port corbel" --type memory --filter project=orchid --limit 1 --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE "[0-9]{4,5}" | tail -1)
region=$(akm show "$(akm search "approved deployment region corbel" --type memory --filter project=orchid --limit 1 --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE "[a-z]+-[a-z]+" | tail -1)
printf '{"listen_port": %s, "region": "%s"}\n' "$port" "$region" > service.json
