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
| 2026-10-12 | longmemeval | collector | 1 | first lock entry | 2b4bb0d1d092 |
| 2026-10-12 | longmemeval | scorer | 1 | first lock entry | ba3b3ecaf208 |
| 2026-10-12 | longmemeval | collector | 2 | #62: the judge is sent the answer without the reader's reasoning (think blocks removed, a block cut off by the token limit runs to the end), and is not asked about an empty answer. Scores change for a reader that thinks or returns nothing | 8124063c63cc |
| 2026-10-12 | longmemeval | scorer | 2 | #62: an empty answer is scored wrong whatever the stored verdict says, and the summary counts the answers cut off at the token limit and the empty ones, with a note. Scores change for a run in which the judge said yes to an empty answer | 7a80b0bc611b |
| 2026-10-12 | longmemeval | collector | 3 | #73: chat requests go to the chat-completions URL of a base URL that has a query (the path comes before the query), through completionsUrl. No score change | d87913946f1d |
