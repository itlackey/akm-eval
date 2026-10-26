# Official rec follow-up on Don

This is a separate deployment diagnostic for Recursive's optimized Apple
Silicon runtime. The original GGUF results remain unchanged. This compares
**runtime plus quantization**, not an isolated kernel change or a general
model-quality ranking.

## Results

**The optimized runtime is substantially faster, but it is not a drop-in
replacement for this pinned AKM version.**

| Short-context diagnostic | LM Studio Q4_K_M | Official rec INT4 |
|---|---:|---:|
| Input tokens, each request | 955 | 955 |
| Output tokens, each request | 1,024 | 1,024 |
| Measured requests, excluding warmup | 5 | 5 |
| Median native decode tokens/sec | 71.92 | **124.22** |
| Median inclusive HTTP tokens/sec | 66.62 | **109.81** |

That is **1.73× native decode throughput** and **1.65× inclusive throughput**
on Don. Rec reaches about **94.7%** of the publisher's 131.22-token/sec
short-context headline, subject to the protocol differences below. This is
not a measured 1.73× improvement in completed AKM jobs or coding quality.
Rec reported zero reused prompt tokens in all six throughput requests. Its
largest measured MLX allocation was **25.41 GiB**; this is not whole-system
peak memory or evidence of no swapping.

Raw counters: [LM Studio HTTP](throughput-lmstudio.json),
[LM Studio native](throughput-lmstudio-native.json),
[rec HTTP](throughput-rec.json), [rec native](throughput-rec-native.json).
The rec API does not report reasoning-token counts in these responses;
their `null` values are unknown, not zero. The native instrumentation does
not identify reasoning tokens either.

### AKM pilot: one pass, one failure, three integration errors

| Case | Official rec result |
|---|---|
| Memory inference | Preflight error: empty response |
| Remember enrichment | Unusable JSON; metadata checks failed |
| Schema repair | Preflight error: empty response |
| Session summary | Passed; 17.0 seconds |
| Consolidation/promotion | Preflight error: empty response |

All five cases were attempted; **only two were scored**. One passed, one
failed and three errored. The collector's **50% is 1/2 scored cases, not
50% of five successful attempts**. Overall, one of five attempted cases
passed. There were no command timeouts. Runner wall time was **22.836
seconds** (23.872 including startup/readiness), but that short duration is
mostly missing work: the three improve operations never reached their real
tasks. It must not be compared to the old 596.790-second pilot as a speedup.

The session-summary case did complete: **17.0 seconds**, versus **33.6**
seconds in the earlier recommended-sampling GGUF pilot. One stochastic case
with different weights/runtime is descriptive, not a quality or latency
distribution estimate. Rec's native default seed was 0; the earlier GGUF
pilot did not pin an equivalent backend seed.

The unchanged collector recorded six model calls with zero transport-call
errors, even though three CLI operations errored. Those probes returned
HTTP 200 but no answer the pinned AKM client could read. Native metrics
include seven requests, counting the external runner readiness probe.
Embedding coverage was 9/9 across three index checks with no verification
failure; again no search events were observed.

Evidence: [unaltered summary](pilot/summary.json),
[all five saved case rows](pilot/samples.jsonl),
[native request counters](pilot-rec-native.json),
[machine-generated comparison](vs-lmstudio-pilot.md)
([JSON](vs-lmstudio-pilot.json)). Comparison location strings alone were
made repository-relative for publication; raw measurements were not edited.
The generated comparison's aggregate quality percentages have different
denominators and are **not comparable quality scores**. Its "Thinking: Off"
cells describe the inherited request, not observed model behavior.

### Confirmed cause, not a benchmark workaround

The pinned AKM's `dist/llm/client.js:probeLlmReachable` requests:

```json
{"messages":[{"role":"user","content":"Respond with just the word: ok"}],"max_tokens":16,"temperature":0}
```

Its `chatCompletion` extracts `message.content || message.reasoning_content`.
Rec 0.1.0 instead emits a `message.reasoning` field. With 16 tokens the
direct control returned HTTP 200, `finish_reason: "length"`, reasoning,
and no final content. **Changing only the budget to 512 returned `ok`,
`finish_reason: "stop"`, after 23 tokens.** The two control requests are
separate from all pilot/throughput counters:
[complete control responses](probe-budget-control.json).

Thus the setup is reachable and capable of answering, but the tiny probe
plus differing reasoning-field conventions cause a false negative. The
enrichment operation separately generated its full 256-token allowance at
temperature 0.1 and produced no usable metadata. Increasing runtime speed
does not increase that token budget.

No shim, probe bypass, model patch or altered scorer was added to make the
pilot pass. **No full 55-case rec run was started**, because these integration
failures would make that comparison incomplete. A follow-up belongs in
AKM's endpoint-probe/response handling and operation budgets, not a custom
lab inference proxy. It should distinguish protocol reachability from a
complete final answer and never treat reasoning as valid task JSON.

## Setup

