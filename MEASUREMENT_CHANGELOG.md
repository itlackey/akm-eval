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

- retrieval collection 0.4 -> 0.5, scoring 0.6 -> 0.7 (measures akm#1459 and akm#1461; akm 0.10.261111-beta): the selection sets gain the empty value and a project-filter arm. (1) A selection value of `""` is `--filter key=` (assets without the key, ORed with the key's other values); the scorer counts a missing key as matching `""`, so `{"team": ["ops", ""]}` fully matches ops' notes and every unscoped note, and another team's note is a `conflict`. `assets/selection` gains 8 queries: four with `{"team": ["ops", ""]}` (kinds `empty-general-only`, `empty-missing-vs-conflict`; the queries of s05, s06, s11, s12) and their four no-selection partners (kind `control`, `same_as` of the empty query); the selection set's digest changes. A new check, `checks.empty_value`, passes a query whose list is its partner's less the assets of other values of the key (general answers kept, other teams' dropped, nothing else lost or added); `unchanged` no longer counts these queries. The empty-value queries are left out of intent (`by_intent`, `selection.*`), so those aggregates stay like-for-like with 0.4 on the other queries; they count in `checks.empty_value` and `by_kind`. `checks.empty_value` is `null` on a `prefer` arm. A build that refuses an empty value (0.10.261110: `INVALID_FLAG_VALUE`) errors those calls. (2) `--selection-flag project-filter`: the collector writes the query's selection into a copy of the sandbox config as one project (`paths`: a new folder; `filters` with an empty `prefer`) and runs akm in that folder with no selection flag; an answer without `project` (a build that ignores the `projects` key) is an error (0.10.261111 and later only). A run without selections, and the public library and books (queries, qrels, `assets_sha256`), ask akm exactly what 0.4 asked, so their quality metrics compare with 0.4 runs. Runs of the selection sets before this are not comparable by totals (more queries); compare by query id.
- retrieval, no version change (akm#1453): the selection sets rename their stand-in keys `scope_channel`/`scope_agent` to the frontmatter keys `team`/`project` (notes, `metadata.jsonl`, queries, `split.json`; the split digest changes with them). They need an akm with #1453; the keyword figures on the same build are the stand-in figures. Every selection case gets a new input digest and label digest, so compare runs by query id. Rescoring the 0.10.261110 runs from #200 rewrites `row.selection` to `team`, although they were collected with `channel`.
- distill 0.2 -> 0.3 (akm#1454): three cases of a new class, `knowledge-update` (`know-01` to `know-03`): a memory with two positive feedbacks, over a knowledge doc of the same name that carries `team`, `project` and a list or another key, scored on whether the pending knowledge proposal still holds the keys the case lists (`keeps`). The collector now keeps the knowledge proposals distill queued beside the lesson proposals; a lesson case reads lessons only. Needs akm with the akm#1454 fix to pass; an earlier akm loses the keys the model's merge leaves out. The 96 earlier cases, their labels and digests, and `good_lessons`, `wrong_lessons`, `lesson_updates` and `bad_by` are unchanged, so earlier runs compare on those by case; the new class appears in `by_class`, and `outcomes.knowledge` now appears in every summary, rescored old runs included, the case count is 99 and `assets_sha256` changes, and a `--limit` run now takes a `knowledge-update` case in its turn. `lesson-judge/src/harvest.ts` without `--ids` now harvests the three know cases. Not run yet: needs a model run once the lab is free.
- agent-ab and terminal-bench, no version change: a run with `--akm akm-cli@0.10.261111-beta` now gets plugin akm-opencode 0.10.261110-beta, the release that pins that CLI, instead of the default 0.10.261002-beta (`RELEASE_PLUGINS` in `lib/harbor/harbor.ts`). Rule: each beta plugin release pins the akm beta released with it, and every new akm beta gets an entry. The plugin is in each run's `pins.akm_plugin`; an earlier run of that release used the default plugin, so check it before comparing. Default runs and other releases are unchanged.
- project-intent collection 0.1, scoring 0.1 (akm#1461): new. 28 Harbor tasks about a made-up CLI, four attempts per task and arm, run with three akm arms that differ only in akm's `projects` config (`projects.json`: `none`, `bare` = paths only, `explicit` = paths and `filters: { project: [<name>, ""] }`); 24 tasks ask the same twelve questions from each of two project directories whose notes disagree, four need only unscoped notes. Per arm: pass rate (all, conflict, general), the paired difference of every two arms with lib/harbor's bootstrap and sign test, the other project's value in the answer, akm called, tokens per trial and per correct outcome. Shared code: `lib/harbor/akm_opencode.py` takes `arm` (the agent is recorded as `akm-opencode-<arm>`) and `projects` (written by the seed); `lib/harbor/trials.ts` reads `akm-opencode-<arm>` as an akm trial. agent-ab and terminal-bench set neither, so their jobs and scores are unchanged. No earlier run.
- retrieval, no version change (qrels only; rescore saved runs before comparing): 50 pairs of the split selection set (`assets/selection-split`) that the hard filter's top 10 returned on team-intent rows and nobody had graded, graded by `codex-review` on the protocol of the 2026-10-15 expansion and appended to `evals/retrieval/assets/qrels.jsonl` (29 of grade 0, 12 of grade 1, 8 of grade 2, 1 of grade 3; 2026-11-05). The split set's digest changes with the qrels (`split.test.ts`). Team-intent `judged_10` 54% -> 100%, `ndcg_10` 0.387 -> 0.399; the `@none` baseline moves 0.769 -> 0.767 because the new relevant assets enter the ideal ranking. Other qrels rows, queries and the public library are unchanged.
- retrieval collection 0.3 -> 0.4, scoring 0.5 -> 0.6 (#194): the collector puts a query's `selection` on both `akm search` and `akm curate` (`--selection-flag NAME`, default `filter`: today's hard filter; it is in the summary and in the input digest of every case of a set with selections), and every call now records the characters akm printed (`out_chars`) and, for search, the `estimatedTokens` of each result. The summary gains `calls` (results, seconds p50 and p95, `out_tokens`, `load_tokens_k` per column). A run of a set without selections asks akm exactly what 0.3 asked; the public library and books queries, qrels and `assets_sha256` are unchanged, so their quality metrics compare with 0.3 runs (token fields exist only from 0.4). Two new optional sets, not part of a default run and not a release gate: `assets/selection` (36 hand-written notes in two bundles, 20 queries) and `assets/selection-split` (the public library as a team bundle and a general bundle, written at run time by `evals/retrieval/split` from `split.json`, 505 queries: the 101 judged task queries once for each of five selections). Their metrics: `pref_ndcg_10`, `match_precision_k`, `irrelevant_match_k`, `first_match_rank`, `nonmatch_recall_10` and the diagnostics `partial_above_none` and `conflict_above_missing`, by query kind and by intent (`by_intent`), plus the checks `unchanged` (a selection that matches nothing leaves the list as it was) and `leaked` (metadata must not reach the ranked text; `null` for a set with no leak query). The selection metrics, `selection.ndcg_10` and `by_intent` cover only the queries whose selection matches some asset: the `@absent` and `no-match` rows are the `unchanged` check, and counting them would dilute every guardrail with rows a soft option leaves as they were. A diagnostic is left out for a query where neither of the two assets it compares is in the first 10. Stand-in keys until akm#1412: `scope_channel` is the team and `scope_agent` the project. Non-matching relevant assets include partial matches (all-or-nothing). Selections with two values of one key need akm with #1448 (OR within a key); on 0.10.261108 a repeated key keeps its last value, so read the `both` and `multi-value` rows apart. Any new judgment of a returned asset follows the `codex-review` protocol; none was added.
- retrieval, no version change (akm#1432, akm#1434): akm now prints a ref as the asset's bundle-relative path, so a file outside its type folder changes spelling (`knowledge/skills/x/references/a` is `skills/x/references/a`), and a later akm may keep the file extension. The collector brings every ref akm prints to the spelling the qrels use, from the hit's own type (`oldSpelling` in `evals/retrieval/src/akm.ts`), so the qrels and the saved runs are unchanged and an old and a new akm score against the same labels. On the public library and books, akm origin/main and the akm#1434 build give identical result lists (272 and 102) and identical metrics, which are those the collector gave before. Nothing is recollected. The saved `refs` are the normalised spelling.
- pair-judge collection 0.1, scoring 0.1 (#156): a new eval of consolidate's pair judge, `akm judge consolidate.pair` (schemaVersion 1), one pair at a time. Cases: 112 pairs of notes, 92 scored and 20 held out (`assets/heldout`): 108 are the pairs akm's pair pass judged on a real run over consolidate's 160 case notes and 80 pool notes (akm main `cc4872fe8`, deterministic embedder, a stub model: which pairs the pass judges does not depend on the model), with the labels adjudicated against the judge's prompt and reviewed independently (no label changed), and 4 are hand-written (long notes). 7 of consolidate's 80 pairs are retired (never judged). `src/reachable.ts` checks every case against the pass. Scoring: what the pass does with the verdict (a retirement of the note `decideRetirement` names, safe or unsafe; a kept pair; a failed judgment retires nothing), `unsafe` as the headline, `found`, `precision`, the relation and its confusion matrix, the claim lists against the labels by deterministic text matching, confidence, and trivial baselines. Connection runs only. No earlier run to compare with.
- lesson-judge collection 0.1, scoring 0.1, rubric version 1 (#140, #153): the lesson judge's own eval, new. It runs `akm judge distill.lesson` on the exact inputs akm's distill builds for it (a new lesson with its source, feedback and nearest assets; an update with the lesson it extends), harvested from real distill runs on akm cc4872fe8 with the shredder 35B as writer, plus writer replies written for the kinds real runs do not produce (`assets/README.md`). A verdict is routed as distill routes it: a new lesson by `routeOf` (pass, review, reject), an update on `pass` alone. The run refuses an akm whose `distill.lesson` is not schemaVersion 1. The summary reports good and bad passed for real and hand-written cases apart (`metrics.by_origin`). The held-out part is `assets/held-out`. Connection runner only; the harness runners wait for #153's harness isolation. No earlier run exists, so nothing is comparable.
- drain-judge 0.1 (#157): new. The drain's judgment (`akm judge proposal.judgment`, schemaVersion 1) on one frozen consolidate promotion at a time, with the model under test as the judge. 238 cases (184 scored, 54 held out): the input is what akm's promote pass and drain build for a memory (`src/capture.ts`, with consolidate's coverage gate on, checked by `src/reachable.ts`), 57 good and 181 bad (ephemeral 65, duplicate 58, stale 58). The good memories come from a real extract run and from other evals' corpora; 174 of the bad sources are notes written by hand for the eval in the style of extract's memories, and the summary reports bad accepted by origin (`bad_by_origin`: real, corpus, hand-written). Scored by the drain's route: accept is accepted; reject is rejected; defer, an unreadable reply and a failed call leave the promotion pending, so a deferred bad promotion is not a bad accepted; akm failing is left out of the counts. Metrics: `bad_accepted` (the harm number, with `by_category` and `bad_by_origin`), `good_accepted`, `precision`, `good_rejected`, `defer_rate`, `left_pending`, `confusion`, the accept-all, reject-all and defer-all baselines, the error and unparseable rates and seconds a call. Rubric version 1. Replaces nothing: promotion measures the judgment through the drain and is unchanged.
- judge-gate collection 0.4 -> 0.5, scoring 0.4 -> 0.5 (#153): the 3.5 shim (`REFLECT_REVIEW_MIN_SCORE`) is deleted, and a verdict is routed by its own `reviewNeeded` (akm#1418: reflect's review floor is in the `reflect.quality` verdict, schemaVersion 2), with no verdict counting as review. On a verdict from an akm with #1418 the routes are unchanged; on one from before it, the non-passes with a mean from 2.5 to 3.49 (about a third of the rows) move from reject to review. So the run refuses an akm whose `reflect.quality` is not at schemaVersion 2 (`lib/judge.ts`), each verdict stores its `schemaVersion`, and `scripts/rescore` refuses a stored run without it: runs from before this cannot be scored again, and the baseline is run again on an akm that has #1418. The cases, the labels and the input akm gets are unchanged (`assets_sha256` is the same). The call and the probe moved to `lib/judge.ts`, which the other judge evals will use.
- judge-gate collection 0.3 -> 0.4, scoring 0.3 -> 0.4, rubric version 2 -> 3 (#179): judge-gate now measures reflect's gate as it runs today. Cases: the 101 that reflect cannot produce
  (they edit the body, or a field it does not patch) are retired to `assets/retired.jsonl`; the other 36 are rebuilt through akm's `applyReflectPatch` (`src/reachable.ts`) with their ids, and 149 real reflect
  revisions (the reflect eval, judge off, a 35B model) and 3 written ones are added: 188 cases, 91 good and 97 bad (71 harmful, 25 churn, 1 `other`), 156 with a `[negative]` line; `assets_sha256` changes.
  Collection: `akm judge reflect.quality` with the feedback as an array in the case's order and the case's `ref` (was `akm improve judge` with one string, negative lines first, no ref). The new akm minimum is
  0.10.261105 (akm main from #1416). Scoring: the three routes of reflect (pass; review, `reviewNeeded`, from a mean of 3.5 until akm#1418 ships, and no verdict; reject), by label, severity and lane;
  the headline is `harmful_auto_accepted` (harmful passes on the `negative` lane), next to `good`, `good_rejected` and `review_share`. Labels follow rubric 3, the policy of the shipped judge's prompt
  (7 of the 36 earlier cases changed: `assets/ADJUDICATION.md`). The 13 judge-gate rounds published before this are not comparable with any run of 0.4 and cannot be rescored; `reports/README.md` says so.
  Start a new baseline. Until akm#1418 (PR #1419) ships, the review band is routed from the stored score at 3.5 (`REFLECT_REVIEW_MIN_SCORE` in `score.ts`). Deleting it is a measurement bump (about a third of the rows move from reject to review),
  and a run on an akm before #1418 must not be rescored after it; the baseline is run again on an akm that has it.
- judge-gate collection 0.2 -> 0.3 (#164): two cases added, so the selected inputs change (137 cases, 42 good and 95 bad; `assets_sha256` changes).
  Set `written-11-02`: the nightly note `silent-description-missing-02` with only a correct description added and no feedback (good), and the
  same with a reworded `when_to_use`, as 0.10.261018-beta proposed (also good: rubric 2 calls a fix bad for body churn only, as for `1ae76bf3`). No existing case, label, severity or criterion changed, the
  rubric stays version 2, and scoring is unchanged. Runs of 0.2 compare with 0.3 by case, not by totals: only `good` and
  `precision` change, as they score 137 cases; `bad`, `bad_harmful` and `bad_churn` score the same 95 cases. The cases add a description to a source that has none, which none of the 135 did.
- agent-ab and terminal-bench: the summary and report count, per arm, the trials whose Harbor exception is `NonZeroAgentExitCodeError`
  (`agent_exits`, in `metrics`, at the top level beside `timeouts`, and in the report's arm line and side-by-side table, and `agent_exit` per trial in `samples.jsonl`), scored or not, and also when the trial is later relabelled for a dead plugin (#161). Visibility only: the
  verifier still scores those workspaces, and pass rates, scoring and eval versions are unchanged. Summaries from before lack the field.
- bakeoff scoring 0.5; collection stays 0.4 (case inputs and the akm invocations are unchanged). Label changes only, no input changes:
  - `consolidate-memory-pool` and `prod-consolidate-full-pool` no longer expect `memories/operator-preference` to be left out of the
    plan. akm 0.10 consolidates `captureMode: hot` memories like any other (akm#1170, CHANGELOG 0.10.26101101), so the plan may include
    it and akm decides afterwards (it skips this one-line note as `promote_source_too_small`). The old check failed on every 0.10 build
    for a policy that was removed on purpose (#154). The check is dropped and not turned around: expecting the plan to promote the note
    would measure a model choice akm does not ask for. Both cases still check the expected promotion and that every promotion is a
    memory of the pool. `consolidate-memory-pool` is no longer `strict`: its "no extra or missing promotions" check also failed any
    plan that included `memories/operator-preference` (12 of the 14 rescored 0.10 runs plan it), which is 0.9's rule again. It loses
    its over-promotion check; allowing only that memory would need a new scorer field.
  - `prod-session-summary` no longer requires or lists `relay-canary-184` in its topics: a request ID cited once as evidence in a
    five-line session, not a file, resource or decision it works on (#163). `worker-stable`, the deployment it updated, stays.
  Both case sets still compare as before except through those three cases. Explicitly rescore saved runs (collection 0.2, 0.3 or 0.4; 0.2 runs rescore as before and are labeled the same way) to apply scoring 0.5
  (the original collection version is kept, originals are untouched). The rescored 0.10.261005-beta to 0.10.261022 35B rounds are in
  `-rescored` folders beside the originals.

- retrieval, library judgments (#150): scoring version 0.4 -> 0.5, label-only. 157 library (query, asset) pairs that no earlier grade covered are graded by
  `fast/qwen3.6-35b-a3b` (prompt umbrela-akm-v1, temperature 0) and appended to `evals/retrieval/assets/qrels.jsonl`: the 138 that the akm#1260 runs returned, and 19 more that the published
  0.10.261018-beta (1) and 0.10.261105-beta (18) runs returned in the top 10, mostly from akm#1272 (fenced-code identifiers in the searched text). `judged_10` is 1.0 on every published library run again
  (it was 0.9554 to 0.9733 on 0.10.261018-beta to 0.10.261105-beta). New relevant grades raise the ideal ranking, so library nDCG@10 reads a little lower than at 0.4 on every run, older ones included:
  0.10.261105-beta keyword 0.7752 -> 0.7689 and semantic 0.8312 -> 0.8245, 0.10.261022 keyword 0.7752 -> 0.7689 and semantic 0.8306 -> 0.8240, 0.9.32 keyword 0.7573 -> 0.7467 and semantic 0.826 -> 0.8123.
  One of the 157 grades was corrected in review before this version was published: q012's `agents/print/qa-coordinator` (a print QA orchestrator, not a report orchestrator) from the judge's 3 to 1 (`claude-review`).
  `label` no longer stops on an expected ref that akm does not index when the qrels already grade that pair: the public q092 expects
  `commands/skills/ai-skills/opencode-extensions/references/commands`, which akm 0.10 prints as a knowledge ref, so label of the public library stopped on every 0.10 build. A mistyped expected ref with no grade
  still stops the run. Every published library run (18) was scored again into a `-rescored` folder beside it (`-rescored-2` for the one that was already a rescore); the originals are unchanged. The inputs and collection version 0.3 are unchanged.
  Books are unchanged since 0.4. Record: `evals/retrieval/assets/judgment-expansion-20261103.md`.
- retrieval, books judgments (#150): scoring version 0.3 -> 0.4, label-only. `evals/retrieval/label --from` now grades a books run (it took the library only), and
  grades the 52 books (query, asset) pairs that no earlier grade covered: the ones akm 0.10 returns in the top 10 from 0.10.261009-beta on. They are judged by
  `fast/qwen3.6-35b-a3b` (prompt umbrela-akm-v1), as the library's latest grades were, and appended to `evals/retrieval/assets/books/qrels.jsonl`. `judged_10` is
  1.0 on every published books run again (it was 0.949 keyword and 0.937 to 0.943 semantic from 0.10.261009-beta on). New relevant grades raise the ideal ranking, so books nDCG@10 reads a little
  lower than at 0.3 on every run, older ones included: 0.10.261022 keyword 0.8357 -> 0.8308 and semantic 0.9108 -> 0.9103, 0.9.32 keyword 0.8275 -> 0.8216 and semantic 0.9089 -> 0.9028.
  Every published books run (19) was scored again into a `-rescored` folder beside it; the originals are unchanged. The inputs and collection version 0.3 are unchanged.
  The library judgments follow in the entry above.
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
