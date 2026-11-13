#!/usr/bin/env bash
set -uo pipefail
cd /work
ids() { akm proposal list --format json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const p of j.proposals)console.log(p.id+" "+p.ref)'; }
akm proposal list
for line in $(ids | cut -d' ' -f1); do akm proposal diff "$line" >> /tmp/diffs.txt; done
GOOD=$(ids | grep larch-retention | cut -d' ' -f1)
BAD=$(ids | grep tallow-ports | cut -d' ' -f1)
akm proposal accept "$GOOD"
akm proposal reject "$BAD" --reason "Not in the changelog" --yes
