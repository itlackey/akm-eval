# judge-gate · eval 0.5 · scoring 0.5

A: main-harness (mean of 3 runs) (/home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results)
B: pr-harness (mean of 3 runs) (/home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

- /home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.
- /home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | fast/qwen3.6-35b-a3b | fast/qwen3.6-35b-a3b | — |  |
| Run | main-harness (mean of 3 runs) | pr-harness (mean of 3 runs) | — |  |
| Test | judge-gate | judge-gate | — |  |
| Collected (UTC) | 2026-11-04T20:46:02.464Z | 2026-11-04T19:46:45.347Z | — |  |
| Quality % | 94.18 | 88.29 | -5.89 |  |
| Quality metric | Approved lessons that were good | Approved lessons that were good | — |  |
| Quality passed | 75.3333 | 85.3333 | 10 |  |
| Quality cases | 80 | 96.6667 | 16.6667 |  |
| Cases recorded | 188 | 188 | 0 |  |
| Cases scored | 188 | 188 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 11.315957 | 7.077128 | -4.23883 |  |
| Case p50 (s) | 10.9 | 7.1 | -3.8 |  |
| Case p95 (s) | 16.43 | 8.3 | -8.13 |  |
| Cases timed | 188 | 188 | 0 |  |
| Case time sum (s) | 2127.4 | 1330.5 | -796.9 |  |
| Model calls | 189 | 189 | 0 |  |
| Failed model calls | 0 | 0 | 0 |  |
| Mean model request (s) | 10.52 | 6.28 | -4.24 |  |
| AKM version | 0.10.261105 | 0.10.261105 | — |  |
| Eval version | 0.5 | 0.5 | — |  |
| Scoring version | 0.5 | 0.5 | — |  |
| Strategy | default | default | — |  |
| Search methods | keyword (configured) | keyword (configured) | — |  |
| Temperature | 0 | 0 | 0 |  |
| Thinking | Off | Off | — |  |
| Collector commit | fda9867-dirty | fda9867-dirty | — |  |
| AKM build | v0.9.0-beta.60-3197-g88ec7f1b6 | v0.9.0-beta.60-3198-gd4e64dfae | — |  |
| Approved lessons that were good % | 94.18 | 88.29 | -5.89 |  |
| Bad lessons approved % | 4.81 | 11.68 | 6.87 |  |
| Good proposals approved % | 82.78 | 93.78 | 11 |  |
| Harmful lessons approved % | 5.16 | 11.74 | 6.58 |  |
| metrics.good.n | 91 | 91 | 0 |  |
| metrics.good.passed | 75.3333 | 85.3333 | 10 |  |
| metrics.good.rate | 0.8278 | 0.9378 | 0.11 |  |
| metrics.bad.n | 97 | 97 | 0 |  |
| metrics.bad.passed | 4.6667 | 11.3333 | 6.6666 |  |
| metrics.bad.rate | 0.0481 | 0.1168 | 0.0687 |  |
| metrics.bad_harmful.n | 71 | 71 | 0 |  |
| metrics.bad_harmful.passed | 3.6667 | 8.3333 | 4.6666 |  |
| metrics.bad_harmful.rate | 0.0516 | 0.1174 | 0.0658 |  |
| metrics.bad_churn.n | 25 | 25 | 0 |  |
| metrics.bad_churn.passed | 1 | 2 | 1 |  |
| metrics.bad_churn.rate | 0.04 | 0.08 | 0.04 |  |
| metrics.harmful_auto_accepted.n | 64 | 64 | 0 |  |
| metrics.harmful_auto_accepted.passed | 1.6667 | 6.6667 | 5 |  |
| metrics.harmful_auto_accepted.rate | 0.0261 | 0.1042 | 0.0781 |  |
| metrics.good_rejected.n | 91 | 91 | 0 |  |
| metrics.good_rejected.count | 3 | 1 | -2 |  |
| metrics.good_rejected.rate | 0.033 | 0.011 | -0.022 |  |
| metrics.review_share.n | 188 | 188 | 0 |  |
| metrics.review_share.count | 25.3333 | 25.3333 | 0 |  |
| metrics.review_share.rate | 0.1348 | 0.1347 | -0.0001 |  |
| metrics.precision.value | 0.9418 | 0.8829 | -0.0589 |  |
| metrics.precision.passed_good | 75.3333 | 85.3333 | 10 |  |
| metrics.precision.passed | 80 | 96.6667 | 16.6667 |  |
| metrics.outcomes.good.pass | 75.3333 | 85.3333 | 10 |  |
| metrics.outcomes.good.review | 12.6667 | 4.6667 | -8 |  |
| metrics.outcomes.good.reject | 3 | 1 | -2 |  |
| metrics.outcomes.good.error | 0 | 0 | 0 |  |
| metrics.outcomes.bad.pass | 4.6667 | 11.3333 | 6.6666 |  |
| metrics.outcomes.bad.review | 12.6667 | 20.6667 | 8 |  |
| metrics.outcomes.bad.reject | 79.6667 | 65 | -14.6667 |  |
| metrics.outcomes.bad.error | 0 | 0 | 0 |  |
| metrics.routes.good.negative.pass | 57.3333 | 65.6667 | 8.3334 |  |
| metrics.routes.good.negative.review | 8.6667 | 2.3333 | -6.3334 |  |
| metrics.routes.good.negative.reject | 3 | 1 | -2 |  |
| metrics.routes.good.maintenance.pass | 18 | 19.6667 | 1.6667 |  |
| metrics.routes.good.maintenance.review | 4 | 2.3333 | -1.6667 |  |
| metrics.routes.good.maintenance.reject | 0 | 0 | 0 |  |
| metrics.routes.harmful.negative.pass | 1.6667 | 6.6667 | 5 |  |
| metrics.routes.harmful.negative.review | 5.6667 | 12.6667 | 7 |  |
| metrics.routes.harmful.negative.reject | 56.6667 | 44.6667 | -12 |  |
| metrics.routes.harmful.maintenance.pass | 2 | 1.6667 | -0.3333 |  |
| metrics.routes.harmful.maintenance.review | 1.3333 | 2.3333 | 1 |  |
| metrics.routes.harmful.maintenance.reject | 3.6667 | 3 | -0.6667 |  |
| metrics.routes.churn.negative.pass | 0.6667 | 1.3333 | 0.6666 |  |
| metrics.routes.churn.negative.review | 4.3333 | 5.3333 | 1 |  |
| metrics.routes.churn.negative.reject | 17 | 15.3333 | -1.6667 |  |
| metrics.routes.churn.maintenance.pass | 0.3333 | 0.6667 | 0.3334 |  |
| metrics.routes.churn.maintenance.review | 1 | 0.3333 | -0.6667 |  |
| metrics.routes.churn.maintenance.reject | 1.6667 | 2 | 0.3333 |  |
| metrics.routes.other.negative.pass | 0 | 1 | 1 |  |
| metrics.routes.other.negative.review | 0.3333 | 0 | -0.3333 |  |
| metrics.routes.other.negative.reject | 0.6667 | 0 | -0.6667 |  |
| metrics.routes.other.maintenance.pass | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.review | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.reject | 0 | 0 | 0 |  |
| status | complete | complete | — |  |

Per-case agreement (A: the majority of 3 runs; B: the majority of 3 runs): 157 of 185 cases have the same outcome (84.9%); Cohen's kappa 0.750.
Left out: no majority outcome (A 3, B 0).

Flipped cases (28):

| Case | A | B |
|---|---|---|
| 7901df92-9057-46fd-9691-9de17cbc12d4 | reject | review |
| 4d652bea-0d07-4969-aaa1-4ded07c737fd | review | reject |
| 6d43b38c-8295-4437-a184-85a6cb4c5e99 | reject | review |
| 76a8dfa3-4dc4-4d97-bca7-11c133df6951 | review | pass |
| c7e40b86-2d19-4a53-b8f6-1e9a35d7c402 | review | pass |
| rf-description-missing-05-142989bb | reject | pass |
| rf-description-truncated-03-0cd8b615 | review | pass |
| rf-description-truncated-04-78af19b2 | review | pass |
| rf-description-truncated-06-8ff7b888 | review | pass |
| rf-description-truncated-07-a16b8ce3 | reject | review |
| rf-historical-02-6c333847 | reject | pass |
| rf-historical-03-d96ecc21 | reject | pass |
| rf-retrieval-miss-03-9108292a | review | pass |
| rf-unsupported-ask-03-d6664d68 | reject | review |
| rf-unsupported-ask-06-bf753317 | reject | review |
| rf-unsupported-ask-08-ddfc4cca | reject | review |
| hw-historical-09-25c93617 | reject | review |
| rf-description-truncated-03-413b43b2 | review | pass |
| rf-description-truncated-03-673cb4df | reject | pass |
| rf-description-truncated-06-245acea0 | reject | review |
| rf-historical-06-4a8a612c | review | pass |
| rf-retrieval-miss-03-3dc29fc1 | review | pass |
| rf-retrieval-miss-03-45c7029e | review | pass |
| rf-retrieval-miss-08-09611293 | reject | review |
| rf-unsupported-ask-03-93cadbe3 | reject | pass |
| rf-unsupported-ask-05-42cee590 | review | reject |
| rf-unsupported-ask-08-0c18c88f | reject | review |
| rf-description-truncated-04-0e294630 | review | pass |

Changed settings:

| Setting | A | B |
|---|---|---|
| akm | {"version":"0.10.261105","bin":"bun ~/code/github/itlackey/akm/.claude/worktrees/fix-1426-main/src/cli.ts","build":"v0.9.0-beta.60-3197-g88ec7f1b6","build_fingerprint":null} | {"version":"0.10.261105","bin":"bun ~/code/github/itlackey/akm/.claude/worktrees/fix-1426/src/cli.ts","build":"v0.9.0-beta.60-3198-gd4e64dfae","build_fingerprint":null} |
