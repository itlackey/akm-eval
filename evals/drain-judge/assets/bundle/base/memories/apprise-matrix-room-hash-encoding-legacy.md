---
description: "Retired note on the legacy regex-based alias escaping method for Matrix notifications."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-16
---

Prior to March 15, 2026, the team relied on a custom regex-based escaping function within `notify.sh` to handle special characters in Matrix room aliases. This approach manually replaced `#` with `%23` using a fragile pattern that failed on complex server names. It was retired because it did not account for other reserved URI characters, leading to intermittent delivery failures in edge cases. The team replaced this with a standardized URL encoding library call (`urllib.parse.quote`) that correctly handles all special characters automatically. This note is kept for historical reference only to document the migration path and the rationale behind adopting the robust library solution over the ad-hoc regex implementation.
