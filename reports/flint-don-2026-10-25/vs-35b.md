# bakeoff · eval 0.4 · scoring 0.4

A: 0.10.261011-beta-35b-semantic-full-20261022 (reports/0.10.261011-beta/bakeoff/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022)
B: flint-don-q4-recommended-full-20261025 (reports/flint-don-2026-10-25/recommended-full)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

Publication note: location and installed-binary paths are normalized. "Thinking: Off" is the requested configuration; Flint still generated reasoning. See [protocol and native evidence](README.md).

- Several settings changed; these differences do not isolate the effect of any one change.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | fast/qwen3.6-35b-a3b | flint-q4-k-m | — |  |
| Run | 0.10.261011-beta-35b-semantic-full-20261022 | flint-don-q4-recommended-full-20261025 | — |  |
| Test | bakeoff | bakeoff | — |  |
| Collected (UTC) | 2026-10-22T10:46:06.961Z | 2026-10-25T23:52:03.849Z | — |  |
| Quality % | 78.18 | 72.73 | -5.45 |  |
| Quality metric | Cases passed | Cases passed | — |  |
| Quality passed | 43 | 40 | -3 |  |
| Quality cases | 55 | 55 | 0 |  |
| Cases recorded | 55 | 55 | 0 |  |
| Cases scored | 55 | 55 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 4.409091 | 60.585455 | 56.176364 |  |
| Case p50 (s) | 3.8 | 28.4 | 24.6 |  |
| Case p95 (s) | 10.45 | 173.95 | 163.5 |  |
| Cases timed | 55 | 55 | 0 |  |
| Case time sum (s) | 242.5 | 3332.2 | 3089.7 |  |
| Run wall time (s) | 242.6 | 3332.389 | 3089.789 |  |
| Run wall time basis | Runner elapsed | Runner elapsed | — |  |
| Model calls | 112 | 110 | -2 |  |
| Failed model calls | 0 | 1 | 1 |  |
| Mean input tokens / call | 480.3 | 424.6 | -55.7 |  |
| Mean output tokens / call | 119.6 | 1822.3 | 1702.7 |  |
| Mean model request (s) | 1.63 | 27.36 | 25.73 |  |
| Model output tokens / s | 73.5 | 66.6 | -6.9 |  |
| AKM version | 0.10.261011-beta | 0.10.261011-beta | — |  |
| Eval version | 0.4 | 0.4 | — |  |
| Scoring version | 0.4 | 0.4 | — |  |
| Search methods | semantic (configured) | semantic (configured) | — |  |
| Temperature | 0 | 1 | 1 |  |
| Thinking | Off | Off | — |  |
| Collector commit | 307e636-dirty | b4725addaed4bed0f12c9659f72da3125f5c4b7c | — |  |
| Cases passed % | 78.18 | 72.73 | -5.45 |  |
| Checks passed % | 89.43 | 78.3 | -11.13 |  |
| Usable outputs % | 94.55 | 81.82 | -12.73 |  |
| metrics.valid_output.n | 55 | 55 | 0 |  |
| metrics.valid_output.passed | 52 | 45 | -7 |  |
| metrics.valid_output.rate | 0.9455 | 0.8182 | -0.1273 |  |
| metrics.case_pass.n | 55 | 55 | 0 |  |
| metrics.case_pass.passed | 43 | 40 | -3 |  |
| metrics.case_pass.rate | 0.7818 | 0.7273 | -0.0545 |  |
| metrics.checks.n | 55 | 55 | 0 |  |
| metrics.checks.rate | 0.8943 | 0.783 | -0.1113 |  |
| metrics.median_seconds | 3.8 | 28.4 | 24.6 |  |
| metrics.by_process.memory-inference.n | 23 | 23 | 0 |  |
| metrics.by_process.memory-inference.valid_output | 20 | 20 | 0 |  |
| metrics.by_process.memory-inference.passed | 19 | 21 | 2 |  |
| metrics.by_process.memory-inference.checks | 0.8957 | 0.913 | 0.0173 |  |
| metrics.by_process.memory-inference.outcomes.output | 20 | 20 | 0 |  |
| metrics.by_process.memory-inference.outcomes.no-change | 3 | 3 | 0 |  |
| metrics.by_process.memory-inference.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.failed.retains explicit date | 1 | — | — |  |
| metrics.by_process.memory-inference.failed.decides no-change | 2 | 2 | 0 |  |
| metrics.by_process.memory-inference.failed.retains size_limit | 1 | — | — |  |
| metrics.by_process.remember-enrich.n | 8 | 8 | 0 |  |
| metrics.by_process.remember-enrich.valid_output | 8 | 1 | -7 |  |
| metrics.by_process.remember-enrich.passed | 8 | 1 | -7 |  |
| metrics.by_process.remember-enrich.checks | 1 | 0.125 | -0.875 |  |
| metrics.by_process.remember-enrich.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.remember-enrich.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.n | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.passed | 7 | 6 | -1 |  |
| metrics.by_process.schema-repair.checks | 0.875 | 0.8125 | -0.0625 |  |
| metrics.by_process.schema-repair.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.failed.generated fields are grounded in the body | 1 | 1 | 0 |  |
| metrics.by_process.schema-repair.failed.trigger is concrete | 1 | 2 | 1 |  |
| metrics.by_process.session-summary.n | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.passed | 3 | 6 | 3 |  |
| metrics.by_process.session-summary.checks | 0.8444 | 0.925 | 0.0806 |  |
| metrics.by_process.session-summary.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.failed.summary retains object store | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include due_dates.py | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include webhooks.md | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include v3/subscriptions | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include android.yml | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include interior.pdf | 1 | — | — |  |
| metrics.by_process.session-summary.failed.topics include preamble.tex | 1 | — | — |  |
| metrics.by_process.consolidate-promote.n | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.passed | 6 | 6 | 0 |  |
| metrics.by_process.consolidate-promote.checks | 0.8542 | 0.8958 | 0.0416 |  |
| metrics.by_process.consolidate-promote.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.failed.leaves protected memories/operator-preference untouched | 2 | 1 | -1 |  |
| metrics.by_process.consolidate-promote.failed.no extra or missing promotions | 1 | 1 | 0 |  |
| metrics.by_process.consolidate-promote.failed.promotes memories/artifact-signing-observation | 1 | 1 | 0 |  |
| status | complete | complete | — |  |
| metrics.by_process.remember-enrich.failed.preserves explicit date | — | 3 | — |  |

