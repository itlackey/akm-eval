---
description: How Pellam CI is set up: runners, Node version and test matrix.
tags: [ci, node]
---

# Pellam CI setup notes

Pellam CI runs on Ubuntu runners with the `ci.yml` workflow. The Node version is set in `.nvmrc` and read by the setup step. CI uses Node 22.3, since the March upgrade. The package manager is pnpm 9, installed with corepack. The test matrix runs on Linux and macOS, but not on Windows. A full CI run takes about 7 minutes. Lint and type checks run before the tests and fail fast.
