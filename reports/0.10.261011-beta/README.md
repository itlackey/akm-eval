# akm 0.10.261011-beta, 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-22 with akm 0.10.261011-beta,
`fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, temperature 0 and
thinking off, one eval at a time. A second round with **akm 0.9.32**, the same settings and the same day, is the
[new 0.9.32 set](../0.9.32/) and the first column below; it replaced the 2026-10-15 0.9.32 runs, so there is one 0.9.x set
per model. The settings are those of the [0.10.261010-beta round](../0.10.261010-beta/): default concurrency (1; judge-gate 2)
and default timeouts for the process evals, and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, with
`akm-cli@0.10.261011-beta` (0.9.32: `akm-cli@0.9.32`) and the plugin pinned at 0.10.261002-beta. The model's context and
output limits (32768 and 4096) were set for agent-ab, and its missing-limits warning did not fire. The collector is the
shared driver of akm-eval at commit `307e636` (after #138: bakeoff 0.4); the summaries of this round read
`307e636-dirty` because the checkout's tracked report files were being replaced while it ran, and nothing outside `reports/`
differed from `307e636`. All 13 summaries below are `complete` with no errored case and no failed model call.

## What changed in akm since 0.10.261010-beta

| PR | change |
|---|---|
| #1221 | search and curate use a derived memory's metadata as a fallback, so a parent's authored warning no longer vanishes behind a more confident derived child |
| #1222 | memory inference sends selected source context with the body and copies the parent's normalized scope deterministically (`memory-inference-v4` cache key) |
| #1223 | extraction previews are no longer counted as persisted proposals; `candidates_queued` follows actual effects |
| #1225 | derived memories carry generation provenance (`generated: {by, at}`) and the parent's source dates, evidence and provenance |
| #1229 | date-valued frontmatter keys lose `_at` (`observed_at` is now `observed`; sessions get `started`/`ended`), and no mtime observation hint is sent |
| #1226 | extraction does not re-propose accepted candidates and does not retry deterministic rejections |

#1223 and #1226 change accounting and retries that no eval here measures; #1221 matters only where a derived memory exists,
and the public retrieval collections have none.

## Next to 0.9.32 and 0.10.261010-beta

`scripts/compare/run` shows each pair in full. The 0.9.32 column is the [new set](../0.9.32/) (2026-10-22, same eval versions as
this round). The 0.10.261010-beta column is its [published round](../0.10.261010-beta/) (2026-10-21), collected with bakeoff
0.3, so bakeoff is compared on the 51 cases the two bakeoff versions share. Several settings differ (akm, date, lab route), so no
difference below isolates one cause, and one run per side is one observation.

| eval | headline | 0.9.32 (new set) | 0.10.261010-beta | 0.10.261011-beta |
|---|---|---:|---:|---:|
| reflect | correct fixes | 36/40 | 36/40 | 36/40 |
| distill | good lessons | 11/40 | 14/40 | 8/40 |
| extract | useful memories | 35/40 | 36/40 | 35/40 |
| judge-gate | approved lessons that were good | 16/17 | 17/17 | 14/14 |
| bakeoff, the 51 cases shared with 0.3 | cases passed | 34/51 | 36/51 | 39/51 |
| bakeoff 0.4, all 55 | cases passed | 35/55 | not run on 0.4 | 43/55 |
| consolidate | safe retirements found | 34/40 | 36/40 | 38/40 |
| consolidate `--pool` | safe retirements found | 18/19 | 17/19 | 18/19 |
| promotion | accepted proposals that were good | 34/40 | 34/39 | 34/39 |
| nightly | items handled right | 28/35 | 29/35 | 29/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 | 0.911 / 0.826 | 0.911 / 0.826 |
| skillret | keyword NDCG@10 | 50.47 | 50.47 | 50.47 |
| agent-ab | pass rate, akm / control | 9/18 / 1/18 | 12/18 / 2/18 | 11/18 / 2/18 |

Wall time of this round, from each summary's `wall_seconds` (0.9.32 round in brackets): reflect 284 s (291), distill 667 s
(487), extract 427 s (437), judge-gate 271 s (270), bakeoff 243 s (239), consolidate 373 s (376), consolidate `--pool` 90 s
(92), promotion 189 s (188), nightly 122 s (102), retrieval 111 s (106) for books and 301 s (288) for library, SkillRet 2,217 s
(2,128; queries 1,594 s, cold semantic index 600 s, keyword index 22 s), agent-ab 1,340 s (1,490).

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](reflect/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| distill | [distill/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](distill/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| extract | [extract/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](extract/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| judge-gate | [judge-gate/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](judge-gate/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| bakeoff (0.4) | [bakeoff/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](bakeoff/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| consolidate | [consolidate/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](consolidate/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| consolidate `--pool` | [consolidate/2026-10-22-0.10.261011-beta-35b-semantic-pool-20261022](consolidate/2026-10-22-0.10.261011-beta-35b-semantic-pool-20261022) |
| promotion | [promotion/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](promotion/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| nightly | [nightly/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](nightly/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| retrieval | [books](retrieval/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022-books), [library](retrieval/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022-library) |
| skillret | [skillret/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](skillret/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| agent-ab | [agent-ab/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](agent-ab/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) |
| bakeoff 0.3 run of 0.10.261010-beta, scored again under the 0.4 scorer | [bakeoff/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021-rescored](../0.10.261010-beta/bakeoff/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021-rescored) |

## Reruns and errors

Agent-ab was run four times for this beta; the fourth is published. The first three each had one or two trials fail in
the trial's own setup, before the agent started: Harbor's installer runs `apt-get update && apt-get install -y curl` in each
Ubuntu 24.04 container, and `archive.ubuntu.com` served a `noble-updates` `Packages.gz` of the wrong size ("File has
unexpected size (1732808 != 1732807). Mirror sync in progress?") on one backend, so `apt-get` exited 100. A trial that fails
this way has no score and is counted as errored (`n_errored` 1, 1 and 2), which left an arm with 17 or 16 scored trials (the
third attempt also had one control trial that opencode ended on a gateway 500, "Context size has been exceeded", scored 0).
The runs of 0.9.32 had none. A probe of `apt-get update` in a plain container after the third run was clean three times,
and the fourth run had no setup failure. The three superseded runs are not published; their results, for the record:

| attempt | wall time | akm arm | control | setup failures |
|---|---:|---:|---:|---|
| 1 | 1,642 s | 9/17 | 1/18 | 1 (akm arm) |
| 2 | 2,517 s | 9/18 | 0/17 | 1 (control) |
| 3 | 2,069 s | 13/18 | 1/16 | 2 (control) |
| 4, published | 1,340 s | 11/18 | 2/18 | 0 |

The spread of the akm arm over the four attempts (9 to 13 of 18) is the run-to-run variation of this eval, and is larger than
every difference between the columns above. In the published run one control trial (`drillbit--fix-runbook-train`) ended
with opencode exiting non-zero after its last step: Harbor recorded `NonZeroAgentExitCodeError`, the verifier scored it 0
and the summary counts it as scored, not errored (as for one control trial of the 0.9.32 run). No trial errored or timed out.
The other 12 summaries ran once, with no rerun.

## Bakeoff 0.4, on three akm builds

Bakeoff 0.4 has 55 cases: the 51 of 0.3 and four grounding controls (nested and flat parent scope, an observation date held
only in metadata, and a file `updated` date without an observation date). The 0.10.261010-beta run was collected with 0.3, so
its 51 cases are compared on their own; its stored run scored again with the 0.4 scorer
(`scripts/rescore/run`, folder above) gives the same 36/51 with no row differing. The four controls did not exist for it.

| | 0.9.32 | 0.10.261010-beta | 0.10.261011-beta |
|---|---:|---:|---:|
| cases passed, the 51 shared / all 55 | 34 / 35 | 36 / n/a | 39 / 43 |
| memory-inference passed, the 19 shared | 12 of 19 | 15 of 19 | 15 of 19 |
| remember-enrich / schema-repair / session-summary / consolidate-promote passed (shared) | 7 / 6 / 3 / 6 of 8 | 7 / 7 / 1 / 6 of 8 | 8 / 7 / 3 / 6 of 8 |
| memory-inference outcomes on the 19 (output / no-change / unusable) | 19 / 0 / 0 | 16 / 3 / 0 | 16 / 3 / 0 |
| correct restraint (no child needed, none written) | 0 of 5 | 3 of 5 | 3 of 5 |
| unjustified child (no child needed, one written) | 5 of 5 | 2 of 5 | 2 of 5 |
| false abstention (child needed, decided no-change) | 0 of 14 | 0 of 14 | 0 of 14 |
| the four grounding controls passed | 1 of 4 | not run | 4 of 4 |

- As expected, 0.9.32 cannot pass what bakeoff 0.4 added: it has no `memoryInference.noChange` counter, so it never decides
  no-change (it writes a child for each of the five notes that need none), and it copies neither the parent's scope nor its
  observation date (`infer-scoped-incident` and `infer-flat-scoped-request` fail `preserves scope`,
  `infer-metadata-observation-date` fails `carries observation date`). Reported as measured, not as a regression.
- 0.10.261011-beta passes all four grounding controls. The saved children show why: the scope arrives as flat `scope_*`
  fields (#1222), the date as `observed: 2026-06-12` (#1229; the checks accept `observed` or `observed_at`, so the saved
  frontmatter is what shows the new key) and a `generated: {by: akm/0.10.261011-beta, at: ...}` block (#1225). The control
  with only a file `updated` date passes on both builds, since no build invents an observation date for it.
- The 19 shared memory-inference cases are identical to 0.10.261010-beta case by case: the same three no-change decisions and
  the same four failures (`infer-checkpoint-memory` loses its explicit date, `infer-regex-size-limit` its `size_limit`, and
  the two short notes still get a child). The +3 on the 51 shared cases comes from remember-enrich (+1, `metadata covers
  pt-br`) and session-summary (+2), the processes this beta did not touch; one run per side cannot separate that from model
  variation.

## What differs, and what does not isolate a cause

- **Retrieval and SkillRet are the same as 0.10.261010-beta.** Library: every search and curate metric is identical to
  0.10.261010-beta and to 0.9.32 (semantic nDCG@10 0.826, keyword 0.757), and curate abstains on 5 of the library's 25 non-task inputs (1 of
  25 on 0.9.32), as it did last round (#1213). Books: semantic nDCG@10 0.9108 against 0.9113 (0.9089 on 0.9.32); the share of
  the top 10 with a relevance judgment is 93.7% against 94.3% (100% on 0.9.32). SkillRet: every keyword and semantic
  metric is identical in all three columns (keyword NDCG@10 0.5047, semantic 0.5800), and curate returned search's ranking
  on the 200 checked queries. #1221 changes search only for a derived memory, and the public collections have none, so no
  effect was expected.
- **Process evals move by zero to three cases from 0.10.261010-beta, except distill.** reflect (36/40) and promotion (34
  accepted good) did not move; extract is 35/40 (36); judge-gate approved 14 good lessons and no bad one (17 of 17 last
  round); consolidate found 38 of 40 safe retirements with none unsafe (36); `--pool` 18 of 19 (17); nightly 29/35 with
  the same per-kind counts but one `lesson_good` miss traded for a `no_lesson` miss. Case by case, reflect changed 4 outcomes
  of 80, extract 5 of 64, consolidate 6 of 80 and promotion 4 of 80. That is the size of movement the earlier rounds showed
  between runs of the same settings; for 0.9.32 itself the 2026-10-15 run and the new one differ by 5 on distill (16 and 11 of
  40) and 4 on consolidate (38 and 34 of 40).
- **Distill moved from 14/40 to 8/40 good lessons in the published rounds, and repeats show that is not the build.** In the
  published pair 19 of 96 verdicts changed (7 lesson-worthy memories went good to bad, five `lesson-update` cases now got an
  output scored bad, and one `restates-asset` control got a lesson). None of the six changes above touches distill's lesson
  generation, so two more runs of each build, alternating one at a time on 2026-10-22 with the same settings, were made to
  check (0.10.261010-beta from `akm-cli@0.10.261010-beta` in a temporary npm prefix through `AKM_BIN`, 0.10.261011-beta as
  installed; all `complete`, no errored case, no failed model call):

  | run | 0.10.261010-beta good / wrong | 0.10.261011-beta good / wrong |
  |---|---:|---:|
  | 1, the published round | 14 / 0 | 8 / 1 |
  | 2, repeat | 14 / 0 | 14 / 0 |
  | 3, repeat | 14 / 0 | 14 / 0 |
  | mean (good) | 14.0 | 12.0 |

  Good lessons are of 40, wrong lessons of 16 controls. The mean difference (2.0) is smaller than the spread of the 0.10.261011-beta
  runs alone (8 to 14, sd 3.5), so it is not outside run-to-run spread. More tellingly, all four repeat runs (both builds,
  runs 2 and 3) agree on every one of the 96 verdicts: at temperature 0 the two builds gave identical distill results, as
  expected from unchanged lesson generation. The two published runs are the ones that differ: each disagrees with the repeats
  on 16 (0.10.261010-beta) or 23 (0.10.261011-beta) verdicts and with each other on 19. Run 1 of 0.10.261010-beta lands on
  14 good by coincidence of count, not of cases. The cause of the first-round difference was not found (the lab route, or
  state of the cold first run); the published single rounds stay the ledger entries, and the repeats are not published as runs.
  The same 0.9.32 gave 16 on 2026-10-15 and 11 in the new set, which is the same kind of spread.
- **Nightly's `silent` items** (the uncached no-change path) are 4/6 on both betas and 0/6 on 0.9.32, which has no cached
  no-change: the gain predates this beta (#1208/#1218).
- **Agent A/B.** The akm arm passed 11 of 18 trials and the control 2 of 18: +50.0 points (interval 16.7 to 83.3 over 6
  tasks), against +55.6 for 0.10.261010-beta and +44.4 for 0.9.32. The akm arm beat the control on 5 of 6 tasks and tied on 1
  (sign test over the 5 tasks where the arms differ: p = 0.0625, in all three columns). It called akm in 9 of 18 trials and
  passed all 9; of the 9 without a call it passed 2. Calls were made in 4 of 18 trials on 0.9.32, 8 of 18 on
  0.10.261010-beta and 9 of 18 here; the pass-rate differences between the three columns are inside the 9 to 13 spread of the
  four attempts above.
- **What one run per side can and cannot show.** It can show an effect that is deterministic given akm and the cases: the
  four grounding controls (0 to 3 of 4 pass on 0.9.32, 4 of 4 here), the retrieval and SkillRet rankings, curate's abstention
  count, and the no-change outcomes. It cannot separate a one- to three-case move in a model-driven eval from run-to-run
  variation of the lab route at temperature 0, and it cannot attribute a move to one of the six akm changes above when they
  land together.
