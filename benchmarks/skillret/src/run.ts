#!/usr/bin/env bun
// skillret: given a request, does akm rank the right skills first from a large skill library? Writes the skills of
// SkillRet into a sandbox as akm assets, indexes them once, runs `akm search` and `akm curate` for every query, and
// scores both with the benchmark's metrics. No model is involved. See ../README.md.
//
//   benchmarks/skillret/run [--corpus public|private|all] [--limit N] [--label NAME]

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import { type Corpus, loadCorpus, readLock } from "./dataset.ts";
import { PUBLISHED } from "./published.ts";
import { KS, METRICS, type Scores, scoreQuery, summarize } from "./score.ts";

const NAME = "skillret";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const SYSTEMS = ["search", "curate"] as const;
type System = (typeof SYSTEMS)[number];
type CorpusName = "public" | "private";
/** akm calls in flight at once. A search only reads the index, so they can share it. */
const WORKERS = Math.min(8, availableParallelism());

const USAGE = `Usage: benchmarks/skillret/run [--corpus public|private|all] [--limit N] [--label NAME]

Writes the skills of SkillRet into a sandbox as akm assets, indexes them, asks akm search and akm curate for the first
${akm.DEPTH} skills of every query, and scores them with the benchmark's metrics: NDCG, Recall, Completeness and MAP at
5, 10 and 15. No model is used. Needs akm on PATH, or in AKM_BIN.

  --corpus  public (default) is the test split: 6,006 skills and 4,392 queries, fetched into assets/ at the pinned
            revision. private is a library of the same size drawn from the train split, with train queries in the
            test split's mix of one, two and three skills. all runs both.
  --limit   run N queries, drawn at random in proportion to how many skills a query needs. Never the first N.
  --label   names the results folder: <UTC date>-<label>. Default label: akm-<version>.`;

interface SystemRow {
  /** The skill ids akm returned, best first. */
  ranked: string[];
  seconds: number;
  error?: string;
}

interface Row {
  id: string;
  query: string;
  relevant: string[];
  search: SystemRow;
  curate: SystemRow;
}

interface Summary {
  eval: string;
  corpus: CorpusName;
  label: string;
  date: string;
  git_commit: string;
  akm_version: string;
  search_mode: string;
  dataset: Record<string, unknown>;
  sample: Record<string, unknown>;
  depth: number;
  workers: number;
  n_skills: number;
  n_queries: number;
  /** Calls that failed, and are left out of that command's numbers. */
  errored: Record<System, number>;
  /** Queries that akm answered with no skill at all. */
  no_results: Record<System, number>;
  metrics: Record<System, Scores>;
  /** The same metrics for the queries that need one, two and three skills. */
  by_size: Record<string, { n: number } & Record<System, Scores>>;
  index_seconds: number;
  query_seconds: number;
  /** The mean time of one call, in seconds, with `workers` calls in flight. */
  call_seconds: Record<System, number>;
  results_dir: string;
}

class Fatal extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

function fail(message: string, code = 2): never {
  throw new Fatal(message, code);
}

function gitCommit(): string {
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", ROOT, ...args], { stderr: "ignore" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.exitCode !== 0) return "unknown";
  const dirty = run(["status", "--porcelain", "--untracked-files=no"]).stdout.toString().trim() !== "";
  return head.stdout.toString().trim() + (dirty ? "-dirty" : "");
}

