// The scorer of the pair-judge eval: the rule that turns akm's verdict on a labelled pair of notes into an outcome, and the outcomes into metrics.
// It is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The collector
// (collect.ts) builds each row by calling `makeRow` with the verdict it got, and scripts/rescore calls the same function with the verdict it reads
// back from a stored row, so a fix to the rule, or a relabelled case, scores every stored run again.
//
// A fix here applies to stored runs too: scripts/rescore scores them again from their raw outputs.

export type Side = "a" | "b";

/** One note of a pair as the judge reads it (`PairNote` in akm's consolidate/pair-pass.ts). */
export interface PairNote {
  ref: string;
  type: string;
  created: string;
  updated: string;
  /** The whole note file: frontmatter and body. */
  content: string;
}

/** The three relations the judge prints (`PairJudgeVerdict.relation`): it derives them from its two claim lists. */
export type Relation = "duplicate" | "subsumed" | "overlap";

export interface Case {
  id: string;
  /** What the pair was built to be: duplicate, subsumed, supersedes, contradicts, overlap or lookalike (assets/README.md). Not what the judge is asked. */
  kind: string;
  /** Where the pair came from: `pairs` (consolidate's per-pair cases), `pool` (its pool), `hand` (written for this eval). */
  set: string;
  /** `pair-pass`: the pair is what akm's pass sent its judge on a real run; `hand-written`: written here, for a harm the real runs do not produce. */
  source: "pair-pass" | "hand-written";
  /** The judge's input as the pass builds it: `a` is the older note (with equal dates, the pass's initiator). */
  a: PairNote;
  b: PairNote;
  /** The sides akm may retire without losing a claim the other note lacks: both for a duplicate, one for a subsumed pair or a replaced value, none otherwise. */
  safe: Side[];
  /** The claims the judge should list: a durable claim of this note that the other neither states nor replaces. Each is word for word in its own note. */
  only_a: string[];
  only_b: string[];
  /** Why this label, in a line. */
  labelReason: string;
  canary?: string;
}

/** The relation the judge should print: its two lists empty (duplicate), one empty (subsumed), neither (overlap). A side is safe exactly when its list is empty. */
export const expectedRelation = (c: Pick<Case, "safe">): Relation => (c.safe.length === 2 ? "duplicate" : c.safe.length === 1 ? "subsumed" : "overlap");

const other = (s: Side): Side => (s === "a" ? "b" : "a");

/** What the scorer reads of the verdict `akm judge consolidate.pair` printed (`PairJudgeVerdict`). */
export interface Verdict {
  onlyInA: string[];
  onlyInB: string[];
  relation: string;
  redundant: "A" | "B" | null;
  confidence: number;
  reason?: string;
  engine?: string | null;
  schemaVersion?: number;
}

const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

/** Is this a verdict with the fields the scorer reads? Anything else is akm printing something this eval does not read. */
export const isVerdict = (x: unknown): x is Verdict => {
  const v = x as Record<string, unknown> | null;
  return typeof v === "object" && v !== null && isStrings(v.onlyInA) && isStrings(v.onlyInB) && typeof v.relation === "string" && (v.redundant === "A" || v.redundant === "B" || v.redundant === null) && typeof v.confidence === "number";
};

/**
 * The note akm's consolidate retires on this verdict, or null: `decideRetirement` of its pair-pass.ts (a `duplicate` or `supersedes` retires the older note, a
 * `subsumed` pair the side the verdict names as redundant, and only when the judge listed nothing that side holds alone), and then the owner rule of #1092: a knowledge
 * note is never replaced by a memory, so a retirement of one is turned round when the memory holds nothing the note lacks, and dropped when it does. `overlap`
 * (and `contradicts`, `unrelated`) retire nothing. The guards after the judge (a `.derived` memory whose parent exists, an earlier retirement in the same run, scope,
 * the continuity check) and the second look of `confirmNothingLost` need the bundle and another prompt: they are not the judge and are not scored.
 */
