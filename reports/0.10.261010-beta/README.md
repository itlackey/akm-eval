# akm 0.10.261010-beta, 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-21 with akm
0.10.261010-beta, `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic`
on every eval, full public corpora, temperature 0 and thinking off, one eval at
a time. The settings are those of the [0.10.261009-beta round](../0.10.261009-beta/):
default concurrency (1; judge-gate 2) and default timeouts for the process
evals, and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, with
`akm-cli@0.10.261010-beta` and the plugin pinned at 0.10.261002-beta. The
model's context and output limits (32768 and 4096) were set for agent-ab, and
its missing-limits warning did not fire. The collector is the shared driver of
akm-eval at commit `285fc4a`. All 13 summaries, and the extra bakeoff run
below, are `complete` with no errored case and no failed model call.

Bakeoff is version 0.3 since akm-eval #136: it scores memory inference's
explicit no-change decision and has 11 more memory-inference cases (51 cases,
not 40). Its totals are not comparable with the 0.2 bakeoff of the earlier
rounds, so the 0.10.261009-beta bakeoff was **collected again with 0.3**, with
the same akm in a temporary npm prefix (`akm-cli@0.10.261009-beta`, through
`AKM_BIN`, so its summary's `akm_bin` is that temporary path), run one eval at
a time before the rest of this round. It is published beside the 0.2 run in
[`../0.10.261009-beta/bakeoff/`](../0.10.261009-beta/bakeoff/); the 0.2 run is
unchanged.

## Next to 0.10.261009-beta

`scripts/compare/run` shows each pair in full. The 0.9.32 column repeats the
[2026-10-15 runs](../0.9.32/) already used in the 0.10.261009-beta report, for
the evals whose version has not changed since (agent-ab there was one attempt
per arm, 6 trials a side). Several settings differ (akm, collector commit,
date), so no difference below isolates one cause, and one run per side is one
observation.

| eval | headline | 0.9.32 | 0.10.261009-beta | 0.10.261010-beta |
|---|---|---:|---:|---:|
| reflect | correct fixes | 38/40 | 36/40 | 36/40 |
| distill | good lessons | 16/40 | 14/40 | 14/40 |
| extract | useful memories | 35/40 | 35/40 | 36/40 |
| judge-gate | approved lessons that were good | 15/16 | 14/14 | 17/17 |
| bakeoff 0.3 | cases passed (51) | not run on 0.3 | 31/51 | 36/51 |
| consolidate | safe retirements found | 38/40 | 39/40 | 36/40 |
| consolidate `--pool` | safe retirements found | 15/19 | 17/19 | 17/19 |
| promotion | accepted proposals that were good | 35/39 | 34/41 | 34/39 |
| nightly | items handled right | 27/35 | 29/35 | 29/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 | 0.911 / 0.826 | 0.911 / 0.826 |
| skillret | keyword NDCG@10 | 50.47 | 50.47 | 50.47 |
| agent-ab | pass rate, akm / control | 4/6 / 1/6 | 10/18 / 0/18 | 12/18 / 2/18 |

Wall time of this round, from each summary's `wall_seconds`: reflect 281 s,
distill 661 s, extract 419 s, judge-gate 270 s, bakeoff 0.3 236 s (234 s for
the 0.10.261009-beta run), consolidate 369 s, consolidate `--pool` 91 s,
promotion 187 s, nightly 119 s, retrieval 108 s (books) and 279 s (library),
SkillRet 1,951 s (queries 1,401 s, cold semantic index 528 s, keyword index
20 s), agent-ab 1,090 s.

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](reflect/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| distill | [distill/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](distill/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| extract | [extract/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](extract/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| judge-gate | [judge-gate/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](judge-gate/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| bakeoff (0.3) | [bakeoff/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](bakeoff/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| consolidate | [consolidate/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](consolidate/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| consolidate `--pool` | [consolidate/2026-10-21-0.10.261010-beta-35b-semantic-pool-20261021](consolidate/2026-10-21-0.10.261010-beta-35b-semantic-pool-20261021) |
| promotion | [promotion/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](promotion/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| nightly | [nightly/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](nightly/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| retrieval | [books](retrieval/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021-books), [library](retrieval/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021-library) |
| skillret | [skillret/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](skillret/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| agent-ab | [agent-ab/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021](agent-ab/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021) |
| bakeoff 0.3 on 0.10.261009-beta | [bakeoff/2026-10-21-0.10.261009-beta-35b-semantic-full-bakeoff03-20261021](../0.10.261009-beta/bakeoff/2026-10-21-0.10.261009-beta-35b-semantic-full-bakeoff03-20261021) |

## Bakeoff 0.3, on both betas

The same 51 public cases (19 memory-inference, 8 each of remember-enrich,
schema-repair, session-summary and consolidate-promote) on akm 0.10.261009-beta
and 0.10.261010-beta; no errored case, no failed model call (102 calls each).

| | 0.10.261009-beta | 0.10.261010-beta |
|---|---:|---:|
| cases passed | 31/51 | 36/51 |
| memory-inference passed | 11/19 | 15/19 |
| remember-enrich / schema-repair / session-summary / consolidate-promote passed | 5 / 7 / 2 / 6 of 8 | 7 / 7 / 1 / 6 of 8 |
| memory-inference outcomes (output / no-change / unusable) | 19 / 0 / 0 | 16 / 3 / 0 |

The no-change outcomes, reported apart from the totals (5 of the 19
memory-inference notes need no child, 14 do):

| outcome | 0.10.261009-beta | 0.10.261010-beta |
|---|---:|---:|
| correct restraint (no child needed, none written) | 0 of 5 | 3 of 5 |
| unjustified child (no child needed, one written) | 5 of 5 | 2 of 5 (`short-log-directory`, `short-format-command`) |
| false abstention (child needed, akm decided no-change) | 0 of 14 | 0 of 14 |

- 0.10.261009-beta never decides no-change; it writes a child for each of the
  five notes. 0.10.261010-beta decides no-change on three (`tool-tally`,
  `checkpoint-progress`, `context-resume` noise) and still writes children for
  the two short notes, the same two the bakeoff 0.3 pilot found
  (`reports/no-change-132-2026-10-21`).
- Of the 14 notes that need a child, 11 passed before and 12 now. The failures
  that remain are one lost explicit date and one lost `size_limit`.
- Most of the memory-inference gain is therefore the new no-change decision
  (akm #1208/#1218), which the 0.3 scorer can now see. The other four processes
  are untouched by that change and moved by one or two cases (remember-enrich
  +2, session-summary -1), within what one run per side cannot separate from
  model variation. `valid_output` is 51/51 against 48/51 because a no-change is
  a decision and no document: it stays in the denominator and out of the
  numerator.

## What differs, and what does not isolate a cause

- **Versions.** Collector and scorer versions of every other eval are the same
  as in the 0.10.261009-beta round; `assets_sha256` is the same for those.
  Since that round akm-eval changed the redaction of `human:<login>` to
  `human:<user>` in stored note text, SkillRet's `wall_seconds`, and
  agent-ab's missing-limits warning (#134); none changes what a run measures.
  No login name appears in the new files (actor ids read `human:<user>`).
- **Process evals move by zero to three cases.** distill, reflect, nightly and
  consolidate `--pool` have the same headline as 0.10.261009-beta; extract +1
  (36/40), consolidate -3 (39 to 36 of 40), judge-gate 14/14 to 17/17,
  promotion 34/41 to 34/39 (the same 34 good accepted, two fewer accepted that
  were bad). Case by case, reflect, extract and consolidate each changed
  the outcome of five samples, in both directions; nightly changed none. This
  is the size of movement the earlier rounds showed between runs of the same
  settings, so one run per side cannot say that any of these moves belongs to
  akm. The nightly run's per-kind counts are identical to 0.10.261009-beta, so
  the explicit cached no-change (#1208/#1218) shows no effect there; nightly
  has no case built to expose it.
- **Retrieval.** Every ranking metric of books and library is identical to
  0.10.261009-beta, search and curate alike, on both collections. The one
  change is curate's abstention on the library's 25 non-task inputs: 5 now
  (20%), 1 before (4%), in keyword and semantic curate. That is what #1213
  (curate abstains on 53 exact conversational phrases) predicts; search never
  abstains and the task queries were not affected. The books movement
  noted last round (judged coverage of the top 10 94.3%) is unchanged, so it
  appeared between 0.10.261006-beta and 0.10.261009-beta, not with this beta.
  Both runs built their indexes cold; library took 279 s against 341 s, a
  single observation on a shared host.
- **SkillRet.** Every keyword and semantic metric is identical to the earlier
  runs (keyword NDCG@10 0.5047, semantic 0.5800), and curate again returned
  search's ranking on the 200 checked queries. Query time 1,401 s against
  1,438 s and cold semantic index 528 s against 623 s are single observations
  on a shared host.
- **Agent A/B.** The akm arm passed 12 of 18 trials (10 before) and the control
  2 of 18 (0 before); the difference is +55.6 points (interval 22.2 to 88.9
  over 6 tasks), the same as last round. The akm arm called akm in 8 of 18
  trials and passed all 8; of the 10 without a call it passed 4. The akm arm
  beat the control on 5 of 6 tasks and tied on 1 (sign test over the 5 tasks
  where the arms differ: p = 0.0625). No trial errored or timed out. The
  akm-arm result moves by two trials, and the control by two, which three
  attempts of six tasks cannot distinguish from the trial-to-trial variation
  inside tasks (`flips` in the run output). The plugin is the same
  (0.10.261002-beta) in every round.
- **What one run per side can and cannot show.** It can show an effect that is
  deterministic given akm and the cases: the retrieval and SkillRet rankings,
  curate's abstention count, and the bakeoff 0.3 no-change outcomes (three
  notes decided, none under 0.10.261009-beta). It cannot separate a one- to
  three-case move in a model-driven eval from run-to-run variation of the lab
  route at temperature 0, and it cannot attribute a move to one of the akm
  changes of this beta (curate abstention #1213, cached no-change #1208/#1218,
  workflow fixes #1215/#1216, UI #1217) when several land together.
