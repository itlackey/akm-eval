---
description: "Documenting the resolution of an Nginx certificate staleness issue on the Ferrow status platform."
---

On August 14, 2026, users encountered SSL errors on the Ferrow status page. This occurred despite Certbot successfully updating the certificate files five days prior. The root cause was that the Nginx web server had not been restarted or reloaded since July, causing it to continue serving the outdated key. To resolve the immediate problem, the command `systemctl reload nginx` was executed, which immediately restored secure access. To prevent recurrence, a deployment hook was added to the directory `/etc/letsencrypt/renewal-hooks/deploy/`. This script ensures that Nginx reloads its configuration automatically following every successful certificate renewal process.
