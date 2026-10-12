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
| 2026-10-12 | agent-ab | collector | 1 | first lock entry | eff8c179bf10 |
| 2026-10-12 | agent-ab | scorer | 1 | first lock entry | d440c7e333b9 |
| 2026-10-12 | terminal-bench | collector | 1 | first lock entry | 6be5329b6e6a |
| 2026-10-12 | terminal-bench | scorer | 1 | first lock entry | d440c7e333b9 |
| 2026-10-12 | promotion | collector | 1 | first lock entry | fd84fc1fa730 |
| 2026-10-12 | promotion | scorer | 1 | first lock entry | 66d76aedd254 |
| 2026-10-12 | skillret | collector | 1 | first lock entry | acd3032eaf8d |
| 2026-10-12 | skillret | scorer | 1 | first lock entry | a6b0c5015a9c |
| 2026-10-12 | retrieval | collector | 1 | first lock entry | 545140dcd503 |
| 2026-10-12 | retrieval | scorer | 1 | first lock entry | 0429da784b92 |
| 2026-10-12 | reflect | scorer | 2 | #57: a refused edit is scored by the note as it ends up, as a note left alone: right for a control, a miss for a defect. #58: a retrieval check that could not grade (a timeout or a failed model call) is an error, not a refusal, and is not scored; a timeout counts in timeouts. #59: not_current fails a when_to_use that offers the note for current work (current, recommended, today, for new work, replaces); description-period requires the same words in the same order. Scores change: refused controls become correct, ungraded checks leave refused.retrieval and the counts, edits that passed now fail | 3c8b75841346 |
| 2026-10-12 | reflect | collector | 3 | #60: --retrieval-queries records the public notes' queries matched by public ref (searchesFor), and for a rewrite writes them through the corpus's own map.json, not the retrieval eval's private assets; custom corpora through lib/corpus.ts (part of #47). Private runs with --retrieval-queries record other searches; no score change | 48170ba5c215 |
| 2026-10-12 | distill | collector | 1 | first lock entry; the scorer includes the copied-memory check (#55) and the narrower hedge scope (#56) | 963b9787f3a6 |
| 2026-10-12 | distill | scorer | 1 | first lock entry; the scorer includes the copied-memory check (#55) and the narrower hedge scope (#56) | 1ce5a0f58952 |
| 2026-10-12 | extract | collector | 1 | first lock entry; the scorer flags a negation over a verb the shared rule does not list as ambiguous (row.ambiguous, planted.ambiguous; #45) | 24ae1173ca2b |
| 2026-10-12 | extract | scorer | 1 | first lock entry; the scorer flags a negation over a verb the shared rule does not list as ambiguous (row.ambiguous, planted.ambiguous; #45) | ef8c7daf8a23 |
| 2026-10-12 | judge-gate | collector | 1 | first lock entry | de09348fb964 |
| 2026-10-12 | judge-gate | scorer | 1 | first lock entry | e2d745fa97c2 |
| 2026-10-12 | bakeoff | collector | 1 | first lock entry; bakeoff now drives akm's own jobs through lib/akm (#46) | fb2b423bb008 |
| 2026-10-12 | bakeoff | scorer | 1 | first lock entry; bakeoff now drives akm's own jobs through lib/akm (#46) | 2ca17e24721e |
| 2026-10-12 | agent-ab | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 2c8cddfe2257 |
| 2026-10-12 | bakeoff | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | b95da4e2ca88 |
| 2026-10-12 | distill | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | c610a71c3e3c |
| 2026-10-12 | extract | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 714cbadd73a8 |
| 2026-10-12 | judge-gate | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 0ef7d870a298 |
| 2026-10-12 | longmemeval | collector | 4 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 24ee168a4881 |
| 2026-10-12 | promotion | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 1c7b3bfdbde6 |
| 2026-10-12 | reflect | collector | 4 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 7c37dcb317cb |
| 2026-10-12 | retrieval | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | 3ec3a06b3212 |
| 2026-10-12 | skillret | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | f7998935e63f |
| 2026-10-12 | terminal-bench | collector | 2 | no score change, no config change: lib/akm/akm.ts has a comment saying that configVersion and the provider kind are pinned on purpose (#52) | f76ab669f4e8 |
| 2026-10-12 | consolidate | collector | 1 | first lock entry | 0f59751f560e |
| 2026-10-12 | consolidate | scorer | 1 | first lock entry | 3e604024d2b9 |
| 2026-10-12 | nightly | collector | 1 | first lock entry; the scorer requires a silent item's reflect proposal to be pending, not rejected or reverted (#73) | 3b6779881a41 |
| 2026-10-12 | nightly | scorer | 1 | first lock entry; the scorer requires a silent item's reflect proposal to be pending, not rejected or reverted (#73) | 9549d5fdd0f4 |
| 2026-10-12 | distill | scorer | 2 | no score change: lessonFile moves from lib.ts into score.ts, so the nightly eval can import distill's checks of a lesson from the scorer instead of a copy | 619613d50814 |
| 2026-10-12 | nightly | scorer | 2 | the distill items are scored by distill's own checks (evals/distill/src/score.ts) instead of a copy of them from before #55 and #56, and the reflect items by reflect's scorer after #57, #58 and #59. Scores change: lessons that copy their memory or hedge only part of a claim fail, and the reflect fixes apply to reflect items | 45ac7eeccd4c |
| 2026-10-12 | nightly | scorer | 3 | the exact fix is scored by the end state of the note (the fix applied, or a pending proposal that makes it so, and nothing else changed), not by akm's queueing rule (#75). Scores change: a fix applied at once, as akm 0.10 does, passes instead of failing as harm; a wrong or extra change is still harm. | cf952c101964 |
