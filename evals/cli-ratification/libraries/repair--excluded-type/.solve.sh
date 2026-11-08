#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/quill
akm config unset search.defaultExcludeTypes >/dev/null