- Same Don: Apple M4 Pro, 14 CPU cores, 20 GPU cores, 64 GB unified memory.
- Official prebuilt **rec 0.1.0**, release source
  [`e53663b`](https://github.com/recursive-oss/rec/tree/e53663b262af4cb1ca498e596ca8b1a2d79e0800).
  Executable: 276,603,858 bytes; SHA-256
  `22f08e8505e5ace84475c23eefffd116b4b201ad7e796aaea76d223f0e3862de`.
- Official [RecursiveSI/flint-int4](https://huggingface.co/RecursiveSI/flint-int4/tree/3b93f9053b530488405ae9fca51d4900d6ce21f0),
  revision `3b93f9053b530488405ae9fca51d4900d6ce21f0`.
  The release downloader verifies every file's size and SHA-256. Its complete
  descriptor is pinned in the release's
  [`packaging/flint-int4-mlx.json`](https://github.com/recursive-oss/rec/blob/e53663b262af4cb1ca498e596ca8b1a2d79e0800/packaging/flint-int4-mlx.json).
- Embedded runtime archive SHA-256
  `09063110dfe90c36bc40a518a64c3e9110387d449adf000be85023cfc8d46de1`.
- 32,768 input-plus-output context, matching the earlier LM Studio load.
  Native rec defaults: Metal optimization, fast synchronization and Flint
  grammar enabled; temperature 1, top-p 0.95, top-k 20.

No installer was run. The executable was downloaded directly and checked
against the release's `.meta` file. An absolute task-specific `XDG_DATA_HOME`
keeps rec-managed state, weights and the bundled runtime together. No Pi,
OpenCode, Homebrew packages, global Python packages, shell-profile changes or
startup services were installed. LM Studio stayed installed and its existing
GGUF files were preserved. The two models were not intentionally loaded at
the same time.

The API stayed on Don's loopback interface; the existing Linux Docker
evaluator reached it over an SSH local forward. No production gateway route
or LAN listener was added. API credentials stayed in private files and runtime
environment variables, not report artifacts.

## Throughput method

[`throughput.mjs`](throughput.mjs) sends one warmup followed by five measured
requests. Both backends receive the same user prompts and explicit temperature
1, top-p 0.95, top-k 20, seed 42 and 1,024-token output limit. The model ID is
the only changed request field. Each prompt starts with a different run number
to reduce shared-prefix reuse; backend caching is not disabled. Input length
is taken from each backend's usage, not estimated from characters.

The synthetic request deliberately asks for more code than fits in 1,024
tokens. Hitting that limit is expected here and says nothing about task
completion or quality. Reasoning tokens count toward generated tokens.

The script's wall-clock rate includes prefill, HTTP transport and parsing.
**It is not decode-only speed.** Native LM Studio `print_timing` counters and
rec's documented `--metrics` counters are recorded separately. Normalized
decode rates use `(generated_tokens - 1) / decode_seconds`; the first token
is excluded. Warmup is excluded from all reported medians.

For native telemetry, the unmodified bundled `rec-mlx` executable is invoked
with the same model, key file, context and port as `rec serve`, plus its
standard `--metrics` option. This enables measurements without patching the
engine or changing its sampling or decoder. The ordinary `rec serve` path is
also checked independently for readiness.

Example, with credentials supplied privately:

```sh
MODEL_BASE_URL=http://127.0.0.1:21500/v1 MODEL_NAME=flint \
  node throughput.mjs rec-int4 throughput-rec.json
```

Use Node 22+ or Bun; no dependencies are installed by this script. Its small
test suite checks request parity, aggregation, error handling and that saved
results contain neither endpoint nor credential.

## AKM pilot method

The same five public cases (one per process), pinned AKM
**0.10.261011-beta**, evaluator revision
`b4725addaed4bed0f12c9659f72da3125f5c4b7c`, existing private Docker runner,
remote Qwen3 embedding profile and [sampling patch](../sampling.json) are used.
No prompts, scoring, operation-specific budgets or public evaluator defaults
are changed. This is a **five-case pilot**, not another full 55-case run.

The inherited harness requests thinking off, but Flint's reasoning is always
enabled; rec ignores unsupported thinking fields. AKM's enrichment operation
still overrides the engine with temperature 0.1 and a 256-token output budget.
Do not interpret a faster engine as resolving that budget mismatch.

## Publisher comparison

Recursive's [published M4 Pro chart](https://recursive.com/updates/introducing-recursive-flint)
reports 131.22 decode tokens/sec for its optimized MLX path and 87.98 for
llama.cpp at 1K input context. Its [engine benchmark description](https://github.com/recursive-oss/rec)
uses five runs per context and 1,024 output tokens, excluding prefill.
Our diagnostic is close to, but not an exact reproduction of, that protocol:
the prompts, quantization, allocated context, host conditions and possibly
runtime revisions differ. The publisher's chart uses a 48 GiB M4 Pro Mac;
Don is a 64 GB Mac mini. No tuning is performed to chase the published number.

Recursive's [generation guide](https://docs.recursive.com/guides/generation-settings)
explicitly documents always-on reasoning. Its [model card](https://huggingface.co/RecursiveSI/flint#recommended-generation-settings)
recommends at least 32,768 output tokens for hard problems, including reasoning.
That recommendation is not applied silently to AKM's fixed-budget operations.

## Verification and handback

- Repository type checks passed. Complete mocked suite: **2,965 passed,
  29 skipped, zero failed**, including four tests for the diagnostic script.
- The ledger build passed and includes this run as a **Pilot**, not a full
  result: five recorded, two scored, three errors. The original full GGUF
  result and both earlier pilots remain intact.
- Raw pilot summary/sample files are byte-identical to the collected files;
  the five input/label digests match the earlier five-case pilot. JSON files
  parse and the new artifacts were checked for runtime credentials, private
  host addresses and local paths before publication.
- The unmodified ordinary `rec serve` path passed its native health,
  model-identity and generation readiness checks before instrumented testing.
- Rec and the SSH tunnel were stopped. LM Studio was restored to the same
  original `flint-q4-k-m` load settings and verified idle with zero queued
  requests. No evaluation containers remained. Existing model files and
  production routes were not removed or changed.
- The isolated rec directory was retained for reproducibility, approximately
  **22 GiB** on disk. Nothing starts automatically. No tools or artifacts were
  silently deleted during cleanup. See [hosting.json](hosting.json).
