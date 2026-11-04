---
description: "When mail moves to a new sending service, add its include: to the SPF record."
---

After Quarry's mail moved to a new sending service, reset emails went to spam at two big providers: the SPF record listed only the old service, so the new one's servers failed SPF. Adding the new service's `include:` to the SPF TXT record fixed delivery the next day. Keep both until the old service is shut down.
