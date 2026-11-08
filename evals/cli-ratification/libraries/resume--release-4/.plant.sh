#!/bin/bash
# A first run, which stops at step 3.
set -euo pipefail
mkdir -p /work/quill/.oriel-release
akm workflow run workflows/oriel-release >/dev/null || true
