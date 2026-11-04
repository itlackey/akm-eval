---
description: "Retired legacy theme loading mechanism using environment variables"
evidence: agent running `go run ./cmd/quill themes list -v` at
  ts=2026-10-10T14:00:11Z and documenting at ts=2026-10-10T14:00:21Z
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:19:54.095Z
verified:
  - by: human:user
    at: 2026-11-04T01:19:54.095Z
provenance:
  sources:
    - resource: claude:buried-08
---

Prior to 2026, Quillmark relied on the `QUILLMARK_THEME_PATH` environment variable to locate custom themes. This approach was deprecated because it made theme resolution unpredictable across different deployment environments and CI pipelines, where environment variables were often inconsistent or forgotten.

On March 15, 2026, the team retired this method in favor of the **Hierarchical File System** approach. The new system strictly searches local directories (`./themes/`) and user config paths (`~/.config/quillmark/themes/`) in a defined order, ensuring deterministic behavior without external dependencies. This change simplified configuration management and aligned with standard Unix-like path resolution patterns, eliminating the need for manual environment setup by users.
