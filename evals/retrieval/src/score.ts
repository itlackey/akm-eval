// The scorer of the retrieval eval: the grades a query's results get, and the rows turned into metrics. It is the SCORER part of the eval's
// measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The collector (collect.ts) builds each
// query's row by calling `makeRow` with the results akm returned, and scripts/rescore calls the same function with the results it reads
// back from a stored row, so a fix to a metric, or a change to the qrels, scores every stored run again.
//
// A fix here applies to stored runs too: scripts/rescore scores them again from their raw outputs.

import { type Retrieval, mean, retrievalMetrics } from "../../../lib/ir.ts";
import { LEAK_KIND, isGuarded, isSelected, isUnknownFlag, leaked, reaches, takesSearchArgs, unsupportedColumns } from "./guard.ts";

export const NON_TASK_KINDS = ["chitchat", "notification", "log", "status", "nontask", LEAK_KIND];

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
  /** Extra CLI argv for search columns only, before the query separator. */
  searchArgs?: string[];
  /** The assets that sit outside the window of this filter query and match it best: one coming back in a search column means the build ignored the filter. See guard.ts. */
  sentinels?: string[];
  /** The frontmatter the session selects on, key to value or values. The collector puts it on both commands as `--<selection flag> key=value`. */
  selection?: Selection;
  /** The id of the query whose list this one's must equal: a selection that matches nothing leaves the list as the same query without one. */
  sameAs?: string;
  /** The selection keys of the assets that carry any, by ref. The set's metadata.jsonl. An asset not in it has none. */
  metadata?: Metadata;
}

// --- Selection: which assets match ------------------------------------------------------------------------------

export type Selection = Record<string, string | string[]>;
/** Ref to the selection keys the asset carries, key to value. */
export type Metadata = Record<string, Record<string, string>>;
/** An asset against a selection. `full`: every selected key matches (a key with several values matches any of them). `partial`: some do. `conflict`: none does, and a selected key has another value. `missing`: no selected key is there. */
export type Match = "full" | "partial" | "conflict" | "missing";

export function matchOf(selection: Selection, keys: Record<string, string> | undefined): Match {
  const states = Object.entries(selection).map(([key, want]) => {
    const have = keys?.[key];
    return have === undefined ? "missing" : [want].flat().includes(have) ? "match" : "conflict";
  });
  const matched = states.filter((x) => x === "match").length;
  if (matched === states.length) return "full";
  if (matched > 0) return "partial";
  return states.includes("conflict") ? "conflict" : "missing";
}

/** Whether some asset of the set fully matches the selection. One that matches none (`@absent`, `no-match`) is a check that the list stays as it was (`unchanged`), not a preference to measure. */
export const selectsAny = (c: Pick<Case, "selection" | "metadata">): boolean => c.selection !== undefined && Object.values(c.metadata ?? {}).some((keys) => matchOf(c.selection as Selection, keys) === "full");

/** Which kind of query this is for the selection, from the qrels: `team` when most of its relevant assets match, `general` when none does, `mixed` otherwise. null for a selection that matches no asset (selectsAny). */
export type Intent = "team" | "general" | "mixed";
export function intentOf(c: Pick<Case, "grades" | "selection" | "metadata">): Intent | null {
  if (!selectsAny(c)) return null;
  const relevant = Object.keys(c.grades).filter((r) => c.grades[r] >= RELEVANT);
  if (relevant.length === 0) return null;
  const full = relevant.filter((r) => matchOf(c.selection as Selection, c.metadata?.[r]) === "full").length;
  return full === 0 ? "general" : full * 2 > relevant.length ? "team" : "mixed";
}

/** How many of the first results the match metrics look at: akm search's default page and curate's. */
export const MATCH_K = { search: 5, curate: 4 } as const;
/** The first results whose `estimatedTokens` the cost of loading them adds up. */
export const LOAD_K = 5;
const commandOf = (sys: System): "search" | "curate" => (sys.endsWith("curate") ? "curate" : "search");

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
  /** Only for a query whose selection matches some asset (selectsAny). */
  selection?: SelectionScored;
}

