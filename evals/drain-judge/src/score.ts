// The scorer of the drain-judge eval: the rule that turns akm's verdict on a labelled promotion into an outcome, and the outcomes into metrics. It is the SCORER part of
// the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The collector (collect.ts) builds each row by calling
// `makeRow` with the verdict it got, and scripts/rescore calls the same function with the verdict it reads back from a stored row.
//
// How the drain (akm's src/commands/proposal/drain.ts, `runJudgmentTier`) routes a verdict on a consolidate promotion:
//   accept      -> the promotion is accepted: promoted in `applyMode: promote`, staged for the next promote run in `queue` mode. Either way it is decided and goes in.
//   reject      -> rejected.
//   defer       -> left pending for a person, with the judge's reason.
//   unparseable -> left pending (`judgment-parse-failure`), and so is a judge call that failed (`judgment-error`).
// Only a promotion (source consolidate with a promotionSource) can be accepted; every case here is one, so an accept is always an accept. `routeOf` does not apply: this judge's
// verdict has a `decision`, not `pass` and `reviewNeeded`.

export type Category = "good" | "ephemeral" | "duplicate" | "stale";
/**
 * Where a case's source memory came from. `real`: a memory akm's extract wrote. `corpus`: a memory of another eval's corpus (written for that eval, promoted here by akm).
 * `constructed`: written by a model from a real or corpus memory, to be the bad kind. `hand-written`: written by hand for this eval.
 */
export type Origin = "real" | "corpus" | "constructed" | "hand-written";

/** What the drain sends the judge (akm's `JudgmentInput`), as `akm judge proposal.judgment` reads it. */
export interface Input {
  proposal: { ref: string; source: string; content: string };
  reason: "needs-judgment" | "proactive-needs-review";
  liveAsset?: string;
  siblings: { id: string; source: string; content: string }[];
  neighbours?: { ref: string; description: string; excerpt: string }[];
}

export interface Case {
  id: string;
  /** `promotion`: a consolidate promotion, the only kind the drain can accept. */
  kind: string;
  set: string;
  origin: Origin;
  label: "good" | "bad";
  category: Category;
  /** Why the label is right, in one line. */
  labelReason: string;
  /** The memory that this promotion was minted from, and the group of assets/bundle it is in. */
  memory: string;
  bundle: string;
  /** The real memory the case derives from. The cases of one family are all scored or all held out. */
  family: string;
  /** The input the drain builds for the promotion, frozen (see capture.ts). */
  input: Input;
  canary?: string;
}

export type Decision = "accept" | "reject" | "defer";
/** `unparseable`: the judge gave no decision akm could read. `error`: akm failed, timed out or the call failed; the row is left out of the counts. */
export type Outcome = Decision | "unparseable" | "error";

export interface Row {
  id: string;
  set: string;
  origin: Origin;
  label: "good" | "bad";
  category: Category;
  outcome: Outcome;
  /** The judge's reason (or akm's, for no decision). */
  reason: string;
  engine: string | null;
  seconds: number;
  error?: string;
  /** akm was killed at the time limit. The row is errored too. */
  timed_out?: true;
  /** What akm printed, as verdictOf kept it (see Raw). Not on a case that got none. */
  verdict?: unknown;
}

/**
 * The raw output of one case, in the fields `makeRow` reads. A stored row holds the same fields under the same names (`timedOut` is `timed_out`).
 * `verdict` is `{ outcome, decision, reason, engine, schemaVersion }` from the envelope `akm judge proposal.judgment --format json` printed; absent when akm gave none.
 */
export interface Raw {
  verdict?: unknown;
  seconds: number;
  error?: string;
  timedOut?: boolean;
}

type Scored = Pick<Case, "id" | "set" | "origin" | "label" | "category">;
const identity = (c: Scored, seconds: number) => ({ id: c.id, set: c.set, origin: c.origin, label: c.label, category: c.category, seconds });

