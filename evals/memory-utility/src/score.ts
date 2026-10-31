import type { ChatResult, CallUsage } from "../../../benchmarks/longmemeval/src/llm.ts";
import { pairedDifference, rate } from "../../../benchmarks/longmemeval/src/metrics.ts";
import type { ModelCalls } from "../../../lib/akm/usage.ts";
import type { Case } from "./inputs.ts";
import { ARMS, type ArmName, type Packed } from "./protocol.ts";

export interface RawArm {
  common: string;
  state: "complete" | "error" | "not-run";
  error: string | null;
  context: Packed;
  search: unknown;
  prompt: string | null;
  answer: ChatResult | null;
  failed_usage: CallUsage | null;
  seconds: { index: number; retrieval: number; answer: number };
}
export interface Raw {
  order: ArmName[];
  source: Record<string, string>;
  post_inference: Record<string, string> | null;
  inference: { outcome: "output" | "no-change" | "error" | "not-run"; report: unknown; error: string | null; index_seconds: number; seconds: number; model_calls: unknown };
  arms: Record<ArmName, RawArm>;
}
const normal = (s: string): string => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
type Parsed = { answers: Record<string, string | null>; citations: Record<string, { ref: string; quote: string }[]> };
/** Answer-value correctness is separate from citation/schema compliance. Still requires valid JSON and exact answer keys. */
export function parseValues(text: string, fields: string[]): Parsed["answers"] | null {
  try {
    const values = JSON.parse(text)?.answers;
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).sort().join() !== [...fields].sort().join()) return null;
    if (!Object.values(values).every(v => v === null || typeof v === "string" && v.trim().length > 0)) return null;
    return values;
  } catch { return null; }
}
export function parseAnswer(text: string, fields: string[]): Parsed | null {
  try {
    const p = JSON.parse(text);
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== "answers,citations") return null;
    for (const key of ["answers", "citations"]) if (!p[key] || typeof p[key] !== "object" || Array.isArray(p[key]) || Object.keys(p[key]).sort().join() !== [...fields].sort().join()) return null;
    for (const f of fields) {
      if (p.answers[f] !== null && (typeof p.answers[f] !== "string" || !p.answers[f].trim())) return null;
      if (!Array.isArray(p.citations[f]) || !p.citations[f].every((q: any) => q && typeof q.ref === "string" && typeof q.quote === "string" && q.quote.trim().length > 0 && Object.keys(q).sort().join() === "quote,ref")) return null;
      if (p.answers[f] === null && p.citations[f].length) return null;
    }
    return p;
  } catch { return null; }
}
export function scoreArm(c: Case, raw: RawArm) {
  const evaluated = raw.state === "complete" && raw.answer !== null;
  const parsed = evaluated ? parseAnswer(raw.answer!.text, Object.keys(c.fields)) : null;
  const answers = evaluated ? parseValues(raw.answer!.text, Object.keys(c.fields)) : null;
  const fields = Object.fromEntries(Object.entries(c.fields).map(([key, label]) => {
    const value = answers?.[key];
    const quotes = parsed?.citations[key] ?? [];
    const validQuotes = quotes.filter(q => (q.ref === "common" ? raw.common : raw.context.documents.find(d => d.ref === q.ref)?.content)?.includes(q.quote));
    const correct = answers !== null && (label.values === null ? value === null : typeof value === "string" && label.values.some(v => normal(v) === normal(value)));
    // Finite literal evidence groups: not a semantic entailment or general truth judge.
    const matched = label.evidence.map(group => validQuotes.some(q => group.some(anchor => normal(q.quote).includes(normal(anchor)))));
    return [key, {
      correct,
      abstained: answers !== null && value === null,
      invalid_citation: quotes.length !== validQuotes.length,
      missing_citation: typeof value === "string" && validQuotes.length === 0,
      evidence_groups_matched: matched.filter(Boolean).length,
      evidence_groups: label.evidence.length,
      all_evidence_cited: matched.every(Boolean),
      outdated_answer: typeof value === "string" && (label.outdated ?? []).some(v => normal(v) === normal(value)),
      wrong_scope_answer: typeof value === "string" && (label.wrong_scope ?? []).some(v => normal(v) === normal(value)),
      unsupported_unanswerable: answers !== null && label.values === null && value !== null,
    }];
  }));
  const values = Object.values(fields);
  const correct = evaluated && answers !== null && values.every(f => f.correct);
  const context = raw.context.documents.map(d => normal(d.content));
  const evidence = Object.values(c.fields).flatMap(f => f.evidence);
  return { evaluated, answer_values_valid: answers !== null, format_valid: parsed !== null, correct, protocol_correct: correct && parsed !== null, fields,
    cited_correct: correct && parsed !== null && values.every(f => !f.invalid_citation && !f.missing_citation),
    literal_evidence_supported_correct: correct && parsed !== null && values.every(f => f.all_evidence_cited && !f.invalid_citation && !f.missing_citation),
    all_required_evidence_in_context: evidence.length ? evidence.every(g => context.some(t => g.some(a => t.includes(normal(a)))) || g.some(a => normal(raw.common).includes(normal(a)))) : null,
  };
}
export function makeRow(c: Case, raw: Raw) {
  return { id: c.id, category: c.category, raw, arms: Object.fromEntries(ARMS.map(a => [a, scoreArm(c, raw.arms[a])])) as Record<ArmName, ReturnType<typeof scoreArm>> };
}
export type Row = ReturnType<typeof makeRow>;
export const errored = (row: Row): boolean => ARMS.some(a => row.raw.arms[a].state === "error");
export const unfinished = (row: Row): boolean => !errored(row) && ARMS.some(a => row.raw.arms[a].state === "not-run");
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const r = row.raw;
  const missing = !r || typeof r !== "object" ? ["raw"] : ["order", "source", "post_inference", "inference", "arms"].filter(k => r[k] === undefined).map(k => `raw.${k}`);
  if (!missing.length) for (const a of ARMS) for (const k of ["common", "state", "error", "context", "search", "prompt", "answer", "failed_usage", "seconds"]) if (r.arms?.[a]?.[k] === undefined) missing.push(`raw.arms.${a}.${k}`);
  if (!missing.length) for (const a of ARMS) {
    const arm = r.arms[a];
    if (typeof arm.common !== "string") missing.push(`raw.arms.${a}.common (invalid)`);
    if (!["complete", "error", "not-run"].includes(arm.state)) missing.push(`raw.arms.${a}.state (invalid)`);
    if (!arm.context || !Array.isArray(arm.context.documents) || !arm.context.documents.every((d: any) => d && typeof d.ref === "string" && typeof d.content === "string") || typeof arm.context.estimated_tokens !== "number") missing.push(`raw.arms.${a}.context (invalid)`);
    if (!arm.seconds || !["index", "retrieval", "answer"].every(k => typeof arm.seconds[k] === "number" && Number.isFinite(arm.seconds[k]))) missing.push(`raw.arms.${a}.seconds (invalid)`);
    if (arm.state === "complete" && (!arm.answer || typeof arm.answer.text !== "string" || !arm.answer.usage)) missing.push(`raw.arms.${a}.answer (invalid)`);
    for (const [name, usage] of [["answer.usage", arm.answer?.usage], ["failed_usage", arm.failed_usage]] as const) {
      if (usage === null || usage === undefined && arm.answer === null && name === "answer.usage") continue;
      const nullableNumber = (v: unknown) => v === null || typeof v === "number" && Number.isFinite(v) && v >= 0;
      if (!usage || !["prompt_tokens", "completion_tokens", "cached_tokens", "reasoning_tokens", "cost_usd"].every(k => nullableNumber(usage[k])) || typeof usage.seconds !== "number" || !Number.isFinite(usage.seconds) || usage.seconds < 0 || !Number.isInteger(usage.retries) || usage.retries < 0 || typeof usage.failed !== "boolean") missing.push(`raw.arms.${a}.${name} (invalid)`);
    }
  }
  if (!missing.length && (!r.inference || !["output", "no-change", "error", "not-run"].includes(r.inference.outcome))) missing.push("raw.inference (invalid)");
  return missing.length ? { missing } : { raw: r as Raw };
}
const avg = (n: number[]): number | null => n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
const total = (n: number[]): number => n.reduce((a, b) => a + b, 0);
/**
 * The run's native-inference calls in the `model_calls` shape of every other eval (lib/akm/usage.ts), from each case's record. A case's
 * means are over its successful calls, so they are weighted by those; exact when every successful call reported its tokens.
 */
