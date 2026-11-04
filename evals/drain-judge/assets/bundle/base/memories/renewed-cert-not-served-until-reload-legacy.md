---
description: "Retired manual nginx reload approach for Let's Encrypt certificate updates"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-14
---

Prior to August 2026, the team relied on a manual intervention strategy to handle certificate renewals. After `certbot renew` executed its scheduled task, an on-call engineer was required to SSH into the server and manually run `systemctl reload nginx`. This process was prone to human error and delays, leading to the outage on 2026-08-14 when the reload was forgotten for five days. This approach was officially retired on 2026-09-01. It was replaced by the **Automated Hook Deployment** approach, which utilizes a deploy hook in `/etc/letsencrypt/renewal-hooks/deploy/` to automatically trigger the nginx reload immediately after every successful certificate renewal, ensuring zero downtime without manual oversight.
