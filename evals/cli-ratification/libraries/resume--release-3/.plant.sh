#!/bin/bash
# A first run, which stops at step 2.
set -euo pipefail
mkdir -p /work/orchid/.sconce-release
akm workflow run workflows/sconce-release >/dev/null || true
