# bakeoff · eval 0.4 · scoring 0.4

A: 0.10.261011-beta-flash-semantic-full-20261023 (reports/0.10.261011-beta-flash/bakeoff/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023)
B: flint-don-q4-recommended-full-20261025 (reports/flint-don-2026-10-25/recommended-full)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.

Publication note: location and installed-binary paths are normalized. "Thinking: Off" is the requested configuration; Flint still generated reasoning. See [protocol and native evidence](README.md).

- Several settings changed; these differences do not isolate the effect of any one change.

| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Model / route | moe/qwen3.8-flash-next-iq2_xs | flint-q4-k-m | — |  |
| Run | 0.10.261011-beta-flash-semantic-full-20261023 | flint-don-q4-recommended-full-20261025 | — |  |
| Test | bakeoff | bakeoff | — |  |
| Collected (UTC) | 2026-10-23T08:52:12.053Z | 2026-10-25T23:52:03.849Z | — |  |
| Quality % | 94.55 | 72.73 | -21.82 |  |
| Quality metric | Cases passed | Cases passed | — |  |
| Quality passed | 52 | 40 | -12 |  |
| Quality cases | 55 | 55 | 0 |  |
| Cases recorded | 55 | 55 | 0 |  |
| Cases scored | 55 | 55 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Case mean (s) | 5.430909 | 60.585455 | 55.154545 |  |
| Case p50 (s) | 4.1 | 28.4 | 24.3 |  |
| Case p95 (s) | 13.54 | 173.95 | 160.41 |  |
| Cases timed | 55 | 55 | 0 |  |
| Case time sum (s) | 298.7 | 3332.2 | 3033.5 |  |
| Run wall time (s) | 298.659 | 3332.389 | 3033.73 |  |
| Run wall time basis | Runner elapsed | Runner elapsed | — |  |
| Model calls | 113 | 110 | -3 |  |
| Failed model calls | 2 | 1 | -1 |  |
| Mean input tokens / call | 623.9 | 424.6 | -199.3 |  |
| Mean output tokens / call | 101.2 | 1822.3 | 1721.1 |  |
| Mean model request (s) | 2.17 | 27.36 | 25.19 |  |
| Model output tokens / s | 46.6 | 66.6 | 20 |  |
| AKM version | 0.10.261011-beta | 0.10.261011-beta | — |  |
| Eval version | 0.4 | 0.4 | — |  |
| Scoring version | 0.4 | 0.4 | — |  |
| Search methods | semantic (configured) | semantic (configured) | — |  |
| Temperature | 0 | 1 | 1 |  |
| Thinking | Off | Off | — |  |
| Collector commit | 307e636 | b4725addaed4bed0f12c9659f72da3125f5c4b7c | — |  |
| Cases passed % | 94.55 | 72.73 | -21.82 |  |
| Checks passed % | 98.45 | 78.3 | -20.15 |  |
| Usable outputs % | 90.91 | 81.82 | -9.09 |  |
| metrics.valid_output.n | 55 | 55 | 0 |  |
| metrics.valid_output.passed | 50 | 45 | -5 |  |
| metrics.valid_output.rate | 0.9091 | 0.8182 | -0.0909 |  |
| metrics.case_pass.n | 55 | 55 | 0 |  |
| metrics.case_pass.passed | 52 | 40 | -12 |  |
| metrics.case_pass.rate | 0.9455 | 0.7273 | -0.2182 |  |
| metrics.checks.n | 55 | 55 | 0 |  |
| metrics.checks.rate | 0.9845 | 0.783 | -0.2015 |  |
| metrics.median_seconds | 4.1 | 28.4 | 24.3 |  |
| metrics.by_process.memory-inference.n | 23 | 23 | 0 |  |
| metrics.by_process.memory-inference.valid_output | 18 | 20 | 2 |  |
| metrics.by_process.memory-inference.passed | 23 | 21 | -2 |  |
| metrics.by_process.memory-inference.checks | 1 | 0.913 | -0.087 |  |
| metrics.by_process.memory-inference.outcomes.output | 18 | 20 | 2 |  |
| metrics.by_process.memory-inference.outcomes.no-change | 5 | 3 | -2 |  |
| metrics.by_process.memory-inference.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.memory-inference.outcomes.error | 0 | 0 | 0 |  |
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
| metrics.by_process.schema-repair.passed | 8 | 6 | -2 |  |
| metrics.by_process.schema-repair.checks | 1 | 0.8125 | -0.1875 |  |
| metrics.by_process.schema-repair.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.schema-repair.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.schema-repair.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.n | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.passed | 6 | 6 | 0 |  |
| metrics.by_process.session-summary.checks | 0.925 | 0.925 | 0 |  |
| metrics.by_process.session-summary.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.session-summary.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.session-summary.failed.topics include webhooks.md | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include v3/subscriptions | 1 | 1 | 0 |  |
| metrics.by_process.session-summary.failed.topics include android.yml | 1 | — | — |  |
| metrics.by_process.consolidate-promote.n | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.valid_output | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.passed | 7 | 6 | -1 |  |
| metrics.by_process.consolidate-promote.checks | 0.9688 | 0.8958 | -0.073 |  |
| metrics.by_process.consolidate-promote.outcomes.output | 8 | 8 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.no-change | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.unusable | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.outcomes.error | 0 | 0 | 0 |  |
| metrics.by_process.consolidate-promote.failed.no extra or missing promotions | 1 | 1 | 0 |  |
| status | complete | complete | — |  |
| metrics.by_process.memory-inference.failed.decides no-change | — | 2 | — |  |
| metrics.by_process.remember-enrich.failed.preserves explicit date | — | 3 | — |  |
| metrics.by_process.schema-repair.failed.trigger is concrete | — | 2 | — |  |
| metrics.by_process.schema-repair.failed.generated fields are grounded in the body | — | 1 | — |  |
| metrics.by_process.session-summary.failed.topics include due_dates.py | — | 1 | — |  |
| metrics.by_process.consolidate-promote.failed.leaves protected memories/operator-preference untouched | — | 1 | — |  |
| metrics.by_process.consolidate-promote.failed.promotes memories/artifact-signing-observation | — | 1 | — |  |

