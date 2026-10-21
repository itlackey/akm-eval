# Flash-Next IQ2_XS versus the 35B fast tier

Collected October 21, 2026 UTC. Two complete public bakeoff runs, one per model,
using AKM **0.10.261005-beta**, collector/scorer **0.2**, the same 40 cases and
labels, temperature 0, thinking off, and the same lab embedding configuration.
The services ran sequentially through separate Bifrost model selections with no
cross-model fallback. No inference engine, evaluator or scoring changes were
made for this comparison.

| Measurement | 35B UD-Q2_K_XL | Flash-Next IQ2_XS |
|---|---:|---:|
| Cases recorded / scored | 40 / 40 | 40 / 40 |
| Cases passed | 27/40 (67.5%) | **34/40 (85.0%)** |
| Mean share of checks held | 88.38% | **93.79%** |
| Usable output shape | **40/40** | 39/40 |
| Case-level collector errors / timeouts | 0 / 0 | 0 / 0 |
| Failed model calls | **0/80** | 2/81 |
| Median case time, from saved samples | **2.60 s** | 3.95 s |
| Run wall time | **199.458 s** | 263.872 s |
| Mean successful model request | **2.12 s** | 2.84 s |
| Model output tokens/s, including prefill | **75.9** | 50.9 |
| Mean input / output tokens per successful call | 477.5 / 160.7 | 602.2 / 144.7 |

Flash-Next passed seven more cases, a **17.5 percentage point** difference, and
held 5.41 percentage points more checks. Nine cases passed only with Flash-Next;
two passed only with the 35B. This is one observation per model, not a statistical
winner claim. The older published 35B run on the same AKM version scored 29/40;
it used native bge-small embeddings and a direct model endpoint, so it remains
separate from this newly matched baseline. The previously discussed 95.4% 35B
score belongs to the nightly eval, not this bakeoff.

## Process results and misses

Each process has eight cases.

| Process | 35B passed | Flash-Next passed |
|---|---:|---:|
| Memory inference | 7/8 | **8/8** |
| Remember enrichment | 7/8 | 7/8 |
| Schema repair | 6/8 | **8/8** |
| Session summary | 2/8 | **4/8** |
| Consolidation promotion | 5/8 | **7/8** |

Flash-Next's six failed cases are retained in the original samples:

- `consolidate-memory-pool`: the plan proposed promoting a protected operator
  preference and extra sources. AKM subsequently skipped the protected source as
  too small, but the scorer correctly checks the proposed plan, not just the
  accepted queue. This does not establish an actual harmful retirement.
- `enrich-translation-keys-memory`: the body retained `pt-BR`, but its generated
  metadata omitted that required locale identifier.
- `orders-dedupe-session-summary`: no usable session asset was written. The
  collector's saved reason cannot distinguish a missing/invalid summary from a
  call failure. The same collection's gateway logs record two failed requests:
  `model did not return valid JSON: Expecting ',' delimiter: line 1 column 553
  (char 552)`. Both failures remain in AKM's model-call telemetry. See the
  credential-free [error summaries](call-errors.json).
- `ci-cache-key-session-summary`, `print-interior-session-summary`, and
  `checkout-flaky-session-summary`: required filenames were present elsewhere
  in the output but absent from the explicit Key topics list. These fail the
  saved topic checks; no post-hoc scoring adjustment was applied.

The 35B's misses include one omitted explicit date in inference, one enrichment
date error, two schema-repair cases, six session summaries missing required
topics, and three promotion plans with extra/protected sources. Its original
samples retain each check and output. Both models still need review before
unattended promotion of protected material.

## Settings, provenance and limits

- Flash-Next: `splinter-b70/qwen3.8-flash-next-iq2_xs`, Intel Arc Pro B70 32 GB,
  Strata engine 0.1.46.3 at source revision
  `9de04cd44e927a9a3df6bbc0e94fc1be8b844ba4`, 131,072 context and one active
  sequence. The 35B: `fast/qwen3.6-35b-a3b`, RTX 4060 Ti 16 GB, llama.cpp,
  32,768 total context with two configured slots. Collection concurrency was one.
- Both used the existing owner-specific Docker runner, image ID
  `sha256:51eb4dbbfea0d67023f41705afe0fa3fabd5bc5bdd4db315b68b57610f5a9485`.
  Its recorded evaluator revision is
  `be1e8be64eb7e2d65c885a246776c5720b041eab`. The private profile/image is not
  published. It selects the remote embedding service and forwards credentials
  only through environment variables; no credentials are included here.
- The effective embedding configuration is OpenAI-compatible
  `embed/qwen3-embedding-0.6b`, 1,024 dimensions, with semantic search enabled.
  Both runs verified **116/116 embedded entries across 24 index checks**, zero
  verification/telemetry failures, and **zero observed search events**. Semantic
  setup is verified; this bakeoff does not establish a retrieval-quality gain.
- Corpus digest in both summaries:
  `70b86a9dadee30a95208b372e9c61f38314f57aa89208818b777ac40e7a86bf0`.
  Every case's input and label digest, config-patch digest, AKM version and
  embedding configuration match. Model choice, quantization, hardware and
  server configuration differ as documented. This compares deployed model
  stacks, not an isolated architecture effect.
- These were warm, shared lab services, without exclusive reservation or a
  controlled cold-start measurement. Case time includes AKM/indexing overhead.
  Request time includes prefill and parsing; output tokens/s is not decode-only
  speed. Token fields above are per-call means, not totals. Costs are unknown.
- A five-case Flash-Next setup pilot scored 4/5 with no failed calls and is
  retained locally; it is not pooled into the full-run quality scores.

The saved-run comparison tool reports the changed model both at the top level
and inside its engine metadata. Its generic multiple-settings warning is
preserved in the comparison artifacts. Artifact paths there are rendered
relative to the repository; the source summaries/samples are unchanged.

## Artifacts and interpretation

- [35B summary](../0.10.261005-beta/bakeoff/2026-10-21-fast-35b-q2-semantic-matched-full-20261021/summary.json)
  and [samples](../0.10.261005-beta/bakeoff/2026-10-21-fast-35b-q2-semantic-matched-full-20261021/samples.jsonl).
- [Flash-Next summary](../0.10.261005-beta/bakeoff/2026-10-21-flash-next-iq2-xs-semantic-full-20261021/summary.json)
  and [samples](../0.10.261005-beta/bakeoff/2026-10-21-flash-next-iq2-xs-semantic-full-20261021/samples.jsonl).
- Saved-run comparison: [Markdown](comparison.md), [JSON](comparison.json).

```sh
evals/bakeoff/run --corpus public --semantic --model splinter-b70/qwen3.8-flash-next-iq2_xs --label flash-next-iq2-xs-semantic-full-20261021
evals/bakeoff/run --corpus public --semantic --model fast/qwen3.6-35b-a3b --label fast-35b-q2-semantic-matched-full-20261021
```

These commands ran inside the pinned private Docker profile described above,
with the same gateway and lab embedding credentials supplied privately. Generic
`--semantic` selects native bge-small; it does not reproduce this owner's remote
embedding configuration by itself.

Flash-Next is a stronger candidate for quality-sensitive AKM metadata jobs on
this measured set; the 35B retains the latency and structured-output reliability
advantage. Keep the independent selections. This bakeoff does not test coding,
the full nightly improve pipeline, tool-call correctness, or production load,
and does not by itself justify replacing the fast tier or changing client
defaults.
