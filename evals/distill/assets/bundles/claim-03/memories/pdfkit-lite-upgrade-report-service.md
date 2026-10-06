---
description: "Upgrading pdfkit-lite to 3.2.0 in the report-service removed a deprecation warning; other services were not checked."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-14
---
Upgrading the `pdfkit-lite` dependency from 3.1.4 to 3.2.0 in the
report-service removed the "font subset" deprecation warning from the build
log. The report-service tests passed, and three sample reports rendered the
same as before in a manual check. The invoice-service pins 3.1.4 and was not
checked. The 3.2.0 changelog was read only as far as the deprecation notice,
so other changes in it are unknown.
