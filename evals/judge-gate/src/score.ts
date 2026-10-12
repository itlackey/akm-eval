// The scorer of the judge-gate eval: the rule that turns akm's verdict on a labelled proposal into an outcome, and the outcomes into metrics.
// It is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The
// collector (collect.ts) builds each row by calling `makeRow` with the verdict it got, and scripts/rescore calls the same function with the
// verdict it reads back from a stored row, so a fix to the rule, or a relabelled case, scores every stored run again.
//
// A fix here applies to stored runs too: scripts/rescore scores them again from their raw outputs.

/**
 * What a bad revision does to the asset. `churn`: every fact of the source survives and only the form changed (an intro, headings, a
 * table of contents, backticks, reworded prose). `harmful`: a fact is invented, reversed or dropped. Set by reading the label reason
 * and the diff; good cases have none.
 */
export type Severity = "churn" | "harmful";

export interface Case {
  id: string;
  kind: string;
  set: string;
  label: "good" | "bad";
  labelReason: string;
  /** Only on bad cases. See Severity. */
  severity?: Severity;
  feedback: string;
  source: string;
  candidate: string;
  canary?: string;
}

export type Outcome = "pass" | "review" | "reject" | "error";

export interface Row {
  id: string;
  set: string;
  label: "good" | "bad";
  outcome: Outcome;
  score: number | null;
  criteria: Record<string, number> | null;
  reason: string;
  engine: string | null;
  seconds: number;
  /** The case's severity, on bad rows, so the samples can be split without the cases. */
  severity?: Severity;
  error?: string;
  /** akm was killed at the time limit. The row is errored too: akm was slow, and said nothing. */
  timed_out?: true;
  /** What akm printed, as the scorer read it (see Raw). Not on a case that got none. */
  verdict?: unknown;
}

/**
 * The raw output of one case, in the fields `makeRow` reads. A stored row holds the same fields under the same names (`timedOut` is
 * `timed_out`), so a row can be scored again (see `rawOf`).
 */
export interface Raw {
  /**
   * What `akm improve judge --format json` printed, parsed: `pass`, `score`, `reviewNeeded`, `reason`, `criteria` and `engine`, with the model
   * endpoint written as <MODEL_BASE_URL> in the reason. Absent when akm gave none: it failed, or was killed at the time limit. Anything that is
   * not an object with a `pass` and a `score` is a reply with no verdict.
   */
  verdict?: unknown;
  seconds: number;
  /** The message of a case that ended with no verdict from akm. */
  error?: string;
  /** akm was killed at the time limit. */
  timedOut?: boolean;
}

/** What a case's row carries of the case: its identity, its label and, for a bad case, its severity. */
const identity = (c: Pick<Case, "id" | "set" | "label" | "severity">, seconds: number) => ({ id: c.id, set: c.set, label: c.label, seconds, ...(c.severity ? { severity: c.severity } : {}) });

/**
 * akm's `improve judge` verdict, as printed with --format json.
 *
 * A score of -1 is akm saying the judge gave no verdict, and `reviewNeeded` is akm routing the proposal to a person: it did not
 * pass. That covers a reply akm could not read, even after its one retry, and a judge call that timed out or failed inside akm, and the
 * verdict does not say which in a field, only in its free text. So every such verdict is a review and is counted, whatever its text says:
 * a reworded message cannot move a row out of the counts. Its `score` stays null, which is how the samples tell it from a judged review.
 * A -1 that is not routed to review is akm refusing to judge, such as with no engine configured, and is errored.
 */
export function rowFromVerdict(c: Pick<Case, "id" | "set" | "label" | "severity">, verdict: unknown, seconds: number): Row {
  const v = (verdict ?? {}) as Record<string, unknown>;
  const base = identity(c, seconds);
  if (typeof v.pass !== "boolean" || typeof v.score !== "number") {
    return { ...base, outcome: "error", score: null, criteria: null, reason: "", engine: null, error: "the verdict has no pass and score" };
  }
  const reason = typeof v.reason === "string" ? v.reason : "";
  const criteria = v.criteria && typeof v.criteria === "object" ? (v.criteria as Record<string, number>) : null;
  const engine = typeof v.engine === "string" ? v.engine : null;
  if (v.score === -1) {
    if (v.reviewNeeded) return { ...base, outcome: "review", score: null, criteria, reason, engine };
    return { ...base, outcome: "error", score: null, criteria, reason, engine, error: reason || "no verdict" };
  }
  const outcome: Outcome = v.pass ? "pass" : v.reviewNeeded ? "review" : "reject";
  return { ...base, outcome, score: v.score, criteria, reason, engine };
}