function makeResultsDir(parent: string, label: string): string {
  const base = join(parent, `${new Date().toISOString().slice(0, 10)}-${label}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Runs `work` for every item, `workers` at a time. */
async function inParallel<T>(items: T[], workers: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

const seconds = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
const percent = (x: number | undefined): string => (x === undefined ? "-" : (x * 100).toFixed(2));

/** A system's scores as percentages, in the order of the paper's table with MAP last. */
const asPercent = (scores: Scores): number[] => METRICS.flatMap((m) => KS.map((k) => scores[`${m}@${k}`] * 100));

/** One table of percentages, a line for each system. A line that is only text is printed as it is. */
function printScores(lines: ([name: string, percent: (number | undefined)[]] | string)[]): void {
  const label = Math.max(...lines.map((l) => (typeof l === "string" ? 0 : l[0].length)));
  console.log(`  ${"".padEnd(label)}  ${METRICS.map((m) => m.padEnd(KS.length * 7 - 1)).join(" ")}`);
  console.log(`  ${"".padEnd(label)}  ${METRICS.map(() => KS.map((k) => `@${k}`.padStart(6)).join(" ")).join(" ")}`);
  for (const line of lines) {
    if (typeof line === "string") console.log(`  ${line}`);
    else console.log(`  ${line[0].padEnd(label)}  ${line[1].map((v) => (v === undefined ? "-" : v.toFixed(2)).padStart(6)).join(" ")}`);
  }
}

function printSummary(s: Summary, withPublished: boolean): void {
  console.log(`\n${NAME} (${s.corpus}) | akm ${s.akm_version}, ${s.search_mode} search | ${s.n_queries} queries, ${s.n_skills} skills | index ${seconds(s.index_seconds)}, queries ${seconds(s.query_seconds)}`);
  console.log("  the benchmark's metrics in percent, over all queries");
  printScores([
    ...SYSTEMS.map((sys): [string, number[]] => [`akm ${sys}`, asPercent(s.metrics[sys])]),
    ...(withPublished ? ["published by SkillRet, not run here (Table 3 of its paper, which has no MAP)", ...PUBLISHED.map(([name, scores]): [string, (number | undefined)[]] => [name, [...scores, undefined, undefined, undefined]])] : []),
  ]);
  for (const [size, by] of Object.entries(s.by_size)) {
    console.log(`  queries that need ${size} skill${size === "1" ? "" : "s"} (${by.n}): search NDCG@10 ${percent(by.search["NDCG@10"])}, Completeness@10 ${percent(by.search["Completeness@10"])} | curate NDCG@10 ${percent(by.curate["NDCG@10"])}, Completeness@10 ${percent(by.curate["Completeness@10"])}`);
  }
  for (const sys of SYSTEMS) {
    if (s.no_results[sys] > 0) console.log(`  ${sys} returned no skill for ${s.no_results[sys]} queries`);
    if (s.errored[sys] > 0) console.log(`  errored calls: ${sys} ${s.errored[sys]} (left out of its numbers)`);
  }
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two corpora as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: string[][] = [["", a.corpus, b.corpus], ["queries", String(a.n_queries), String(b.n_queries)], ["skills", String(a.n_skills), String(b.n_skills)]];
  for (const sys of SYSTEMS) for (const m of METRICS) rows.push([`${sys} ${m}@10`, percent(a.metrics[sys][`${m}@10`]), percent(b.metrics[sys][`${m}@10`])]);
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padStart(w[1])}  ${r[2].padStart(w[2])}`);
}

export interface Folders {
  /** The data files and ASSETS.lock. */
  assets: string;
  /** Where the results folder goes. */
  results: string;
}

