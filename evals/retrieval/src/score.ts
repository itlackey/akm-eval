// The scorer of the retrieval eval: the grades a query's results get, and the rows turned into metrics. It is the SCORER part of the eval's
// measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The collector (collect.ts) builds each
// query's row by calling `makeRow` with the results akm returned, and scripts/rescore calls the same function with the results it reads
// back from a stored row, so a fix to a metric, or a change to the qrels, scores every stored run again.
//
// A fix here applies to stored runs too: scripts/rescore scores them again from their raw outputs.

import { type Retrieval, mean, retrievalMetrics } from "../../../lib/ir.ts";

export const NON_TASK_KINDS = ["chitchat", "notification", "log", "status", "nontask"];

/** The grade from which an asset counts as relevant: 2 is "relevant and clearly useful". */
export const RELEVANT = 2;
/** How many results are scored: the first 10 of each column. The collector asks akm for as many (LIMIT in akm.ts). */
export const DEPTH = 10;

export const isTask = <T extends { kind: string }>(q: T): boolean => !NON_TASK_KINDS.includes(q.kind);

/** The columns of a run: akm's two commands, each asked of the keyword index and, in a run that has it, of the semantic one. */
export const SYSTEMS = ["search", "curate", "semantic_search", "semantic_curate"] as const;
export type System = (typeof SYSTEMS)[number];
/** What a run has for each of its columns: the semantic ones are there only when the run has the semantic index. */
export type Columns<T> = { search: T; curate: T; semantic_search?: T; semantic_curate?: T };
export const at = <T>(columns: Columns<T>, sys: System): T => columns[sys] as T;

/** One query with its labels: the grades of the assets judged for it (a pair graded twice keeps its last grade) and the assets that must never rank above a relevant one. */
export interface Case {
  id: string;
  query: string;
  kind: string;
  grades: Record<string, number>;
  banned: string[];
  aliases?: Record<string, string>;
}

// --- Scoring one query ------------------------------------------------------------------------------------------

export interface Scored {
  ndcg_10: number;
  /**
   * nDCG@10 of the judged results alone: the results nobody graded for this query are taken out of the list and the rest move up,
   * against the same ideal order. Unjudged results count as not relevant in ndcg_10, so a ranker that surfaces assets nobody graded
   * is penalised for it there. This is the other bound: it is never lower than ndcg_10, and the two meet when judged_10 is 1.
   */
  ndcg_10_condensed: number;
  p_5: number;
  success_5: boolean;
  mrr: number;
  recall_10: number;
  /** The share of the results among the first 10 that someone graded for this query. null when there are no results. */
  judged_10: number | null;
  /** A banned asset is among the first 10 and ranks above a relevant one, the last of them: a relevant asset that is not among the first 10 ranks below every result. null when the query bans none. */
  banned_above: boolean | null;
  /** A banned asset is among the first 10 and ranks above the first relevant asset. A relevant asset that is missing does not count here unless every one is. null when the query bans none. */
  banned_above_first: boolean | null;
}

/**
 * One query's results against its grades. Only the first 10 results count. A relevant asset that is not among the first
 * 10 ranks below every result, so any banned asset that is returned ranks above it.
 */
