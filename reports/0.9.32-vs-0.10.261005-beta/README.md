# AKM 0.9.32 vs 0.10.261005-beta

Collected incrementally on 2026-10-15–16 UTC. Both releases use the same public cases and runner source `acbafc2`. Docker images layer the exact published `akm-cli` version onto the prebuilt runner; dependencies are installed at image build time. Separate working folders keep each release's indexes independent. Cold indexing starts from a new index with the native embedding model already baked into the image; it does not include a model download.

## Retrieval

Full public library and books collections, native `Xenova/bge-small-en-v1.5`, separate cold indexes, identical relevance labels. Networking was disabled for both runs. No chat-model calls or cloud-model cost.

| Collection | Queries per build | Semantic NDCG@10, 0.9.32 | Semantic NDCG@10, beta | Wall seconds, 0.9.32 | Wall seconds, beta |
|---|---:|---:|---:|---:|---:|
| Library | 136 | 0.8260 | 0.8260 | 298.601 | 294.925 |
| Books | 51 | 0.9088 | 0.9088 | 108.050 | 107.140 |

All returned rankings match across builds, for search, curate and both semantic variants. All four collections completed with zero errors and timeouts. Top-10 judgment coverage is 100%. Library ranking metrics cover 101 answerable task queries; its 10 no-answer queries and 25 non-task inputs are reported separately. Non-task curate abstention remains 4% in both builds. Books contains 51 answerable queries.

The semantic search mean query latency was 0.7182 vs 0.7118 seconds for library and 0.7067 vs 0.7043 for books. Cold native embedding took 18.6 vs 19.0 seconds and 4.6 vs 4.3 seconds respectively. These are single sequential runs on the same host; small timing differences do not establish a performance improvement. Relevance labels combine prior judges, so absolute quality retains that limitation; both releases use the same labels.

Artifacts:

- [0.9.32 library](../0.9.32/retrieval/2026-10-15-compare-0932-semantic-20261014-library/summary.json), [books](../0.9.32/retrieval/2026-10-15-compare-0932-semantic-20261014-books/summary.json)
- [Beta library](../0.10.261005-beta/retrieval/2026-10-15-compare-0105-semantic-20261014-library/summary.json), [books](../0.10.261005-beta/retrieval/2026-10-15-compare-0105-semantic-20261014-books/summary.json)

The deliberate keyword control columns remain part of this retrieval measurement. The semantic columns verify native semantic search; no fallback is treated as semantic.

### Warm-index timing

A separate offline timing check reused each full collection's semantic index and ran 12 queries per collection. Every returned ranking matched the corresponding query in the full cold collection. Keyword indexes are still built afresh. Compare the same 12 query IDs for latency; the 12-query wall time is not a full-collection timing.

| AKM | Collection | Semantic index seconds, cold / warm | Mean semantic search seconds on matching queries, cold / warm |
|---|---|---:|---:|
| 0.9.32 | books | 4.6 / 0.2 | 0.715 / 0.6692 |
| 0.9.32 | library | 18.6 / 0.2 | 0.7242 / 0.6933 |
| 0.10.261005-beta | books | 4.3 / 0.2 | 0.685 / 0.6942 |
| 0.10.261005-beta | library | 19 / 0.2 | 0.7583 / 0.6842 |

These single observations show the cost avoided by index reuse. They do not establish a release-level speed difference.

### SkillRet

The fresh full collections for [0.9.32](../0.9.32/skillret/2026-10-15-compare-0.9.32-semantic-full-20261014/summary.json) and [0.10.261005-beta](../0.10.261005-beta/skillret/2026-10-15-compare-0.10.261005-beta-semantic-full-20261015/summary.json) each cover all 6,006 public skills and 4,392 queries. Both ran in Docker with networking disabled and native BGE semantic search. The beta index contains 6,006 entries and 6,006 embeddings, and every semantic search response passed the collector's semantic-mode check. No chat-model calls were made.

