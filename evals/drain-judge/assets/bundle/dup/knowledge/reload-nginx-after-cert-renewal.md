---
description: "nginx keeps serving the old certificate after a renewal until it is reloaded."
---

nginx reads certificates only at start or reload. After `certbot renew` the new certificate sat on disk for five days while nginx served the expired one. `systemctl reload nginx` fixes it; a deploy hook in `/etc/letsencrypt/renewal-hooks/deploy/` that reloads nginx after each renewal prevents it.
