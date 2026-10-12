// The scorer of the benchmark: the metrics NDCG, Recall, Completeness and MAP at k = 5, 10 and 15, as SkillRet's own code (trec_eval over
// pytrec_eval, in skillret/eval.py) computes them, and what is counted of the rows. It is the SCORER part of the benchmark's measurement
// (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The collector (collect.ts) builds each query's row with
// `makeRow` from the ranked results akm gave, and scripts/rescore calls the same function with the ranked results it reads back from a stored
// row, so a fix here scores every stored run again.
//
// Relevance is binary. Completeness@k is the share of queries whose relevant skills are all among the first k. A query with no results scores 0,
// and every query counts. A query's scores are not rounded, only the means are, as in the benchmark: lib/ir.ts rounds each query to four
// places, which moves a mean by a unit in its last place on a small set. score.test.ts checks all four metrics against pytrec_eval on hand-made
// rankings.
//
// A change to this file changes what the benchmark scores. It is a measurement change: bump the scorer in MEASUREMENT.lock
// (scripts/measurement/run bump skillret scorer --reason "...") and update the golden files (golden/) in the same change.

import { mean } from "../../../lib/ir.ts";
import type { Query } from "./dataset.ts";

export const KS = [5, 10, 15] as const;
export const METRICS = ["NDCG", "Recall", "Completeness", "MAP"] as const;

/** Metric name to value, in the benchmark's own names: `NDCG@5`, `NDCG@10`, ... `MAP@15`. */
export type Scores = Record<string, number>;

/** One query's scores. `relevant` are its relevant skill ids, `ranked` the ids akm returned, best first. */
export function scoreQuery(relevant: string[], ranked: string[]): Scores {
  const want = new Set(relevant);
  const results = [...new Set(ranked)];
  const at = Object.fromEntries(
    KS.map((k) => {
      let found = 0;
      let precisionSum = 0;
      let dcg = 0;
      results.slice(0, k).forEach((id, i) => {
        if (!want.has(id)) return;
        found++;
        precisionSum += found / (i + 1);
        dcg += 1 / Math.log2(i + 2);
      });
      let ideal = 0;
      for (let i = 0; i < Math.min(want.size, k); i++) ideal += 1 / Math.log2(i + 2);
      return [k, { NDCG: dcg / ideal, Recall: found / want.size, Completeness: found === want.size ? 1 : 0, MAP: precisionSum / want.size }];
    }),
  );
  return Object.fromEntries(METRICS.flatMap((m) => KS.map((k) => [`${m}@${k}`, at[k][m]])));
}

/** The mean of each metric over the queries, to four places. Empty for no queries. */
export function meanScores(rows: Scores[]): Scores {
  if (rows.length === 0) return {};
  return Object.fromEntries(Object.keys(rows[0]).map((name) => [name, mean(rows.map((r) => r[name])) as number]));
}

// --- The rows -----------------------------------------------------------------------------------------------------

/** The lines of a run: akm search, asked of the keyword index and, in a run without --limit, of the semantic one. */
export const SYSTEMS = ["search", "semantic_search"] as const;
export type System = (typeof SYSTEMS)[number];
export type Mode = "keyword" | "semantic";
export const MODES = ["keyword", "semantic"] as const;
export const modeOf = (sys: System): Mode => (sys === "semantic_search" ? "semantic" : "keyword");

/** What a run has for each of its lines: the semantic one is there only when the run has the semantic index. */
export type Lines<T> = { search: T; semantic_search?: T };

/** What akm answered to one call. */
export interface Call {
  /** The skill ids akm returned, best first. */
  ranked: string[];
  seconds: number;
  error?: string;
  /** Set with `error` when the call failed because akm did not answer in time, so a slower akm shows as that and not as an unexplained error. */
  timed_out?: true;
}

/** A search call and, when it did not fail, the query's scores on it. */
export interface Line extends Call {
  scores?: Scores;
}

/**
 * The raw output of one query: what akm answered to the calls of each line, and nothing the scorer decides. The fields are the ones a row stores
 * under the same names, so a stored row holds everything `makeRow` reads and scripts/rescore can score it again (see `rawOf`). The curate calls
 * are there for the queries of the curate check. A semantic line is there when the run had the semantic index.
 */
