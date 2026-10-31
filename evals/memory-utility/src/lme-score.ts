// The scorer of memory-utility's LongMemEval cases: pure, no akm and no model. A case is read at several memory budgets; at each one every
// arm (none, source, inferred) has a free-form answer that the longmemeval benchmark's judge graded yes or no. The scorer reads the stored
// verdicts, never asks again, and builds the per-budget metrics, the paired McNemar statistics, and the diagnostic that says where the
// evidence went (retrieval missed, packing cut it, or the summary dropped it).

import type { CallUsage, ChatResult } from "../../../benchmarks/longmemeval/src/llm.ts";
import { rate } from "../../../benchmarks/longmemeval/src/metrics.ts";
import { QUESTION_TYPES } from "../../../benchmarks/longmemeval/src/dataset.ts";
import { isYes } from "../../../benchmarks/longmemeval/src/score.ts";
import type { ModelCalls } from "../../../lib/akm/usage.ts";
import type { CallRow } from "../../nightly/src/collect.ts";
import { DEFAULT_BUDGETS, NOTES_BUDGET, PRIMARY_BUDGET, type LmeCase } from "./lme.ts";
import { ARMS, type ArmName, type Packed, sourceFiles } from "./protocol.ts";
import { holm, pairSummary } from "./stats.ts";
import { callsSummary, type Raw } from "./score.ts";

/** One arm of a case read at one budget: the memory shown, the reader's answer and the judge's verdict on it. */
export interface LmeBudgetRaw {
  /** `error` is a reader or judge failure (or the arm's own: no retrieval, no inference); an empty answer is a complete, wrong one. */
  state: "complete" | "error" | "not-run";
  error: string | null;
  context: Packed;
  /** The reader was sent the same prompt as at the budget named here (the same memory text), so its answer and verdict are that budget's. Null when it was asked. */
  reused_from: number | null;
  prompt_sha256: string | null;
  /** The reader's reply. Null when reused or not asked. */
  answer: ChatResult | null;
  failed_usage: CallUsage | null;
  /** The reader's answer without its reasoning: what the judge saw. */
  hypothesis: string | null;
  verdict: string | null;
  judge_model: string | null;
  judge_usage: CallUsage | null;
  judge_cached: boolean;
  seconds: { answer: number; judge: number };
}
export interface LmeArm {
  state: "complete" | "error" | "not-run";
  error: string | null;
  /** akm's search answer for the question, once per arm and shared by every budget. Null for the arm with no memory. */
  search: unknown;
  seconds: { index: number; retrieval: number; answer: number; judge: number };
  /** Keyed by the budget in estimated tokens. */
  budgets: Record<string, LmeBudgetRaw>;
}
export interface LmeRaw {
  kind: "longmemeval";
  order: ArmName[];
  /** The notes native inference wrote that are not among the sessions, and the sessions whose text it changed. The sessions themselves are the case's. */
  children: Record<string, string>;
  rewritten_parents: string[];
  inference: Raw["inference"];
  arms: Record<ArmName, LmeArm>;
}

export const blankBudget = (context: Packed): LmeBudgetRaw => ({ state: "not-run", error: null, context, reused_from: null, prompt_sha256: null, answer: null, failed_usage: null,
  hypothesis: null, verdict: null, judge_model: null, judge_usage: null, judge_cached: false, seconds: { answer: 0, judge: 0 } });

const budgetsOf = (raw: LmeRaw): number[] => Object.keys(raw.arms.none.budgets).map(Number).sort((a, b) => a - b);

// ---- one case ------------------------------------------------------------------------------------------------------------------

/** The verdict of an arm at a budget. An empty answer is wrong whatever the judge said, as in the benchmark. An error or a missing verdict is not scored. */
export function scoreBudget(b: LmeBudgetRaw) {
  const evaluated = b.state === "complete";
  return { evaluated, correct: evaluated && b.hypothesis !== "" && isYes(b.verdict ?? "") };
}

export type Where = "shown" | "retrieval_missed" | "packing_cut" | "summary_dropped";

