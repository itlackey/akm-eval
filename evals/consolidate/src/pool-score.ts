// The scorer of `consolidate --pool`: how the retirements akm proposed for a whole pool of notes are judged against the pool's labels, and how
// the clusters' rows become metrics. It is pure and needs no akm, like score.ts. A pool run is one `akm improve`, scored one cluster at a time:
// each cluster is a case. The raw output of the run is the same for every cluster (`run`), and each cluster's row holds it beside its own
// retire proposals, so that a stored run can be scored again. Nothing here may import the collector.

import { type PairPass, type RetireProposal, type UsageRow, nameOfRef, servedModels } from "./score.ts";

export const KINDS = ["duplicate", "triple", "subsumed", "supersedes", "overlap", "contradicts", "lookalike", "single"] as const;
export type Kind = (typeof KINDS)[number];

export interface PoolClaim {
  notes: string[]; // the notes of the cluster that hold the claim; it is word for word in these and in no other note of the cluster
  text: string;
}

export interface Cluster {
  id: string;
  kind: Kind;
  notes: string[];
  /** For each note that may be retired, the notes it may be retired for. A note not listed holds a claim no other note has. */
  retire: Record<string, string[]>;
  claims: PoolClaim[];
  why: string;
}

export interface Pool {
  canary?: string;
  clusters: Cluster[];
  texts: Record<string, string>; // note name -> the whole file
  ages: Record<string, number>; // note name -> days old when the run writes it
}

/** A cluster as the measurement holds it as a case: the cluster with the text and the age of its notes, and the digest of the whole pool it was run in. */
export interface PoolCase extends Cluster {
  texts: Record<string, string>;
  ages: Record<string, number>;
  /** Every cluster is run beside the rest of the pool, so a change to any note of it is a change to what akm saw for this one. */
  pool_sha256: string;
}

export type Verdict = "safe" | "unsafe" | "wrong_successor";

