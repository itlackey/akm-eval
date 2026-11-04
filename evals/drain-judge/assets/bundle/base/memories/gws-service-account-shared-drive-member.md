---
description: "A reporting service account got 404 on Ledger Archive shared drive files until it became a drive member."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-09
---
Drive exports run by the reporting service account failed with `404 File not
found` for files in the Ledger Archive shared drive, although the same files
opened normally for staff. Sharing the single folder with the service
account's email address did not help. Adding the service account as a Viewer
member of the shared drive itself fixed it within a minute. The Drive API call
also needs `supportsAllDrives=true`: without it, the same request still
returned 404 after the membership change. The service account's key and OAuth
scopes did not need to change.
