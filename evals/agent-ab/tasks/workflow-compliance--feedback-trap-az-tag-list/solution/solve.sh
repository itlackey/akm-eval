#!/bin/bash
set -euo pipefail
cat >> commands.txt <<'CMD'
az resource list --query "[?tags.env=='prod' && tags.tier=='data'].[name,type,location]" -o tsv
CMD
