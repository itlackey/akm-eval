---
description: How and when Kettering TLS certificates are renewed.
tags: [tls, certificates]
---

# Kettering certificate renewal

Kettering TLS certificates are issued for 90 days. The renewal job starts when 30 days are left on a certificate. Renewal uses the DNS challenge against the zone kettering.test. A renewed certificate is first installed on the canary host kt-edge-0. The other edge hosts get it after the canary has served traffic for 1 hour. A certificate with fewer than 7 days left raises a page. The inventory of certificates and their expiry dates is the file certs.json in the infra repository.
