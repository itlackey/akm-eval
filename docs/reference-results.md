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

Token totals are provider-reported **answer-model** usage. The upstream judge
does not report GPT-4o tokens, so judge usage is not included. Wall time is
operational context, not a cross-arm latency benchmark: the full-context arm
had a dedicated GPU while vector and AKM shared a two-slot server.

## Verify the published evidence

From a fresh clone, with no model, dataset, credential, or API call:

```bash
bin/reference-eval verify
```

This verifies every file in the immutable `SHA256SUMS` bundle, reconstructs
scores, token totals, retry totals, and model censuses from per-question
records, cross-checks them against `results/official-results.json`, and prints
the table. A missing 277 MB dataset is reported but does not prevent evidence
verification.

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

Published package:

```bash
bin/reference-eval run-akm --akm-version 0.9.15 \
  --out runs/qwen-reference-akm-0.9.15
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
4. Append a new round to `results/official-results.json`. If correcting a prior
   entry, append a superseding or retracted record; do not rewrite history.
5. Run `bun run check`, `bun run lint`, and `bin/reference-eval verify` in a
   fresh clone before opening the results PR.

The ledger is data for humans and machines; the reference directory is the
evidence behind it. A score is not official until both are tracked and all
verification checks pass.
