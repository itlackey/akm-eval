#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
akm remember "The team has just decided that the oriel service's canary share is 37 percent." --tag decision --name canary-share-2a8d >/dev/null
