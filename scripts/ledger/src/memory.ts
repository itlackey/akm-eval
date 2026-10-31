/** Presentation only: copy recorded memory-utility metrics; never re-score or infer missing usage. */
import type { Cell, Column } from "./comparison";

type Field = { column: Column; path: string; scale: number };
const fields: Field[] = [];
function add(key: string, label: string, path: string, group: string, description: string, unit = "", decimals = 0) {
  fields.push({ column: { key: `memory_${key}`, label, kind: "number", group: `Memory · ${group}`, description, unit, decimals }, path, scale: unit === "%" || unit === "pp" ? 100 : 1 });
}
const accuracy = "Exact answer accuracy over every selected case. Operational errors and unfinished cases count as zero; this is not semantic entailment.";
for (const [arm, name] of [["none", "No memory"], ["source", "Original notes"], ["inferred", "Inferred memory"]]) {
  const path = `metrics.arms.${arm}`;
  add(`${arm}_accuracy`, `${name} (%)`, `${path}.failure_inclusive_accuracy.rate`, "quality", accuracy, "%", 2);
  add(`${arm}_evaluated_accuracy`, `${name} · evaluated accuracy (%)`, `${path}.evaluated_accuracy.rate`, "quality", "Accuracy among answered cases only. Compare its evaluated denominator and operational failures before interpreting it.", "%", 2);
  for (const [key, label] of [["protocol_correct", "format-correct accuracy"], ["cited_correct", "cited accuracy"], ["literal_evidence_supported_correct", "literal-supported accuracy"]])
    add(`${arm}_${key}`, `${name} · ${label} (%)`, `${path}.${key}.rate`, "diagnostics", "Selected-case denominator. Format/citation/literal checks are separate from factual correctness; exact quotes do not prove entailment and literal anchors can miss valid paraphrases.", "%", 2);
  for (const [key, label] of [["n_evaluated", "answered"], ["n_errors", "operational errors"], ["n_not_run", "not run"], ["malformed_answers", "malformed format"], ["invalid_answer_values", "invalid answer values"], ["empty_answers", "empty answers"], ["invalid_citation", "invalid citations"], ["missing_citation", "missing citations"], ["outdated_answer", "outdated answers"], ["wrong_scope_answer", "wrong-scope answers"], ["unsupported_unanswerable", "unsupported answers"]])
    add(`${arm}_${key}`, `${name} · ${label}`, `${path}.${key}`, "diagnostics", "Recorded case count, not a rate. Safety flags check finite labeled answers, not all possible mistakes.");
  for (const phase of ["index", "retrieval", "answer"])
    add(`${arm}_${phase}_s`, `${name} · ${phase} time (s)`, `${path}.total_observed_phase_seconds.${phase}`, "performance", "Total observed phase time, including failed work. Not per-token speed or run wall time; compare equal case counts.", "s", 2);
  for (const [key, label, unit, decimals] of [["prompt_tokens", "input tokens", "", 0], ["completion_tokens", "output tokens", "", 0], ["cost_usd", "cost (USD)", "USD", 4]] as const) {
    const usage = `${path}.reported_usage.${key}`;
    add(`${arm}_${key}`, `${name} · ${label}`, `${usage}.total_reported`, "performance", "Reader-only provider-reported total. May cover only some calls; see reporting counts. Excludes native inference and embeddings. Unknown is not zero.", unit, decimals);
    add(`${arm}_${key}_reported`, `${name} · ${label} reporting calls`, `${usage}.reporting_count`, "performance", "Number of reader calls with this provider-reported measurement; compare attempted calls before treating totals as complete.");
    add(`${arm}_${key}_attempted`, `${name} · ${label} attempted calls`, `${usage}.attempted_calls`, "performance", "Attempted reader calls with saved usage envelopes, including failed calls. Not the selected case count.");
  }
  add(`${arm}_context_estimate`, `${name} · mean context estimate`, `${path}.mean_context_estimated_tokens`, "performance", "Characters/4 estimate over evaluated cases, not a tokenizer or provider token measurement.", "tokens", 2);
}
for (const [key, name] of [["persistent_memory", "Notes − none"], ["memory_inference", "Inferred − notes"]]) {
  for (const [basis, label] of [["failure_inclusive", "all selected"], ["complete_pairs", "complete pairs"]]) {
    const path = `metrics.${key}.${basis}`, prefix = `${key}_${basis}`;
    add(`${prefix}_gain`, `${name} · ${label} (pp)`, `${path}.value`, "quality", "Recorded paired accuracy difference in percentage points. Positive means more correct answers. All-selected results count missing/error arms as zero; complete-pair results exclude them.", "pp", 2);
    for (const [index, bound] of [[0, "low"], [1, "high"]])
      add(`${prefix}_ci_${bound}`, `${name} · ${label} CI ${bound} (pp)`, `${path}.ci95.${index}`, "quality", "Recorded 95% paired interval: exact (Fay-Lumbard, compatible with the exact McNemar test) for memory-utility 0.2 and later, a conservative paired-case Hoeffding bound before. Small samples have wide intervals.", "pp", 2);
    add(`${prefix}_p_value`, `${name} · ${label} p-value`, `${path}.p_value`, "quality", "Recorded two-sided exact McNemar p-value over the discordant pairs of this comparison (memory-utility 0.2 and later). Not a multiplicity-adjusted result; the secondary budgets are not a search for a winner.", "", 4);
    for (const [field, title] of [["n", "denominator"], ["complete_pairs", "complete pairs"], ["incomplete_pairs", "incomplete pairs"], ["helps", "helps"], ["harms", "harms"], ["ties", "ties"]])
      add(`${prefix}_${field}`, `${name} · ${label} ${title}`, `${path}.${field}`, "quality", "Recorded paired coverage. Help/harm/ties count complete pairs only; incomplete pairs must not be interpreted as ties.");
  }
  add(`${key}_cited_gain`, `${name} · cited gain (pp)`, `metrics.cited_correct_deltas.${key}.value`, "diagnostics", "All-selected paired difference in cited-correct answers. Exact quotations are not semantic entailment.", "pp", 2);
}
// LongMemEval cases are read at several memory budgets. The unsuffixed columns above are the primary budget (4096); these give each standard budget, 4096 and 8192.
export const MEMORY_BUDGETS = [4096, 8192];
for (const budget of MEMORY_BUDGETS) {
  const at = `metrics.by_budget.${budget}`;
  for (const [arm, name] of [["none", "No memory"], ["source", "Original notes"], ["inferred", "Inferred memory"]]) {
    add(`b${budget}_${arm}_accuracy`, `${name} @ ${budget} (%)`, `${at}.arms.${arm}.failure_inclusive_accuracy.rate`, "budgets", `Judged accuracy over every selected LongMemEval case, with the memory packed to ${budget} estimated tokens (characters/4). Errors count as wrong.`, "%", 2);
    add(`b${budget}_${arm}_tokens`, `${name} @ ${budget} · mean packed tokens`, `${at}.arms.${arm}.mean_context_estimated_tokens`, "budgets", "Mean estimated tokens of the memory text actually shown to the reader (characters/4), over answered cases.", "tokens", 1);
  }
  for (const [key, name] of [["persistent_memory", "Notes − none"], ["memory_inference", "Inferred − notes"]]) {
    const path = `${at}.${key}.failure_inclusive`;
    add(`b${budget}_${key}_gain`, `${name} @ ${budget} (pp)`, `${path}.value`, "budgets", "Paired accuracy difference in percentage points over all selected cases.", "pp", 2);
    add(`b${budget}_${key}_ci_low`, `${name} @ ${budget} CI low (pp)`, `${path}.ci95.0`, "budgets", "Exact 95% paired interval (Fay-Lumbard, compatible with the exact McNemar test), lower bound.", "pp", 2);
    add(`b${budget}_${key}_ci_high`, `${name} @ ${budget} CI high (pp)`, `${path}.ci95.1`, "budgets", "Exact 95% paired interval (Fay-Lumbard, compatible with the exact McNemar test), upper bound.", "pp", 2);
    add(`b${budget}_${key}_p_value`, `${name} @ ${budget} p-value`, `${path}.p_value`, "budgets", "Two-sided exact McNemar p-value. Only the primary budget is the pre-registered comparison; the others are secondary.", "", 4);
  }
}
for (const key of ["selected", "run", "scored", "errored", "unfinished"])
  add(key, `Memory cases · ${key}`, `n_${key}`, "diagnostics", "Recorded case count. Scored means all three arms answered, not that they were correct.");
