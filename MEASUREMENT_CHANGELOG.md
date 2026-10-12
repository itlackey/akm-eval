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
| 2026-10-12 | distill | collector | 1 | first lock entry | 963b9787f3a6 |
| 2026-10-12 | distill | scorer | 1 | first lock entry | 2c1f25d96846 |
| 2026-10-12 | distill | scorer | 2 | distill #55: a lesson that repeats more than three quarters of its memory word for word is bad (copied), and an update gets the same check on its added lines (not_copied, a sixth check). Scores change: the memory pasted back as the lesson, and the old lesson with the memory appended, no longer score good | ad61c176591e |
| 2026-10-12 | distill | scorer | 3 | distill #56: a doubt excuses a claim only when it governs it, before the claim in its own clause (or unconfirmed, right after it), not any hedge word within the sentence. Scores change: an over-claim with a could, an if or a may in another clause, or after it, is no longer excused | 1ce5a0f58952 |