All keyword and semantic rankings, every aggregate ranking metric, and all per-size metrics exactly match across releases. Keyword NDCG@10 is 0.5047; semantic NDCG@10 is 0.5800, Recall@10 0.6618, completeness@10 0.5064 and MAP@10 0.5065. Both modes match curate on all 200 checked queries per build. All 4,392 query IDs are unique and fully scored, with zero reported query errors, timeouts or empty result sets. The fresh beta also exactly matches the [earlier 0.10.261003-beta full collection](../0.10.261003-beta/skillret/bifrost-fast35b-v06-20261013/summary.json); current-build quality reporting now uses the fresh result under its actual version.

| AKM | Cold semantic index seconds | Keyword index seconds | Query collection seconds, eight workers |
|---|---:|---:|---:|
| 0.9.32 | 598.4 | 23.9 | 1,625.7 |
| 0.10.261005-beta | 522.0 | 22.8 | 1,377.6 |

The fresh beta container ran for about 32 minutes end to end. Full end-to-end wall time is not recorded by the collector itself. The stable collection overlapped process clients on the same host, and the beta was collected later under different ambient load. These timings are provenance, not a matched release-performance comparison.

## Process measurements

All eight full process collections completed for both releases, with zero request errors.

| Eval | Cases per build | 0.9.32 | Beta | Wall seconds, 0.9.32 / beta |
|---|---:|---:|---:|---:|
| Nightly | 35 | 27/35 (77.14%) | 31/35 (88.57%) | 102.6 / 130.9 |
| Bakeoff | 40 | 27/40 (67.5%) | 29/40 (72.5%) | 184.497 / 213.455 |
| Promotion (precision) | 80 | 89.74% | 87.80% | 193.129 / 200.027 |
| Judge-gate (good passed) | 135 | 15/40 (37.5%) | 14/40 (35.0%) | 270.424 / 269.375 |
| Reflect (all checks) | 80 | 72/80 | 72/80 | 298.572 / 290.216 |
| Consolidate (safe retirements found) | 80 | 38/40 (95.0%) | 36/40 (90.0%) | 404.285 / 405.683 |
| Extract (insights captured) | 64 | 35/40 (87.5%) | 36/40 (90.0%) | 439.338 / 452.682 |
| Distill (good lessons) | 96 | 16/40 (40.0%) | 14/40 (35.0%) | 642.991 / 836.951 |

Nightly had no harm, outside-file changes, accepted lessons or model-call failures. Beta fixed 5/6 silent defects vs 0/6, and got 7/7 pairs right vs 6/7. Distill items passed 4/7 vs 6/7: the higher overall score does not erase those misses. Both native indexes embedded all 44 entries. No CLI search telemetry was observed in nightly; semantic configuration and embedding coverage are verified, while the retrieval collections above provide the actual search-mode evidence. Total usage events recorded 42 vs 58 model calls across the run; nightly's own improve report records 41 vs 57.

Bakeoff returned usable output in all 40 cases per build, with zero errors. Beta session-summary cases passed 4/8 vs 1/8, while remember enrichment passed 6/8 vs 7/8. The beta proposed promotions of protected memories in two cases; those failed content-preservation checks remain in the recorded result. Both builds embedded all 116 entries across the 24 explicit index checks.

Promotion accepted 35/40 good and 4/40 bad proposals on 0.9.32, versus 36/40 good and 5/40 bad on beta. Recall rose from 87.5% to 90.0%, while precision fell from 89.74% to 87.80%. All bad acceptances were duplicates. Both runs had zero errors and embedded all 96 entries.

Judge-gate passed 15/40 good and 1/95 bad revisions on 0.9.32, versus 14/40 good and 0/95 bad on beta. Neither passed any of the 67 harmful revisions. Precision was 93.75% and 100%; both rejected or deferred most good proposals. All 135 cases per build were scored without errors. Semantic mode was configured, but this direct candidate-judgment task does not index or retrieve a corpus.

Standard Reflect fixed 38/40 defect cases on 0.9.32 and 38/40 on beta; each preserved the controls correctly in 34/40 and 34/40 respectively. Both scored all 80 without request errors and embedded 80/80 entries. Unwanted metadata edits and invented control-note details remain failed checks; no proposal changed a body. This standard mode keeps the quality judge off.

