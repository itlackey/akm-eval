/** Public scalar fields used by the comparison table; raw configs are never copied. */
import type { Score } from "./presentation";

type RecordValue = Record<string, unknown>;
export type Cell = string | number | null;
export interface Column {
  key: string;
  label: string;
  kind: "text" | "number" | "date";
  group: string;
  decimals?: number;
  unit?: string;
  description: string;
}
const obj = (v: unknown): RecordValue => v !== null && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const at = (v: unknown, path: string): unknown => path.split(".").reduce<unknown>((value, key) => obj(value)[key], v);
const n = (v: unknown, path: string): number | null => num(at(v, path));
const string = (v: unknown): string | null => typeof v === "string" && v ? v : null;
const sum = (values: (number | null)[]): number | null => values.length && values.every(v => v !== null)
  ? values.reduce<number>((total, v) => total + v!, 0) : null;
const recordedSum = (values: (number | null)[]): number | null => sum(values.filter(v => v !== null));
const unique = (values: unknown[]): string | null => {
  const strings = [...new Set(values.filter(v => v !== null && v !== undefined).map(String))];
  return strings.length ? strings.sort().join("; ") : null;
};
export function distribution(values: unknown[]) {
  const times = values.map(num).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const quantile = (p: number) => {
    if (!times.length) return null;
    const index = (times.length - 1) * p, low = Math.floor(index), fraction = index - low;
    return times[low]! + fraction * ((times[low + 1] ?? times[low]!) - times[low]!);
  };
  return { n: times.length, mean: times.length ? sum(times)! / times.length : null,
    p50: quantile(.5), p95: quantile(.95), total: sum(times) };
}

export const coreColumns: Column[] = [];
function col(key: string, label: string, kind: Column["kind"], group: string, description: string, decimals = 2, unit = "") {
  coreColumns.push({ key, label, kind, group, description, decimals, unit });
}
col("model", "Model / route", "text", "Run", "Recorded model identifier, including the serving route. Retrieval runs have no answer model.");
col("label", "Run", "text", "Run", "Published run label. Every artifact is a separate row, including repeats and pilots.");
col("suite", "Test", "text", "Run", "Evaluation suite. Compare quality within the same test and collection.");
col("collection", "Collection", "text", "Run", "Test collection, such as books or library.");
col("date", "Collected (UTC)", "date", "Run", "Recorded collection timestamp.");
col("role", "Scope", "text", "Run", "Full suite, pilot or diagnostic compatibility run.");
col("quality_percent", "Quality %", "number", "Quality", "The named primary metric scaled from 0–1 to 0–100. This is not an overall score across tests.", 2, "%");
col("quality_metric", "Quality metric", "text", "Quality", "The exact metric used in Quality %. Agent and answer benchmarks use the AKM arm; search uses keyword nDCG@10.");
col("quality_passed", "Quality passed", "number", "Quality", "Primary metric's recorded numerator. Ranking scores have no passed-case numerator.", 0);
col("quality_cases", "Quality cases", "number", "Quality", "Primary metric's denominator, when recorded.", 0);
col("recorded", "Cases recorded", "number", "Quality", "Rows in the published sample artifact, including errors and observations excluded from scoring.", 0);
col("scored", "Cases scored", "number", "Quality", "Scored case count recorded by the collector.", 0);
col("errors", "Errors", "number", "Quality", "Recorded collection errors. Unknown counts stay blank.", 0);
col("timeouts", "Timeouts", "number", "Quality", "Recorded timeout count, summed across arms or search methods where the summary provides them.", 0);
col("akm_delta_pp", "AKM quality gain (pp)", "number", "Quality", "Recorded paired quality difference: with AKM minus without AKM, in percentage points.");
col("akm_delta_lo_pp", "AKM gain CI low (pp)", "number", "Quality", "Recorded lower confidence bound of the paired quality difference, in percentage points.");
col("akm_delta_hi_pp", "AKM gain CI high (pp)", "number", "Quality", "Recorded upper confidence bound of the paired quality difference, in percentage points.");
col("paired_cases", "Paired cases", "number", "Quality", "Cases scored in both arms for the recorded quality difference.", 0);
col("case_mean_s", "Case mean (s)", "number", "Performance", "Mean elapsed AKM command time over timed cases, including failed cases. This includes command overhead.");
col("case_p50_s", "Case p50 (s)", "number", "Performance", "Median elapsed AKM command time over timed cases.");
col("case_p95_s", "Case p95 (s)", "number", "Performance", "95th percentile of elapsed AKM command time, using linear interpolation.");
col("timed_cases", "Cases timed", "number", "Performance", "Number of cases with an elapsed command time.", 0);
col("case_work_s", "Case time sum (s)", "number", "Performance", "Sum of recorded case command durations. This is work time, not run wall time.");
col("run_wall_s", "Run wall time (s)", "number", "Performance", "Total run elapsed time when explicitly recorded by the collector.");
col("run_wall_basis", "Run wall time basis", "text", "Performance", "Runner elapsed time and older collector timing can cover different phases. Compare the same basis; resumed runs have no known full wall time.");
col("query_wall_s", "Query wall time (s)", "number", "Performance", "Recorded elapsed time for the complete query phase, excluding index construction.");
for (const [key, label] of [["index", "Maintenance index"], ["feedback", "Maintenance feedback"], ["improve", "Maintenance improve"], ["drain", "Maintenance drain"]])
  col(`maintenance_${key}_s`, `${label} (s)`, "number", "Performance", "Recorded elapsed time for this stage of a nightly maintenance run.");
