# Result schema

`akm-eval` normalizes benchmark output into a run folder that is consumable by `akm-eval report` and `akm-eval compare`.

## Required files

- `result.json`: canonical machine-readable normalized result
- `summary.md`: canonical human-readable summary for the run

## Optional files

- `raw-output.json`: pack-specific authoritative raw output captured for debugging, traceability, and re-analysis
- Additional logs referenced from `raw-output.json`, such as harness stdout/stderr files

The old placeholder artifact list in this file was stale. The current normalized contract is centered on `result.json` and `summary.md`.

## Run folder contract

- `akm-eval report --run <dir>` resolves `<dir>/result.json`
- `result.json` must conform to the normalized result contract below
- `summary.md` is generated from the normalized result and should be treated as a derived artifact
- `raw-output.json`, when present, is intentionally pack-specific and not a stable cross-pack schema

## `result.json`

### Required top-level fields

- `schemaVersion`: currently always `1.0`
- `runId`: normalized run identifier
- `pack`: pack ID such as `locomo`, `beam`, `longmemeval`, or `tau-bench`
- `variant`: variant ID such as `baseline` or another configured run variant ID
- `memoryBackend`: effective memory backend ID such as `none`, `akm`, or `raw-vector`
- `status`: one of `passed`, `failed`, or `warning`
- `startedAt`: ISO timestamp for run start
- `finishedAt`: ISO timestamp for run finish
- `durationMs`: elapsed wall-clock duration in milliseconds
- `warnings`: array of pack-authored warning strings
- `notes`: array of pack-authored summary strings
- `metrics`: normalized scoring block
- `telemetry`: normalized runtime/cost block
- `artifacts`: canonical artifact pointers

### `metrics`

`metrics.retrieval` always contains:

- `queryCount`
- `precisionAtK`
- `recallAtK`
- `mrr`
- `ndcgAtK`

`metrics.retrieval.queryCount` means the number of actual retrieval queries exercised by the run. For non-retrieval runs, it should be `0` even when the benchmark processed questions, tasks, or trials through answer-only evaluation. Older committed artifacts may still use workload counts for some non-retrieval packs; prefer newly generated artifacts for consistent cross-pack interpretation.

`metrics.answer` always contains:

- `exactMatch`
- `tokenF1`
- `containsExpected`
- `judgedPass`

`exactMatch`, `tokenF1`, and `containsExpected` are lexical-overlap **diagnostics only**; they never
decide pass/fail and never feed `metrics.aggregate.score`. `judgedPass` carries the pack's
authoritative answer-quality number and is always sourced from the upstream evaluator or harness,
never computed in this repo:

| Pack | `judgedPass` source |
| --- | --- |
| `locomo` | the official LoCoMo evaluator's `overall_accuracy` |
| `longmemeval` | the fraction of official-evaluator entries with `autoeval_label.label === true` |
| `tau-bench` | the official tau-bench harness's average reward |
| `beam` | BEAM's own mean per-question judge score (`llm_judge_score`, or `tau_norm` for `event_ordering`) — upstream defines no pass threshold, so this repo reports the mean score rather than manufacturing a pass rate from it |

`metrics.aggregate` always contains:

- `score`
- `retrievalWeight`
- `answerWeight`

## `telemetry`

`telemetry` always contains:

- `promptTokens`
- `completionTokens`
- `totalTokens`
- `estimatedCostUsd`
- `latencyMs`
- `logs`

## `artifacts`

`artifacts` always contains:

- `resultPath`
- `summaryPath`

`artifacts` may also contain:

- `rawOutputPath`

## `metadata`

`metadata` is optional extension space for pack-specific scalar fields. It is useful for reproduction metadata such as dataset name, harness version, evaluator model, task counts, or dataset paths.

Cross-run reporting currently looks for these optional metadata keys when present:

- `repoCommit`: repository commit used for the run
- `runnerType`: runner/provider family such as `openai-compatible` or `opencode`
- `benchmarkId`: benchmark or dataset identifier such as the LongMemEval dataset filename
- `benchmarkVersion`: benchmark version string when the source benchmark publishes one

If the upstream benchmark or dataset does not publish a clear benchmark version for a committed reference artifact, leave `benchmarkVersion` unset. Do not substitute harness package versions, report schema versions, dataset identifiers, or pinned source commits; the cross-run summary will display `-` for unknown benchmark versions.

The cross-run summary derives the displayed date from top-level `startedAt`; it does not require a separate metadata date field.

New runs auto-populate `repoCommit` when the run starts inside a git checkout and auto-populate `runnerType` from the resolved provider config. Packs are still responsible for adding truthful `benchmarkId` and `benchmarkVersion` values when they can be stated from authoritative runtime inputs. For older committed references that predate this capture, leave missing values unset unless a committed artifact states them directly, and use `notes` or artifact pointers to document the provenance gap.

Consumers should not assume a stable cross-pack key set inside `metadata` beyond these optional summary-friendly keys.

## Stability rules

Stable across packs:

- top-level normalized fields in `result.json`
- metric field names under `metrics`
- telemetry field names under `telemetry`
- artifact pointer field names under `artifacts`

Pack-specific and not guaranteed stable:

- `raw-output.json`
- `metadata`
- `warnings`
- `notes`
- exact rules used by a pack to map authoritative outcomes into `status`

## Pack caveats

- `locomo` stores the official evaluator output, prediction file path, and evaluator command in `raw-output.json`
- `longmemeval` stores evaluator command output, predictions, and per-question judged results in `raw-output.json` — `metrics.answer.judgedPass` comes only from that evaluator's output, never from a local heuristic
- `beam` stores upstream evaluation results and per-conversation summaries in `raw-output.json` — both `metrics.aggregate.score` and `metrics.answer.judgedPass` are the mean of BEAM's own per-question scores; no pass/fail threshold is applied anywhere in this repo

Consumers should compare normalized fields first and use raw artifacts only for debugging or audit trails.
