# Measurement changelog

Every change to what an eval measures is a row here. An eval has two parts, and `MEASUREMENT.lock` records the version and the digest of each:

- the **collector**: the files that decide what akm is asked and what is kept of its answer. A change makes earlier raw outputs incomparable with later ones, so a comparison refuses two collector versions unless the collector is the declared treatment (`--treatment harness`).
- the **scorer**: the files that turn a raw output into a score. A change makes no run incomparable: `scripts/rescore` scores a stored run again with the current scorer, and `scripts/compare` does so before it compares.

`scripts/measurement/run check` (part of `scripts/check` and of CI) fails when a part changed and the lock was not bumped. `scripts/measurement/run bump EVAL collector|scorer --reason "..."` updates the lock and adds the row; write whether the scores change, or "no score change" for a refactor that keeps every row. Rows are added at the end, oldest first. The story, and how to compare against a result from an older harness version, is in the README: "How results stay comparable".

`harness` rows are the deliberate breaks of every eval at once. Harness version 3 is the measurement foundation: the manifest in every `summary.json`, the lock, rescore, and the comparison policy over them. Every eval starts at version 1 of both parts.

| date | eval | part | version | reason | sha256 |
|---|---|---|---|---|---|
| 2026-10-12 | reflect | collector | 1 | harness-v3: first lock entry | 8fcafb1380aa |
| 2026-10-12 | reflect | scorer | 1 | harness-v3: first lock entry | 1395dfdb42d8 |
| 2026-10-12 | reflect | collector | 2 | wave 1 merge: lib/akm credential allowlist, completionsUrl, relative AKM_BIN paths; hideEndpoint (no score change; harness-v3 not yet released) | 0cb87ac1f033 |
| 2026-10-12 | consolidate | collector | 1 | first lock entry | 22bee74f6918 |
| 2026-10-12 | consolidate | scorer | 1 | first lock entry | 3e604024d2b9 |
| 2026-10-12 | nightly | collector | 1 | first lock entry | 38c8623ab257 |
| 2026-10-12 | nightly | scorer | 1 | first lock entry | 79c9e2ca97d3 |
| 2026-10-12 | nightly | scorer | 2 | silent items: fix_proposed needs the reflect proposal to be pending, not rejected or reverted (#73). Scores change. | 015be4d69fdd |
