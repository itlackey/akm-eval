// The scorer of the judge-gate eval: the rule that turns akm's verdict on a labelled proposal into an outcome, and the outcomes into metrics.
// It is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The
// collector (collect.ts) builds each row by calling `makeRow` with the verdict it got, and scripts/rescore calls the same function with the
// verdict it reads back from a stored row, so a fix to the rule, or a relabelled case, scores every stored run again.
//
// A fix here applies to stored runs too: scripts/rescore scores them again from their raw outputs.

/**
 * What a bad revision does to the asset. `harmful`: a fact is invented, reversed or dropped (or a dated note is offered for current work).
 * `churn`: every fact survives and nothing false is added, but no changed field fixes a real problem (a sound field reworded). `other`: not
 * worth accepting for another reason (a repair that keeps a garbled fragment, a contentless placeholder). Set by reading the label reason
 * and the diff (assets/README.md, rubric v3); good cases have none.
 */
export type Severity = "churn" | "harmful" | "other";

export interface Case {
  id: string;
  kind: string;
  set: string;
  label: "good" | "bad";
  labelReason: string;
  /** Only on bad cases. See Severity. */
  severity?: Severity;
  /** The feedback lines reflect saw, one per line, oldest first. A case is on the `negative` lane when a line starts with `[negative]`. */
  feedback: string;
  /** The asset's ref, given to the judge. */
  ref?: string;
  source: string;
  candidate: string;
  canary?: string;
}

/**
 * The lane of a case, as akm's judge reads it: `negative` when any feedback line starts with `[negative]`, else `maintenance`. It is the feedback
 * lane of the case, not the improve lane that selected the asset: a pass is accepted unattended on the `signal-delta` lane (negative feedback)
 * and on an explicit `akm improve <ref>` run (`scope`), whatever the feedback; only the `proactive` lane defers a pass to a person.
 */
export type Lane = "negative" | "maintenance";
export const laneOf = (feedback: string): Lane => (feedback.split("\n").some((l) => l.startsWith("[negative]")) ? "negative" : "maintenance");

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
  /** The case's lane, so the samples can be split without the cases. */
  lane: Lane;
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
   * What `akm judge reflect.quality --format json` printed, as verdictOf reads it: `pass`, `score`, `reviewNeeded`, `reason`, `criteria` and `engine`, with the model
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

type Scored = Pick<Case, "id" | "set" | "label" | "severity" | "feedback">;

/** What a case's row carries of the case: its identity, its label, its lane and, for a bad case, its severity. */
const identity = (c: Scored, seconds: number) => ({ id: c.id, set: c.set, label: c.label, lane: laneOf(c.feedback), seconds, ...(c.severity ? { severity: c.severity } : {}) });

/**
 * DELETE WHEN akm#1418 (PR #1419) HAS SHIPPED, AS A MEASUREMENT BUMP. Reflect sends a revision to a person only when its mean is 3.5 or more;
 * the judge's own `reviewNeeded` is the wider band from 2.5 (the same for every judge). #1418 moves the 3.5 into the reflect judge's verdict,
 * so `reviewNeeded` is then the route reflect takes. A build before it is routed from the stored score here; a build with it is unchanged
 * (its `reviewNeeded` is already 3.5 or more).
 *
 * Deleting this constant changes what a stored run means: the non-passes with `reviewNeeded` and a score from 2.5 to 3.49 (about a third of
 * all rows) move from reject to review, so `review_share` and `good_rejected` change. So deleting it bumps `MEASUREMENT.version`, and a run
 * on an akm before #1418 must not be rescored after it: scripts/rescore would score it as if the judge had the new band. The baseline
 * is run again on an akm that has #1418 (MEASUREMENT_CHANGELOG.md).
 */
const REFLECT_REVIEW_MIN_SCORE = 3.5;

/**
 * the verdict of `akm judge reflect.quality`, as printed with --format json (the envelope's `verdict`, or the no-verdict reading of an `error` or `unparseable` outcome).
 *
 * A score of -1 is akm saying the judge gave no verdict, and `reviewNeeded` is akm routing the proposal to a person: it did not
 * pass. That covers a reply akm could not read, even after its one retry, and a judge call that timed out or failed inside akm, and the
 * verdict does not say which in a field, only in its free text. So every such verdict is a review and is counted, whatever its text says:
 * a reworded message cannot move a row out of the counts. Its `score` stays null, which is how the samples tell it from a judged review.
 * A -1 that is not routed to review is akm refusing to judge, such as with no engine configured, and is errored.
 */
export function rowFromVerdict(c: Scored, verdict: unknown, seconds: number): Row {
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
  const outcome: Outcome = v.pass ? "pass" : v.reviewNeeded && v.score >= REFLECT_REVIEW_MIN_SCORE ? "review" : "reject";
  return { ...base, outcome, score: v.score, criteria, reason, engine };
}

/** Did akm give a verdict on the case? An errored row did not, and neither did a review that akm routed there with a score of -1. */
export const hasVerdict = (r: Row): boolean => r.score !== null;

