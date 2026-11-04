# judge-gate · eval 0.5 · scoring 0.5

A: pr-conn (mean of 3 runs) (/home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results)
B: main-harness (mean of 3 runs) (/home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

- /home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.
- /home/founder3/code/github/itlackey/akm-eval/.claude/worktrees/results-1426/evals/judge-gate/results: a --repeat set of 3 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.
- Several settings changed; these differences do not isolate the effect of any one change.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | fast/qwen3.6-35b-a3b | fast/qwen3.6-35b-a3b | — |  |
| Run | pr-conn (mean of 3 runs) | main-harness (mean of 3 runs) | — |  |
| Test | judge-gate | judge-gate | — |  |
| Collected (UTC) | 2026-11-04T20:15:26.578Z | 2026-11-04T20:46:02.464Z | — |  |
| Quality % | 91.18 | 94.18 | 3 |  |
| Quality metric | Approved lessons that were good | Approved lessons that were good | — |  |
| Quality passed | 82.6667 | 75.3333 | -7.3334 |  |
| Quality cases | 90.6667 | 80 | -10.6667 |  |
| Cases recorded | 188 | 188 | 0 |  |
| Cases scored | 188 | 188 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 4.08883 | 11.315957 | 7.227128 |  |
| Case p50 (s) | 4.3 | 10.9 | 6.6 |  |
| Case p95 (s) | 5.3 | 16.43 | 11.13 |  |
| Cases timed | 188 | 188 | 0 |  |
| Case time sum (s) | 768.7 | 2127.4 | 1358.7 |  |
| Model calls | 188 | 189 | 1 |  |
| Failed model calls | 0 | 0 | 0 |  |
| Mean input tokens / call | 3227.7 | — | — |  |
| Mean output tokens / call | 70.3 | — | — |  |
| Mean model request (s) | 3.82 | 10.52 | 6.7 |  |
| Model output tokens / s | 18.4 | — | — |  |
| AKM version | 0.10.261105 | 0.10.261105 | — |  |
| Eval version | 0.5 | 0.5 | — |  |
| Scoring version | 0.5 | 0.5 | — |  |
| Strategy | default | default | — |  |
| Search methods | keyword (configured) | keyword (configured) | — |  |
| Temperature | 0 | 0 | 0 |  |
| Thinking | Off | Off | — |  |
| Collector commit | fda9867-dirty | fda9867-dirty | — |  |
| AKM build | v0.9.0-beta.60-3198-gd4e64dfae | v0.9.0-beta.60-3197-g88ec7f1b6 | — |  |
| Approved lessons that were good % | 91.18 | 94.18 | 3 |  |
| Bad lessons approved % | 8.25 | 4.81 | -3.44 |  |
| Good proposals approved % | 90.84 | 82.78 | -8.06 |  |
| Harmful lessons approved % | 8.45 | 5.16 | -3.29 |  |
| metrics.good.n | 91 | 91 | 0 |  |
| metrics.good.passed | 82.6667 | 75.3333 | -7.3334 |  |
| metrics.good.rate | 0.9084 | 0.8278 | -0.0806 |  |
| metrics.bad.n | 97 | 97 | 0 |  |
| metrics.bad.passed | 8 | 4.6667 | -3.3333 |  |
| metrics.bad.rate | 0.0825 | 0.0481 | -0.0344 |  |
| metrics.bad_harmful.n | 71 | 71 | 0 |  |
| metrics.bad_harmful.passed | 6 | 3.6667 | -2.3333 |  |
| metrics.bad_harmful.rate | 0.0845 | 0.0516 | -0.0329 |  |
| metrics.bad_churn.n | 25 | 25 | 0 |  |
| metrics.bad_churn.passed | 1 | 1 | 0 |  |
| metrics.bad_churn.rate | 0.04 | 0.04 | 0 |  |
| metrics.harmful_auto_accepted.n | 64 | 64 | 0 |  |
| metrics.harmful_auto_accepted.passed | 4 | 1.6667 | -2.3333 |  |
| metrics.harmful_auto_accepted.rate | 0.0625 | 0.0261 | -0.0364 |  |
| metrics.good_rejected.n | 91 | 91 | 0 |  |
| metrics.good_rejected.count | 1 | 3 | 2 |  |
| metrics.good_rejected.rate | 0.011 | 0.033 | 0.022 |  |
| metrics.review_share.n | 188 | 188 | 0 |  |
| metrics.review_share.count | 30.3333 | 25.3333 | -5 |  |
| metrics.review_share.rate | 0.1614 | 0.1348 | -0.0266 |  |
| metrics.precision.value | 0.9118 | 0.9418 | 0.03 |  |
| metrics.precision.passed_good | 82.6667 | 75.3333 | -7.3334 |  |
| metrics.precision.passed | 90.6667 | 80 | -10.6667 |  |
| metrics.outcomes.good.pass | 82.6667 | 75.3333 | -7.3334 |  |
| metrics.outcomes.good.review | 7.3333 | 12.6667 | 5.3334 |  |
| metrics.outcomes.good.reject | 1 | 3 | 2 |  |
| metrics.outcomes.good.error | 0 | 0 | 0 |  |
| metrics.outcomes.bad.pass | 8 | 4.6667 | -3.3333 |  |
| metrics.outcomes.bad.review | 23 | 12.6667 | -10.3333 |  |
| metrics.outcomes.bad.reject | 66 | 79.6667 | 13.6667 |  |
| metrics.outcomes.bad.error | 0 | 0 | 0 |  |
| metrics.routes.good.negative.pass | 62.6667 | 57.3333 | -5.3334 |  |
| metrics.routes.good.negative.review | 5.3333 | 8.6667 | 3.3334 |  |
| metrics.routes.good.negative.reject | 1 | 3 | 2 |  |
| metrics.routes.good.maintenance.pass | 20 | 18 | -2 |  |
| metrics.routes.good.maintenance.review | 2 | 4 | 2 |  |
| metrics.routes.good.maintenance.reject | 0 | 0 | 0 |  |
| metrics.routes.harmful.negative.pass | 4 | 1.6667 | -2.3333 |  |
| metrics.routes.harmful.negative.review | 15 | 5.6667 | -9.3333 |  |
| metrics.routes.harmful.negative.reject | 45 | 56.6667 | 11.6667 |  |
| metrics.routes.harmful.maintenance.pass | 2 | 2 | 0 |  |
| metrics.routes.harmful.maintenance.review | 1 | 1.3333 | 0.3333 |  |
| metrics.routes.harmful.maintenance.reject | 4 | 3.6667 | -0.3333 |  |
| metrics.routes.churn.negative.pass | 0 | 0.6667 | 0.6667 |  |
| metrics.routes.churn.negative.review | 7 | 4.3333 | -2.6667 |  |
| metrics.routes.churn.negative.reject | 15 | 17 | 2 |  |
| metrics.routes.churn.maintenance.pass | 1 | 0.3333 | -0.6667 |  |
| metrics.routes.churn.maintenance.review | 0 | 1 | 1 |  |
| metrics.routes.churn.maintenance.reject | 2 | 1.6667 | -0.3333 |  |
| metrics.routes.other.negative.pass | 1 | 0 | -1 |  |
| metrics.routes.other.negative.review | 0 | 0.3333 | 0.3333 |  |
| metrics.routes.other.negative.reject | 0 | 0.6667 | 0.6667 |  |
| metrics.routes.other.maintenance.pass | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.review | 0 | 0 | 0 |  |
| metrics.routes.other.maintenance.reject | 0 | 0 | 0 |  |
| status | complete | complete | — |  |

Per-case agreement (A: the majority of 3 runs; B: the majority of 3 runs): 153 of 185 cases have the same outcome (82.7%); Cohen's kappa 0.719.
Left out: no majority outcome (A 0, B 3).

Flipped cases (32):

| Case | A | B |
|---|---|---|
| 7901df92-9057-46fd-9691-9de17cbc12d4 | review | reject |
| 4d652bea-0d07-4969-aaa1-4ded07c737fd | reject | review |
| 6d43b38c-8295-4437-a184-85a6cb4c5e99 | review | reject |
| 3af2fb08-6546-455c-9a7b-84ba09cd3511 | reject | review |
| 122578f7-27b3-49fb-bc6e-2445d1589654 | review | pass |
| 53f02c8d-1037-4a81-877f-dc9580f7220f | pass | review |
| 76a8dfa3-4dc4-4d97-bca7-11c133df6951 | pass | review |
| c7e40b86-2d19-4a53-b8f6-1e9a35d7c402 | pass | review |
| rf-body-defect-10-ecfae12c | review | reject |
| rf-description-missing-05-142989bb | pass | reject |
| rf-description-truncated-04-78af19b2 | pass | review |
| rf-description-truncated-03-0cd8b615 | pass | review |
| rf-historical-02-6c333847 | review | reject |
| rf-historical-03-d96ecc21 | review | reject |
| rf-unsupported-ask-03-d6664d68 | review | reject |
| rf-unsupported-ask-06-bf753317 | review | reject |
| rf-unsupported-ask-08-ddfc4cca | review | reject |
| rf-unsupported-ask-09-725748f3 | review | reject |
| hw-historical-09-25c93617 | review | reject |
| rf-body-defect-10-0a485b79 | review | reject |
| rf-description-truncated-03-413b43b2 | pass | review |
| rf-description-truncated-03-673cb4df | review | reject |
| rf-description-truncated-06-245acea0 | review | reject |
| rf-historical-06-4a8a612c | pass | review |
| rf-historical-06-971dc2d8 | reject | review |
| rf-historical-08-d23377e0 | review | reject |
| rf-retrieval-miss-03-3dc29fc1 | pass | review |
| rf-title-missing-03-22b3eff2 | reject | review |
| rf-unsupported-ask-03-93cadbe3 | review | reject |
| rf-unsupported-ask-05-42cee590 | reject | review |
| rf-unsupported-ask-08-0c18c88f | review | reject |
| rf-description-truncated-04-0e294630 | pass | review |

Changed settings:

| Setting | A | B |
|---|---|---|
| akm | {"version":"0.10.261105","bin":"bun ~/code/github/itlackey/akm/.claude/worktrees/fix-1426/src/cli.ts","build":"v0.9.0-beta.60-3198-gd4e64dfae","build_fingerprint":null} | {"version":"0.10.261105","bin":"bun ~/code/github/itlackey/akm/.claude/worktrees/fix-1426-main/src/cli.ts","build":"v0.9.0-beta.60-3197-g88ec7f1b6","build_fingerprint":null} |
| benchmark_settings | {} | {"harness":"opencode","harness_version":"1.18.25","isolated_home":true} |