for (const key of ["output", "no_change", "errors", "not_run"])
  add(`inference_${key}`, `Inference · ${key.replaceAll("_", " ")}`, `metrics.inference.${key}`, "diagnostics", "Recorded native inference outcome. No-change requires explicit native evidence; missing output is not assumed to be no-change.");
add("inference_mean_s", "Inference · mean time (s)", "metrics.inference.mean_seconds", "performance", "Recorded native inference mean over started cases, including failed work. Separate from reader-only usage.", "s", 2);
add("inference_index_mean_s", "Inference · mean index (s)", "metrics.inference.mean_index_seconds", "performance", "Recorded inference-index mean over started cases, including failed work.", "s", 2);
add("context_budget", "Memory context budget (estimated tokens)", "manifest.eval_settings.context_tokens_estimated", "settings", "Fixed memory budget estimated as characters/4, not a tokenizer count.");
add("search_limit", "Memory search depth", "manifest.eval_settings.search_limit", "settings", "Candidate hits before packing shown documents into the memory context.");
add("haystack", "Memory distractor sessions (K)", "manifest.eval_settings.haystack", "settings", "LongMemEval cases only: distractor sessions drawn with the evidence sessions of each question.");
add("sample_seed", "Memory sample seed", "manifest.eval_settings.sample_seed", "settings", "LongMemEval cases only: the seed of the draw of questions and distractors.");
for (const [key, path, label] of [
  ["input_digest", "manifest.eval_settings.corpus_input_sha256", "Memory input digest"],
  ["labels_digest", "manifest.eval_settings.corpus_labels_sha256", "Memory labels digest"],
  ["reader_digest", "manifest.eval_settings.reader_settings_sha256", "Memory reader settings digest"],
  ["prompt_digest", "manifest.eval_settings.prompt_sha256", "Memory prompt digest"],
  ["embedding_digest", "manifest.eval_settings.embedding_settings_sha256", "Memory embedding settings digest"],
  ["embedding_model", "manifest.eval_settings.embedding_model", "Memory embedding model"],
  ["collector_fingerprint", "collector_fingerprint", "Memory collector fingerprint"],
  ["akm_fingerprint", "manifest.akm.build_fingerprint", "Memory AKM build fingerprint"],
  ["case_source", "manifest.eval_settings.case_source", "Memory case source"],
  ["split", "manifest.eval_settings.split", "Memory split (dev, heldout-a or heldout-b)"],
  ["budgets", "manifest.eval_settings.budgets", "Memory budgets"],
  ["judge_model", "manifest.eval_settings.judge_model", "Memory judge"],
]) fields.push({ column: { key: `memory_${key}`, label: label!, kind: "text", group: "Memory · settings", description: "Recorded comparison identity. Hold corpus, labels, prompts, model and retrieval settings constant to isolate an AKM build change." }, path: path!, scale: 1 });

// Arrays occur only in recorded confidence bounds. Missing/nonfinite numbers stay null.
const at = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, k) => v !== null && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined, value);
export const memoryColumns = (): Column[] => fields.map(f => f.column);
export function memoryFields(summary: Record<string, unknown>): Record<string, Cell> {
  if (summary.eval !== "memory-utility") return {};
  return Object.fromEntries(fields.map(({ column, path, scale }) => {
    const value = at(summary, path);
    return [column.key, column.kind === "text" ? typeof value === "string" ? value : null : typeof value === "number" && Number.isFinite(value) ? value * scale : null];
  }));
}
