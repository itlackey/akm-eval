# Run results index

Point-in-time memory-eval reports tracking the akm#819 body-prose retrieval fix across akm 0.9.2
pre-releases and the stable cut. Listed newest first. These files are historical records and are
**not** rewritten when later docs/notice text changes — see `docs/memory-backends.md` for the
current retrieval-ceiling contract.

- **`RESULTS-0.9.2.md`** — akm-cli **0.9.2** (stable), measured 2026-08-29. **This is the current,
  definitive result.** Zero-hit rates at 0.0% on both packs (LoCoMo 40q, LongMemEval 20q); LoCoMo
  recall@5 0.590, LongMemEval recall@5 0.950; end-to-end judged akm-memory arm 0.633 (LoCoMo) / 1.00
  (LongMemEval). Matches the alpha.5 pre-release byte-for-byte on every retrieval metric — no
  regression from pre-release to stable.
- **`RESULTS-0.9.2-alpha.4.md`** — akm-cli **0.9.2-alpha.4**, measured 2026-08-26. **Superseded** by
  `RESULTS-0.9.2.md`. Confirms the alpha.2/alpha.3 retrieval-only numbers hold (zero-hit 0.0% both
  packs) and the compat gate is green; Phase 3 end-to-end judged runs were **not** measured in this
  file (blocked — no Zen/OpenAI credential available in that environment), so its judged-accuracy
  numbers are still the pre-0.9.2 (akm 0.9.1) figures carried forward unchanged, not new
  measurements.

## Note on alpha.5

`RESULTS-0.9.2.md`'s tables cite `alpha.5` figures for comparison (retrieval metrics matching
byte-for-byte, judged runs in `runs/locomo-ab-zen-alpha5/` and `runs/longmemeval-ab-zen-alpha5/`), but
no standalone `RESULTS-0.9.2-alpha.5.md` report was ever written — only the raw run artifact
directories exist on disk. The alpha.5 numbers are only documented secondhand, inside
`RESULTS-0.9.2.md`.
