---
description: "Visitors saw an expired certificate on the status site although certbot had renewed it, because nginx had not been reloaded."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-14
---
Visitors to the Ferrow status site got an expired-certificate warning on the
morning of 2026-08-14, although `certbot renew` had run on schedule five days
earlier and the new certificate was on disk. nginx reads its certificates only
when it starts or reloads, and nothing had reloaded it since July, so it kept
serving the old one. Running `systemctl reload nginx` fixed it at once. A
deploy hook in `/etc/letsencrypt/renewal-hooks/deploy/` now reloads nginx after
each successful renewal.
