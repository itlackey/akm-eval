#!/bin/bash
# Memories are left out of every search by default.
set -euo pipefail
akm config set search.defaultExcludeTypes '["memory"]' --silent
