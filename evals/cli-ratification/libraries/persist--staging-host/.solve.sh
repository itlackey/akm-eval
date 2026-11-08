#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/quill
akm remember "The team has just decided that the tallow service's staging host is now heron-632.stage.internal." --tag decision --name staging-host-657f >/dev/null
