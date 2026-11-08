#!/bin/bash
# The project's filter names a project that does not exist.
set -euo pipefail
akm config set projects '{"orchid":{"paths":["/work/orchid"],"filters":{"project":["orchd"]}},"quill":{"paths":["/work/quill"]}}' --silent
