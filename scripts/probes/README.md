# Retrieval probes

Deterministic, LLM-free probes that measure **retrieval only**.

## When to use these instead of a full eval

A judged run answers "did the model produce a good answer" — which confounds
retrieval with model and judge behaviour, costs real money, and is noisy at the
sample sizes this repo can afford (n=5 per pack). When the question is narrower
— *"did akm's retrieval change?"* — none of that is needed.

These replicate each pack adapter's exact ingest and query path
(`flatten -> backend.add -> backend.search`) and stop before the model. A
retrieval regression shows up in minutes, deterministically, for free.

**Run these first when validating a new akm version.** If retrieval regressed,
stop there — no point spending LLM budget on a judged run.

## Usage

Prefer `bin/probe`, which runs both packs against an isolated install of a
pinned version, captures the artifacts, and grades them against the reference
values below so nobody has to remember them:

```sh
bin/probe 0.9.10
bin/probe --identity-permutation 0.9.10
```

The underlying scripts, if you need one pack or a binary `bin/probe` cannot
install:

```sh
AKM_EVAL_AKM_CMD='["/path/to/akm"]' bun scripts/probes/retrieval-probe.ts locomo
AKM_EVAL_AKM_CMD='["/path/to/akm"]' MAX_Q=20 bun scripts/probes/retrieval-probe.ts longmemeval
```

Pin `AKM_EVAL_AKM_CMD` explicitly when comparing versions — install the target
into a scratch dir rather than relying on whatever is on PATH. Each run uses a
fresh hermetic bundle under the OS temp dir and never touches a real stash.

### Identity-permutation release gate

`--identity-permutation` reindexes each pack after replacing every opaque
document identity with a deterministic reversed permutation. It preserves text
and caller metadata, maps returned identities back before scoring, and fails if
ranks or per-query retrieval metrics change. This catches generated
filename/slug order becoming an accidental tie-breaker. It roughly doubles
probe runtime, so it is an explicit release gate rather than an always-on smoke
check.

## Reading the output

`zeroHitRate` **alone is not evidence of good retrieval**: a retriever that
returns five arbitrary documents for every query also scores 0% zero-hit.
`evidenceRecallAt5` is what separates retrieval from noise — at topK=5 over a
419-document haystack, chance recall is ~1%.

`guardTripped` counts queries the backend refused outright (e.g. its
contamination guard). Those are a finding to investigate, **not** zero-hits;
they are excluded from the rates rather than silently counted as misses.

`scoreSaturatedTopKRate` is disclosure only: the fraction of full returned
top-5 sets with equal finite public scores. It cannot tell whether the backend
uses a safe hidden secondary key or an alphabetical filename fallback; use the
identity-permutation gate for that correctness question.

## Reference values

These probes are what established that akm#819 lifted the body-prose retrieval
ceiling. Same corpora, same code path, only the CLI version differing:

| pack | metric | 0.9.1 | 0.9.2 / 0.9.3 |
| --- | --- | --- | --- |
| LoCoMo (`conv-26`, 40q) | zero-hit | 75.0% | **0.0%** |
| | evidence recall@5 | 0.154 | **0.590** |
| LongMemEval (20q) | zero-hit | 100% | **0.0%** |
| | evidence recall@5 | 0.000 | **0.950** |

Reproduced against akm-cli 0.9.3 when this script was committed. Full run
records live in `runs/RESULTS-*.md`.

## Maintenance

The LoCoMo half mirrors `flattenConversation` / `formatDialogTurn` from
`src/packs/locomo/adapter.ts` — if that changes, change this. The LongMemEval
half imports the adapter's own `sessionToMemoryDocument` and `loadDataset`, so
it tracks automatically.
