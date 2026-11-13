#!/usr/bin/env bash
set -uo pipefail
cd /work
akm doctor || true
printf 'nightly-backup\n' > /work/health.txt