/** Runs one corpus: index its skills, ask akm for every query, score and write the results. */
export async function runCorpus(corpus: Corpus, ctx: { label?: string; limit?: number; newSandbox?: () => Sandbox; workers?: number }, folders: Folders): Promise<Summary> {
  const workers = ctx.workers ?? WORKERS;
  const sb = (ctx.newSandbox ?? (() => createSandbox(NAME)))();
  try {
    const version = await akmVersion(sb).catch((e: Error) => fail(e.message));
    const label = ctx.label ?? `akm-${version.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    const dir = makeResultsDir(folders.results, label);
    const samples = join(dir, "samples.jsonl");
    writeFileSync(samples, "");
    const { skills, queries } = corpus;
    console.log(`${NAME} (${corpus.corpus}): akm ${version}, ${skills.length} skills, ${queries.length} queries, ${workers} akm calls at a time`);

    const t0 = performance.now();
    const indexed = await akm.load(sb, skills);
    if (indexed !== skills.length) fail(`akm indexed ${indexed} assets for ${skills.length} skills. The skills it left out could not be returned.`, 1);
    const indexSeconds = (performance.now() - t0) / 1000;
    console.log(`  indexed in ${seconds(indexSeconds)}`);

    const known = new Set(skills.map((s) => s.id));
    const rows = new Map<string, Row>();
    const modes = new Set<string>();
    const step = Math.max(1, Math.round(queries.length / 20));
    const t1 = performance.now();
    await inParallel(queries, workers, async (q) => {
      const row: Row = { id: q.id, query: q.query, relevant: q.relevant, search: { ranked: [], seconds: 0 }, curate: { ranked: [], seconds: 0 } };
      for (const sys of SYSTEMS) {
        const a = await akm.ask(sb, sys, q.query, known);
        if (a.mode) modes.add(a.mode);
        row[sys] = { ranked: a.ranked, seconds: a.seconds, ...(a.error ? { error: a.error } : {}) };
      }
      rows.set(q.id, row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      if (rows.size % step === 0 || rows.size === queries.length) {
        const errors = [...rows.values()].filter((r) => r.search.error || r.curate.error).length;
        console.log(`  [${String(rows.size).padStart(String(queries.length).length)}/${queries.length}] ${seconds((performance.now() - t1) / 1000)}${errors ? `, ${errors} queries with an error` : ""}`);
      }
    });
    const querySeconds = (performance.now() - t1) / 1000;

    const ordered = queries.map((q) => rows.get(q.id) as Row);
    writeFileSync(samples, ordered.map((r) => `${JSON.stringify(r)}\n`).join(""));
    const scored = (rs: Row[], sys: System) => rs.filter((r) => !r[sys].error).map((r) => scoreQuery(r.relevant, r[sys].ranked));
    const lock = readLock(folders.assets);
    const summary: Summary = {
      eval: NAME,
      corpus: corpus.corpus,
      label,
      date: new Date().toISOString(),
      git_commit: gitCommit(),
      akm_version: version,
      search_mode: [...modes].sort().join(", ") || "unknown",
      dataset: { name: lock.dataset, source: lock.source, revision: lock.revision, licence: lock.licence, sha256: Object.fromEntries(Object.entries(lock.files).map(([name, f]) => [name, f.sha256])) },
      sample: corpus.sample,
      depth: akm.DEPTH,
      workers,
      n_skills: skills.length,
      n_queries: queries.length,
      errored: Object.fromEntries(SYSTEMS.map((s) => [s, ordered.filter((r) => r[s].error).length])) as Record<System, number>,
      no_results: Object.fromEntries(SYSTEMS.map((s) => [s, ordered.filter((r) => !r[s].error && r[s].ranked.length === 0).length])) as Record<System, number>,
      metrics: Object.fromEntries(SYSTEMS.map((s) => [s, summarize(scored(ordered, s))])) as Record<System, Scores>,
      by_size: Object.fromEntries(
        [...new Set(queries.map((q) => q.relevant.length))]
          .sort((a, b) => a - b)
          .map((size) => {
            const rs = ordered.filter((r) => r.relevant.length === size);
            return [String(size), { n: rs.length, ...(Object.fromEntries(SYSTEMS.map((s) => [s, summarize(scored(rs, s))])) as Record<System, Scores>) }];
          }),
      ),
      index_seconds: Number(indexSeconds.toFixed(1)),
      query_seconds: Number(querySeconds.toFixed(1)),
      call_seconds: Object.fromEntries(SYSTEMS.map((s) => [s, Number((ordered.reduce((a, r) => a + r[s].seconds, 0) / ordered.length).toFixed(3))])) as Record<System, number>,
      results_dir: dir,
    };
    const { results_dir: _dir, ...stored } = summary;
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
    printSummary(summary, corpus.corpus === "public" && ctx.limit === undefined);
    return summary;
  } finally {
    removeSandbox(sb);
  }
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`skillret: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "all") fail(`--corpus must be public, private or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  if (values.label !== undefined && !/^[A-Za-z0-9._-]+$/.test(values.label)) fail("--label may use letters, digits, dot, dash and underscore");

  const assets = join(EVAL_DIR, "assets");
  const summaries: Summary[] = [];
  for (const name of corpus === "all" ? (["public", "private"] as const) : ([corpus] as const)) {
    const data = await loadCorpus(name, assets, limit);
    const results = name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results");
    summaries.push(await runCorpus(data, { label: values.label, limit }, { assets, results }));
  }
  if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
  const errored = summaries.reduce((n, s) => n + s.errored.search + s.errored.curate, 0);
  if (errored > 0) fail(`${errored} akm calls failed. Their queries are left out of that command's numbers: see the errors in samples.jsonl.`, 1);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`skillret: ${e.message}`);
    process.exit(e.code);
  }
}
