# AKM performance highlights

The current official memory result is the full 500-question LongMemEval round
`longmemeval-qwen35-9b-q4km-131k-v1`, recorded on 2026-09-08. All three arms
used the same checksum-pinned Qwen 3.5 9B Q4_K_M answer model and request
options; all 1,500 answers were judged with the benchmark's GPT-4o rubric.

## Result

| Arm | Accuracy | Correct | Answer-model tokens | Wall time |
| --- | ---: | ---: | ---: | ---: |
| Full-context baseline | 39.2% | 196/500 | 53,839,306 | ~11h 10m |
| Raw vector | 28.6% | 143/500 | 5,493,818 | 56m 5s |
| AKM 0.9.15 candidate (`lead`, 3200 chars) | 36.2% | 181/500 | 1,731,027 | 1h 14m 22s |

AKM beat raw vector by 7.6 percentage points and 38 answers while using 68.5%
fewer answer-model tokens. It finished 3.0 points and 15 answers below full
context while using 96.8% fewer answer-model tokens.

Wall time is included as operational context, not as a controlled latency
comparison. Baseline used a dedicated GPU; vector and AKM shared the two slots
of a second GPU. Token totals are provider-reported answer-model usage only;
the upstream judge does not report GPT-4o usage.

## Retrieval and context

| Metric | Raw vector | AKM |
| --- | ---: | ---: |
| Recall@5 | 40.1% | 84.8% |
| Precision@5 | 13.4% | 48.1% |
| MRR | 0.350 | 0.864 |
| NDCG@5 | 0.323 | 0.847 |
| Literal answer containment | 39.4% | 47.2% |

AKM's strongest measured gain is retrieval: it more than doubled recall@5 and
substantially improved ranking quality over the in-process cosine control. The
remaining gap between 84.8% recall and 36.2% judged accuracy is useful product
direction—retrieving relevant evidence does not guarantee that a 9B answer
model will use it correctly.

## Accuracy by category

| Category | Full context | Raw vector | AKM |
| --- | ---: | ---: | ---: |
| Single-session | 76.2% | 64.3% | 76.2% |
| Multi-session | 17.3% | 12.8% | 15.0% |
| Preference | 0.0% | 0.0% | 10.0% |
| Temporal | 18.0% | 9.0% | 15.8% |
| Knowledge-update | 67.9% | 42.3% | 52.6% |

These are descriptive results for this fixed model and protocol, not a claim
that AKM will produce the same deltas with every model or workload.

## Evidence and reproduction

The canonical machine-readable record is
[`results/official-results.json`](../results/official-results.json). The
tracked evidence bundle contains all per-question answers and verdicts plus a
checksum manifest. Reconstruct the table without a model, credential, or API
call:

```bash
bin/reference-eval verify
```

For a new AKM release, preserve the controls and rerun only the AKM arm. See
[`reference-results.md`](./reference-results.md) for the exact pinned model,
Docker topology, compatibility gate, resume behavior, intentional control
reruns, and publication checklist.

Older n=200/DeepSeek reports under `runs/` remain historical experiments; they
are not the current official result. Agentic-coding measurements belong in
[`akm-bench`](https://github.com/itlackey/akm-bench), not this memory-eval repo.
