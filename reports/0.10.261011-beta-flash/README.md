# akm 0.10.261011-beta, Flash-Next, semantic, full

The model-dependent evals of the [0.10.261011-beta 35B round](../0.10.261011-beta/), run once on 2026-10-23 with
`moe/qwen3.8-flash-next-iq2_xs` (Qwen3.8 Flash-Next, IQ2_XS) through the lab gateway instead of `fast/qwen3.6-35b-a3b`.
Everything else is that round's: akm 0.10.261011-beta, akm-eval `307e636`, `--semantic`, full public corpora, temperature 0,
thinking off, one eval at a time, the same judge model, and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time,
`akm-cli@0.10.261011-beta` and plugin 0.10.261002-beta. Retrieval and SkillRet call no model, so the 35B round's numbers
stand for both. One difference: agent-ab gives OpenCode each model's own served limits, context 131072 and output 4096 for
Flash-Next against 32768 and 4096 for 35B.

All 10 summaries are `complete`. Errored cases are left out of a run's denominator; here every one was the model failing
to give a usable answer: distill 7 ("LLM call returned no usable output"), consolidate 4 (akm paired the notes, its judge
gave no verdict) and nightly 2 (the model call failed). The 35B round had none.

## Flash-Next next to 35B

One run per model on the same build, so each difference is one observation, not a measured gap.

| eval | headline | 35B | Flash-Next |
|---|---|---:|---:|
| reflect | correct fixes | 36/40 | 37/40 |
| distill | good lessons (wrong lessons) | 8/40 (1/16); repeats 14/40 (0/16) | 20/38 (0/13), 7 errored |
| extract | useful memories | 35/40 | 34/40 |
| judge-gate | good revisions passed / bad revisions passed | 14/40 / 0/95 | 28/40 / **11/95** |
| bakeoff 0.4 | cases passed | 43/55 | **52/55** |
| consolidate | safe retirements found (unsafe) | 38/40 (0) | 38/38 (0), 4 errored |
| consolidate `--pool` | safe retirements found | 18/19 | 18/19 |
| promotion | good accepted / bad accepted | 34/40 / 5/40 | 40/40 / **9/40** |
| nightly | items handled right | 29/35 | 31/35, 2 errored |
| agent-ab | pass rate, akm / control | 11/18 / 2/18 | **18/18** / 0/18 |

- **Where Flash-Next does more:** bakeoff (52 against 43 of 55; valid output 50 of 55), agent-ab (the akm arm passed all 18
  trials and called akm in every one, against 11 of 18), and distill (20 good lessons of the 38 it answered, no wrong one).
- **Where it is less safe as a gate:** judge-gate passed 11 of 95 bad revisions (6 of 67 harmful, 5 of 28 churn) where 35B
  passed none, and promotion accepted 9 of 40 bad promotions against 5. It also passes more good ones (28 against 14 of 40
  good revisions; 40 against 34 good promotions): it approves more of everything.
- **Reliability:** 13 cases errored on unusable model output across distill, consolidate and nightly; 35B had none.
- **Time:** slower on every eval — reflect 349 s (35B 284), distill 729 s (667), extract 410 s (427), judge-gate 412 s (271),
  bakeoff 299 s (243), consolidate 512 s (373), `--pool` 179 s (90), promotion 255 s (189), nightly 172 s (122), agent-ab
  2,617 s (1,340). The akm arm's trials took 2.4 minutes on average (35B 2.8) and the control's 6.6 (1.9).

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](reflect/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| distill | [distill/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](distill/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| extract | [extract/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](extract/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| judge-gate | [judge-gate/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](judge-gate/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| bakeoff (0.4) | [bakeoff/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](bakeoff/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| consolidate | [consolidate/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](consolidate/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| consolidate `--pool` | [consolidate/2026-10-23-0.10.261011-beta-flash-semantic-pool-20261023](consolidate/2026-10-23-0.10.261011-beta-flash-semantic-pool-20261023) |
| promotion | [promotion/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](promotion/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| nightly | [nightly/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](nightly/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
| agent-ab | [agent-ab/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](agent-ab/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) |
