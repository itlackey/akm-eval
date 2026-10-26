# Flint on Don — AKM bakeoff, 2026-10-25

Flint Q4_K_M on an Apple M4 Pro, evaluated with the 55 public cases of bakeoff
0.4 and AKM **0.10.261011-beta**. The source revision is
`b4725addaed4bed0f12c9659f72da3125f5c4b7c`.

## Official optimized-runtime follow-up

[Rec 0.1.0 with official INT4 weights](rec/README.md) reaches **124.22 native
decode tokens/sec**, versus **71.92** for a matched new LM Studio diagnostic
on Don (**1.73×**). The same five-case AKM pilot instead exposed three
preflight integration errors: one case passed, one failed and three errored.
A direct control confirms a 16-token reasoning-only probe and a reasoning-field
convention mismatch, not an unavailable model. No full rec run or workaround
was substituted for the original GGUF results below. The follow-up includes
raw timings, all pilot rows, reproductions and isolation details.

## Full 55-case result

**40/55 passed (72.73%)**, with all 55 cases scored, no case errors and no
command timeouts. Valid output documents: 45/55; mean checks: 78.30%.
Correct no-change decisions count as passes without producing a document.
The model-call telemetry records **110 calls, including one failed internal
call**; a completed case is not proof that every internal call succeeded.

| Deployed model | Cases passed | Median case | Harness wall time |
|---|---:|---:|---:|
| Flint Q4_K_M, Don, recommended sampling | 40/55 (72.73%) | 28.4 s | 55.54 min |
| [Qwen3.6 35B A3B](../0.10.261011-beta/bakeoff/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022/summary.json) | 43/55 (78.18%) | 3.8 s | 4.04 min |
| [Qwen3.8 Flash-Next IQ2_XS](../0.10.261011-beta-flash/bakeoff/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023/summary.json) | 52/55 (94.55%) | 4.1 s | 4.98 min |

All three use AKM 0.10.261011-beta, bakeoff/scoring 0.4 and identical corpus,
input and label digests. **Sampling, embeddings and deployed hardware/server
conditions differ**; this is not a matched model-only comparison. In particular,
Flint uses the operator-selected temperature-1 profile, and its requested
thinking-off setting was not effective. See the protocol below.

| Process | Flint | 35B | Flash-Next |
|---|---:|---:|---:|
| Memory inference | 21/23 | 19/23 | 23/23 |
| Remember enrichment | 1/8 | 8/8 | 8/8 |
| Schema repair | 6/8 | 7/8 | 8/8 |
| Session summary | 6/8 | 3/8 | 6/8 |
| Consolidation/promotion | 6/8 | 6/8 | 7/8 |

Flint's successful calls averaged **424.6 prompt tokens, 1,822.3 completion
tokens and 27.36 seconds**, with **66.6 output tokens/sec including prefill**.
The 35B recorded 119.6 output tokens/call at 73.5 tokens/sec; Flash-Next recorded
101.2 at 46.6 tokens/sec. Tokens/sec alone hides Flint's much longer generations.
Its case p95 was 173.95 seconds; the two slowest pools took 607.9 and 796.6
seconds, while four smaller pools took only 14.7–24.8 seconds.

Native usage confirms that **93.39% of completion tokens were reasoning** in
the 110 responses with complete token pairs. One further response reported
19,624 reasoning tokens but no final answer or full prompt/completion counts;
whole-window token totals therefore remain unknown. Native figures include
readiness/capability probes and are not case-success counts:
[native-usage.json](native-usage.json).

Manual review of the full outputs found:

- Seven enrichment results lacked the required metadata; the operation's
  256-token budget is a compatibility problem for this reasoning-heavy path.
  The simpler CSV enrichment did fit and pass.
- Two already-short notes received unnecessary children rather than no-change.
  The temporal distinctions and all four final scope/date controls passed.
- One repair wrote documentation-audit metadata for a **UI snapshot testing**
  lesson (`repair-snapshot-metadata`): a genuine grounding failure, distinct
  from the finite-word "worker image rollout" scoring miss.
