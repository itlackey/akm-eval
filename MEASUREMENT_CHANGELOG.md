# Measurement changelog

Every change to what an eval measures is a row here. An eval has two parts, and `MEASUREMENT.lock` records the version and the digest of each:

- the **collector**: the files that decide what akm is asked and what is kept of its answer. A change makes earlier raw outputs incomparable with later ones, so a comparison refuses two collector versions unless the collector is the declared treatment (`--treatment harness`).
- the **scorer**: the files that turn a raw output into a score. A change makes no run incomparable: `scripts/rescore` scores a stored run again with the current scorer, and `scripts/compare` does so before it compares.

`scripts/measurement/run check` (part of `scripts/check` and of CI) fails when a part changed and the lock was not bumped. `scripts/measurement/run bump EVAL collector|scorer --reason "..."` updates the lock, raises the minor number of that part's version by one ("0.1" to "0.2", "0.9" to "0.10") and adds the row; write whether the scores change, or "no score change" for a refactor that keeps every row. Rows are added at the end, oldest first. The story, and how to compare against a result from an older harness version, is in the README: "How results stay comparable".

`harness` rows are the deliberate breaks of every eval at once. Harness version 3 is the measurement foundation: the manifest in every `summary.json`, the lock, rescore, and the comparison policy over them. Every eval starts at version 0.1 of both parts. Release 0.2 is the first release of akm-eval: every part of every eval is at 0.2 in it, so every run made with it records 0.2. A later release changes no version by itself: a part changes version only when its files change, so runs of two releases compare wherever their parts are the same.

What harness-v3 changed, against results from before it (which compare only as exploratory, see the README):

- every eval: the manifest, stored raw outputs, rescore and golden tests (#40); `--corpus public|custom` with a `private` flag in corpus.json, `private` and `own` kept as aliases for one release (#47); endpoints recorded as a host and an id, never a path (#65); a generator digest in private assets (#44); akm runs with an allowlisted environment (#72).
- reflect: a refused edit is scored as the note left alone (#57); a retrieval check that could not grade is an error, not a refusal (#58); `not_current` fails wording that offers the note for current work, and description-period needs the same words in the same order (#59); `--retrieval-queries` on a rewrite records the corpus's own queries (#60).
- distill: a lesson that copies its memory is bad (#55); a hedge excuses only its own claim (#56); a negation the shared rule cannot read is flagged `ambiguous` (#45); an own corpus records no seed (#70).
- extract: a negation the shared rule cannot read is flagged `ambiguous` (#45).
- nightly: a silent item's proposal must be pending (#73); an exact fix is scored by the end state of the note (#75); distill and reflect items are scored by those evals' current checks.
- longmemeval: the judge gets the answer without the reader's reasoning, and an empty answer is wrong (#62).
- bakeoff: rebuilt to drive akm's own jobs through lib/akm; the jobs other evals cover are retired (#46). No earlier result carries over.
- agent-ab: the three real-tool tasks are dropped (#48). agent-ab and terminal-bench install the akm arm's dependencies from a lock (#68).
- retrieval: the legacy qrels rows are stamped with their asset digest (#49); no grade changed.
- judge-gate, consolidate, promotion, skillret, terminal-bench: no change to how a case is scored.

The versions that were taken while harness-v3 was built were folded into 0.1 with the maintainer's approval, before any result was made with it. The commits of the pull request show the steps.

| date | eval | part | version | reason | sha256 |
|---|---|---|---|---|---|
| 2026-10-12 | agent-ab | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 2c8cddfe2257 |
| 2026-10-12 | agent-ab | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | d440c7e333b9 |
| 2026-10-12 | bakeoff | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | b95da4e2ca88 |
| 2026-10-12 | bakeoff | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 2ca17e24721e |
| 2026-10-12 | consolidate | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 0f59751f560e |
| 2026-10-12 | consolidate | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 3e604024d2b9 |
| 2026-10-12 | distill | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | c610a71c3e3c |
| 2026-10-12 | distill | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | e51aca32c46d |
| 2026-10-12 | extract | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 714cbadd73a8 |
| 2026-10-12 | extract | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 84172d25a167 |
| 2026-10-12 | judge-gate | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 0ef7d870a298 |
| 2026-10-12 | judge-gate | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | e2d745fa97c2 |
| 2026-10-12 | longmemeval | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 24ee168a4881 |
| 2026-10-12 | longmemeval | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 7a80b0bc611b |
| 2026-10-12 | nightly | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 3b6779881a41 |
| 2026-10-12 | nightly | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 20d4c81368bc |
| 2026-10-12 | promotion | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 1c7b3bfdbde6 |
| 2026-10-12 | promotion | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 66d76aedd254 |
| 2026-10-12 | reflect | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 7c37dcb317cb |
| 2026-10-12 | reflect | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 3c8b75841346 |
| 2026-10-12 | retrieval | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 3ec3a06b3212 |
| 2026-10-12 | retrieval | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | 0429da784b92 |
| 2026-10-12 | skillret | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | f7998935e63f |
| 2026-10-12 | skillret | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | a6b0c5015a9c |
| 2026-10-12 | terminal-bench | collector | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | f76ab669f4e8 |
| 2026-10-12 | terminal-bench | scorer | 0.1 | harness-v3: first lock entry, version 0.1, approved by the maintainer in the harness-v3 reconciliation | d440c7e333b9 |
| 2026-10-12 | agent-ab | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 2c8cddfe2257 |
| 2026-10-12 | agent-ab | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | d440c7e333b9 |
| 2026-10-12 | bakeoff | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | b95da4e2ca88 |
| 2026-10-12 | bakeoff | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 2ca17e24721e |
| 2026-10-12 | consolidate | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 0f59751f560e |
| 2026-10-12 | consolidate | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 3e604024d2b9 |
| 2026-10-12 | distill | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | c610a71c3e3c |
| 2026-10-12 | distill | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | e51aca32c46d |
| 2026-10-12 | extract | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 714cbadd73a8 |
| 2026-10-12 | extract | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 84172d25a167 |
| 2026-10-12 | judge-gate | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 0ef7d870a298 |
| 2026-10-12 | judge-gate | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | e2d745fa97c2 |
| 2026-10-12 | longmemeval | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 24ee168a4881 |
| 2026-10-12 | longmemeval | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 7a80b0bc611b |
| 2026-10-12 | nightly | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 3b6779881a41 |
| 2026-10-12 | nightly | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 20d4c81368bc |
| 2026-10-12 | promotion | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 1c7b3bfdbde6 |
| 2026-10-12 | promotion | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 66d76aedd254 |
| 2026-10-12 | reflect | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 7c37dcb317cb |
| 2026-10-12 | reflect | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 3c8b75841346 |
| 2026-10-12 | retrieval | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 3ec3a06b3212 |
| 2026-10-12 | retrieval | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | 0429da784b92 |
| 2026-10-12 | skillret | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | f7998935e63f |
| 2026-10-12 | skillret | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | a6b0c5015a9c |
| 2026-10-12 | terminal-bench | collector | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | f76ab669f4e8 |
| 2026-10-12 | terminal-bench | scorer | 0.2 | release 0.2, the first release of harness-v3: no change to the files since 0.1, and every run of this release records 0.2 | d440c7e333b9 |