for (const [key, label] of [["keyword", "Keyword query"], ["semantic", "Semantic query"], ["control", "Without AKM"], ["akm", "With AKM"]]) {
  for (const [suffix, text] of [["mean", "mean"], ["p50", "p50"], ["p95", "p95"]])
    col(`${key}_${suffix}_s`, `${label} ${text} (s)`, "number", "Performance", `Recorded ${label!.toLowerCase()} elapsed times. These include request or agent overhead, not token decode timing.`);
  col(`${key}_timed`, `${label} timed`, "number", "Performance", "Number of recorded timings used for this distribution.", 0);
}
col("keyword_index_s", "Keyword index (s)", "number", "Performance", "Recorded keyword index build duration.");
col("semantic_index_s", "Semantic index (s)", "number", "Performance", "Recorded semantic index build duration.");
col("calls", "Model calls", "number", "Usage", "Sum of recorded model calls. Partial usage coverage is shown in Usage cases.", 0);
col("call_failures", "Failed model calls", "number", "Usage", "Recorded failed model calls.", 0);
col("model_mean_input_tokens", "Mean input tokens / call", "number", "Usage", "Recorded mean over successful calls with token usage. This is not a run token total.");
col("model_mean_output_tokens", "Mean output tokens / call", "number", "Usage", "Recorded mean over successful calls with token usage. Missing usage stays blank.");
col("model_mean_request_s", "Mean model request (s)", "number", "Performance", "Recorded mean duration of successful requests, including request overhead, prefill and reasoning.");
col("model_output_tokens_per_s", "Model output tokens / s", "number", "Performance", "Recorded output tokens divided by request duration for calls with usage. Not decode-only speed or time to first token.");
col("input_tokens", "Recorded input tokens", "number", "Usage", "Sum of available input-token records. For paired benchmarks this includes both arms. Failed calls may have no usage record.", 0);
col("output_tokens", "Recorded output tokens", "number", "Usage", "Sum of available output-token records. For paired benchmarks this includes both arms. Failed calls may have no usage record.", 0);
col("cache_tokens", "Cached input tokens", "number", "Usage", "Recorded cached input tokens; not subtracted from the input-token total.", 0);
col("cost_usd", "Recorded cost (USD)", "number", "Usage", "Sum of available monetary cost records, with usage coverage shown separately. No price is inferred for local or free services.", 4);
col("usage_cases", "Usage cases", "number", "Usage", "Cases or trials providing usage records; null when only summary totals exist.", 0);
for (const [key, label] of [["control", "Without AKM"], ["akm", "With AKM"]]) {
  col(`${key}_input_tokens`, `${label} input tokens`, "number", "Usage", "Recorded arm-specific input token total.", 0);
  col(`${key}_output_tokens`, `${label} output tokens`, "number", "Usage", "Recorded arm-specific output token total.", 0);
  col(`${key}_cost_usd`, `${label} cost (USD)`, "number", "Usage", "Recorded arm-specific cost; unknown remains blank.", 4);
  col(`${key}_usage_cases`, `${label} usage cases`, "number", "Usage", "Cases or trials with recorded input-token usage for this arm.", 0);
  col(`${key}_agent_s`, `${label} agent time (s)`, "number", "Usage", "Sum of recorded agent execution durations, excluding environment setup when separately measured.");
}
col("akm_version", "AKM version", "text", "Settings", "AKM CLI version used by this run.");
col("measurement", "Eval version", "text", "Settings", "Collector measurement version, independent of the AKM version.");
col("scoring_version", "Scoring version", "text", "Settings", "Version of the scoring rules. Explicit rescoring preserves the original eval version separately.");
col("strategy", "Strategy", "text", "Settings", "Recorded AKM improve strategy.");
col("mode", "Run mode", "text", "Settings", "Recorded benchmark mode, such as retrieval-only.");
col("search_method", "Search methods", "text", "Settings", "Recorded keyword and/or semantic search modes.");
col("embedding_model", "Embedding model", "text", "Settings", "Recorded embedder or semantic embedding model.");
col("judge_model", "Judge model", "text", "Settings", "Recorded answer-judge model, when present.");
col("temperature", "Temperature", "number", "Settings", "Shared recorded engine temperature; null if engine temperatures differ.");
col("thinking", "Thinking", "text", "Settings", "Recorded thinking setting across model engines.");
col("max_tokens", "Max output tokens", "number", "Settings", "Recorded answer-model output-token limit.", 0);
col("judge_max_tokens", "Judge max tokens", "number", "Settings", "Recorded answer-judge output-token limit.", 0);
col("sample_seed", "Sample seed", "number", "Settings", "Seed used to select benchmark questions, when recorded.", 0);
col("case_limit", "Case limit", "number", "Settings", "Requested case limit; null for an unrestricted run.", 0);
col("top_k", "Retrieval depth", "number", "Settings", "Recorded retrieval depth or top-k setting.", 0);
col("workers", "Workers", "number", "Settings", "Recorded collector worker count.", 0);
col("attempts", "Attempts per task", "number", "Settings", "Recorded attempts per benchmark task.", 0);
col("semantic_index", "Semantic index state", "text", "Settings", "Recorded cold or warm semantic index state.");
col("opencode_version", "OpenCode version", "text", "Settings", "Recorded agent runtime version.");
col("harbor_version", "Harbor version", "text", "Settings", "Recorded Harbor benchmark runtime version.");
col("plugin_version", "AKM plugin version", "text", "Settings", "Recorded AKM plugin pin.");
col("source_commit", "Collector commit", "text", "Provenance", "Collector source commit, including its recorded dirty marker.");
col("akm_build", "AKM build", "text", "Provenance", "Recorded AKM checkout build; an installed release can leave this unrecorded.");
col("akm_build_fingerprint", "AKM build SHA", "text", "Provenance", "Recorded fingerprint distinguishing uncommitted AKM builds.");
col("harness_sha256", "Harness SHA", "text", "Provenance", "Collector code fingerprint. Different digests can mean changed measurement.");
col("assets_sha256", "Inputs SHA", "text", "Provenance", "Test inputs fingerprint.");
col("config_sha256", "Config SHA", "text", "Provenance", "Recorded redacted configuration fingerprint.");
col("notes", "Notes", "text", "Provenance", "Interpretation and compatibility notes.");

