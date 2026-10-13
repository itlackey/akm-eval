---
tags: [testing, snapshots]
---

If a UI snapshot test fails after an intentional design change, review the
diff image first, then update only the affected snapshots by running the test
with `-u` and a `-t` name filter. Never update every snapshot at once.