export function retiredSide(c: Pick<Case, "a" | "b">, v: Pick<Verdict, "relation" | "redundant" | "onlyInA" | "onlyInB">): Side | null {
  let retired: Side | null = null;
  if (v.relation === "duplicate" || v.relation === "supersedes") retired = "a";
  else if (v.relation === "subsumed" && v.redundant === "A") retired = "a";
  else if (v.relation === "subsumed" && v.redundant === "B") retired = "b";
  if (retired === null) return null;
  const only = (s: Side): string[] => (s === "a" ? v.onlyInA : v.onlyInB);
  if (only(retired).length > 0) return null;
  const successor = other(retired);
  if (c[retired].type === "knowledge" && c[successor].type === "memory") return only(successor).length > 0 ? null : successor;
  return retired;
}

// ---- the claim matcher ----------------------------------------------------------------------------------------------------------------

/** The words of a text: lower case, with markdown's backticks, quotes and asterisks and the punctuation around a word taken off (`LICENSE.txt,` is `license.txt`; `01:00` and `snake_case` stay whole). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`"'*]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}@#$~]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

/** Words that carry no claim: articles, prepositions, auxiliaries and the like. A claim is told from another by the words that are left. */
const STOP = new Set("a an the is are was were be been being to of in on at for and or it its that this these those as by with from because than then so if when which who".split(" "));

/** The words of a labelled claim that its own note has and the other note lacks, stop words aside: what a judge's item has to quote to be about that claim. */
export function distinctive(claim: string, otherNote: string): string[] {
  const there = new Set(words(otherNote));
  return [...new Set(words(claim))].filter((w) => !there.has(w) && !STOP.has(w));
}

/** Does a judge's item state the claim? When it holds at least a third (rounded up, and one at least) of the claim's distinctive words. A claim with none (two claims that differ in the order of their words) cannot be matched: see ClaimTally.unmatchable. */
export function matches(item: string, claim: string, otherNote: string): boolean {
  const need = distinctive(claim, otherNote);
  if (need.length === 0) return false;
  const have = new Set(words(item));
  return need.filter((w) => have.has(w)).length >= Math.ceil(need.length / 3);
}

/** What the judge's two lists came to against the labels (see tallyClaims). */
export interface ClaimTally {
  /** Labelled claims (of both sides) that an item can be matched to. */
  labelled: number;
  /** Labelled claims with no word that the other note lacks (they differ in word order only), which no item can be matched to; they are not in `labelled` or `found`. */
  unmatchable: number;
  /** Labelled claims that an item of the right list states. */
  found: number;
  /** Items listed in all. */
  listed: number;
  /** Items that state a labelled claim of the other note: on the wrong list. */
  wrong_side: number;
  /** Items that state no labelled claim. The labels name the claims that decide a pair, so some of these may be claims that are really there. */
  unlabelled: number;
}

/** Each item of a list is a labelled claim of its own side (found), of the other side (wrong side) or neither (unlabelled). */
export function tallyClaims(c: Pick<Case, "a" | "b" | "only_a" | "only_b">, v: Pick<Verdict, "onlyInA" | "onlyInB">): ClaimTally {
  const matchable = (claims: string[], against: string): number => claims.filter((claim) => distinctive(claim, against).length > 0).length;
  const labelled = matchable(c.only_a, c.b.content) + matchable(c.only_b, c.a.content);
  const tally: ClaimTally = { labelled, unmatchable: c.only_a.length + c.only_b.length - labelled, found: 0, listed: v.onlyInA.length + v.onlyInB.length, wrong_side: 0, unlabelled: 0 };
  const sides: [Side, string[]][] = [["a", v.onlyInA], ["b", v.onlyInB]];
  for (const [side, items] of sides) {
    // A claim of one note is distinctive against the other note.
    const mine = side === "a" ? c.only_a : c.only_b;
    const mineAgainst = side === "a" ? c.b.content : c.a.content;
    const theirs = side === "a" ? c.only_b : c.only_a;
    const theirsAgainst = side === "a" ? c.a.content : c.b.content;
    const found = new Set<number>();
    for (const item of items) {
      const hits = mine.map((claim, i) => (matches(item, claim, mineAgainst) ? i : -1)).filter((i) => i >= 0);
      if (hits.length > 0) hits.forEach((i) => found.add(i));
      else if (theirs.some((claim) => matches(item, claim, theirsAgainst))) tally.wrong_side++;
      else tally.unlabelled++;
    }
    tally.found += found.size;
  }
  return tally;
}

