---
description: "The release steps as followed for the CLI: SemVer, changelog, annotated tag, push, publish."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-02
---
Release steps as followed for the CLI. Pick the next version by SemVer: minor
for backwards-compatible features, patch for fixes, major for breaking changes.
Add the changes to CHANGELOG.md and bump the version in package.json. Commit
both to the release branch, create an annotated tag named `vMAJOR.MINOR.PATCH`,
push the commits and the tag together, and then publish the package. Keep the
tag format the same on every release so that tooling can find it.
