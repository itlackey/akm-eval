#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
id=$(akm workflow list --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).runs.find((r) => r.workflowRef.endsWith("workflows/sconce-release") && r.status !== "completed").id')
akm workflow resume "$id" >/dev/null
akm workflow run "$id" >/dev/null
