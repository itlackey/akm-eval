---
description: "Status report on Pinewood label printer connectivity failure investigation"
tags: [warehouse, printing]
---

## Incident #4921: Pinewood Printer Offline

**Date:** November 12, 2026

The Pinewood label printer at `pw-labels.internal` has been unreachable since 09:00 EST. Initial diagnostics ruled out a physical paper jam or empty roll status, as the sensor array reports normal load levels. Network latency checks confirm the switch port is active, eliminating local cabling faults.

We are currently investigating potential firmware corruption after observing erratic heartbeat signals. The team has rolled back the device to the stable build prior to commit `a3f9c2b`. If connectivity does not restore within the next hour, we will proceed with a full factory reset and re-calibration of the thermal head. Misprint counts remain at zero for this period.

**Next Steps:** Monitor rollback stability; prepare replacement hardware if firmware flash fails.
