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
separately recorded effective settings. No judge is used.

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

Other settings: `--context-tokens` defaults to 1024, `--search-limit` to 10,
`--seed` to `1`, and cases run sequentially. `--repeat N` creates separate saved
collections, not additional independent samples in one confidence interval.
Six arm permutations rotate across case ordinals; the seed offsets that order.
It is deterministic counterbalancing, not random assignment or model RNG control.

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
- **Uncertainty:** a deterministic conservative 95% Hoeffding interval for the
  mean independent paired difference in [-1,1]. It is intentionally broad on a
  small pilot, null with fewer than two cases or zero complete pairs. Repeats and
  arms are not extra independent cases; multiple queries sharing one history
  would require clustering and are outside this protocol.
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
