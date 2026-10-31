# Memory usefulness

Does persistent memory help answer a later request, and does AKM's native memory
inference improve on retaining the original notes? This is a small paired,
synthetic QA eval, not an agent benchmark or a general factual-truth judge.

Every independent case runs three conditions with the same reader/model settings:

| Condition | Reader's available information |
|---|---|
| `none` | Current question and common documentation; no episodic memory |
| `source` | Same, plus retrieved original historical notes |
| `inferred` | Same, plus retrieval from the native post-inference library: rewritten parents **and** generated children |

`source − none` measures persistent-memory utility. `inferred − source` measures
incremental native-inference utility, including parent metadata changes. It does
not isolate child files alone. The controls have the same output schema, tools
(no reader tools), and memory-context allowance, not artificially padded prompts.

## Run

Use the repository's [Docker/native setup](../../README.md). The reader and
native inference use `--model`/`models.json`/`.env`; the reader uses Chat
Completions directly while AKM uses its native engine and prompts. They have
separately recorded effective settings. The 24 public cases use no judge; the LongMemEval cases (`--split`) use one.

```sh
evals/memory-utility/run --model my-model --semantic --limit 3 --label pilot
evals/memory-utility/run --model my-model --semantic --label baseline
```

Without `--semantic`, the run deliberately uses keyword search. With it, every
index must report complete embedding coverage and every search must report
`semantic`; fallback or unavailable evidence is an operational error. Use
`--config-patch FILE` for an existing remote embedding engine or other supported
native settings. The patch cannot add external bundles/registries, enable other
maintenance processes or sync, disable inference autonomy, or contradict the
selected retrieval mode. No live bundle, user config or host index is used.

The runner has no new provider config format. Native inference defaults come
from bakeoff's existing memory-inference strategy (temperature 0, thinking off).
Reader defaults are temperature 0, 1024 output tokens, no HTTP retries; a model's
existing `chat` settings override temperature/output/reasoning settings.
`--timeout-ms` bounds each command/request, not the whole run. Native engine
retries remain AKM behavior and native usage evidence records observed calls.

`--resume DIR` carries on a stopped run in its folder (any case source): it keeps the cases that were scored and asks the rest again,
including the ones that errored. The manifest has to be the one of the stored run (eval and scoring versions, AKM build and config,
reader and judge, every eval setting, and the digest of every case); otherwise it is refused, and so is a folder that a live process is
still writing. It does not go with `--repeat`.

Other settings: `--context-tokens` defaults to 1024, `--search-limit` to 10,
`--seed` to `1`, and cases run sequentially. `--repeat N` creates separate saved
collections, not additional independent samples in one confidence interval.
Six arm permutations rotate across case ordinals; the seed offsets that order.
It is deterministic counterbalancing, not random assignment or model RNG control.

`akm improve` is one sequential model call per note inside one command, so `--timeout-ms` bounds it per command only up to 30 s a note:
the command may take `max(--timeout-ms, 30 s × notes)`. A case with 18 long notes (about 5 s each on the 35B) needs about 90 s.

### Cases and controls

`assets/cases.json` contains 24 independently authored fictional libraries and
one request per library: facts, preferences, prior decisions, paraphrases,
multi-note evidence, temporal updates, historical questions, user/project scope,
irrelevant notes, instruction noise, contradictions, partial knowledge,
unanswerable and source-sufficient/common-only controls. One longer incident
and multi-note distractors allow budget-pressure diagnostics. Do not select a
budget or remove cases after seeing which treatment wins.

These are public development fixtures, **not held-out data** and not a balanced
estimate of real users' task distribution. Add independently authored held-out
cases for release decisions. Renaming public cases does not make them held out.
Until such cases exist this eval is opt-in research, not part of the per-release comparison round (reflect,
distill, extract, judge-gate, bakeoff, consolidate, promotion, nightly, retrieval, SkillRet, agent-ab).

For private/custom cases, use `--cases DIR` with a `cases.json` in the same
format. The runner prints the model destination before collection and custom
results go under ignored `private/memory-utility/results/`. Source text and raw
answers are sensitive: use only authorized providers and review artifacts before
publication. Running does not publish anything. Do not put credentials in cases.

The shared corpus flags apply: `--corpus public` is the default, `--cases DIR`
selects custom, and `--corpus all --cases DIR` runs public then custom into
separate result folders without pooling metrics. This eval has no automatic
rewrite, so `--corpus custom` or `--corpus all` without `--cases DIR` is rejected
before any AKM setup or model call. Custom destinations are announced before
the AKM version probe or sandbox creation, using the repository's shared helper.

