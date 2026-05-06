# Reference runs

This directory contains committed real benchmark artifacts only.

Each reference run folder should include:

- `result.json`
- `summary.md`
- optional `raw-output.json`
- reproduction metadata in the normalized result `metadata` block when it can be stated truthfully

Recommended metadata keys:

- `model`
- `configRunId`
- `repoCommit`
- `runnerType`
- `benchmarkId`
- `benchmarkVersion`

The reference summary derives the displayed date from top-level `startedAt` instead of a separate metadata field.

Do not add placeholder scores or fabricated artifacts here.
