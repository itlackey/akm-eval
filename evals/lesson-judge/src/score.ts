// The scorer of the lesson-judge eval: the rule that turns akm's verdict on a labelled lesson into the route akm's distill takes, and the routes into
// metrics. It is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The
// collector (collect.ts) builds each row by calling `makeRow` with the verdict it got, and scripts/rescore calls the same function with the verdict it
// reads back from a stored row.
//
// The routes are distill's (src/commands/improve/distill.ts), which differ by mode:
//   new lesson (`judgeAndQueue`): `pass` is queued for a person (`distill-review`), `reviewNeeded` is queued for a person too (`review_needed`,
//     deferred), and anything else is refused (`quality_rejected`, a rejection window). That is `routeOf`.
//   update (`proposeLessonUpdate`): `pass` alone queues the update (`distill-update`, for a person). Any other verdict, or none, ends the update
//     (`update_rejected`), so review and reject are one route and the verdict's `reviewNeeded` is not read.
// A judge that gave no verdict (`error`, `unparseable`) is what distill's `noVerdict` makes it: pass false, score -1, reviewNeeded. A new lesson goes to
// review; an update, which does not read reviewNeeded, is rejected.

import { type Route, routeOf } from "../../../lib/judge.ts";

export const MODES = ["new", "update"] as const;
export type Mode = (typeof MODES)[number];

/**
 * What a bad lesson gets wrong, by the criterion the judge's prompt scores it on (assets/README.md):
 * - `dated-status`: only records what was done, shipped, decided or is pending, on a date or for one build or system (REUSABLE);
 * - `one-run`: the source is one run's report whose cause is only suspected, and the lesson makes the suspicion a cause or a rule (REUSABLE);
 * - `duplicate-asset`: a listed asset already states the rule (NON-REDUNDANCY, new lessons);
 * - `ungrounded`: a statement, or a dropped limit, that the source and the feedback do not carry (GROUNDING);
 * - `restated-update`: an update whose added lines only say again what the lesson says (NON-REDUNDANCY, updates);
 * - `off-rule-update`: an update whose added lines replace or contradict the rule, are on another subject, or only record who, when or what shipped (REUSABLE, updates).
 */
export const KINDS = ["dated-status", "one-run", "duplicate-asset", "ungrounded", "restated-update", "off-rule-update"] as const;
export type Kind = (typeof KINDS)[number];

/** The criteria of the judge's verdict, in its order. */
export const CRITERIA = ["reusable", "nonRedundancy", "grounding"] as const;

/** What `akm judge distill.lesson` takes on stdin (LessonJudgeInput in akm's stage.ts). A case holds exactly this, as the pipeline built it. */
export interface JudgeInput {
  lesson: string;
  source: string;
  feedback?: string[];
  related?: { ref: string; content: string }[];
  extending?: string;
}

export interface Case {
  id: string;
  /** `update` when the input has `extending`, else `new`: the judge reads the two with different criteria and distill routes them differently. */
  mode: Mode;
  label: "good" | "bad";
  /** Only on bad cases. See Kind. */
  kind?: Kind;
  /** One line: why the label, against the judge's own rubric. For the adjudicator. */
  labelReason: string;
  /** Where the input came from. `real`: captured from `akm improve` (capture.ts) on the akm of assets/README.md. `hand-written`: written for a kind real runs did not produce. */
  origin: "real" | "hand-written";
  /** The distill eval's case whose memory the input was made from. */
  from: string;
  /** The memory's ref in the library the run used: akm's `inputRef`, which its lesson checks name. */
  memory: string;
  input: JudgeInput;
  canary?: string;
}

export type Outcome = Route | "error";

/** Why a verdict is absent: akm printed `error` (the judge call failed) or `unparseable` (the reply held no verdict). */
export type NoVerdict = "error" | "unparseable";