export interface SelectionScored {
  /** nDCG@10 where a relevant asset that fully matches the selection gains one grade: matching relevant beats non-matching relevant beats irrelevant. The ideal order has the bonus too. */
  pref_ndcg_10: number;
  /** The share of the first k places (MATCH_K) that hold a relevant asset that fully matches. */
  match_precision_k: number;
  /** The share of the first k places that hold a full match graded below 2 or not at all: what a boost costs. */
  irrelevant_match_k: number;
  /** The rank of the first relevant full match, DEPTH + 1 when it is not among the results. null when the query has no relevant full match. Lower is better. */
  first_match_rank: number | null;
  /** The relevant assets that do not fully match (missing, conflict or partial) among the first 10, over the lesser of 10 and how many there are. null when there are none. */
  nonmatch_recall_10: number | null;
  /** Diagnostic: a relevant partial match ranks above a relevant missing or conflicting asset. null unless the query has both and one of them is among the results. */
  partial_above_none: boolean | null;
  /** Diagnostic: a relevant asset with a conflicting value ranks above a relevant one with the key missing. null unless the query has both and one of them is among the results. */
  conflict_above_missing: boolean | null;
}

/** The selection scores of one query, from the refs akm returned (aliases folded, each once). */
export function scoreSelection(c: Case & { selection: Selection }, refs: string[], k: number): SelectionScored {
  const top = refs.slice(0, DEPTH);
  const grade = (r: string): number => c.grades[r] ?? 0;
  const status = (r: string): Match => matchOf(c.selection, c.metadata?.[r]);
  const relevant = Object.keys(c.grades).filter((r) => grade(r) >= RELEVANT);
  const full = relevant.filter((r) => status(r) === "full");
  const rest = relevant.filter((r) => status(r) !== "full");
  const gain = (r: string): number => grade(r) + (grade(r) >= RELEVANT && status(r) === "full" ? 1 : 0);
  const dcg = (gs: number[]) => gs.reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = dcg(Object.keys(c.grades).map(gain).sort((a, b) => b - a).slice(0, DEPTH));
  const rank = (rs: string[]): number => {
    const i = top.findIndex((r) => rs.includes(r));
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const firstK = top.slice(0, k);
  const above = (a: Match[], b: Match[]): boolean | null => {
    const as = relevant.filter((r) => a.includes(status(r)));
    const bs = relevant.filter((r) => b.includes(status(r)));
    if (as.length === 0 || bs.length === 0) return null;
    // Neither among the results: nothing ranks above the other.
    return rank(as) === rank(bs) ? null : rank(as) < rank(bs);
  };
  const round = (x: number): number => Number(x.toFixed(4));
  return {
    pref_ndcg_10: ideal === 0 ? 0 : round(dcg(top.map(gain)) / ideal),
    match_precision_k: round(firstK.filter((r) => full.includes(r)).length / k),
    irrelevant_match_k: round(firstK.filter((r) => status(r) === "full" && grade(r) < RELEVANT).length / k),
    first_match_rank: full.length === 0 ? null : Math.min(rank(full) + 1, DEPTH + 1),
    nonmatch_recall_10: rest.length === 0 ? null : round(top.filter((r) => rest.includes(r)).length / Math.min(DEPTH, rest.length)),
    partial_above_none: above(["partial"], ["missing", "conflict"]),
    conflict_above_missing: above(["conflict"], ["missing"]),
  };
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
  /** Only where a query has a selection: the means of the selection scores over the queries each is defined for. */
  selection?: SelectionMetrics;
}

export interface SelectionMetrics {
  /** How many queries with a selection that matches some asset the column scored (selectsAny): the rows the guardrails are read on. */
  n: number;
  /** nDCG@10 over those queries. */
  ndcg_10: number | null;
  pref_ndcg_10: number | null;
  match_precision_k: number | null;
  irrelevant_match_k: number | null;
  /** The mean over the queries that have a relevant full match; DEPTH + 1 stands for one that is not among the results. */
  first_match_rank: number | null;
  nonmatch_recall_10: number | null;
  /** The share of the queries that have both where the partial match ranks above the non-match. */
  partial_above_none: number | null;
  /** The share of the queries that have both where the conflicting asset ranks above the one with the key missing. */
  conflict_above_missing: number | null;
}

/** The metrics of one column: the means of its queries' scores. */
export function summarize(rows: Scored[]): SystemMetrics {
  const share = (f: (r: Scored) => boolean | null): number | null => mean(rows.flatMap((r) => (f(r) === null ? [] : [f(r) ? 1 : 0])));
  const sel = rows.flatMap((r) => (r.selection ? [r.selection] : []));
  const selRows = rows.filter((r) => r.selection);
  const of = (f: (x: SelectionScored) => number | null): number | null => mean(sel.flatMap((x) => (f(x) === null ? [] : [f(x) as number])));
  const shareOf = (f: (x: SelectionScored) => boolean | null): number | null => of((x) => (f(x) === null ? null : f(x) ? 1 : 0));
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
    ...(sel.length === 0
      ? {}
      : {
          selection: {
            n: sel.length,
            ndcg_10: mean(selRows.map((r) => r.ndcg_10)),
            pref_ndcg_10: of((x) => x.pref_ndcg_10),
            match_precision_k: of((x) => x.match_precision_k),
            irrelevant_match_k: of((x) => x.irrelevant_match_k),
            first_match_rank: of((x) => x.first_match_rank),
            nonmatch_recall_10: of((x) => x.nonmatch_recall_10),
            partial_above_none: shareOf((x) => x.partial_above_none),
            conflict_above_missing: shareOf((x) => x.conflict_above_missing),
          },
        }),
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
  /** The characters akm printed: what the agent receives. A row made before 0.4 has none. */
  outChars?: number;
  /** `estimatedTokens` of each result, in the order of `refs` (a section folds into its asset's first). Search prints it, curate does not. */
  tokens?: number[];
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
  /** The characters akm printed. */
  out_chars?: number;
  /** akm's `estimatedTokens` of each result, in the order of `refs`. */
  estimated_tokens?: number[];
  scores?: Scored;
  /** A filter query's search call that akm refused as an unknown flag. It is not an errored call: guard.ts counts it as unsupported. */
  unsupported?: true;
}

export type Row = {
  id: string;
  kind: string;
  query: string;
  /** The search-only argv actually requested for this case, when supplied. */
  searchArgs?: string[];
  /** The sentinels of a filter query (see Case.sentinels). Its presence marks the row as guarded. */
  sentinels?: string[];
  /** The selection of the query, when it has one, and the id of the row whose list this one's must equal. */
  selection?: Selection;
  same_as?: string;
  /** What the qrels say the query wants: see intentOf. */
  intent?: Intent;
  /** How many assets have grade 2 or 3 for this query. Zero for a non-task input. */
  n_relevant: number;
} & Columns<SystemRow>;

/** The row of a query: each column's results with the grade of each, and, for a task query with a relevant asset, the scores of a call that did not fail. */
export function makeRow(c: Case, raw: Raw): Row {
  const nRelevant = Object.values(c.grades).filter((g) => g >= RELEVANT).length;
  const row: Record<string, unknown> = { id: c.id, kind: c.kind, query: c.query, n_relevant: nRelevant, ...(c.searchArgs ? { searchArgs: c.searchArgs } : {}), ...(c.sentinels?.length ? { sentinels: c.sentinels } : {}), ...(c.selection ? { selection: c.selection } : {}), ...(c.sameAs ? { same_as: c.sameAs } : {}), ...(intentOf(c) ? { intent: intentOf(c) } : {}) };
  const selected = isSelected(c);
  for (const sys of SYSTEMS) {
    const a = raw[sys];
    if (a === undefined) continue;
    const refs = a.refs.map(r => c.aliases?.[r] ?? r);
    // A filter query is scored for the columns that its searchArgs reach. Curate would answer it unfiltered. A selection reaches both commands.
    const scorable = !c.sentinels?.length || takesSearchArgs(sys);
    const unsupported = (selected || (c.sentinels?.length && takesSearchArgs(sys))) && a.error !== undefined && isUnknownFlag(a.error);
    row[sys] = {
      refs: a.refs,
      grades: refs.map((r) => (Object.hasOwn(c.grades, r) ? (c.grades[r] as number) : null)),
      seconds: a.seconds,
      ...(a.error ? { error: a.error } : {}),
      ...(a.timedOut ? { timed_out: true as const } : {}),
      ...(a.outChars !== undefined ? { out_chars: a.outChars } : {}),
      ...(a.tokens !== undefined ? { estimated_tokens: a.tokens } : {}),
      ...(unsupported ? { unsupported: true as const } : {}),
      ...(scorable && isTask(c) && nRelevant > 0 && !a.error ? { scores: scoredOf(c, [...new Set(refs)], sys) } : {}),
    };
  }
  return row as Row;
}

/** The scores of a query's results in one column: the usual ones, and the selection ones when the query's selection matches some asset. */
function scoredOf(c: Case, refs: string[], sys: System): Scored {
  const scores = scoreQuery(c.grades, refs, c.banned);
  return selectsAny(c) ? { ...scores, selection: scoreSelection(c as Case & { selection: Selection }, refs, MATCH_K[commandOf(sys)]) } : scores;
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
    if (a.out_chars !== undefined && typeof a.out_chars !== "number") missing.push(`${sys}.out_chars`);
    if (a.estimated_tokens !== undefined && !(Array.isArray(a.estimated_tokens) && a.estimated_tokens.every((t: unknown) => typeof t === "number"))) missing.push(`${sys}.estimated_tokens`);
    raw[sys] = { refs: a.refs, seconds: a.seconds, ...(a.error === undefined ? {} : { error: a.error }), ...(a.timed_out === true ? { timedOut: true } : {}), ...(a.out_chars === undefined ? {} : { outChars: a.out_chars }), ...(a.estimated_tokens === undefined ? {} : { tokens: a.estimated_tokens }) };
  }
  return missing.length > 0 ? { missing } : { raw: raw as Raw };
}

