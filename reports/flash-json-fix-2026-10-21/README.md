# Flash-Next structured-output fix and independent model roles

Collected October 21, 2026 UTC. This follows the [original matched comparison](../flash-next-vs-35b-2026-10-21/README.md).
The observed malformed-output case now passes. Two complete follow-up bakeoffs
used the same AKM 0.10.261005-beta Docker runner, collector/scorer 0.2, public
cases/labels, temperature 0, thinking off and lab embedding profile as the
original comparison. Each collection ran sequentially through Bifrost with no
cross-model fallback. The server configuration changed as described below;
these are deployment comparisons, not an isolated model-architecture effect.

| Measurement | Matched 35B baseline | Fixed Flash run 1 | Fixed Flash run 2 |
|---|---:|---:|---:|
| Cases passed | 27/40 (67.5%) | 35/40 (87.5%) | 36/40 (90.0%) |
| Checks held | 88.38% | 95.79% | 96.63% |
| Usable output | 40/40 | 40/40 | 40/40 |
| Failed model calls | 0/80 | 0/80 | 0/80 |
| Case-level errors / timeouts | 0 / 0 | 0 / 0 | 0 / 0 |
| Median case time | 2.60 s | 4.75 s | 4.10 s |
| Run wall time | 199.458 s | 278.520 s | 260.232 s |
| Mean successful model request | 2.12 s | 2.81 s | 2.76 s |

All 40 cases and labels match in every arm. The two Flash observations are kept
separate; they are warm shared-service repeats, not independent samples that
establish a statistical winner. Case timing includes AKM/indexing overhead;
model-request timing includes prefill. The 35B baseline is the previously
published fresh matched run, not a new collection. Historical 27B scores and the
35B's 95.4% nightly result belong to other suites and are not pooled here.

## What failed and what changed

The original two HTTP 502 errors were one session-summary prompt and its
identical retry. Exact replay returned useful summary text and arrays but
stopped without the final closing brace. No output-token cap was sent, and
`finish_reason` was `stop`. Repeating the same request produced the same error
at character 552. This was a structured-output failure, not evidence of an
out-of-memory error or context exhaustion.

A first compact-JSON candidate fixed that case, but full validation caught an
omitted required `content` field in a memory-inference reply. Its complete run
attempted 40 cases, scored 39, passed 33 and recorded two failed calls for that
one request and retry. It was rejected for replacement; its evidence is retained
privately. Those 33/39 are not presented as a full-suite quality result.

The accepted local server patch is opt-in via `STRATA_COMPACT_JSON=1`. For
structured requests it asks for compact, fully closed JSON and lists required
top-level fields directly from the caller's schema. It contains no benchmark
case names, expected answers or hard-coded field list. The Docker image also
installs `jsonschema==4.23.0`; previously the optional package was absent, so
responses were checked to be JSON objects without full schema validation.

Validation remains strict before delivery. The server does not append braces,
repair output, silently retry a generation, or return an invalid answer as a
success. The engine still uses schema prompting and validation rather than
constrained decoding. The fix addresses the observed cases; these measurements
do not guarantee every future structured request will succeed.

The engine binary, model/quantization, context, reasoning/sampling defaults,
plain-text behavior and tool-call paths remain unchanged. The upstream default
prompt is unchanged when the opt-in is off. Fifty-four structured/Responses API
tests and 19 benchmark tests pass in the image, including rejection of missing
fields, missing closing braces, duplicate keys and output truncation. An upstream
sampler-thread timing test failed intermittently during build attempts; the
accepted image's complete test invocation passed. Both exact live regression
requests passed before the two full collections.

## Deployment and remaining limits

The owner chose to retain three independent roles: `fast/qwen3.6-35b-a3b`
for small, latency-sensitive requests; `moe/qwen3.8-flash-next-iq2_xs` for
Flash-Next; and `chat/qwen3.8-27b` for the established 27B workflows. The legacy
`moe/qwen3.8-flash-next` selection and explicit Splinter Flash selection share
the same B70 engine. Existing fast 35B/9B compatibility names stay on the 35B.
No cross-model fallback or balancing is introduced. Flash has one active
sequence and a queue. The 35B remains resident on Rocksteady GPU1 alongside
embedding and voice services; the 27B remains on GPU0.

The recommended first process candidates for moe are memory inference, schema
repair and longer session summaries. Short classification/enrichment stays on
fast, and consolidation/promotion needs more validation before migration.
Production process bindings and evaluator model/judge defaults remain unchanged.

The deployment uses local image `homelab/strata-b70:0.1.46.5`, image ID
`sha256:72b71ae7c099fadaafa070653f73820faa6fe0e6475a91d6e1b4648410fe9412`,
from upstream revision `9de04cd44e927a9a3df6bbc0e94fc1be8b844ba4`, Intel Arc Pro B70
32 GB with 128 GB host RAM, 131,072 context, int8 KV and a 32,768-token resident
window. The evaluator image ID remains
`sha256:51eb4dbbfea0d67023f41705afe0fa3fabd5bc5bdd4db315b68b57610f5a9485`,
recorded evaluator revision `be1e8be64eb7e2d65c885a246776c5720b041eab`.
The private profile/image is not published. Credentials were supplied privately.
Both runs verified 116/116 embedded entries across 24 index checks, with no
verification failures and no observed semantic searches. This does not measure
a retrieval-quality change.

Remaining failed-case IDs are preserved in the raw samples:

- Run 1: `consolidate-memory-pool`, `prod-consolidate-full-pool`, `enrich-translation-keys-memory`, `webhook-docs-session-summary`, `ci-cache-key-session-summary`.
- Run 2: `consolidate-memory-pool`, `enrich-translation-keys-memory`, `webhook-docs-session-summary`, `ci-cache-key-session-summary`.

Promotion checks read the proposed plan; they do not establish that a protected
source was actually retired. Both stacks still require review of protected
promotion proposals.

The moe role offers the observed quality and larger context with higher
latency and a single active sequence; fast retains the 35B latency advantage. No matched nightly, coding-quality
or sustained-load claim follows from this bakeoff. The 27B remains the comparison
baseline for its validated workflows; this report does not compare its quality
with Flash-Next.

## Reproduction and artifacts

- [Original failing public request](reproduction-request.json), [raw malformed response](original-malformed-response.json).
- [Local opt-in patch](compact-structured-output.patch), [two fixed live regression responses](fixed-regressions.json).
- [Flash run 1 summary](../0.10.261005-beta/bakeoff/2026-10-21-flash-json-validated-full-20261021-r1/summary.json) and [samples](../0.10.261005-beta/bakeoff/2026-10-21-flash-json-validated-full-20261021-r1/samples.jsonl).
- [Flash run 2 summary](../0.10.261005-beta/bakeoff/2026-10-21-flash-json-validated-full-20261021-r2/summary.json) and [samples](../0.10.261005-beta/bakeoff/2026-10-21-flash-json-validated-full-20261021-r2/samples.jsonl).
- [Original 35B summary](../0.10.261005-beta/bakeoff/2026-10-21-fast-35b-q2-semantic-matched-full-20261021/summary.json).

```sh
evals/bakeoff/run --corpus public --semantic --model splinter-b70/qwen3.8-flash-next-iq2_xs --repeat 2 --label flash-json-validated-full-20261021
```

This command ran inside the pinned owner's private Docker profile. Generic
`--semantic` alone selects native bge-small and does not reproduce the private
remote `embed/qwen3-embedding-0.6b`, 1,024-dimensional embedding configuration.
Original summaries/samples are published byte-for-byte, without rescoring.
