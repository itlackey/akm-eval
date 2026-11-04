---
description: "Retired font loading approach using glob patterns"
evidence: Agent's implementation at 2026-09-22T10:48:31Z and user's initial
  request at 2026-09-22T10:48:25Z.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:16:41.458Z
verified:
  - by: human:user
    at: 2026-11-04T01:16:41.458Z
provenance:
  sources:
    - resource: claude:preference-06
---

Prior to 2026, the font system relied on a `GlobLoader` that scanned directories using wildcard patterns instead of explicit iteration. This approach was deprecated on March 15, 2026, due to performance bottlenecks with large font collections and security concerns regarding unintended file inclusion. The team replaced it with the current `Registry` struct and `LoadDir` method, which provides deterministic, safe, and efficient font discovery. This note is retained solely for historical reference to document the architectural shift from pattern-based scanning to explicit directory traversal. Developers should no longer use the old `GlobLoader` interface, as it has been completely removed from the codebase. The new system ensures consistent behavior across different operating systems and reduces memory overhead during initialization.