export interface Raw {
  search: Call;
  semantic_search?: Call;
  curate?: Call;
  semantic_curate?: Call;
}

/** What akm search answered for a query, with the query's scores on each line, and, for the queries of the curate check, what akm curate answered. */
export type Row = { id: string; query: string; relevant: string[]; search: Line; semantic_search?: Line; curate?: Call; semantic_curate?: Call };

const scored = (call: Call, relevant: string[]): Line => ({ ...call, ...(call.error ? {} : { scores: scoreQuery(relevant, call.ranked) }) });

/** A row for a query: the raw output, and on each search line that did not fail the query's scores. A failed call has no scores and is left out of the numbers. */
export function makeRow(q: Query, raw: Raw): Row {
  return {
    id: q.id,
    query: q.query,
    relevant: q.relevant,
    search: scored(raw.search, q.relevant),
    ...(raw.semantic_search ? { semantic_search: scored(raw.semantic_search, q.relevant) } : {}),
    ...(raw.curate ? { curate: raw.curate } : {}),
    ...(raw.semantic_curate ? { semantic_curate: raw.semantic_curate } : {}),
  };
}

// --- The summary --------------------------------------------------------------------------------------------------

/** For one index: how many of the checked queries akm curate answered with exactly search's ranking, and which it did not. */
export interface CurateAgreement {
  compared: number;
  same: number;
  different: string[];
  /** Checked queries whose curate call failed. */
  errored: number;
  /** Of those, the calls that failed because akm did not answer in time. */
  timeouts: number;
}

export interface CurateCheck {
  seed: number;
  /** The checked queries, drawn at random under the seed from the queries of the run. */
  queries: string[];
  keyword: CurateAgreement;
  semantic?: CurateAgreement;
}

/** The seed the curate sample is drawn under: sample.ts's SEED, which a test checks. It is here so that the scorer reads nothing of the collector. */
export const CURATE_SEED = 42;

/** Of the checked rows, how many akm curate answered with the ranking of akm search, on one index. */
function agreement(checked: Row[], mode: Mode): CurateAgreement {
  const [searchKey, curateKey] = mode === "keyword" ? (["search", "curate"] as const) : (["semantic_search", "semantic_curate"] as const);
  const out: CurateAgreement = { compared: 0, same: 0, different: [], errored: 0, timeouts: 0 };
  for (const r of checked) {
    const curate = r[curateKey];
    const search = r[searchKey];
    if (!curate || curate.error) {
      out.errored++;
      if (curate?.timed_out) out.timeouts++;
    } else if (search && !search.error) {
      out.compared++;
      if (JSON.stringify(curate.ranked) === JSON.stringify(search.ranked)) out.same++;
      else out.different.push(r.id);
    }
  }
  return out;
}

/** The akm calls of a run that failed, and those of them that timed out: the search lines and the curate check together. */
export const failedCalls = (s: { errored: Lines<number>; timeouts: Lines<number>; curate_check: Pick<CurateCheck, "keyword" | "semantic"> }): { errored: number; timedOut: number } => ({
  errored: SYSTEMS.reduce((n, sys) => n + (s.errored[sys] ?? 0), 0) + MODES.reduce((n, mode) => n + (s.curate_check[mode]?.errored ?? 0), 0),
  timedOut: SYSTEMS.reduce((n, sys) => n + (s.timeouts[sys] ?? 0), 0) + MODES.reduce((n, mode) => n + (s.curate_check[mode]?.timeouts ?? 0), 0),
});

/** What a run that had calls fail says, and exits with: those queries are missing from its numbers. */
export const callsFailure = ({ errored, timedOut }: { errored: number; timedOut: number }): string =>
  `${errored} akm calls failed${timedOut > 0 ? `, ${timedOut} of them by timing out` : ""}. Their queries are left out of the numbers, or of the curate check: see the errors in samples.jsonl.`;

