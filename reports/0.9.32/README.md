# akm 0.9.32, 35B, semantic, full

The one 0.9.32 set of the 35B model: every eval but LongMemEval and Terminal-Bench, run once on 2026-10-22 with
`akm-cli@0.9.32`, `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora,
temperature 0 and thinking off, one eval at a time. It replaces the runs of 2026-10-15 (and the 0.9.31 retrieval runs),
which were collected with older versions of several evals and are no longer published (they stay in git history). It is
the 0.9.x column of the [0.10.261011-beta report](../0.10.261011-beta/), which was run the same way on the same day.

The settings are those of the [0.10.261010-beta round](../0.10.261010-beta/): default concurrency (1; judge-gate 2) and
default timeouts for the process evals, and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, with
`akm-cli@0.9.32` and the plugin pinned at 0.10.261002-beta (the plugin carries its own akm-cli 0.10.261003-beta; the akm
that the agent shells out to is the one under test). The model's context and output limits (32768 and 4096) were set for
agent-ab, and its missing-limits warning did not fire. The collector is the shared driver of akm-eval at commit `307e636`
(after #138). The process evals ran against `akm-cli@0.9.32` installed in a temporary npm prefix and passed through
`AKM_BIN`; the summaries' `akm_bin` reads `/tmp/akm-0.9.32-prefix/node_modules/.bin/akm`, a shortened copy of the real
temporary path, which held a login name. All 13 summaries are `complete` with no errored case and no failed model call.

Eval versions differ from the 2026-10-15 runs: bakeoff is 0.4 (55 cases), reflect 0.4, retrieval 0.3, nightly collector
0.3 and scorer 0.4. Those totals are not comparable with the old 0.9.32 numbers, which is why the set was collected again.

## Results

| eval | headline | 0.9.32 |
|---|---|---:|
| reflect | correct fixes | 36/40 |
| distill | good lessons | 11/40 |
| extract | useful memories | 35/40 |
| judge-gate | approved lessons that were good | 16/17 |
| bakeoff 0.4 | cases passed (55) | 35/55 (34/51 on the 51 cases of bakeoff 0.3) |
| consolidate | safe retirements found | 34/40 |
| consolidate `--pool` | safe retirements found | 18/19 |
| promotion | accepted proposals that were good | 34/40 |
| nightly | items handled right | 28/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 |
| skillret | keyword NDCG@10 | 50.47 |
| agent-ab | pass rate, akm / control | 9/18 / 1/18 |

Wall time, from each summary's `wall_seconds`: reflect 291 s, distill 487 s, extract 437 s, judge-gate 270 s, bakeoff 239 s,
consolidate 376 s, consolidate `--pool` 92 s, promotion 188 s, nightly 102 s, retrieval 106 s (books) and 288 s (library),
SkillRet 2,128 s (queries 1,510 s, cold semantic index 596 s, keyword index 21 s), agent-ab 1,490 s.

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-22-0.9.32-35b-semantic-full-20261022](reflect/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| distill | [distill/2026-10-22-0.9.32-35b-semantic-full-20261022](distill/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| extract | [extract/2026-10-22-0.9.32-35b-semantic-full-20261022](extract/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| judge-gate | [judge-gate/2026-10-22-0.9.32-35b-semantic-full-20261022](judge-gate/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| bakeoff (0.4) | [bakeoff/2026-10-22-0.9.32-35b-semantic-full-20261022](bakeoff/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| consolidate | [consolidate/2026-10-22-0.9.32-35b-semantic-full-20261022](consolidate/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| consolidate `--pool` | [consolidate/2026-10-22-0.9.32-35b-semantic-pool-20261022](consolidate/2026-10-22-0.9.32-35b-semantic-pool-20261022) |
| promotion | [promotion/2026-10-22-0.9.32-35b-semantic-full-20261022](promotion/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| nightly | [nightly/2026-10-22-0.9.32-35b-semantic-full-20261022](nightly/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| retrieval | [books](retrieval/2026-10-22-0.9.32-35b-semantic-full-20261022-books), [library](retrieval/2026-10-22-0.9.32-35b-semantic-full-20261022-library) |
| skillret | [skillret/2026-10-22-0.9.32-35b-semantic-full-20261022](skillret/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| agent-ab | [agent-ab/2026-10-22-0.9.32-35b-semantic-full-20261022](agent-ab/2026-10-22-0.9.32-35b-semantic-full-20261022) |
| LongMemEval, Luna pilot (2026-10-15, the only run for that model) | [longmemeval/2026-10-15-compare-0.9.32-luna-semantic-pilot-20261014](longmemeval/2026-10-15-compare-0.9.32-luna-semantic-pilot-20261014) |

## Bakeoff 0.4 on 0.9.32

Bakeoff 0.4 has 55 cases: the 51 of 0.3 and four grounding controls (nested and flat parent scope, an observation date held
only in metadata, and a file `updated` date without an observation date). 0.9.32 has no `memoryInference.noChange`
counter, no source context and no scope or date copy, so it cannot pass what those cases check, and it does not.
Reported as measured:

| | 0.9.32 |
|---|---:|
| cases passed (55) / of the 51 shared with 0.3 | 35 / 34 |
| memory-inference passed (23) / of the 19 shared | 13 / 12 |
| remember-enrich / schema-repair / session-summary / consolidate-promote passed | 7 / 6 / 3 / 6 of 8 |
| memory-inference outcomes (output / no-change / unusable) | 23 / 0 / 0 |
| correct restraint (no child needed, none written) | 0 of 5 |
| unjustified child (no child needed, one written) | 5 of 5 |
| false abstention (child needed, decided no-change) | 0 of 14 |
| the four grounding controls passed | 1 of 4 (`infer-file-date-not-observation`) |

The three grounding controls it fails are `infer-scoped-incident` and `infer-flat-scoped-request` (`preserves scope`) and
`infer-metadata-observation-date` (`carries observation date`).

## Notes on this run

- **Agent A/B.** The akm arm passed 9 of 18 trials and the control 1 of 18 (+44.4 points, interval 16.7 to 77.8 over 6
  tasks); the akm arm beat the control on 5 of 6 tasks and tied on 1 (sign test over the 5 tasks where the arms differ: p =
  0.0625). The akm arm called akm in 4 of 18 trials and passed all 4; of the 14 without a call it passed 5. One control
  trial (`drillbit--fix-runbook-train`) ended with opencode exiting non-zero after its last step; Harbor recorded
  `NonZeroAgentExitCodeError`, the verifier scored the trial (reward 0) and the summary counts it as scored, not errored (no
  trial errored or timed out). The control passed 0 of 3 on that task.
- **Retrieval.** Library semantic nDCG@10 0.826 and books 0.909 (keyword 0.757 and 0.828). Curate abstained on 1 of the
  library's 25 non-task inputs. Both indexes were built cold (books 5 s, library 19 s).
- **SkillRet.** Keyword NDCG@10 0.5047 and semantic 0.5800; query time 1,510 s and cold semantic index 596 s are single
  observations on a shared host.
- **One run per eval.** A one- to three-case move in a model-driven eval is inside the run-to-run variation of the lab route
  at temperature 0 (distill, for example, was 16/40 in the 2026-10-15 run and is 11/40 here, with the same akm).
