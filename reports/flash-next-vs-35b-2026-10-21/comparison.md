# bakeoff · eval 0.2 · scoring 0.2

A: fast-35b-q2-semantic-matched-full-20261021 (reports/0.10.261005-beta/bakeoff/2026-10-21-fast-35b-q2-semantic-matched-full-20261021)
B: flash-next-iq2-xs-semantic-full-20261021 (reports/0.10.261005-beta/bakeoff/2026-10-21-flash-next-iq2-xs-semantic-full-20261021)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

- Several settings changed; these differences do not isolate the effect of any one change.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | fast/qwen3.6-35b-a3b | splinter-b70/qwen3.8-flash-next-iq2_xs | — |  |
| Run | fast-35b-q2-semantic-matched-full-20261021 | flash-next-iq2-xs-semantic-full-20261021 | — |  |
| Test | bakeoff | bakeoff | — |  |
| Collected (UTC) | 2026-10-21T02:33:44.286Z | 2026-10-21T02:30:10.746Z | — |  |
| Quality % | 67.5 | 85 | 17.5 |  |
| Quality metric | Cases passed | Cases passed | — |  |
| Quality passed | 27 | 34 | 7 |  |
| Quality cases | 40 | 40 | 0 |  |
| Cases recorded | 40 | 40 | 0 |  |
| Cases scored | 40 | 40 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 4.98 | 6.5975 | 1.6175 |  |
| Case p50 (s) | 2.6 | 3.95 | 1.35 |  |
| Case p95 (s) | 11.69 | 15.065 | 3.375 |  |
| Cases timed | 40 | 40 | 0 |  |
| Case time sum (s) | 199.2 | 263.9 | 64.7 |  |
| Run wall time (s) | 199.458 | 263.872 | 64.414 |  |
| Run wall time basis | Runner elapsed | Runner elapsed | — |  |
| Model calls | 80 | 81 | 1 |  |
| Failed model calls | 0 | 2 | 2 |  |
| Mean input tokens / call | 477.5 | 602.2 | 124.7 |  |
| Mean output tokens / call | 160.7 | 144.7 | -16 |  |
| Mean model request (s) | 2.12 | 2.84 | 0.72 |  |
| Model output tokens / s | 75.9 | 50.9 | -25 |  |
| AKM version | 0.10.261005-beta | 0.10.261005-beta | — |  |
| Eval version | 0.2 | 0.2 | — |  |
| Scoring version | 0.2 | 0.2 | — |  |
| Search methods | semantic (configured) | semantic (configured) | — |  |
| Temperature | 0 | 0 | 0 |  |
| Thinking | Off | Off | — |  |
| Collector commit | be1e8be64eb7e2d65c885a246776c5720b041eab | be1e8be64eb7e2d65c885a246776c5720b041eab | — |  |
| Cases passed % | 67.5 | 85 | 17.5 |  |
| Checks passed % | 88.38 | 93.79 | 5.41 |  |
| Usable outputs % | 100 | 97.5 | -2.5 |  |
| metrics.valid_output.n | 40 | 40 | 0 |  |
| metrics.valid_output.passed | 40 | 39 | -1 |  |
| metrics.valid_output.rate | 1 | 0.975 | -0.025 |  |
| metrics.case_pass.n | 40 | 40 | 0 |  |
| metrics.case_pass.passed | 27 | 34 | 7 |  |
| metrics.case_pass.rate | 0.675 | 0.85 | 0.175 |  |
| metrics.checks.n | 40 | 40 | 0 |  |
| metrics.checks.rate | 0.8838 | 0.9379 | 0.0541 |  |
| metrics.median_seconds | 2.6 | 3.9 | 1.3 |  |
| metrics.by_process.memory-inference.n | 8 | 8 | 0 |  |
| metrics.by_process.memory-inference.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.memory-inference.passed | 7 | 8 | 1 |  |
| metrics.by_process.memory-inference.checks | 0.9688 | 1 | 0.0312 |  |
| metrics.by_process.memory-inference.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.memory-inference.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.failed.retains explicit date | 1 | — | — |  |
| metrics.by_process.remember-enrich.n | 8 | 8 | 0 |  |
| metrics.by_process.remember-enrich.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.remember-enrich.passed | 7 | 7 | 0 |  |
| metrics.by_process.remember-enrich.checks | 0.9688 | 0.9688 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.failed.preserves explicit date | 1 | — | — |  |
| metrics.by_process.schema-repair.n | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.passed | 6 | 8 | 2 |  |
| metrics.by_process.schema-repair.checks | 0.8125 | 1 | 0.1875 |  |
| metrics.by_process.schema-repair.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.failed.generated fields are grounded in the body | 1 | — | — |  |
| metrics.by_process.schema-repair.failed.trigger is concrete | 2 | — | — |  |
| metrics.by_process.session-summary.n | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.valid_output | 8 | 7 | -1 |  |
| metrics.by_process.session-summary.passed | 2 | 4 | 2 |  |
| metrics.by_process.session-summary.checks | 0.7833 | 0.7833 | 0 |  |
| metrics.by_process.session-summary.outcomes.output | 8 | 7 | -1 |  |
| metrics.by_process.session-summary.outcomes.unusable | 0 | 1 | 1 |  |
| metrics.by_process.session-summary.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.failed.topics include due_dates.py | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include 2291 | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include worker-node-7 | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include webhooks.md | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include v3/subscriptions | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include stg_payments_by_order | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include android.yml | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include interior.pdf | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include preamble.tex | 1 | 1 | 0 |  |
| metrics.by_process.consolidate-promote.n | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.passed | 5 | 7 | 2 |  |
| metrics.by_process.consolidate-promote.checks | 0.8854 | 0.9375 | 0.0521 |  |
| metrics.by_process.consolidate-promote.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.failed.no extra or missing promotions | 1 | 1 | 0 |  |
| metrics.by_process.consolidate-promote.failed.leaves protected memories/operator-preference untouched | 1 | 1 | 0 |  |
| metrics.by_process.consolidate-promote.failed.leaves protected memories/failover-drill-placeholder untouched | 1 | — | — |  |
| status | complete | complete | — |  |
| metrics.by_process.remember-enrich.failed.metadata covers pt-br | — | 1 | — |  |
| metrics.by_process.session-summary.failed.summary retains fct_orders | — | 1 | — |  |
| metrics.by_process.session-summary.failed.summary retains stg_payments_by_order | — | 1 | — |  |
| metrics.by_process.session-summary.failed.summary retains dbt | — | 1 | — |  |
| metrics.by_process.session-summary.failed.topics include fct_orders | — | 1 | — |  |
| metrics.by_process.session-summary.failed.topics include checkout.spec.ts | — | 1 | — |  |

Changed settings:

| Setting | A | B |
|---|---|---|
| model | fast/qwen3.6-35b-a3b | splinter-b70/qwen3.8-flash-next-iq2_xs |
| engines | {"bakeoff":{"model":"fast/qwen3.6-35b-a3b","endpoint":"https://ai.lab.fwdslsh.dev","temperature":0,"enableThinking":false,"timeoutMs":600000}} | {"bakeoff":{"model":"splinter-b70/qwen3.8-flash-next-iq2_xs","endpoint":"https://ai.lab.fwdslsh.dev","temperature":0,"enableThinking":false,"timeoutMs":600000}} |
