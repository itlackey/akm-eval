# akm-cli 0.9.3 — n=25 judged memory-eval (first quantitative round)

Date: 2026-08-30

Every prior judged round in this repo ran n=5 per arm, where one question
flipping pass/fail moved a score by 0.20 — directional at best. This round
raises `maxQuestions` to 25 (150 judged trials total: 25 × 3 arms × 2 packs)
so effect sizes can actually be stated with a confidence interval instead of
eyeballed. That is the point of this round, and the numbers below are
reported with that discipline: point estimates, spread, and a proper
two-sample test on the differences that matter — not just a bigger table.

**Two things changed at once vs every prior round**: sample size (5 → 25)
*and* the agent model (`qwen3.5-plus` → `deepseek-v4-flash`; the judge stayed
pinned at `qwen3.5-plus` throughout, deliberately, so judged scores stay
comparable). Cross-round deltas are called out honestly below as confounded
by both variables — except where a same-round control lets the confound be
isolated (see "What actually moved" below).

## Interpretation first

**The durable claim: akm roughly doubles naive vector retrieval on both
packs.**

| Pack | akm-memory | raw-vector | ratio |
| --- | --- | --- | --- |
| LongMemEval | 0.880 | 0.520 | 1.7x |
| LoCoMo | 0.431 | 0.213 | 2.0x |

This replicated at n=25 on both packs. It is the headline result of this
round, and the more statistically solid one — see the significance section
below: the LongMemEval gap is decisive (p ≈ 0.003), the LoCoMo gap is real
but only borderline at this sample size (p ≈ 0.03).

**The claim that did NOT survive: "akm beats baseline."** Against full
context the result splits by pack:

- **LongMemEval**: akm-memory (0.880) is statistically indistinguishable
  from baseline (0.920) — z ≈ 0.47, p ≈ 0.64, no basis to call these
  different — while reading roughly **6.5% of baseline's tokens**
  (169,295 vs 2,607,654 total tokens across the 25-question run).
- **LoCoMo**: akm-memory (0.431) **loses** to baseline (0.649), and this gap
  is statistically real (z ≈ 2.27, p ≈ 0.023).

State this plainly rather than burying it: memory retrieval matches a
long-context reference on one pack and loses to it on the other, at the same
akm version, same agent, same n.

**LoCoMo's earlier n=5 result (0.633) was small-sample noise, and here's why
that's assertable rather than asserted:** the akm-memory score went 0.633
(n=5, `qwen3.5-plus` agent) → 0.431 (n=25, `deepseek-v4-flash` agent) across
four prior rounds and this one. Over the same span the `raw-vector` control
— same benchmark, same context-construction code path, only the retrieved
content differs — held nearly flat: 0.233 (byte-identical across
0.9.1/alpha.4/alpha.5/0.9.2, all at n=5) → 0.213 now. If the agent-model
swap were driving the akm-memory drop, the control should have moved too;
it barely did (Δ0.02, well inside noise). That licenses attributing the
akm-memory drop mainly to sample size, not the model change — this is
inference from one stable control, not a controlled experiment, but it is a
real basis, not a guess.

Worth being precise about the n=5 number itself, since "0.633 was 3-of-5"
overstates it: LoCoMo scores continuous per-question token-F1, not binary
pass/fail, and the 0.9.2-round akm-memory F1s were **0.667, 1.0, 0.5, 1.0,
0.0** — two near-perfect, one partial, one dead zero. The mean of five
numbers with that spread is exactly the kind of estimate n=25 exists to
stop trusting.

**A hypothesis, not a conclusion, for *why* the pack split:** LoCoMo's whole
conversation fits inside a 16,000-token budget (`maxContextTokens: 16000` in
the config) — the baseline arm never has to drop anything, so retrieval is
solving a problem full-context doesn't actually have on this dataset.
LongMemEval's haystacks are far larger (baseline read ~104K tokens/question
on average vs LoCoMo's ~15K), which is closer to where retrieval is supposed
to earn its keep. This is a plausible read of *why* the two packs diverge,
consistent with the token numbers above, but it is **untested** — nothing in
this round varies corpus size directly to confirm it.

