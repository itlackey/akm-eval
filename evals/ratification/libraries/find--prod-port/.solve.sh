#!/usr/bin/env bash
set -uo pipefail
cd /work
akm search "tallow port production"
akm show knowledge/tallow-ports
printf '7421\n' > /work/answer.txt
