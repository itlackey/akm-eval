---
description: "Terraform change for the ledger VPC on 2026-09-16: plan shows 2 to add, 1 to replace; waiting for the user to apply."
evidence: "Agent's terraform plan at 2026-09-16T15:16:02Z."
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

Ledger VPC change, 2026-09-16: `terraform plan -out=tfplan` gives "Plan: 2 to add, 0 to change, 1 to destroy". The resource to be replaced is `aws_nat_gateway.main`. The plan file is in `infra/terraform/tfplan` and the user will apply it after the 17:00 freeze lifts. Nothing has been applied yet.