/** The haystack session of each memory file the case writes. */
const sessionFiles = (c: LmeCase): Map<string, string> => new Map(Object.keys(sourceFiles(c)).map((file, i) => [file, c.session_ids[i]!]));
/** The haystack session a ref belongs to: a session's memory, or a note native inference wrote from it (`<memory>.derived`). Null for any other ref. */
const sessionOfRef = (files: Map<string, string>, ref: string): string | null => files.get(`memories/${/^memories\/(m[0-9a-f]+)(?:\.|$)/.exec(ref)?.[1]}.md`) ?? null;

/**
 * Where each evidence session's answer turn ended up in an arm's memory at one budget, from labels only (never prompted).
 *  - shown: the whole has_answer turn is in the displayed text.
 *  - retrieval_missed: no document of the session was among the search hits.
 *  - packing_cut: a document of the session was a hit, but the budget cut every one of them or left them out.
 *  - summary_dropped: a hit of the session was displayed in full (for the inferred arm that can be its summary alone), yet the turn is not in the text. For the source arm this cannot
 *    happen (a full session holds its turns), so a count there is a display problem. For the inferred arm it is a summary that does not
 *    quote the turn: the text test cannot tell a paraphrase that kept the answer from one that lost it, so this is an upper bound on loss.
 * Null when the arm did not search (no memory, or an error before the search).
 */
export function whereWentEvidence(c: LmeCase, arm: LmeArm, b: LmeBudgetRaw, files = sessionFiles(c)): Record<string, Where> | null {
  const hits = (arm.search as { hits?: { ref?: unknown }[] } | null)?.hits;
  if (!Array.isArray(hits)) return null;
  const refs = hits.map(h => String(h.ref));
  const text = b.context.documents.map(d => d.content);
  const full = (ref: string) => b.context.duplicate_refs.includes(ref) || (b.context.documents.some(d => d.ref === ref) && !b.context.truncated.includes(ref));
  return Object.fromEntries(Object.entries(c.evidence_turns).map(([id, turns]) => {
    if (turns.every(turn => text.some(t => t.includes(turn)))) return [id, "shown" as Where];
    const own = refs.filter(r => sessionOfRef(files, r) === id);
    return [id, (!own.length ? "retrieval_missed" : own.some(full) ? "summary_dropped" : "packing_cut") as Where];
  }));
}

export function makeLmeRow(c: LmeCase, raw: LmeRaw) {
  const arms = Object.fromEntries(ARMS.map(a => [a, Object.fromEntries(Object.entries(raw.arms[a].budgets).map(([k, b]) => [k, scoreBudget(b)]))])) as Record<ArmName, Record<string, ReturnType<typeof scoreBudget>>>;
  const files = sessionFiles(c);
  const evidence = Object.fromEntries((["source", "inferred"] as const).map(a => [a, Object.fromEntries(Object.entries(raw.arms[a].budgets).map(([k, b]) => [k, whereWentEvidence(c, raw.arms[a], b, files)]))])) as Record<"source" | "inferred", Record<string, Record<string, Where> | null>>;
  return { kind: "longmemeval" as const, id: c.id, category: c.category, abstention: c.abstention, question: c.question, expected: c.answer,
    n_sessions: c.notes.length, haystack_size: c.haystack_size, sessions_over_projection_limit: c.sessions_over_projection_limit, evidence_sessions: c.evidence_ids.length,
    raw, arms, evidence };
}
export type LmeRow = ReturnType<typeof makeLmeRow>;
export const isLmeRow = (row: unknown): row is LmeRow => (row as { kind?: string } | null)?.kind === "longmemeval";
export const lmeErrored = (row: LmeRow): boolean => ARMS.some(a => row.raw.arms[a].state === "error");
export const lmeUnfinished = (row: LmeRow): boolean => !lmeErrored(row) && ARMS.some(a => row.raw.arms[a].state === "not-run");

