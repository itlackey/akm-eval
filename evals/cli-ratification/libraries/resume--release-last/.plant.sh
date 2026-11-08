#!/bin/bash
# A first run, which stops at step 3.
set -euo pipefail
mkdir -p /work/orchid/.pannier-release
akm workflow run workflows/pannier-release >/dev/null || true
