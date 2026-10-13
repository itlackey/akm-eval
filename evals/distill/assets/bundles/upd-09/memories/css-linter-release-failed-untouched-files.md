---
description: "The Tarn web build failed on 112 untouched files when the CSS linter's 16.0 release came out, because CI installed the latest version."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-13
---
The lint step of the Tarn web build failed on a Monday morning on 112 files
that nobody had touched. CI installed the latest version of the CSS linter, and
its 16.0 release, out that weekend, turned on a rule about colour function
notation by default. Pinning the exact version in `package.json` and the
lockfile made the build pass again; the upgrade to 16.0 is now its own pull
request.
