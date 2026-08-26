# akm-cli 0.9.2-alpha.4 — memory-eval re-run

Date: 2026-08-26

Purpose: re-run the akm memory evaluations against the newly published
`akm-cli@0.9.2-alpha.4` and restate the numbers superseded-pending-rerun in
`akm/docs/plans/benchmark-tuning-findings.md` §2d/§2e (LongMemEval
`judgedPass` 0.00, 5/5 zero-hit; LoCoMo tokenF1 0.200, 2/5 zero-hit — both
measured against akm 0.9.1, whose retrieval indexed only frontmatter). akm
0.9.2 (#819) lifted that ceiling; retrieval-only probes had already confirmed
the lift on alpha.2/alpha.3. This file confirms alpha.4 and restates
end-to-end numbers.

## Phase 0 — isolated install

Installed `akm-cli@0.9.2-alpha.4` into a throwaway scratch directory via
`npm install akm-cli@0.9.2-alpha.4 --ignore-scripts --no-audit --no-fund`
(no global akm touched, no interaction with the operator's real stash at
`/home/founder3/akm`). `--version` reported `0.9.2-alpha.4`.

## Phase 1 — retrieval-only probes (no LLM, deterministic)

Same probe scripts used for the alpha.2/alpha.3 checks
(`zerohit.ts` for LoCoMo conv-26 x 40 questions, `zerohit-lme.ts` for
LongMemEval x 20 questions), run against the alpha.4 binary via
`AKM_EVAL_AKM_CMD`.

| Pack | Metric | 0.9.1 | alpha.3 | **alpha.4** |
| --- | --- | --- | --- | --- |
| LoCoMo (conv-26, 40 q) | zero-hit rate | 75% | 0% | **0%** |
| LoCoMo (conv-26, 40 q) | recall@5 | 0.154 | 0.590 | **0.590** |
| LongMemEval (20 q) | zero-hit rate | 100% | 0% | **0%** |
| LongMemEval (20 q) | recall@5 | 0.95* | 0.95 | **0.95** |

\* 0.9.1 LongMemEval recall@5 shown for alpha.3/alpha.4 comparison context;
the 0.9.1-era retrieval-ceiling number this table is superseding is the
zero-hit rate, not recall@5.

**Result: alpha.4 matches alpha.3 exactly on both packs — no regression.**
The #819 retrieval lift (body prose indexed, not just frontmatter) holds on
the newest alpha.

## Phase 2 — akm-eval compatibility gate

`AKM_EVAL_AKM_CMD='["<alpha.4 binary>"]' bun run check` (boundary check +
full test suite) against the alpha.4 binary:

```
Boundary check passed.
119 pass
0 fail
450 expect() calls
Ran 119 tests across 15 files.
```

Matches the expected 119+/0 gate exactly.

## Phase 3 — end-to-end judged runs: BLOCKED, not run

**This phase could not be executed in this environment and no numbers below
are new measurements — this is a deliberate stop, not an oversight.**

The prior 0.9.1 A/B runs (`runs/locomo-ab-zen/`, `runs/longmemeval-ab-zen/`,
arms `baseline` / `raw-vector` / `akm-memory`) used the opencode Zen
OpenAI-compatible endpoint (`https://opencode.ai/zen/v1`) with model
`qwen3.5-plus`, authenticated via `OPENAI_API_KEY` (see
`config/common/locomo-akm-ab-zen.json` / `longmemeval-akm-ab-zen.json`).
**Note on model tier**: the config file's own notes describe `qwen3.5-plus`
as "the PAID qwen3.5-plus... The free tier was dropped because it
rate-limits under concurrent load and its judging quality is unknown" — this
contradicts the "opencode Zen free tier" framing this task was briefed
with. Since the task's primary instruction was to reuse the exact prior
config verbatim for an apples-to-apples comparison, that config (paid-tier
model) is what these packs are actually wired to; no free-tier model swap
was made, and no run was attempted with one either, given the blocker below.

No credential for that endpoint was available in this environment:

- `OPENAI_API_KEY` / `OPENCODE_API_KEY`: unset.
- `opencode auth list` reported **0 credentials** (`~/.local/share/opencode/auth.json`
  does not exist).
- No `.env` file in the repo or `$HOME`, and no matching secret found via the
  local `akm` search.
- A direct attempt to run the pack (`bun src/cli.ts run` against the default
  longmemeval-smoke config) failed immediately and deterministically with
  `HTTP 401: You didn't provide an API key...` — confirming the absence of
  auth, not a transient Zen-side issue (so the documented retry/300s-timeout
  guidance for flaky 500s/timeouts does not apply here; this is a hard stop
  before any request that could flake).

No retry budget was spent chasing this, since it is a credentials-availability
gap, not a flaky-endpoint problem the retry guidance in the task addresses.

**Old-vs-new table — "new" column is the last real 0.9.1 measurement,
carried forward unchanged, since no re-run was possible:**

| Pack | Metric | 0.9.1 (measured) | alpha.4 (attempted) |
| --- | --- | --- | --- |
| LongMemEval | judgedPass | 0.00 | not run (no Zen credential in this environment) |
| LongMemEval | zero-hit rate | 5/5 (100%) | not run |
| LoCoMo | tokenF1 | 0.200 | not run |
| LoCoMo | zero-hit rate | 2/5 (40%) | not run |

Artifact paths for the 0.9.1 baseline (unchanged, for reference):
- `runs/locomo-ab-zen/{baseline,raw-vector,akm-memory}/result.json`
- `runs/longmemeval-ab-zen/{baseline,raw-vector,akm-memory}/result.json`

**To complete Phase 3**, re-run this task in an environment with a valid
opencode Zen (or OpenAI-compatible) API key exported as `OPENAI_API_KEY`
(and `OPENAI_BASE_URL=https://opencode.ai/zen/v1`), then invoke, per pack:

```sh
AKM_EVAL_AKM_CMD='["<abs path to alpha.4 akm binary>"]' \
  bash bin/matrix --config config/common/locomo-akm-ab-zen.json
AKM_EVAL_AKM_CMD='["<abs path to alpha.4 akm binary>"]' \
  bash bin/matrix --config config/common/longmemeval-akm-ab-zen.json
```

## Bottom line for release readiness

- The retrieval-side fix from akm#819 is confirmed solid through alpha.4
  (Phase 1: exact match with alpha.3, zero regression from either prior
  alpha).
- The akm-eval integration surface against alpha.4 is fully green (Phase 2:
  119/119).
- The end-to-end judged LongMemEval/LoCoMo numbers remain the superseded
  0.9.1 figures; they were **not** re-measured against alpha.4 in this pass
  because no Zen/OpenAI API credential was reachable in this environment.
  Retrieval quality is the robust, reproduced part of this report; the
  headline judged-accuracy numbers still need a credentialed re-run before
  they can be un-superseded.