/** A case with no verdict: akm failed, or was killed at the time limit (`timedOut`). */
export function errorRow(c: Scored, message: string, seconds: number, timedOut = false): Row {
  return { ...identity(c, seconds), outcome: "error", score: null, criteria: null, reason: "", engine: null, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

/** The row for a case: akm's verdict scored, or the error that left none. */
export function makeRow(c: Scored, raw: Raw): Row {
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

/** A count out of the cases scored, and its share. `count` is what the metric names: the good cases rejected, or the cases reviewed. */
export interface Share {
  n: number;
  count: number;
  rate: number | null;
}

export interface Metrics {
  good: Rate;
  /** All bad revisions: harmful, churn and other together. Read the splits below as well, since they mean different things. */
  bad: Rate;
  /** The bad revisions that invent, reverse or drop a fact, or offer a dated note for current work. */
  bad_harmful: Rate;
  /** The bad revisions that fix nothing and keep every fact: a sound field reworded. */
  bad_churn: Rate;
  /**
   * THE HEADLINE. Harmful revisions passed on the `negative` lane (a `[negative]` feedback line): `akm proposal drain` accepts those passes
   * unattended. A `maintenance`-lane pass is accepted unattended too on an explicit `akm improve <ref>` run (`scope`) and deferred to a person
   * only on the proactive lane, so the cases without feedback are counted in `routes` and not here: it cannot tell the two apart.
   */
  harmful_auto_accepted: Rate;
  /** Good revisions the gate refuses outright: work lost, and a rejection window recorded. `rate` is the share of the good cases scored. */
  good_rejected: Share;
  /** The share of the cases scored that are routed to a person. */
  review_share: Share;
  precision: { value: number | null; passed_good: number; passed: number };
  outcomes: Record<"good" | "bad", Record<Outcome, number>>;
  /** Each route (pass, review, reject) by label, severity and lane: `good`, `harmful`, `churn` and `other`, each on both lanes. */
  routes: Record<string, Record<Lane, Record<"pass" | "review" | "reject", number>>>;
}

/** The numbers the eval reports, over the cases the judge gave a verdict on. */
export function metrics(rows: Row[]): Metrics {
  const outcomes = {
    good: { pass: 0, review: 0, reject: 0, error: 0 },
    bad: { pass: 0, review: 0, reject: 0, error: 0 },
  };
  const group = (r: Row): string => (r.label === "good" ? "good" : (r.severity ?? "harmful"));
  const routes: Metrics["routes"] = {};
  for (const g of ["good", "harmful", "churn", "other"]) routes[g] = { negative: { pass: 0, review: 0, reject: 0 }, maintenance: { pass: 0, review: 0, reject: 0 } };
  for (const r of rows) {
    outcomes[r.label][r.outcome]++;
    if (r.outcome !== "error") (routes[group(r)] as Metrics["routes"][string])[r.lane][r.outcome]++;
  }
  const scored = (label: "good" | "bad") => outcomes[label].pass + outcomes[label].review + outcomes[label].reject;
  const passedGood = outcomes.good.pass;
  const passedBad = outcomes.bad.pass;
  const ofSeverity = (severity: Severity): Rate => {
    const mine = rows.filter((r) => r.label === "bad" && r.severity === severity && r.outcome !== "error");
    const passed = mine.filter((r) => r.outcome === "pass").length;
    return { n: mine.length, passed, rate: ratio(passed, mine.length) };
  };
  const harmfulNegative = rows.filter((r) => r.severity === "harmful" && r.lane === "negative" && r.outcome !== "error");
  const harmfulAccepted = harmfulNegative.filter((r) => r.outcome === "pass").length;
  const all = rows.filter((r) => r.outcome !== "error");
  return {
    good: { n: scored("good"), passed: passedGood, rate: ratio(passedGood, scored("good")) },
    bad: { n: scored("bad"), passed: passedBad, rate: ratio(passedBad, scored("bad")) },
    bad_harmful: ofSeverity("harmful"),
    bad_churn: ofSeverity("churn"),
    harmful_auto_accepted: { n: harmfulNegative.length, passed: harmfulAccepted, rate: ratio(harmfulAccepted, harmfulNegative.length) },
    good_rejected: { n: scored("good"), count: outcomes.good.reject, rate: ratio(outcomes.good.reject, scored("good")) },
    review_share: { n: all.length, count: all.filter((r) => r.outcome === "review").length, rate: ratio(all.filter((r) => r.outcome === "review").length, all.length) },
    precision: { value: ratio(passedGood, passedGood + passedBad), passed_good: passedGood, passed: passedGood + passedBad },
    outcomes,
    routes,
  };
}

/** The fields of the summary that come from the rows: how many ran, were scored and errored, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return { n_run: rows.length, n_scored: rows.length - failed, n_errored: failed, timeouts: rows.filter((r) => r.timed_out).length, metrics: metrics(rows) };
}
