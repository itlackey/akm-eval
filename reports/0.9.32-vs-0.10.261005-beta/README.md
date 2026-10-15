# AKM 0.9.32 vs 0.10.261005-beta

Collected incrementally on 2026-10-15 UTC. Both releases use the same public cases and runner source `acbafc2`. Docker images layer the exact published `akm-cli` version onto the prebuilt runner; dependencies are installed at image build time. Separate working folders keep each release's indexes independent. Cold indexing starts from a new index with the native embedding model already baked into the image; it does not include a model download.

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

## Process measurements

Full nightly, bakeoff, promotion and judge-gate collections completed for both releases. Other process measurements are in progress.

| Eval | Cases per build | 0.9.32 | Beta | Wall seconds, 0.9.32 / beta |
|---|---:|---:|---:|---:|
| Nightly | 35 | 27/35 (77.14%) | 31/35 (88.57%) | 102.6 / 130.9 |
| Bakeoff | 40 | 27/40 (67.5%) | 29/40 (72.5%) | 184.497 / 213.455 |
| Promotion (precision) | 80 | 89.74% | 87.80% | 193.129 / 200.027 |
| Judge-gate (good passed) | 135 | 15/40 (37.5%) | 14/40 (35.0%) | 270.424 / 269.375 |

Nightly had no harm, outside-file changes, accepted lessons or model-call failures. Beta fixed 5/6 silent defects vs 0/6, and got 7/7 pairs right vs 6/7. Distill items passed 4/7 vs 6/7: the higher overall score does not erase those misses. Both native indexes embedded all 44 entries. No CLI search telemetry was observed in nightly; semantic configuration and embedding coverage are verified, while the retrieval collections above provide the actual search-mode evidence. Total usage events recorded 42 vs 58 model calls across the run; nightly's own improve report records 41 vs 57.

Bakeoff returned usable output in all 40 cases per build, with zero errors. Beta session-summary cases passed 4/8 vs 1/8, while remember enrichment passed 6/8 vs 7/8. The beta proposed promotions of protected memories in two cases; those failed content-preservation checks remain in the recorded result. Both builds embedded all 116 entries across the 24 explicit index checks.

Promotion accepted 35/40 good and 4/40 bad proposals on 0.9.32, versus 36/40 good and 5/40 bad on beta. Recall rose from 87.5% to 90.0%, while precision fell from 89.74% to 87.80%. All bad acceptances were duplicates. Both runs had zero errors and embedded all 96 entries.

Judge-gate passed 15/40 good and 1/95 bad revisions on 0.9.32, versus 14/40 good and 0/95 bad on beta. Neither passed any of the 67 harmful revisions. Precision was 93.75% and 100%; both rejected or deferred most good proposals. All 135 cases per build were scored without errors. Semantic mode was configured, but this direct candidate-judgment task does not index or retrieve a corpus.

The selected 35B endpoint is the local LAN llama.cpp server serving `qwen3.6-35b-a3b` (34,660,610,688 parameters, Q2_K Medium, 32,768-token context). No cloud credentials are mounted for process runs. All use native semantic embeddings, temperature 0 and thinking disabled.

## Additional modes

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

Unsafe proposals are preserved as quality failures. Pool mode includes AKM's anti-collapse behavior and has no fixed random seed; these are single observations, not proof of a release-level improvement. The four failed pair judgments in each run are recorded separately from request failures. No CLI search telemetry was observed; native embedding coverage is 80/80.

## Larger benchmarks

Existing historical results remain available with their original versions and limitations. Large cloud-model LongMemEval and Terminal-Bench collections have not been started; they require approval. Luna is selected for both. The user kept larger cloud runs on hold after reviewing the pilot. Neither the proposed 100-question LongMemEval collection nor a new Terminal-Bench collection was started.

A seven-question-per-build Luna protocol pilot completed in 78.868 and 70.962 seconds. Both verified semantic retrieval, scored all seven pairs and had zero transport errors, truncated/empty answers or undecidable judge replies. Reader settings were `max_completion_tokens: 2048`, `reasoning_effort: none`; the judge was local `qwen3.6-35b-a3b` with a 64-token budget. Each build used 825,756 reader input tokens; the second reported 825,714 cached tokens. The provider reported no dollar cost. This is protocol validation, not sufficient evidence of a quality difference. AKM answered 6/7 correctly in both builds; the full-history control scored 6/7 and 7/7, illustrating model variation with unchanged retrieval. The saved pilots are explicitly labeled as such. Larger collections remain held at the user's request.

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
