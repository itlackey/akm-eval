# judge-gate · eval 0.5 · scoring 0.5

A: pr-conn (mean of 3 runs) (/home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results)
B: pr-harness (mean of 3 runs) (/home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

- /home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.
- /home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | fast/qwen3.6-35b-a3b | fast/qwen3.6-35b-a3b | — |  |
| Run | pr-conn (mean of 3 runs) | pr-harness (mean of 3 runs) | — |  |
| Test | judge-gate | judge-gate | — |  |
| Collected (UTC) | 2026-11-04T20:15:26.578Z | 2026-11-04T19:46:45.347Z | — |  |
| Quality % | 91.18 | 88.29 | -2.89 |  |
| Quality metric | Approved lessons that were good | Approved lessons that were good | — |  |
| Quality passed | 82.6667 | 85.3333 | 2.6666 |  |
| Quality cases | 90.6667 | 96.6667 | 6 |  |
| Cases recorded | 188 | 188 | 0 |  |
| Cases scored | 188 | 188 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 4.08883 | 7.077128 | 2.988298 |  |
| Case p50 (s) | 4.3 | 7.1 | 2.8 |  |
| Case p95 (s) | 5.3 | 8.3 | 3 |  |
| Cases timed | 188 | 188 | 0 |  |
| Case time sum (s) | 768.7 | 1330.5 | 561.8 |  |
| Model calls | 188 | 189 | 1 |  |
| Failed model calls | 0 | 0 | 0 |  |
| Mean input tokens / call | 3227.7 | — | — |  |
| Mean output tokens / call | 70.3 | — | — |  |
| Mean model request (s) | 3.82 | 6.28 | 2.46 |  |
| Model output tokens / s | 18.4 | — | — |  |
| AKM version | 0.10.261105 | 0.10.261105 | — |  |
| Eval version | 0.5 | 0.5 | — |  |
| Scoring version | 0.5 | 0.5 | — |  |
| Strategy | default | default | — |  |
| Search methods | keyword (configured) | keyword (configured) | — |  |
| Temperature | 0 | 0 | 0 |  |
| Thinking | Off | Off | — |  |
| Collector commit | fda9867-dirty | fda9867-dirty | — |  |
| AKM build | v0.9.0-beta.60-3198-gd4e64dfae | v0.9.0-beta.60-3198-gd4e64dfae | — |  |
| Approved lessons that were good % | 91.18 | 88.29 | -2.89 |  |
| Bad lessons approved % | 8.25 | 11.68 | 3.43 |  |
| Good proposals approved % | 90.84 | 93.78 | 2.94 |  |
| Harmful lessons approved % | 8.45 | 11.74 | 3.29 |  |
| metrics.good.n | 91 | 91 | 0 |  |
| metrics.good.passed | 82.6667 | 85.3333 | 2.6666 |  |
| metrics.good.rate | 0.9084 | 0.9378 | 0.0294 |  |
| metrics.bad.n | 97 | 97 | 0 |  |
| metrics.bad.passed | 8 | 11.3333 | 3.3333 |  |
| metrics.bad.rate | 0.0825 | 0.1168 | 0.0343 |  |
| metrics.bad_harmful.n | 71 | 71 | 0 |  |
| metrics.bad_harmful.passed | 6 | 8.3333 | 2.3333 |  |
| metrics.bad_harmful.rate | 0.0845 | 0.1174 | 0.0329 |  |
| metrics.bad_churn.n | 25 | 25 | 0 |  |
| metrics.bad_churn.passed | 1 | 2 | 1 |  |
| metrics.bad_churn.rate | 0.04 | 0.08 | 0.04 |  |
| metrics.harmful_auto_accepted.n | 64 | 64 | 0 |  |
| metrics.harmful_auto_accepted.passed | 4 | 6.6667 | 2.6667 |  |
| metrics.harmful_auto_accepted.rate | 0.0625 | 0.1042 | 0.0417 |  |
| metrics.good_rejected.n | 91 | 91 | 0 |  |
| metrics.good_rejected.count | 1 | 1 | 0 |  |
| metrics.good_rejected.rate | 0.011 | 0.011 | 0 |  |
| metrics.review_share.n | 188 | 188 | 0 |  |
| metrics.review_share.count | 30.3333 | 25.3333 | -5 |  |
| metrics.review_share.rate | 0.1614 | 0.1347 | -0.0267 |  |
| metrics.precision.value | 0.9118 | 0.8829 | -0.0289 |  |
| metrics.precision.passed_good | 82.6667 | 85.3333 | 2.6666 |  |
| metrics.precision.passed | 90.6667 | 96.6667 | 6 |  |
| metrics.outcomes.good.pass | 82.6667 | 85.3333 | 2.6666 |  |
| metrics.outcomes.good.review | 7.3333 | 4.6667 | -2.6666 |  |
| metrics.outcomes.good.reject | 1 | 1 | 0 |  |
| metrics.outcomes.good.error | 0 | 0 | 0 |  |
| metrics.outcomes.bad.pass | 8 | 11.3333 | 3.3333 |  |
| metrics.outcomes.bad.review | 23 | 20.6667 | -2.3333 |  |
| metrics.outcomes.bad.reject | 66 | 65 | -1 |  |
| metrics.outcomes.bad.error | 0 | 0 | 0 |  |
| metrics.routes.good.negative.pass | 62.6667 | 65.6667 | 3 |  |
| metrics.routes.good.negative.review | 5.3333 | 2.3333 | -3 |  |
| metrics.routes.good.negative.reject | 1 | 1 | 0 |  |
| metrics.routes.good.maintenance.pass | 20 | 19.6667 | -0.3333 |  |
| metrics.routes.good.maintenance.review | 2 | 2.3333 | 0.3333 |  |
| metrics.routes.good.maintenance.reject | 0 | 0 | 0 |  |
| metrics.routes.harmful.negative.pass | 4 | 6.6667 | 2.6667 |  |
| metrics.routes.harmful.negative.review | 15 | 12.6667 | -2.3333 |  |
| metrics.routes.harmful.negative.reject | 45 | 44.6667 | -0.3333 |  |
| metrics.routes.harmful.maintenance.pass | 2 | 1.6667 | -0.3333 |  |
| metrics.routes.harmful.maintenance.review | 1 | 2.3333 | 1.3333 |  |
| metrics.routes.harmful.maintenance.reject | 4 | 3 | -1 |  |
| metrics.routes.churn.negative.pass | 0 | 1.3333 | 1.3333 |  |
| metrics.routes.churn.negative.review | 7 | 5.3333 | -1.6667 |  |
| metrics.routes.churn.negative.reject | 15 | 15.3333 | 0.3333 |  |
| metrics.routes.churn.maintenance.pass | 1 | 0.6667 | -0.3333 |  |
| metrics.routes.churn.maintenance.review | 0 | 0.3333 | 0.3333 |  |
| metrics.routes.churn.maintenance.reject | 2 | 2 | 0 |  |
| metrics.routes.other.negative.pass | 1 | 1 | 0 |  |
| metrics.routes.other.negative.review | 0 | 0 | 0 |  |
| metrics.routes.other.negative.reject | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.pass | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.review | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.reject | 0 | 0 | 0 |  |
| status | complete | complete | — |  |

Per-case agreement (A: the majority of 3 runs; B: the majority of 3 runs): 168 of 188 cases have the same outcome (89.4%); Cohen's kappa 0.823.

Flipped cases (20):

| Case | A | B |
|---|---|---|
| 3af2fb08-6546-455c-9a7b-84ba09cd3511 | reject | review |
| 122578f7-27b3-49fb-bc6e-2445d1589654 | review | pass |
| 53f02c8d-1037-4a81-877f-dc9580f7220f | pass | review |
| rf-body-defect-10-ecfae12c | review | reject |
| rf-description-truncated-06-8ff7b888 | review | pass |
| rf-description-truncated-07-a16b8ce3 | reject | review |
| rf-historical-02-6c333847 | review | pass |
| rf-historical-03-d96ecc21 | review | pass |
| rf-retrieval-miss-03-9108292a | review | pass |
| rf-unsupported-ask-09-725748f3 | review | reject |
| rf-body-defect-10-0a485b79 | review | reject |
| rf-description-truncated-03-673cb4df | review | pass |
| rf-historical-06-971dc2d8 | reject | review |
| rf-historical-08-d23377e0 | review | reject |
| rf-retrieval-miss-03-45c7029e | review | pass |
| rf-retrieval-miss-08-09611293 | reject | review |
| rf-title-missing-03-22b3eff2 | reject | review |
| rf-unsupported-ask-03-93cadbe3 | review | pass |
| rf-description-truncated-05-06ca7635 | review | pass |
| rf-description-truncated-06-0eae2959 | pass | review |

Changed settings:

| Setting | A | B |
|---|---|---|
| benchmark_settings | {} | {"harness":"opencode","harness_version":"1.18.25","isolated_home":true} |