export interface Row {
  id: string;
  mode: Mode;
  label: "good" | "bad";
  /** The route distill takes: for an update `pass` or `reject` only. `error` is akm failing (no envelope), and is left out of the counts. */
  outcome: Outcome;
  score: number | null;
  criteria: Record<string, number> | null;
  reason: string;
  runner: string | null;
  seconds: number;
  kind?: Kind;
  /** The case's origin, so the metrics can keep real and hand-written cases apart. */
  origin?: Case["origin"];
  /** Set when the judge gave no verdict. The row is routed as distill routes it, and `score` is null. */
  no_verdict?: NoVerdict;
  error?: string;
  /** akm was killed at the time limit. The row is errored too. */
  timed_out?: true;
  /** What akm printed, as the scorer read it (see Raw). */
  verdict?: unknown;
}

/**
 * The raw output of one case, in the fields `makeRow` reads. A stored row holds the same fields under the same names (`timedOut` is `timed_out`).
 */
export interface Raw {
  /**
   * What `akm judge distill.lesson --format json` printed, as verdictOf reads it: `judge_outcome` (`verdict`, `error` or `unparseable`), and on a verdict
   * `pass`, `score`, `reviewNeeded`, `reason` and `criteria`; `runner` and `schemaVersion`. Absent when akm gave none: it failed, or was killed at the time limit.
   */
  verdict?: unknown;
  seconds: number;
  error?: string;
  timedOut?: boolean;
}

type Scored = Pick<Case, "id" | "mode" | "label" | "kind"> & Partial<Pick<Case, "origin">>;

/** The route distill takes for a verdict that has one. */
export const routeFor = (mode: Mode, v: { pass?: unknown; reviewNeeded?: unknown }): Route => (mode === "update" ? (v.pass === true ? "pass" : "reject") : routeOf(v));

const identity = (c: Scored, seconds: number) => ({ id: c.id, mode: c.mode, label: c.label, seconds, ...(c.kind ? { kind: c.kind } : {}), ...(c.origin ? { origin: c.origin } : {}) });

/** The route of the verdict `akm judge distill.lesson --format json` printed, or the no-verdict reading of its `error` or `unparseable` outcome. */
export function rowFromVerdict(c: Scored, verdict: unknown, seconds: number): Row {
  const v = (verdict ?? {}) as Record<string, unknown>;
  const base = identity(c, seconds);
  const runner = typeof v.runner === "string" ? v.runner : null;
  const reason = typeof v.reason === "string" ? v.reason : "";
  if (v.judge_outcome === "error" || v.judge_outcome === "unparseable") {
    return { ...base, outcome: routeFor(c.mode, { pass: false, reviewNeeded: true }), score: null, criteria: null, reason, runner, no_verdict: v.judge_outcome };
  }
  if (typeof v.pass !== "boolean" || typeof v.score !== "number") {
    return { ...base, outcome: "error", score: null, criteria: null, reason: "", runner, error: "the verdict has no pass and score" };
  }
  const criteria = v.criteria && typeof v.criteria === "object" ? (v.criteria as Record<string, number>) : null;
  return { ...base, outcome: routeFor(c.mode, v), score: v.score, criteria, reason, runner };
}

