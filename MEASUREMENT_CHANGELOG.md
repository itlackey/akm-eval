# Measurement changelog

Each eval's `version` in `src/measurement.ts` identifies its collection. Bump it
when the selected inputs or collection protocol change. A scoring correction
or label-only change sets `scoringVersion` (default: `version`) without changing collection identity.
Model/AKM/configuration experiments remain recorded settings within that version.
Documentation, ledger and reporting changes alone do not require a new version.

Comparison has no gates (since #108): `scripts/compare` shows each run's eval and
scoring versions, settings and coverage beside the differences between them, and
the reader decides whether two runs are comparable. Runs with different versions
or inputs measure different things, so read the entries below before comparing
them. A comparison never rescores or collects. Explicit rescoring can apply
current scoring rules to unchanged inputs: it records the current scoring version
while retaining the original collector version. New inputs require collection.
Add a release entry here when a version changes.

## Unreleased

- New memory-utility collection/scoring 0.1: 24 independent public synthetic QA cases, three paired conditions
  (no episodic memory, original notes, native inference snapshot), fixed estimated context budget, actual search/show
  evidence, exact structured-answer scoring and separate citation/literal diagnostics. Failure-inclusive and evaluated-only
  denominators, complete-pair help/harm, conservative paired Hoeffding intervals, saved inference snapshots and phase usage.
  This is not LongMemEval and does not modify its protocol. Explicit rescoring preserves unfinished checkpoint rows via the
  optional Measurement.unfinished hook; existing measurements retain their prior completion behavior.
  Its summary carries `n_cases` and `model_calls` (native inference) as the other evals' do, and saved akm JSON writes the
  sandbox folder as `<sandbox>`, with rows and summary passed through `redactActors`; no score depends on either.
  Changed after the first full 24-case run, before any memory-utility result was kept or published, so the version stays 0.1
  (case digests record the changed input; a run made before this change has the old case-14 digest):
  - case-14, the `common-only` control, now says the incident contact "applies to all projects, including Elm". It said "unless a
    current explicit exception exists", so a reader with no notes could not rule an exception out, abstained, and `source - none`
    counted the case as a gain from memory, though the note only restates that there is none. Its input changed.
  - `model_calls` counts the reader's answers as well as native inference (it held inference only, so compare and the ledger
    understated the run), and `calls_by` splits calls, failures and token totals into `native inference` and `reader` rows, as
    nightly's does. No score depends on either.
  - `--label` is kept as given (letters, digits, dot, dash, underscore), as in the other evals; it was slugged, so a label such as
    `0.10.261022-full` became `0-10-261022-full`.

