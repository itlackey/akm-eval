#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
text=$(akm show "$(akm search "tallow resource limits" --type knowledge --filter project=orchid --limit 1 --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).hits[0].ref')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content')
cpu=$(printf '%s' "$text" | grep -oE '[0-9]+m' | head -1)
mem=$(printf '%s' "$text" | grep -oE '[0-9]+Mi' | head -1)
secs=$(printf '%s' "$text" | grep -oE '[0-9]+ seconds' | grep -oE '[0-9]+')
printf '{"cpu": "%s", "memory": "%s", "timeout_secs": %s}\n' "$cpu" "$mem" "$secs" > limits.json
