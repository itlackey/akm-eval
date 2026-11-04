---
description: "Retired legacy method for Pinewood label printing via direct serial connection."
tags: [warehouse, printing]
---

## Retired: Direct Serial Connection for Pinewood Labels

**Status:** Retired on 2026-03-15

Previously, the team bypassed the network interface and connected directly to the Pinewood label printer via a USB-to-serial adapter. This approach allowed for raw command injection but required physical access to the server room for every configuration change. It was prone to driver conflicts on modern Linux kernels and lacked the reliability of the current networked solution.

**Replacement:** The team migrated to the `pw-labels.internal` HTTP API endpoint. This new approach enables remote calibration, roll status monitoring, and print job submission without physical intervention. The serial method is kept here for historical reference only and should not be used for new implementations.
