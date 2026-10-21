# akm 0.10.261009-beta, 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-21 with akm
0.10.261009-beta, `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic`
on every eval, full public corpora, temperature 0 and thinking off, one eval at
a time. The settings are those of the [0.10.261006-beta round](../0.10.261006-beta/):
default concurrency (1; judge-gate 2) and default timeouts for the process evals,
and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, with
`akm-cli@0.10.261009-beta` and the plugin pinned at 0.10.261002-beta. The
collector is the shared driver of akm-eval at commit `416cd75`. All 13
summaries are `complete`, with no errored case.

## Next to 0.9.32 and 0.10.261006-beta

`scripts/compare/run` shows each pair in full. The 0.9.32 runs are those of
[2026-10-15](../0.9.32/) (the agent-ab run there was one attempt per arm,
6 trials a side). Several settings differ between the three columns (akm, the
collector commit, dates, the model's route name), so no difference below
isolates one cause, and one run per side is one observation.

| eval | headline | 0.9.32 | 0.10.261006-beta | 0.10.261009-beta |
|---|---|---:|---:|---:|
| reflect | correct fixes | 38/40 | 36/40 | 36/40 |
| distill | good lessons | 16/40 | 16/40 | 14/40 |
| extract | useful memories | 35/40 | 33/40 | 35/40 |
| judge-gate | approved lessons that were good | 15/16 | 15/15 | 14/14 |
| bakeoff | cases passed | 27/40 | 28/40 | 26/40 |
| consolidate | safe retirements found | 38/40 | 34/40 | 39/40 |
| consolidate `--pool` | safe retirements found | 15/19 | 18/19 | 17/19 |
| promotion | accepted proposals that were good | 35/39 | 35/42 | 34/41 |
| nightly | items handled right | 27/35 | 31/35 | 29/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 | 0.909 / 0.826 | 0.911 / 0.826 |
| skillret | keyword NDCG@10 | 50.47 | 50.47 | 50.47 |
| agent-ab | pass rate, akm / control | 4/6 / 1/6 | 9/18 / 1/18 | 10/18 / 0/18 |

Wall time of this round, from each summary's `wall_seconds`: reflect 292 s,
distill 650 s, extract 410 s, judge-gate 275 s, bakeoff 184 s, consolidate
380 s, consolidate `--pool` 89 s, promotion 189 s, nightly 119 s, retrieval
108 s (books) and 341 s (library), agent-ab 1,043 s. SkillRet records no wall
time; its query phase took 1,438 s, the cold semantic index 623 s and the
keyword index 21 s (2,086 s measured outside the run).

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](reflect/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| distill | [distill/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](distill/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| extract | [extract/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](extract/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| judge-gate | [judge-gate/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](judge-gate/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| bakeoff | [bakeoff/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](bakeoff/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| consolidate | [consolidate/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](consolidate/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| consolidate `--pool` | [consolidate/2026-10-21-0.10.261009-beta-35b-semantic-pool-20261021](consolidate/2026-10-21-0.10.261009-beta-35b-semantic-pool-20261021) |
| promotion | [promotion/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](promotion/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| nightly | [nightly/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](nightly/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| retrieval | [books](retrieval/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021-books), [library](retrieval/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021-library) |
| skillret | [skillret/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](skillret/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |
| agent-ab | [agent-ab/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021](agent-ab/2026-10-21-0.10.261009-beta-35b-semantic-full-20261021) |

## What differs, and what does not isolate a cause

- **Eval and collector versions.** Every eval keeps the version it had in the
  0.10.261006-beta round except retrieval, whose collector went from 0.2 to 0.3
  (the `searchArgs` change, akm-eval #128); the ledger groups the new retrieval
  runs apart from the 0.2 ones. The shared driver also changed: endpoints are
  now redacted in every summary field, with an `endpoint_sha256` (#131), and the
  smoke tests changed (#126). Cases, labels and `assets_sha256` are the same as
  in the 0.10.261006-beta round for every eval. The only change in what a run
  measures is therefore akm.
- **Process evals move by one to five cases, in both directions.** Compared
  with 0.10.261006-beta: consolidate 34 to 39 of 40 (no unsafe retirement, down
  from 2; the cases subsumed-03, -10, -12, -14 and supersedes-13 now have a safe
  retirement recorded), extract +2, nightly -2, distill -2, bakeoff -2, promotion
  -1, judge-gate -1, consolidate `--pool` -1, reflect unchanged. At temperature 0
  the lab route still varies from run to run, and each eval was run once, so
  these moves are inside the spread the earlier rounds showed (0.10.261005-beta
  to 0.10.261006-beta moved the same evals by 0 to 3 cases). Case by case, reflect,
  extract, bakeoff and nightly each changed the outcome of four samples, in both
  directions. akm changes since 0.10.261006-beta (eligibility before limits #1206,
  extraction evidence #1205, memory scope preservation #1197) are candidates
  for the extract and consolidate movement, but nothing here separates them
  from run noise.
- **Retrieval, books.** Semantic nDCG@10 is 0.9114 (0.9089 in 0.10.261006-beta,
  0.9088 in 0.9.32); the share of the top 10 that has a relevance judgment fell
  from 100% to 94.3%, and the share with a banned note above a relevant one
  fell from 23.5% to 15.7%. The keyword control moved the same way (0.8275 to
  0.8357). Search and curate now default to `--belief current` (#1207, #1199),
  and eligibility is applied before the limit (#1206), so different notes can
  reach the top 10; that is the likely cause, but this run cannot show it, since
  the belief setting was not varied and the unjudged results were not read
  individually. Treat the books movement as a change in what is returned, not
  yet as a quality gain. Library is identical to 0.10.261006-beta and 0.9.32 in
  every ranking metric.
- **SkillRet.** Every keyword and semantic metric is identical to the earlier
  runs (keyword NDCG@10 0.5047, semantic 0.5800), and curate again returned
  search's ranking on the 200 checked queries. A skills-only corpus is
  unaffected by the belief default.
- **Index timing.** The 0.10.261006-beta retrieval and SkillRet runs reused a
  warm semantic index (0.2 s to 0.3 s); this round used a new worktree and built
  every index cold (books 5 s, library 17 s, SkillRet 623 s), like the 0.9.32
  runs. Retrieval wall time (108 s and 341 s, against 94 s and 253 s) and the
  query-time means are not comparable with 0.10.261006-beta for that reason, and
  single runs on a shared host do not show a speed change.
- **Agent A/B.** The akm arm passed 10 of 18 trials (9 in 0.10.261006-beta); the
  control passed none (1 before). The akm arm called akm in 6 of 18 trials and
  passed all 6; of the 12 trials without a call it passed 4. No control trial
  timed out (2 did in 0.10.261006-beta), and the run took 1,043 s against 1,340 s.
  The difference from the control is +55.6 points, interval 16.7 to 88.9,
  over 6 tasks; with 3 attempts of 6 tasks that interval is wide, and the sign
  test over the 4 tasks where the arms differ gives p = 0.125. The 0.9.32 column
  is a single attempt per arm and is not comparable in size. A first run of this
  round passed 9 of 18 trials with akm and 2 of 18 without; its OpenCode config
  lacked the model's context and output limits (32768 and 4096, which the
  0.10.261006-beta run had), because the worktree had no model-limits file. It
  was discarded and rerun with the limits; the published run is the rerun.

Retrieval and SkillRet make no model calls. Everything else used the same lab
route as the 0.10.261006-beta round; the gateway reports the model it served in
each summary.