- memory-utility 0.2: LongMemEval cases, exact paired statistics and `--resume`. The 24 public cases keep their inputs, their exact
  scoring and their collection, so their case digests are unchanged; only the paired statistics differ. memory-utility 0.1 was never
  released or published, so there is nothing to compare 0.2 with except by rescoring a saved 0.1 run, which gives the new statistics.
  - **Statistics (a measurement change).** Every paired difference (`source - none`, `inferred - source`, exact and cited-correct) now
    carries an exact two-sided McNemar test (`p_value`, a binomial test on the discordant pairs) and an exact 95% interval in `ci95`:
    Fay and Lumbard's (2021) melded interval, which leaves out zero exactly when the McNemar test is significant at 0.05 and counts
    the uncertainty of the share of discordant pairs. It replaces the conservative Hoeffding bound of 0.1, which ignored that most
    pairs tie. With no discordant pair `ci95` is a narrow interval around zero. `test` and `interval_method` name the method in each pair. The longmemeval benchmark keeps its own Wald
    interval; the two conventions still differ.
  - **LongMemEval case source (`--split dev|heldout-a|heldout-b`).** New inputs and a second scoring path beside the exact one. A case is one
    LongMemEval question with its evidence sessions and `--haystack` (default 16) seeded distractor sessions from its history, every
    session whole as one memory. Native inference runs once per case; each arm is indexed and searched once and the shown text is packed
    at each `--budgets` value (default 4096 and 8192 estimated tokens; 4096 is primary, 8192 secondary: a median LongMemEval session is about 10k characters, so budgets under 4096 hold only the prefix of one raw session), the reader answering once per
    distinct packed text. The longmemeval benchmark's judge prompts grade each free-form answer yes or no (`--judge-model`, required);
    the citation protocol is dropped for these cases. The split into 100 dev and 400 held-out questions is a salted hash of the
    question id, stratified by type, and the 400 are cut the same way (a second salt) into two fixed halves of 200, `heldout-a` and
    `heldout-b`; a held-out run names its half and there is no bare `heldout`. Summaries gain `case_source`, `split`, `haystack`, `budgets`, `primary_budget`, `sample_seed`,
    `judge_model` and `dataset`, rows are `kind: longmemeval` with `arms.<arm>.<budget>`, and `metrics` gains `by_budget`, `by_type`,
    `abstention` and, per budget, an `evidence` diagnostic (shown, retrieval missed, packing cut, summary dropped; labels only, never
    prompted). `sessions_over_projection_limit` is recorded as in the benchmark. These cases are never pooled with the 24.
  - **Collection.** `akm improve` may take 30 s per note when that exceeds `--timeout-ms` (one sequential model call per note, about
    5 s each on the 35B, so a case of 18 sessions exceeds the 120 s default). This changes no score; it stops long cases from erroring.
    `--resume DIR` carries on a stopped run for either source. LongMemEval rows are appended as each case ends; the 24 cases still
    rewrite their rows at each checkpoint.
  - **The second win path as a paired test (a measurement change).** With both 4096 and 8192 run, a LongMemEval summary carries one more
    paired comparison, `metrics.cross_budget_inference`: inferred at 4096 against source at 8192 over the same cases, with the exact
    McNemar test, the Fay-Lumbard interval and help/harm counts, as the other differences. `metrics.primary_comparisons` holds the
    p-values of the two primary comparisons (inferred - source at 4096, and this one) as they are and after Holm's adjustment. It replaces
    the pre-registered "reaches the notes' accuracy at the larger budget", which a point estimate could have declared. It is the one
    pre-registered comparison, not a pairing of arbitrary budgets, and is absent when 8192 is not run. Console, compare and the ledger
    show it with the Holm-adjusted p-values.
  - **Held-out runs are locked to the pre-registration.** `--split heldout-a|heldout-b` refuses to start, before any akm or model setup,
    when the budgets, `--haystack`, `--sample-seed` or the judge (model, temperature, `chat.max_tokens`) differ from the pre-registered
    values (the constants `src/lme.test.ts` holds `PREREGISTRATION.md` to). No score changes; a held-out run can no longer be made with
    other settings by mistake. Dev runs are free.
  - **Resume retries are stated and recorded.** `--resume` re-asks a case that errored, with all its arms, and never a wrong answer. Each
    sample of a case asked again carries `raw.retried: true` (absent otherwise). No score depends on it.
  - Ledger and compare gain the p-value, and a column per standard budget (`memory_b<budget>_*`) with a `Memory · by budget` view.
  - The pre-registration for held-out runs is `evals/memory-utility/PREREGISTRATION.md`. No held-out run has been made.

