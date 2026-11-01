// consolidate --pool: one sandbox with a whole pool of memories and one `akm improve` run on it, as a real night consolidates.
// This file reads and checks the pool: its labels and its notes. The scoring is pool-score.ts and the running is collect.ts; this file
// re-exports both, so the eval and its tests import from one place. It is in neither part of the measurement (see measurement.ts).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sha256Json } from "../../../lib/provenance.ts";
import { casesOf, parseQrels, parseQueries } from "../../retrieval/src/lib.ts";
import type { PoolQuery } from "./pool-retrieval.ts";
import { KINDS, type Cluster, type Pool, type PoolCase, type Retirement, worst } from "./pool-score.ts";

export * from "./pool-score.ts";
export * from "./pool-retrieval.ts";
export { POOL_STRATEGY, poolImproveArgs, writePoolNotes } from "./collect.ts";

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

/** The files loadPool reads from the pool folder, relative to it: labels.json and every note, for the digest of summary.json's assets_sha256. */
export function poolFiles(dir: string): string[] {
  return ["labels.json", ...readdirSync(join(dir, "memories")).filter((f) => f.endsWith(".md")).sort().map((f) => `memories/${f}`)];
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

/** The clusters of a pool as the measurement's cases: each with the text and age of its notes, and the digest of the whole pool. */
export function poolCases(pool: Pool): PoolCase[] {
  const pool_sha256 = sha256Json({ texts: pool.texts, ages: pool.ages });
  return pool.clusters.map((c) => ({ ...c, texts: Object.fromEntries(c.notes.map((n) => [n, pool.texts[n] as string])), ages: Object.fromEntries(c.notes.map((n) => [n, pool.ages[n] as number])), pool_sha256 }));
}

/**
 * One line per cluster for samples.jsonl from a pool and the retirements judged against it, without the raw output a run keeps (makePoolRow
 * writes the rows of a run). The fixtures of scripts/compare are made with it.
 */
export function clusterRows(pool: Pick<Pool, "clusters">, retirements: Retirement[]): object[] {
  return pool.clusters.map((cl) => {
    const mine = retirements.filter((r) => r.cluster === cl.id);
    return { id: cl.id, kind: cl.kind, notes: cl.notes, may_retire: Object.keys(cl.retire), outcome: worst(mine), retirements: mine.map(({ cluster: _c, kind: _k, ...r }) => r) };
  });
}

/**
 * Reads assets/pool/queries.jsonl and qrels.jsonl, in the retrieval eval's format with a `cluster` on each query, and checks them against the pool: every cluster has a query, every
 * graded note is a note of the query's cluster, every query has a note graded 2 or more, and a banned note is one the cluster allows to retire.
 */
export function loadPoolQueries(dir: string, pool: Pick<Pool, "clusters">): PoolQuery[] {
  const queriesFile = join(dir, "queries.jsonl");
  const qrelsFile = join(dir, "qrels.jsonl");
  const text = readFileSync(queriesFile, "utf8");
  const queries = parseQueries(text, queriesFile);
  const qrels = parseQrels(readFileSync(qrelsFile, "utf8"), qrelsFile);
  const clusterOf = new Map(text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as { id: string; cluster?: unknown }).map((q) => [q.id, q.cluster]));
  const cases = casesOf(queries, qrels);
  const clusters = new Map(pool.clusters.map((c) => [c.id, c]));
  const problems: string[] = [];
  const out: PoolQuery[] = [];
  for (const c of cases) {
    const id = clusterOf.get(c.id);
    const cluster = typeof id === "string" ? clusters.get(id) : undefined;
    if (!cluster) {
      problems.push(`${c.id} names the cluster ${JSON.stringify(id)}, which the pool does not have`);
      continue;
    }
    const refs = new Set(cluster.notes.map((n) => `memories/${n}`));
    for (const ref of Object.keys(c.grades)) if (!refs.has(ref)) problems.push(`${c.id} grades ${ref}, which is not a note of ${cluster.id}`);
    if (!Object.values(c.grades).some((g) => g >= 2)) problems.push(`${c.id} has no note graded 2 or more`);
    for (const ref of c.banned) if (!Object.keys(cluster.retire).includes(ref.replace(/^memories\//, ""))) problems.push(`${c.id} bans ${ref}, which ${cluster.id} does not allow to retire`);
    out.push({ ...c, cluster: cluster.id });
  }
  for (const cl of pool.clusters) if (!out.some((q) => q.cluster === cl.id)) problems.push(`${cl.id} has no query`);
  if (qrels.some((r) => !cases.some((c) => c.id === r.id))) problems.push("qrels.jsonl grades a query that queries.jsonl does not have");
  if (problems.length > 0) throw new Error(`the pool queries in ${dir}: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}`);
  return out;
}
