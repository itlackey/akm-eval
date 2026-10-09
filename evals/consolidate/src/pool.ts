// consolidate --pool: one sandbox with a whole pool of memories and one `akm improve` run on it, as a real night consolidates.
// This file holds the pure parts: the pool, the akm arguments, how akm's result is scored, and the metrics. run.ts runs it.

import { mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sandbox } from "../../../lib/akm/akm.ts";
import { nameOfRef, retireProposals, servedModels } from "./lib.ts";

/** The strategy the pool run gives akm. The one place to change it. */
export const POOL_STRATEGY = "consolidate";

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

/** Reads assets/pool: labels.json and memories/<name>.md. Throws on a pool that does not add up. */
export function loadPool(dir: string): Pool {
  const labels = JSON.parse(readFileSync(join(dir, "labels.json"), "utf8")) as { canary?: string; notes: Record<string, { age_days: number }>; clusters: Cluster[] };
  const texts: Record<string, string> = {};
  const files = readdirSync(join(dir, "memories")).filter((f) => f.endsWith(".md"));
  for (const f of files) texts[f.slice(0, -3)] = readFileSync(join(dir, "memories", f), "utf8");
  const ages = Object.fromEntries(Object.entries(labels.notes).map(([n, v]) => [n, v.age_days]));
  const pool: Pool = { canary: labels.canary, clusters: labels.clusters, texts, ages };
  const problems = poolProblems(pool);
  if (problems.length > 0) throw new Error(`the pool in ${dir}: ${problems[0]}`);
  return pool;
}

/** What is wrong with a pool: a note without a label or a file, in no cluster or two, a retire entry outside its cluster, a claim that is not where it says. */
export function poolProblems(pool: Pool): string[] {
  const problems: string[] = [];
  const names = new Set(Object.keys(pool.texts));
  for (const n of names) if (!(n in pool.ages)) problems.push(`note ${n} has no age in labels.json`);
  for (const n of Object.keys(pool.ages)) if (!names.has(n)) problems.push(`labels.json names ${n}, which has no file`);
  const seen = new Map<string, string>();
  for (const c of pool.clusters) {
    if (!KINDS.includes(c.kind)) problems.push(`${c.id} has kind "${c.kind}"`);
    for (const n of c.notes) {
      if (!names.has(n)) problems.push(`${c.id} names ${n}, which has no file`);
      if (seen.has(n)) problems.push(`note ${n} is in ${seen.get(n)} and ${c.id}`);
      seen.set(n, c.id);
    }
    for (const [n, successors] of Object.entries(c.retire)) {
      if (!c.notes.includes(n)) problems.push(`${c.id} may retire ${n}, which is not one of its notes`);
      if (successors.length === 0 || successors.some((s) => s === n || !c.notes.includes(s))) problems.push(`${c.id}: ${n} has successors that are not other notes of the cluster`);
    }
    for (const k of c.claims) {
      for (const n of c.notes) {
        if ((pool.texts[n] ?? "").includes(k.text) !== k.notes.includes(n)) problems.push(`${c.id}: the claim "${k.text.slice(0, 50)}" is ${k.notes.includes(n) ? "missing from" : "also in"} ${n}`);
      }
    }
  }
  for (const n of names) if (!seen.has(n)) problems.push(`note ${n} is in no cluster`);
  return problems;
}

/** Puts every note in the sandbox's bundle as a memory, with the file time akm reads as its date. */
export function writePoolNotes(sandbox: Sandbox, pool: Pool, now = Date.now()): void {
  const dir = join(sandbox.dir, "bundle", "memories");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(pool.texts)) {
    const file = join(dir, `${name}.md`);
    writeFileSync(file, text);
    const when = new Date(now - (pool.ages[name] ?? 2) * 86_400_000);
    utimesSync(file, when, when);
  }
}

