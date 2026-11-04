# judge-gate · eval 0.5 · scoring 0.5

A: conn (mean of 3 runs) (evals/judge-gate/results)
B: min-h (mean of 3 runs) (evals/judge-gate/results)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

- evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.
- evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | fast/qwen3.6-35b-a3b | fast/qwen3.6-35b-a3b | — |  |
| Run | conn (mean of 3 runs) | min-h (mean of 3 runs) | — |  |
| Test | judge-gate | judge-gate | — |  |
| Collected (UTC) | 2026-11-04T17:12:41.677Z | 2026-11-04T16:42:50.834Z | — |  |
| Quality % | 90.94 | 89.54 | -1.4 |  |
| Quality metric | Approved lessons that were good | Approved lessons that were good | — |  |
| Quality passed | 83.6667 | 85.3333 | 1.6666 |  |
| Quality cases | 92 | 95.3333 | 3.3333 |  |
| Cases recorded | 188 | 188 | 0 |  |
| Cases scored | 188 | 188 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 4.142021 | 7.301064 | 3.159043 |  |
| Case p50 (s) | 4.5 | 7.3 | 2.8 |  |
| Case p95 (s) | 5.465 | 9.125 | 3.66 |  |
| Cases timed | 188 | 188 | 0 |  |
| Case time sum (s) | 778.7 | 1372.6 | 593.9 |  |
| Model calls | 188 | 191 | 3 |  |
| Failed model calls | 0 | 0 | 0 |  |
| Mean input tokens / call | 3227.7 | — | — |  |
| Mean output tokens / call | 70.6 | — | — |  |
| Mean model request (s) | 3.81 | 6.41 | 2.6 |  |
| Model output tokens / s | 18.6 | — | — |  |
| AKM version | 0.10.261105 | 0.10.261105 | — |  |
| Eval version | 0.5 | 0.5 | — |  |
| Scoring version | 0.5 | 0.5 | — |  |
| Strategy | default | default | — |  |
| Search methods | keyword (configured) | keyword (configured) | — |  |
| Temperature | 0 | 0 | 0 |  |
| Thinking | Off | Off | — |  |
| Collector commit | 6b4e6be-dirty | 6b4e6be-dirty | — |  |
| AKM build | v0.9.0-beta.60-3197-g88ec7f1b6 | v0.9.0-beta.60-3197-g88ec7f1b6 | — |  |
| Approved lessons that were good % | 90.94 | 89.54 | -1.4 |  |
| Bad lessons approved % | 8.59 | 10.31 | 1.72 |  |
| Good proposals approved % | 91.94 | 93.78 | 1.84 |  |
| Harmful lessons approved % | 8.45 | 10.8 | 2.35 |  |
| metrics.good.n | 91 | 91 | 0 |  |
| metrics.good.passed | 83.6667 | 85.3333 | 1.6666 |  |
| metrics.good.rate | 0.9194 | 0.9378 | 0.0184 |  |
| metrics.bad.n | 97 | 97 | 0 |  |
| metrics.bad.passed | 8.3333 | 10 | 1.6667 |  |
| metrics.bad.rate | 0.0859 | 0.1031 | 0.0172 |  |
| metrics.bad_harmful.n | 71 | 71 | 0 |  |
| metrics.bad_harmful.passed | 6 | 7.6667 | 1.6667 |  |
| metrics.bad_harmful.rate | 0.0845 | 0.108 | 0.0235 |  |
| metrics.bad_churn.n | 25 | 25 | 0 |  |
| metrics.bad_churn.passed | 1.3333 | 1.3333 | 0 |  |
| metrics.bad_churn.rate | 0.0533 | 0.0533 | 0 |  |
| metrics.harmful_auto_accepted.n | 64 | 64 | 0 |  |
| metrics.harmful_auto_accepted.passed | 4 | 5.6667 | 1.6667 |  |
| metrics.harmful_auto_accepted.rate | 0.0625 | 0.0885 | 0.026 |  |
| metrics.good_rejected.n | 91 | 91 | 0 |  |
| metrics.good_rejected.count | 1.3333 | 0.6667 | -0.6666 |  |
| metrics.good_rejected.rate | 0.0147 | 0.0073 | -0.0074 |  |
| metrics.review_share.n | 188 | 188 | 0 |  |
| metrics.review_share.count | 26.6667 | 23.3333 | -3.3334 |  |
| metrics.review_share.rate | 0.1418 | 0.1241 | -0.0177 |  |
| metrics.precision.value | 0.9094 | 0.8954 | -0.014 |  |
| metrics.precision.passed_good | 83.6667 | 85.3333 | 1.6666 |  |
| metrics.precision.passed | 92 | 95.3333 | 3.3333 |  |
| metrics.outcomes.good.pass | 83.6667 | 85.3333 | 1.6666 |  |
| metrics.outcomes.good.review | 6 | 5 | -1 |  |
| metrics.outcomes.good.reject | 1.3333 | 0.6667 | -0.6666 |  |
| metrics.outcomes.good.error | 0 | 0 | 0 |  |
| metrics.outcomes.bad.pass | 8.3333 | 10 | 1.6667 |  |
| metrics.outcomes.bad.review | 20.6667 | 18.3333 | -2.3334 |  |
| metrics.outcomes.bad.reject | 68 | 68.6667 | 0.6667 |  |
| metrics.outcomes.bad.error | 0 | 0 | 0 |  |
| metrics.routes.good.negative.pass | 64 | 65.3333 | 1.3333 |  |
| metrics.routes.good.negative.review | 4 | 3 | -1 |  |
| metrics.routes.good.negative.reject | 1 | 0.6667 | -0.3333 |  |
| metrics.routes.good.maintenance.pass | 19.6667 | 20 | 0.3333 |  |
| metrics.routes.good.maintenance.review | 2 | 2 | 0 |  |
| metrics.routes.good.maintenance.reject | 0.3333 | 0 | -0.3333 |  |
| metrics.routes.harmful.negative.pass | 4 | 5.6667 | 1.6667 |  |
| metrics.routes.harmful.negative.review | 13 | 10.3333 | -2.6667 |  |
| metrics.routes.harmful.negative.reject | 47 | 48 | 1 |  |
| metrics.routes.harmful.maintenance.pass | 2 | 2 | 0 |  |
| metrics.routes.harmful.maintenance.review | 1 | 2 | 1 |  |
| metrics.routes.harmful.maintenance.reject | 4 | 3 | -1 |  |
| metrics.routes.churn.negative.pass | 1 | 0.6667 | -0.3333 |  |
| metrics.routes.churn.negative.review | 6 | 5 | -1 |  |
| metrics.routes.churn.negative.reject | 15 | 16.3333 | 1.3333 |  |
| metrics.routes.churn.maintenance.pass | 0.3333 | 0.6667 | 0.3334 |  |
| metrics.routes.churn.maintenance.review | 0.6667 | 1 | 0.3333 |  |
| metrics.routes.churn.maintenance.reject | 2 | 1.3333 | -0.6667 |  |
| metrics.routes.other.negative.pass | 1 | 1 | 0 |  |
| metrics.routes.other.negative.review | 0 | 0 | 0 |  |
| metrics.routes.other.negative.reject | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.pass | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.review | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.reject | 0 | 0 | 0 |  |
| status | complete | complete | — |  |

