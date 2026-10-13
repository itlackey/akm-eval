# Measurement changelog

Each eval's `version` is set by hand in its `src/measurement.ts`, as `MAJOR.MINOR`. Change it when you change what the eval asks akm: the
cases it sends, the akm config it writes, the commands it runs, the engine settings. Runs of two versions are not compared unless the version
is the treatment (`--treatment harness`). A scorer fix or a relabelled case needs no new version: `scripts/compare` and the matrix score
every stored run again with the current scorer. Add a line here when a version changes, under the release it ships in.

## 0.4

- nightly, reflect: measurement version 0.3. Feedback and improve target the concept ID AKM indexed for the planted file, including embedded agents and commands whose ID differs from their path. The read-only lookup uses `index.db` and records no artificial search usage. Nightly maps proposals, actions and proactive selections back to case file identities and records the actual indexed refs alongside its raw outputs. Runs made with the previous collector require `--treatment harness` when compared with these runs.
- All other evals remain at measurement version 0.2.

## 0.3

No eval changed version: every eval is at 0.2, and runs made with akm-eval 0.2 compare with runs made with 0.3.

## 0.2 (2026-10-12)

The first release. Every eval is at version 0.2.

What harness-v3 changed, against results from before it (which are now refused because they have no manifest; run them again):

- every eval: the manifest, stored raw outputs and rescore (#40); `--corpus public|custom` with a `private` flag in corpus.json, `private` and `own` kept as aliases for one release (#47); endpoints recorded as a host and an id, never a path (#65); a generator digest in private assets (#44); akm runs with an allowlisted environment (#72).
- reflect: a refused edit is scored as the note left alone (#57); a retrieval check that could not grade is an error, not a refusal (#58); `not_current` fails wording that offers the note for current work, and description-period needs the same words in the same order (#59); `--retrieval-queries` on a rewrite records the corpus's own queries (#60).
- distill: a lesson that copies its memory is bad (#55); a hedge excuses only its own claim (#56); a negation the shared rule cannot read is flagged `ambiguous` (#45); an own corpus records no seed (#70).
- extract: a negation the shared rule cannot read is flagged `ambiguous` (#45).
- nightly: a silent item's proposal must be pending (#73); an exact fix is scored by the end state of the note (#75); distill and reflect items are scored by those evals' current checks.
- longmemeval: the judge gets the answer without the reader's reasoning, and an empty answer is wrong (#62).
- bakeoff: rebuilt to drive akm's own jobs through lib/akm; the jobs other evals cover are retired (#46). No earlier result carries over.
- agent-ab: the three real-tool tasks are dropped (#48). agent-ab and terminal-bench install the akm arm's dependencies from a lock (#68).
- retrieval: the legacy qrels rows are stamped with their asset digest (#49); no grade changed.
- judge-gate, consolidate, promotion, skillret, terminal-bench: no change to how a case is scored.
