# AKM 0.9.16 published-package result

This evidence bundle is the official `akm-cli@0.9.16` result. The paid run was
made against `akm-cli@next` when it resolved to `0.9.16-alpha.2`; the final
release retains the same indexer, retrieval, fragment-selection, and context
behavior. The source-tag diff adds only version/changelog updates and a
byte-preserving fix for draining piped stdout documents larger than 64 KiB.
`release-equivalence.json` records that audit, while `package-provenance.json`
and the raw artifacts retain the exact package that executed. The bundle
contains the complete 500-question AKM arm: answer checkpoints, predictions,
official GPT-4o verdicts, normalized and raw results, and the wrapper log.

The result is **35.4% (177/500)** with **1,731,173 answer-model tokens** and an
exact wall time of **1h 10m 43s**. The frozen controls were not rerun:
full-context baseline is 39.2% (196/500), and raw vector is 28.6% (143/500).

This is a Tier B result. The existing krang `fast-a770` service provided all
500 answers without any restart, reconfiguration, routing change, or retry.
It served the checksum-identical Qwen 3.5 9B Q4_K_M artifact through
llama.cpp b10920 on Intel/SYCL with 32,768 context, two slots, and
`--repeat-penalty 1.1`. That runtime differs from the frozen Tier A controls,
so wall time is not a controlled hardware comparison and the strict reference
comparison correctly refuses to label this run protocol-compatible.

The indexer reversion is directly visible in the artifacts. Compared with the
published 0.9.15 package arm, all 500 retrieval provenance lists, retrieved
contexts, and answer-model input-token counts are identical. The aggregate
retrieval and context metrics are also identical, and 444/500 hypotheses are
identical. The 56 changed hypotheses account for a net loss of six correct
answers; three GPT-4o verdicts changed among the 444 identical hypotheses and
netted one answer back, producing the observed five-answer difference from
0.9.15. This isolates the remaining variation to generation/judging under the
newer serving runtime, not AKM retrieval.

Against 0.9.16-alpha.1, 0.9.16 is down 4.2 percentage points and 21 correct
answers while using 2,508,065 fewer answer-model tokens (59.2% less). The
alpha.1 indexer behavior changed 306/500 retrieved-session lists, whereas the
0.9.16 reversion restores the 0.9.15 retrieval surface exactly.

Verify this bundle without making model or API calls:

```bash
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.16
```

Use the canonical round—not this candidate-only Tier B round—as the control
target for future strict comparisons. See `docs/reference-results.md`.