/** The raw output of a stored row, or the names of the fields it lacks. */
export function lmeRawOf(row: Record<string, any>): { raw: LmeRaw } | { missing: string[] } {
  const r = row.raw;
  const missing: string[] = [];
  if (!r || typeof r !== "object") return { missing: ["raw"] };
  for (const k of ["order", "children", "rewritten_parents", "inference", "arms"]) if (r[k] === undefined) missing.push(`raw.${k}`);
  if (!missing.length) for (const a of ARMS) {
    const arm = r.arms?.[a];
    if (!arm || !["complete", "error", "not-run"].includes(arm.state) || !arm.budgets || typeof arm.budgets !== "object" || !arm.seconds) { missing.push(`raw.arms.${a} (invalid)`); continue; }
    for (const [k, b] of Object.entries<any>(arm.budgets)) {
      if (!b || !["complete", "error", "not-run"].includes(b.state) || !b.context || !Array.isArray(b.context.documents) || typeof b.context.estimated_tokens !== "number" || !Array.isArray(b.context.truncated)) missing.push(`raw.arms.${a}.budgets.${k} (invalid)`);
    }
  }
  if (!missing.length && !["output", "no-change", "error", "not-run"].includes(r.inference?.outcome)) missing.push("raw.inference (invalid)");
  return missing.length ? { missing } : { raw: r as LmeRaw };
}

// ---- the run -------------------------------------------------------------------------------------------------------------------

const avg = (n: number[]): number | null => n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
const sum = (n: number[]): number => n.reduce((a, b) => a + b, 0);

/** The reader prompt tokens of an arm at a budget, following a reused answer to the call that made it. */
function promptTokens(arm: LmeArm, key: string): number | null {
  const b = arm.budgets[key]!;
  return (b.reused_from === null ? b.answer : arm.budgets[String(b.reused_from)]?.answer)?.usage.prompt_tokens ?? null;
}

/** The accuracy of the three arms over some rows at one budget, and the paired differences as counts. For the subsets (a type, abstention). */
function subset(rows: LmeRow[], key: string) {
  const ok = (r: LmeRow, a: ArmName) => r.arms[a][key]!.correct;
  const pair = (before: ArmName, after: ArmName) => ({ value: rows.length ? (rows.filter(r => !ok(r, before) && ok(r, after)).length - rows.filter(r => ok(r, before) && !ok(r, after)).length) / rows.length : null,
    helps: rows.filter(r => !ok(r, before) && ok(r, after)).length, harms: rows.filter(r => ok(r, before) && !ok(r, after)).length });
  return { n: rows.length, accuracy: Object.fromEntries(ARMS.map(a => [a, rate(rows.filter(r => ok(r, a)).length, rows.length)])), persistent_memory: pair("none", "source"), memory_inference: pair("source", "inferred") };
}

/** The metrics of the three arms and their pairs at one budget. */
function atBudget(rows: LmeRow[], key: string) {
  const arms = Object.fromEntries(ARMS.map(a => {
    const evaluated = rows.filter(r => r.arms[a][key]!.evaluated);
    const tokens = evaluated.map(r => promptTokens(r.raw.arms[a], key)).filter((v): v is number => v !== null);
    return [a, { failure_inclusive_accuracy: rate(rows.filter(r => r.arms[a][key]!.correct).length, rows.length), evaluated_accuracy: rate(rows.filter(r => r.arms[a][key]!.correct).length, evaluated.length),
      n_evaluated: evaluated.length, n_errors: rows.filter(r => r.raw.arms[a].budgets[key]!.state === "error").length, n_not_run: rows.filter(r => r.raw.arms[a].budgets[key]!.state === "not-run").length,
      mean_context_estimated_tokens: avg(evaluated.map(r => r.raw.arms[a].budgets[key]!.context.estimated_tokens)),
      mean_reported_prompt_tokens: avg(tokens), prompt_token_reporting_coverage: tokens.length }];
  }));
  const pair = (before: ArmName, after: ArmName, evaluatedOnly: boolean) => pairSummary(rows.map(r => ({ before: r.arms[before][key]!.correct, after: r.arms[after][key]!.correct, evaluated: r.arms[before][key]!.evaluated && r.arms[after][key]!.evaluated })), evaluatedOnly);
  const types = [...new Set([...QUESTION_TYPES, ...rows.map(r => r.category)])].filter(t => rows.some(r => r.category === t));
  const evidence = Object.fromEntries((["source", "inferred"] as const).map(a => {
    const counts = { evidence_sessions: 0, shown: 0, retrieval_missed: 0, packing_cut: 0, summary_dropped: 0 };
    for (const r of rows) for (const where of Object.values(r.evidence[a][key] ?? {})) { counts.evidence_sessions++; counts[where]++; }
    return [a, counts];
  }));
  return { arms,
    persistent_memory: { failure_inclusive: pair("none", "source", false), complete_pairs: pair("none", "source", true) },
    memory_inference: { failure_inclusive: pair("source", "inferred", false), complete_pairs: pair("source", "inferred", true) },
    by_type: Object.fromEntries(types.map(t => [t, subset(rows.filter(r => r.category === t), key)])),
    abstention: subset(rows.filter(r => r.abstention), key), answerable: subset(rows.filter(r => !r.abstention), key),
    evidence };
}

