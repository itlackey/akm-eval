---
description: Expired signing certificate that broke the iOS nightly build.
updated: 2026-05-12
---

On 2026-05-12 the iOS nightly build failed at code signing because the
distribution certificate in the `ci-signing` keychain had expired. Installing
the renewed certificate and re-running `fastlane match` fixed the build.
