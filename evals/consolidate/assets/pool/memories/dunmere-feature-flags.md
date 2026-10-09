---
description: How Dunmere feature flags are named, owned and cleaned up.
tags: [flags, process]
---

# Dunmere feature flags

Dunmere feature flags are named with the prefix dm_ and snake case. Every flag has one owner, recorded in the flags.yaml file next to the code. A new flag defaults to off in production and on in the dev environment. Flags older than 90 days are reported in the weekly clean-up list. A flag is deleted in the same pull request that removes its last use. Flag changes in production need a second approver. The flag service answers from a local cache refreshed every 30 seconds.
