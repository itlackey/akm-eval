#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
akm remember "The team has just decided that release notes of the fescue service go to fescue-finch@example.com." --tag decision --name release-address-3f1a >/dev/null