/** A case with no verdict: akm failed, or was killed at the time limit (`timedOut`). */
export function errorRow(c: Scored, message: string, seconds: number, timedOut = false): Row {
  return { ...identity(c, seconds), outcome: "error", reason: "", engine: null, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

/** The row for a case: akm's verdict scored, or the error that left none. */
export function makeRow(c: Scored, raw: Raw): Row {
  if (raw.verdict === undefined) return errorRow(c, raw.error ?? "no verdict", raw.seconds, raw.timedOut === true);
  const v = raw.verdict as Record<string, unknown>;
  const reason = typeof v.reason === "string" ? v.reason : "";
  const engine = typeof v.engine === "string" ? v.engine : null;
  const base = { ...identity(c, raw.seconds), reason, engine, verdict: raw.verdict };
  if (v.outcome === "unparseable") return { ...base, outcome: "unparseable" };
  if (v.outcome === "verdict" && (v.decision === "accept" || v.decision === "reject" || v.decision === "defer")) return { ...base, outcome: v.decision };
  return { ...errorRow(c, reason || "the judge failed", raw.seconds), verdict: raw.verdict };
}

/**
 * The raw output of a stored row, or the names of the fields it lacks. A verdict without the judge's schemaVersion cannot be scored again: akm bumps it when the
 * verdict changes shape, and a version this scorer does not know means a different verdict.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (typeof row.seconds !== "number") missing.push("seconds");
  if (Object.hasOwn(row, "verdict")) {
    const v = row.verdict;
    if (typeof v !== "object" || v === null || Array.isArray(v) || typeof v.schemaVersion !== "number") missing.push("verdict.schemaVersion");
    return missing.length > 0 ? { missing } : { raw: { verdict: row.verdict, seconds: row.seconds } };
  }
  if (row.outcome !== "error") missing.push("verdict");
  else if (typeof row.error !== "string") missing.push("error");
  if (missing.length > 0) return { missing };
  return { raw: { error: row.error, seconds: row.seconds, timedOut: row.timed_out === true } };
}

/** A case that ended in an error has no verdict. Errored cases are left out of the counts; an unparseable reply is not an error: the drain leaves it pending, and it is counted. */
export const errored = (row: Row): boolean => row.outcome === "error";

/** Did the judge give a decision? An unparseable reply and an error did not. */
export const hasVerdict = (r: Row): boolean => r.outcome === "accept" || r.outcome === "reject" || r.outcome === "defer";

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

/** `count` of `n` cases, and the share. */
export interface Share {
  n: number;
  count: number;
  rate: number | null;
}
const share = (n: number, count: number): Share => ({ n, count, rate: ratio(count, n) });

const CATEGORIES: Category[] = ["good", "ephemeral", "duplicate", "stale"];
const OUTCOMES: Outcome[] = ["accept", "reject", "defer", "unparseable", "error"];
const BAD: Category[] = ["ephemeral", "duplicate", "stale"];

/** The numbers of a run over the cases it counts (all but the errored): what the drain would have accepted, rejected and left pending. */
export interface Metrics {
  /** Good promotions accepted, out of the good ones. Promotion's `recall`. */
  good_accepted: Share;
  /** THE HEADLINE. Bad promotions accepted (ephemeral, duplicate and stale together), out of the bad ones: what the drain would write with no one looking. Promotion's `bad_accepted`. */
  bad_accepted: Share;
  /** The same for each kind of bad. */
  by_category: Record<"ephemeral" | "duplicate" | "stale", Share>;
  /** Good promotions out of everything accepted. */
  precision: { value: number | null; accepted_good: number; accepted: number };
  /** Good promotions rejected: work lost. */
  good_rejected: Share;
  /** Per label, the share the judge deferred. A deferred promotion is not accepted: it waits for a person, so a deferred bad one is not counted as bad accepted. */
  defer_rate: Record<"good" | "bad", Share>;
  /** Per label, the share left pending: deferred, no decision (unparseable) or the call failed inside akm. */
  left_pending: Record<"good" | "bad", Share>;
  /** Each category by outcome. */
  confusion: Record<Category, Record<Outcome, number>>;
  /** What a judge that gave one answer for every case would score. Read the metrics next to them. */
  baselines: Record<"accept_all" | "reject_all" | "defer_all", { good_accepted: Share; bad_accepted: Share; precision: number | null }>;
  /** The shares of the cases run that errored and that were unparseable. */
  error_rate: Share;
  unparseable_rate: Share;
  /** Seconds of one call, over the cases that were not errored. */
  seconds: { mean: number | null; median: number | null; max: number | null };
}

export function metrics(rows: Row[]): Metrics {
  const counted = rows.filter((r) => !errored(r));
  const confusion = Object.fromEntries(CATEGORIES.map((c) => [c, Object.fromEntries(OUTCOMES.map((o) => [o, 0]))])) as Metrics["confusion"];
  for (const r of rows) confusion[r.category][r.outcome]++;
  const of = (label: "good" | "bad") => counted.filter((r) => r.label === label);
  const good = of("good");
  const bad = of("bad");
  const accepted = (rs: Row[]) => rs.filter((r) => r.outcome === "accept").length;
  const byCategory = Object.fromEntries(BAD.map((c) => {
    const mine = bad.filter((r) => r.category === c);
    return [c, share(mine.length, accepted(mine))];
  })) as Metrics["by_category"];
  const acceptedAll = accepted(counted);
  const left = (rs: Row[]) => rs.filter((r) => r.outcome === "defer" || r.outcome === "unparseable").length;
  const seconds = counted.map((r) => r.seconds).sort((a, b) => a - b);
  const mid = Math.floor(seconds.length / 2);
  const baseline = (accept: boolean) => ({
    good_accepted: share(good.length, accept ? good.length : 0),
    bad_accepted: share(bad.length, accept ? bad.length : 0),
    precision: accept ? ratio(good.length, counted.length) : null,
  });
  return {
    good_accepted: share(good.length, accepted(good)),
    bad_accepted: share(bad.length, accepted(bad)),
    by_category: byCategory,
    precision: { value: ratio(accepted(good), acceptedAll), accepted_good: accepted(good), accepted: acceptedAll },
    good_rejected: share(good.length, good.filter((r) => r.outcome === "reject").length),
    defer_rate: { good: share(good.length, good.filter((r) => r.outcome === "defer").length), bad: share(bad.length, bad.filter((r) => r.outcome === "defer").length) },
    left_pending: { good: share(good.length, left(good)), bad: share(bad.length, left(bad)) },
    confusion,
    baselines: { accept_all: baseline(true), reject_all: baseline(false), defer_all: baseline(false) },
    error_rate: share(rows.length, rows.length - counted.length),
    unparseable_rate: share(rows.length, rows.filter((r) => r.outcome === "unparseable").length),
    seconds: {
      mean: seconds.length === 0 ? null : Number((seconds.reduce((a, b) => a + b, 0) / seconds.length).toFixed(1)),
      median: seconds.length === 0 ? null : seconds.length % 2 ? (seconds[mid] as number) : Number((((seconds[mid - 1] as number) + (seconds[mid] as number)) / 2).toFixed(1)),
      max: seconds.length === 0 ? null : (seconds.at(-1) as number),
    },
  };
}

/** The fields of the summary that come from the rows: how many ran, were scored and errored, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return { n_run: rows.length, n_scored: rows.length - failed, n_errored: failed, timeouts: rows.filter((r) => r.timed_out).length, metrics: metrics(rows) };
}