Each case has an opaque unique `id`, descriptive `category`, common docs,
historical `notes`, later `question`, and named output `fields`. A field's
`values` is a list of accepted complete strings, or `null` when unanswerable.
`evidence` contains literal anchor groups (alternatives inside each group);
`outdated` and `wrong_scope` optionally identify specific wrong answer values.
Gold values, evidence anchors and safety labels are never sent to inference or
the reader. Field **names** define the response shape, not answer options.

### LongMemEval cases (`--split`)

The 24 cases are small and synthetic. `--split dev|heldout-a|heldout-b` builds cases from [LongMemEval](../../benchmarks/longmemeval/README.md)
instead, to ask the same question at a scale where the history is much larger than any budget:

```sh
evals/memory-utility/run --model my-model --semantic --split dev --limit 40 --judge-model eval-judge-35b
evals/memory-utility/run --model my-model --semantic --split dev --limit 40 --judge-model eval-judge-35b --resume evals/memory-utility/results/<date>-<label>
```

- **A case** is one question with its evidence sessions (`answer_session_ids`, one to six) and `--haystack K` distractor sessions drawn
  from the same history (default 16, so about 18 sessions and 50k estimated tokens), every session whole and in history order, one memory
  per session as the benchmark writes them. The dataset, the draw of questions (`--limit N`, in proportion to type, under
  `--sample-seed`, default 42) and the memory text are the longmemeval benchmark's own. Each question's distractors are drawn under a seed
  derived from the sample seed and its id, so they do not depend on which other questions are drawn.
- **Split.** The 500 questions are split once into 100 dev and 400 held-out by a salted hash of the question id, stratified by type, and
  the 400 are cut the same way (a second salt) into two fixed halves of 200, A and B. The split depends on the id and type only, so it
  is the same on the public data and on its rewrite. Dev is for pilots, debugging and estimating discordance. **Held-out is never a
  default**: `--split heldout-a` or `--split heldout-b` is explicit (there is no bare `heldout`; a run names its half) and runs only on
  the rewrite (`--corpus custom`, made by `./generate-assets --only longmemeval`), never on the public data. The first decision uses half
  A, the next half B, and a half is spent once akm is tuned on its failures. Read [PREREGISTRATION.md](PREREGISTRATION.md), committed
  before any held-out run.
- **Arms and budgets.** The same three arms. Inference runs once per case over its sessions; each arm is indexed and searched once; the
  shown text of the hits is packed at every `--budgets` value (default `4096,8192`, estimated tokens as characters/4;
  4096 is the primary comparison and must be among them; 8192 still fits the 35B's 32k context) and the reader answers once per distinct packed text. The 24 cases keep
  `--context-tokens`. The citation protocol is dropped here: the answer is free-form.
- **Scoring is judged.** The reader's answer, without its reasoning, is graded yes or no by the benchmark's own judge prompts for the
  question's type (`--judge-model` is required, never taken from `.env`). The judge sees the answer and the key, never the arm. An answer
  the judge cannot read as yes or no is a grading error: that arm is errored (`n_errored`) and counts as wrong in the failure-inclusive
  result, and is left out of the complete pairs. An empty answer is a wrong answer, not an error. Published LongMemEval numbers use `gpt-4o-2024-08-06`; any other judge is not comparable to them, and the
  35B judging its own model's answers has not been checked against a stronger judge.
- **Labels never leave the scorer.** The answer, the evidence ids and the `has_answer` turn flags are never sent to inference or the
  reader; the judge alone is sent the answer.
- **Results by budget.** `metrics.by_budget.<budget>` holds each budget's three arms (accuracy, mean packed tokens, mean reader prompt
  tokens), both paired differences with the McNemar p-value and interval, the split by question type, abstention questions apart from the
  rest, and the evidence diagnostic. The top-level `metrics.arms`, `persistent_memory` and `memory_inference` are the primary budget's,
  so compare and the ledger read them as before. Reading rule: inferred wins only if either of two paired comparisons is significant in its
  favour after Holm's adjustment at alpha 0.05, as [PREREGISTRATION.md](PREREGISTRATION.md) states.
- **The two primary comparisons.** (a) inferred minus source at 4096, and (b) inferred at 4096 minus source at 8192 (`metrics.cross_budget_inference`: the
  same cases, the original notes read at the larger budget). Both use the exact McNemar test and Fay and Lumbard's interval, with
  help/harm counts, like every other difference. `metrics.primary_comparisons` holds each one's p-value as it is (`p_value`) and after
  Holm's step-down adjustment for the pair (`p_holm`). They exist only when both 4096 and 8192 are run, and (b) is not a general pairing
  of budgets: no other pair of budgets is compared. The console, compare and the ledger show (b) and the adjusted p-values beside the rest.
