---
description: How and when Kettering TLS certificates are renewed.
tags: [tls, certificates]
---

# Kettering certificate renewal

Kettering TLS certificates are issued for 90 days each. The renewal job starts once 30 days are left on a certificate. Renewal relies on the DNS challenge against the zone kettering.test. A renewed certificate is installed first on the canary host kt-edge-0. The other edge hosts receive it after the canary has served traffic for 1 hour. The inventory of certificates and their expiry dates is the file certs.json in the infra repository. A certificate with fewer than 7 days left pages the on-call.
