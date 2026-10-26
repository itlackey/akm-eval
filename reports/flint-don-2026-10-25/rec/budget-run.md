# Full AKM bakeoff with rec and an explicit reasoning budget

This follow-up captures the public AKM workload using official Flint INT4
with an explicit output allowance. It is separate from
the earlier [unchanged-budget pilot](README.md), which had three preflight
errors and one enrichment failure. Those results remain intact.

## Full collection

All **55/55 cases were recorded and scored**, with **zero case errors,
zero command timeouts and zero recorded model-call errors**. Collection ran
from **2026-10-26 02:08:49 UTC to 02:35:39 UTC** (October 25 locally).
Automatic scores remain in the raw artifacts; no manual rescoring or
outcome analysis is included in this follow-up.

| Measurement | Recorded value |
|---|---:|
| Collector wall time | 1,608.405 s |
| Wrapper wall time, including startup/readiness and closing counter read | 1,610.068 s |
| Median case duration | 13.9 s |
| AKM-recorded model calls | 110 |
| Native requests, including runner readiness | 111 |
| Native requests with complete timing records | 111/111 |
| Native generated tokens, including reasoning | 176,089 |
| Sum of native request durations | 1,557.977 s |
| Sum of native decode durations | 1,484.636 s |
| Weighted native decode throughput, first token excluded per request | 118.533 tokens/s |
| Mean successful AKM-call prompt / completion tokens | 425.4 / 1,600.8 |
| Mean successful AKM-call duration | 14.18 s |
| AKM-recorded output rate, including prefill | 112.9 tokens/s |
| Maximum reported MLX allocator peak | 27,434,654,705 bytes |
| Verified indexed / embedded entries | 131 / 131 |
| Embedding verification failures / telemetry errors | 0 / 0 |

Raw [summary](budget-full/summary.json),
[all 55 case rows and outputs](budget-full/samples.jsonl), and
[native request counters](budget-full-native.json) are retained. Summary
and sample files are byte-identical to the collector originals. Native
records retain every request in the exact full-run window; token-ID and
token-logprob arrays alone are omitted. The process ran the five-case
validation pilot immediately before this full collection, without a restart.

## Configuration validation pilot

The five-case pilot completed without errors or timeouts: median
**15.7 seconds**, runner wall time
**309.854 seconds**. Its 11 model calls had zero transport failures; native
timings contain 12 requests including external readiness. The first real
probe produced a final answer after 23 tokens. Enrichment generated 310
tokens. Its unchanged 10-second deadline was not reached.

Raw [summary](budget-pilot/summary.json),
[all five answers](budget-pilot/samples.jsonl), and
[native request counters](budget-pilot-native.json) are preserved. The full
run uses exactly this profile, without adjusting it after these scores.

## What changed

The [reasoning-budget profile](reasoning-budget.json) changes only the
`bakeoff` engine's sampling/request settings:

```json
{
  "temperature": 1,
  "enableThinking": true,
  "extraParams": {
    "top_p": 0.95,
    "top_k": 20,
    "max_completion_tokens": 32768
  }
}
```

This uses AKM's existing provider-extra configuration and rec's existing
Chat Completions request handling. No AKM source patch, custom API bridge,
probe bypass, modified prompt or altered scorer is involved.

**Budget precedence is intentional and material.** The pinned AKM sends
`max_tokens: 16` for its probe and `max_tokens: 256` for enrichment. The
profile additionally sends `max_completion_tokens: 32768`. Rec gives the
latter field precedence and clamps it to the remaining 32,768-token shared
context. Thus this profile changes the effective operation budgets; it is
not a claim that the unchanged defaults work. It is specific to the tested
AKM/rec versions; do not assume another provider accepts both fields or
chooses the same precedence.

The actual pinned AKM validator accepted the configuration. A synthetic
server captured its emitted probe and enrichment requests and verified both
original operation limits remained on the wire alongside the explicit
32,768-token `max_completion_tokens`. The real pilot then verifies rec's
effective limits and completed final answers in the native counters.