- **Where the evidence went** (labels only, never prompted). For each evidence session with a `has_answer` turn, at each budget and for
  the source and inferred arms: `shown` (the whole turn is in the displayed text), `retrieval_missed` (no document of the session was a
  hit), `packing_cut` (a hit was cut or left out by the budget) or `summary_dropped` (every hit of the session was shown in full and the
  turn is not in the text). The last is an upper bound on loss, since a faithful paraphrase has no verbatim turn; for the source arm it
  must be zero.
- **Known bias, stated and not corrected.** The answer turn is the user's in 94% of sessions and usually the first, and the packer keeps
  the prefix of the last document that fits, so a raw session shows its answer at small budgets for a reason real notes may not share.
  The data is not reordered. `sessions_over_projection_limit` counts the sessions longer than akm's 16,384-character keyword cut.
- **Not pooled.** LongMemEval cases are never pooled with the 24 cases, which stay exact-scored.

A run is one source: the options `--haystack`, `--budgets`, `--sample-seed` and `--judge-model` need `--split`, and `--context-tokens`
does not go with it.

**Thinking off, and the judge's line.** `eval-judge-35b` above is a `models.json` line (`"model"` the 35B, `"chat": { "max_tokens": 64 }`),
not a model a server knows; the summary records its `model`. The reader and the judge take `chat.reasoning_effort` and the token cap from
their `models.json` lines (see the [repository README](../../README.md)). Native inference sends the `bakeoff` engine's thinking-off
setting, which some servers ignore (LM Studio does); there, pass a `--config-patch` file holding
`{ "engines": { "bakeoff": { "reasoningEffort": "none" } } }`. Its digest is in the manifest, so `--resume` needs the same file.

## What is collected

1. Write only historical notes into a disposable inference sandbox, index, and
   run native `akm improve --strategy bakeoff-memory-inference`. Other processes
   and sync are disabled. Capture the original and complete post-run Markdown
   snapshot, inference counters, errors, elapsed time and available native usage.
2. Validate that every source was considered and outputs agree with native
   `noChange`/`writtenFacts` counts. A missing child alone is not a no-change.
   Partial processing, failed calls, unusable output and unexplained counts fail
   the inferred condition; source/no-memory conditions still run.
3. Build fresh independent source/inferred answer indexes from those snapshots.
   Do not copy the inference index, feedback history or caches. Search with the
   later question, then `akm show` each returned ref. Pack **actual shown text**,
   including generated children, not a substituted original transcript.
4. Pack ranked documents under a fixed characters/4 **estimated** token budget,
   including reference/delimiter overhead. The last fitting document can be
   truncated; only its displayed prefix can support a citation. Identical text
   is packed once. This is not semantic deduplication or a model tokenizer.
   Common docs/question/instructions are identical outside this memory budget.
5. Ask the same reader for JSON answers plus exact displayed quotations/ref
   citations, with nulls for unknown fields. Save raw replies, prompts, refs,
   search mode/results, context, truncation, usage and all errors. Verify search/
   show did not mutate the corpus. No improve, feedback or learning happens in
   the answer phase.

The native system clock and source file mtimes are not frozen. Explicit historical
dates are part of the fixtures; native generated metadata/dates remain observable
feature behavior. Very long source input can also encounter native inference
limits; that is not secretly replaced with a shortened evaluator prompt.

## Metrics and limitations

- **Exact answer accuracy:** all requested values must match their accepted
  complete values after Unicode/case/whitespace normalization. No substring
  guessing, semantic judge or partial field credit in this headline metric.
  Empty/malformed JSON or invalid answer fields is an evaluated wrong answer,
  not a dropped sample. Correct answer values with malformed citations can still
  count as factually correct: `format_valid`/`protocol_correct` and citation
  outcomes separately expose that serialization failure. This prevents measuring
  citation formatting as if it were memory factual usefulness.
- **Citation companion:** `cited_correct` additionally requires nonempty exact
  quotations from the *saved displayed* documents for every non-null answer.
  It catches missing/fabricated citations, but does **not** establish semantic
  entailment: a real quotation can still be unrelated or negated.
- **Literal diagnostics:** evidence-group coverage and
  `literal_evidence_supported_correct` check finite source-wording anchors.
  Valid inferred paraphrases may miss them. They are not the headline outcome
  and must not be interpreted as proof that paraphrases are ungrounded.
  Repeated citations/parent-child hits cannot count one evidence group twice.
- **Safety/error signals:** specific outdated/wrong-scope values, answers to
  labeled unanswerable fields, invalid/missing citations, malformed/empty answers,
  inference failures and operational errors. These are bounded label checks,
  not an exhaustive truth, security or authorization assessment.
- **Paired deltas:** `source − none` and `inferred − source`, exact accuracy and
  citation companion, with help/harm/ties over complete pairs only. All selected
  cases stay in failure-inclusive accuracy (errors/unrun = zero); evaluated-only
  accuracy and complete-pair deltas appear separately. Never interpret missing
  pairs as meaningful ties or a quality improvement.
