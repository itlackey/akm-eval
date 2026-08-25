# longmemeval

This folder contains the LongMemEval integration for `akm-eval`.

- `adapter.ts`: loads the official dataset, queries the configured runner, and invokes a configured official evaluator command
- `dataset.ts`: resolves the dataset path, including built-in download behavior for the official dataset file, and normalizes each row into haystack sessions (with session id + timestamp) plus ground-truth evidence session ids. Refuses to load a raw dataset item whose `haystack_session_ids` array is present but a different length than `haystack_sessions` — a short array would otherwise silently mix real dataset session ids with synthesized fallback ids within the same question.

Requirements:

- real model-backed agent provider
- `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation script or wrapper; committed configs default to `python scripts/longmemeval-evaluator.py`
- official dataset file, either via `pack.config.datasetPath` or the built-in dataset resolver
- Python `openai` package plus `OPENAI_BASE_URL` for a local compatible evaluator endpoint or `OPENAI_API_KEY` for cloud OpenAI

Runner support:

- `openai-compatible`: preferred
- `opencode`: partial, because large LongMemEval conversation prompts can exceed CLI argv transport limits

The pack fails clearly when the official evaluator is not configured.

## Retrieval

Each LongMemEval question is its own instance with its own haystack (unlike `locomo`, where several
questions share one sample's conversation). For any `memory.backend` other than `none`
(`memory.kind !== 'disabled'`), the adapter, per question:

1. `memory.reset()`s the backend.
2. `memory.add()`s one `MemoryDocument` per haystack session — id = the dataset's session id
   (`haystack_session_ids[i]`, or a synthesized fallback if the source dataset omits it), text = that
   session's turns rendered `role: content`, metadata carries only the session id (deliberately not the
   timestamp — see the doc comment on `sessionToMemoryDocument`: akm turns every metadata entry into an
   indexed, searchable tag while raw-vector ignores metadata entirely, so a `timestamp` tag would be a
   harness-supplied surface only the akm arm could match against).
3. `memory.search()`es with the question text and `pack.config.topK` (default 5), and builds the
   model's prompt from exactly the retrieved text — never the full haystack, with two disclosed
   exceptions: a pre-normalized dataset item with no session boundaries (`metadata.questionsWithSynthesizedHaystack`)
   and an evidence/haystack id-namespace mismatch (`metadata.questionsWithUnmatchableEvidenceLabels`), below.

Retrieval metrics (`precisionAtK`, `recallAtK`, `mrr`, `ndcgAtK`, via `src/memory/retrieval-metrics.ts`)
are scored against the official dataset's `answer_session_ids` as ground truth, averaged across
questions into `result.json.metrics.retrieval`. `zeroHitQueries`/`retrievalQueryCount` are recorded in
`result.json.metadata`, and a warning fires if 50% or more of a run's retrieval queries return zero
hits — check both before publishing a score, the same discipline `locomo` already documents (see
`docs/memory-backends.md`). `metadata.avgResultsReturned` records the mean number of results actually
returned per query: `precisionAtK`'s denominator is that count, not `topK`, so backends that return
different numbers of results for equivalent retrieval quality (e.g. raw-vector always returns
`min(topK, N)` with no relevance threshold; akm returns only genuine hits) are not directly comparable
on `precisionAtK` without this context.

A second, independent disclosure covers the case where the *ground truth itself* is missing. Because
every retrieval metric is keyed on membership in `answer_session_ids`, a question whose dataset row
carries none scores a hard 0 on all four no matter what the backend retrieved — a backend that
returned exactly the right session every time still publishes `0.000` across the board, with
`zeroHitQueries` at 0 suggesting retrieval was healthy. So `result.json.metadata` also records
`questionsWithoutEvidenceLabels` and `retrievalMetricsScoreable`, and a warning fires when 50% or
more of the scored questions have no evidence labels: those zeros are structural, not measured, and
must not be published as retrieval quality.

A third disclosure covers evidence session ids that are present but reference no session id this
question's own haystack actually has — an id-namespace mismatch (e.g. `answer_session_ids` present
without a parallel `haystack_session_ids`, so session ids were synthesized while evidenceSessionIds
kept the real dataset ids). `metadata.questionsWithUnmatchableEvidenceLabels` counts these; like the
no-evidence case they score a hard 0 on every retrieval metric regardless of what was retrieved, and
factor into `retrievalMetricsScoreable` the same way.

A fourth disclosure covers `metadata.questionsWithSynthesizedHaystack`: a pre-normalized dataset item
with no session boundaries collapses to one document covering the entire haystack, so retrieval for
that question can only return everything or nothing — see `LongMemEvalQuestion.haystackSessionsSynthesized`.

`metadata.abstentionQuestionCount` counts LongMemEval's `_abs` (abstention) question ids, graded on
whether the model correctly declines to answer rather than on factual recall — a retrieval arm handed
less context can abstain more easily than a full-context baseline with more surface to hallucinate
from, so part of any accuracy delta between arms on a dataset with abstention questions reflects that
confound, not answer quality alone.

**`memory.backend: none` (the baseline arm) is a deliberate exception, not an oversight**: it keeps
answering every question from the full haystack, flattened into the prompt, with no backend touched
at all. That asymmetry — baseline sees everything, the retrieval arms see only what they retrieved —
is what an A/B config like `config/common/longmemeval-akm-ab.json` is measuring; do not read `baseline`
as a "no memory" null arm in the retrieval-quality sense. `metadata.thisArmContextMode` states each
arm's own condition directly (`'full-haystack'` or `'retrieved-only'`); `metadata.baselineIsLongContext`
is kept for backward compatibility but is misleadingly named on a treatment arm (it reads `false` there,
i.e. "the baseline is not long-context", which is the inverse of the comparison's actual asymmetry).
Comparing two runs with `bin/compare`/`compareResults` also carries both arms' `warnings` into the
`ComparisonReport` (`baselineWarnings`/`candidateWarnings`) and renders them in the comparison
markdown, so this asymmetry and the disclosures above are visible from the comparison artifact alone,
not only from each run's individual `summary.md`.

If a non-disabled backend arm somehow completes with zero retrieval queries executed
(`retrievalQueryCount === 0` — e.g. an empty question set after category filtering), a
`NEVER QUERIED` warning fires as a tripwire. On the normal wired path this should be unreachable; if
it does fire, treat it as a regression that reintroduced an inert backend arm, not as expected output.