- No eval changed version. Every akm sandbox sets `GIT_CEILING_DIRECTORIES` to its own folder, so a sandbox inside a git
  work tree (a TMPDIR in a checkout) no longer hides its bundle from akm's file walk (#148). Every published run had its
  sandboxes outside one: their index counts are the same on every akm version. Semantic sandboxes share akm's ONNX Runtime
  through a link to `.cache/onnxruntime` (#147), so on akm 0.10.261015 or later an index no longer fetches it (about 86 MB)
  once per sandbox; the 0.10.261018-beta round seeded it the same way by hand. Saved runs compare as before.

- bakeoff collection and scoring 0.4 (was 0.3). Four new memory-inference inputs bring the corpus to 55 cases (23 memory
  inference): nested and flat scope, an observation date only in metadata, and an undated observation with a file `updated` date.
  They use AKM's existing source-context/scope contract (akm#1209 / PR #1222); no prompt is duplicated in the evaluator.
  A labeled `scope` checks the complete child tuple, including absent keys (values compared as text). A labeled `observed`
  date (a parent that carries an observation date in its frontmatter) must appear verbatim in the child's frontmatter under
  `observed` or `observed_at`, whichever akm writes (`observed` first); the date is no longer required in the description
  or content. The scope and date checks measure akm's deterministic copy of the parent's metadata, not the model. The model-facing
  checks are the forbidden unsafe-claims, which now match whole words ("is 32 MiB" no longer matches "this 32 MiB"); valid
  negations pass. The remember-enrich scorer reads `observed` as well as `observed_at` from the enriched memory.
  The raw derived file already contains these fields, so collection needs no new raw field.
  Compatible 0.2/0.3 output rows can be explicitly rescored with scorer 0.4, retaining their original collection identity;
  only the four new inputs require collection. The existing limitation on old unusable inference rows without decision counters
  remains: never infer no-change from an absent file. Existing scores are retained, and different case totals are not an AKM gain.
  The smoke's inference reply now matches existing required schema keys, supporting both pre-no-change and explicit-no-change
  requests without depending on prompt prose; smoke changes alone do not affect measurement identity. Generation provenance
  and installed release rollout remain separate from the source-context quality controls (akm#1210).

- bakeoff collection and scoring 0.3 (was 0.2). Memory inference can end in an explicit decision that a note needs no derived
  memory (akm#1208, `memoryInference.noChange`), so a missing derived memory no longer ends every case as `unusable`:
  - Collection: the collector reads `memoryInference.noChange` and `skippedNoFacts` from the improve result and keeps them in the
    row as `inference`. A missing file alone is never a decision. A decision is `no-change` (outcome); a reply akm could not use is
    `unusable`; a pass that did not run, a failed call, a timeout, and a missing derived memory that no counter explains are
    `error`. An akm that does not report `noChange` (before akm#1208) gives `unusable` for a missing file, as before. The public
    corpus gains 11 memory-inference cases (19 in all; 51 cases): 5 notes that need no child (tool tallies, checkpoint and
    resume markers, short specific notes; `"noChange": true`) and 6 that need one (regex- and resvg-style substantive notes, a
    request not yet done, a lookup that was not run, a historical limit, a negated qualification). The other four processes and
    the first eight memory-inference cases are unchanged.
  - Scoring: a `no-change` passes a case with `"noChange": true` and is a false abstention (`does not abstain` fails) on every
    other case; a child for a `noChange` case fails (`decides no-change`). A no-change is a decision and no document: `valid_output`
    keeps its denominator (every case that ran) and does not count it; `by_process.*.outcomes` gains `no-change`. The forbidden
    terms of memory inference (`does not invent`) no longer fail on a mention that a negation within four words ("was not
    rotated") rules out. Summaries of rescored 0.2 rows can change only through this last rule.
  - Old runs: a 0.2 row that holds a derived memory or an error can be rescored. An unusable memory-inference row has no record of
    whether akm decided no-change (a new akm under the 0.2 collector reported it as unusable), so `scripts/rescore` refuses the
    run and names the field: collect those cases again. Saved 0.2 scores and 0.3 scores are not comparable totals: the 0.3 corpus has 11
    more cases and a different kind of check.
  - At 0.3, scope and metadata-only historical-date cases were deferred; the 0.4 entry above adds those inputs after akm#1209.

- No eval changed version. A summary writes every endpoint field (`engine`, the manifest's `engines` and
  `config.redacted`, longmemeval's `model_endpoint` and `judge_endpoint`) as `<MODEL_BASE_URL>`, not as a host, as
  its `config` already did. The reports already published were rewritten the same way. The engines of longmemeval
  and terminal-bench also record `endpoint_sha256`, a SHA-256 of the endpoint's scheme, host and port, so `--resume`
  still refuses a run at another host. A run stored before it is compared by the host it holds, and one stored with
  `<MODEL_BASE_URL>` and no digest cannot be resumed.

- No eval changed version. A summary and a sample written by `lib/run.ts` (nightly, reflect and the other process evals) write an
  akm actor id `human:<login>` as `human:<user>`: akm stamps the OS login of whoever ran it into the notes it writes, and the
  nightly samples store those notes. The three published nightly samples that held a login were rewritten the same way; no digest
  covers a samples file. SkillRet now records `wall_seconds` in `summary.json` as every other eval does, with or without `--repeat`.

- Retrieval collection version 0.3 supports optional per-query `searchArgs` in
  `queries.jsonl`. Collection and label pooling pass those existing CLI flags
  to keyword and semantic search only; curate and queries without this field
  keep their existing invocations. The per-case input digest and saved sample
  retain the argv. Scoring remains 0.3. Earlier saved runs retain their
  collector identity; use a new collection to measure newly added filters.

- retrieval, dated set (#167): a new optional set, `--cases evals/retrieval/assets/dated`, for akm#1228's `--since`/`--until` filters and
  recency tie-break. The public sets, their `assets_sha256` and retrieval's version 0.3 are unchanged, and so is every earlier run. Nothing
  the collector asks akm changes: a query's `searchArgs` already reached `akm search`.
  - A qrels row can carry `sentinel: true` (on a banned grade 0 pair). A query with a sentinel is a filter query: a search column whose
    sentinel comes back, or whose call akm refused as `UNKNOWN_FLAG`, is `unsupported`; its filter queries are left out of that column's
    metrics and are not errors (a refused flag no longer aborts a `--semantic` run). Filter queries are not scored in the curate columns.
    The summary of a set with sentinels gains `unsupported`, `unsupported_reason` and `by_kind`; the summary of any other set is as before.
  - Scoring: the case `labels` digest includes `sentinels` only when a case has them, so no public case digest changes. A stored run is
    judged again by `scripts/rescore`.

- consolidate stays 0.2. `--pool` now also measures search and curate (itlackey/akm-eval#166), on by default, with `--no-retrieval` to opt out. It adds
  steps and outputs and changes none that the existing metrics read, so every earlier pool run stays comparable:
  - The pool sandbox that `akm improve` runs in gets the commands it always got, up to the `proposal list` that the existing metrics (`unsafe`,
    `staged`, `precision`, `recall`, `wrong_successor`, `classes` and the rest) are scored from, before anything is accepted. The queries
    (`assets/pool/queries.jsonl` and `qrels.jsonl`: 64 queries in the retrieval eval's format, with a `cluster` on each) are first asked in a
    separate copy of the pool, twice (BEFORE and a no-op control), so no search reaches the improved sandbox's `state.db` before improve and
    consolidate's continuity check sees what it saw before. After the `proposal list` the run does `akm proposal drain --promote --yes`, asks
    the queries without a reindex (AFTER_ACCEPT), runs `akm index --full` and asks them again (AFTER).
  - New outputs, only with queries: `retrieval.json` (the accepted retirements and the answers), `summary.retrieval` (search and curate `mrr`,
    `success_5` and `banned_above_first` for the retire queries, `mrr`, `success_5` and `ndcg_10` for the control queries, by phase and by
    kind of cluster. The retire queries have no `ndcg_10`, which departs from the issue's metric list: every note of a duplicate or triple
    is graded 3, so a correct retirement reads as a loss, and on the other retire queries one note is relevant, so it says no more than
    `mrr`. The block also holds the deltas against
    BEFORE, the share of accepted retirements whose retired note a query of its cluster still returns, and the labels' verdicts on the accepted
    retirements), `manifest.eval_settings.retrieval: true`, and the queries of each cluster in its manifest input digest. Scored with the retrieval
    eval's own `scoreQuery`; the metrics are not rescored by `scripts/rescore`, which scores the pool metrics only.
  - `--no-retrieval` runs the pool as it was: the same akm commands, no retrieval fields, no `retrieval.json`, and the same input digests. With a
    deterministic model (the fixtures and the smoke's stub) the existing metrics are equal with and without it; with a real model they move from run
    to run, so compare them against the spread of repeated runs.
  - At the next consolidate version bump (0.3) `--no-retrieval` is removed and retrieval is always on.

## 0.7.1

No eval changed version. The manifest field `treatment_hints` is now
`eval_settings`; readers take either name, so saved runs keep their identity
and compare as before. See [release notes](releases/v0.7.1.md).

## 0.7

reflect (collection and scoring 0.4), longmemeval (0.3) and agent-ab and
terminal-bench (0.4) have new collection versions; nightly (scoring 0.4) and
retrieval (scoring 0.3) have new scoring versions only. The other evals keep
their 0.6 versions, and the shared driver changed no eval's version. See
[release notes](releases/v0.7.md).

- Shared driver, no version changes: reflect, distill, extract, judge-gate, promotion, bakeoff, consolidate and nightly run on one driver, `lib/run.ts`. What each asks akm, its cases and its scoring are unchanged (the akm invocations were diffed old against new), and so are the eval and scoring versions: saved runs compare as before.
- Those evals gain `--concurrency` (not nightly, promotion or `consolidate --pool`, which run as one batch) and `--timeout-ms`. Summaries record `concurrency` and `timeout_ms`, and `manifest.settings.timeout_ms` is the effective timeout.
- consolidate, nightly: `--embedder deterministic|real` is replaced by `--semantic`, which selects the same real embedder and writes the same config, so saved runs keep their identity.
- retrieval, skillret: semantic search is scored only with `--semantic`. Before, retrieval's `auto` scored it in a full run of the public or rewritten corpus, and skillret in every run without `--limit`. Saved runs keep the semantic columns they have.
- nightly: a night that fails writes a summary with `status: "aborted"` and the reason; it used to write none.
- longmemeval: a judge's reasoning is removed before its verdict is read, and `judge_temperature` is recorded beside `temperature` (`chat.temperature` of a `models.json` line sets either).
- skillret: a run that asked every query is `complete` and exits 0. A query whose call failed twice is counted in `errored` and left out of that line's numbers; it used to abort the run.
- Every run on the driver prints a banner of its effective settings and sends one one-token request to the model endpoint before its first case (`AKM_EVAL_NO_PROBE=1` skips it), so a wrong URL, key or model name ends the run before it has cost anything.

- reflect: collection version 0.4 records the expanded retrieval-label inputs used by optional `--retrieval-queries` (77 planted notes now have labeled queries, previously 75). Standard Reflect inputs and scoring 0.4 are unchanged; saved collector 0.3 runs retain their identities.
- retrieval: scoring version 0.3 expands the frozen judgments by 374 library and 492 books pairs from all four columns of six saved semantic runs. Inputs and collection version 0.2 are unchanged. Explicit same-file label aliases prevent duplicate relevance credit across AKM ref classifications; ranking formulas are unchanged. Explicit rescoring retains collector 0.2 and records scorer 0.3 plus the expanded label digests; originals remain intact.

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
the smaller full sets from 0.4; at 0.6 input identity checks enforced that even
though 0.5 retained the same measurement versions, and #108 removed those checks.

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