// ---- rows ---------------------------------------------------------------------------------------------------------------------------------

/**
 * What the pipeline does with the case. `retire`: a retire proposal is minted for a note. `keep`: the judge gave a verdict and nothing is retired. `failed`: the judge gave no
 * verdict (akm's `error` or `unparseable`): the pass counts a failed judgment, retires nothing, writes no ledger row for the initiator, and judges the pair again on a later
 * run. `error`: akm itself failed or was killed at the time limit, which says nothing of the judge; errored cases are left out of the counts.
 */
export type Outcome = "retire" | "keep" | "failed" | "error";

export interface Row {
  id: string;
  kind: string;
  set: string;
  source: string;
  safe: Side[];
  outcome: Outcome;
  /** The note retired, on `retire`. */
  retired: Side | null;
  /** On `retire`: was the retired note safe to retire? */
  retired_safe: boolean | null;
  expected: Relation;
  /** What the judge printed. Null when it gave no verdict. */
  relation: string | null;
  redundant: "A" | "B" | null;
  confidence: number | null;
  /** The relation is the labelled one and, for a subsumed pair, the redundant side is the safe one. Null with no verdict. */
  right: boolean | null;
  claims: ClaimTally | null;
  reason: string;
  engine: string | null;
  seconds: number;
  error?: string;
  /** akm was killed at the time limit. The row is errored too. */
  timed_out?: true;
  /** What akm printed, as the scorer read it (see Raw). Not on a case that got none. */
  verdict?: unknown;
  /** Why the judge gave no verdict, on `failed`. */
  no_verdict?: { outcome: string; reason: string };
}

/** The raw output of one case, in the fields `makeRow` reads. A stored row holds the same fields under the same names (`timedOut` is `timed_out`), so a row can be scored again (see `rawOf`). */
export interface Raw {
  /** The verdict akm printed, as verdictOf keeps it: the fields of `Verdict` with `reason`, `engine` and `schemaVersion`. */
  verdict?: unknown;
  /** The judge gave no verdict: akm's outcome (`error` or `unparseable`) and its reason. */
  noVerdict?: { outcome: string; reason: string };
  seconds: number;
  /** The message of a case that ended with nothing from akm. */
  error?: string;
  timedOut?: boolean;
}

type Scored = Pick<Case, "id" | "kind" | "set" | "source" | "safe" | "a" | "b" | "only_a" | "only_b">;

const identity = (c: Scored, seconds: number) => ({ id: c.id, kind: c.kind, set: c.set, source: c.source, safe: c.safe, expected: expectedRelation(c), seconds });
const none = { retired: null, retired_safe: null, relation: null, redundant: null, confidence: null, right: null, claims: null, reason: "", engine: null };

/** A case with nothing from akm: it failed, or was killed at the time limit (`timedOut`). */
export const errorRow = (c: Scored, message: string, seconds: number, timedOut = false): Row => ({ ...identity(c, seconds), ...none, outcome: "error", error: message, ...(timedOut ? { timed_out: true as const } : {}) });