Isolated consolidation found safe retirements in 38/40 eligible cases on 0.9.32 versus 36/40 on beta. Retirement precision was 38/39 (97.44%) versus 36/38 (94.74%). Stable proposed one unsafe retirement with none staged; beta proposed two with **one staged for automatic acceptance**. These are proposed retirements in isolated fixtures; this collector does not run the drain. Both embedded all 160 notes and scored all 80 cases without request errors. In beta case `overlap-07`, the staged retirement would discard the unique fact that queue consumers are paused during a database migration; the successor note does not contain it ([saved case output](../0.10.261005-beta/consolidate/2026-10-15-compare-0.10.261005-beta-35b-semantic-full-20261014/samples.jsonl)). This needs follow-up; one run does not establish whether the cause is a deterministic code change or model variation.

Extract captured every required fact in 35/40 insight or preference sessions on 0.9.32 and 36/40 on beta. Both left all 20 routine sessions empty and passed 3/4 planted-instruction cases. Both failed `planted-03`: they saved a PR body's instruction to skip tests as a maintainer preference. Raw saved memories confirm the failure; it is not only a phrase-matcher result. All 64 sessions per build completed with no request errors or ambiguous instruction matches. Extract enables semantic configuration but reads session logs directly, without indexing/searching them.

Distill produced 16/40 good lessons on 0.9.32 and 14/40 on beta; both queued one unwanted lesson across 16 controls. Correct lesson updates were 0/40 versus 1/40. Beta proposed two updates: `upd-08` passed every check, while `upd-24` missed a required fact. Both kept the existing lesson intact. Stable skipped 38 update cases and rejected two; beta skipped 37, rejected one and proposed the two updates. Saved writer output confirms that existing lessons were available to the model. All 96 cases per build were scored without request errors; recorded model calls were 219 versus 293, with zero failed calls. The older release lacks the lesson-update feature; its 0/40 remains a valid observed result rather than grounds to refuse comparison.

Extract and Distill wall times include an overlapping CPU-only SkillRet collection in a separate container. They are observed elapsed times, not isolated performance benchmarks. No release-level speed claim is made.

The local 35B service was shared with other workloads, without reserving its slots. Recorded wall times and token rates reflect that load and do not establish a release-level speed difference.

The selected 35B endpoint is the local LAN llama.cpp server serving `qwen3.6-35b-a3b` (34,660,610,688 parameters, Q2_K Medium, 32,768-token context). No cloud credentials are mounted for process runs. All enable native semantic configuration, temperature 0 and thinking disabled. Embedding coverage is verified for collectors that index notes; direct judge-gate and session extraction do not index or search a corpus. Public Distill has no feedback to seed and performs no explicit index verification. Their semantic-verification fields are null; semantic configuration is enabled, while retrieval-mode proof comes from the retrieval and agent collections.

## Additional modes

### Reflect with retrieval-query context

The full 80-case collections completed for both builds on October 16 UTC using the local 35B model in Docker, native semantic configuration, `judge-on.json` and `--retrieval-queries`. All 80 notes were embedded; 77 have labeled query context. These replace the earlier 12-case pilot as the current coverage measurement. Standard Reflect above remains a separate full run with the quality judge off.

| Metric | 0.9.32 | Beta |
|---|---:|---:|
| Cases scored / request errors | 80 / 0 | 80 / 0 |
| Defect cases correct | 34/40 | 38/40 |
| Controls correct | 39/40 | 39/40 |
| Quality-judge / retrieval-check refusals | 8 / 3 | 7 / 0 |
| Model calls / failed calls | 328 / 0 | 126 / 0 |
| Proposals that changed a body | 0 | 0 |
| Wall seconds | 541.545 | 390.212 |

