# Qwen 3.5 9B LongMemEval reference round

This directory is the immutable evidence bundle behind the canonical
`longmemeval-qwen35-9b-q4km-131k-v1` ledger entry. It contains all 500 answer
checkpoints, predictions, official GPT-4o verdicts, normalized results, raw
outputs, summaries, and run logs for all three arms. AKM's transient index is
intentionally excluded: the checkpoint provenance records what was returned,
and the index can be rebuilt from the pinned dataset and candidate.

Start with:

```bash
bin/reference-eval verify
```

That command verifies every file in `SHA256SUMS`, cross-checks the ledger
against the underlying artifacts, and prints the official score/token/time
table. It does not call a model API.

The config actually used in 2026 is preserved byte-for-byte as
`recorded-config.json`. It used the old provider key `ai-lab` only as an env
forwarding workaround. New runs use the semantically equivalent, provider-name
independent config in
`config/reference/longmemeval-qwen35-9b-q4km-131k-v1.json`; its baseline and
retrieval endpoints are separate so the two-GPU topology is explicit.

See `docs/reference-results.md` for AKM-only comparisons, intentionally guarded
control reruns, all-arm reruns, model setup, compatibility rules, and how to
propose a new official ledger entry.