/** The one pre-registered comparison across budgets: inferred at the primary budget against the original notes at the larger one, over the same cases. */
function crossBudget(rows: LmeRow[]) {
  const [notes, inferred] = [String(NOTES_BUDGET), String(PRIMARY_BUDGET)];
  const pair = (evaluatedOnly: boolean) => pairSummary(rows.map(r => ({ before: r.arms.source[notes]!.correct, after: r.arms.inferred[inferred]!.correct, evaluated: r.arms.source[notes]!.evaluated && r.arms.inferred[inferred]!.evaluated })), evaluatedOnly);
  return { failure_inclusive: pair(false), complete_pairs: pair(true) };
}

/**
 * The two primary comparisons, with the p-value of each as it is and after Holm's adjustment for the pair: inferred minus source at the
 * primary budget, and inferred at the primary budget minus source at the larger one. Null when either has no p-value (no case).
 */
function primaryComparisons(matched: ReturnType<typeof pairSummary>, cross: ReturnType<typeof pairSummary>) {
  if (matched.p_value === null || cross.p_value === null) return null;
  const [pMatched, pCross] = holm([matched.p_value, cross.p_value]);
  const one = (label: string, pair: ReturnType<typeof pairSummary>, p_holm: number | undefined) => ({ label, value: pair.value, p_value: pair.p_value, p_holm });
  return { method: "Holm step-down over these two comparisons", alpha: 0.05,
    comparisons: { matched_budget: one(`inferred - source at ${PRIMARY_BUDGET}`, matched, pMatched), cross_budget: one(`inferred at ${PRIMARY_BUDGET} - source at ${NOTES_BUDGET}`, cross, pCross) } };
}

/** Every reader and judge call of the run, and native inference's, as the summary's `model_calls`. Reused answers made no call. */
function lmeModelCalls(rows: LmeRow[]) {
  const budgets = rows.flatMap(r => ARMS.flatMap(a => Object.values(r.raw.arms[a].budgets)));
  const reader = budgets.flatMap(b => b.answer ? [b.answer.usage] : b.failed_usage ? [b.failed_usage] : []);
  const judge = budgets.flatMap(b => b.judge_usage ? [b.judge_usage] : []);
  const native = rows.map(r => r.raw.inference.model_calls as ModelCalls | null).filter((m): m is ModelCalls => !!m && typeof m.calls === "number");
  const models = (names: (string | null | undefined)[]) => [...new Set(names.filter(Boolean))].sort().join(", ");
  return callsSummary(native, reader, models(budgets.map(b => b.answer?.model)), judge, models(budgets.map(b => b.judge_model)));
}

