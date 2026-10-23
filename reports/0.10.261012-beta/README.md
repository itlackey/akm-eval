# akm 0.10.261012-beta, 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-23 with akm 0.10.261012-beta,
`fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, temperature 0 and
thinking off, one eval at a time. The settings and the collector are those of the [0.10.261011-beta round](../0.10.261011-beta/)
(akm-eval `307e636`; agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, `akm-cli@0.10.261012-beta`, plugin
0.10.261002-beta). All 13 summaries are `complete`, with no errored case and no failed model call.

## What changed in akm since 0.10.261011-beta

| PR | change |
|---|---|
| #1241 | distill: the writer counts a tested result with its conditions and limits as a lesson, answers NONE for dated status, unconfirmed one-run reports and recaps a related asset already states, and writes shorter lessons in its own words; the lesson judge's REUSABLE criterion matches (update judging unchanged) |
| #1234 | the signal guard is installed before a process-group child is spawned |
| #1232 | CI only: the upgrade rehearsal retries transient npm network errors |

## Next to 0.10.261011-beta

One run per side; `scripts/compare/run` shows each pair in full.

| eval | headline | 0.10.261011-beta | 0.10.261012-beta |
|---|---|---:|---:|
| reflect | correct fixes | 36/40 | 36/40 |
| distill | good lessons (wrong lessons) | 8/40 (1/16); repeats 14/40 (0/16) | **25/40 (0/16)** |
| extract | useful memories | 35/40 | 34/40 |
| judge-gate | approved revisions that were good | 14/14 | 16/17 |
| bakeoff 0.4 | cases passed | 43/55 | 42/55 |
| consolidate | safe retirements found (unsafe) | 38/40 (0) | 37/40 (0) |
| consolidate `--pool` | safe retirements found | 18/19 | 19/19 |
| promotion | accepted proposals that were good | 34/39 | 35/40 |
| nightly | items handled right | 29/35 | 31/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.911 / 0.826 | 0.911 / 0.826 |
| skillret | keyword NDCG@10 | 50.47 | 50.47 |
| agent-ab | pass rate, akm / control | 11/18 / 2/18 | 8/18 / 1/18 |

- **Distill is the change this beta made, and it shows.** 25 of 40 good lessons with no wrong lesson, against 14 (the
  0.10.261011-beta repeats; its published run gave 8) — lesson-worthy 20/23 and over-claim 5/17. Lesson updates stay at 0/40,
  as #1241 left the update path alone. #1241's own measurements on this suite gave 26 and 24.
- **judge-gate** passed one bad revision of 95, a churn case (0 of 67 harmful); 0.10.261011-beta passed none. #1241 did not
  touch reflect's judge, which is what judge-gate exercises.
- **agent-ab** 8/18 is below the 9 to 13 of 18 the akm arm gave over four attempts of 0.10.261011-beta, which is this eval's
  run-to-run spread; no change in this beta reaches the agent's tools.
- Retrieval and SkillRet are identical to 0.10.261011-beta; nothing in this beta changes search.

Wall time from each summary's `wall_seconds`: reflect 293 s, distill 711 s, extract 438 s, judge-gate 276 s, bakeoff 254 s,
consolidate 368 s, consolidate `--pool` 95 s, promotion 186 s, nightly 129 s, retrieval 100 s (books) and 268 s (library),
SkillRet 1,920 s, agent-ab 905 s.

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](reflect/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| distill | [distill/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](distill/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| extract | [extract/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](extract/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| judge-gate | [judge-gate/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](judge-gate/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| bakeoff (0.4) | [bakeoff/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](bakeoff/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| consolidate | [consolidate/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](consolidate/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| consolidate `--pool` | [consolidate/2026-10-23-0.10.261012-beta-35b-semantic-pool-20261023](consolidate/2026-10-23-0.10.261012-beta-35b-semantic-pool-20261023) |
| promotion | [promotion/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](promotion/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| nightly | [nightly/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](nightly/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| retrieval | [books](retrieval/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023-books), [library](retrieval/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023-library) |
| skillret | [skillret/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](skillret/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
| agent-ab | [agent-ab/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](agent-ab/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) |
