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

Leave `benchmarkVersion` unset when the upstream benchmark or dataset does not publish a clear benchmark version for that reference artifact. In those cases the summary should show `-`; do not copy in harness versions, report schema versions, dataset IDs, or source commit hashes as substitutes.

The reference summary derives the displayed date from top-level `startedAt` instead of a separate metadata field.

New live runs now auto-capture `repoCommit` and `runnerType` when those values can be derived locally. Older committed references may still lack `repoCommit` if the original run artifacts never preserved it; in that case, keep the field unset and add a concrete note or artifact pointer that makes the gap explicit instead of inferring a commit from nearby git history.

Do not add placeholder scores or fabricated artifacts here.
