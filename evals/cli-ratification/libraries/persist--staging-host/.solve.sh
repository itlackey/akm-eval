#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/quill
akm remember "The team has just decided that the tallow service's staging host is now heron-632.stage.internal." --tag decision --supersedes memories/staging-host-82a6 --name staging-host-f657 >/dev/null
