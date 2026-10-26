# bakeoff · eval 0.4 · scoring 0.4

**Read first:** B has three integration errors and only two scored cases.
Its 50% is 1/2 scored, not comparable to A's 2/5. Its shorter elapsed time
reflects missing work, not a completed-job speedup. "Thinking: Off" is only
the requested setting. See [the interpretation and controls](README.md).

A: flint-don-q4-recommended-pilot-20261025 (reports/flint-don-2026-10-25/recommended-pilot)
B: flint-don-rec-int4-recommended-pilot-20261025 (reports/flint-don-2026-10-25/rec/pilot)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

- Several settings changed; these differences do not isolate the effect of any one change.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | flint-q4-k-m | flint | — |  |
| Run | flint-don-q4-recommended-pilot-20261025 | flint-don-rec-int4-recommended-pilot-20261025 | — |  |
| Test | bakeoff | bakeoff | — |  |
| Collected (UTC) | 2026-10-25T22:56:07.684Z | 2026-10-26T01:16:13.128Z | — |  |
| Quality % | 40 | 50 | 10 |  |
| Quality metric | Cases passed | Cases passed | — |  |
| Quality passed | 2 | 1 | -1 |  |
| Quality cases | 5 | 2 | -3 |  |
| Cases recorded | 5 | 5 | 0 |  |
| Cases scored | 5 | 2 | -3 |  |
| Errors | 0 | 3 | 3 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 119.36 | 4.58 | -114.78 |  |
| Case p50 (s) | 33.6 | 1 | -32.6 |  |
| Case p95 (s) | 405.58 | 14.22 | -391.36 |  |
| Cases timed | 5 | 5 | 0 |  |
| Case time sum (s) | 596.8 | 22.9 | -573.9 |  |
| Run wall time (s) | 596.79 | 22.836 | -573.954 |  |
| Run wall time basis | Runner elapsed | Runner elapsed | — |  |
| Model calls | 11 | 6 | -5 |  |
| Failed model calls | 0 | 0 | 0 |  |
| Mean input tokens / call | 453 | 311.3 | -141.7 |  |
| Mean output tokens / call | 3591 | 350.5 | -3240.5 |  |
| Mean model request (s) | 53.93 | 3.39 | -50.54 |  |
| Model output tokens / s | 66.6 | 103.5 | 36.9 |  |
| AKM version | 0.10.261011-beta | 0.10.261011-beta | — |  |
| Eval version | 0.4 | 0.4 | — |  |
| Scoring version | 0.4 | 0.4 | — |  |
| Search methods | semantic (configured) | semantic (configured) | — |  |
| Temperature | 1 | 1 | 0 |  |
| Thinking | Off | Off | — |  |
| Case limit | 5 | 5 | 0 |  |
| Collector commit | b4725addaed4bed0f12c9659f72da3125f5c4b7c | b4725addaed4bed0f12c9659f72da3125f5c4b7c | — |  |
| Cases passed % | 40 | 50 | 10 |  |
| Checks passed % | 60 | 50 | -10 |  |
| Usable outputs % | 80 | 50 | -30 |  |
| metrics.valid_output.n | 5 | 2 | -3 |  |
| metrics.valid_output.passed | 4 | 1 | -3 |  |
| metrics.valid_output.rate | 0.8 | 0.5 | -0.3 |  |
| metrics.case_pass.n | 5 | 2 | -3 |  |
| metrics.case_pass.passed | 2 | 1 | -1 |  |
| metrics.case_pass.rate | 0.4 | 0.5 | 0.1 |  |
| metrics.checks.n | 5 | 2 | -3 |  |
| metrics.checks.rate | 0.6 | 0.5 | -0.1 |  |
| metrics.median_seconds | 33.6 | 10.1 | -23.5 |  |
| metrics.by_process.memory-inference.n | 1 | 0 | -1 |  |
| metrics.by_process.memory-inference.valid_output | 1 | 0 | -1 |  |
| metrics.by_process.memory-inference.passed | 1 | 0 | -1 |  |
| metrics.by_process.memory-inference.checks | 1 | — | — |  |
| metrics.by_process.memory-inference.outcomes.output | 1 | 0 | -1 |  |
| metrics.by_process.memory-inference.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.outcomes.error | 0 | 1 | 1 |  |
| metrics.by_process.remember-enrich.n | 1 | 1 | 0 |  |
| metrics.by_process.remember-enrich.valid_output | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.passed | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.checks | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.output | 1 | 0 | -1 |  |
| metrics.by_process.remember-enrich.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.unusable | 0 | 1 | 1 |  |
| metrics.by_process.remember-enrich.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.failed.preserves explicit date | 1 | 1 | 0 |  |
| metrics.by_process.schema-repair.n | 1 | 0 | -1 |  |
| metrics.by_process.schema-repair.valid_output | 1 | 0 | -1 |  |
| metrics.by_process.schema-repair.passed | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.checks | 0.5 | — | — |  |
| metrics.by_process.schema-repair.outcomes.output | 1 | 0 | -1 |  |
| metrics.by_process.schema-repair.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.error | 0 | 1 | 1 |  |
| metrics.by_process.schema-repair.failed.trigger is concrete | 1 | — | — |  |
| metrics.by_process.session-summary.n | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.valid_output | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.passed | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.checks | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.outcomes.output | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.n | 1 | 0 | -1 |  |
| metrics.by_process.consolidate-promote.valid_output | 1 | 0 | -1 |  |
| metrics.by_process.consolidate-promote.passed | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.checks | 0.5 | — | — |  |
| metrics.by_process.consolidate-promote.outcomes.output | 1 | 0 | -1 |  |
| metrics.by_process.consolidate-promote.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.error | 0 | 1 | 1 |  |
| metrics.by_process.consolidate-promote.failed.leaves protected memories/operator-preference untouched | 1 | — | — |  |
| metrics.by_process.consolidate-promote.failed.no extra or missing promotions | 1 | — | — |  |
| status | complete | complete | — |  |
| metrics.by_process.remember-enrich.failed.metadata covers queue | — | 1 | — |  |
| metrics.by_process.remember-enrich.failed.metadata covers checkpoint | — | 1 | — |  |
| metrics.by_process.remember-enrich.failed.metadata covers recovery | — | 1 | — |  |