export function summarizeLme(rows: LmeRow[]) {
  const budgets = rows.length ? budgetsOf(rows[0]!.raw) : DEFAULT_BUDGETS;
  const primary = budgets.includes(PRIMARY_BUDGET) ? PRIMARY_BUDGET : budgets[0]!;
  const by_budget = Object.fromEntries(budgets.map(b => [String(b), atBudget(rows, String(b))]));
  const main = by_budget[String(primary)]!;
  // Only when both budgets are run: this is the one pre-registered comparison across budgets, not a general pairing of budgets.
  const cross = budgets.includes(PRIMARY_BUDGET) && budgets.includes(NOTES_BUDGET) ? crossBudget(rows) : null;
  const armLevel = Object.fromEntries(ARMS.map(a => {
    const seconds = (k: "index" | "retrieval" | "answer" | "judge") => sum(rows.map(r => r.raw.arms[a].seconds[k]));
    const usage = rows.flatMap(r => Object.values(r.raw.arms[a].budgets).flatMap(b => b.answer ? [b.answer.usage] : b.failed_usage ? [b.failed_usage] : []));
    const totalReported = (key: "prompt_tokens" | "completion_tokens" | "cost_usd") => { const known = usage.map(u => u[key]).filter((n): n is number => typeof n === "number"); return { total_reported: known.length ? sum(known) : null, reporting_count: known.length, attempted_calls: usage.length }; };
    return [a, { total_observed_phase_seconds: { index: seconds("index"), retrieval: seconds("retrieval"), answer: seconds("answer"), judge: seconds("judge") },
      reported_usage: { prompt_tokens: totalReported("prompt_tokens"), completion_tokens: totalReported("completion_tokens"), cost_usd: totalReported("cost_usd") },
      mean_index_seconds: avg(rows.filter(r => r.raw.arms[a].state !== "not-run").map(r => r.raw.arms[a].seconds.index)),
      mean_retrieval_seconds: avg(rows.filter(r => r.raw.arms[a].state === "complete").map(r => r.raw.arms[a].seconds.retrieval)) }];
  }));
  const started = (r: LmeRow) => r.raw.inference.outcome !== "not-run";
  const answered = rows.flatMap(r => ARMS.flatMap(a => Object.values(r.raw.arms[a].budgets)));
  return { n_cases: rows.length, n_selected: rows.length, n_run: rows.filter(r => started(r) || ARMS.some(a => r.raw.arms[a].state !== "not-run")).length,
    n_scored: rows.filter(r => ARMS.every(a => r.raw.arms[a].state === "complete" && Object.values(r.arms[a]).every(s => s.evaluated))).length, n_errored: rows.filter(lmeErrored).length, n_unfinished: rows.filter(lmeUnfinished).length,
    sessions_loaded: sum(rows.map(r => r.n_sessions)), sessions_over_projection_limit: sum(rows.map(r => r.sessions_over_projection_limit)),
    reader_answers_reused: answered.filter(b => b.reused_from !== null).length, judge_undecidable: answered.filter(b => b.error?.startsWith("judge: undecidable")).length,
    ...lmeModelCalls(rows), observed_models: [...new Set(answered.map(b => b.answer?.model).filter(Boolean))].sort(),
    metrics: { budgets, primary_budget: primary, arms: Object.fromEntries(ARMS.map(a => [a, { ...main.arms[a], ...armLevel[a] }])), persistent_memory: main.persistent_memory, memory_inference: main.memory_inference,
      ...(cross ? { cross_budget_inference: cross, primary_comparisons: primaryComparisons(main.memory_inference.failure_inclusive, cross.failure_inclusive) } : {}),
      by_budget, by_type: main.by_type, abstention: main.abstention,
      inference: { output: rows.filter(r => r.raw.inference.outcome === "output").length, no_change: rows.filter(r => r.raw.inference.outcome === "no-change").length, errors: rows.filter(r => r.raw.inference.outcome === "error").length, not_run: rows.filter(r => r.raw.inference.outcome === "not-run").length,
        mean_seconds: avg(rows.filter(started).map(r => r.raw.inference.seconds)), mean_index_seconds: avg(rows.filter(started).map(r => r.raw.inference.index_seconds)) } },
    notes: ["Accuracy is the benchmark's judge (yes/no on the free-form answer) over LongMemEval questions cut to their evidence sessions and seeded distractors, not the full 50-session history. Source and inferred are read from the same search depth packed to each budget; the none arm gets no memory.",
      `Paired differences carry an exact McNemar p-value and an exact 95% interval (Fay-Lumbard, compatible with the McNemar test). The primary comparison is inferred minus source at the primary budget; the other budgets are secondary. With both ${PRIMARY_BUDGET} and ${NOTES_BUDGET} run, the second primary comparison is inferred at ${PRIMARY_BUDGET} minus source at ${NOTES_BUDGET} (cross_budget_inference), and metrics.primary_comparisons holds the two p-values as they are and after Holm's adjustment.`,
      "A budget is characters/4, not a tokenizer. A raw session keeps the prefix that fits, and in LongMemEval the answer is usually in the first turn, which favours raw notes at small budgets; do not reorder the data to undo it.",
      "Where the answer went (metrics.by_budget.<budget>.evidence) is labels-only: a whole has_answer turn counted as shown, retrieval missed, packing cut, or summary dropped (an upper bound: a faithful paraphrase has no verbatim turn)."] };
}
