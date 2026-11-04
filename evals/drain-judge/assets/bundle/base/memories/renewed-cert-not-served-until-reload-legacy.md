---
description: "The Ferrow status site once used a bought certificate installed by hand each year."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-14
---

Until 2026 the Ferrow status site used a one-year certificate bought from a commercial CA. Each July someone generated a CSR, pasted the new certificate into `/etc/ssl/ferrow/` and restarted nginx. That was retired when the site moved to Let's Encrypt and certbot.
