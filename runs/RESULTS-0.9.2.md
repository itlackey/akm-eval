# akm-cli 0.9.2 (stable) — definitive memory-eval run

Date: 2026-08-29

Purpose: this is the **definitive** re-run against the newly published
**stable** `akm-cli@0.9.2` (npm `latest`), superseding every prior alpha
measurement (0.9.1, alpha.4, alpha.5). All four phases from the task brief
were executed to completion: isolated install, retrieval-only probes,
compat gate, and end-to-end judged runs.

## Phase 0 — isolated install

Fresh scratch dir with a minimal `package.json`
(`{"name":"probe","version":"1.0.0","private":true}`), installed via
`npm install akm-cli@0.9.2 --ignore-scripts --no-audit --no-fund`.
`node_modules/.bin/akm --version` printed exactly `0.9.2`. The machine's
global akm and the operator's real stash at `/home/founder3/akm` were never
touched; all commands used `AKM_EVAL_AKM_CMD` pointed at the isolated
install's binary.

## Phase 1 — retrieval-only probes (no LLM, deterministic)

Reused the existing unmodified probe scripts (`zerohit.ts` for LoCoMo
conv-26 x 40 questions, `zerohit-lme.ts` for LongMemEval x 20 questions),
run from the akm-eval repo root against the 0.9.2 binary.

| Pack | Metric | 0.9.1 | alpha.4 | alpha.5 | **0.9.2** | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| LoCoMo (conv-26, 40q) | zero-hit | 75.0% | 0.0% | 0.0% | **0.0%** | no regression |
| LoCoMo (conv-26, 40q) | recall@5 | 0.154 | 0.590 | 0.590 | **0.590** | no regression |
| LongMemEval (20q) | zero-hit | 100% | 0.0% | 0.0% | **0.0%** | no regression |
| LongMemEval (20q) | recall@5 | 0.000 | 0.950 | 0.950 | **0.950** | no regression |

**0.9.2 matches alpha.5 byte-for-byte on every retrieval metric.** The #819
retrieval lift (body prose indexed, not just frontmatter) holds unchanged in
the stable release.

## Phase 2 — akm-eval compatibility gate

`AKM_EVAL_AKM_CMD='["<0.9.2 binary>"]' bun run check`:

```
Boundary check passed.
bun test v1.3.14
119 pass
0 fail
450 expect() calls
Ran 119 tests across 15 files.
```

119 pass / 0 fail, matching the expected 119+/0 gate exactly. Additionally
ran `tests/memory-backend-akm.integration.test.ts` in isolation to confirm
the #819 body-prose retrievability contract specifically: **2 pass / 0 fail,
22 expect() calls** — no regression on the contract this test exists to
guard.

## Phase 3 — end-to-end judged runs (paid `qwen3.5-plus`, 5 questions/pack)

Same configs as prior rounds (`config/common/locomo-akm-ab-zen.json`,
`config/common/longmemeval-akm-ab-zen.json`), only the akm pin changed to
the isolated 0.9.2 binary. All 6 arms (3 per pack) completed successfully
on the first attempt, no retries needed. Results:
`runs/locomo-ab-zen-092/`, `runs/longmemeval-ab-zen-092/`.

### LongMemEval — judgedPass

| Arm | 0.9.1 | alpha.4 | alpha.5 | **0.9.2** | Verdict |
| --- | --- | --- | --- | --- | --- |
| akm-memory | 0.00 | 1.00 | 1.00 | **1.00** | no regression — exact match with alpha.5 |
| baseline | 1.00 | 1.00 | 0.80 | **1.00** | within noise (n=5, single-question flip; arm never touches akm — `memory.backend: none`) |
| raw-vector | 0.20 | 0.00 | 0.20 | **0.20** | no regression — matches alpha.5, consistent with documented 0.20/0.00/0.20 wobble pattern |

### LoCoMo — accuracy (official token-F1 QA score)

| Arm | 0.9.1 | alpha.4 | alpha.5 | **0.9.2** | Verdict |
| --- | --- | --- | --- | --- | --- |
| akm-memory | 0.200 | 0.60 | 0.633 | **0.633** | no regression — exact match with alpha.5 |
| baseline | 0.567 | 0.50 | 0.70 | **0.500** | within noise (n=5, judged long-context arm; arm never touches akm — `memory.backend: none`) |
| raw-vector | 0.233 | 0.233 | 0.233 | **0.233** | no regression — **byte-identical across all four rounds**, confirming the harness control is stable |

## n=5 judged-run caveat

Every Phase 3 number is over 5 questions per pack per arm — a single
question flipping pass/fail moves the score by 0.20. The two `baseline`
arms (LoCoMo 0.70→0.50, LongMemEval 0.80→1.00) are the only inter-round
movement in this run, and both are confined to the `memory.backend: none`
full-context arm, which never invokes akm-cli at all (it answers from the
entire flattened conversation/haystack, not retrieval). That isolates the
movement to LLM-judging noise on the baseline arm specifically, not to
anything in the 0.9.2 release. This is **within noise**, not a material
regression: the two `akm-memory` arms (the only arms that exercise akm-cli
end-to-end) matched alpha.5 exactly on both packs, and `raw-vector` — the
harness's own control — was exactly 0.233 on LoCoMo across all four
measured rounds and repeated its known 0.20 value on LongMemEval.

## Bottom line

**Stable akm-cli 0.9.2 does not regress anything vs alpha.5.** Every metric
that touches akm-cli — both retrieval-only probes (Phase 1, exact match),
the compat gate including the #819 contract test (Phase 2, green), and the
`akm-memory` judged arm on both packs (Phase 3, exact match) — is identical
to alpha.5. The only numbers that moved at all are the `baseline` arms,
which never call akm-cli and are attributable to ordinary n=5 LLM-judging
noise, consistent with the same wobble pattern already documented for
`raw-vector`'s LongMemEval score across earlier rounds.