- **Uncertainty:** each paired difference carries an **exact McNemar test** (two-sided exact binomial test on the discordant pairs,
  the cases where only one arm was right) and an **exact 95% interval**: Fay and Lumbard's (2021) melded interval for a paired difference,
  which leaves out zero exactly when the McNemar test is significant at 0.05 and counts the uncertainty of both the share of
  discordant pairs and which arm wins them. It is null with fewer than two cases or zero complete pairs. Repeats
  and arms are not extra independent cases; multiple queries sharing one history would require clustering and are outside this
  protocol. The 24 cases and the LongMemEval cases use the same statistics (measurement 0.2 replaced the Hoeffding bound of 0.1; the
  longmemeval benchmark keeps its own Wald interval).
- **Cost:** inference/index/retrieval/reader phases separately, including total
  observed seconds for failed work. Reader provider token totals and reporting
  counts are distinct from characters/4 context estimates. `model_calls` counts every
  call the run made, native inference and the reader's answers, with per-successful-call
  means, not exact totals; `calls_by` splits the calls and token totals into `native
  inference` and `reader`.
  Unknown provider cost stays null; token estimates are not dollar savings.

Every selected case gets a checkpoint row before work begins. Interruptions leave
not-run/error states and unchanged denominators visible. `n_run` means a case
started; `n_scored` means all arms were answered; `n_errored` means at least one
operational arm error; `n_unfinished` means pending arms without an operational
error. A complete collection can still contain errors and low accuracy.

## Measured-improvement/build comparisons

Use one bounded change record/PR. Predeclare the user job, integrity blockers,
primary outcome (usually `inferred − source`), tolerable regressions, resource
budget and independently reserved final cases. First run the deterministic tests
and an isolated native scripted smoke; inspect a representative genuine model
pilot's saved evidence before collecting a larger set. Scripted tests establish
collector/scorer compatibility, not better memory judgment.

```sh
bun test evals/memory-utility/src
AKM_EVAL_REAL_AKM=1 AKM_BIN='bun /absolute/akm/src/cli.ts' \
  bun test evals/memory-utility/src/real.test.ts --timeout=120000

evals/memory-utility/run --akm 'bun /absolute/akm-baseline/src/cli.ts' \
  --model my-model --semantic --config-patch embedding.json --seed 1 --label baseline
evals/memory-utility/run --akm 'bun /absolute/akm-candidate/src/cli.ts' \
  --model my-model --semantic --config-patch embedding.json --seed 1 --label candidate
scripts/compare/run /absolute/baseline-results /absolute/candidate-results
```

The global smoke inventory skips this eval because its older pinned AKM predates
explicit no-change counters. The opt-in test uses the exact requested AKM and
fails on incompatibility; it never silently skips an unsupported opted-in build.

Implementation validation on AKM 0.10.261022 included a three-case genuine local
model pilot (fact, temporal change, unanswerable): nine reader responses and six
semantic searches completed. One response returned correct answer values with
malformed citation structure. That remains a protocol/citation failure, not an
incorrect factual answer. This tiny intermediate pilot validated measurement
paths; it does not establish a memory-quality benefit. Deterministic scorer
repairs replay its preserved raw outputs rather than rerunning the model.

Hold corpus, reader/inference models and settings, embedding backend, budget,
search depth, timeouts, seed and evaluator revision constant when isolating an
AKM build change. Native model decisions can still vary at temperature zero.
Run matched repeats only when variability can affect the decision. Do not
attribute a scorer/corpus change to an AKM improvement, or infer general agent
task success from structured QA. Source-sufficient/no-change results can correctly
show zero incremental benefit plus inference cost.

Results retain case input/label digests, collector/scoring/prompt identities,
AKM version/build/fingerprint, evaluator fingerprint, sanitized config and
effective reader settings, embedding identity and arm order. Comparison remains
the repository's descriptive tool: changed confounders are shown, not gated,
and it declares no statistical winner.

For scorer/label repairs, explicitly rescore saved raw evidence; never overwrite
originals or recollect unchanged outputs just for a scoring fix:

```sh
scripts/rescore/run /absolute/baseline-results /absolute/candidate-results
scripts/compare/run /absolute/baseline-results-rescored /absolute/candidate-results-rescored
```

Give `--cases DIR` when a private/custom corpus moved. Saved displayed common
docs/context, rather than newly edited source text, determine citation validity.
Changing labels can change scores, but changing inputs/prompts/collection needs
a new measurement version and new collection. See
[MEASUREMENT_CHANGELOG.md](../../MEASUREMENT_CHANGELOG.md).
