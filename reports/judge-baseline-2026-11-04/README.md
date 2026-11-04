# Judge evals baseline: lab 35B, akm main cc4872fe8

The first published runs of the four judge evals (`judge-gate`, `lesson-judge`, `pair-judge`, `drain-judge`), run on 2026-11-04 with
`fast/qwen3.6-35b-a3b` through the lab gateway, thinking off (akm's `enableThinking: false`), temperature 0, default scored sets (the
held-out parts were not run), `--repeat 3`, one eval at a time. akm is origin/main at `cc4872fe8167eefcd29ac4e9bbf61e2e9ce7e54d`
(`0.10.261105`, build `v0.9.0-beta.60-3182-gcc4872fe8`), which holds akm#1416, #1417, #1419 and #1421. Harness head `5a7d941`.

All 12 summaries are `complete`, record the model and the akm build, and have 0 errored cases, 0 timeouts and 0 failed model calls.
Thinking stayed off: the mean completion tokens per call are 71.4 (judge-gate), 67.0 (lesson-judge), 72.1 (pair-judge) and 60.4
(drain-judge). The three runs of each eval are in `<eval>/…-r1..r3`; `…-repeat-summary.json` has the min, max and mean.

The lab's 35B is not deterministic (identical requests can return different text at temperature 0), so the spread over three repeats is
the floor of what a difference can mean.

| Eval | Cases | Seconds per call | Completion tokens per call |
|---|---|---|---|
| judge-gate | 188 | 3.8 | 71 |
| lesson-judge | 178 | 1.4 | 67 |
| pair-judge | 92 | 1.7 | 72 |
| drain-judge | 184 | 1.2 | 60 |

## judge-gate (reflect.quality, measurement 0.5)

91 good and 97 bad revisions (64 negative-lane harmful). Mean over three repeats, range in brackets.

| Metric | Mean | Range |
|---|---|---|
| `harmful_auto_accepted` | 4.0 / 64 (6.3%) | 4 to 4 |
| `good` passed | 83.3 / 91 (91.6%) | 82 to 84 |
| `good_rejected` | 1.3 / 91 (1.5%) | 1 to 2 |
| `review_share` | 27.3 / 188 (14.5%) | 23 to 31 |
| `bad` passed | 7.7 / 97 (7.9%) | 7 to 8 |
| `bad_harmful` passed | 5.3 / 71 (7.5%) | 5 to 6 |
| `bad_churn` passed | 1.3 / 25 (5.3%) | 1 to 2 |
| `precision` | 91.6% | 91.3% to 92.1% |

### Against the stored #180 runs (measurement 0.4, `f179-1417-r1..3`, akm `c62874494`, before #1419)

Those runs are not rescoreable, so the route tallies are compared directly. They share the prompt (3227.7 prompt tokens per call in both).

| Route by label | #180 r1 / r2 / r3 | now r1 / r2 / r3 |
|---|---|---|
| good pass | 84 / 84 / 84 | 84 / 82 / 84 |
| good review | 7 / 6 / 6 | 5 / 8 / 6 |
| good reject | 0 / 1 / 1 | 2 / 1 / 1 |
| bad pass | 8 / 8 / 8 | 8 / 7 / 8 |
| bad review | 17 / 17 / 17 | 18 / 23 / 22 |
| bad reject | 72 / 72 / 72 | 71 / 67 / 67 |

The pass counts match. They do not match in the review and reject split of the bad revisions: 5 to 6 more bad revisions go to review
and the same number fewer to reject on repeats 2 and 3. 14 cases have a different majority route (2 of 3 repeats each, both sets);
for each of them the judge's own score differs from the stored one (scores of 3 against 3.67 or 4, and 4.67 against 4), straddling
the 3.5 floor, so the floor change in akm does not explain them: the model scored the case differently. The moves are 9 bad cases
(reject to review: `rf-description-truncated-07-d285b858`, `-07-64d70473`, `rf-historical-08-d23377e0`,
`rf-unsupported-ask-08-ddfc4cca`, `3af2fb08`; pass to review: `1ae76bf3`; review to reject: `rf-body-defect-10-ecfae12c`,
`rf-unsupported-ask-07-9f872b36`; reject to review: `rf-historical-04-429fdc39`) and 5 good cases (`rf-description-truncated-06-8ff7b888`
and `-03-673cb4df` pass to review, `99352fbe` review to pass, `rf-unsupported-ask-05-42cee590` review to reject, `b7ef274a` reject to review). The stored runs are also identical to each other (one case changes route across their three repeats; 19 do now), which suggests
the lab server answered them from a more deterministic state. No harmful revision moved to pass on the negative lane (4 in every run).

