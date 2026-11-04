---
description: "Retired manual column renaming workflow for newsletter imports"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-05
---

Prior to 2026, the team relied on a manual normalization step to prevent merge field mismatches. When importing contact lists from external spreadsheets, engineers were required to inspect headers and manually rename columns to match the system's exact case-sensitive schema (e.g., changing 'First Name' to 'first_name') before uploading. This process was error-prone and frequently caused raw placeholders to appear in live newsletters, as seen in the October incident. On March 15, 2026, this approach was retired in favor of the Auto-Map Schema Resolver. This new tool automatically normalizes incoming headers against the known schema, handling case-insensitivity and whitespace variations without manual intervention. This note is kept for historical reference only to document the legacy workflow and its replacement.
