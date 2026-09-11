# AKM 0.9.16-alpha.1 published-package result

This immutable evidence bundle records the published
`akm-cli@0.9.16-alpha.1` AKM arm against the frozen
`longmemeval-qwen35-9b-q4km-131k-v1` controls. It contains all 500 answer
checkpoints, predictions, official GPT-4o verdicts, normalized and raw results,
the wrapper log, the strict comparison, and routing evidence.

The result is **39.6% (198/500)** with **4,239,238 answer-model tokens**. The
frozen controls were not rerun: full-context baseline is 39.2% (196/500), and
raw vector is 28.6% (143/500).

This is a Tier B result because the answer-serving topology changed during the
checkpointed run. The first 188 answers were resumed from the prior direct
CUDA endpoint. The remaining requests from this run and the simultaneous
0.9.15 run were sent through an isolated Bifrost virtual key, round robin, to
two RTX 4060 Ti CUDA workers and one Intel Arc A770 SYCL worker. All three
served the same checksum-pinned Qwen 3.5 9B GGUF and identical inference
options. `routing-summary.json` accounts for all 609 post-resume requests:
609 successes, zero failures, and zero retries.

The generated result's `answerModelRuntimeImage` field retains the configured
canonical CUDA-image attestation established when the checkpoint was created;
the mixed-runtime protocol and routing summary in this bundle are the complete
serving record. The temporary Bifrost key/providers and CUDA workers were
removed after completion, and the pre-existing model services were restored.

Verify this bundle without making any model or API calls:

```bash
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.16-alpha.1
```

Use the canonical round—not this candidate-only round—as the control target
for future AKM comparisons. See `docs/reference-results.md`.