export interface Retirement {
  cluster: string;
  kind: Kind;
  retired: string;
  successor: string | null;
  verdict: Verdict;
  staged: boolean; // akm staged it, so a triage run accepts it with no one looking
  judged_as: string | null;
  reason: string;
  only_in_retired: string[] | null;
  only_in_successor: string[] | null;
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** A retirement is safe when the cluster allows it for that successor, wrong-successor when it allows the note but not that successor, and unsafe when the note holds a claim no other note has. */
export function judgeRetirement(pool: Pick<Pool, "clusters">, retired: string, successor: string | null): { cluster: Pick<Cluster, "id" | "kind" | "notes" | "retire">; verdict: Verdict } | undefined {
  const cluster = pool.clusters.find((c) => c.notes.includes(retired));
  if (!cluster) return undefined;
  const allowed = cluster.retire[retired];
  if (!allowed) return { cluster, verdict: "unsafe" };
  return { cluster, verdict: successor !== null && allowed.includes(successor) ? "safe" : "wrong_successor" };
}

const claimList = (x: unknown): string[] | null => (Array.isArray(x) && x.every((k) => typeof k === "string") ? x : null);

/** The retirements akm proposed, each judged against the labels. Throws on a retirement of something that is not in the pool. */
export function retirementsFrom(pool: Pick<Pool, "clusters">, proposals: RetireProposal[]): Retirement[] {
  return proposals.map((p) => {
    const retired = nameOfRef(p.retirement.retiredRef);
    const successor = p.retirement.successorRef ? nameOfRef(p.retirement.successorRef) : null;
    const j = judgeRetirement(pool, retired, successor);
    if (!j) throw new Error(`akm retired ${p.retirement.retiredRef}, which is not a note of the pool`);
    return {
      cluster: j.cluster.id,
      kind: j.cluster.kind,
      retired,
      successor,
      verdict: j.verdict,
      staged: p.gateDecision?.outcome === "staged",
      judged_as: p.retirement.judgeLabel ?? null,
      reason: p.retirement.judgeReason ?? "",
      only_in_retired: claimList(p.retirement.onlyInRetired),
      only_in_successor: claimList(p.retirement.onlyInSuccessor),
    };
  });
}

// --- What akm printed for the run ------------------------------------------------------------------------------

/** The raw output of the whole run, from akm's `improve` result: the same for every cluster. */
export interface RunRaw {
  /** akm's pair pass, or null when `improve` printed none. */
  pair_pass: (PairPass & { initiators?: number }) | null;
  /** The usage report's rows: the model calls of the run. */
  usage: UsageRow[];
  /** The promote pass: chunks it made and failed, memories it deferred, and operations it planned (not scored). */
  chunks: { totalChunks?: number; failedChunks?: number; deferredMemories?: number; planned?: number };
  /** Every warning akm printed for the consolidation. */
  warnings: string[];
  /** The refs of retire proposals that name a note which is not in the pool. */
  outside: string[];
  /** The wall time of the improve run. */
  seconds: number;
}

/**
 * The raw output of one cluster: its own retire proposals, and the run's. A run that ended before akm gave a result (a failed command, a
 * timeout) has an `error`, and the other fields are not there.
 */
export type PoolRaw = { error: string; timedOut?: boolean; seconds: number } | { run: RunRaw; retire_proposals: RetireProposal[] };

export type PoolOutcome = "kept" | "safe" | "unsafe" | "wrong_successor" | "error";

/** One line of samples.jsonl: what akm did with a cluster. `outcome` is the worst verdict, or "kept" when akm proposed nothing. */
export interface PoolRow {
  id: string;
  kind: Kind;
  notes: string[];
  may_retire: string[];
  outcome: PoolOutcome;
  retirements: Omit<Retirement, "cluster" | "kind">[];
  error?: string;
  timed_out?: true;
  seconds?: number;
  // The raw output, kept so that the row can be scored again. `run` is null for a run that ended before akm gave a result:
  run: RunRaw | null;
  retire_proposals?: RetireProposal[];
}

const NO_PASS = "improve printed no pair pass result. Does this akm have consolidate's pair pass?";

export const worst = (mine: { verdict: Verdict }[]): PoolOutcome => (mine.length === 0 ? "kept" : mine.some((r) => r.verdict === "unsafe") ? "unsafe" : mine.some((r) => r.verdict === "wrong_successor") ? "wrong_successor" : "safe");

/** The row for one cluster of the pool, from the raw output. A result with no pair pass is an error, as is a retirement of a note outside the cluster. */
export function makePoolRow(c: Cluster, raw: PoolRaw): PoolRow {
  const base = { id: c.id, kind: c.kind, notes: c.notes, may_retire: Object.keys(c.retire) };
  const failed = (error: string, more: Pick<PoolRow, "run"> & Partial<PoolRow>): PoolRow => ({ ...base, outcome: "error", retirements: [], error, ...more });
  if ("error" in raw) return failed(raw.error, { run: null, seconds: raw.seconds, ...(raw.timedOut ? { timed_out: true as const } : {}) });
  const kept = { run: raw.run, retire_proposals: raw.retire_proposals };
  if (!raw.run.pair_pass || typeof raw.run.pair_pass !== "object") return failed(NO_PASS, kept);
  if (raw.run.outside.length > 0) return failed(`akm retired ${raw.run.outside[0]}, which is not a note of the pool`, kept);
  const stray = raw.retire_proposals.find((p) => !c.notes.includes(nameOfRef(p.retirement.retiredRef)));
  if (stray) return failed(`akm retired ${stray.retirement.retiredRef}, which is not a note of the cluster ${c.id}`, kept);
  const retirements = retirementsFrom({ clusters: [c] }, raw.retire_proposals);
  return { ...base, outcome: worst(retirements), retirements: retirements.map(({ cluster: _c, kind: _k, ...r }) => r), ...kept };
}

// --- Metrics ----------------------------------------------------------------------------------------------------

export interface KindCounts {
  clusters: number;
  with_safe_retirement: number; // clusters that have a note that may be retired
  hit: number; // of those, the clusters in which akm proposed at least one right retirement
  retired_safe: number;
  retired_unsafe: number;
  wrong_successor: number;
  untouched: number; // clusters in which akm proposed nothing
}

export interface PoolMetrics {
  /** `of` is the retirements akm proposed. `staged` is how many of the unsafe ones it staged for unattended retirement. */
  unsafe: { n: number; of: number; staged: number };
  /** The retirements akm staged, which a triage run accepts with no one looking, and the safe ones among them. */
  staged: { n: number; safe: number };
  precision: { value: number | null; safe: number; retired: number };
  /** Of the clusters that have a note that may be retired, the share where akm proposed a right retirement. */
  recall: { value: number | null; retired_safe: number; of: number };
  wrong_successor: number;
  classes: Record<Kind, KindCounts>;
  pairs: { initiators: number; judged: number; considered: number; failed: number; labels: Record<string, number> };
  calls: { calls: number; failures: number; prompt_tokens: number; completion_tokens: number };
  chunks: { total: number; failed: number; deferred_memories: number; promote_ops: number };
  /** The N of "Anti-collapse: injected N", or null when akm did not say so. */
  anti_collapse_injected: number | null;
  /** The pool size before and after, and the chunks it was cut to, from the "cold-start budget" warning, or null when akm did not say so. */
  cold_start_budget: { from: number; to: number; safe_chunks: number } | null;
  warnings: string[];
}

/** Parses akm's warnings. Both messages are akm's own text (consolidate.ts), so a build that words them differently reads as null. */
export function budgetWarnings(warnings: string[]): Pick<PoolMetrics, "anti_collapse_injected" | "cold_start_budget"> {
  let injected: number | null = null;
  let cold: PoolMetrics["cold_start_budget"] = null;
  for (const w of warnings) {
    const a = /Anti-collapse: injected (\d+)/.exec(w);
    if (a) injected = Number(a[1]);
    const c = /cold-start budget: reducing pool from (\d+) to (\d+) memories \((\d+) safe chunks/.exec(w);
    if (c) cold = { from: Number(c[1]), to: Number(c[2]), safe_chunks: Number(c[3]) };
  }
  return { anti_collapse_injected: injected, cold_start_budget: cold };
}

export function usageTotals(usage: UsageRow[]): PoolMetrics["calls"] {
  const total = { calls: 0, failures: 0, prompt_tokens: 0, completion_tokens: 0 };
  for (const r of usage) {
    total.calls += num(r?.calls);
    total.failures += num(r?.failures);
    total.prompt_tokens += num(r?.promptTokens);
    total.completion_tokens += num(r?.completionTokens);
  }
  return total;
}

/** The numbers the eval reports, from the pool, the retirements akm proposed and the raw output of its run (every field of it may be missing). */
export function poolMetrics(pool: { clusters: Pick<Cluster, "id" | "kind" | "retire">[] }, retirements: Retirement[], run: Partial<RunRaw>): PoolMetrics {
  const pass = run.pair_pass ?? {};
  const warnings = Array.isArray(run.warnings) ? run.warnings.filter((w): w is string => typeof w === "string") : [];
  const chunks = run.chunks ?? {};
  const classes = Object.fromEntries(KINDS.map((k) => [k, { clusters: 0, with_safe_retirement: 0, hit: 0, retired_safe: 0, retired_unsafe: 0, wrong_successor: 0, untouched: 0 }])) as Record<Kind, KindCounts>;
  for (const cl of pool.clusters) {
    const k = classes[cl.kind];
    const mine = retirements.filter((r) => r.cluster === cl.id);
    k.clusters++;
    if (Object.keys(cl.retire).length > 0) k.with_safe_retirement++;
    if (mine.some((r) => r.verdict === "safe")) k.hit++;
    if (mine.length === 0) k.untouched++;
    for (const r of mine) {
      if (r.verdict === "safe") k.retired_safe++;
      else if (r.verdict === "unsafe") k.retired_unsafe++;
      else k.wrong_successor++;
    }
  }
  const safe = retirements.filter((r) => r.verdict === "safe").length;
  const unsafe = retirements.filter((r) => r.verdict === "unsafe");
  const withSafe = Object.values(classes).reduce((s, k) => s + k.with_safe_retirement, 0);
  const hits = Object.values(classes).reduce((s, k) => s + k.hit, 0);
  const labels: Record<string, number> = {};
  for (const [label, n] of Object.entries(pass.labelCounts ?? {})) labels[label] = num(n);
  return {
    unsafe: { n: unsafe.length, of: retirements.length, staged: unsafe.filter((r) => r.staged).length },
    staged: { n: retirements.filter((r) => r.staged).length, safe: retirements.filter((r) => r.staged && r.verdict === "safe").length },
    precision: { value: ratio(safe, retirements.length), safe, retired: retirements.length },
    recall: { value: ratio(hits, withSafe), retired_safe: hits, of: withSafe },
    wrong_successor: retirements.filter((r) => r.verdict === "wrong_successor").length,
    classes,
    pairs: { initiators: num(pass.initiators), judged: num(pass.pairsJudged), considered: num(pass.pairsConsidered), failed: num(pass.failedJudgments), labels },
    calls: usageTotals(Array.isArray(run.usage) ? run.usage : []),
    chunks: { total: num(chunks.totalChunks), failed: num(chunks.failedChunks), deferred_memories: num(chunks.deferredMemories), promote_ops: num(chunks.planned) },
    ...budgetWarnings(warnings),
    warnings,
  };
}

// --- Scoring a stored row again ---------------------------------------------------------------------------------

const isObject = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The raw output of a stored cluster row, or the names of the fields it lacks. A run from before the manifest does not hold `run` and
 * `retire_proposals`, so it is refused.
 */
export function poolRawOf(row: Record<string, any>): { raw: PoolRaw } | { missing: string[] } {
  if (isObject(row.run)) {
    const missing: string[] = [];
    const run: any = row.run;
    if (!(run.pair_pass === null || isObject(run.pair_pass)) || !Array.isArray(run.usage) || !isObject(run.chunks) || !Array.isArray(run.warnings) || !Array.isArray(run.outside) || typeof run.seconds !== "number") missing.push("run");
    if (!Array.isArray(row.retire_proposals) || !row.retire_proposals.every((p: unknown) => isObject(p) && isObject(p.retirement) && typeof p.retirement.retiredRef === "string")) missing.push("retire_proposals");
    return missing.length > 0 ? { missing } : { raw: { run, retire_proposals: row.retire_proposals } };
  }
  if (row.run === null && typeof row.error === "string") return { raw: { error: row.error, timedOut: row.timed_out === true, seconds: typeof row.seconds === "number" ? row.seconds : 0 } };
  return { missing: ["run", "retire_proposals"] };
}

/** A cluster of a run that failed has no verdict. */
export const poolErrored = (row: PoolRow): boolean => row.outcome === "error";

/** Is this a row of the pool run? Its rows are clusters, and hold the run's raw output (null when the run failed). */
export const isPoolRow = (row: Record<string, any>): boolean => "run" in row;

/**
 * The fields of the summary that come from the rows. The pool run is one case: it is scored when akm gave a result the scorer could read, and
 * errored when it did not, and then it has no metrics. The status and the reason follow from that.
 */
export function poolSummarize(rows: PoolRow[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; n_paired: number; seconds: number; served_models: Record<string, number>; metrics: PoolMetrics | null; status: "complete" | "aborted"; aborted_reason: string | null; error?: string } {
  const failed = rows.find(poolErrored);
  const run = rows.find((r) => r.run)?.run;
  if (failed || !run) {
    const error = failed?.error ?? "the run has no cluster";
    return { n_run: 1, n_scored: 0, n_errored: 1, timeouts: failed?.timed_out ? 1 : 0, n_paired: 0, seconds: failed?.run?.seconds ?? failed?.seconds ?? 0, served_models: {}, metrics: null, status: "aborted", aborted_reason: error, error };
  }
  const retirements = rows.flatMap((r) => r.retirements.map((x) => ({ ...x, cluster: r.id, kind: r.kind })));
  const clusters = rows.map((r) => ({ id: r.id, kind: r.kind, retire: Object.fromEntries(r.may_retire.map((n) => [n, []])) }));
  const metrics = poolMetrics({ clusters }, retirements, run);
  return { n_run: 1, n_scored: 1, n_errored: 0, timeouts: 0, n_paired: metrics.pairs.judged, seconds: run.seconds, served_models: servedModels(run.usage), metrics, status: "complete", aborted_reason: null };
}
