// The scorer of the consolidate eval, for the per-case run: how what akm printed for a pair of notes becomes a row, and the rows become metrics.
// It is pure and needs no akm. The collector (collect.ts) builds each row by calling `makeRow` with the raw output it got, and scripts/rescore
// calls the same function with the raw output it reads back from a stored row, so a fix to a check scores every stored run again. pool-score.ts
// is the scorer of `--pool`. Nothing here may import the collector.

import { type Case, RELATIONS, type Relation, type Side } from "./cases.ts";

export type Outcome = "retire" | "keep" | "error";

// --- What akm printed -------------------------------------------------------------------------------------------

/** The pair pass of `akm improve`'s result (`consolidation.pairPass`), the counts the scorer reads. */
export interface PairPass {
  pairsConsidered?: number;
  pairsJudged?: number;
  failedJudgments?: number;
  labelCounts?: Record<string, number>;
}

/** A retire proposal of the pair pass in `akm proposal list --detail full`, as akm queued it. Its other proposals are promotions. */
export interface RetireProposal {
  source: "consolidate-pair";
  retirement: { retiredRef: string; successorRef?: string; judgeLabel?: string; judgeReason?: string; onlyInRetired?: unknown; onlyInSuccessor?: unknown };
  gateDecision?: { outcome?: string };
}