- Two summaries omitted required file/API names from their topics.
- The first consolidation plan included a protected preference; AKM excluded
  it from the queue as too small. The 35-note pool missed an expected durable
  fact. The other six pools passed. No real user notes were involved.

**Interpretation:** Flint is not a drop-in improvement for all five AKM jobs in
this configuration. Its inference and summaries are promising, but enrichment
compatibility, one grounded-repair failure and long reasoning limit unattended
use. This workload does not assess Flint's advertised coding/tool-use strengths.

Raw artifacts: [summary](recommended-full/summary.json),
[all 55 saved answers](recommended-full/samples.jsonl).
Generated comparisons: [35B](vs-35b.md) ([JSON](vs-35b.json)),
[Flash-Next](vs-flash-next.md) ([JSON](vs-flash-next.json)). Only comparison
location/binary paths were normalized for publication; measurements and original
run artifacts are unchanged. Their "Thinking: Off" cells describe the requested
config, **not observed reasoning behavior**.

## Model and server

- Model: [Recursive Flint](https://huggingface.co/RecursiveSI/flint), a 39.8B
  mixture-of-experts model with approximately 2.5B active parameters per token.
- Weights: [LM Studio's Q4_K_M GGUF](https://huggingface.co/lmstudio-community/flint-GGUF),
  24,166,841,184 bytes. The downloaded SHA-256 matches the published artifact.
- Host: Don, Mac mini with Apple M4 Pro, 14 CPU cores and 64 GB unified memory.
- LM Studio **0.4.20+1**, Metal runtime **2.64.0**. The previous selected runtime,
  2.52.0, did not contain Flint support; it was retained when 2.64.0 was installed.
- Loaded identifier `flint-q4-k-m`; 32,768 context; full GPU offload requested;
  one prediction at a time; flash attention on; speculative decoding off.
- LM Studio reported a 44.38-second load and 22.51 GiB model memory. These are
  CLI observations, not peak whole-system memory measurements.

Full non-secret configuration and artifact identity: [hosting.json](hosting.json).
No existing model files were removed and no production gateway route was changed.

## Protocol and comparison limits

The public collector, prompts, cases and scorer are unchanged. Concurrency is
one, with the standard 900-second timeout per AKM command and no new output cap.
The isolated Docker runner uses a private embedding profile, rather than changing
public evaluator defaults: remote OpenAI-compatible
`embed/qwen3-embedding-0.6b`, dimension 1024, with semantic search enabled.
The existing embedding-coverage and semantic-event verification is also enabled
for this remote profile. Credentials are supplied only at runtime.

The comparison runs below use the same AKM release, 55 cases and bakeoff 0.4,
but native `Xenova/bge-small-en-v1.5` embeddings. Embedding configuration can
change consolidation behavior and index overhead. Hardware, serving route and
sampling also differ; these are observations of deployed configurations, not a
controlled model-only or hardware-only ranking.

Flint still returned reasoning when both `enable_thinking: false` and
`chat_template_kwargs.enable_thinking: false` were sent. Its official chat
template has no handling for that toggle. The initial readiness response
contained 78 reasoning tokens out of 91 completion tokens. **Thinking off is
requested by the harness, not verified as effective for Flint.** No template,
system-prompt or parser workaround was added to hide this behavior.

The operator selected Flint's [recommended sampling](https://huggingface.co/RecursiveSI/flint#recommended-generation-settings)
for the subsequent collection: **temperature 1, top-p 0.95, top-k 20**.
The exact configuration patch is [sampling.json](sampling.json). Existing
35B/Flash-Next results used temperature 0; keep that difference attached to
comparisons. These are **engine defaults**, not a claim that every internal
call uses them: this AKM's `remember --enrich` explicitly requests temperature
0.1 and a 256-token output limit, overriding the engine for that operation.
A single run is descriptive, not a significance test, and the
deterministic lexical checks are not a general coding or agent capability score.
No model RNG seed was set. Other backend sampler defaults were left unchanged,
not normalized against the other servers or tuned after seeing the results.

## Stock-temperature diagnostic pilot

The first case of each process was run with the standard temperature-0 settings
before selecting the recommended sampling profile. This is **five cases, not
the full suite**.

| Measure | Stock pilot |
|---|---:|
| Cases passed | 3/5 |
| Valid output documents | 4/5 |
| Cases errored / timed out | 0 / 0 |
| Median case | 18.8 s |
| Harness collection wall time | 596.031 s |
| Wall time, including runner startup and readiness probe | 599.447 s |
| Recorded model calls / errors | 11 / 0 |
| Mean completion tokens per successful call, including reasoning | 3,515.2 |
| Mean request duration, including prefill | 53.84 s |
| Output tokens/sec, including prefill | 65.3 |

Memory inference, schema repair and session summary passed. Enrichment wrote
a note without the required tags and observation metadata. Consolidation took
529.6 seconds and proposed promoting a protected operator preference as well as
the expected fact, failing the protected-note and exact-promotion checks.
These findings come from the saved answers, not just the aggregate score.

One completed internal consolidation call spent 213.053 seconds decoding
13,916 tokens, of which **13,875 were reasoning** and only 41 were non-reasoning
tokens. LM Studio reported **65.31 decode tokens/sec** for that call. This is
one native timing sample, not a full-run average or the harness's inclusive
throughput metric: [pilot-native-timing.json](pilot-native-timing.json).

Artifacts: [summary](stock-pilot/summary.json), [saved answers](stock-pilot/samples.jsonl).

### Why enrichment had no metadata

The pinned AKM's enrichment call has its own 256-token budget, temperature 0.1
and 10-second local deadline. In **both pilots**, LM Studio reported a
length-limited reply with 256 completion tokens, 255 reasoning tokens and
**zero final-answer characters**. AKM consequently wrote its unenriched note.
This explains the missing tags/date as an AKM/Flint budget and reasoning-control
integration problem; it does not establish that Flint cannot extract those
fields with adequate output budget. The existing workload remains unchanged
so the score measures what this AKM version actually delivers.

Evidence: [enrichment-native-observation.json](enrichment-native-observation.json).

## Recommended-sampling diagnostic pilot

The same five cases were then run using [sampling.json](sampling.json), before
starting the full collection. It completed with no transport or case errors:
**2/5 passed**, 4/5 valid output documents, 60% mean checks, 33.6-second median
case time and 596.790-second harness wall time (598.085 seconds including
container startup/readiness). The 11 recorded model calls averaged 3,591
completion tokens, 53.93 seconds and 66.6 inclusive output tokens/sec.

Memory inference and session summary passed. Enrichment again exhausted its
operation-specific token budget. The repair's trigger was "Use this procedure
before a planned worker image rollout": the finite-word trigger checker rejects
that wording, although it is a usable concrete instruction. Consolidation again
planned to promote a protected preference and failed the exact-promotion check; this case
took 497.1 seconds. No scoring rule or output was edited to improve these scores.

Artifacts: [summary](recommended-pilot/summary.json),
[saved answers](recommended-pilot/samples.jsonl).

The promotion checks score the model's **plan**, not just the accepted queue.
In both pilots AKM excluded the protected preference from the queue because
its source was too small (`promote_source_too_small`). The failed check is
therefore an incorrect planned promotion, not an observed protected-note write.

## Verification

- Full upstream mocked suite: **2,961 passed, 29 skipped, zero failed**. The
  initially missing report-index link was added before the successful rerun.
- Ledger type check, 32 ledger unit tests and the site build passed without
  changing any presentation or evaluator implementation.
- 74 upstream scorer, collector, usage and semantic-verification unit tests
  passed against the unmodified upstream embedding configuration.
- Eight real-AKM tests passed against scripted model responses, including all
  55 public cases, unusable replies, timeouts and failed endpoints.
- A separate check verified the private remote embedding profile and its
  semantic-verification activation; the lab embedding readiness call succeeded.
- The stock pilot embedded all nine indexed entries, with no verification
  failures or telemetry errors. No semantic search events were observed;
  configured embedding coverage is not proof that retrieval was exercised.
- The full collection embedded **131/131 entries across 39 index checks**, with
  zero verification failures or telemetry errors. Again, zero search events
  were observed; no retrieval claim is inferred from the enabled configuration.
- Flint remained loaded and idle after collection, with zero queued requests.
