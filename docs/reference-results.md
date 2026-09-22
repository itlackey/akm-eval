# Reusing and reproducing the official LongMemEval reference

The canonical small-model round is
`longmemeval-qwen35-9b-q4km-131k-v1`: all 500 official LongMemEval questions,
Qwen 3.5 9B Q4_K_M answers, and the official GPT-4o rubric. Its baseline and
raw-vector arms are frozen controls. A new AKM release normally runs **only the
AKM arm** against them.

| Arm | Score | Correct | Answer-model tokens | Wall time |
| --- | ---: | ---: | ---: | ---: |
| Full-context baseline | 39.2% | 196/500 | 53,839,306 | ~11h 10m |
| Raw vector | 28.6% | 143/500 | 5,493,818 | 56m 5s |
| AKM 0.9.15 candidate (`lead`, 3200 chars) | 36.2% | 181/500 | 1,731,027 | 1h 14m 22s |
| AKM 0.9.15 published package (`lead`, 3200 chars) | 36.4% | 182/500 | 1,731,030 | ~1h 33m 32s |
| AKM 0.9.16-alpha.1 published package (`lead`, 3200 chars) | 39.6% | 198/500 | 4,239,238 | ~1h 42m 1s |
| AKM 0.9.16 published package (`lead`, 3200 chars) | 35.4% | 177/500 | 1,731,173 | 1h 10m 43s |

Token totals are provider-reported **answer-model** usage. The upstream judge
does not report GPT-4o tokens, so judge usage is not included. The frozen
three-arm round is Tier A. The package rows are Tier B. The 0.9.15 and alpha.1
runs resumed through an operator-approved mixed CUDA/Intel pool. 0.9.16 used
the pre-existing direct Intel/SYCL service for all 500 answers without changing
it; its newer runtime and repeat penalty differ from Tier A. Tier B wall times
are not controlled latency benchmarks.

The published 0.9.16-alpha.1 package gains 3.2 percentage points and 16 correct
answers over the published 0.9.15 package, while using 2,508,208 more
answer-model tokens (144.9% more). Against the frozen controls it is +11.0
points over raw vector and +0.4 points over full context.

The 0.9.16 indexer reversion restores the 0.9.15 retrieval surface exactly:
500/500 retrieval provenance lists, retrieved contexts, and input-token counts
match. Its observed score is 35.4%, down 4.2 points and 21 answers from alpha.1
while using 2,508,065 fewer answer-model tokens (59.2% less). The evidence
bundle records why the newer serving runtime prevents a strict Tier A
comparison and separates retrieval equivalence from generation/judge variance.

The paid artifact reported `0.9.16-alpha.2`. The final `0.9.16` tag changes
only version/changelog metadata and byte-preserving piped-stdout transport; no
indexing, retrieval, fragment, context, or bounded response behavior used by
this run changed. The final release therefore adopts the completed score. Its
bundle preserves both the exact evaluated artifact and the source-diff audit.

## Verify the published evidence

From a fresh clone, with no model, dataset, credential, or API call:

```bash
bin/reference-eval verify
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.15
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.16-alpha.1
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.16
```

These commands verify every file in each immutable `SHA256SUMS` bundle,
reconstruct scores, token totals, retry totals, and model censuses from
per-question records, cross-check them against `results/official-results.json`,
and print the recorded arms. A missing 277 MB dataset is reported but does not
prevent evidence verification.

The evidence lives under
`results/reference/longmemeval-qwen35-9b-q4km-131k-v1/`. The original config is
preserved byte-for-byte there. New runs use the equivalent provider-neutral
config under `config/reference/`; this removes an old `ai-lab` naming workaround
and explicitly assigns the long-context and retrieval endpoints.

## One-time local setup

Requirements are Git, Docker Compose, two NVIDIA GPUs with at least 16 GB each,
and the NVIDIA Container Toolkit. Bun, Node, Python, jq, llama.cpp, and AKM are
container-owned.

Download and checksum the pinned dataset and 5.24 GiB GGUF, then start the exact
llama.cpp image and topology used by the reference round:

```bash
bin/downloads LongMemEval
bin/reference-model fetch
bin/reference-model up
```

`reference-model fetch` downloads the exact
[`lmstudio-community/Qwen3.5-9B-GGUF` artifact](https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF/blob/d9006465af6fc714af653e381fbfa55ead5af84b/Qwen3.5-9B-Q4_K_M.gguf)
with resumable transfer and refuses a SHA mismatch. `reference-model up` starts:

| Endpoint | Default GPU | Slots | Context per slot | Used by |
| --- | ---: | ---: | ---: | --- |
| `http://qwen-baseline:8080/v1` | 1 | 1 | 131,072 | baseline |
| `http://qwen-retrieval:8080/v1` | 0 | 2 | 32,768 | raw-vector and AKM |

Override locations, GPU indices, or host ports without editing tracked files:

