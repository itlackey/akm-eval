---
description: "Nightly export job on 2026-07-29: failing with KeyError since the legacy_csv removal; revert pending."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-29
---

Nightly export, 2026-07-29: the job has failed twice with `KeyError: 'export_legacy_csv'` since yesterday's release. A revert of the removal is open as PR 1043 and waits for CI. The two missed exports will be run by hand once it is deployed.