export function scoreQuery(grades: Record<string, number>, refs: string[], banned: string[] = []): Scored {
  const at10: Retrieval = retrievalMetrics(grades, refs, DEPTH, RELEVANT);
  const at5: Retrieval = retrievalMetrics(grades, refs, 5, RELEVANT);
  const top = refs.slice(0, DEPTH);
  const judgedRefs = top.filter((r) => Object.hasOwn(grades, r));
  const condensed: Retrieval = retrievalMetrics(grades, judgedRefs, DEPTH, RELEVANT);
  const rank = (ref: string): number => {
    const i = top.indexOf(ref);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const relevant = Object.keys(grades).filter((r) => grades[r] >= RELEVANT);
  const bannedRank = Math.min(...banned.map(rank));
  const bannedAbove = banned.length === 0 ? null : bannedRank < Math.max(...relevant.map(rank));
  const bannedAboveFirst = banned.length === 0 ? null : relevant.length > 0 && bannedRank < Math.min(...relevant.map(rank));
  return {
    ndcg_10: at10.ndcg,
    ndcg_10_condensed: condensed.ndcg,
    p_5: at5.precision,
    success_5: at5.hit,
    mrr: at10.mrr,
    recall_10: at10.recall,
    judged_10: top.length === 0 ? null : judgedRefs.length / top.length,
    banned_above: bannedAbove,
    banned_above_first: bannedAboveFirst,
  };
}

export interface SystemMetrics {
  n: number;
  ndcg_10: number | null;
  /** The mean of Scored.ndcg_10_condensed: nDCG@10 over the judged results only, next to ndcg_10 to bound the bias of unjudged results. */
  ndcg_10_condensed: number | null;
  p_5: number | null;
  success_5: number | null;
  mrr: number | null;
  recall_10: number | null;
  /** The mean share of judged results, over the queries that returned any. */
  judged_10: number | null;
  /** The share of the queries that ban an asset where one ranks above a relevant asset, the last of them. Lower is better. null when no query bans one. */
  banned_above: number | null;
  /** The same share for a banned asset that ranks above the first relevant asset: it leaves out the queries where only a missing relevant asset puts one above. */
  banned_above_first: number | null;
}

/** The metrics of one column: the means of its queries' scores. */
export function summarize(rows: Scored[]): SystemMetrics {
  const share = (f: (r: Scored) => boolean | null): number | null => mean(rows.flatMap((r) => (f(r) === null ? [] : [f(r) ? 1 : 0])));
  return {
    n: rows.length,
    ndcg_10: mean(rows.map((r) => r.ndcg_10)),
    ndcg_10_condensed: mean(rows.map((r) => r.ndcg_10_condensed)),
    p_5: mean(rows.map((r) => r.p_5)),
    success_5: mean(rows.map((r) => (r.success_5 ? 1 : 0))),
    mrr: mean(rows.map((r) => r.mrr)),
    recall_10: mean(rows.map((r) => r.recall_10)),
    judged_10: mean(rows.flatMap((r) => (r.judged_10 === null ? [] : [r.judged_10]))),
    banned_above: share((r) => r.banned_above),
    banned_above_first: share((r) => r.banned_above_first),
  };
}

export interface Abstention {
  n: number;
  /** How many of the n got no result at all. */
  abstained: number;
  rate: number | null;
}

export function abstention(returned: number[]): Abstention {
  const abstained = returned.filter((n) => n === 0).length;
  return { n: returned.length, abstained, rate: returned.length === 0 ? null : Number((abstained / returned.length).toFixed(4)) };
}

// --- The row of one query ---------------------------------------------------------------------------------------

/**
 * What akm returned for one column of one query: the assets in its order (sections folded into their asset), how long the call took, and
 * the error when it failed. This is the raw output the scorer reads. The row stores it under the same names (`timedOut` is `timed_out`),
 * so a stored row holds everything `makeRow` reads and scripts/rescore can score it again (see `rawOf`).
 */
export interface RawAnswer {
  refs: string[];
  seconds: number;
  error?: string;
  /** The call was killed at its time limit. It is an error as well: akm was slow, not wrong. */
  timedOut?: boolean;
}
export type Raw = Columns<RawAnswer>;

export interface SystemRow {
  /** The assets akm returned, best first. */
  refs: string[];
  /** The grade each one has for this query, or null when nobody judged that pair. */
  grades: (number | null)[];
  seconds: number;
  error?: string;
  timed_out?: true;
  scores?: Scored;
}

export type Row = {
  id: string;
  kind: string;
  query: string;
  /** How many assets have grade 2 or 3 for this query. Zero for a non-task input. */
  n_relevant: number;
} & Columns<SystemRow>;

/** The row of a query: each column's results with the grade of each, and, for a task query with a relevant asset, the scores of a call that did not fail. */
export function makeRow(c: Case, raw: Raw): Row {
  const nRelevant = Object.values(c.grades).filter((g) => g >= RELEVANT).length;
  const row: Record<string, unknown> = { id: c.id, kind: c.kind, query: c.query, n_relevant: nRelevant };
  for (const sys of SYSTEMS) {
    const a = raw[sys];
    if (a === undefined) continue;
    const refs = a.refs.map(r => c.aliases?.[r] ?? r);
    row[sys] = {
      refs: a.refs,
      grades: refs.map((r) => (Object.hasOwn(c.grades, r) ? (c.grades[r] as number) : null)),
      seconds: a.seconds,
      ...(a.error ? { error: a.error } : {}),
      ...(a.timedOut ? { timed_out: true as const } : {}),
      ...(isTask(c) && nRelevant > 0 && !a.error ? { scores: scoreQuery(c.grades, [...new Set(refs)], c.banned) } : {}),
    };
  }
  return row as Row;
}

/**
 * The raw output of a stored row: the fields of its columns that `makeRow` reads, or the names of those the row lacks. A run whose rows
 * lack one cannot be scored again (scripts/rescore refuses it and names them). Every row written so far holds all of them.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  const raw: Record<string, RawAnswer> = {};
  for (const sys of SYSTEMS) {
    const a = row[sys];
    if (a === undefined || a === null) {
      if (sys === "search" || sys === "curate") missing.push(sys);
      continue;
    }
    if (typeof a !== "object") {
      missing.push(sys);
      continue;
    }
    if (!Array.isArray(a.refs) || !a.refs.every((r: unknown) => typeof r === "string")) missing.push(`${sys}.refs`);
    if (typeof a.seconds !== "number") missing.push(`${sys}.seconds`);
    if (a.error !== undefined && typeof a.error !== "string") missing.push(`${sys}.error`);
    raw[sys] = { refs: a.refs, seconds: a.seconds, ...(a.error === undefined ? {} : { error: a.error }), ...(a.timed_out === true ? { timedOut: true } : {}) };
  }
  return missing.length > 0 ? { missing } : { raw: raw as Raw };
}

/** A query with a failed call in any column has no verdict for it: the call is left out of that column's numbers. */
export const errored = (row: Row): boolean => SYSTEMS.some((sys) => row[sys]?.error);

/** Why a run whose semantic calls failed is aborted: the queries of those calls are missing from the semantic columns. */
export const semanticFailure = (calls: number): string => `${calls} semantic calls failed, or answered with keyword search. Their queries are left out of the semantic columns: see the errors in samples.jsonl.`;

/** The columns the rows have: the keyword ones, and the semantic ones when the run had the semantic index. */
export const columnsOf = (rows: Row[]): System[] => SYSTEMS.filter((sys) => sys === "search" || sys === "curate" || rows.some((r) => r[sys] !== undefined));

/** The fields of the summary that come from the rows: the counts, the errors and the aborted status, the metrics of each column and how often akm returned nothing. */
export function summarizeRows(rows: Row[]) {
  const systems = columnsOf(rows);
  const columns = <T>(f: (sys: System) => T): Columns<T> => ({ search: f("search"), curate: f("curate"), ...(systems.includes("semantic_search") ? { semantic_search: f("semantic_search"), semantic_curate: f("semantic_curate") } : {}) });
  const scored = rows.filter((r) => isTask(r) && r.n_relevant > 0);
  const noAnswer = rows.filter((r) => isTask(r) && r.n_relevant === 0);
  const nonTask = rows.filter((r) => !isTask(r));
  const ok = (rs: Row[], s: System) => rs.filter((r) => !at(r, s)?.error);
  const erroredCalls = columns((s) => rows.filter((r) => at(r, s)?.error).length);
  const failedSemantic = (erroredCalls.semantic_search ?? 0) + (erroredCalls.semantic_curate ?? 0);
  return {
    status: failedSemantic > 0 ? ("aborted" as const) : ("complete" as const),
    aborted_reason: failedSemantic > 0 ? semanticFailure(failedSemantic) : null,
    n_queries: rows.length,
    n_scored: scored.length,
    n_errored: rows.filter(errored).length,
    errored: erroredCalls,
    timeouts: rows.reduce((n, r) => n + systems.filter((s) => at(r, s).timed_out).length, 0),
    metrics: columns((s) => summarize(ok(scored, s).map((r) => at(r, s).scores as Scored))),
    abstention: {
      non_task: columns((s) => abstention(ok(nonTask, s).map((r) => at(r, s).refs.length))),
      no_answer: columns((s) => abstention(ok(noAnswer, s).map((r) => at(r, s).refs.length))),
    },
  };
}