Changed settings:

| Setting | A | B |
|---|---|---|
| model | flint-q4-k-m | flint |
| config | {"configVersion":"0.9.0","semanticSearchMode":"auto","registries":[],"engines":{"bakeoff":{"kind":"llm","provider":"openai","extraParams":{"top_p":0.95,"top_k":20}}},"defaults":{"llmEngine":"bakeoff"},"experimental":{"improveAutonomy":true},"improve":{"strategies":{"bakeoff-memory-inference":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":true},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-schema-repair":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":true},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-session-summary":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":true,"indexSessions":true,"minSessionDuration":0,"triage":{"enabled":false}},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-consolidate-promote":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":true,"minPoolSize":0},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}}}},"embedding":{"provider":"openai","endpoint":"<MODEL_BASE_URL>/v1/embeddings","model":"embed/qwen3-embedding-0.6b","apiKey":"$LAB_API_KEY","dimension":1024,"queryTimeoutMs":600000,"timeoutMs":600000}} | {"configVersion":"0.9.0","semanticSearchMode":"auto","registries":[],"engines":{"bakeoff":{"kind":"llm","provider":"openai","apiKey":"$MODEL_API_KEY","extraParams":{"top_p":0.95,"top_k":20}}},"defaults":{"llmEngine":"bakeoff"},"experimental":{"improveAutonomy":true},"improve":{"strategies":{"bakeoff-memory-inference":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":true},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-schema-repair":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":true},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-session-summary":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":true,"indexSessions":true,"minSessionDuration":0,"triage":{"enabled":false}},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-consolidate-promote":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":true,"minPoolSize":0},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}}}},"embedding":{"provider":"openai","endpoint":"<MODEL_BASE_URL>/v1/embeddings","model":"embed/qwen3-embedding-0.6b","apiKey":"$LAB_API_KEY","dimension":1024,"queryTimeoutMs":600000,"timeoutMs":600000}} |
| engines | {"bakeoff":{"model":"flint-q4-k-m","endpoint":"<MODEL_BASE_URL>","temperature":1,"enableThinking":false,"timeoutMs":600000}} | {"bakeoff":{"model":"flint","endpoint":"<MODEL_BASE_URL>","temperature":1,"enableThinking":false,"timeoutMs":600000}} |
