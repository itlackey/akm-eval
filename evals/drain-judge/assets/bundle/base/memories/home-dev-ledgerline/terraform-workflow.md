---
description: "Repo constraint: never run `terraform apply`; user applies
  manually. Report only plan summary and destroyed/replaced resources."
evidence: User correction at 2026-09-16T15:14:24Z rejecting `terraform apply`
  and dictating the new reporting format.
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

In the `infra/terraform` directory of this codebase, the agent must never execute `terraform apply`. The user applies changes manually. When making Terraform changes, the agent should run `terraform plan -out=tfplan`, then report only the summary line (e.g., "Plan: N to add, N to change, N to destroy") and the addresses of any resources that will be destroyed or replaced. Do not paste the full plan output in prose.