Changed settings:

| Setting | A | B |
|---|---|---|
| model | moe/qwen3.8-flash-next-iq2_xs | flint-q4-k-m |
| akm | {"version":"0.10.261011-beta","bin":"installed akm-cli 0.10.261011-beta","build":null,"build_fingerprint":null} | {"version":"0.10.261011-beta","bin":"akm","build":null,"build_fingerprint":null} |
| config | {"configVersion":"0.9.0","semanticSearchMode":"auto","registries":[],"engines":{"bakeoff":{"kind":"llm","provider":"openai","apiKey":"$MODEL_API_KEY"}},"defaults":{"llmEngine":"bakeoff"},"experimental":{"improveAutonomy":true},"improve":{"strategies":{"bakeoff-memory-inference":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":true},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-schema-repair":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":true},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-session-summary":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":true,"indexSessions":true,"minSessionDuration":0,"triage":{"enabled":false}},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-consolidate-promote":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":true,"minPoolSize":0},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}}}},"embedding":{"localModel":"Xenova/bge-small-en-v1.5","queryTimeoutMs":600000}} | {"configVersion":"0.9.0","semanticSearchMode":"auto","registries":[],"engines":{"bakeoff":{"kind":"llm","provider":"openai","extraParams":{"top_p":0.95,"top_k":20}}},"defaults":{"llmEngine":"bakeoff"},"experimental":{"improveAutonomy":true},"improve":{"strategies":{"bakeoff-memory-inference":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":true},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-schema-repair":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":true},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-session-summary":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":false},"memoryInference":{"enabled":false},"extract":{"enabled":true,"indexSessions":true,"minSessionDuration":0,"triage":{"enabled":false}},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}},"bakeoff-consolidate-promote":{"engine":"bakeoff","processes":{"reflect":{"enabled":false},"distill":{"enabled":false},"consolidate":{"enabled":true,"minPoolSize":0},"memoryInference":{"enabled":false},"extract":{"enabled":false},"validation":{"enabled":false},"triage":{"enabled":false},"proactiveMaintenance":{"enabled":false}},"sync":{"enabled":false,"push":false}}}},"embedding":{"provider":"openai","endpoint":"<MODEL_BASE_URL>/v1/embeddings","model":"embed/qwen3-embedding-0.6b","apiKey":"$LAB_API_KEY","dimension":1024,"queryTimeoutMs":600000,"timeoutMs":600000}} |
| settings | {"strategy":null,"config_patch_sha256":"591a6213cec2890f9c7e4cd52a35c9e2eab91bf5db0879f27aa6efd178555ef5","timeout_ms":900000,"seed":null} | {"strategy":null,"config_patch_sha256":"d4370eed832283cf2e8058997b4a892409265c5f40859f32e2cb17edb23d1874","timeout_ms":900000,"seed":null} |
| engines | {"bakeoff":{"model":"moe/qwen3.8-flash-next-iq2_xs","endpoint":"<MODEL_BASE_URL>","temperature":0,"enableThinking":false,"timeoutMs":600000}} | {"bakeoff":{"model":"flint-q4-k-m","endpoint":"<MODEL_BASE_URL>","temperature":1,"enableThinking":false,"timeoutMs":600000}} |
