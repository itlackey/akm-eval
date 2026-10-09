---
description: How Dunmere feature flags are named, owned and cleaned up.
tags: [flags, process]
---

# Dunmere feature flags

Dunmere feature flags are named with snake case and the prefix dm_. Every flag has a single owner, recorded in the flags.yaml file next to the code. A new flag starts off in production and on in the dev environment. Flags older than 90 days are listed in the weekly clean-up list. Flag changes in production need a second reviewer. A flag is removed in the same pull request that drops its last use. The flag service answers from a local cache that refreshes every 30 seconds.
