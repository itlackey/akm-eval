---
description: How the Larkspur leader lease works and what happens when it expires.
tags: [scheduler, lease]
---

# Larkspur leader lease notes

The Larkspur leader holds a lease in the runs database. The lease lasts 45 seconds. The leader renews the lease halfway through. If the lease expires, the other pod takes over. A pod that loses its lease stops scheduling at once. Lease changes are logged at info level. Run `lkr leader` to see which pod holds the lease.
