---
description: "Investigation into Ledger Archive 404 errors for reporting service account"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-09
---

## Status Report: 2026-11-04

**Incident**: Reporting service account receives `404 File not found` when accessing Ledger Archive files via Drive API.

**Ruled Out**:
- Service account key expiration (verified active).
- OAuth scope misconfiguration (scopes match previous working state).
- Direct folder sharing (adding the service account as a Viewer to the specific folder yielded no change).
- Network connectivity issues (internal DNS resolution confirmed).

**Current Investigation**:
We suspect a scope limitation in the API call itself. Initial tests with `supportsAllDrives=false` consistently fail. We are now testing the hypothesis that the API request must explicitly include `supportsAllDrives=true` to traverse shared drive boundaries for service accounts. 

**Next Steps**:
Deploying patch `a3f9c2b` to enable `supportsAllDrives=true` in the export job. Monitoring for successful file retrieval over the next 24 hours. If 404s persist, we will escalate to Google Support to check for backend permission propagation delays.

**Impact**: Reporting pipeline stalled; manual exports required.
