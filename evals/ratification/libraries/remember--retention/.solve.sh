#!/usr/bin/env bash
set -uo pipefail
cd /work
akm remember "Larch request logs are now kept for 60 days (changed on 2026-11-02)." --description "Larch retention change" --tag retention --tag larch
