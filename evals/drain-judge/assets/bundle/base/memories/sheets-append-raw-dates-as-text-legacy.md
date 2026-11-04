---
description: "Retired manual DATEVALUE cleanup for bookings sheet date parsing errors."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-14
---

Previously, when the bookings form script appended rows with `valueInputOption: RAW`, dates were stored as text, causing the weekly summary filter to miss them. To fix this, the team implemented a manual cleanup process. Every time the issue occurred, an engineer had to insert a helper column, apply the `DATEVALUE` formula to convert the text strings into real dates, and then copy-paste the values back over the original column. This approach was error-prone and time-consuming, especially as the dataset grew. On March 15, 2026, this manual workaround was retired. It was replaced by the **Sheets API Value Parsing Fix**, which updates the script to use `valueInputOption: USER_ENTERED`. This ensures Sheets automatically parses input values correctly upon insertion, eliminating the need for post-hoc manual conversion and ensuring data integrity from the start.