AKM's enrichment temperature remains **0.1**, and its hard **10-second local
deadline** remains unchanged. Other engine-backed jobs use temperature 1,
top-p 0.95 and top-k 20. `enableThinking: true` accurately requests the model's
always-on reasoning; rec ignores unsupported thinking-toggle fields rather
than adding a reasoning-off mode. No response-field aliasing is needed when
a complete final `content` is returned.

## What stayed fixed

- Official **rec 0.1.0**, official INT4 revision
  `3b93f9053b530488405ae9fca51d4900d6ce21f0`, and unmodified bundled runtime.
  Complete identities: [hosting.json](hosting.json).
- Same Don M4 Pro, 64 GB, 32,768 shared context, single generation at a time,
  standard Flint grammar, fast synchronization enabled, BF16 KV cache.
- Pinned **AKM 0.10.261011-beta**, evaluator revision
  `b4725addaed4bed0f12c9659f72da3125f5c4b7c`, bakeoff/scoring **0.4**.
  Private runner image ID:
  `sha256:7f223cb131ddd53fdfa6dd149225e4371ed4e44724d94b05ef9f7ac2cb5ba07f`.
- All **55 public cases** and their original labels; five process types:
  memory inference, enrichment, schema repair, session summary and
  consolidation/promotion.
- Existing remote `embed/qwen3-embedding-0.6b`, dimension 1024, semantic
  configuration/coverage checks; credentials stay private. No fallback.
- Same 900-second per-command timeout, concurrency 1, and original
  collector's early-abort behavior. No timeout is lengthened to improve scores.
- No explicit request seed added. Rec's native default is 0, as in its earlier
  pilot. Earlier GGUF results did not pin an equivalent backend seed.
- Cases run in disposable evaluator sandboxes, not the operator's real notes.

## Measurement boundaries

Raw case outputs and automatic scores are retained without correction or
selective exclusion. Comparisons, answer review and adoption recommendations
are deferred until after measurement collection.

Case durations include AKM, embeddings and filesystem work. Collector wall
time excludes runner startup/readiness; wrapper wall time also includes the
closing SSH counter read.
AKM model-call token and duration fields are per-call means, not totals.
Native counters include readiness/capability probes, so request counts are
not case counts. Native request/decode timings exclude some API overhead.
Reasoning-token counts are unavailable from this rec API, not zero.

Native `process_peak_rss_bytes` is a cumulative process peak spanning the
pilot and full run; it is not an isolated full-run host-memory measurement.
Reported MLX allocator peaks are not whole-system RAM or swap observations.

This record covers the 55 public cases across five AKM processes at
concurrency one. It does not measure concurrent clients, every AKM process,
general coding, or production unattended operation. Earlier GGUF collections
use different quantization, effective budgets and native seed behavior;
no controlled comparison is asserted here.

For normal AKM use, apply the documented settings to the actual selected LLM
engine, not to an unused engine named `bakeoff`. The endpoint/key must belong
to the running rec instance. This experiment uses a private SSH tunnel;
it does not create a permanent LAN endpoint or change a production gateway.

## Verification and handback

- All 55 input/label digest pairs match the original public full collection.
  Pilot and full runs have the same recorded config-patch digest:
  `2a5710fadecc471bee64445fb256f853152f33008d64e6d17f86d54233dcf47f`.
- All four new raw summary/sample files are byte-identical to their collected
  originals. All JSON/JSONL artifacts parse; native counters cover 111/111
  full-run requests with complete status and timing records.
- Repository type checks passed. Mocked tests: **2,967 passed, 29 skipped,
  zero failed**, including two checks for this explicit profile. The ledger
  build passed and discovers both new collections.
- All 39 files in this report tree were scanned against the actual lab and
  rec credentials: zero matches, private host addresses or local paths.
- Rec and the SSH forward are stopped, no evaluation containers remain,
  and the original LM Studio `flint-q4-k-m` model is restored with 32,768
  context and one prediction at a time, verified idle with zero queued
  requests. Isolated rec files remain available; no new startup service,
  LAN listener, model deletion or production gateway change was made.