/** A case with no envelope from akm: it failed, or was killed at the time limit (`timedOut`). */
export function errorRow(c: Scored, message: string, seconds: number, timedOut = false): Row {
  return { ...identity(c, seconds), outcome: "error", score: null, criteria: null, reason: "", runner: null, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

/** The row for a case: akm's verdict scored, or the error that left none. */
export function makeRow(c: Scored, raw: Raw): Row {
  if (raw.verdict === undefined) return errorRow(c, raw.error ?? "no verdict", raw.seconds, raw.timedOut === true);
  return { ...rowFromVerdict(c, raw.verdict, raw.seconds), verdict: raw.verdict };
}

/** Did the judge give a verdict on the case? */
export const hasVerdict = (r: Row): boolean => r.score !== null;

/**
 * The raw output of a stored row, or the names of the fields it lacks (scripts/rescore refuses a run that lacks one). A verdict without the judge's
 * `schemaVersion` is not read: a later schema may mean something else.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (typeof row.seconds !== "number") missing.push("seconds");
  if (Object.hasOwn(row, "verdict")) {
    const v = row.verdict;
    if (typeof v === "object" && v !== null && !Array.isArray(v) && typeof v.schemaVersion !== "number") missing.push("verdict.schemaVersion");
    return missing.length > 0 ? { missing } : { raw: { verdict: row.verdict, seconds: row.seconds } };
  }
  if (row.outcome !== "error") missing.push("verdict");
  else if (typeof row.error !== "string") missing.push("error");
  if (missing.length > 0) return { missing };
  return { raw: { error: row.error, seconds: row.seconds, timedOut: row.timed_out === true } };
}

/** A case that ended in an error has no envelope from akm. Errored cases are left out of the counts. */
export const errored = (row: Row): boolean => row.outcome === "error";

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

/** How many cases the judge was scored on, how many of those it passed, and the share. */
export interface Rate {
  n: number;
  passed: number;
  rate: number | null;
}

/** A count out of the cases scored, and its share. */
export interface Share {
  n: number;
  count: number;
  rate: number | null;
}

/** The mean of a criterion over the rows that have a verdict, and how many those are. */
export interface Mean {
  n: number;
  mean: number | null;
}

type PerMode<T> = Record<Mode, T>;

export interface Metrics {
  /** Good lessons passed, by mode. */
  good: PerMode<Rate>;
  /** Bad lessons passed, by mode. THE HEADLINE: each pass is a bad lesson put before a person to accept. */
  bad: PerMode<Rate>;
  /** good and bad, by the cases' origin: real pipeline output and hand-written writer replies, so a rate is not carried by the hand-written cases. */
  by_origin: Record<"real" | "hand-written", { good: PerMode<Rate>; bad: PerMode<Rate> }>;
  /** Bad lessons passed, by `<mode>/<kind>`, for the kinds the set holds. */
  bad_by_kind: Record<string, Rate>;
  /** Good lessons refused outright: work lost, and (new lessons) a rejection window. */
  good_rejected: PerMode<Share>;
  /** The new lessons routed to review. An update has no review route. */
  review_share: Share;
  /** Of everything passed, the share that was good, by mode. */
  precision: PerMode<{ value: number | null; passed_good: number; passed: number }>;
  /** Each criterion's mean score on the good and on the bad cases with a verdict, by mode: which criterion tells them apart. */
  criteria: PerMode<Record<"good" | "bad", Record<string, Mean>>>;
  /** Each route by `<mode>/<good|kind>`. */
  routes: Record<string, Record<"pass" | "review" | "reject", number>>;
  /** The judge gave no verdict: the share of all cases it was called on that came back `error` or `unparseable`, and how many of each. */
  no_verdict: { error: Share; unparseable: Share };
  /** Cases with no envelope from akm (it failed, or was killed). Left out of everything else. */
  akm_failed: Share;
  seconds: { mean: number | null; median: number | null; max: number | null };
  /** What a judge that passes everything, and one that refuses everything, would score on the same cases. */
  baselines: { pass_all: PerMode<{ good: Rate; bad: Rate; precision: number | null }>; reject_all: PerMode<{ good: Rate; bad: Rate; precision: number | null }> };
}

const MODE_LIST: readonly Mode[] = MODES;

const perMode = <T>(f: (m: Mode) => T): PerMode<T> => ({ new: f("new"), update: f("update") });

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)));

