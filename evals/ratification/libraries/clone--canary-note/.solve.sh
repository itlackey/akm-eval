#!/usr/bin/env bash
set -uo pipefail
cd /work
akm import knowledge/tallow-ports --asset-ref --name tallow-ports-canary
sed -i 's/7421/7430/' "$AKM_BUNDLE_DIR/knowledge/tallow-ports-canary.md"
