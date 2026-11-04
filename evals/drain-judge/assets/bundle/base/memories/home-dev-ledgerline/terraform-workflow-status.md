---
description: "Status report on Terraform plan output leakage incident investigation"
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

**Date:** 2026-11-04

**Incident:** #TF-LEAK-992

**Status:** Investigation ongoing.

**Ruled Out:**
1. Intentional data exfiltration by the agent.
2. Misconfiguration of the `tfplan` output format flags.
3. External API calls during plan execution.

**Current Focus:**
We are analyzing the LLM context window handling in commit `a3f9c21`. Initial traces suggest the model is inadvertently including full resource state in the summary when `destroy` counts exceed zero. We suspect the prompt template lacks sufficient negative constraints for verbose output.

**Next Steps:**
1. Isolate the `infra/terraform` module in a sandbox.
2. Inject stricter system prompts limiting output to JSON-only summaries.
3. Verify that `terraform plan` stdout is strictly parsed and not echoed back.

**Action Required:**
Pause all `terraform apply` approvals until patch `v0.4.2` is deployed. Monitor for any residual state leakage in logs.
