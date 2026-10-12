// The scorer of the promotion eval: what the drain's judgment tier did with a proposal, as a row with the proposal's label, and the rows as
// metrics. It is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The
// collector (collect.ts) builds each row by calling `makeRow` with the outcome the drain gave, and scripts/rescore calls the same function with
// the outcome it reads back from a stored row, so a fix here scores every stored run again.
//
// A change to this file changes what the eval scores. It is a measurement change: bump the scorer in MEASUREMENT.lock
// (scripts/measurement/run bump promotion scorer --reason "...") and update the golden files (golden/) in the same change.

export const BAD = ["duplicate", "stale", "ephemeral"] as const;
export type Bad = (typeof BAD)[number];

export interface Case {
  id: string;
  label: "good" | "bad";
  /** `good`, or what is wrong with a bad proposal. */
  category: "good" | Bad;
  /** Where the note would be written: `knowledge/<name>`. */
  ref: string;
  /** The proposed note, frontmatter and body: what the drain's judge reads. */
  content: string;
  labelReason?: string;
}

/** What the drain's judgment tier did with a proposal. `defer` leaves it for a person. */
export type Outcome = "accept" | "reject" | "defer" | "error";

export interface Row {
  id: string;
  label: Case["label"];
  category: Case["category"];
  ref: string;
  outcome: Outcome;
  /** The judge's reason. akm keeps it only for a rejection. */
  reason: string;
  error?: string;
  /** The error says the model call timed out. Absent on every other row. */
  timed_out?: true;
}

/**
 * The raw output of one proposal: what the drain did with it, and nothing the scorer decides. `outcome` and `reason` are the fields a row stores
 * under the same names, and `error` is the message of a call that failed, so a stored row holds everything `makeRow` reads (see `rawOf`).
 */
export interface Raw {
  outcome: Outcome;
  /** The judge's reason, with the model endpoint written as <MODEL_BASE_URL>. Empty when akm kept none, and for an error. */
  reason: string;
  /** Why the proposal has no verdict: a failed model call or a drain that failed, or "the drain did not list the proposal". Set with the outcome `error`. */
  error?: string;
}

/**
 * Does the text of a failed model call say it timed out? The failures here come from akm's drain, which words them as it likes, so
 * this reads "timed out", "timeout" and the like in any case. An akm command that the eval itself kills for running too long ends the
 * run with a message that says so, and is not a row.
 */
export const timedOutText = (text: string): boolean => /\btime(?:d)?[ -]?outs?\b/i.test(text);

/** A row for a proposal: the raw output with the proposal's label and category. An error has no verdict, and is told apart from a timeout by its text. */
export function makeRow(c: Case, raw: Raw): Row {
  const base = { id: c.id, label: c.label, category: c.category, ref: c.ref, reason: "" };
  if (raw.outcome === "error") {
    const error = raw.error ?? "";
    return { ...base, outcome: "error", error, ...(timedOutText(error) ? { timed_out: true as const } : {}) };
  }
  return { ...base, reason: raw.reason, outcome: raw.outcome };
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface Metrics {
  /** The proposals that ran without an error, and how many of them are good. */
  proposals: { n: number; good: number; share_good: number | null };
  /** What the judge accepted, and how many of those were good. */
  accepted: { n: number; good: number };
  /** Of the good proposals, the share accepted. */
  recall: { value: number | null; accepted: number; of: number };
  /** Of the accepted proposals, the share that were good. */
  precision: { value: number | null; good: number; of: number };
  /** Of the bad proposals, the share accepted, in all and by category. */
  bad_accepted: { value: number | null; accepted: number; of: number };
  by_category: Record<Bad, { n: number; accepted: number; rate: number | null }>;
  outcomes: Record<"good" | "bad", Record<Outcome, number>>;
}

/** The numbers the eval reports, over the cases that ran without an error. */
export function metrics(rows: Row[]): Metrics {
  const outcomes = { good: { accept: 0, reject: 0, defer: 0, error: 0 }, bad: { accept: 0, reject: 0, defer: 0, error: 0 } };
  for (const r of rows) outcomes[r.label][r.outcome]++;
  const scored = rows.filter((r) => r.outcome !== "error");
  const accepted = scored.filter((r) => r.outcome === "accept");
  const good = scored.filter((r) => r.label === "good");
  const bad = scored.filter((r) => r.label === "bad");
  const acceptedGood = accepted.filter((r) => r.label === "good").length;
  const acceptedBad = accepted.length - acceptedGood;
  const by_category = Object.fromEntries(
    BAD.map((category) => {
      const of = bad.filter((r) => r.category === category);
      const n = of.filter((r) => r.outcome === "accept").length;
      return [category, { n: of.length, accepted: n, rate: ratio(n, of.length) }];
    }),
  ) as Metrics["by_category"];
  return {
    proposals: { n: scored.length, good: good.length, share_good: ratio(good.length, scored.length) },
    accepted: { n: accepted.length, good: acceptedGood },
    recall: { value: ratio(acceptedGood, good.length), accepted: acceptedGood, of: good.length },
    precision: { value: ratio(acceptedGood, accepted.length), good: acceptedGood, of: accepted.length },
    bad_accepted: { value: ratio(acceptedBad, bad.length), accepted: acceptedBad, of: bad.length },
    by_category,
    outcomes,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

// --- Scoring a stored row again -----------------------------------------------------------------------------------

const OUTCOMES: readonly Outcome[] = ["accept", "reject", "defer", "error"];

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack
 * one cannot be scored again (scripts/rescore refuses it and names them). Rows written before the manifest hold all of these.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (!OUTCOMES.includes(row.outcome)) missing.push("outcome");
  if (row.outcome !== "error" && typeof row.reason !== "string") missing.push("reason");
  if (row.outcome === "error" && typeof row.error !== "string") missing.push("error");
  if (missing.length > 0) return { missing };
  return { raw: { outcome: row.outcome, reason: typeof row.reason === "string" ? row.reason : "", ...(row.outcome === "error" ? { error: row.error } : {}) } };
}

/** A proposal whose model call failed has no verdict. */
export const errored = (row: Row): boolean => row.outcome === "error";

/** The fields of the summary that come from the rows: how many ran and errored, how many errors were timeouts, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_errored: number; timeouts: number; metrics: Metrics } {
  return { n_run: rows.length, n_errored: rows.filter(errored).length, timeouts: rows.filter((r) => r.timed_out).length, metrics: metrics(rows) };
}
