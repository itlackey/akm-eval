# Inkling 2 Mini on Intel Arc Pro B70

November 24, 2026. This round measures Inkling 2 Mini on the public AKM process, judge, and synthetic memory-utility fixtures with [AKM CLI 0.10.261130](https://github.com/itlackey/akm/releases/tag/v0.10.261130), the stable release. The runner and cases are from [akm-eval `581a559`](https://github.com/itlackey/akm-eval/tree/581a559b23648843126918f685a69c5ddc1c7d97). See the [public ledger](https://itlackey.github.io/akm-eval/) for per-suite scores, timings, and links to the raw results.

## Setup

- One Intel Arc Pro B70. The model is [Inkling 2 Mini EXL3 at 4 bits per weight](https://huggingface.co/grant-ai/Inkling-2-Mini-EXL3-4bpw/tree/c266f76b68429255e1d6ec151d0aa15f48f6abcc), served as `inkling2-mini-exl3-b70`.
- vLLM 0.33.0 with PyTorch 2.15.0+xpu, FP8 KV cache, a 131,072-token context limit, and one serving slot. Fixed-width DSpark speculation was enabled (seven draft tokens); prefix reuse was off. The [adapter and strict-JSON fixes](https://github.com/Danmoreng/intel-b70-inkling2-mini-vllm/pull/3) are part of this serving configuration. The context limit describes the server, not the length of these test inputs.
- One run per suite, using each complete default public corpus without `--limit`, through the server's OpenAI-compatible endpoint. Each test used isolated AKM state. This is not a Bifrost latency measurement or a controlled Flash Next comparison.
- Temperature 0. Bakeoff used keyword search and low reasoning with a 2,048-token output cap. The other AKM process and judge calls explicitly requested no reasoning. Suites that use semantic search or pairing used AKM's native `Xenova/bge-small-en-v1.5` embedder. The standalone judge suites ran on their frozen inputs. Memory utility used its default separate answer-reader request settings.

## Results

The 13 runs scored all 1,206 selected cases and clusters; there were no collection errors and no errors in the 1,562 recorded model calls. A successful call does not imply that its output passed the quality checks below.

**Bakeoff: 49/55 passed**, with zero collection errors and 5.4 s median case wall time. All 67 recorded model calls completed; the mean was 4.86 s per call. Memory inference passed 18/23, enrichment 7/8, and schema repair, session summary, and consolidation/promotion each passed 8/8. Memory-inference misses included invented dates and incorrect no-change decisions.

**Reflect: 37/40 repairs and 39/40 controls passed.** Two proposals modified protected body text. There were no collection or model-call errors across 80 cases. AKM verified all 80 index entries were embedded; this fixture did not observe any search events.

**Distill: 26/40 required lessons and 17/40 required lesson updates were correct.** The run also correctly handled one of three knowledge-update cases and proposed one unnecessary lesson on 16 negative cases. All 99 cases were scored and all 212 model calls completed. Some incorrect updates copied the source too closely or created a new lesson instead of updating the existing one.

**Extract: 39/40 useful sessions, 20/20 routine sessions, and 3/4 planted-instruction controls passed.** The model saved one untrusted planted instruction. All 64 sessions were scored with zero collection or model-call errors.

**Pair consolidation: 40/40 safe retirements found, with no unsafe retirements.** All 80 pairs were scored and all 190 model calls completed. Every contradiction, overlap, and unrelated control was kept.

**Whole-pool consolidation: 19/19 eligible clusters yielded a safe accepted retirement; no unsafe retirements or wrong successors.** All 47 clusters and 60 model calls completed. In both search and curate, retired notes appeared for all 19 before acceptance and zero after it, even before the reindex. On retirement queries, mean reciprocal rank rose from 0.813 to 1.000, and the controls stayed at 1.000. This is the result on this labeled pool, not an estimate for arbitrary bundles.

**Promotion: 39/40 good proposals accepted and 0/40 bad proposals accepted.** The negative set contained 13 duplicates, 13 stale proposals, and 14 temporary proposals. All 80 proposals were scored with zero call errors.

**Nightly: 32/35 items handled correctly, with no harm recorded.** Two expected lessons were not reached and one metadata repair remained in review. All 58 model calls completed. The drain promoted nine proposals and left 21 for review. This was an isolated synthetic night, not the host's scheduled task.

**Reflect quality gate: 89/91 good proposals passed and 4/97 bad proposals passed.** The bad passes included 2/71 harmful cases; 1/64 harmful cases eligible for automatic acceptance passed. Two good and 22 bad proposals went to review. All 188 cases and model calls completed without errors.

**Pair judge: 54/54 safe retirements found, no unsafe retirements, and 92/92 correct relations.** It assigned 135 of 136 labeled claims to the correct note and returned a verdict on every pair.

**Lesson judge: 18/19 good new lessons and 19/21 good updates passed.** It also passed 2/70 bad new lessons and 11/68 bad updates. All 11 bad update passes were off-rule updates (11/13 in that class); the judge passed no ungrounded or restated updates. All 178 calls returned a parseable verdict without errors.

**Drain judge: 42/45 good promotions accepted and 8/139 bad promotions accepted.** All eight false accepts were stale promotions (8/45); no ephemeral (0/49) or duplicate (0/45) promotions passed. Of the good proposals it did not accept, it deferred two and rejected one. All 184 calls completed with a parseable decision.

**Memory utility: no memory 5/24, original notes 23/24, inferred notes 23/24.** The original notes helped 18 cases and hurt none (paired gain: 75 percentage points; 95% interval 41.4–90.2 points). Relative to original notes, inference helped one case and hurt one (net 0 points; 95% interval −18.6 to 18.6 points). These are synthetic cases at a 1,024-token context packing budget; the equal totals are not proof of equivalence.

Case timing includes AKM work around requests. Per-call timing includes prefill and generation; it does not measure decode-only throughput. One run per suite shows the behavior observed under these settings, not run-to-run variance.

The independent canned-response contract smoke passed seven of eight suites that ran. Its malformed enrichment fixture was classified as `output` rather than `unusable`; the bakeoff scorer still checks the output. This is a compatibility caveat about the enrichment fallback, not a live transport failure or a change to the scoring rules.

## Reproduce

Use the runner commit above, `akm-cli@0.10.261130` as `AKM_BIN`, and point `MODEL_BASE_URL` to the serving endpoint. Pass `--corpus public --model inkling2-mini-exl3-b70` to each eval. Use `--concurrency 1` wherever supported, and `--semantic` for reflect, distill, extract, consolidate, promotion, nightly, and memory utility. Run consolidate once normally and once with `--pool` (including its retrieval checks). The bakeoff command used a 120,000 ms per-command timeout; the other runs used their defaults. Supply the matching JSON through `--config-patch`:

```json
{"engines":{"bakeoff":{"reasoningEffort":"low","enableThinking":true,"maxTokens":2048}}}
```

```json
{"connections":{"default":{"reasoning_effort":"none"}}}
```

Retrieval-only evals do not measure this model. OpenCode/Harbor and external-dataset benchmarks are separate protocols and are not part of this collection. The synthetic memory-utility run uses the 24 public cases, not LongMemEval or the opt-in maintenance pilot.

The bakeoff summary's patch path was shortened for publication; its hash and all scores are unchanged.
