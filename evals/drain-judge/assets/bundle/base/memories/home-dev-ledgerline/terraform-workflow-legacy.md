---
description: "Retired approach for Terraform plan reporting in 2026"
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

Prior to March 15, 2026, the team utilized a verbose reporting strategy for Terraform infrastructure changes. Agents were required to execute `terraform plan` and paste the entire output into the pull request description. This approach was retired due to excessive context window consumption and difficulty in reviewing large diffs. The team replaced this with the current concise method, which mandates running `terraform plan -out=tfplan` and reporting only the summary line and addresses of destroyed or replaced resources. This historical note serves as a record of the previous workflow to prevent accidental reversion to the inefficient practice. Developers should no longer generate full plan outputs for review purposes. The shift improved code review speed and reduced noise in the repository history. This entry exists solely for archival and educational purposes regarding past engineering decisions.