export function runModelCalls(rows: Row[]): ModelCalls | null {
  const cases = rows.map(r => r.raw.inference.model_calls as ModelCalls | null).filter((m): m is ModelCalls => !!m && typeof m.calls === "number");
  if (!cases.length) return null;
  const ok = (m: ModelCalls) => m.calls - m.errors, round = (x: number, digits: number) => Number(x.toFixed(digits));
  const mean = (pick: (m: ModelCalls) => number | null, digits: number) => {
    const known = cases.filter(m => pick(m) !== null && ok(m) > 0), weight = total(known.map(ok));
    return weight ? round(total(known.map(m => pick(m)! * ok(m))) / weight, digits) : null;
  };
  const timed = cases.filter(m => m.completion_tokens !== null && m.output_tokens_per_second && ok(m) > 0);
  const generated = total(timed.map(m => m.completion_tokens! * ok(m))), seconds = total(timed.map(m => m.completion_tokens! * ok(m) / m.output_tokens_per_second!));
  return { calls: total(cases.map(m => m.calls)), errors: total(cases.map(m => m.errors)), prompt_tokens: mean(m => m.prompt_tokens, 1), completion_tokens: mean(m => m.completion_tokens, 1),
    seconds: mean(m => m.seconds, 2) ?? 0, output_tokens_per_second: seconds > 0 ? round(generated / seconds, 1) : null };
}
export function summarize(rows: Row[]) {
  function pair(before: ArmName, after: ArmName, evaluatedOnly: boolean, supported = false) {
    const subset = evaluatedOnly ? rows.filter(r => r.arms[before].evaluated && r.arms[after].evaluated) : rows;
    const complete = subset.filter(r => r.arms[before].evaluated && r.arms[after].evaluated);
    const correct = (r: Row, arm: ArmName) => supported ? r.arms[arm].cited_correct : r.arms[arm].correct;
    const difference = pairedDifference(subset.map(r => ({ without: correct(r, before), with: correct(r, after) })));
    const half = Math.sqrt(2 * Math.log(2 / 0.05) / subset.length);
    const ci95 = subset.length < 2 || !complete.length || difference.value === null ? null : [Math.max(-1, difference.value - half), Math.min(1, difference.value + half)];
    return { ...difference, ci95, interval_method: "paired-case Hoeffding bound, range [-1,1], conservative 95%",
      complete_pairs: complete.length, incomplete_pairs: subset.length - complete.length,
      helps: complete.filter(r => !correct(r, before) && correct(r, after)).length,
      harms: complete.filter(r => correct(r, before) && !correct(r, after)).length,
      ties: complete.filter(r => correct(r, before) === correct(r, after)).length };
  }
  const arms = Object.fromEntries(ARMS.map(a => {
    const evaluated = rows.filter(r => r.arms[a].evaluated);
    const correct = rows.filter(r => r.arms[a].correct).length;
    const flags = (key: "invalid_citation" | "missing_citation" | "outdated_answer" | "wrong_scope_answer" | "unsupported_unanswerable") => evaluated.filter(r => Object.values(r.arms[a].fields).some(f => f[key])).length;
    const reportedTokens = evaluated.map(r => r.raw.arms[a].answer!.usage.prompt_tokens).filter((v): v is number => v !== null);
    const usage = rows.flatMap(r => r.raw.arms[a].answer ? [r.raw.arms[a].answer!.usage] : r.raw.arms[a].failed_usage ? [r.raw.arms[a].failed_usage!] : []);
    const totalReported = (key: "prompt_tokens" | "completion_tokens" | "cost_usd") => { const known = usage.map(u => u[key]).filter((n): n is number => typeof n === "number"); return { total_reported: known.length ? known.reduce((a, b) => a + b, 0) : null, reporting_count: known.length, attempted_calls: usage.length }; };
    return [a, { failure_inclusive_accuracy: rate(correct, rows.length), evaluated_accuracy: rate(correct, evaluated.length),
      n_evaluated: evaluated.length, n_errors: rows.filter(r => r.raw.arms[a].state === "error").length, n_not_run: rows.filter(r => r.raw.arms[a].state === "not-run").length,
      malformed_answers: evaluated.filter(r => !r.arms[a].format_valid).length,
      invalid_answer_values: evaluated.filter(r => !r.arms[a].answer_values_valid).length,
      protocol_correct: rate(evaluated.filter(r => r.arms[a].protocol_correct).length, rows.length),
      empty_answers: evaluated.filter(r => r.raw.arms[a].answer!.text.trim() === "").length,
      literal_evidence_supported_correct: rate(evaluated.filter(r => r.arms[a].literal_evidence_supported_correct).length, rows.length),
      cited_correct: rate(evaluated.filter(r => r.arms[a].cited_correct).length, rows.length),
      invalid_citation: flags("invalid_citation"), missing_citation: flags("missing_citation"), outdated_answer: flags("outdated_answer"), wrong_scope_answer: flags("wrong_scope_answer"), unsupported_unanswerable: flags("unsupported_unanswerable"),
      mean_context_estimated_tokens: avg(evaluated.map(r => r.raw.arms[a].context.estimated_tokens)),
      mean_reported_prompt_tokens: avg(reportedTokens), prompt_token_reporting_coverage: reportedTokens.length,
      reported_usage: { prompt_tokens: totalReported("prompt_tokens"), completion_tokens: totalReported("completion_tokens"), cost_usd: totalReported("cost_usd") },
      total_observed_phase_seconds: Object.fromEntries((["index", "retrieval", "answer"] as const).map(k => [k, rows.reduce((sum, r) => sum + r.raw.arms[a].seconds[k], 0)])),
      mean_index_seconds: avg(rows.filter(r => r.raw.arms[a].state !== "not-run").map(r => r.raw.arms[a].seconds.index)),
      mean_retrieval_seconds: avg(evaluated.map(r => r.raw.arms[a].seconds.retrieval)), mean_answer_seconds: avg(evaluated.map(r => r.raw.arms[a].seconds.answer)),
    }];
  }));
  return { n_cases: rows.length, n_selected: rows.length, n_run: rows.filter(r => r.raw.inference.outcome !== "not-run" || ARMS.some(a => r.raw.arms[a].state !== "not-run")).length, n_scored: rows.filter(r => ARMS.every(a => r.arms[a].evaluated)).length, n_errored: rows.filter(errored).length, n_unfinished: rows.filter(unfinished).length,
    model_calls: runModelCalls(rows), observed_models: [...new Set(rows.flatMap(r => ARMS.map(a => r.raw.arms[a].answer?.model)).filter(Boolean))].sort(),
    metrics: { arms, persistent_memory: { failure_inclusive: pair("none", "source", false), complete_pairs: pair("none", "source", true) },
      memory_inference: { failure_inclusive: pair("source", "inferred", false), complete_pairs: pair("source", "inferred", true) },
      cited_correct_deltas: { persistent_memory: pair("none", "source", false, true), memory_inference: pair("source", "inferred", false, true) },
      inference: { output: rows.filter(r => r.raw.inference.outcome === "output").length, no_change: rows.filter(r => r.raw.inference.outcome === "no-change").length, errors: rows.filter(r => r.raw.inference.outcome === "error").length, not_run: rows.filter(r => r.raw.inference.outcome === "not-run").length, mean_seconds: avg(rows.filter(r => r.raw.inference.outcome !== "not-run").map(r => r.raw.inference.seconds)), mean_index_seconds: avg(rows.filter(r => r.raw.inference.outcome !== "not-run").map(r => r.raw.inference.index_seconds)) } },
    notes: ["Accuracy is exact structured-answer correctness on synthetic cases, not a general semantic quality score.", "Evidence and safety flags are finite literal/label checks, not semantic entailment or authorization guarantees.", "95% conservative Hoeffding intervals use independent cases; small samples are diagnostic. Failure-inclusive errors score zero; incomplete pairs are not help/harm/ties. No interval for fewer than two cases or zero complete pairs.", "Context estimates are characters/4, not measured model tokens. duplicate_refs means exact-content duplicates only. Raw provider usage, failures and all phase timings remain in samples.jsonl. Dollar costs are unknown unless the provider reports them."] };
}
