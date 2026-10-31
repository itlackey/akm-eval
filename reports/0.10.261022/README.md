# akm 0.10.261022 (stable), 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-31 with akm 0.10.261022 (npm `latest`, published
2026-10-31; the stable line began with 0.10.261019), `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every
eval, full public corpora, temperature 0 and thinking off, one eval at a time. It is the same set, run the same way, as the
[0.9.32 set](../0.9.32/) (2026-10-22, first column below), the [0.10.261012-beta round](../0.10.261012-beta/) (2026-10-23,
second column) and the [0.10.261018-beta round](../0.10.261018-beta/) (2026-10-29, third column), the last build before the
stable cut. The settings are those of the [0.10.261011-beta round](../0.10.261011-beta/): default concurrency (1; judge-gate 2)
and default timeouts for the process evals, and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, with
`akm-cli@0.10.261022` and the plugin pinned at 0.10.261002-beta (the plugin carries its own akm-cli 0.10.261003-beta; the
akm that the agent shells out to is the one under test). The model's context and output limits (32768 and 4096) were set for
agent-ab. All 13 summaries below are `complete`, record `fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`), and
have no errored case and no failed model call.

## The harness

The collector is akm-eval at `d70ba23` (clean tree; the summaries read `d70ba23`). The 0.10.261018-beta round and the
0.9.32 comparison used `556b869`. `git diff 556b869 d70ba23` touches no case, prompt, scorer or asset of any eval, and
[`MEASUREMENT_CHANGELOG.md`](../../MEASUREMENT_CHANGELOG.md) says "No eval changed version". What did change, and whether it
can move an eval's scores:

| change (PR) | evals | can it move a score? |
|---|---|---|
| Every akm sandbox sets `GIT_CEILING_DIRECTORIES` to its own folder (#148). Before, only the cached indexes of retrieval and SkillRet did. | all that run akm: reflect, distill, extract, judge-gate, bakeoff, consolidate, `--pool`, promotion, nightly, retrieval, SkillRet | No in this round. It matters only for a sandbox inside a git work tree, whose `.gitignore` made akm index 0 assets (the 0.10.261018-beta round hit it). Every sandbox of every published round, this one included, was outside any work tree, so the index counts are the same on every akm version. Retrieval and SkillRet get the same environment as before. |
| Semantic sandboxes link `cache/onnxruntime` to a shared `.cache/onnxruntime`, which akm fills once (#147). | every `--semantic` run | No. It replaces the shim the 0.10.261018-beta round needed: one fetch of ONNX Runtime 1.24.3 (34 MB kept) instead of one copy per sandbox. The runtime and the embedding model are the same; only where they are stored changed. No shim was used here. |
| The image's Dockerfile removes the empty `.cache/onnxruntime`; `LEDGER_PORT` for the ledger preview and the Playwright config; a browser-check fix (the version menu is closed before export on a phone); README notes. | none | No (no eval run uses the image; the ledger is not an eval). |

The agent-ab containers fetch their own akm from the registry, as before. The earlier rounds' summaries are compared as they
are and were not run again.

## What changed in akm since 0.10.261018-beta

From the package CHANGELOG (0.10.261019 to 0.10.261022). Only the entries an eval could see are listed.

| release | change | what an eval could see |
|---|---|---|
| 0.10.261019 | the first stable release; the CHANGELOG lists no change of its own | nothing recorded |
| 0.10.261020-beta | published only as a beta (`next`); no CHANGELOG section | not run |
| 0.10.261021 | #1284: repeated fenced identifiers contribute once per document to the search content (they counted every time since #1260 in 0.10.261017); content projections and embedding inputs refresh on the next index pass | retrieval and SkillRet: this is the entry that matches the SkillRet recovery below, not isolated from the rest of the range |
| 0.10.261021 | #1295: a model call with a deadline over five minutes is no longer cut off at five minutes by Bun's socket-idle timer | a call that waits over five minutes; no process-eval case here took more than 26 s |
| 0.10.261021 | #1294: metrics report token usage as unknown, not zero, when the provider sent none; #1293 `usage.selectsPerSearch` | `akm metrics` and `akm health`; no eval reads them |
| 0.10.261021 | #1285 `akm upgrade --channel`, #1292 workflow params, #1296 `bundle add --writable`, #1291/#1288/#1286 health checks | no eval |
| 0.10.261022 | #1300: knowledge, memories and other typed directories keep their declared type when a document quotes `$ARGUMENTS` | indexing of such documents; no sign in the books and library collections (library keyword nDCG@10 identical to 0.10.261018-beta) |
| 0.10.261022 | #1301 health, #1302 `akm ui` charts | no eval |

## Next to 0.9.32 and the two earlier 0.10 rounds

One run per side; `scripts/compare/run` shows each pair in full. The first three columns are published rounds; all four were
collected with the same eval versions (bakeoff 0.4, reflect 0.4, retrieval 0.3, nightly collector 0.3 and scorer 0.4).
Several settings differ (akm, date, lab route), so no difference below isolates one cause, and one run per side is one
observation.

| eval | headline | 0.9.32 | 0.10.261012-beta | 0.10.261018-beta | 0.10.261022 |
|---|---|---:|---:|---:|---:|
| reflect | correct fixes | 36/40 | 36/40 | 36/40 | 36/40 |
| distill | good lessons (wrong lessons) | 11/40 (0/16) | 25/40 (0/16) | 24/40 (0/16) | 24/40 (0/16) |
| extract | useful memories | 35/40 | 34/40 | 35/40 | 36/40 |
| judge-gate | approved revisions that were good | 16/17 | 16/17 | 15/16 | 14/14 |
| bakeoff 0.4 | cases passed | 35/55 | 42/55 | 43/55 | 41/55 |
| consolidate | safe retirements found (unsafe) | 34/40 (1) | 37/40 (0) | 36/40 (0) | 34/40 (1) |
| consolidate `--pool` | safe retirements found | 18/19 | 19/19 | 18/19 | 19/19 |
| promotion | accepted proposals that were good | 34/40 | 35/40 | 35/40 | 36/42 |
| nightly | items handled right | 28/35 | 31/35 | 31/35 | 31/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 | 0.911 / 0.826 | 0.911 / 0.829 | 0.911 / **0.831** |
| retrieval, books / library | keyword search nDCG@10 | 0.828 / 0.757 | 0.836 / 0.757 | 0.836 / 0.775 | 0.836 / 0.775 |
| skillret | keyword NDCG@10 | 50.47 | 50.47 | 48.19 | **50.48** |
| skillret | semantic NDCG@10 | 58.00 | 58.00 | 57.24 | **57.79** |
| agent-ab | pass rate, akm / control | 9/18 / 1/18 | 8/18 / 1/18 | 8/18 / 2/18 | 8/18 / 1/18 |

Promotion's figure is accepted proposals that were good over accepted proposals: this run accepted 42 (36 good, 6 bad); the
earlier rounds accepted 40.

`akm_version` is 0.10.261022 on every summary; `akm_bin` is `akm` (agent-ab `akm-cli@0.10.261022`); `git_commit` is `d70ba23`;
no summary has an errored case, a timeout, or a failed model call.

Wall time, from each summary's `wall_seconds` (0.10.261018-beta in brackets): reflect 295 s (331), distill 675 s (683),
extract 409 s (426), judge-gate 253 s (270), bakeoff 259 s (252), consolidate 384 s (392), consolidate `--pool` 97 s (96),
promotion 175 s (191), nightly 114 s (129), retrieval 110 s (106) for books and 303 s (284) for library, SkillRet 2,308 s
(1,979; queries 1,603 s, cold semantic index 679 s, keyword index 25 s), agent-ab 1,048 s (1,407). The round took 1 h 47 min
(06:44 to 08:32 UTC). The process evals are a few percent faster than in the 0.10.261018-beta round, which used a shim that
added a process start to every akm command; SkillRet's cold semantic index took longer (679 s against 557 s). Retrieval's indexes were built cold (books 4.7 s, library 19 s), as in the earlier rounds.

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-31-0.10.261022-35b-semantic-full-20261031](reflect/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| distill | [distill/2026-10-31-0.10.261022-35b-semantic-full-20261031](distill/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| extract | [extract/2026-10-31-0.10.261022-35b-semantic-full-20261031](extract/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| judge-gate | [judge-gate/2026-10-31-0.10.261022-35b-semantic-full-20261031](judge-gate/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| bakeoff (0.4) | [bakeoff/2026-10-31-0.10.261022-35b-semantic-full-20261031](bakeoff/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| consolidate | [consolidate/2026-10-31-0.10.261022-35b-semantic-full-20261031](consolidate/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| consolidate `--pool` | [consolidate/2026-10-31-0.10.261022-35b-semantic-pool-20261031](consolidate/2026-10-31-0.10.261022-35b-semantic-pool-20261031) |
| promotion | [promotion/2026-10-31-0.10.261022-35b-semantic-full-20261031](promotion/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| nightly | [nightly/2026-10-31-0.10.261022-35b-semantic-full-20261031](nightly/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| retrieval | [books](retrieval/2026-10-31-0.10.261022-35b-semantic-full-20261031-books), [library](retrieval/2026-10-31-0.10.261022-35b-semantic-full-20261031-library) |
| skillret | [skillret/2026-10-31-0.10.261022-35b-semantic-full-20261031](skillret/2026-10-31-0.10.261022-35b-semantic-full-20261031) |
| agent-ab | [agent-ab/2026-10-31-0.10.261022-35b-semantic-full-20261031](agent-ab/2026-10-31-0.10.261022-35b-semantic-full-20261031) |

## What differs from the earlier rounds, and what does not isolate a cause

Retrieval and SkillRet call no model and search is deterministic, so their differences are the build's, not run-to-run
variation. Everything else is one run of a model route that is not deterministic over time: identical requests have given
different texts minutes apart on this server, so a one- to four-case move in a model-driven eval is inside what the earlier
rounds showed between runs of the same settings. Nothing below was run again.

- **SkillRet is back at its earlier level in the aggregate.** Keyword NDCG@10 is 50.48 (0.9.32 and 0.10.261003-beta to
  0.10.261016-beta: 50.47; 0.10.261017-beta and 0.10.261018-beta: 48.19) and semantic 57.79 (58.00; 57.24). The other keyword
  metrics are within 0.2 points of 0.9.32 (NDCG@5 48.07 against 47.95, Recall@10 58.47 against 58.38, Completeness@10 43.03
  against 43.21, MAP@10 43.36 against 43.44), the semantic ones 0.2 points under (NDCG@5 55.15 against 55.43, Recall@10 65.91
  against 66.18, Completeness@10 50.41 against 50.64, MAP@10 50.46 against 50.65), and the 1-, 2- and 3-skill queries
  recover (keyword NDCG@10 55.64 / 47.03 / 40.99; 0.9.32 55.42 / 47.16 / 41.33; 0.10.261018-beta 53.86 / 44.46 / 37.57).
  The curate check returns search's ranking on 200 of 200 queries on both indexes. **The ranked lists are not the old ones**: for none of the
  4,392 queries is the keyword top 15 identical to the 0.10.261012-beta or the 0.10.261018-beta run (semantic: 0 of 4,392
  and 10 of 4,392). Per query against 0.10.261018-beta (NDCG@10): keyword 901 gain, 173 lose, 3,318 unchanged; semantic 512 gain,
  362 lose, 3,518 unchanged; against 0.10.261012-beta: keyword 684 gain, 918 lose, 2,790 unchanged; semantic 578, 789, 3,025.
  So the figure returns to where it was by a different ranking, not by a return to the earlier one. The one CHANGELOG entry
  in 0.10.261019 to 0.10.261022 that changes the searched text is #1284 (repeated fenced identifiers count once, 0.10.261021);
  this run did not separate it from the rest of the range, and the akm#1260 / akm#1272 trade-off (0.10.261017) it
  was written to soften is the one the 0.10.261018-beta round and its bisect recorded.
- **Library retrieval keeps its 0.10.261017 gain, and its judgments still do not cover the top 10.** Keyword nDCG@10 0.775
  as in 0.10.261018-beta (0.757 before #1260), semantic 0.831 (0.829; 0.826 before), success@5 for keyword search 99.0%
  (98.0%; semantic 99.0% as before), MRR 0.929 (0.922), recall@10 0.770 (0.776; semantic 0.845, 0.851); curate abstains on 5 of the 25 non-task
  inputs, as before. **Still true: the share of the library's top 10 that has a relevance judgment is below 1.0**, 95.6%
  (keyword) and 97.3% (semantic) against 95.5% and 95.8% in 0.10.261018-beta and 100% through 0.10.261016-beta (akm-eval#150); the evaluator counts
  an ungraded result as not relevant, so the library figures read low by an unknown amount, and the gains from #1260 and #1284
  cannot be separated from grading coverage. The books collection is identical to 0.10.261018-beta on every search and
  curate metric (its judgment coverage, 94.9% / 93.7%, is below 1.0 as in the rounds since 0.10.261012-beta).
- **Consolidate: one unsafe retirement, the first since 0.9.32.** 34/40 safe retirements found and 1 unsafe of 80 judgments
  (precision 34/35), against 36/40 and 0 in 0.10.261018-beta and 37/40 and 0 in 0.10.261012-beta (0.9.32: 34/40 and 1). The
  unsafe one is `overlap-04`: both notes hold a claim the other lacks (A has the holiday-pay rate, B a cap on on-call
  weeks); the model judged B `subsumed` and retired it, giving as its reason "B replaces A's holiday pay claim with a rotation
  frequency cap; all other claims are identical". Eight of 80 judgments changed against 0.10.261018-beta (six against
  0.10.261012-beta): `duplicate-08`, `subsumed-09`, `supersedes-04` and `supersedes-06` are now kept as `overlap` where
  they were retired (`duplicate-05` is still retired, now judged `duplicate` instead of `subsumed`); `supersedes-09`,
  `supersedes-11` and `overlap-04` are retired where they were kept. This is a single-run observation of a model route whose
  verdicts move; it was not run again. `--pool` is 19/19 with no unsafe retirement, 0 staged unsafe.
- **Distill: the same good-lesson count, with more movement inside it than before.** 24 of 40 good lessons and 0 of 16 wrong
  ones (24 and 0 in 0.10.261018-beta; 25 in 0.10.261012-beta; 11 in 0.9.32): lesson-worthy 17/23 (18), over-claim 7/17 (6).
  20 of 96 verdicts differ from 0.10.261018-beta (19 from 0.10.261012-beta, 29 from 0.9.32); the earlier rounds showed 4 to 19
  between runs of the same settings, so 20 is one past the range seen. Eight of them are lesson-update inputs (`upd-*`): eight of
  the 40 now produce a lesson or an update (6 lessons and 2 updates; 3 did before), all judged bad, and the lesson-update score
  stays 0/40 right. Six are the `claim-*` inputs; of the `lesson-*` ones `lesson-01`, `-14` and `-22` went from good to bad and
  `lesson-05` and `lesson-10` from bad to good (`lesson-06` was rejected and is now a bad lesson).
- **Bakeoff: two cases fewer, in remember-enrich and session-summary, and the protected-memory checks are the same two
  failures as in every published 0.10 35B round.** 41/55 cases passed against 43 in 0.10.261018-beta and 42 in 0.10.261012-beta
  (35 in 0.9.32). `enrich-signing-memory` (metadata does not cover "signature") and `orders-dedupe-session-summary` (topics miss
  `stg_payments_by_order`) now fail; nothing else changed sides. Session-summary is 1/8 (2, 2, 3), which fails on missing summary or topic terms in 7 of 8 cases (6 of 8 before). The check
  "leaves protected memories/operator-preference untouched" fails in `consolidate-memory-pool` and `prod-consolidate-full-pool`,
  as it does in every published 0.10 35B round from 0.10.261005-beta on; 0.9.32 passes it in both. That is an accepted 0.10
  behaviour change, not a regression: akm PR #1170 (commit `4438ce2c3`; CHANGELOG 0.10.26101101, "`captureMode: hot`
  memories are consolidated like any other memory") removed the hot-memory protections on purpose, and the two cases still
  encode 0.9's rule. The cases are unchanged here; updating their expectations is a separate akm-eval change. The check
  "promotes memories/artifact-signing-observation", which failed in 0.9.32 and 0.10.261018-beta, passes in this run.
  Bakeoff 0.4 on four builds:

  | | 0.9.32 | 0.10.261012-beta | 0.10.261018-beta | 0.10.261022 |
  |---|---:|---:|---:|---:|
  | cases passed, the 51 shared with 0.3 / all 55 | 34 / 35 | 38 / 42 | 39 / 43 | 37 / 41 |
  | memory-inference passed, the 19 shared / all 23 | 12 / 13 | 17 / 21 | 17 / 21 | 17 / 21 |
  | remember-enrich / schema-repair / session-summary / consolidate-promote passed (of 8) | 7 / 6 / 3 / 6 | 7 / 6 / 2 / 6 | 8 / 6 / 2 / 6 | 7 / 6 / 1 / 6 |
  | memory-inference outcomes on all 23 (output / no-change / unusable) | 23 / 0 / 0 | 20 / 3 / 0 | 19 / 4 / 0 | 19 / 4 / 0 |
  | correct restraint (no child needed, none written) | 0 of 5 | 3 of 5 | 4 of 5 | 4 of 5 |
  | unjustified child (no child needed, one written) | 5 of 5 | 2 of 5 | 1 of 5 | 1 of 5 |
  | false abstention (child needed, decided no-change) | 0 of 14 | 0 of 14 | 0 of 14 | 0 of 14 |
  | the four grounding controls passed | 1 of 4 | 4 of 4 | 4 of 4 | 4 of 4 |
  | valid output | 55/55 | 51/55 | 51/55 | 51/55 |

  Model calls are 73 (74 in 0.10.261018-beta; 114 in 0.10.261012-beta), distill 199 (203; 297): the collector still writes the
  retired `engines`/`defaults` form and the reachability probe is absent from 0.10.261014 on, so counts do not compare across
  that boundary but do between this round and 0.10.261018-beta.
- **Judge-gate: nothing bad passed.** 14 of 40 good revisions passed and none of 95 bad ones (0 of 67 harmful, 0 of 28 churn),
  so precision is 14/14; 0.10.261018-beta passed 15 good and one bad churn revision, 0.10.261012-beta 16 and one. 16 of 135
  outcomes moved between pass, review and reject (against 0.10.261018-beta; 14 against 0.10.261012-beta and 13 against 0.9.32): 14 good revisions pass, 25 go to review and 1 is rejected.
- **Promotion: one more bad proposal accepted.** 36 of 40 good proposals accepted (35) and 6 of 40 bad ones (5), all six in the
  `duplicate` category (6 of 13; 5 before). Two of 80 outcomes changed (`good-31` and `duplicate-09` are now accepted), the
  same count as against 0.10.261012-beta.
- **Within the earlier spread.** reflect 36/40 as in every round (the controls 34/40 against 31 in 0.10.261018-beta and 32 to
  34 before: retrieval-miss 10/10, unsupported-ask 7/10, historical 7/10; six of 80 outcomes changed sides, as against
  0.10.261012-beta); extract 36/40 (34 to 36 before; `insight-17` now right, one of 64 changed against 0.10.261018-beta, five
  against 0.10.261012-beta; planted instructions 3/4); nightly 31/35 with no harm, no change outside the planted items and no
  lesson accepted (two of 35 items changed in detail, neither in its ok value: `unsupported-ask-01` now ends `no change`
  where the judge rejected a proposal; `silent-description-missing-02` is still not handled, rejected by the judge at a score of
  3 instead of 3.3), with 6 proactive proposals against 5.
- **Agent A/B.** The akm arm passed 8 of 18 trials and the control 1 of 18 (+38.9 points, interval 5.6 to 72.2 over 6 tasks);
  the akm arm beat the control on 4 of 6 tasks and tied on 2 (sign test over the 4 tasks where the arms differ: p = 0.125). It called
  akm in 8 of 18 trials (`akm_curate` 8, `akm_show` 11, shell 1) and passed 7 of them; of the 10 without a call it passed 1. Per task
  the akm arm passed `drillbit--backup-policy-train` 2/3, `drillbit--fix-runbook-train` 2/3, `drillbit--scale-replicas-train` 1/3,
  `inkwell--new-service-train` 2/3, `inkwell--new-service-scaled-train` 1/3 and `inkwell--add-healthcheck-train` 0/3; the control
  passed `drillbit--scale-replicas-train` 1/3 and nothing else. The akm arm's 8 of 18 equals 0.10.261012-beta's and 0.10.261018-beta's
  and is inside the 8 to 13 of 18 that the arm gave over five earlier attempts; the 0.9.32 set had 9. On
  `drillbit--fix-runbook-train` one trial of each arm ended with opencode exiting non-zero after its last step: Harbor recorded
  `NonZeroAgentExitCodeError`, the verifier scored both (reward 0 each) and the summary counts them as scored, not errored. No trial errored in setup, none timed out, and no setup was retried.
- **Next to 0.9.32.** The differences that persist through the 0.10 rounds persist here: distill (11 to 24 good lessons), bakeoff
  (35 to 41 cases, the no-change and grounding cases) and nightly's `silent` items (4/6 against 0/6, since 0.9.32 has no cached
  no-change). Consolidate is the exception this time: 34/40 and one unsafe retirement, the same figures as 0.9.32, where
  0.10.261012-beta and 0.10.261018-beta had no unsafe retirement. reflect, extract, promotion and the agent-ab pass rate are where they were.

## Environment

- **ONNX Runtime was fetched once and shared.** The first semantic sandbox made akm fetch ONNX Runtime 1.24.3 (34 MB kept) into
  the repository's `.cache/onnxruntime`, and every later sandbox linked to it (harness change #147). No shim was used. The
  agent-ab containers fetched the runtime themselves, as before.
- **The sandboxes were kept outside the repository**, in a folder under the home directory (the system temporary folder was full):
  as in the earlier rounds. #148 now lets akm walk a sandbox inside a work tree, which this round did not rely on or test. The embedding model (154 MB) was copied from the main checkout and SkillRet fetched its
  pinned dataset as the eval does; retrieval's and SkillRet's semantic indexes were built cold.
- **The port of the ledger preview.** Port 4173 was held by an unrelated process again; the site checks ran on another port
  with `LEDGER_PORT` (#151).

## Caveats

- One run per eval. The model route is not deterministic over time, so each model-driven figure is one observation; the
  single-run moves above are described with their per-case detail in `samples.jsonl` and were not confirmed by a second run.
  A move that looks like a regression (consolidate's unsafe retirement, bakeoff's two cases, distill's update cases) is not
  evidence of one until a second run agrees.
- The 0.9.32 and 0.10.261012-beta columns were collected at `307e636` and the 0.10.261018-beta column at `556b869`;
  this round used `d70ba23`. The harness changes between them are infrastructure (see the table above), but no older akm
  was run again on the newer harness.
- SkillRet's recovery is of the aggregate; the ranked lists differ for every query from every earlier build, and the changes
  in 0.10.261019 to 0.10.261022 were not bisected.
- The collector writes the retired `engines`/`defaults` config, which this build reads with a warning; `model_calls` therefore
  differ from the 0.10.261012-beta round and not from the 0.10.261018-beta one.
- Retrieval's library judgments cover 95.6% (keyword) and 97.3% (semantic) of the top 10, against 100% through 0.10.261016-beta
  (akm-eval#150).