Changed settings:

| Setting | A | B |
|---|---|---|
| model | fast/qwen3.6-35b-a3b | flint-q4-k-m |
| config | {"configVersion":"0.9.0","semanticSearchMode":"auto","registries":[],"engines":{"bakeoff":{"kind":"llm","provider":"openai","apiKey":"$MODEL_API_KEY"}},"defaults":{"llmEngine":"bakeoff"},"experimental":{"improveAutonomy":true},"improve":{"strategies":{"bakeoff-memory-inference":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":true},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-schema-repair":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":true},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-session-summary":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":true,"indexSessions":true,"minSessionDuration":0,"triage":{"enabled":false}},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-consolidate-promote":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":true,"minPoolSize":0},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}}}},"embedding":{"localModel":"Xenova/bge-small-en-v1.5","queryTimeoutMs":600000}} | {"configVersion":"0.9.0","semanticSearchMode":"auto","registries":[],"engines":{"bakeoff":{"kind":"llm","provider":"openai","extraParams":{"top_p":0.95,"top_k":20}}},"defaults":{"llmEngine":"bakeoff"},"experimental":{"improveAutonomy":true},"improve":{"strategies":{"bakeoff-memory-inference":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":true},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-schema-repair":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":true},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-session-summary":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":true,"indexSessions":true,"minSessionDuration":0,"triage":{"enabled":false}},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-consolidate-promote":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":true,"minPoolSize":0},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}}}},"embedding":{"provider":"openai","endpoint":"<MODEL_BASE_URL>/v1/embeddings","model":"embed/qwen3-embedding-0.6b","apiKey":"$LAB_API_KEY","dimension":1024,"queryTimeoutMs":600000,"timeoutMs":600000}} |
| settings | {"strategy":null,"config_patch_sha256":"591a6213cec2890f9c7e4cd52a35c9e2eab91bf5db0879f27aa6efd178555ef5","timeout_ms":900000,"seed":null} | {"strategy":null,"config_patch_sha256":"d4370eed832283cf2e8058997b4a892409265c5f40859f32e2cb17edb23d1874","timeout_ms":900000,"seed":null} |
| engines | {"bakeoff":{"model":"fast/qwen3.6-35b-a3b","endpoint":"<MODEL_BASE_URL>","temperature":0,"enableThinking":false,"timeoutMs":600000}} | {"bakeoff":{"model":"flint-q4-k-m","endpoint":"<MODEL_BASE_URL>","temperature":1,"enableThinking":false,"timeoutMs":600000}} |