export function comparisonFields(summary: RecordValue, samples: unknown[] | null, scores: Score[]): Record<string, Cell> {
  const rows = (samples ?? []).map(obj), m = obj(summary.metrics), fields: Record<string, Cell> = {};
  const primary = scores.find(score => score.label.endsWith("with AKM")) ?? scores[0];
  fields.quality_metric = primary?.label ?? null;
  fields.quality_percent = primary && primary.unit !== "count" && primary.value !== null ? primary.value * 100 : null;
  fields.quality_passed = primary?.numerator ?? null;
  fields.quality_cases = primary?.denominator ?? n(m, "search.n") ?? (summary.eval === "skillret" ? n(summary, "n_queries") : null)
    ?? (summary.eval === "longmemeval" && summary.retrieval_only === true ? n(m, "retrieval.n") : null);
  const timeout = summary.timeouts;
  fields.timeouts = num(timeout) ?? sum(Object.values(obj(timeout)).map(num));
  const delta = n(m, "delta.value") ?? n(m, "accuracy.difference.value");
  const interval = at(m, "accuracy.difference.ci95");
  const lo = n(m, "delta.lo") ?? (Array.isArray(interval) ? num(interval[0]) : null);
  const hi = n(m, "delta.hi") ?? (Array.isArray(interval) ? num(interval[1]) : null);
  fields.akm_delta_pp = delta === null ? null : delta * 100;
  fields.akm_delta_lo_pp = lo === null ? null : lo * 100;
  fields.akm_delta_hi_pp = hi === null ? null : hi * 100;
  fields.paired_cases = n(m, "delta.n") ?? n(m, "accuracy.difference.n");
  const cases = distribution(rows.map(row => row.seconds));
  fields.case_mean_s = cases.mean; fields.case_p50_s = cases.p50; fields.case_p95_s = cases.p95;
  fields.timed_cases = cases.n || null; fields.case_work_s = cases.total;
  fields.run_wall_s = num(summary.wall_seconds) ?? num(summary.seconds) ?? n(summary, "seconds.total");
  fields.run_wall_basis = num(summary.wall_seconds) !== null ? "Runner elapsed" : fields.run_wall_s !== null ? "Legacy collector elapsed" : null;
  fields.query_wall_s = n(summary, "query_seconds");
  for (const key of ["index", "feedback", "improve", "drain"]) fields[`maintenance_${key}_s`] = n(summary, `seconds.${key}`);
  fields.keyword_index_s = n(summary, "index_seconds.keyword");
  fields.semantic_index_s = n(summary, "index_seconds.semantic");
  const trials = rows.flatMap(row => Array.isArray(row.trials) ? row.trials.map(obj) : []);
  for (const [prefix, key] of [["keyword", "search"], ["semantic", "semantic_search"], ["control", "without_akm"], ["akm", "with_akm"]]) {
    const values = (prefix === "control" || prefix === "akm") && trials.length
      ? trials.filter(trial => trial.arm === prefix).map(trial => trial.seconds)
      : rows.map(row => at(row, `${key}.seconds`));
    const d = distribution(values);
    fields[`${prefix}_mean_s`] = d.mean; fields[`${prefix}_p50_s`] = d.p50;
    fields[`${prefix}_p95_s`] = d.p95; fields[`${prefix}_timed`] = d.n || null;
  }
  const usageRows = rows.flatMap(row => Array.isArray(row.usage) ? row.usage.map(obj) : []);
  const callRows = Array.isArray(summary.calls_by) ? summary.calls_by.map(obj) : [];
  fields.usage_cases = usageRows.length ? rows.filter(row => Array.isArray(row.usage) && row.usage.length).length
    : rows.some(row => typeof row.calls === "number") ? rows.filter(row => typeof row.calls === "number").length : null;
  fields.calls = n(summary, "model_calls.calls") ?? n(m, "calls.n") ?? (usageRows.length ? sum(usageRows.map(row => num(row.calls))) : null)
    ?? (callRows.length ? sum(callRows.map(row => num(row.calls))) : null)
    ?? (rows.some(row => typeof row.calls === "number") ? sum(rows.map(row => num(row.calls))) : null);
  fields.call_failures = n(summary, "model_calls.errors") ?? n(m, "calls.failures") ?? (usageRows.length ? sum(usageRows.map(row => num(row.failures))) : null)
    ?? (callRows.length ? sum(callRows.map(row => num(row.failures))) : null);
  fields.input_tokens = usageRows.length ? sum(usageRows.map(row => num(row.promptTokens)))
    : callRows.length ? sum(callRows.map(row => num(row.prompt_tokens))) : null;
  fields.output_tokens = usageRows.length ? sum(usageRows.map(row => num(row.completionTokens)))
    : callRows.length ? sum(callRows.map(row => num(row.completion_tokens))) : null;
  fields.scoring_version = string(at(summary, "manifest.scorer.version")) ?? string(at(summary, "manifest.collector.version"));
  fields.model_mean_input_tokens = n(summary, "model_calls.prompt_tokens");
  fields.model_mean_output_tokens = n(summary, "model_calls.completion_tokens");
  fields.model_mean_request_s = n(summary, "model_calls.seconds");
  fields.model_output_tokens_per_s = n(summary, "model_calls.output_tokens_per_second");
  fields.cache_tokens = null; fields.cost_usd = null;
  for (const [prefix, key] of [["control", "without_akm"], ["akm", "with_akm"]]) {
    const armTrials = trials.filter(trial => trial.arm === prefix);
    const arm = armTrials.length ? armTrials : rows.map(row => obj(row[key!]));
    const input = armTrials.length ? arm.map(row => n(row, "tokens.input")) : arm.map(row => num(row.prompt_tokens));
    const output = armTrials.length ? arm.map(row => n(row, "tokens.output")) : arm.map(row => num(row.completion_tokens));
    fields[`${prefix}_input_tokens`] = recordedSum(input); fields[`${prefix}_output_tokens`] = recordedSum(output);
    fields[`${prefix}_usage_cases`] = input.some(v => v !== null) ? input.filter(v => v !== null).length : null;
    fields[`${prefix}_cost_usd`] = n(m, `${prefix}.cost_usd`) ?? (armTrials.length ? sum(arm.map(row => num(row.costUsd))) : null);
    fields[`${prefix}_agent_s`] = armTrials.length ? sum(arm.map(row => num(row.agentSeconds))) : null;
  }
  if (trials.length || summary.eval === "longmemeval" && summary.retrieval_only !== true) {
    fields.input_tokens = recordedSum([num(fields.control_input_tokens), num(fields.akm_input_tokens)]);
    fields.output_tokens = recordedSum([num(fields.control_output_tokens), num(fields.akm_output_tokens)]);
    fields.cost_usd = recordedSum([num(fields.control_cost_usd), num(fields.akm_cost_usd)]);
    fields.cache_tokens = trials.length ? sum(trials.map(trial => n(trial, "tokens.cache"))) : null;
    fields.usage_cases = trials.length ? trials.filter(trial => n(trial, "tokens.input") !== null ||
      n(trial, "tokens.output") !== null || num(trial.costUsd) !== null).length || null
      : rows.filter(row => n(row, "without_akm.prompt_tokens") !== null || n(row, "with_akm.prompt_tokens") !== null).length || null;
  }
  const engines = Object.values(obj(at(summary, "manifest.engines"))).map(obj);
  const temperatures = [...new Set(engines.map(engine => num(engine.temperature)).filter(v => v !== null))];
  fields.temperature = n(summary, "temperature") ?? n(summary, "engine.temperature") ?? (temperatures.length === 1 ? temperatures[0]! : null);
  fields.thinking = unique(engines.map(engine => typeof engine.enableThinking === "boolean" ? engine.enableThinking ? "On" : "Off" : null));
  fields.strategy = string(summary.strategy) ?? string(at(summary, "manifest.settings.strategy"));
  fields.search_method = typeof summary.search_mode === "string" ? summary.search_mode : unique(Object.values(obj(summary.search_mode)));
  fields.embedding_model = string(summary.semantic_model) ?? string(summary.embedder);
  fields.judge_model = string(summary.judge_model);
  fields.max_tokens = n(summary, "max_tokens.model") ?? num(summary.max_tokens);
  fields.judge_max_tokens = n(summary, "max_tokens.judge");
  fields.sample_seed = n(summary, "sample_seed") ?? n(summary, "sample.seed");
  fields.case_limit = n(summary, "limit") ?? n(summary, "sample.limit");
  fields.top_k = n(summary, "top_k") ?? n(summary, "depth");
  for (const key of ["workers", "attempts"]) fields[key] = num(summary[key]);
  fields.semantic_index = string(summary.semantic_index);
  for (const [key, pin] of [["opencode_version", "opencode"], ["harbor_version", "harbor"], ["plugin_version", "akm_plugin"]])
    fields[key!] = string(at(summary, `pins.${pin}`));
  fields.assets_sha256 = string(summary.assets_sha256);
  fields.akm_build = string(summary.akm_build);
  fields.akm_build_fingerprint = string(summary.akm_build_fingerprint);
  fields.config_sha256 = string(at(summary, "manifest.config.sha256"));
  for (const score of scores) fields[`score:${score.label}`] = score.value === null ? null : score.value * (score.unit === "percent" ? 100 : 1);
  return fields;
}

export function scoreColumns(runs: { scores: Score[] }[]): Column[] {
  const columns = new Map<string, Column>();
  for (const run of runs) for (const score of run.scores) {
    const key = `score:${score.label}`;
    columns.set(key, { key, label: score.label + (score.unit === "percent" ? " %" : ""), kind: "number", group: "Test metrics",
      unit: score.unit === "percent" ? "%" : "", decimals: score.unit === "count" ? 0 : score.unit === "decimal" ? 4 : 2,
      description: score.explanation });
  }
  return [...columns.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function comparisonColumns(runs: { scores: Score[] }[]): Column[] {
  const leading = ["model", "label", "suite", "quality_percent", "quality_metric", "case_p50_s", "scored", "errors"];
  return [
    ...leading.map(key => ({ ...coreColumns.find(column => column.key === key)!, group: "Compare" })),
    ...coreColumns.filter(column => !leading.includes(column.key)),
    ...scoreColumns(runs),
  ];
}
