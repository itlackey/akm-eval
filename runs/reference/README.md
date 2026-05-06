# Reference runs

This directory contains committed real benchmark artifacts only.

Each reference run folder should include:

- `result.json`
- `summary.md`
- optional `raw-output.json`
- reproduction metadata in the normalized result `metadata` block

Recommended metadata keys:

- `model`
- `configRunId`
- `repoCommit`
- `runDate`
- `benchmarkVersion`
- `runnerType`

Do not add placeholder scores or fabricated artifacts here.