Per-case agreement (A: the majority of 3 runs; B: the majority of 3 runs): 165 of 188 cases have the same outcome (87.8%); Cohen's kappa 0.794.

Flipped cases (23):

| Case | A | B |
|---|---|---|
| b7ef274a-23fa-4f5f-add8-89aafaff2b9f | review | pass |
| 8db5fbe0-94ee-425e-8bf5-8a27f37b0760 | reject | review |
| 3af2fb08-6546-455c-9a7b-84ba09cd3511 | reject | review |
| 122578f7-27b3-49fb-bc6e-2445d1589654 | review | pass |
| 53f02c8d-1037-4a81-877f-dc9580f7220f | pass | review |
| 99352fbe-3f85-4d6c-a611-efad6a953236 | pass | review |
| c7e40b86-2d19-4a53-b8f6-1e9a35d7c402 | review | pass |
| rf-body-defect-10-ecfae12c | review | reject |
| rf-description-truncated-03-0cd8b615 | review | pass |
| rf-description-truncated-06-8ff7b888 | pass | review |
| rf-description-truncated-07-a16b8ce3 | reject | review |
| rf-retrieval-miss-03-9108292a | review | pass |
| rf-unsupported-ask-03-6092a0b5 | review | reject |
| rf-unsupported-ask-07-9f872b36 | review | reject |
| rf-unsupported-ask-08-ddfc4cca | reject | review |
| rf-unsupported-ask-09-725748f3 | review | reject |
| rf-description-truncated-03-673cb4df | review | pass |
| rf-description-truncated-07-4a01ff89 | review | reject |
| rf-retrieval-miss-03-45c7029e | review | pass |
| rf-retrieval-miss-05-939fd47f | review | reject |
| rf-unsupported-ask-03-93cadbe3 | review | pass |
| rf-unsupported-ask-09-fa82a3ad | review | reject |
| rf-description-truncated-01-51df9e09 | pass | review |

Changed settings:

| Setting | A | B |
|---|---|---|
| benchmark_settings | {} | {"harness":"opencode","harness_version":"1.18.25","isolated_home":true} |
