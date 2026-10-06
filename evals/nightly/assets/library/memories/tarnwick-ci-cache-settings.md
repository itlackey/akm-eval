---
description: What the Tarnwick CI cache is keyed on, where it lives and when entries expire.
tags: [ci, cache]
---

# Tarnwick CI cache settings

- The Tarnwick CI cache key is made from the pnpm lockfile hash and the Node version.
- The cache lives in `~/.cache/pnpm` on the runner.
- Entries expire after 7 days without a hit.
- A cache miss adds about 4 minutes to the install step of a run.
- To force a fresh install, bump the CACHE_VERSION variable in the workflow file.
- Runners are on Node 20.11 and pnpm 9.1.
- The release job never uses the cache and always installs from scratch.