/** The row for a case: akm's verdict scored, the judge's failure to give one, or the error that left neither. */
export function makeRow(c: Scored, raw: Raw): Row {
  if (raw.verdict === undefined) {
    if (raw.noVerdict) return { ...identity(c, raw.seconds), ...none, outcome: "failed", reason: raw.noVerdict.reason, no_verdict: raw.noVerdict };
    return errorRow(c, raw.error ?? "no verdict", raw.seconds, raw.timedOut === true);
  }
  if (!isVerdict(raw.verdict)) return errorRow(c, "the verdict has no onlyInA, onlyInB, relation, redundant and confidence", raw.seconds);
  const v = raw.verdict;
  const retired = retiredSide(c, v);
  const expected = expectedRelation(c);
  const right = v.relation === expected && (expected !== "subsumed" || v.redundant === (c.safe[0] === "a" ? "A" : "B"));
  return {
    ...identity(c, raw.seconds),
    outcome: retired === null ? "keep" : "retire",
    retired,
    retired_safe: retired === null ? null : c.safe.includes(retired),
    relation: v.relation,
    redundant: v.redundant,
    confidence: v.confidence,
    right,
    claims: tallyClaims(c, v),
    reason: typeof v.reason === "string" ? v.reason : "",
    engine: typeof v.engine === "string" ? v.engine : null,
    verdict: raw.verdict,
  };
}

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack one cannot be scored again
 * (scripts/rescore refuses it and names them). A verdict without the judge's schemaVersion is from an akm this eval did not check, and is not scored again.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (typeof row.seconds !== "number") missing.push("seconds");
  if (Object.hasOwn(row, "verdict")) {
    const v = row.verdict;
    if (typeof v === "object" && v !== null && !Array.isArray(v) && typeof v.schemaVersion !== "number") missing.push("verdict.schemaVersion");
    return missing.length > 0 ? { missing } : { raw: { verdict: row.verdict, seconds: row.seconds } };
  }
  if (row.outcome === "failed") {
    if (typeof row.no_verdict?.outcome !== "string" || typeof row.no_verdict?.reason !== "string") missing.push("no_verdict");
    return missing.length > 0 ? { missing } : { raw: { noVerdict: row.no_verdict, seconds: row.seconds } };
  }
  if (row.outcome !== "error") missing.push("verdict");
  else if (typeof row.error !== "string") missing.push("error");
  if (missing.length > 0) return { missing };
  return { raw: { error: row.error, seconds: row.seconds, timedOut: row.timed_out === true } };
}

/** A case that ended in an error has no verdict from the judge, and says nothing of it. Errored cases are left out of the counts. */
export const errored = (row: Row): boolean => row.outcome === "error";

// ---- metrics ---------------------------------------------------------------------------------------------------------------------------------

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));
const mean = (xs: number[]): number | null => (xs.length === 0 ? null : Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(4)));

/** A count out of the cases it is counted over, and its share. */
export interface Share {
  n: number;
  count: number;
  rate: number | null;
}
const share = (count: number, n: number): Share => ({ n, count, rate: ratio(count, n) });

export interface KindCounts {
  n: number;
  failed: number;
  retired_safe: number;
  retired_unsafe: number;
  kept: number;
  /** Of the cases with a verdict, those with the labelled relation. */
  right: number;
}

export interface Metrics {
  /**
   * THE HEADLINE, target 0: retirements of a note that holds a claim the other lacks. Over the cases where one was possible (a pair with a note that is not safe to retire),
   * errored cases left out. A `failed` case retires nothing, so it is not counted here: read `failed` next to it.
   */
  unsafe: Share;
  /** Over the cases with a safe note (a duplicate, a subsumed pair, a replaced value): those where the judge led to retiring a safe one. A `failed` case found none. */
  found: Share;
  /** Of the retirements proposed, the share that were safe. */
  precision: { value: number | null; safe: number; retired: number };
  /** The judge gave no verdict (`error` or `unparseable`), out of the cases akm did not fail on. */
  failed: Share;
  /** Of the cases with a verdict: those where the judge printed the labelled relation (and, for a subsumed pair, the labelled redundant side). */
  relation: Share;
  /** The expected relation (rows) by the relation the judge printed (columns), over the cases with a verdict. */
  confusion: Record<string, Record<string, number>>;
  by_kind: Record<string, KindCounts>;
  /** The claim lists against the labels, over the cases with a verdict. `found_rate` is found / labelled. */
  claims: ClaimTally & { found_rate: number | null };
  /** The judge's `confidence` on verdicts with the labelled relation (right) and on the others (wrong). */
  confidence: { right: { n: number; mean: number | null }; wrong: { n: number; mean: number | null } };
  /** Seconds a call took, over the cases that did not error. */
  seconds: { n: number; mean: number | null };
  /** What trivial rules score on these cases: they read the labels and no note. */
  baselines: {
    /** Never retires, as `unrelated` does: nothing unsafe, nothing found. */
    never_retire: { unsafe: Share; found: Share };
    /** Retires the older note of every pair, as consolidate's README does for its baseline. */
    always_retire_older: { unsafe: Share; found: Share };
    /** Always prints the relation that is most common among the labels. */
    most_common_relation: { relation: string | null; accuracy: Share };
  };
}

