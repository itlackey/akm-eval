// The scorer of the longmemeval benchmark: turns what the collector got back for a question (the sessions akm returned, the reader's
// answers and the judge's verdicts) into the question's row, and the rows into metrics. It is the SCORER part of the benchmark's
// measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm, no model and no judge. The collector
// (collect.ts) builds each row by calling `makeRow` with the raw output it got, and scripts/rescore calls the same function with the raw
// output it reads back from a stored row.
//
// The judge is not here. Its prompt and its model are the collector's: a verdict is a model call, so a change that needs another verdict
// cannot be scored again without the judge. This file reads the verdicts that are stored: "yes" in the reply is correct, as the
// benchmark's evaluate_qa.py has it.
//
// A fix here applies to stored runs too: scripts/rescore scores them again from their raw outputs.

import { type Retrieval, type RetrievalSummary, retrievalMetrics, summarizeRetrieval } from "../../../lib/ir.ts";
import type { CallUsage } from "./llm.ts";
import type { Question } from "./dataset.ts";
import { type PairedDifference, type Rate, pairedDifference, rate } from "./metrics.ts";

/** One case: a question of the dataset, with the key and the evidence sessions it is scored against. */
export type Case = Question;

/** The retrieval metrics are scored over the first sessions akm returned. The collector asks akm for this many too (TOP_K in collect.ts), and a test holds the two together. */
export const RETRIEVAL_K = 5;

/** The judge the benchmark's evaluate_qa.py uses for "gpt-4o". Another judge, or another snapshot, gives scores that are not comparable to published ones. */
export const BENCHMARK_JUDGE = "gpt-4o-2024-08-06";

/** The benchmark's rule for an abstention question, from evaluate_qa.py and print_retrieval_metrics.py: "_abs" is somewhere in the question id. The collector has the same rule for the judge prompt (prompts.ts). */
export const isAbstention = (questionId: string): boolean => questionId.includes("_abs");

/** The benchmark's label rule: the judge's reply holds "yes". */
export const isYes = (verdict: string): boolean => verdict.toLowerCase().includes("yes");