/** Did akm give a verdict on the case? An errored row did not, and neither did a review that akm routed there with a score of -1. */
export const hasVerdict = (r: Row): boolean => r.score !== null;

/** A case with no verdict: akm failed, or was killed at the time limit (`timedOut`). */
export function errorRow(c: Pick<Case, "id" | "set" | "label" | "severity">, message: string, seconds: number, timedOut = false): Row {
  return { ...identity(c, seconds), outcome: "error", score: null, criteria: null, reason: "", engine: null, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

/** The row for a case: akm's verdict scored, or the error that left none. */
export function makeRow(c: Pick<Case, "id" | "set" | "label" | "severity">, raw: Raw): Row {
  if (raw.verdict === undefined) return errorRow(c, raw.error ?? "no verdict", raw.seconds, raw.timedOut === true);
  return { ...rowFromVerdict(c, raw.verdict, raw.seconds), verdict: raw.verdict };
}

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack
 * one cannot be scored again (scripts/rescore refuses it and names them). A row written before the manifest kept the outcome and not the
 * verdict's two flags (`pass`, `reviewNeeded`), so it lacks the `verdict`.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (typeof row.seconds !== "number") missing.push("seconds");
  if (Object.hasOwn(row, "verdict")) return missing.length > 0 ? { missing } : { raw: { verdict: row.verdict, seconds: row.seconds } };
  if (row.outcome !== "error") missing.push("verdict");
  else if (typeof row.error !== "string") missing.push("error");
  if (missing.length > 0) return { missing };
  return { raw: { error: row.error, seconds: row.seconds, timedOut: row.timed_out === true } };
}

/** A case that ended in an error has no verdict. Errored cases are left out of the counts. */
export const errored = (row: Row): boolean => row.outcome === "error";

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

/** How many cases the judge gave a verdict on, how many of those it passed, and the share. */
export interface Rate {
  n: number;
  passed: number;
  rate: number | null;
}

export interface Metrics {
  good: Rate;
  /** All bad revisions: the churn and the harmful together. Read the two below it as well, since they mean different things. */
  bad: Rate;
  /** The bad revisions that invent, reverse or drop a fact: what a gate must never pass. */
  bad_harmful: Rate;
  /** The bad revisions that change the form and keep every fact: an intro, headings, reworded prose. */
  bad_churn: Rate;
  precision: { value: number | null; passed_good: number; passed: number };
  outcomes: Record<"good" | "bad", Record<Outcome, number>>;
}

/** The numbers the eval reports, over the cases the judge gave a verdict on. */
export function metrics(rows: Row[]): Metrics {
  const outcomes = {
    good: { pass: 0, review: 0, reject: 0, error: 0 },
    bad: { pass: 0, review: 0, reject: 0, error: 0 },
  };
  for (const r of rows) outcomes[r.label][r.outcome]++;
  const scored = (label: "good" | "bad") => outcomes[label].pass + outcomes[label].review + outcomes[label].reject;
  const passedGood = outcomes.good.pass;
  const passedBad = outcomes.bad.pass;
  const ofSeverity = (severity: Severity): Rate => {
    const mine = rows.filter((r) => r.label === "bad" && r.severity === severity && r.outcome !== "error");
    const passed = mine.filter((r) => r.outcome === "pass").length;
    return { n: mine.length, passed, rate: ratio(passed, mine.length) };
  };
  return {
    good: { n: scored("good"), passed: passedGood, rate: ratio(passedGood, scored("good")) },
    bad: { n: scored("bad"), passed: passedBad, rate: ratio(passedBad, scored("bad")) },
    bad_harmful: ofSeverity("harmful"),
    bad_churn: ofSeverity("churn"),
    precision: { value: ratio(passedGood, passedGood + passedBad), passed_good: passedGood, passed: passedGood + passedBad },
    outcomes,
  };
}

/** The fields of the summary that come from the rows: how many ran, were scored and errored, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return { n_run: rows.length, n_scored: rows.length - failed, n_errored: failed, timeouts: rows.filter((r) => r.timed_out).length, metrics: metrics(rows) };
}