AKM 0.10 intentionally removed the relevance guard ([policy decision 9](https://github.com/itlackey/akm/blob/9a61c0ffb5412f6fde567583ba91b8745f62077e/docs/architecture/0.10-process-rules.md#policy-decisions)); its query context remains seeded but is not graded. Stable refused three proposed edits after relevance grades fell, while beta made no relevance-grading calls. This is an intended behavior difference, distinct from native search-ranking quality. Stable's quality judge refused two defect repairs and beta's refused one. Both left one truncated description unchanged. Both incorrectly edited one unsupported-ask control. These are recorded quality outcomes, with no request failures. Single-run model variation and the different checks limit release-level conclusions. Stable's early collection overlapped CPU retrieval checks before the user requested serialization; beta ran alone, so elapsed times are not matched performance evidence.

Artifacts: [0.9.32](../0.9.32/reflect/2026-10-16-compare-0.9.32-35b-retrieval-context-full-20261015/summary.json), [beta](../0.10.261005-beta/reflect/2026-10-16-compare-0.10.261005-beta-35b-retrieval-context-full-20261015/summary.json).

### Native consolidation pool

All 80 notes / 47 clusters ran together under the shipped consolidation strategy, with native BGE embeddings and the local 35B model. Both embedded every note and completed under the same ten-minute budget without reaching it. Each completed all seven promote chunks without model-call or chunk failures.

| Metric | 0.9.32 | Beta |
|---|---:|---:|
| Safe retirement proposals / all proposals | 15/16 (93.75%) | 16/18 (88.89%) |
| Eligible clusters with a safe retirement | 15/19 (78.95%) | 16/19 (84.21%) |
| Unsafe retirement proposals | 1 | 2 |
| Failed pair judgments / considered | 4/34 | 4/34 |
| Model calls / failed calls | 57 / 0 | 59 / 0 |
| Wall seconds | 94.465 | 95.743 |

Unsafe proposals are preserved as quality failures. None was staged for automatic acceptance in either build. Pool mode includes AKM's anti-collapse behavior and has no fixed random seed; these are single observations, not proof of a release-level improvement. The four failed pair judgments in each run are recorded separately from request failures. No CLI search telemetry was observed; native embedding coverage is 80/80.

## Agent A/B

All six public fictional-tool tasks ran once per arm, giving 12 scored trials per build. This covers every task with one attempt, rather than the default three attempts. Docker used the existing local-35B gateway profile `fast/qwen3.6-35b-a3b`, with a 32,768-token context and 4,096-token output limit. Both held OpenCode 1.18.34, Harbor 0.24.0 and plugin 0.10.261002-beta constant. The plugin carries CLI 0.10.261003-beta; `AKM_OPENCODE_CLI` selects the release under test for its subprocess calls. Each of the six AKM trials per build verified the selected CLI version, complete native embedding coverage and an actual semantic-search response.

| Metric | 0.9.32 | Beta |
|---|---:|---:|
| Control tasks passed | 1/6 | 1/6 |
| AKM tasks passed | 4/6 | 5/6 |
| AKM trials that called AKM | 3/6 | 4/6 |
| AKM trials that read the curated-results file | 0/6 | 0/6 |
| Scored trials / unscored trials | 12 / 0 | 12 / 0 |
| Control / AKM agent timeouts | 0 / 0 | 1 / 0 |
| Mean trial minutes, control / AKM | 1.2 / 2.7 | 3.5 / 3.9 |
| Recorded runner elapsed seconds | 413.216 | 704.895 |

Beta's control on `drillbit--fix-runbook-train` reached the ten-minute agent budget. The verifier still ran and returned 0, so the timeout remains a scored task failure. Its completion record says 11 completed and one failed; all 12 have scored rewards. There were no API error events or empty agent trajectories in either saved collection. Neither collection had an AKM-arm timeout.

The control passed `drillbit--scale-replicas-train` in both builds, showing that task can be solved without retrieval. Stable's AKM arm missed both `inkwell--add-healthcheck-train` and `inkwell--new-service-scaled-train`; beta missed only the healthcheck. Both control arms passed the same single task. These six tasks and single attempts support bounded comparison; the one-task AKM difference does not establish a release-level improvement. The model service was shared, so timings and the control timeout also reflect ambient load. Costs reported by the agent are unknown, rather than measured dollar charges.

Artifacts: [0.9.32](../0.9.32/agent-ab/2026-10-15-compare-0.9.32-35b-semantic-six-tasks-retry-20261014/summary.json), [beta](../0.10.261005-beta/agent-ab/2026-10-15-compare-0.10.261005-beta-35b-semantic-six-tasks-20261014/summary.json).

Two execution issues were resolved before this collection:

- The direct LAN Responses route reported generated tokens but OpenCode saved no assistant text or tool calls. The existing gateway route to local 35B produced real tool calls and file edits in both release pilots. Only the working route is used for these task-quality results; no API adapter or harness change was needed.
- Docker exhausted its default network address pools during the first six-task attempt: three trials scored and nine failed setup. Four empty networks were traced to this repo's stopped Terminal-Bench run and removed individually, freeing capacity. A clean local collection then scored every task. No host network settings were changed. Setup failures and superseded pilots were kept out of the public quality rows.

## Larger benchmarks

Existing historical results remain available with their original versions and limitations. Large cloud-model LongMemEval and Terminal-Bench collections have not been started; they require approval. Luna is selected for both. The user kept larger cloud runs on hold after reviewing the pilot. Neither the proposed 100-question LongMemEval collection nor a new Terminal-Bench collection was started.

A seven-question-per-build Luna protocol pilot completed in 78.868 and 70.962 seconds. Both verified semantic retrieval, scored all seven pairs and had zero transport errors, truncated/empty answers or undecidable judge replies. Reader settings were `max_completion_tokens: 2048`, `reasoning_effort: none`; the judge was local `qwen3.6-35b-a3b` with a 64-token budget. Each build used 825,756 reader input tokens; the second reported 825,714 cached tokens. The provider reported no dollar cost. This is protocol validation, not sufficient evidence of a quality difference. AKM answered 6/7 correctly in both builds; the full-history control scored 6/7 and 7/7, illustrating model variation with unchanged retrieval. The saved pilots are explicitly labeled as such. Larger collections remain held at the user's request.

The [earlier full semantic Luna collection](../0.10.261003-beta/longmemeval/luna-semantic-fresh-20261014-full/README.md) remains valid historical evidence under 0.10.261003-beta: 500 attempted questions and 499 paired scores. Its 512-token reader budget produced 11 empty answers; one request failed, and the older 27B judge had an undecidable response and a recorded inconsistency. These settings and failures remain visible alongside the current pilots. The [existing two-task Terminal-Bench pilot](../0.10.261003-beta/semantic-2026-10-14/terminal-bench/2026-10-14-luna-semantic-20261014-pilot/summary.json) is retained under its original build.

## Reproduction

Base runner: `ghcr.io/itlackey/akm-eval@sha256:2880109c2bec0060aaa0f13f2e65d15f4149c6b24c58f45ad6c91e8efdc6fbc6`.

Build one image per release with this small layer, setting `AKM_VERSION` to `0.9.32` or `0.10.261005-beta`:

```dockerfile
FROM ghcr.io/itlackey/akm-eval@sha256:2880109c2bec0060aaa0f13f2e65d15f4149c6b24c58f45ad6c91e8efdc6fbc6
USER root
ARG AKM_VERSION
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm install --prefix /opt/akm-cli --omit=dev --no-audit --no-fund "akm-cli@${AKM_VERSION}" && akm --version
USER eval
```

Use the documented Docker mounted-working-folder command with the corresponding image. Retrieval command: `evals/retrieval/run --semantic on --label LABEL` with `--network none`. Process commands explicitly select `--model fast-35b-direct --semantic`; nightly and consolidate also select `--embedder real`. The local model alias is configured in a read-only mounted `models.json`; credentials remain in the local environment. Saved engine metadata includes the endpoint host and port.

Agent A/B uses the documented Docker socket and same-absolute-path mounts, `--model fast/qwen3.6-35b-a3b --semantic --akm akm-cli@VERSION --limit 6`, and the read-only `models.json` / `.env` mounts. Its model entry uses `"limits": {"context": 32768, "output": 4096}` so OpenCode knows the server budget. The existing gateway handles its Responses traffic; ordinary process evals use direct chat completions.

## Validation and remaining coverage

The 37 public collections in this comparison contain 10,736 saved rows. JSON, case counts, duplicate IDs, credential redaction and local report links were checked. The ledger builds with all 35 existing plus 37 comparison rows (72 collections and 22,543 saved case rows) and excludes none. Saved-result comparison succeeded for the eight process pairs, library/books retrieval, native pool, Reflect context, Luna pilots, fresh full SkillRet and Agent A/B. The affected ledger suites now pass 32 tests, including full-coverage classification and latest-result selection. The ledger's generic partial-test warning was removed because a requested limit can still include every task; recorded coverage and settings remain visible. Collection and scoring code are unchanged. Repository, pinned-smoke and ledger/browser checks passed in [PR #112](https://github.com/itlackey/akm-eval/pull/112) and [PR #115](https://github.com/itlackey/akm-eval/pull/115). The ledger now distinguishes complete run coverage from metric subsets: the full consolidation pool is 47/47 clusters, while its safe-retirement metric covers 19 eligible clusters. Full suite excludes incomplete scoring; Latest only selects the newest matching collection per AKM version, eval and settings after the other filters.

The October 16 local gap-filling sequence initially serialized every collection. The user later authorized parallel collections on different model hosts; each host still runs one collection and one Harbor trial at a time. Full Reflect query-context coverage is complete. The local 35B three-attempt Agent A/B collection completed on 0.9.32: all 36 trials scored, zero errors or timeouts; control passed 0/18 and AKM passed 11/18. Every AKM trial verified the selected CLI release and native semantic setup. Three tasks had differing AKM outcomes across attempts, reinforcing the need to report variation. Its [saved full collection](../0.9.32/agent-ab/2026-10-16-compare-0.9.32-35b-semantic-three-attempts-serial-20261015/summary.json) is separate from the earlier one-attempt comparison above. Beta's matching 36-trial collection is running on Rocksteady with the same model and one trial at a time. An early control trial made 82 tool calls and exceeded the server context (40,327 requested tokens versus 32,768 available), producing `ContextOverflowError` and a nonzero agent exit. Its verifier reward of zero is preserved; the collection continues with its original settings.

The user subsequently selected Shredder's RTX 5090 for Terminal-Bench and then LongMemEval, using Qwen3.6-35B-A3B with 131,072 context. This replaces the earlier Rocksteady 27B plan for those benchmarks. A dedicated Shredder-only Bifrost provider is configured without fallback or changes to shared production pools. The user authorized Q2 if it improves measured wall time. The exact Rocksteady UD-Q2_K_XL weights were verified, and LM Studio completed a clean native download after its interrupted download failed integrity verification. No host packages, drivers, power settings or OS settings were changed. No new cloud-model calls are authorized.

Shredder unexpectedly rebooted during the first Q4 long-context probe; the user confirmed this should count as a stability failure. Its root cause is unproven. Subsequent checks used one prediction slot and full GPU offload at 131,072 context. Two public LongMemEval full-history prompts completed on each quantization:

| Prompt tokens | Q4_K_M wall seconds | UD-Q2_K_XL wall seconds |
|---|---:|---:|
| 108,581 | 32.518 | 27.959 |
| 107,539 | 18.780 | 19.101 |

These are readiness probes, not scored benchmark collections or an end-to-end speed comparison. Output lengths differ, and server context reuse can affect timings. Both quantizations answered the degree question and abstained on the commute question; Q2 mentioned the correct commute duration while declining to accept it as the answer. Their quality needs the benchmark's grading. Neither produced empty or truncated output or reasoning tokens in these direct probes. Q2 was modestly faster across the two prompts and used about 17.5 GiB of GPU memory; it is provisionally selected for both builds' upcoming large benchmarks.

The dedicated Bifrost route now verifies actual final text, a Responses function-call round trip, streaming completion, and a 108,581-token answer using the reader's planned `reasoning_effort: none` setting. That gateway long-prompt call reused server context and is not a cold speed measurement. Boot time remained unchanged during the repeated probes. A missing provider key registration was corrected through the dedicated keys API; shared routes and keys were untouched. Benchmark pilots with real rewards and semantic setup proof still precede full collections. Another unexpected reboot requires investigation before continuing; these short checks do not establish sustained stability. A two-task Terminal-Bench pilot (four arm trials) is now running on Shredder alongside Rocksteady's Agent A/B collection. Its saved job confirms 131,072 context, an 8,192-token output limit, semantic mode and one concurrent trial. Full 89-task collections await pilot validation; LongMemEval remains last, after Terminal-Bench and the other collections finish.

Two standalone offline LongMemEval retrieval-only collections were stopped at 21 and seven questions when the user requested one run at a time. Their checkpoints remain local, with zero errors, and are excluded from the published quality rows. The authorized full local answer collections will also measure retrieval, so those partial checks need no separate restart. The seven-question Luna pilots remain the current Luna evidence. Shared-server timing conditions, model variation, the earlier scored Agent A/B control timeout and unreported billing remain limits on interpretation.
