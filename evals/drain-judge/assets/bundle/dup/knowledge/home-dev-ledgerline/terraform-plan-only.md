---
description: "In infra/terraform the agent plans and reports; only the user applies."
---

Do not run `terraform apply` in `infra/terraform`; the user applies by hand. After a change, run `terraform plan -out=tfplan` and report two things only: the summary line ("Plan: N to add, N to change, N to destroy") and the address of each resource that would be destroyed or replaced. Never paste the whole plan.