```bash
export AKM_EVAL_MODEL_DIR=/data/models/akm-eval
export AKM_EVAL_BASELINE_GPU=1
export AKM_EVAL_RETRIEVAL_GPU=0
export AKM_EVAL_BASELINE_PORT=4062
export AKM_EVAL_RETRIEVAL_PORT=4060
```

The compose file pins the image digest, model filename, context sizes, slot
counts, GPU offload, flash attention, Q8_0 KV cache, Jinja template, and
`enable_thinking=false`. The eval config independently pins temperature 0,
seed 1337, and 256 maximum output tokens.

Those service URLs resolve on the private `akm-eval-reference` Docker network;
the eval wrapper joins it automatically. For host-only inspection, the same
servers bind only to `127.0.0.1:4062` and `127.0.0.1:4060`.

Provide only the GPT-4o judge credential; the local answer endpoint uses a
non-secret placeholder key by default:

```bash
export AKM_EVAL_JUDGE_API_KEY=... # cloud OpenAI key able to serve gpt-4o
```

An env file outside the checkout is also supported:

```bash
AKM_EVAL_ENV_FILE=/absolute/path/to/akm-eval.env bin/reference-eval verify
```

## Test a new AKM release (normal path)

Published package (replace the version and output directory together):

```bash
bin/reference-eval run-akm --akm-version 0.9.16 \
  --out runs/qwen-reference-akm-0.9.16
```

Unpublished checkout, built inside Docker from Git-tracked and unignored files:

```bash
bin/reference-eval run-akm --akm-source ../akm \
  --out runs/qwen-reference-akm-next
```

The command:

1. verifies the frozen reference bundle, dataset, GGUF, and local model endpoint;
2. runs only `akm-memory-lead` over all 500 questions;
3. checkpoints every answer and GPT-4o verdict;
4. verifies question order, model bytes/runtime/options, prompt contract, judge,
   `topK`, fragment policy, artifact row counts, score, tokens, and AKM source
   cleanliness; and
5. writes `comparison-to-longmemeval-qwen35-9b-q4km-131k-v1.json` next to the run.

Use the same `--out` after an interruption. Signature-compatible answers and
judge verdicts resume; incompatible checkpoints are rejected rather than
silently imported.

To validate an already completed candidate without running anything:

```bash
bin/reference-eval compare \
  --candidate runs/qwen-reference-akm-next/akm-memory-lead/result.json
```

An AKM implementation/version/source fingerprint is deliberately part of the
AKM checkpoint identity. It is deliberately **not** part of baseline or
raw-vector identities. Raw-vector's own implementation is part of its identity.
This lets controls survive AKM releases without allowing vector code changes to
reuse stale answers.

## Rerun controls only when the protocol changed

Do not rerun controls for a normal AKM release. Rerun them when the dataset,
ordered questions, answer-model bytes/runtime/options, answer prompt, judge
rubric/model, retrieval implementation, or `topK` changes—or to independently
replicate the frozen values.

Preview commands without model calls:

```bash
bin/reference-eval rerun-control baseline --out runs/control-check --dry-run
bin/reference-eval rerun-controls --out runs/control-check --dry-run
```

Intentional single-control or parallel two-control runs require an explicit
guard:

```bash
bin/reference-eval rerun-control raw-vector \
  --confirm-control-rerun --out runs/qwen-controls-replication

bin/reference-eval rerun-controls \
  --confirm-control-rerun --out runs/qwen-controls-replication
```

`rerun-controls` sends baseline to its dedicated GPU and raw-vector to the
second GPU concurrently. To replicate all three arms with the original
two-GPU throughput pattern:

```bash
bin/reference-eval rerun-all --akm-version 0.9.15 \
  --confirm-all-rerun --out runs/qwen-full-replication
```

That starts all three evaluator workers concurrently: baseline uses GPU 1;
raw-vector and AKM occupy the two slots on GPU 0.

## Recording a new official round

Never replace the frozen bundle or edit a published score in place.

1. Keep the completed run directory, including result, raw output, predictions,
   answer checkpoint + manifest, judge log, summary, and wrapper log.
2. Run `bin/reference-eval compare` for compatibility.
3. Copy the evidence into a new `results/reference/<round-id>/` directory,
   remove only rebuildable backend indexes, and create a sorted `SHA256SUMS`.
4. Append a candidate-only round to `results/official-results.json`; keep the
   frozen controls in their original round and store the strict cross-round
   comparison in the new evidence bundle. If correcting a prior entry, append
   a superseding or retracted record; do not rewrite history.
5. Run `bun run check`, `bun run lint`, and `bin/reference-eval verify` in a
   fresh clone, plus `bin/reference-eval verify --round <round-id>` for every
   new round, before opening the results PR.

The ledger is data for humans and machines; the reference directory is the
evidence behind it. A score is not official until both are tracked and all
verification checks pass.
