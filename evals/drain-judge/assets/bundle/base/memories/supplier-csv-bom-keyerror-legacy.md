---
description: "Retired note on the legacy regex-based BOM stripping approach for CSV imports."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-16
---

Previously, the team handled the supplier CSV UTF-8 BOM issue by manually stripping the byte order mark using a regular expression before parsing. This approach was fragile and required explicit string manipulation logic in the import script. On March 15, 2026, this method was retired due to maintenance overhead and potential edge-case failures with other encodings. It was replaced by the `utf-8-sig` encoding strategy, which leverages Python’s built-in support to automatically handle the BOM during file opening. This change simplified the codebase and eliminated the need for custom preprocessing steps. This note is retained solely for historical reference to document the evolution of our data ingestion practices and the rationale behind adopting standard library solutions over custom regex hacks.