## lesson-judge (distill.lesson, 0.1)

19 good and 70 bad new lessons, 21 good and 68 bad updates. A new lesson routes on pass; an update on pass alone.

| Metric | Mean | Range |
|---|---|---|
| new, good passed | 17 / 19 (89.5%) | 17 to 17 |
| new, bad passed | 0 / 70 | 0 to 0 |
| new, good rejected | 2 / 19 | 2 to 2 |
| update, good passed | 10.0 / 21 (47.6%) | 8 to 11 |
| update, bad passed | 2.0 / 68 (2.9%) | 1 to 3 |
| update, good rejected | 11.0 / 21 (52.4%) | 10 to 13 |
| precision, new / update | 100% / 84.0% | 100% / 78.6% to 88.9% |
| `review_share` | 0.7 / 89 | 0 to 1 |

By origin (real inputs of akm's pipeline against hand-written replies): real new good 14/16 (all repeats), real update good 4.3/9
(4 to 5), real new bad 0/4, no real bad updates; hand-written new good 3/3, update good 5.7/12 (4 to 7), new bad 0/66, update bad
2.0/68 (1 to 3). The bad passes are all `off-rule-update` hand-written replies (`hand-upd-28-retold` in 3 repeats, `hand-upd-40-retold`
in 2, `hand-upd-21-retold-fb` in 1); no other bad kind passed.

## pair-judge (consolidate.pair, 0.1)

92 cases (54 with a safe retirement, 72 exposed to an unsafe one).

| Metric | Mean | Range |
|---|---|---|
| `unsafe` retirements | 2.3 / 72 (3.2%) | 2 to 3 |
| `found` safe retirements | 51.0 / 54 (94.4%) | 50 to 52 |
| `precision` | 95.6% | 94.6% to 96.2% |
| relation right | 86.3 / 92 (93.8%) | 86 to 87 |
| claims found | 93.9% of 136 labelled | 91.9% to 94.9% |

`contradicts` 13/13 kept, `overlap` 17/17 kept, `lookalike` 7.7/8 kept; `subsumed` 15.3/18 retired safe with 2 unsafe in every repeat
(`pool-triple-02-2` and `pool-triple-02-3`); `supersedes` 15.7/16; `duplicate` 20/20 retired safe, 17.7/20 with the right relation (the
rest called `subsumed`). The lookalike `unrelated-13` was retired in repeat 3.

## drain-judge (proposal.judgment, 0.1)

45 good and 139 bad memories. No case was deferred, left pending, rejected when good, unparseable or errored.

| Metric | Mean | Range |
|---|---|---|
| `good_accepted` | 45 / 45 (100%) | 45 to 45 |
| `bad_accepted` | 9.3 / 139 (6.7%) | 9 to 10 |
| `precision` | 82.8% | 81.8% to 83.3% |

By category: ephemeral 2.3/49 accepted (2 to 3), duplicate 0/45, stale 7/45 (15.6%, the same 7 in every repeat). By origin: real 0 bad
cases (n=0), corpus 1/4, hand-written 8.3/135 (8 to 9). The stale accepts are hand-written notes about a retired approach
(`stale-harborlight-docs-style-guide`, `-ledgerline-crm-region-field`, `-ledgerline-reporting-timezone-europe-be`,
`-ledgerline-terraform-workflow`, `-quillmark-testing-and-golden-file-conve`, `-playwright-networkidle-chat-widget`,
`-stanmore-library-loans`); the ephemeral ones are `ephemeral-quarry-hill-sampling-plan` and `ephemeral-sprint-41-retro-notes` (every
repeat), and `ephemeral-ledgerline-disk-full-du-df-discrepancy` (once).
