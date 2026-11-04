---
description: "Retired method of granting Drive API access via folder-level sharing"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-09
---

Prior to March 15, 2026, the team attempted to resolve 404 errors for the reporting service account by explicitly sharing individual Ledger Archive folders with the service account's email. This approach proved fragile and inconsistent, often failing silently or requiring manual intervention for new files. It was officially retired on March 15, 2026, in favor of the **Shared Drive Membership** approach. This new method involves adding the service account as a Viewer member of the entire shared drive, ensuring immediate and automatic access to all current and future files without per-file configuration. The Shared Drive Membership approach is more scalable and aligns with Google Drive's permission hierarchy, eliminating the need for granular folder sharing and reducing administrative overhead significantly. This note is kept for historical reference only.