/** A query with a failed call in any column has no verdict for it: the call is left out of that column's numbers. */
export const errored = (row: Row): boolean => SYSTEMS.some((sys) => row[sys]?.error && !row[sys]?.unsupported);

/** Why a run whose semantic calls failed is aborted: the queries of those calls are missing from the semantic columns. */
export const semanticFailure = (calls: number): string => `${calls} semantic calls failed, or answered with keyword search. Their queries are left out of the semantic columns: see the errors in samples.jsonl.`;

/** The columns the rows have: the keyword ones, and the semantic ones when the run had the semantic index. */
export const columnsOf = (rows: Row[]): System[] => SYSTEMS.filter((sys) => sys === "search" || sys === "curate" || rows.some((r) => r[sys] !== undefined));

/** The fields of the summary that come from the rows: the counts, the errors and the aborted status, the metrics of each column and how often akm returned nothing. */
export function summarizeRows(rows: Row[]) {
  const systems = columnsOf(rows);
  const columns = <T>(f: (sys: System) => T): Columns<T> => ({ search: f("search"), curate: f("curate"), ...(systems.includes("semantic_search") ? { semantic_search: f("semantic_search"), semantic_curate: f("semantic_curate") } : {}) });
  const guarded = rows.some(isGuarded);
  const selected = rows.some(isSelected);
  // The columns whose filter queries are unsupported (guard.ts): those rows are left out of the metrics of the column, and are not errored calls.
  const unsupported = unsupportedColumns(rows, systems);
  const counted = (rs: Row[], s: System) => rs.filter((r) => !at(r, s)?.error && !(isGuarded(r) && !takesSearchArgs(s)) && !(reaches(r, s) && unsupported[s] !== undefined));
  const scored = rows.filter((r) => isTask(r) && r.n_relevant > 0);
  const noAnswer = rows.filter((r) => isTask(r) && r.n_relevant === 0);
  const nonTask = rows.filter((r) => !isTask(r));
  const ok = (rs: Row[], s: System) => rs.filter((r) => !at(r, s)?.error);
  const erroredCalls = columns((s) => rows.filter((r) => at(r, s)?.error && !at(r, s).unsupported).length);
  const failedSemantic = (erroredCalls.semantic_search ?? 0) + (erroredCalls.semantic_curate ?? 0);
  const metricsOf = (rs: Row[]) => columns((s) => summarize(counted(rs, s).map((r) => at(r, s).scores as Scored)));
  return {
    status: failedSemantic > 0 ? ("aborted" as const) : ("complete" as const),
    aborted_reason: failedSemantic > 0 ? semanticFailure(failedSemantic) : null,
    n_queries: rows.length,
    n_scored: scored.length,
    n_errored: rows.filter(errored).length,
    errored: erroredCalls,
    timeouts: rows.reduce((n, r) => n + systems.filter((s) => at(r, s).timed_out).length, 0),
    metrics: metricsOf(scored),
    abstention: {
      non_task: columns((s) => abstention(ok(nonTask, s).map((r) => at(r, s).refs.length))),
      no_answer: columns((s) => abstention(ok(noAnswer, s).map((r) => at(r, s).refs.length))),
    },
    // A set with filter queries (sentinels) also reports which columns could not be scored for them, and its metrics by query kind. Other sets' summaries are as before.
    calls: columns((s) => callStats(ok(rows, s), s)),
    ...(guarded || selected
      ? {
          unsupported: columns((s) => (unsupported[s] === undefined ? 0 : rows.filter((r) => reaches(r, s)).length)),
          unsupported_reason: Object.keys(unsupported).length === 0 ? null : unsupportedReason(unsupported, guarded),
          by_kind: Object.fromEntries([...new Set(scored.map((r) => r.kind))].sort().map((kind) => [kind, metricsOf(scored.filter((r) => r.kind === kind))])),
        }
      : {}),
    // A set with selections also reports the metrics by what the query wants, and the checks that a selection must pass whatever the option under test.
    ...(selected
      ? {
          by_intent: Object.fromEntries([...new Set(scored.flatMap((r) => (r.intent ? [r.intent] : [])))].sort().map((intent) => [intent, metricsOf(scored.filter((r) => r.intent === intent))])),
          checks: {
            unchanged: columns((s) => unchanged(counted(rows, s), s)),
            leaked: columns((s) => leaked(ok(rows, s), s)),
          },
        }
      : {}),
  };
}

