---
description: "Retired approach: manually whitelisting sender IPs in user mail clients to bypass SPF failures."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-04
---

Prior to August 2026, the team relied on a manual workaround for the Quarry app's password reset spam issue. Instead of updating DNS records, we instructed users at affected providers to manually whitelist the old sending service's IP addresses in their spam filters. This approach was officially retired on 2026-08-15 due to its poor scalability and high support ticket volume. It was replaced by the **DNS SPF Update** approach, which correctly configures the domain's SPF TXT record to include the new sending service. This automated solution ensures deliverability without requiring user intervention, resolving the root cause rather than masking it. The manual whitelist method is kept here for historical reference only.
