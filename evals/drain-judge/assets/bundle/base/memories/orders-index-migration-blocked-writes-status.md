---
description: "Status update on the concurrent index migration for the orders table."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-08
---

## Migration Progress: Orders Index

**Date:** November 12, 2026

We are currently refactoring the production database schema to prevent checkout timeouts. The goal is to replace the blocking `CREATE INDEX` with a concurrent build strategy.

### Checklist
- [x] Analyze lock contention logs from the October 15 incident.
- [x] Draft migration script disabling transaction wrappers.
- [x] Verify `CREATE INDEX CONCURRENTLY` behavior in staging.
- [ ] Run full load test with 80M rows.
- [ ] Deploy to production.

**Progress:** 3 of 5 items completed.

### Next Step
Execute the load test to confirm write availability during index construction. We need to ensure the 25-minute build time does not degrade API latency beyond acceptable thresholds. If successful, we will merge the migration file `a1b2c3d` into the main branch for staging deployment.

**Risk:** If the concurrent build fails due to schema changes, we may need to rollback and retry.