/** A query that had a search call fail has no verdict on that line, and is an error of the run. The curate check has its own counts. */
export const errored = (row: Row): boolean => SYSTEMS.some((sys) => Boolean(row[sys]?.error));

/** The fields of the summary that come from the rows: the counts, the metrics (over all queries and by how many skills a query needs), the curate check, and whether any call failed. */
export function summarize(rows: Row[]) {
  const semantic = rows.some((r) => r.semantic_search !== undefined);
  /** What a summary has for each line the run has. */
  const lines = <T>(f: (sys: System) => T): Lines<T> => ({ search: f("search"), ...(semantic ? { semantic_search: f("semantic_search") } : {}) });
  const metricsOf = (rs: Row[], sys: System): Scores => meanScores(rs.flatMap((r) => (r[sys]?.scores ? [r[sys].scores as Scores] : [])));
  const errors = lines((sys) => rows.filter((r) => r[sys]?.error).length);
  const timeouts = lines((sys) => rows.filter((r) => r[sys]?.timed_out).length);
  const checked = rows.filter((r) => r.curate !== undefined);
  const curate_check: CurateCheck = { seed: CURATE_SEED, queries: checked.map((r) => r.id), keyword: agreement(checked, "keyword"), ...(semantic ? { semantic: agreement(checked, "semantic") } : {}) };
  const failed = failedCalls({ errored: errors, timeouts, curate_check });
  return {
    status: (failed.errored > 0 ? "aborted" : "complete") as "aborted" | "complete",
    aborted_reason: failed.errored > 0 ? callsFailure(failed) : null,
    n_queries: rows.length,
    errored: errors,
    timeouts,
    no_results: lines((sys) => rows.filter((r) => r[sys] && !r[sys]?.error && r[sys]?.ranked.length === 0).length),
    metrics: lines((sys) => metricsOf(rows, sys)),
    by_size: Object.fromEntries(
      [...new Set(rows.map((r) => r.relevant.length))]
        .sort((a, b) => a - b)
        .map((size) => {
          const rs = rows.filter((r) => r.relevant.length === size);
          return [String(size), { n: rs.length, ...lines((sys) => metricsOf(rs, sys)) }];
        }),
    ) as Record<string, { n: number } & Lines<Scores>>,
    curate_check,
    call_seconds: lines((sys) => Number((rows.reduce((a, r) => a + (r[sys]?.seconds ?? 0), 0) / rows.length).toFixed(3))),
  };
}

// --- Scoring a stored row again -----------------------------------------------------------------------------------

/** A call as a stored row holds it, or why it cannot be read as one. */
function callOf(x: any, name: string, missing: string[]): Call | undefined {
  if (x === undefined) return undefined;
  const bad = x === null || typeof x !== "object" ? [name] : [!Array.isArray(x.ranked) || !x.ranked.every((id: unknown) => typeof id === "string") ? `${name}.ranked` : "", typeof x.seconds !== "number" ? `${name}.seconds` : "", x.error !== undefined && typeof x.error !== "string" ? `${name}.error` : ""].filter(Boolean);
  if (bad.length > 0) {
    missing.push(...bad);
    return undefined;
  }
  return { ranked: x.ranked, seconds: x.seconds, ...(x.error !== undefined ? { error: x.error } : {}), ...(x.timed_out === true ? { timed_out: true as const } : {}) };
}

/**
 * The raw output of a stored row: the calls of each line, as the row holds them, or the names of the fields it lacks. A run whose rows lack one
 * cannot be scored again (scripts/rescore refuses it and names them). Rows written before the manifest hold all of these; they hold no scores,
 * which `makeRow` gives.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  const search = row.search === undefined ? (missing.push("search"), undefined) : callOf(row.search, "search", missing);
  const [semantic_search, curate, semantic_curate] = (["semantic_search", "curate", "semantic_curate"] as const).map((key) => callOf(row[key], key, missing));
  if (missing.length > 0 || search === undefined) return { missing };
  return { raw: { search, ...(semantic_search ? { semantic_search } : {}), ...(curate ? { curate } : {}), ...(semantic_curate ? { semantic_curate } : {}) } };
}
