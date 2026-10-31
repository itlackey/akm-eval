// Synthetic display fixture, never a published measurement. Intentionally includes failures and partial usage.
import { presentRun } from "../data";
import { comparisonColumns } from "../comparison";
const rate = (correct: number) => ({ correct, n: 4, rate: correct / 4 });
const pair = (gain: number, complete = false) => ({ n: complete ? 3 : 4, value: gain, ci95: [-.8, 1], complete_pairs: 3, incomplete_pairs: complete ? 0 : 1, helps: gain > 0 ? 1 : 0, harms: gain < 0 ? 1 : 0, ties: 2 });
function arm(correct: number, reported: number, seconds: number) {
  return { failure_inclusive_accuracy: rate(correct), evaluated_accuracy: { correct, n: 3, rate: correct / 3 },
    n_evaluated: 3, n_errors: 1, n_not_run: 0, malformed_answers: 1, invalid_answer_values: 0, empty_answers: 0,
    protocol_correct: rate(Math.max(0, correct - 1)), cited_correct: rate(Math.max(0, correct - 1)), literal_evidence_supported_correct: rate(0),
    invalid_citation: 0, missing_citation: 1, outdated_answer: 1, wrong_scope_answer: 0, unsupported_unanswerable: 0,
    total_observed_phase_seconds: { index: seconds, retrieval: seconds + 1, answer: seconds + 2 }, mean_context_estimated_tokens: 128,
    reported_usage: { prompt_tokens: { total_reported: reported, reporting_count: 2, attempted_calls: 4 },
      completion_tokens: { total_reported: 42, reporting_count: 2, attempted_calls: 4 },
      cost_usd: { total_reported: null, reporting_count: 0, attempted_calls: 4 } } };
}
/** One LongMemEval budget: the three arms' accuracy and packed tokens, and both paired differences with an exact p-value. */
const budgetResult = (accuracy: [number, number, number], tokens: number, gain: number, p: number) => ({
  arms: Object.fromEntries(["none", "source", "inferred"].map((arm, i) => [arm, { failure_inclusive_accuracy: { n: 4, correct: accuracy[i]!, rate: accuracy[i]! / 4 }, mean_context_estimated_tokens: arm === "none" ? 0 : tokens }])),
  persistent_memory: { failure_inclusive: { value: .25, ci95: [-.5, .75], p_value: 0.5 } }, memory_inference: { failure_inclusive: { value: gain, ci95: [gain - .5, gain + .5], p_value: p } } });
export function memorySummary() {
  return { eval: "memory-utility", corpus: "public", status: "complete", label: "synthetic-ui-fixture-not-a-measurement", model: "fixture/model", akm_version: "fixture-v1", date: "2026-10-31T00:00:00Z", limit: 4,
    n_selected: 4, n_run: 4, n_scored: 3, n_errored: 1, n_unfinished: 0, wall_seconds: 90,
    manifest: { collector: { version: "0.1" }, scorer: { version: "0.1" }, completion: { selected: ["a", "b", "c", "d"], scored: ["a", "b", "c"], errored: ["d"] },
      eval_settings: { context_tokens_estimated: 1024, search_limit: 10, corpus_input_sha256: "input-fixture", corpus_labels_sha256: "labels-fixture", reader_settings_sha256: "reader-fixture", prompt_sha256: "prompt-fixture", embedding_settings_sha256: "embedding-fixture", embedding_model: "fixture-embedder" } },
    metrics: { arms: { none: arm(1, 100, 0), source: arm(2, 200, 3), inferred: arm(3, 300, 4) },
      persistent_memory: { failure_inclusive: pair(.25), complete_pairs: pair(.3333, true) },
      memory_inference: { failure_inclusive: pair(.25), complete_pairs: pair(.3333, true) },
      cited_correct_deltas: { persistent_memory: pair(.25), memory_inference: pair(.25) },
      by_budget: { "8192": budgetResult([1, 2, 1], 250, -.25, 0.5), "4096": budgetResult([1, 2, 3], 900, .25, 0.25) },
      inference: { output: 2, no_change: 1, errors: 1, not_run: 0, mean_seconds: 7, mean_index_seconds: 2 } } };
}
export function memoryDataset() {
  const a = memorySummary(), b = memorySummary();
  b.label = "synthetic-zero-cost"; b.akm_version = "fixture-v2"; b.date = "2026-10-30T00:00:00Z";
  b.metrics.arms.inferred = arm(1, 300, 4);
  Object.assign(b.metrics.arms.inferred.reported_usage.cost_usd, { total_reported: 0, reporting_count: 4 });
  b.metrics.memory_inference = { failure_inclusive: pair(-.25), complete_pairs: pair(-.3333, true) };
  b.metrics.cited_correct_deltas.memory_inference = pair(-.25);
  delete (b.metrics.by_budget as Record<string, unknown>)["8192"]; // this run records only the primary budget
  const runs = [a, b].map((summary, index) => presentRun({ summary, samples: ["a", "b", "c", "d"].map(id => ({ id })), path: `fixture-memory-${index}`, sourceRevision: "fixture" })!);
  return { source_revision: "fixture", runs, columns: comparisonColumns(runs) };
}
if (import.meta.main) console.log(JSON.stringify(memoryDataset()));