/** A verdict that is exactly yes or no. The collector records any other as a grading error, and the arm is not scored. */
export const isDecidable = (verdict: string): boolean => ["yes", "no"].includes(verdict.trim().toLowerCase().replace(/^['".\s]+|['".\s]+$/g, ""));

/** What the collector got back for one arm of a question: the reader's answer, the judge's verdict on it, and what the calls cost. */
export interface RawArm {
  /** The answer the judge was shown, without the reader's reasoning. Empty when the reader gave no answer. Null when the reader failed. */
  hypothesis: string | null;
  /** The judge's reply without its reasoning, cut at 200 characters. Empty when the reply was only reasoning. Null when the judge was not reached, and when it was not asked: the answer was empty. */
  verdict: string | null;
  /** Why the arm has no verdict: the reader or the judge failed, or akm did (the with-akm arm of a question akm could not search). */
  error: string | null;
  seconds: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  finish_reason: string | null;
  /** The model name the reader's endpoint answered with. */
  model: string | null;
  /** The model name the judge's endpoint answered with. */
  judge_model: string | null;
  reader_usage?: CallUsage;
  judge_usage?: CallUsage | null;
  judge_cached?: boolean;
}

/** What the collector got back for one question. */
export interface Raw {
  /** How many sessions the question's haystack has, and how many of them are longer than akm's keyword index keeps. */
  n_sessions: number;
  sessions_over_projection_limit: number;
  /** The sessions akm returned, in its rank order. Null when the search failed. */
  retrieved_session_ids: string[] | null;
  retrieval_error: string | null;
  /** The akm call of this question timed out, which is not the same as akm failing. */
  timed_out: boolean;
  /** Null in a retrieval-only run, which has no model and no judge. */
  without_akm: RawArm | null;
  with_akm: RawArm | null;
}

/** A scored arm: the raw output, and the verdict read from it. */
export interface Arm extends RawArm {
  /** The arm was answered and graded. */
  ok: boolean;
  correct: boolean | null;
  /** The verdict is exactly yes or no. */
  decidable: boolean | null;
}

export interface Row {
  id: string;
  question_type: string;
  abstention: boolean;
  question: string;
  expected: string;
  n_sessions: number;
  sessions_over_projection_limit: number;
  /** Scored for every question akm searched. The means leave out the abstention questions, which have no session to find. */
  retrieval: Retrieval | null;
  /** The sessions akm returned, in its rank order. */
  retrieved_session_ids: string[] | null;
  retrieval_error: string | null;
  timed_out: boolean;
  without_akm: Arm | null;
  with_akm: Arm | null;
}

/**
 * An arm that was answered and graded is scored by its verdict. An empty answer is wrong whatever the judge said of it: a reader that gave
 * nothing has not answered, and has not named a question as unanswerable. An arm that has no verdict and an answer is not scored.
 */
function scoreArm(raw: RawArm | null): Arm | null {
  if (raw === null) return null;
  const empty = raw.error === null && raw.hypothesis === "";
  const ok = empty || (raw.error === null && raw.verdict !== null);
  return {
    ok,
    correct: ok ? !empty && isYes(raw.verdict as string) : null,
    hypothesis: raw.hypothesis,
    verdict: raw.verdict,
    decidable: ok && !empty ? isDecidable(raw.verdict as string) : null,
    error: raw.error,
    seconds: raw.seconds,
    prompt_tokens: raw.prompt_tokens,
    completion_tokens: raw.completion_tokens,
    finish_reason: raw.finish_reason,
    model: raw.model,
    judge_model: raw.judge_model,
    ...(raw.reader_usage ? { reader_usage: raw.reader_usage } : {}),
    ...(raw.judge_usage !== undefined ? { judge_usage: raw.judge_usage } : {}),
    ...(raw.judge_cached !== undefined ? { judge_cached: raw.judge_cached } : {}),
  };
}

/** The scored row for a question and what the collector got back for it. */
export function makeRow(c: Case, raw: Raw): Row {
  return {
    id: c.question_id,
    question_type: c.question_type,
    abstention: isAbstention(c.question_id),
    question: c.question,
    expected: String(c.answer),
    n_sessions: raw.n_sessions,
    sessions_over_projection_limit: raw.sessions_over_projection_limit,
    retrieval: raw.retrieved_session_ids === null ? null : retrievalMetrics(c.answer_session_ids, raw.retrieved_session_ids, RETRIEVAL_K),
    retrieved_session_ids: raw.retrieved_session_ids,
    retrieval_error: raw.retrieval_error,
    timed_out: raw.timed_out,
    without_akm: scoreArm(raw.without_akm),
    with_akm: scoreArm(raw.with_akm),
  };
}

// --- Scoring a stored row again -----------------------------------------------------------------------------------

const RAW_FIELDS = ["n_sessions", "sessions_over_projection_limit", "retrieved_session_ids", "retrieval_error", "timed_out"] as const;
const ARM_FIELDS = ["hypothesis", "verdict", "error", "seconds", "prompt_tokens", "completion_tokens", "finish_reason", "model", "judge_model"] as const;
const USAGE_FIELDS = ["reader_usage", "judge_usage", "judge_cached"] as const;

/**
 * The raw output in a stored row, or the names of the fields it lacks. A row of a run from before the raw output was stored has no
 * `id`, and a retrieval-only run has no arms (`without_akm` and `with_akm` are null in it).
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = RAW_FIELDS.filter((f) => row[f] === undefined);
  const arms: Pick<Raw, "without_akm" | "with_akm"> = { without_akm: null, with_akm: null };
  for (const name of ["without_akm", "with_akm"] as const) {
    const arm = row[name];
    if (arm === undefined) missing.push(name);
    else if (arm !== null) {
      const lacks = ARM_FIELDS.filter((f) => arm[f] === undefined);
      missing.push(...lacks.map((f) => `${name}.${f}`));
      arms[name] = Object.fromEntries([...ARM_FIELDS, ...USAGE_FIELDS.filter(f => arm[f] !== undefined)].map((f) => [f, arm[f]])) as unknown as RawArm;
    }
  }
  if (missing.length > 0) return { missing };
  return { raw: { ...(Object.fromEntries(RAW_FIELDS.map((f) => [f, row[f]])) as unknown as Omit<Raw, "without_akm" | "with_akm">), ...arms } };
}

/** A question with no verdict: akm could not search it (a retrieval-only run), or an arm of it was not answered and graded (a run with a model). */
export const errored = (row: Row): boolean => (row.without_akm === null && row.with_akm === null ? row.retrieval === null : !(row.without_akm?.ok && row.with_akm?.ok));

// --- The metrics ---------------------------------------------------------------------------------------------------

/** The answers of each arm that the judge could not grade as they stood. */
export interface ArmCounts {
  without_akm: number;
  with_akm: number;
}

export interface Metrics {
  accuracy: { without_akm: Rate & { n_errored: number }; with_akm: Rate & { n_errored: number }; difference: PairedDifference } | null;
  by_type: Record<string, { n: number; without_akm: Rate; with_akm: Rate }> | null;
  /** Over the questions with an answer in the history. The abstention questions are counted in retrieval_abstention and left out. */
  retrieval: RetrievalSummary;
  retrieval_abstention: { n: number };
}

type ArmName = "without_akm" | "with_akm";

function armStats(rows: Row[], arm: ArmName) {
  const ran = rows.filter((r) => r[arm] !== null);
  const scored = ran.filter((r) => r[arm]?.ok);
  return { ...rate(scored.filter((r) => r[arm]?.correct).length, scored.length), n_errored: ran.length - scored.length };
}

/**
 * The fields of the summary that come from the rows: how many ran, were scored and errored, the model names that answered, the metrics and
 * the notes. A run with no model (retrieval-only) is the one whose rows have no arms.
 */
export function summarize(rows: Row[]) {
  const retrievalOnly = rows.every((r) => r.without_akm === null && r.with_akm === null);
  const both = rows.filter((r) => r.without_akm?.ok && r.with_akm?.ok);
  const scoredQuestions = retrievalOnly ? rows.filter((r) => r.retrieval).length : both.length;
  const arms = rows.flatMap((r) => [r.without_akm, r.with_akm]).filter((a): a is Arm => a !== null);
  const undecidable = arms.filter((a) => a.verdict !== null && a.hypothesis !== "" && !isDecidable(a.verdict)).length;
  const judged = arms.filter((a) => a.verdict !== null).length; // the arms the judge gave a verdict on: an empty answer was not put to it
  const timeouts = rows.filter((r) => r.timed_out === true).length;
  const answered = arms.filter((a) => a.hypothesis !== null).length;
  const countArm = (keep: (a: Arm) => boolean): ArmCounts => ({ without_akm: rows.filter((r) => r.without_akm && keep(r.without_akm)).length, with_akm: rows.filter((r) => r.with_akm && keep(r.with_akm)).length });
  const cutOff = countArm((a) => a.finish_reason === "length");
  const empty = countArm((a) => a.hypothesis === "");
  const searched = rows.filter((r) => r.retrieval !== null);
  const seen = (arm: ArmName, key: "model" | "judge_model") => [...new Set(rows.map((r) => r[arm]?.[key]).filter((m): m is string => !!m))].sort();
  const observedJudges = [...new Set([...seen("without_akm", "judge_model"), ...seen("with_akm", "judge_model")])];
  const notes: string[] = [];
  if (!retrievalOnly) {
    // The name the endpoint answers with counts, since a name such as "gpt-4o" can mean any snapshot.
    if (observedJudges.length > 0 && !observedJudges.every((j) => j.toLowerCase() === BENCHMARK_JUDGE)) notes.push(`The judge is not ${BENCHMARK_JUDGE}, the judge the benchmark specifies (it answered as ${observedJudges.join(", ")}). These scores are not comparable to published LongMemEval numbers.`);
    if (undecidable > 0.02 * Math.max(judged, 1)) notes.push(`The judge gave an answer other than yes or no for ${undecidable} of ${judged} verdicts. Use a judge that answers directly.`);
  }
  const [cut, none] = [cutOff.without_akm + cutOff.with_akm, empty.without_akm + empty.with_akm];
  if (cut + none > 0) notes.push(`${cut} of ${answered} answers stopped at the token limit (finish_reason length), and ${none} had no text left for the judge, because the reader gave none or wrote only reasoning, which is removed before the judge sees an answer. An empty answer is scored wrong. A model that thinks before it answers can use its tokens on the thinking: use one that answers directly, or turn its thinking off.`);
  if (timeouts > 0) notes.push(`akm timed out on ${timeouts} of ${rows.length} questions (an index or a search took longer than its limit), and they count as errored. A slower akm shows up here.`);
  const types = [...new Set(rows.map((r) => r.question_type))].sort();
  const withType = (t: string, arm: ArmName): Rate => {
    const scored = rows.filter((r) => r.question_type === t && r[arm]?.ok);
    return rate(scored.filter((r) => r[arm]?.correct).length, scored.length);
  };
  const metrics: Metrics = {
    accuracy: retrievalOnly ? null : { without_akm: armStats(rows, "without_akm"), with_akm: armStats(rows, "with_akm"), difference: pairedDifference(both.map((r) => ({ without: !!r.without_akm?.correct, with: !!r.with_akm?.correct }))) },
    by_type: retrievalOnly ? null : Object.fromEntries(types.map((t) => [t, { n: rows.filter((r) => r.question_type === t).length, without_akm: withType(t, "without_akm"), with_akm: withType(t, "with_akm") }])),
    // Upstream leaves the abstention questions out of retrieval: they have no session to find. Their count is all that is kept.
    retrieval: summarizeRetrieval(searched.flatMap((r) => (r.abstention || !r.retrieval ? [] : [r.retrieval])), RETRIEVAL_K),
    retrieval_abstention: { n: searched.filter((r) => r.abstention).length },
  };
  return {
    observed_models: [...new Set([...seen("without_akm", "model"), ...seen("with_akm", "model")])],
    observed_judge_models: observedJudges,
    sessions_loaded: rows.reduce((n, r) => n + (r.n_sessions ?? 0), 0),
    sessions_over_projection_limit: rows.reduce((n, r) => n + (r.sessions_over_projection_limit ?? 0), 0),
    n_run: rows.length,
    n_scored: scoredQuestions,
    n_errored: rows.length - scoredQuestions,
    timeouts,
    answers_cut_off: cutOff,
    answers_empty: empty,
    metrics,
    judge_undecidable: undecidable,
    notes,
  };
}
