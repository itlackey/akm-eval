# akm 0.10.261105-beta, 35B, semantic, full, next to the 0.10.261022 stable

Every eval but LongMemEval, Terminal-Bench and memory-utility, run once on 2026-11-03 with akm 0.10.261105-beta (npm `next`),
`fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, temperature 0 and thinking off, one
eval at a time. It is the same set, run the same way, as the [0.10.261022 round](../0.10.261022/) (2026-10-31, the published stable
round): the same 13 summaries, default concurrency and timeouts for the process evals, and for agent-ab 6 tasks, 3 attempts per arm,
4 trials at a time, with `akm-cli@0.10.261105-beta` and the plugin pinned at 0.10.261002-beta. All 13 beta summaries are `complete`,
record `fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`), `akm_version` 0.10.261105-beta and `git_commit` `bf07f14`,
and have no errored case and no failed model call.

The harness changed since the stable round (collected at `d70ba23`), and some of the changes can move a score. So the stable
build was run again, on the same head as the beta, for every eval where the change reaches collection: the
[0.10.261022 re-run at `bf07f14`](../0.10.261022-rerun-bf07f14/) (`akm-cli@0.10.261022`, run right after the beta's run of the same
eval, same model server, one eval at a time). Every figure below is one run of a model route that is not deterministic: identical
requests can return different text at temperature 0. One run per side is one observation, and no single-case flip is chased.

## Look at these first

1. **Session summaries: bakeoff 1/8 to 8/8.** Bakeoff (scoring 0.5) passes 49 of 55 cases on the beta, against 43 for both the
   published stable run and its re-run on this head. All of the gain is the `session-summary` process, 1/8 on both stable runs and
   8/8 on the beta: seven cases that failed on both stable runs pass. That matches the entry "session summaries name the files and
   resources a session worked with in `key_topics`" in 0.10.261105. The other four processes are 21/23, 7/8, 6/8 and 7/8 against
   20 to 21, 7 to 8, 6 to 7 and 7 to 8 on the stable runs, which differ from each other by 4 cases in all (`enrich-translation-keys-memory`
   and `consolidate-replica-lag-pool` fail on the beta and on neither stable run).
2. **Distill's lesson updates: 0/40 to 7/40, and a better lesson-worthy count.** The lesson-update judge now accepts updates that
   add concrete facts. Lesson-update inputs end as 23 updates, 5 lessons and 12 skipped (stable: 1 to 2 updates, 4 to 6 lessons,
   31 to 35 skipped as `nothing_reusable`), and the skips now carry the new reasons (`update_rejected` 11, `update_nothing_added` 1).
   Seven of the 40 are right (the eval's checks: update proposed, existing text kept, new facts, no extra claims, not copied).
   The other 16 updates are scored bad (14 add no new fact, 2 add one but fail another check), the 5 new lessons are scored bad
   as before, and 12 inputs were skipped.
   Good lessons are 29/40 (stable 24/40 on both runs), of which lesson-worthy 22/23 (17 and 18), over-claim 7/17 (7 and 6), and
   still 0/16 wrong lessons. 35 of 96 verdicts differ from the stable re-run (13 between the published stable run and its re-run),
   most of them the update rows.
3. **Consolidate: no unsafe retirement and more safe ones.** 39/40 safe retirements found (stable: 34 published with 1 unsafe, 35
   on the re-run with 0), 0 unsafe of 80. `supersedes` is 13 of 13 (10 and 9). The 261022 `overlap-04` unsafe retirement of the
   published run did not recur on the re-run either, so this is the model's variation as much as the build's. **`--pool` is 17/19
   (stable 19/19 on both runs), 0 unsafe**: `duplicate-07` and `supersedes-05` were kept. One observation each.
4. **Accepted retirements leave `search` without a reindex.** The pool's new retrieval phases show akm#1307 (0.10.261101): after
   `proposal drain --promote --yes` and before any reindex, 0 of 11 retired notes are returned by `search` on the beta; on the
   stable re-run `search` still returns 13 of 13 until `akm index --full` (`curate` already left them out).
5. **Small regressions that are inside the stable spread.** Extract 34/40 (stable 36 and 37; `insight` 18/21, `preference` 8/11).
   Nightly 30/35 against 31/35 on both stable runs, with one item of harm (the planted `when-to-use-missing-01` reflect item now
   changes a field besides the planted defect; `overlap-04` is a `pair` item that now proposes, and does not accept, the retirement
   of a note that holds a claim the other lacks; `silent-description-missing-02` is handled, which it was not on either stable run). Reflect 37/40 with the
   controls 33/40 (34 on both). None of these is a change the CHANGELOG predicts, and the figures sit inside the 1 to 4 case
   differences that the two stable runs show.
6. **Retrieval and SkillRet: no change in the aggregate.** Books are identical to the stable re-run on every search and curate
   metric. The library's keyword nDCG@10 is identical (0.7752); semantic is 0.8312 against 0.8306 (46 of 136 queries have a
   different semantic list, 21 differ within the top 5, 2 in the first place; 0.10.261101 added a recency tie-break to the fused
   score, which this run did not isolate). SkillRet keyword NDCG@10 50.49 (50.48), semantic 57.79 (57.79): 4,388 of 4,392 keyword
   and 4,390 of 4,392 semantic queries have the same top 15. Search calls were slower in this run (keyword 1.44 s a call
   against 0.98 s, semantic 2.66 s against 1.77 s, SkillRet's query phase 2,391 s against 1,603 s); the host's load average was
   about 31 when the run was checked, so this run does not say whether akm got slower (see wall times).
7. **Agent A/B: akm arm 12/18, control 2/18.** The stable run had 8/18 and 1/18; 12 is inside the 8 to 13 of 18 that the arm gave over
   the earlier attempts listed in the stable README (one run each, this one not repeated). Difference +55.6 points (interval 16.7 to 88.9 over 6 tasks);
   the akm arm beat the control on 4 tasks and tied on 2 (sign test p = 0.125). 36 of 36 trials completed (the stable run had 2
   `NonZeroAgentExitCodeError` trials). akm was called in 9 of 18 trials (curate 8, show 10, shell 3); 9 of 9 of those passed, 3 of
   9 of the others did.

## Headline table

The first column is the published [0.10.261022 round](../0.10.261022/) (bakeoff and retrieval books in their `-rescored` folders:
bakeoff scoring 0.5, retrieval books scoring 0.4 and library scoring 0.5, as in akm-eval#171, #173 and #150). The second is `akm-cli@0.10.261022` run again on
`bf07f14`, where the table below says the harness change can reach the eval; a dash is an eval that was not run again. The third
is this round.

| eval | headline | 0.10.261022 as published | 0.10.261022 re-run at `bf07f14` | 0.10.261105-beta |
|---|---|---:|---:|---:|
| reflect | correct fixes (controls) | 36/40 (34/40) | 36/40 (34/40) | 37/40 (33/40) |
| distill | good lessons (wrong lessons) | 24/40 (0/16) | 24/40 (0/16) | **29/40** (0/16) |
| distill | lesson updates right | 0/40 | 0/40 | **7/40** |
| extract | useful memories | 36/40 | 37/40 | 34/40 |
| judge-gate | approved revisions that were good | 14/14 | 14/14 | 15/15 |
| bakeoff 0.5 | cases passed | 43/55 | 43/55 | **49/55** |
| bakeoff 0.5 | session-summary cases passed | 1/8 | 1/8 | **8/8** |
| consolidate | safe retirements found (unsafe) | 34/40 (1) | 35/40 (0) | **39/40** (0) |
| consolidate `--pool` | safe retirements found (unsafe) | 19/19 (0) | 19/19 (0) | 17/19 (0) |
| promotion | accepted proposals that were good | 36/42 | 35/40 | 35/40 |
| nightly | items handled right (harm) | 31/35 (0) | 31/35 (0) | 30/35 (1) |
| retrieval, books | semantic / keyword nDCG@10 | 0.9103 / 0.8308 | 0.9103 / 0.8308 | 0.9103 / 0.8308 |
| retrieval, library | semantic / keyword nDCG@10 | 0.8221 / 0.7682 | 0.8221 / 0.7682 | 0.8226 / 0.7682 |
| skillret | keyword / semantic NDCG@10 | 50.48 / 57.79 | - | 50.49 / 57.79 |
| agent-ab | pass rate, akm / control | 8/18 / 1/18 | - | **12/18** / 2/18 |

Judge-gate's figure is good revisions passed over all revisions passed (14 and 15 of 40 good revisions; none of 95 bad ones passed
in any of the three runs). Promotion's is good accepted over all accepted (published 36 of 42; the re-run and the beta accepted
40, with 5 bad ones among them, all `duplicate`; the published run 6). Library judgment coverage (`judged_10`) is 0.9564 keyword
and 0.9733 semantic on all three, as in the stable round (akm-eval#145 is open). `model` is `fast/qwen3.6-35b-a3b` and
`config_form` is `connections` on every model-calling summary of the re-run and the beta; the published stable summaries
have no `config_form` (they wrote the `engines` form).

## Move counts

Cases whose verdict changed between two runs of the same eval (the key is the one the eval's headline reads: `correct`, `verdict`
and `outcome`, `outcome`, `safe` and `outcome`, `ok`). The last column is the spread between the two stable runs, which
differ only in harness head and time.

| eval (cases) | beta against published stable | beta against stable re-run | stable re-run against published stable |
|---|---:|---:|---:|
| reflect (80) | 4 | 4 | 0 |
| distill (96), verdict / outcome | 30 / 29 | 35 / 28 | 13 / 11 |
| extract (64) | 2 | 3 | 1 |
| judge-gate (135), pass / review / reject | 9 | 11 | 10 |
| bakeoff (55) | 10 | 12 | 4 |
| consolidate (80) | 6 | 4 | 6 |
| promotion (80) | 2 | 0 | 2 |
| nightly (35) | 3 | 3 | 0 |
| retrieval library, semantic lists (136) | - | 46 (21 differ in the top 5) | 0 |
| retrieval books, SkillRet | - | 0 of 51 books; SkillRet 4 and 2 of 4,392 against the published run | 0 |

## Why the stable build was run again: harness changes since `d70ba23`

`git diff d70ba23 origin/main` with `MEASUREMENT_CHANGELOG.md`. The table was written before any run and applied as written.

| change (PR) | evals | can it move a score? | what was done |
|---|---|---|---|
| The collector writes akm's `connections` config for akm >= 0.10.261014-beta (the `engines` form before), and the summary gains `config_form` (#172) | every eval that makes model calls: reflect, distill, extract, judge-gate, bakeoff, consolidate, `--pool`, promotion, nightly | Collection. The model, endpoint and parameters are the same, the file akm reads is not; the published stable summaries were written in the `engines` form | each re-run on `akm-cli@0.10.261022` at `bf07f14` |
| Bakeoff scoring 0.5: the protected-memory check is dropped from two cases, `consolidate-memory-pool` is not strict, one session-summary term is dropped (#171) | bakeoff | Labels only | the published stable bakeoff column is its `-rescored` folder (43/55, already in 0.10.261022's README); the re-run and the beta are scored at 0.5 by the run |
| Retrieval books labels and scoring 0.4: 52 more books pairs graded (#173); the asset listing passes `--belief all` | retrieval | Books: labels only; the listing is a collection change with no model | the published stable books column is its `-books-rescored` folder; retrieval re-run on 0.10.261022 (books and library) |
| Retrieval library labels and scoring 0.5: 157 more library pairs graded (#150), `judged_10` 1.0 on every published library run | retrieval | Library: labels only; every published library run is scored again in a `-rescored` folder | the library columns here are the `-rescored` folders (scoring 0.5): nDCG@10 reads 0.003 to 0.016 lower than at 0.4 on every run, older ones included (the 12-case 0.10.261005-beta timing run: 0.027 keyword, 0.034 semantic) |
| `--pool` measures search and curate before and after retirements are accepted, and runs `proposal drain --promote --yes` after the proposal list (#170) | consolidate `--pool` | Collection (more steps, the existing metrics are read before them) | `--pool` re-run on 0.10.261022 |
| Dated query set with a sentinel guard (#167), memory-utility (#152, #158, #168), ledger and site changes | none of the 13 | Not run (optional set, new eval) | nothing |
| none | SkillRet, agent-ab | No collector, scorer or config-writing change reaches them (neither makes model calls through the akm config) | not run again; the published 0.10.261022 figures are used |

The re-run does not change what the original column says in the ways one might expect: model calls per eval are the same on the
published and the re-run (reflect 80, distill 199, extract 64, judge-gate 135, consolidate 185, promotion 80, nightly 56,
`--pool` 60) except bakeoff, 73 against 74. The two stable runs differ by up to 13 verdicts in distill and 10 outcomes in
judge-gate with the same build: that, not zero, is the noise to read the beta's move counts against.

## What changed in akm since 0.10.261022, eval-visible

From `CHANGELOG.md` (0.10.261101 to 0.10.261105). Only entries an eval could see are listed.

| release | change | what an eval could see |
|---|---|---|
| 0.10.261105 | Distill reports how an attempted lesson update ended (`update_rejected`, `update_unparseable`, `update_line_dropped`, `update_nothing_added`, `update_not_written`); the lesson-update judge accepts updates that add concrete facts and rejects status-only or contradicting lines | distill: lesson-update inputs 0/40 to 7/40, the skip reasons above; nightly's distill items |
| 0.10.261105 | Session summaries name the files and resources a session worked with in `key_topics` (30 topics of 100 characters at most); session summaries redact secrets before the model sees the session; the `key-`/`key_` redaction rule needs a digit or an 8-character run | bakeoff `session-summary` (1/8 to 8/8); extract and nightly if they build session summaries (no sign) |
| 0.10.261101 | Search reads frontmatter dates as fields; `akm search --since/--until`; recency is a small tie-break in the fused score (#1228) | retrieval, SkillRet (semantic lists of the library moved a little; SkillRet's aggregate did not) |
| 0.10.261101 | A bare `akm proposal drain` queues instead of promoting (#1274); `--promote` always promotes | `--pool` drains with `--promote`, so no change expected; no sign |
| 0.10.261101 | Accepting a retire proposal updates the search index for the moved files (#1307) | `--pool`'s new phases: 0 of 11 retired notes returned by `search` right after the accept |
| 0.10.261101 | `akm proposal extract` checks the queue owner before the model call and reports `writeFailures` (#1289, #1290); search ranking counts only the last 90 days of feedback (#1252) | no sign (extract, nightly: no write failures; no eval gives feedback older than 90 days) |
| 0.10.261102 to 0.10.261104 | The local UI, the Improve impact page, the editable Config page and their API (`index_completed` no longer carries `entriesByType`, `akm metrics` drops `usage.searchTimed`) | no eval |
| 0.10.261105 | OpenCode plugin upgrades read `opencode.jsonc` before `opencode.json`; the proposal page wraps long lines | agent-ab does not upgrade the plugin (it is pinned); no sign |

## Wall times

From each summary's `wall_seconds`: published stable (stable re-run, beta).

| eval | published stable | stable re-run | beta |
|---|---:|---:|---:|
| reflect | 295 s | 312 s | 308 s |
| distill | 675 s | 668 s | 681 s |
| extract | 409 s | 407 s | 404 s |
| judge-gate | 253 s | 279 s | 249 s |
| bakeoff | 259 s | 252 s | 267 s |
| consolidate | 384 s | 392 s | 401 s |
| consolidate `--pool` | 97 s | 400 s | 401 s |
| promotion | 175 s | 173 s | 172 s |
| nightly | 114 s | 116 s | 113 s |
| retrieval, books / library | 110 s / 303 s | 104 s / 282 s | 102 s / 281 s |
| skillret | 2,308 s (queries 1,603; semantic index 679; keyword index 25) | - | 3,075 s (queries 2,391; semantic index 651; keyword index 31) |
| agent-ab | 1,048 s | - | 944 s |

`--pool` is four times slower than the published run on both builds because it now asks the 64 pool queries four times (about 300
s in all, #170), not because of the build. SkillRet's call time is 47% longer for keyword and 50% for semantic search than in the
published run; the host's load average was about 31 when this run was checked, so the figure is not attributed to akm. The round
(beta and re-run, one eval at a time) took 3 h (03:31 to 06:31 UTC) with the beta's SkillRet and agent-ab at the end.

## What differs, and what does not isolate a cause

Retrieval and SkillRet call no model and search is deterministic, so their differences are the build's. Everything else is one run
of a route that is not deterministic over time, so a move of a few cases in a model-driven eval is inside what the two stable runs
show against each other (4 bakeoff cases, 6 consolidate outcomes, 10 judge-gate outcomes, 13 distill verdicts).

- **Moves larger than the stable spread, and with a CHANGELOG entry that predicts them:** bakeoff `session-summary` (7 cases, 0.10.261105
  `key_topics`), distill lesson updates (16 more updates produced, 7 right, 0.10.261105 lesson-update judge).
- **Moves the CHANGELOG does not predict, inside the spread:** reflect 37/40, extract 34/40, nightly 30/35, consolidate 39/40
  (and `--pool` 17/19). Consolidate's 39/40 is 4 above the re-run and 5 above the published run; no consolidate entry is in
  0.10.261101 to 0.10.261105. It is a single observation; a second run is needed before reading it as a gain.
- **Nightly's harm item:** `when-to-use-missing-01` changed `description` and `when_to_use` where only `when_to_use` was planted (the
  `no_extra_change` check). It is one item of one run; reflect's own `when-to-use-missing` class is 6/6 in all three runs.
- **Bakeoff's other moves.** Against the published run the beta also passes `enrich-signing-memory` and fails
  `enrich-translation-keys-memory` and `consolidate-replica-lag-pool`; the stable re-run moved four other cases from the published
  run (`enrich-signing-memory` and `repair-backpressure-metadata` up, `prod-consolidate-full-pool` and `infer-short-format-command` down).
  None is repeated.

## Runs

| eval | folder |
|---|---|
| reflect | [reflect/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](reflect/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| distill | [distill/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](distill/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| extract | [extract/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](extract/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| judge-gate | [judge-gate/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](judge-gate/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| bakeoff (0.5) | [bakeoff/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](bakeoff/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| consolidate | [consolidate/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](consolidate/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| consolidate `--pool` | [consolidate/2026-11-03-0.10.261105-beta-35b-semantic-pool-20261103](consolidate/2026-11-03-0.10.261105-beta-35b-semantic-pool-20261103) |
| promotion | [promotion/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](promotion/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| nightly | [nightly/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](nightly/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| retrieval | [books](retrieval/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103-books), [library](retrieval/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103-library) |
| skillret | [skillret/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](skillret/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |
| agent-ab | [agent-ab/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103](agent-ab/2026-11-03-0.10.261105-beta-35b-semantic-full-20261103) |

The 0.10.261022 re-run at `bf07f14` is in [`../0.10.261022-rerun-bf07f14/`](../0.10.261022-rerun-bf07f14/): reflect, distill, extract,
judge-gate, bakeoff, consolidate, consolidate `--pool`, promotion, nightly and retrieval (books and library).

## Environment

- Sandboxes, `TMPDIR` and logs were outside the repository (the system temporary folder was full). The ONNX Runtime and the
  embedding model were fetched or copied once and shared; SkillRet fetched its pinned dataset and retrieval's and SkillRet's semantic
  indexes were built cold. `akm-cli` 0.10.261022 and 0.10.261105-beta were installed under Node 24.18.0 into two folders and
  selected by `PATH`.
- No other eval used the lab 35B during the round.

## Caveats

- One run per eval and side. Every model-driven figure is one observation; no move was confirmed by a second run.
- Agent-ab and SkillRet were not run again on the stable build: their summaries are the published 0.10.261022 ones, collected at
  `d70ba23`. No harness change reaches them by the table above, but the stable agent-ab figure was collected on another day.
- The published stable column uses `-rescored` folders for bakeoff and books; the library is at retrieval scoring 0.3 (unchanged
  qrels), and its `judged_10` is below 1.0 (akm-eval#145).
- Wall times and SkillRet's per-call time depend on host load at the time, which was not controlled.
