#!/usr/bin/env bun
// skillret: given a request, does akm rank the right skills first from a large skill library? Writes the skills of
// SkillRet into two sandboxes as akm assets, indexes them for keyword search and for semantic search, runs `akm search`
// on both for every query, and scores it with the benchmark's metrics. `akm curate` is run on a sample of the queries,
// to check that it returns search's ranking. The semantic search is akm's built-in embedder, a small model that runs in
// the akm process, and a run with --limit leaves it out. See ../README.md.
//
//   benchmarks/skillret/run [--corpus public|private|all] [--limit N] [--label NAME] [--akm COMMAND]

import { appendFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, SEMANTIC_MODEL, type Sandbox, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { type CachedIndex, type IndexSpec, cachedIndex } from "../../../lib/akm/index-cache.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import * as akm from "./akm.ts";
import { type Corpus, type Query, SEED, draw, loadCorpus, readLock } from "./dataset.ts";
import { PUBLISHED } from "./published.ts";
import { KS, METRICS, type Scores, scoreQuery, summarize } from "./score.ts";

const NAME = "skillret";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
/** The lines of a run: akm search, asked of the keyword index and, in a run without --limit, of the semantic one. */
const SYSTEMS = ["search", "semantic_search"] as const;
type System = (typeof SYSTEMS)[number];
type Mode = "keyword" | "semantic";
const MODES = ["keyword", "semantic"] as const;
const modeOf = (sys: System): Mode => (sys === "semantic_search" ? "semantic" : "keyword");
const labelOf = (sys: System): string => (modeOf(sys) === "semantic" ? "akm search, semantic" : "akm search");
/** What a run has for each of its lines: the semantic one is there only when the run has the semantic index. */
type Lines<T> = { search: T; semantic_search?: T };
/** How many queries `akm curate` is checked on. It returns search's ranking, so it is asked of a sample, not of every query. */
export const CURATE_CHECK = 200;
type CorpusName = "public" | "private";
/** akm calls in flight at once. A search only reads the index, so they can share it. */
const WORKERS = Math.min(8, availableParallelism());

const USAGE = `Usage: benchmarks/skillret/run [--corpus public|private|all] [--limit N] [--label NAME] [--akm COMMAND]

Writes the skills of SkillRet into two sandboxes as akm assets, indexes them for keyword search and for semantic search,
asks akm search of both for the first ${akm.DEPTH} skills of every query, and scores it with the benchmark's metrics: NDCG, Recall,
Completeness and MAP at 5, 10 and 15. akm curate is asked of ${CURATE_CHECK} of the queries, to check that it returns search's
ranking. The semantic search is akm's built-in embedder, ${SEMANTIC_MODEL}, which runs in the akm process and is
downloaded once into .cache/ (133 MB). The semantic index is kept in .cache/akm-index/ and reused by the next run, unless
a skill changed or akm is not the same. Needs akm on PATH, or in AKM_BIN.

  --corpus  public (default) is the test split: 6,006 skills and 4,392 queries, fetched into assets/ at the pinned
            revision. private is a library of the same size drawn from the train split, with train queries in the
            test split's mix of one, two and three skills. all runs both.
  --limit   run N queries, drawn at random in proportion to how many skills a query needs. Never the first N. Keyword
            search only: a run of a few queries is for checking a setup, and a semantic index takes a quarter of an hour to build.
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default label: akm-<version>.`;

interface SystemRow {
  /** The skill ids akm returned, best first. */
  ranked: string[];
  seconds: number;
  error?: string;
}

/** What akm search answered for a query, and, for the queries of the curate check, what akm curate answered. */
type Row = { id: string; query: string; relevant: string[] } & Lines<SystemRow> & { curate?: SystemRow; semantic_curate?: SystemRow };

/** For one index: how many of the checked queries akm curate answered with exactly search's ranking, and which it did not. */
interface CurateAgreement {
  compared: number;
  same: number;
  different: string[];
  /** Checked queries whose curate call failed. */
  errored: number;
}

interface CurateCheck {
  seed: number;
  /** The checked queries, drawn at random under the seed from the queries of the run. */
  queries: string[];
  keyword: CurateAgreement;
  semantic?: CurateAgreement;
}

interface Summary {
  eval: string;
  corpus: CorpusName;
  label: string;
  date: string;
  git_commit: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** What akm said it searched with, for each index. The run stops at a call that says anything else. */
  search_mode: { keyword: string; semantic?: string };
  /** The embedder of the semantic index. Absent from a run without one. */
  semantic_model?: string;
  /** Whether the semantic index was built for this run, or kept from an earlier one: cold, warm, or rebuilt after the kept one failed. */
  semantic_index?: CachedIndex["state"];
  dataset: Record<string, unknown>;
  sample: Record<string, unknown>;
  depth: number;
  workers: number;
  n_skills: number;
  n_queries: number;
  /** Calls that failed, and are left out of that line's numbers. */
  errored: Lines<number>;
  /** Queries that akm answered with no skill at all. */
  no_results: Lines<number>;
  metrics: Lines<Scores>;
  /** The same metrics for the queries that need one, two and three skills. */
  by_size: Record<string, { n: number } & Lines<Scores>>;
  /** Whether akm curate returned search's ranking, on the sample of queries it was asked about. */
  curate_check: CurateCheck;
  /** How long writing and indexing the skills took, for each index. A new semantic index embeds every skill. */
  index_seconds: { keyword: number; semantic?: number };
  /** All the calls of the run, the semantic ones and the curate check as well. */
  query_seconds: number;
  /** The mean time of one search, in seconds, with `workers` calls in flight. */
  call_seconds: Lines<number>;
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

/** How a semantic index came to be, in words. */
const INDEX_STATE = { cold: "a new index", warm: "kept from an earlier run", rebuilt: "a new index, because the kept one was not what it was built as" } as const;

/** The lines of a summary: search on the keyword index, and on the semantic one when the run had it. */
const linesOf = (s: { metrics: Lines<Scores> }): System[] => SYSTEMS.filter((sys) => s.metrics[sys] !== undefined);
const at = <T>(lines: Lines<T>, sys: System): T => lines[sys] as T;

function printSummary(s: Summary, withPublished: boolean): void {
  const systems = linesOf(s);
  console.log(`\n${NAME} (${s.corpus}) | akm ${s.akm_version}, ${s.semantic_model ? `keyword and semantic (${s.semantic_model})` : "keyword"} search | ${s.n_queries} queries, ${s.n_skills} skills`);
  console.log(`  index ${seconds(s.index_seconds.keyword)} for keyword search${s.index_seconds.semantic === undefined ? "" : ` and ${seconds(s.index_seconds.semantic)} for semantic (${s.semantic_index ? INDEX_STATE[s.semantic_index] : "unknown"})`}, queries ${seconds(s.query_seconds)}`);
  console.log("  the benchmark's metrics in percent, over all queries");
  printScores([
    ...systems.map((sys): [string, number[]] => [labelOf(sys), asPercent(at(s.metrics, sys))]),
    ...(withPublished ? ["published by SkillRet, not run here (Table 3 of its paper, which has no MAP)", ...PUBLISHED.map(([name, scores]): [string, (number | undefined)[]] => [name, [...scores, undefined, undefined, undefined]])] : []),
  ]);
  for (const [size, by] of Object.entries(s.by_size)) {
    const at10 = (sys: System) => `${labelOf(sys).slice(4)} NDCG@10 ${percent(at(by, sys)["NDCG@10"])}, Completeness@10 ${percent(at(by, sys)["Completeness@10"])}`;
    console.log(`  queries that need ${size} skill${size === "1" ? "" : "s"} (${by.n}): ${systems.map(at10).join(" | ")}`);
  }
  for (const sys of systems) {
    if (at(s.no_results, sys) > 0) console.log(`  ${labelOf(sys)} returned no skill for ${at(s.no_results, sys)} queries`);
    if (at(s.errored, sys) > 0) console.log(`  errored calls: ${labelOf(sys)} ${at(s.errored, sys)} (left out of its numbers)`);
  }
  printCurateCheck(s.curate_check);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** One line when akm curate returned search's ranking for every checked query, and a loud one when it did not. */
function printCurateCheck(check: CurateCheck): void {
  const checked = MODES.flatMap((mode) => (check[mode] ? [{ mode, ...(check[mode] as CurateAgreement) }] : []));
  for (const c of checked) {
    if (c.errored > 0) console.log(`  curate check: ${c.errored} curate calls on the ${c.mode} index failed, and their queries were not compared`);
  }
  const differs = checked.filter((c) => c.different.length > 0);
  if (differs.length === 0) {
    console.log(`  curate check: on ${check.queries.length} queries (seed ${check.seed}) akm curate returned search's ranking on ${checked.map((c) => `the ${c.mode} index`).join(" and on ")}`);
    return;
  }
  for (const c of differs) {
    console.error(`\n!!! CURATE DIFFERS FROM SEARCH on the ${c.mode} index: ${c.different.length} of ${c.compared} checked queries, ${c.different.slice(0, 8).join(", ")}${c.different.length > 8 ? ", ..." : ""}`);
  }
  console.error("!!! This benchmark scores search only, because curate returned search's ranking. It does not any more: the curate lines have to come back.\n");
}

/** The public and private corpus as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const systems = linesOf(a).filter((sys) => b.metrics[sys] !== undefined);
  const rows: string[][] = [["", a.corpus, b.corpus], ["queries", String(a.n_queries), String(b.n_queries)], ["skills", String(a.n_skills), String(b.n_skills)]];
  for (const sys of systems) for (const m of METRICS) rows.push([`${labelOf(sys).slice(4)} ${m}@10`, percent(at(a.metrics, sys)[`${m}@10`]), percent(at(b.metrics, sys)[`${m}@10`])]);
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padStart(w[1])}  ${r[2].padStart(w[2])}`);
}

/** Whether a run scores the semantic search as well. A run with --limit is for checking a setup, and is scored with keyword search alone. */
export const withSemantic = (limit?: number): boolean => limit === undefined;

export interface Folders {
  /** The data files and ASSETS.lock. */
  assets: string;
  /** Where the results folder goes. */
  results: string;
}

/** The queries akm curate is asked about: CURATE_CHECK of them drawn at random under the seed, in file order. All of them when there are fewer. */
export const curateSample = (queries: Query[]): Query[] => draw(queries, Math.min(CURATE_CHECK, queries.length), SEED);

/** Of the checked queries, how many akm curate answered with the ranking of akm search, on one index. */
function agreement(rows: Row[], checked: ReadonlySet<string>, mode: Mode): CurateAgreement {
  const [searchKey, curateKey] = mode === "keyword" ? (["search", "curate"] as const) : (["semantic_search", "semantic_curate"] as const);
  const out: CurateAgreement = { compared: 0, same: 0, different: [], errored: 0 };
  for (const r of rows) {
    if (!checked.has(r.id)) continue;
    const curate = r[curateKey];
    const search = r[searchKey];
    if (!curate || curate.error) out.errored++;
    else if (search && !search.error) {
      out.compared++;
      if (JSON.stringify(curate.ranked) === JSON.stringify(search.ranked)) out.same++;
      else out.different.push(r.id);
    }
  }
  return out;
}

/**
 * Runs one corpus: index its skills for keyword search and, unless `ctx.semantic` is false, for semantic search too, ask
 * akm search for every query, ask akm curate for a sample of them and compare it with search, score and write the
 * results. The keyword index is made for the run, in the sandbox that `newSandbox` makes. The semantic index is the one of
 * lib/akm's index cache, which keeps it from run to run: `cache` says where, and which akm, for tests.
 */
export async function runCorpus(corpus: Corpus, ctx: { label?: string; limit?: number; semantic: boolean; newSandbox?: () => Sandbox; cache?: Pick<IndexSpec, "root" | "cmd">; workers?: number }, folders: Folders): Promise<Summary> {
  const workers = ctx.workers ?? WORKERS;
  const modes: readonly Mode[] = ctx.semantic ? MODES : ["keyword"];
  const systems: readonly System[] = ctx.semantic ? SYSTEMS : ["search"];
  /** What a summary has for each line the run has. */
  const lines = <T>(f: (sys: System) => T): Lines<T> => ({ search: f("search"), ...(ctx.semantic ? { semantic_search: f("semantic_search") } : {}) });
  const made: Sandbox[] = [];
  let release = (): void => {};
  try {
    const boxes = { keyword: (ctx.newSandbox ?? (() => createSandbox(NAME)))() } as Record<Mode, Sandbox>;
    made.push(boxes.keyword);
    const version = await akmVersion(boxes.keyword).catch((e: Error) => fail(e.message));
    const label = ctx.label ?? `akm-${version.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    const dir = makeResultsDir(folders.results, label);
    const samples = join(dir, "samples.jsonl");
    writeFileSync(samples, "");
    const { skills, queries } = corpus;
    const sample = curateSample(queries);
    const checked = new Set(sample.map((q) => q.id));
    console.log(`${NAME} (${corpus.corpus}): akm ${version}, ${skills.length} skills, ${queries.length} queries, ${workers} akm calls at a time`);

    const indexSeconds = { keyword: 0, semantic: 0 };
    const indexed = (n: number): void => {
      if (n !== skills.length) fail(`akm indexed ${n} assets for ${skills.length} skills. The skills it left out could not be returned.`, 1);
    };
    // The semantic index first: the model download and the embedding are what can go wrong, and what takes the time.
    let semanticIndex: CachedIndex["state"] | undefined;
    if (ctx.semantic) {
      const t0 = performance.now();
      const index = await cachedIndex({ name: `${NAME}-${corpus.corpus}`, version, files: akm.skillFiles(skills), ...ctx.cache }, async (sb) => {
        const n = await akm.load(sb, skills, true);
        indexed(n);
        return n;
      });
      release = index.release;
      boxes.semantic = index.sandbox;
      semanticIndex = index.state;
      indexed(index.entries);
      indexSeconds.semantic = (performance.now() - t0) / 1000;
      console.log(`  indexed for semantic search in ${seconds(indexSeconds.semantic)}: ${INDEX_STATE[index.state]}`);
    }
    {
      const t0 = performance.now();
      indexed(await akm.load(boxes.keyword, skills));
      indexSeconds.keyword = (performance.now() - t0) / 1000;
      console.log(`  indexed for keyword search in ${seconds(indexSeconds.keyword)}`);
    }

    const known = new Set(skills.map((s) => s.id));
    if (ctx.semantic) {
      const probe = await akm.ask(boxes.semantic, "search", queries[0].query, known, "semantic");
      if (probe.error) fail(`akm cannot search with its embedder: ${probe.error}`, 1);
    }
    const rows = new Map<string, Row>();
    const seen: Record<Mode, Set<string>> = { keyword: new Set(), semantic: new Set() };
    const step = Math.max(1, Math.round(queries.length / 20));
    const t1 = performance.now();
    await inParallel(queries, workers, async (q) => {
      const row = { id: q.id, query: q.query, relevant: q.relevant } as Row;
      for (const sys of systems) {
        const a = await akm.ask(boxes[modeOf(sys)], "search", q.query, known, modeOf(sys));
        if (a.mode) seen[modeOf(sys)].add(a.mode);
        row[sys] = { ranked: a.ranked, seconds: a.seconds, ...(a.error ? { error: a.error } : {}) };
      }
      if (checked.has(q.id)) {
        for (const mode of modes) {
          const a = await akm.ask(boxes[mode], "curate", q.query, known, mode);
          row[mode === "keyword" ? "curate" : "semantic_curate"] = { ranked: a.ranked, seconds: a.seconds, ...(a.error ? { error: a.error } : {}) };
        }
      }
      rows.set(q.id, row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      if (rows.size % step === 0 || rows.size === queries.length) {
        const errors = [...rows.values()].filter((r) => systems.some((sys) => r[sys]?.error) || r.curate?.error || r.semantic_curate?.error).length;
        console.log(`  [${String(rows.size).padStart(String(queries.length).length)}/${queries.length}] ${seconds((performance.now() - t1) / 1000)}${errors ? `, ${errors} queries with an error` : ""}`);
      }
    });
    const querySeconds = (performance.now() - t1) / 1000;

    const ordered = queries.map((q) => rows.get(q.id) as Row);
    writeFileSync(samples, ordered.map((r) => `${JSON.stringify(r)}\n`).join(""));
    const scored = (rs: Row[], sys: System) => rs.flatMap((r) => (r[sys] && !r[sys]?.error ? [scoreQuery(r.relevant, (r[sys] as SystemRow).ranked)] : []));
    const lock = readLock(folders.assets);
    const summary: Summary = {
      eval: NAME,
      corpus: corpus.corpus,
      label,
      date: new Date().toISOString(),
      git_commit: gitCommit(),
      akm_version: version,
      ...akmBuild(),
      search_mode: { keyword: [...seen.keyword].sort().join(", ") || "unknown", ...(ctx.semantic ? { semantic: [...seen.semantic].sort().join(", ") || "unknown" } : {}) },
      ...(ctx.semantic ? { semantic_model: SEMANTIC_MODEL, semantic_index: semanticIndex } : {}),
      dataset: { name: lock.dataset, source: lock.source, revision: lock.revision, licence: lock.licence, sha256: Object.fromEntries(Object.entries(lock.files).map(([name, f]) => [name, f.sha256])) },
      sample: corpus.sample,
      depth: akm.DEPTH,
      workers,
      n_skills: skills.length,
      n_queries: queries.length,
      errored: lines((sys) => ordered.filter((r) => r[sys]?.error).length),
      no_results: lines((sys) => ordered.filter((r) => r[sys] && !r[sys]?.error && r[sys]?.ranked.length === 0).length),
      metrics: lines((sys) => summarize(scored(ordered, sys))),
      by_size: Object.fromEntries(
        [...new Set(queries.map((q) => q.relevant.length))]
          .sort((a, b) => a - b)
          .map((size) => {
            const rs = ordered.filter((r) => r.relevant.length === size);
            return [String(size), { n: rs.length, ...lines((sys) => summarize(scored(rs, sys))) }];
          }),
      ),
      curate_check: { seed: SEED, queries: sample.map((q) => q.id), keyword: agreement(ordered, checked, "keyword"), ...(ctx.semantic ? { semantic: agreement(ordered, checked, "semantic") } : {}) },
      index_seconds: { keyword: Number(indexSeconds.keyword.toFixed(1)), ...(ctx.semantic ? { semantic: Number(indexSeconds.semantic.toFixed(1)) } : {}) },
      query_seconds: Number(querySeconds.toFixed(1)),
      call_seconds: lines((sys) => Number((ordered.reduce((a, r) => a + (r[sys]?.seconds ?? 0), 0) / ordered.length).toFixed(3))),
      results_dir: dir,
    };
    const { results_dir: _dir, ...stored } = summary;
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
    printSummary(summary, corpus.corpus === "public" && ctx.limit === undefined);
    return summary;
  } finally {
    release();
    for (const sb of made) removeSandbox(sb);
  }
}

async function main(): Promise<void> {
  let values: { akm?: string; corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`skillret: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  useAkm(values, fail);
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
    summaries.push(await runCorpus(data, { label: values.label, limit, semantic: withSemantic(limit) }, { assets, results }));
  }
  if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
  const errored = summaries.reduce((n, s) => n + SYSTEMS.reduce((m, sys) => m + (s.errored[sys] ?? 0), 0) + MODES.reduce((m, mode) => m + (s.curate_check[mode]?.errored ?? 0), 0), 0);
  if (errored > 0) fail(`${errored} akm calls failed. Their queries are left out of the numbers, or of the curate check: see the errors in samples.jsonl.`, 1);
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
