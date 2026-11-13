#!/usr/bin/env bash
set -uo pipefail
cd /work
akm import /work/drafts/nightly.yml --type task || true
printf 'invalid\n' > /work/validity.txt
