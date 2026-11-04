---
description: "The ledger infra was once applied by a CI job on merge to main; that job is gone."
evidence: "User correction at 2026-09-16T15:14:24Z, which mentioned the old CI apply."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:16:07.813Z
verified:
  - by: human:user
    at: 2026-11-04T01:16:07.813Z
provenance:
  sources:
    - resource: claude:preference-04
---

Ledger infrastructure used to be applied by the `tf-apply` CI job, which ran `terraform apply -auto-approve` whenever a change to `infra/terraform` was merged to main. The job was disabled in 2026 and its workflow file deleted.
