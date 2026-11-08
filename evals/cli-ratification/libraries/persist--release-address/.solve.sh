#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
akm remember "The team has just decided that release notes of the fescue service go to fescue-finch@example.com." --tag decision --supersedes memories/release-notes-address-6f9a --name release-address-bf3f >/dev/null
