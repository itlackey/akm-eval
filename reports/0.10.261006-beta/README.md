# akm 0.10.261006-beta, 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-17 with akm
0.10.261006-beta, `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic`
on every eval, full public corpora, temperature 0 and thinking off. The
collector is the shared driver of akm-eval 0.7 (commit `56b295c`). All 13
summaries are `complete`, with no errored case. Agent A/B ran 6 tasks, 3
attempts per arm, 4 trials at a time, with `akm-cli@0.10.261006-beta`; its
control arm timed out in 2 trials, which were still scored.

## Next to 0.10.261005-beta

The same model, settings and eval versions as the
[0.10.261005-beta runs](../0.10.261005-beta/). `scripts/compare/run` shows each
pair in full. Several settings differ (akm, the collector commit, the model's
route name), so no difference below isolates one cause, and one run per side
is one observation.

| eval | headline | 0.10.261005-beta | 0.10.261006-beta |
|---|---|---:|---:|
| reflect | correct fixes | 38/40 | 36/40 |
| distill | good lessons | 14/40 | 16/40 |
| extract | useful memories | 36/40 | 33/40 |
| judge-gate | approved lessons that were good | 14/14 | 15/15 |
| bakeoff | cases passed | 29/40 | 28/40 |
| consolidate | safe retirements found | 36/40 | 34/40 |
| consolidate `--pool` | safe retirements found | 16/19 | 18/19 |
| promotion | accepted proposals that were good | 36/41 | 35/42 |
| nightly | items handled right | 31/35 | 31/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 | 0.909 / 0.826 |
| skillret | keyword NDCG@10 | 50.47 | 50.47 |
| agent-ab | pass rate, akm / control | 12/18 / 1/18 | 9/18 / 1/18 |

Retrieval and SkillRet, which call no model, match the earlier runs exactly.
The agent-ab comparison is with the three-attempt serial run of 2026-10-15; the
akm arm called akm in 9 of 18 trials and passed 7 of those 9.

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](reflect/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| distill | [distill/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](distill/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| extract | [extract/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](extract/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| judge-gate | [judge-gate/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](judge-gate/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| bakeoff | [bakeoff/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](bakeoff/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| consolidate | [consolidate/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](consolidate/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| consolidate `--pool` | [consolidate/2026-10-17-0.10.261006-beta-35b-semantic-pool-20261017](consolidate/2026-10-17-0.10.261006-beta-35b-semantic-pool-20261017) |
| promotion | [promotion/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](promotion/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| nightly | [nightly/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](nightly/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| retrieval | [books](retrieval/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017-books), [library](retrieval/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017-library) |
| skillret | [skillret/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](skillret/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
| agent-ab | [agent-ab/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017](agent-ab/2026-10-17-0.10.261006-beta-35b-semantic-full-20261017) |