/** One line of the usage report of the run (`usageReport.byProcessEngineModel`): the calls the endpoint answered under a model name. */
export interface UsageRow {
  model?: string;
  calls?: number;
  failures?: number;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * The raw output of one case: what the collector got back from akm, and nothing the scorer decides. The fields are the ones a row stores under
 * the same names, so a stored row holds everything `makeRow` reads and scripts/rescore can score it again (see `rawOf`). A case that ended
 * before akm gave a result has an `error`, and the other fields are not there.
 */
export type Raw =
  | { error: string; timedOut?: boolean; seconds: number; retried?: number }
  | {
      /** akm's pair pass for the case, or null when `improve` printed none. */
      pair_pass: PairPass | null;
      /** The retire proposals of the pair pass. */
      retire_proposals: RetireProposal[];
      /** What the run's calls were answered by. */
      usage: UsageRow[];
      /** What akm printed to stderr that reads as a failure, such as " (akm said: Network error)", with the endpoint written as <MODEL_BASE_URL>. A row with no verdict carries it in its error. */
      hint?: string;
      seconds: number;
      retried?: number;
    };

export interface Row {
  id: string;
  relation: Relation;
  safe_sides: Side[]; // the sides of the case that were safe to retire
  outcome: Outcome;
  paired: boolean; // akm took the two notes as a candidate pair and had its judge look at them
  judged_as: Relation | null; // the label akm's judge gave the pair
  retired: Side | null; // the side akm proposed to retire
  safe: boolean | null; // whether that side was safe to retire
  staged: boolean; // akm staged the retirement, so a triage run would accept it with no one looking
  reason: string; // the judge's reason for a retirement
  only_in_retired: string[] | null; // the claims the judge found only in the retired note, null when akm did not retire one or its build does not record them
  only_in_successor: string[] | null; // the claims the judge found only in the note akm kept, null likewise
  served: Record<string, number>; // the model names the endpoint reported, with the calls each answered
  seconds: number; // the last try
  retried?: number; // how many times the case was tried again because the endpoint rate limited it
  error?: string;
  timed_out?: true; // the error is a timeout: the eval killed akm for running past its time limit, which a slower akm or model makes happen
  // The raw output, kept so that the row can be scored again (a row of a case that ended before akm gave a result has none of these):
  pair_pass?: PairPass | null;
  retire_proposals?: RetireProposal[];
  usage?: UsageRow[];
  hint?: string;
}

/** `bundle//memories/some-name` is the memory `some-name`. */
export const nameOfRef = (ref: string): string => ref.replace(/^.*\/\//, "").replace(/^memories\//, "");

/**
 * The model names the endpoint reported for the run's calls, from akm's usage report, with the calls each answered. A gateway may
 * serve one name from several providers. A call that got no answer has no reported name, and akm files it under the name that was
 * asked for, so only the calls that were answered count.
 */
export function servedModels(usage: UsageRow[]): Record<string, number> {
  const served: Record<string, number> = {};
  for (const r of usage) {
    const answered = Number(r?.calls ?? 0) - Number(r?.failures ?? 0);
    if (typeof r?.model === "string" && answered > 0) served[r.model] = (served[r.model] ?? 0) + answered;
  }
  return served;
}

/** A claim list from the retirement, or null when this akm build did not record one. */
const claimList = (x: unknown): string[] | null => (Array.isArray(x) && x.every((k) => typeof k === "string") ? x : null);

export function errorRow(c: Case, message: string, seconds: number, timedOut = false): Row {
  return { id: c.id, relation: c.relation, safe_sides: c.safe, outcome: "error", paired: false, judged_as: null, retired: null, safe: null, staged: false, reason: "", only_in_retired: null, only_in_successor: null, served: {}, seconds, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

/**
 * Turns what akm printed for one case into a row. `raw.pair_pass` is the run's pair pass, and `raw.retire_proposals` are the retire
 * proposals it queued: akm retires a note by proposing it, so the proposal's ref is the retired note and the other is kept.
 */
export function makeRow(c: Case, raw: Raw): Row {
  const tried = raw.retried ? { retried: raw.retried } : {};
  if ("error" in raw) return { ...errorRow(c, raw.error, raw.seconds, raw.timedOut === true), ...tried };
  const hint = raw.hint ?? "";
  const kept = { pair_pass: raw.pair_pass, retire_proposals: raw.retire_proposals, usage: raw.usage, ...(hint ? { hint } : {}) };
  const pass = raw.pair_pass;
  if (!pass || typeof pass !== "object") return { ...errorRow(c, `improve printed no pair pass result. Does this akm have consolidate's pair pass?${hint}`, raw.seconds), ...kept, ...tried };
  const paired = Number(pass.pairsConsidered ?? 0) > 0;
  const judged_as = RELATIONS.find((r) => Number(pass.labelCounts?.[r] ?? 0) > 0) ?? null;
  const base = { id: c.id, relation: c.relation, safe_sides: c.safe, paired, judged_as, served: servedModels(raw.usage), seconds: raw.seconds };
  const failed = (error: string): Row => ({ ...base, outcome: "error", retired: null, safe: null, staged: false, reason: "", only_in_retired: null, only_in_successor: null, error: `${error}${hint}`, ...kept, ...tried });
  if (Number(pass.failedJudgments ?? 0) > 0 || (paired && Number(pass.pairsJudged ?? 0) === 0)) return failed("akm paired the notes but its judge gave no verdict");
  const retired = raw.retire_proposals;
  if (retired.length === 0) return { ...base, outcome: "keep", retired: null, safe: null, staged: false, reason: "", only_in_retired: null, only_in_successor: null, ...kept, ...tried };
  if (retired.length > 1) return failed(`akm made ${retired.length} retire proposals for one pair`);
  const [p] = retired;
  const name = nameOfRef(p.retirement.retiredRef);
  const side: Side | undefined = name === c.a.name ? "a" : name === c.b.name ? "b" : undefined;
  if (!side) return failed(`akm retired ${p.retirement.retiredRef}, which is not one of the two notes`);
  return { ...base, outcome: "retire", retired: side, safe: c.safe.includes(side), staged: p.gateDecision?.outcome === "staged", reason: p.retirement.judgeReason ?? "", only_in_retired: claimList(p.retirement.onlyInRetired), only_in_successor: claimList(p.retirement.onlyInSuccessor), ...kept, ...tried };
}

// --- Metrics ----------------------------------------------------------------------------------------------------

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface ClassCounts {
  n: number; // cases of this relation that ran
  error: number;
  paired: number; // cases where akm paired the notes and had its judge look at them
  judged_as: Record<Relation, number>; // the labels the judge gave the paired notes
  retired_safe: number;
  retired_unsafe: number;
  kept: number; // cases where akm kept both notes
}

export interface Metrics {
  unsafe: { n: number; of: number; staged: number }; // unsafe retirements, scored cases, and the unsafe ones akm staged
  staged: { n: number; safe: number }; // the retirements akm staged, which a triage run accepts with no one looking, and the safe ones among them
  precision: { value: number | null; safe: number; retired: number }; // of the retirements, the share that were safe
  recall: { value: number | null; retired_safe: number; of: number }; // of the cases with a safe side, the share where akm retired a safe one
  classes: Record<Relation, ClassCounts>;
}

/** The numbers the eval reports. Cases that errored are counted per relation and left out of the rest. */
export function metrics(rows: Row[]): Metrics {
  const labels = () => Object.fromEntries(RELATIONS.map((r) => [r, 0])) as Record<Relation, number>;
  const classes = Object.fromEntries(RELATIONS.map((r) => [r, { n: 0, error: 0, paired: 0, judged_as: labels(), retired_safe: 0, retired_unsafe: 0, kept: 0 }])) as Record<Relation, ClassCounts>;
  let unsafe = 0;
  let staged = 0;
  let stagedAll = 0;
  let stagedSafe = 0;
  let safe = 0;
  let scored = 0;
  let withSafeSide = 0;
  let hits = 0;
  for (const r of rows) {
    const k = classes[r.relation];
    k.n++;
    if (r.outcome === "error") {
      k.error++;
      continue;
    }
    scored++;
    if (r.paired) k.paired++;
    if (r.judged_as) k.judged_as[r.judged_as]++;
    if (r.staged) {
      stagedAll++;
      if (r.safe) stagedSafe++;
    }
    if (r.outcome === "keep") k.kept++;
    else if (r.safe) {
      k.retired_safe++;
      safe++;
    } else {
      k.retired_unsafe++;
      unsafe++;
      if (r.staged) staged++;
    }
    if (r.safe_sides.length > 0) {
      withSafeSide++;
      if (r.outcome === "retire" && r.safe) hits++;
    }
  }
  return {
    unsafe: { n: unsafe, of: scored, staged },
    staged: { n: stagedAll, safe: stagedSafe },
    precision: { value: ratio(safe, safe + unsafe), safe, retired: safe + unsafe },
    recall: { value: ratio(hits, withSafeSide), retired_safe: hits, of: withSafeSide },
    classes,
  };
}

// --- Scoring a stored row again ---------------------------------------------------------------------------------

const isObject = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack
 * one cannot be scored again (scripts/rescore refuses it and names them). Rows written before the manifest do not hold `pair_pass`,
 * `retire_proposals` and `usage`, so such a run is refused.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (typeof row.seconds !== "number") missing.push("seconds");
  const retried = typeof row.retried === "number" ? { retried: row.retried } : {};
  if ("pair_pass" in row) {
    if (row.pair_pass !== null && !isObject(row.pair_pass)) missing.push("pair_pass");
    if (!Array.isArray(row.retire_proposals) || !row.retire_proposals.every((p: unknown) => isObject(p) && isObject(p.retirement) && typeof p.retirement.retiredRef === "string")) missing.push("retire_proposals");
    if (!Array.isArray(row.usage)) missing.push("usage");
    if (missing.length > 0) return { missing };
    return { raw: { pair_pass: row.pair_pass, retire_proposals: row.retire_proposals, usage: row.usage, ...(typeof row.hint === "string" && row.hint ? { hint: row.hint } : {}), seconds: row.seconds, ...retried } };
  }
  // A case that ended before akm gave a result: only its message, and whether the eval killed akm for running too long.
  if (typeof row.error === "string") {
    if (missing.length > 0) return { missing };
    return { raw: { error: row.error, timedOut: row.timed_out === true, seconds: row.seconds, ...retried } };
  }
  return { missing: [...missing, "pair_pass", "retire_proposals", "usage"] };
}

/** A case that ended in an error has no verdict. */
export const errored = (row: Row): boolean => row.outcome === "error";

/** The fields of the summary that come from the rows: how many ran, were scored, errored and paired, the model names that answered, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; n_paired: number; served_models: Record<string, number>; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  const served: Record<string, number> = {};
  for (const r of rows) for (const [name, calls] of Object.entries(r.served)) served[name] = (served[name] ?? 0) + calls;
  return {
    n_run: rows.length,
    n_scored: rows.length - failed,
    n_errored: failed,
    timeouts: rows.filter((r) => r.timed_out).length,
    n_paired: rows.filter((r) => r.outcome !== "error" && r.paired).length,
    served_models: served,
    metrics: metrics(rows),
  };
}
