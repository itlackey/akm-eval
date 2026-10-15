# Measurement changelog

Each eval's `version` in `src/measurement.ts` identifies its collection. Bump it
when the selected inputs or collection protocol change. A scoring correction
or label-only change sets `scoringVersion` (default: `version`) without changing collection identity.
Model/AKM/configuration experiments remain recorded settings within that version.
Documentation, ledger and reporting changes alone do not require a new version.

Compare saved runs only when eval/scoring versions and exact selected inputs and
labels match. A comparison never rescores or silently intersects cases. Explicit
rescoring can apply current scoring rules to unchanged inputs: it records the
current scoring version while retaining the original collector version. New
inputs require collection. Add a release entry here when a version changes.

## Unreleased

- reflect: collection version 0.4 records the expanded retrieval-label inputs used by optional `--retrieval-queries` (77 planted notes now have labeled queries, previously 75). Standard Reflect inputs and scoring 0.4 are unchanged; saved collector 0.3 runs retain their identities.
- retrieval: scoring version 0.3 expands the frozen judgments by 374 library and 492 books pairs from all four columns of six saved semantic runs. Inputs, collection version 0.2 and scoring formulas are unchanged. Explicit rescoring retains collector 0.2 and records scorer 0.3 plus the expanded label digests; originals remain intact.

- reflect and nightly: scoring version 0.4 accepts harmless acronym plurals such as `PDFs` when the source names `PDF`; names, numbers and paths remain checked. Nightly collection stays at 0.3; the separate label expansion above moves Reflect collection to 0.4. Explicitly rescore saved runs to compare this scoring correction; originals are preserved.
- Retrieval single runs now record `wall_seconds` and clear their running marker through the existing shared runner, matching repeated runs. Cases, collection and scoring are unchanged.

- longmemeval: measurement version 0.3. Undecidable judge replies are grading errors excluded from accuracy; identical grading prompts share one verdict within a run. Reader and judge request settings, usage, retries and provider-reported costs are saved separately. Graceful stops preserve completed questions. Earlier results retain their original scoring and artifacts.
- agent-ab and terminal-bench: measurement version 0.4. Both arms share the repaired agent setup: archived Bullseye security indexes and no redundant distro Node install on glibc. Terminal-Bench also saves interrupted progress and can resume the same job with unchanged settings.
- Process evals record native semantic index coverage and modes from searches they actually perform as `semantic_verification`. Incomplete embedding coverage or an observed nonsemantic search makes the command an error. Verification adds no searches or model calls; zero observed searches is not evidence that retrieval occurred. Cases and scoring versions are unchanged.

- agent-ab and terminal-bench: measurement version 0.3. `--semantic` enables the AKM arm's hybrid search with pinned bge-small-en-v1.5 embeddings. Setup verifies complete embedding coverage and an actual semantic query, and saves that proof. Runs without the flag retain keyword search. Optional `models.json` context/output limits are recorded in the shared OpenCode job configuration and applied equally to both arms. Earlier runs keep version 0.2 and require new collection for comparison with this collector.

## 0.6

No eval's cases, modes or scoring rules changed. Eval versions remain as in 0.5.
All 13 evals, tests and fixture data remain available. New manifests explicitly
record the scoring version; old ones without it use their collector version.
Each completed run records wall time. Comparison now reads saved results directly;
matrix stages, treatment axes, automatic rescoring and statistical verdicts are
removed. Repeats are optional. See [migration notes](releases/v0.6.md).

The entries below describe behavior at those releases. Historical references to
matrix stages, implicit rescoring, input intersection or baseline reruns do not
apply to 0.6. In particular, the expanded 0.5 sets cannot be directly compared to
the smaller full sets from 0.4; input identity checks enforce that even though
0.5 retained the same measurement versions.

## 0.5

No eval changed version.

- reflect, nightly: the six example agents and commands of llm-delegation-tool now sit in their type's folder (`agents/llm-delegation-tool/`, `commands/llm-delegation-tool/`). akm 0.10 refuses to reflect on an agent or a command outside it, so these cases measured a refusal. Their input changed: comparisons with earlier runs leave them out and name them. A stored night that still has a note at its old path scores that item as an error.
- retrieval, skillret: a semantic curate that abstains, with no results and no `searchMode`, is an empty answer, not an error. akm 0.10 abstains on a tool envelope such as retrieval's n08; akm 0.9 never does.
- agent-ab, terminal-bench: the default akm is akm-cli 0.10.261003-beta with plugin 0.10.261002-beta. It is recorded as the run's build, as before.
- Larger public sets (#50), so one case moves a main metric by at most 2.5 points: judge-gate 135 cases (40 good), extract 64 (40 behind `insights`, 20 routine), distill 96 (40 behind `good_lessons`, 40 behind `lesson_updates`), bakeoff 40 (8 per process), reflect 80 (40 defects, 40 controls), consolidate 80 (40 behind `recall`), promotion 80 (40 good, 40 bad). The old cases are unchanged, so they still compare with earlier runs, except promotion's: its cases share one library, which grew, so every promotion case has a new input and needs a new baseline. promotion also names a README's memory after its folder, so two cases no longer share one. Make the custom corpora again with `./generate-assets` to include the new cases.
- Every eval that calls a model through akm records `model_calls` in its summary.

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
