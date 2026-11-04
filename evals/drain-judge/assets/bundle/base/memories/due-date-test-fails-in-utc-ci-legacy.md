---
description: "Retired timezone mocking approach for date formatting tests"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-30
---

Previously, we relied on `date-fns-tz` to mock the system timezone for testing `formatDueDate`. This approach was retired on 2026-03-15 because it introduced fragile dependencies and failed to catch environment-specific bugs in CI. The team replaced it with the `TZ=UTC` environment variable strategy in `package.json`. This ensures consistent behavior across all development machines and CI runners by forcing local time to match UTC, eliminating the discrepancy where laptops in Europe/Lisbon passed tests that failed in UTC-based containers. This change simplified the test setup and removed the need for complex timezone mocking libraries, making the test suite more reliable and easier to maintain for new contributors.