**Methodological caveat — read before trusting any cross-round LongMemEval
number:** LongMemEval's raw-vector control moved 0.20 (n=5, four rounds,
0.9.1→0.9.2) → 0.52 (n=25, this round) — a big jump — while LoCoMo's
raw-vector control barely moved (0.233→0.213) over the identical span. The
difference is very plausibly the evaluator, not the akm arm: LoCoMo scores
with a deterministic token-F1 evaluator (no LLM, no judge variance across
rounds beyond the agent's own answer text), while LongMemEval scores via an
LLM judge (`qwen3.5-plus`, pinned, but still a stochastic-ish evaluator over
free-text answers). **LoCoMo's cross-round comparisons are on reasonably
solid ground; LongMemEval's absolute numbers should be read within this
round only**, not stitched into a four-round continuous trend the way
LoCoMo's can be. The table further down keeps this separation explicit
rather than implying comparability that isn't there.

## Phase 0 — akm binary, model smoke test, and an undocumented Node-version wall

Isolated install: minimal `package.json`, `npm install akm-cli@0.9.3
--ignore-scripts --no-audit --no-fund`, in `runs/.akm-cli-0.9.3-scratch/`
(inside this repo, not `/tmp`, and not the user's real stash at
`/home/founder3/akm` — see below for why). `node_modules/.bin/akm --version`
printed exactly `0.9.3`.

**Model smoke test** (both required a live 200 before spending budget):

```
deepseek-v4-flash: HTTP 200
qwen3.5-plus:      HTTP 200
```

Both green. Proceeded.

**A wrinkle Phase 0 surfaced that isn't in the task brief:** `bin/eval` runs
everything inside the `akm-eval-cli:local` Docker image, which bind-mounts
this repo at its own absolute host path — so an isolated akm install must
live *inside the repo* (hence `runs/.akm-cli-0.9.3-scratch/`, which
`runs/*` already gitignores) to be visible to the container at all; a
`/tmp` scratch dir is invisible inside Docker. Separately, the image's
baked-in Node is v22.23.2, and akm-cli 0.9.3 requires Node ≥ 24 to even
bootstrap (`bin/doctor` inside the container: "The akm-cli npm package
requires Node.js >= 24 to bootstrap"). Rather than touch the Dockerfile
(which also pins a *different*, older, globally-installed `akm-cli@0.9.1`
baked into the image for other purposes), a portable official Node v24.9.0
linux-x64 tarball was placed alongside the isolated install and a one-line
wrapper (`runs/.akm-cli-0.9.3-scratch/akm-wrapper.sh`) invokes
`node24/bin/node .../akm-cli/dist/akm "$@"`. `AKM_EVAL_AKM_CMD` points at
that wrapper for every command in this round, on host and in-container
alike. `bin/doctor` then reports `OK memory:akm: akm CLI 0.9.3 reachable`.

**A near-miss worth flagging:** a bare, env-var-less `akm info --format
json` run against the fresh npm install (to sanity-check the binary before
wiring in `AKM_EVAL_AKM_CMD`) resolved `bundleDir` to
`/home/founder3/akm` — the user's real stash — by falling back to default
config when no `AKM_*_DIR` overrides are set. `info` is read-only so nothing
was written, but this is exactly the failure mode the task brief warns
about, and it happened via an ad hoc verification command outside the
harness path. The harness itself (`src/memory/backends/akm.ts`,
`scripts/probes/retrieval-probe.ts`) always pins all five `AKM_*_DIR`
variables under a fresh `mkdtempSync` workdir and never touches the real
stash — confirmed by reading the code, not just trusting it. No commands in
Phase 1 or Phase 2 below used a bare akm invocation without those overrides.

## Phase 1 — retrieval-only probes (free, deterministic, no LLM)

| Pack | Metric | Expected (0.9.3) | Measured | Verdict |
| --- | --- | --- | --- | --- |
| LoCoMo (conv-26, 40q) | zero-hit | 0.0% | **0.0%** | match |
| LoCoMo | recall@5 | 0.590 | **0.590** | match |
| LoCoMo | precisionAtK | 0.233 | **0.232917** | match |
| LongMemEval (20q) | zero-hit | 0.0% | **0.0%** | match |
| LongMemEval | recall@5 | 0.950 | **0.950** | match |
| LongMemEval | precisionAtK | (not previously reported) | **0.676667** | new metric this round |

Full LoCoMo probe output: `queryCount: 40, recallAtK: 0.497917, mrr: 0.369167,
ndcgAtK: 0.384627, guardTripped: 0`. Full LongMemEval probe output:
`queryCount: 20, recallAtK: 0.95, mrr: 0.835, ndcgAtK: 0.863982, guardTripped:
0`. No regression on any metric — proceeded to Phase 2.

## Phase 2 — judged run (n=25, 150 trials)

All 6 arms (3 per pack) ran **concurrently** in separate containers, **0
retries needed on any arm**, all 6 completed with `status: "passed"`. Wall
time per arm ranged 75s (LoCoMo baseline) to 414s (LongMemEval akm-memory);
total wall time for all 6 concurrent arms was well under the "expect several
hours" caution in the brief — `deepseek-v4-flash` appears to be materially
faster than `qwen3.5-plus` was in prior rounds. Every `akm-memory`
`result.json` carries `metadata.backendId: "akm"` and
`metadata.backendVersion: "0.9.3"` — this is the first round with that
provenance captured directly in the artifact.

### LoCoMo — official token-F1 QA score (`judgedPass`), n=25

| Arm | Score | 95% CI (mean ± 1.96·SE over per-question F1) | Retrieval zero-hit |
| --- | --- | --- | --- |
| baseline | 0.649 | [0.531, 0.767] | n/a (full-context arm) |
| raw-vector | 0.213 | [0.080, 0.346] | 0/25 (0.0%) |
| akm-memory | 0.431 | [0.285, 0.578] | 0/25 (0.0%) |

Judged-run retrieval metrics (measured on these same 25 questions, distinct
from the Phase 1 probe's 40-question corpus):

| Arm | precision@k | recall@k | mrr | ndcg@k |
| --- | --- | --- | --- | --- |
| raw-vector | 0.040 | 0.200 | 0.168 | 0.175 |
| akm-memory | 0.277 | 0.537 | 0.406 | 0.437 |

### LongMemEval — official-evaluator pass rate (`judgedPass`), n=25

| Arm | Score (k/n) | 95% Wilson CI | Retrieval zero-hit |
| --- | --- | --- | --- |
| baseline | 0.920 (23/25) | [0.750, 0.978] | n/a (full-context arm) |
| raw-vector | 0.520 (13/25) | [0.335, 0.700] | 0/25 (0.0%) |
| akm-memory | 0.880 (22/25) | [0.700, 0.958] | 0/25 (0.0%) |

Judged-run retrieval metrics:

| Arm | precision@k | recall@k | mrr | ndcg@k |
| --- | --- | --- | --- | --- |
| raw-vector | 0.112 | 0.560 | 0.365 | 0.414 |
| akm-memory | 0.681 | 0.920 | 0.828 | 0.851 |

(`akm-memory`'s higher precision@k partly reflects it returning fewer
results per query than a fixed topK=5 — avg 2.28 results/query vs
raw-vector's fixed 5.00 — per the pack's own documented caveat: precisionAtK
is divided by results actually returned, not by topK, so this is not a
clean apples-to-apples precision comparison across backends.)

### Statistical significance of the two claims that matter (two-sample z on
independent arms, n=25 each; not just eyeballing CI overlap, which is a
well-known unreliable heuristic for testing a difference)

| Comparison | Pack | Δ | z | p (two-sided) | Verdict |
| --- | --- | --- | --- | --- | --- |
| akm-memory vs raw-vector | LongMemEval | +0.36 | 3.02 | ≈0.003 | akm's retrieval lift over naive vector search is decisive |
| akm-memory vs raw-vector | LoCoMo | +0.218 | 2.16 | ≈0.031 | real, but only just clears conventional significance at this n |
| akm-memory vs baseline | LongMemEval | −0.04 | 0.47 | ≈0.64 | no basis to call these different |
| akm-memory vs baseline | LoCoMo | −0.218 | 2.27 | ≈0.023 | akm-memory genuinely underperforms full context here |

Note the LoCoMo raw-vector CI `[0.080, 0.346]` and akm-memory CI `[0.285,
0.578]` visually overlap in the table above — the difference test still
comes out significant (p≈0.03) because a direct two-sample test on the
difference is more sensitive than eyeballing overlap between two individual
intervals. Flagging this explicitly since it's a common source of
misreading exactly this kind of table.

## Comparison to the n=5 stable-0.9.2 round (`runs/RESULTS-0.9.2.md`)

**Read this table as directional history, not a clean comparison** — n
changed (5→25) *and* the agent model changed (`qwen3.5-plus` →
`deepseek-v4-flash`) at the same time. Nothing here isolates n from model
except where noted.

| Pack | Arm | 0.9.1 (n=5) | alpha.4 (n=5) | alpha.5 (n=5) | 0.9.2 (n=5) | **0.9.3 (n=25)** |
| --- | --- | --- | --- | --- | --- | --- |
| LoCoMo | akm-memory | 0.200 | 0.60 | 0.633 | 0.633 | **0.431** |
| LoCoMo | baseline | 0.567 | 0.50 | 0.70 | 0.500 | **0.649** |
| LoCoMo | raw-vector | 0.233 | 0.233 | 0.233 | 0.233 | **0.213** |
| LongMemEval | akm-memory | 0.00 | 1.00 | 1.00 | 1.00 | **0.880** |
| LongMemEval | baseline | 1.00 | 1.00 | 0.80 | 1.00 | **0.920** |
| LongMemEval | raw-vector | 0.20 | 0.00 | 0.20 | 0.20 | **0.520** |

As argued in "Interpretation first" above: LoCoMo's raw-vector control
staying nearly flat (0.233→0.213) across both the model swap and the n
increase is the one piece of same-arm evidence in this round that lets a
confound be partially isolated — it argues the LoCoMo akm-memory drop
(0.633→0.431) is mainly a sample-size correction, not a model-swap effect.
No equivalent stable control exists for `baseline` (full-context arms don't
have a retrieval-quality-only control), so the LoCoMo baseline movement
(0.500→0.649) and both LongMemEval movements remain genuinely confounded
between n and model — stated as fact, not resolved.

## Bottom line

akm-cli 0.9.3 shows no retrieval regression (Phase 1, exact match against
expected). At n=25, akm's retrieval backend clearly and consistently beats
a naive vector-search control on both packs (decisive on LongMemEval,
real-but-modest on LoCoMo). It does not clearly beat a full-context
baseline on either pack — matching it on LongMemEval at a fraction of the
token cost, losing to it on LoCoMo. The n=5 round's apparent "akm beats
everything" story does not survive n=25; that is exactly the outcome this
round was run to check for.