/** The numbers the eval reports, over the cases akm gave an envelope for. */
export function metrics(rows: Row[]): Metrics {
  const scored = rows.filter((r) => r.outcome !== "error");
  const of = (mode: Mode, label: "good" | "bad") => scored.filter((r) => r.mode === mode && r.label === label);
  const rate = (rs: Row[]): Rate => {
    const passed = rs.filter((r) => r.outcome === "pass").length;
    return { n: rs.length, passed, rate: ratio(passed, rs.length) };
  };
  const rejected = (rs: Row[]): Share => {
    const count = rs.filter((r) => r.outcome === "reject").length;
    return { n: rs.length, count, rate: ratio(count, rs.length) };
  };
  const kinds = [...new Set(scored.filter((r) => r.label === "bad" && r.kind).map((r) => `${r.mode}/${r.kind}`))].sort();
  const bad_by_kind = Object.fromEntries(kinds.map((k) => [k, rate(scored.filter((r) => r.label === "bad" && `${r.mode}/${r.kind}` === k))]));
  const routes: Metrics["routes"] = {};
  for (const r of scored) {
    const key = `${r.mode}/${r.label === "good" ? "good" : (r.kind ?? "bad")}`;
    routes[key] ??= { pass: 0, review: 0, reject: 0 };
    (routes[key] as Record<Route, number>)[r.outcome as Route]++;
  }
  const criteriaOf = (rs: Row[]): Record<string, Mean> =>
    Object.fromEntries(
      CRITERIA.map((k) => {
        const xs = rs.flatMap((r) => (r.criteria && typeof r.criteria[k] === "number" ? [r.criteria[k] as number] : []));
        return [k, { n: xs.length, mean: mean(xs) }];
      }),
    );
  const news = scored.filter((r) => r.mode === "new");
  const noVerdict = (kind: NoVerdict): Share => {
    const count = scored.filter((r) => r.no_verdict === kind).length;
    return { n: scored.length, count, rate: ratio(count, scored.length) };
  };
  const times = rows.map((r) => r.seconds).sort((a, b) => a - b);
  const baseline = (passAll: boolean) =>
    perMode((m) => {
      const good = of(m, "good").length;
      const bad = of(m, "bad").length;
      const g = { n: good, passed: passAll ? good : 0, rate: ratio(passAll ? good : 0, good) };
      const b = { n: bad, passed: passAll ? bad : 0, rate: ratio(passAll ? bad : 0, bad) };
      return { good: g, bad: b, precision: passAll ? ratio(good, good + bad) : null };
    });
  return {
    good: perMode((m) => rate(of(m, "good"))),
    bad: perMode((m) => rate(of(m, "bad"))),
    by_origin: {
      real: { good: perMode((m) => rate(of(m, "good").filter((r) => r.origin === "real"))), bad: perMode((m) => rate(of(m, "bad").filter((r) => r.origin === "real"))) },
      "hand-written": { good: perMode((m) => rate(of(m, "good").filter((r) => r.origin === "hand-written"))), bad: perMode((m) => rate(of(m, "bad").filter((r) => r.origin === "hand-written"))) },
    },
    bad_by_kind,
    good_rejected: perMode((m) => rejected(of(m, "good"))),
    review_share: { n: news.length, count: news.filter((r) => r.outcome === "review").length, rate: ratio(news.filter((r) => r.outcome === "review").length, news.length) },
    precision: perMode((m) => {
      const passedGood = of(m, "good").filter((r) => r.outcome === "pass").length;
      const passedBad = of(m, "bad").filter((r) => r.outcome === "pass").length;
      return { value: ratio(passedGood, passedGood + passedBad), passed_good: passedGood, passed: passedGood + passedBad };
    }),
    criteria: perMode((m) => ({ good: criteriaOf(of(m, "good").filter(hasVerdict)), bad: criteriaOf(of(m, "bad").filter(hasVerdict)) })),
    routes,
    no_verdict: { error: noVerdict("error"), unparseable: noVerdict("unparseable") },
    akm_failed: { n: rows.length, count: rows.length - scored.length, rate: ratio(rows.length - scored.length, rows.length) },
    seconds: { mean: mean(times), median: times.length === 0 ? null : (times[Math.floor((times.length - 1) / 2)] as number), max: times.length === 0 ? null : (times[times.length - 1] as number) },
    baselines: { pass_all: baseline(true), reject_all: baseline(false) },
  };
}

/** The fields of the summary that come from the rows: how many ran, were scored and errored, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return { n_run: rows.length, n_scored: rows.length - failed, n_errored: failed, timeouts: rows.filter((r) => r.timed_out).length, metrics: metrics(rows) };
}