/** What a column costs per call: how many results, how long, and the tokens (akm's output as characters over 4; the estimatedTokens of the first LOAD_K results that search prints). null where the rows did not record it. */
export interface CallStats {
  n: number;
  results: number | null;
  seconds_p50: number | null;
  seconds_p95: number | null;
  out_tokens: number | null;
  load_tokens_k: number | null;
}

function callStats(rows: Row[], sys: System): CallStats {
  const answers = rows.map((r) => at(r, sys));
  const sorted = answers.map((a) => a.seconds).sort((a, b) => a - b);
  const percentile = (p: number): number | null => (sorted.length === 0 ? null : (sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] as number));
  const chars = answers.flatMap((a) => (a.out_chars === undefined ? [] : [a.out_chars]));
  const loaded = answers.flatMap((a) => (a.estimated_tokens === undefined ? [] : [a.estimated_tokens.slice(0, LOAD_K).reduce((x, y) => x + y, 0)]));
  return { n: answers.length, results: mean(answers.map((a) => a.refs.length)), seconds_p50: percentile(0.5), seconds_p95: percentile(0.95), out_tokens: mean(chars.map((c) => c / 4)), load_tokens_k: mean(loaded) };
}

/** The share of the queries with a partner (`same_as`) whose list equals the partner's list in this column. null when no query has a partner among the rows. */
function unchanged(counted: Row[], sys: System): number | null {
  const by = new Map(counted.map((r) => [r.id, r]));
  const pairs = counted.flatMap((r) => (r.same_as !== undefined && by.has(r.same_as) ? [[r, by.get(r.same_as) as Row] as const] : []));
  return mean(pairs.map(([a, b]) => (JSON.stringify(at(a, sys).refs.slice(0, DEPTH)) === JSON.stringify(at(b, sys).refs.slice(0, DEPTH)) ? 1 : 0)));
}

/** The sentence for a build that does not apply the filters of the filter queries. */
function unsupportedReason(unsupported: Partial<Record<System, string>>, guarded: boolean): string {
  const cols = Object.keys(unsupported).join(", ");
  const first = Object.values(unsupported)[0];
  if (!guarded) return `The queries with a selection are not scored for ${cols}: this akm build refuses the selection flag (${first}). They are left out of the metrics, and they are not errors.`;
  return `The filter queries are not scored for ${cols}: this akm build does not apply their search flags (${first}). They are left out of the metrics, and they are not errors.`;
}