/** The numbers the eval reports, over the cases akm did not fail on. */
export function metrics(rows: Row[]): Metrics {
  const run = rows.filter((r) => r.outcome !== "error");
  const verdicts = run.filter((r) => r.outcome === "retire" || r.outcome === "keep");
  const exposed = run.filter((r) => r.safe.length < 2);
  const retirable = run.filter((r) => r.safe.length > 0);
  const retired = run.filter((r) => r.outcome === "retire");
  const safeRetired = retired.filter((r) => r.retired_safe).length;

  const confusion: Metrics["confusion"] = {};
  for (const r of verdicts) {
    const row = (confusion[r.expected] ??= {});
    row[r.relation as string] = (row[r.relation as string] ?? 0) + 1;
  }
  const by_kind: Metrics["by_kind"] = {};
  for (const r of run) {
    const k = (by_kind[r.kind] ??= { n: 0, failed: 0, retired_safe: 0, retired_unsafe: 0, kept: 0, right: 0 });
    k.n++;
    if (r.outcome === "failed") k.failed++;
    else if (r.outcome === "keep") k.kept++;
    else if (r.retired_safe) k.retired_safe++;
    else k.retired_unsafe++;
    if (r.right) k.right++;
  }
  const claims = verdicts.reduce<ClaimTally>((t, r) => {
    const c = r.claims as ClaimTally;
    return { labelled: t.labelled + c.labelled, unmatchable: t.unmatchable + c.unmatchable, found: t.found + c.found, listed: t.listed + c.listed, wrong_side: t.wrong_side + c.wrong_side, unlabelled: t.unlabelled + c.unlabelled };
  }, { labelled: 0, unmatchable: 0, found: 0, listed: 0, wrong_side: 0, unlabelled: 0 });
  const confidenceOf = (right: boolean) => {
    const xs = verdicts.filter((r) => r.right === right).map((r) => r.confidence as number);
    return { n: xs.length, mean: mean(xs) };
  };
  const expectedCount = new Map<string, number>();
  for (const r of verdicts) expectedCount.set(r.expected, (expectedCount.get(r.expected) ?? 0) + 1);
  const common = [...expectedCount.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
  const olderUnsafe = exposed.filter((r) => !r.safe.includes("a")).length;
  const olderFound = retirable.filter((r) => r.safe.includes("a")).length;
  return {
    unsafe: share(retired.filter((r) => !r.retired_safe).length, exposed.length),
    found: share(retirable.filter((r) => r.outcome === "retire" && r.retired_safe).length, retirable.length),
    precision: { value: ratio(safeRetired, retired.length), safe: safeRetired, retired: retired.length },
    failed: share(run.filter((r) => r.outcome === "failed").length, run.length),
    relation: share(verdicts.filter((r) => r.right).length, verdicts.length),
    confusion,
    by_kind,
    claims: { ...claims, found_rate: ratio(claims.found, claims.labelled) },
    confidence: { right: confidenceOf(true), wrong: confidenceOf(false) },
    seconds: { n: run.length, mean: mean(run.map((r) => r.seconds)) },
    baselines: {
      never_retire: { unsafe: share(0, exposed.length), found: share(0, retirable.length) },
      always_retire_older: { unsafe: share(olderUnsafe, exposed.length), found: share(olderFound, retirable.length) },
      most_common_relation: { relation: common?.[0] ?? null, accuracy: share(common?.[1] ?? 0, verdicts.length) },
    },
  };
}

/** The fields of the summary that come from the rows: how many ran, were scored and errored, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return { n_run: rows.length, n_scored: rows.length - failed, n_errored: failed, timeouts: rows.filter((r) => r.timed_out).length, metrics: metrics(rows) };
}