/** The arguments of the one akm run. `--timeout-ms` is akm's wall-clock budget for the run; leave it out for akm's own 2 hours. */
export function poolImproveArgs(timeoutMs?: number): string[] {
  return ["improve", "--strategy", POOL_STRATEGY, "--no-sync", "--json-to-stdout", "--format", "json", ...(timeoutMs ? ["--timeout-ms", String(timeoutMs)] : [])];
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

/** A retirement is safe when the cluster allows it for that successor, wrong-successor when it allows the note but not that successor, and unsafe when the note holds a claim no other note has. */
export function judgeRetirement(pool: Pool, retired: string, successor: string | null): { cluster: Cluster; verdict: Verdict } | undefined {
  const cluster = pool.clusters.find((c) => c.notes.includes(retired));
  if (!cluster) return undefined;
  const allowed = cluster.retire[retired];
  if (!allowed) return { cluster, verdict: "unsafe" };
  return { cluster, verdict: successor !== null && allowed.includes(successor) ? "safe" : "wrong_successor" };
}

const claimList = (x: unknown): string[] | null => (Array.isArray(x) && x.every((k) => typeof k === "string") ? x : null);

/** The retirements akm proposed, each judged against the labels. Throws on a retirement of something that is not in the pool. */
export function retirementsFrom(pool: Pool, proposals: unknown): Retirement[] {
  return retireProposals(proposals).map((p) => {
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
      judged_as: (p.retirement as { judgeLabel?: string }).judgeLabel ?? null,
      reason: p.retirement.judgeReason ?? "",
      only_in_retired: claimList(p.retirement.onlyInRetired),
      only_in_successor: claimList(p.retirement.onlyInSuccessor),
    };
  });
}

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

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

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

export function usageTotals(improve: unknown): PoolMetrics["calls"] {
  const rows = (improve as { usageReport?: { byProcessEngineModel?: unknown } })?.usageReport?.byProcessEngineModel;
  const total = { calls: 0, failures: 0, prompt_tokens: 0, completion_tokens: 0 };
  if (Array.isArray(rows)) {
    for (const r of rows) {
      total.calls += num(r?.calls);
      total.failures += num(r?.failures);
      total.prompt_tokens += num(r?.promptTokens);
      total.completion_tokens += num(r?.completionTokens);
    }
  }
  return total;
}

/** The numbers the eval reports, from the pool, the retirements akm proposed and its result. */
export function poolMetrics(pool: Pool, retirements: Retirement[], improve: unknown): PoolMetrics {
  const c = (improve as { consolidation?: Record<string, any> })?.consolidation ?? {};
  const pass = c.pairPass ?? {};
  const warnings = Array.isArray(c.warnings) ? c.warnings.filter((w: unknown): w is string => typeof w === "string") : [];
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
    precision: { value: ratio(safe, retirements.length), safe, retired: retirements.length },
    recall: { value: ratio(hits, withSafe), retired_safe: hits, of: withSafe },
    wrong_successor: retirements.filter((r) => r.verdict === "wrong_successor").length,
    classes,
    pairs: { initiators: num(pass.initiators), judged: num(pass.pairsJudged), considered: num(pass.pairsConsidered), failed: num(pass.failedJudgments), labels },
    calls: usageTotals(improve),
    chunks: { total: num(c.totalChunks), failed: num(c.failedChunks), deferred_memories: num(c.deferredMemories), promote_ops: Array.isArray(c.planned) ? c.planned.length : 0 },
    ...budgetWarnings(warnings),
    warnings,
  };
}

/** One line per cluster for samples.jsonl: what akm did with it. `outcome` is the worst verdict, or "kept" when akm proposed nothing. */
export function clusterRows(pool: Pool, retirements: Retirement[]): object[] {
  return pool.clusters.map((cl) => {
    const mine = retirements.filter((r) => r.cluster === cl.id);
    const outcome = mine.length === 0 ? "kept" : mine.some((r) => r.verdict === "unsafe") ? "unsafe" : mine.some((r) => r.verdict === "wrong_successor") ? "wrong_successor" : "safe";
    return { id: cl.id, kind: cl.kind, notes: cl.notes, may_retire: Object.keys(cl.retire), outcome, retirements: mine.map(({ cluster: _c, kind: _k, ...r }) => r) };
  });
}

export interface PoolResult {
  error?: string;
  metrics: PoolMetrics | null;
  retirements: Retirement[];
  served_models: Record<string, number>;
}

/** Scores a run from akm's JSON result and its proposal list. A result with no pair pass is an error, as is a retirement of something outside the pool. */
export function scorePool(pool: Pool, improve: unknown, proposals: unknown): PoolResult {
  const pass = (improve as { consolidation?: { pairPass?: unknown } })?.consolidation?.pairPass;
  if (!pass || typeof pass !== "object") return { error: "improve printed no pair pass result. Does this akm have consolidate's pair pass?", metrics: null, retirements: [], served_models: {} };
  try {
    const retirements = retirementsFrom(pool, proposals);
    return { metrics: poolMetrics(pool, retirements, improve), retirements, served_models: servedModels(improve) };
  } catch (e) {
    return { error: (e as Error).message, metrics: null, retirements: [], served_models: {} };
  }
}
