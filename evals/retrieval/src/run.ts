#!/usr/bin/env bun
// retrieval: indexes the library in a sandbox, runs `akm search` and `akm curate` for every query, and scores
// them against the graded assets. No model is involved. See ../README.md.
//
//   evals/retrieval/run [--corpus public|private|own|all] [--limit N] [--label NAME]

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import {
  type Abstention,
  DEPTH,
  type Qrel,
  type Query,
  RELEVANT,
  type Scored,
  type SystemMetrics,
  abstention,
  bannedByQuery,
  fixed,
  gradesByQuery,
  isTask,
  parseQrels,
  parseQueries,
  pct,
  scoreQuery,
  selectQueries,
  summarize,
} from "./lib.ts";

const NAME = "retrieval";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const SYSTEMS = ["search", "curate"] as const;
type System = (typeof SYSTEMS)[number];
type Corpus = "public" | "private" | "own";

const OWN_HELP = `Your own set goes in private/${NAME}/own/: queries.jsonl and qrels.jsonl in the format that evals/${NAME}/assets/README.md describes, and library/, the folder akm should index (a link to it works). A library of several bundles needs bundles.json too.`;

const USAGE = `Usage: evals/retrieval/run [--corpus public|private|own|all] [--limit N] [--label NAME]

For each collection of queries, indexes its library in a sandbox, asks akm search and akm curate for the first ${DEPTH}
results of every query, and scores them against the collection's qrels. Each collection is scored on its own. No model
is used. Needs akm on PATH, or in AKM_BIN.

  --corpus  public (default) runs the collections in assets/: the library in corpus/library and the books.
            private runs their private copies in private/retrieval/assets/, made by ./generate-assets.
            own runs your own labelled set in private/retrieval/own/. all runs public and private.
  --limit   run N queries of each collection, in the task and non-task proportion of the whole set
  --label   names the results folders: <UTC date>-<label>-<collection>. Default label: akm-<version>.`;

interface SystemRow {
  /** The assets akm returned, best first. */
  refs: string[];
  /** The grade each one has for this query, or null when nobody judged that pair. */
  grades: (number | null)[];
  seconds: number;
  error?: string;
  scores?: Scored;
}

interface Row {
  id: string;
  kind: string;
  query: string;
  /** How many assets have grade 2 or 3 for this query. Zero for a non-task input. */
  n_relevant: number;
  search: SystemRow;
  curate: SystemRow;
}

interface Summary {
  eval: string;
  corpus: Corpus;
  /** library or books, or own for the own corpus. */
  collection: string;
  label: string;
  date: string;
  git_commit: string;
  akm_version: string;
  search_mode: string;
  depth: number;
  relevant_from_grade: number;
  limit: number | null;
  n_queries: number;
  n_assets: number;
  /** Task queries with at least one relevant asset. Only these have ranking metrics. */
  n_scored: number;
  errored: Record<System, number>;
  metrics: Record<System, SystemMetrics>;
  /** The share of inputs where akm returned nothing: for non-task inputs, and for task queries with no relevant asset. */
  abstention: { non_task: Record<System, Abstention>; no_answer: Record<System, Abstention> };
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

/** How a collection is named in the output: `public books`, or `own`. */
const where = (corpus: Corpus, collection: string): string => (corpus === collection ? corpus : `${corpus} ${collection}`);

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

function printSummary(s: Summary): void {
  console.log(`\n${NAME} (${where(s.corpus, s.collection)}) | akm ${s.akm_version}, ${s.search_mode} search | ${s.n_queries} queries, ${s.n_assets} assets`);
  console.log(`  ranking metrics over the ${s.n_scored} task queries that have a relevant asset (grade ${s.relevant_from_grade}+), first ${s.depth} results`);
  console.log("                    search    curate");
  const m = s.metrics;
  const row = (label: string, f: (x: SystemMetrics) => string) => console.log(`  ${label.padEnd(16)}  ${f(m.search).padEnd(8)}  ${f(m.curate)}`);
  row("nDCG@10", (x) => fixed(x.ndcg_10));
  row("P@5", (x) => fixed(x.p_5));
  row("Success@5", (x) => pct(x.success_5));
  row("MRR", (x) => fixed(x.mrr));
  row("Recall@10", (x) => fixed(x.recall_10));
  row("judged@10", (x) => pct(x.judged_10));
  if (m.search.banned_above !== null || m.curate.banned_above !== null) row("banned above", (x) => pct(x.banned_above));
  const a = s.abstention;
  const ab = (g: Record<System, Abstention>) => `${g.search.abstained}/${g.search.n} ${pct(g.search.rate)}   ${g.curate.abstained}/${g.curate.n} ${pct(g.curate.rate)}`;
  if (a.non_task.search.n > 0) console.log(`  returned nothing, non-task inputs        ${ab(a.non_task)}`);
  if (a.no_answer.search.n > 0) console.log(`  returned nothing, task without answer    ${ab(a.no_answer)}`);
  if (s.errored.search + s.errored.curate > 0) console.log(`  errored calls: search ${s.errored.search}, curate ${s.errored.curate} (left out of the numbers)`);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The summaries as columns, never one pooled number. The collections of one corpus, or each collection's corpora side by side. */
function printSideBySide(columns: Summary[]): void {
  const one = columns.every((c) => c.corpus === columns[0].corpus);
  const metrics: [string, (x: SystemMetrics) => string][] = [
    ["nDCG@10", (x) => fixed(x.ndcg_10)],
    ["P@5", (x) => fixed(x.p_5)],
    ["Success@5", (x) => pct(x.success_5)],
    ["MRR", (x) => fixed(x.mrr)],
    ["Recall@10", (x) => fixed(x.recall_10)],
  ];
  const rows: string[][] = [["", ...columns.map((c) => (one ? c.collection : where(c.corpus, c.collection)))], ["queries (scored)", ...columns.map((c) => `${c.n_queries} (${c.n_scored})`)]];
  for (const sys of SYSTEMS) {
    for (const [label, f] of metrics) rows.push([`${sys} ${label}`, ...columns.map((c) => f(c.metrics[sys]))]);
    if (columns.some((c) => c.metrics[sys].banned_above !== null)) rows.push([`${sys} banned above`, ...columns.map((c) => pct(c.metrics[sys].banned_above))]);
  }
  for (const sys of SYSTEMS) rows.push([`${sys} abstained, non-task`, ...columns.map((c) => pct(c.abstention.non_task[sys].rate))]);
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: ${one ? "the collections" : "the collections, public and private"} side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r.map((cell, i) => cell.padEnd(w[i])).join("  ")}`.trimEnd());
}

export interface Folders {
  /** The library to index. */
  library: string;
  /** queries.jsonl and qrels.jsonl. */
  assets: string;
  /** Where the results folder goes. */
  results: string;
  /** bundles.json, when the library is a folder of bundles. */
  bundles?: string;
}

/** The collections a corpus holds, in the order they run. A collection is a library with its queries and qrels. */
export function collectionsFor(corpus: Corpus): { name: string; folders: Folders }[] {
  const priv = join(ROOT, "private", NAME);
  if (corpus === "own") {
    const own = join(priv, "own");
    return [{ name: "own", folders: { library: join(own, "library"), assets: own, results: join(priv, "results"), bundles: join(own, "bundles.json") } }];
  }
  const assets = corpus === "public" ? join(EVAL_DIR, "assets") : join(priv, "assets");
  const results = corpus === "public" ? join(EVAL_DIR, "results") : join(priv, "results");
  return [
    { name: "library", folders: { library: corpus === "public" ? join(ROOT, "corpus", "library") : join(assets, "library"), assets, results } },
    { name: "books", folders: { library: join(assets, "books", "library"), assets: join(assets, "books"), results } },
  ];
}

/** Scores one collection: its queries and qrels in `folders.assets`, over its library. */
export async function runCollection(corpus: Corpus, collection: string, ctx: { label?: string; limit?: number; newSandbox?: () => Sandbox }, folders: Folders): Promise<Summary> {
  let all: Query[];
  let qrels: Qrel[];
  try {
    all = parseQueries(readFileSync(join(folders.assets, "queries.jsonl"), "utf8"), join(folders.assets, "queries.jsonl"));
    qrels = parseQrels(readFileSync(join(folders.assets, "qrels.jsonl"), "utf8"), join(folders.assets, "qrels.jsonl"));
  } catch (e) {
    fail(`${(e as Error).message}${corpus === "own" ? `\n${OWN_HELP}` : ""}`);
  }
  const grades = gradesByQuery(qrels);
  const banned = bannedByQuery(qrels);
  const queries = selectQueries(all, ctx.limit);
  for (const q of queries) {
    if (isTask(q) && !grades.has(q.id)) fail(`${q.id} has no grades in qrels.jsonl.${corpus === "public" && collection === "library" ? " Run evals/retrieval/label first." : ""}`);
  }

  const sb = (ctx.newSandbox ?? (() => createSandbox(NAME)))();
  try {
    const version = await akmVersion(sb);
    const nAssets = await akm.load(sb, folders.library, folders.bundles);
    const label = ctx.label ?? `akm-${version.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    const dir = makeResultsDir(folders.results, `${label}-${collection}`);
    const samples = join(dir, "samples.jsonl");
    writeFileSync(samples, "");
    console.log(`${NAME} (${where(corpus, collection)}): akm ${version}, ${nAssets} assets, ${queries.length} of ${all.length} queries`);

    const rows: Row[] = [];
    const modes = new Set<string>();
    for (const q of queries) {
      const g = grades.get(q.id) ?? {};
      const nRelevant = Object.values(g).filter((x) => x >= RELEVANT).length;
      const answers = {} as Record<System, SystemRow>;
      for (const sys of SYSTEMS) {
        const a = await akm.ask(sb, sys, q.query);
        if (a.mode) modes.add(a.mode);
        answers[sys] = {
          refs: a.refs,
          grades: a.refs.map((r) => (Object.hasOwn(g, r) ? g[r] : null)),
          seconds: a.seconds,
          ...(a.error ? { error: a.error } : {}),
          ...(isTask(q) && nRelevant > 0 && !a.error ? { scores: scoreQuery(g, a.refs, banned.get(q.id)) } : {}),
        };
      }
      const row: Row = { id: q.id, kind: q.kind, query: q.query, n_relevant: nRelevant, ...answers };
      rows.push(row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      const errors = SYSTEMS.filter((s) => row[s].error);
      console.log(`  [${String(rows.length).padStart(String(queries.length).length)}/${queries.length}] ${q.id} ${q.kind.padEnd(12)} search ${row.search.refs.length} curate ${row.curate.refs.length}${errors.length ? `  ERROR ${errors.map((s) => `${s}: ${row[s].error}`).join(" | ").slice(0, 150)}` : ""}`);
    }

    const scored = rows.filter((r) => isTask(r) && r.n_relevant > 0);
    const noAnswer = rows.filter((r) => isTask(r) && r.n_relevant === 0);
    const nonTask = rows.filter((r) => !isTask(r));
    const ok = (rs: Row[], s: System) => rs.filter((r) => !r[s].error);
    const summary: Summary = {
      eval: NAME,
      corpus,
      collection,
      label,
      date: new Date().toISOString(),
      git_commit: gitCommit(),
      akm_version: version,
      search_mode: [...modes].sort().join(", ") || "unknown",
      depth: DEPTH,
      relevant_from_grade: RELEVANT,
      limit: ctx.limit ?? null,
      n_queries: rows.length,
      n_assets: nAssets,
      n_scored: scored.length,
      errored: { search: rows.filter((r) => r.search.error).length, curate: rows.filter((r) => r.curate.error).length },
      metrics: Object.fromEntries(SYSTEMS.map((s) => [s, summarize(ok(scored, s).map((r) => r[s].scores as Scored))])) as Record<System, SystemMetrics>,
      abstention: {
        non_task: Object.fromEntries(SYSTEMS.map((s) => [s, abstention(ok(nonTask, s).map((r) => r[s].refs.length))])) as Record<System, Abstention>,
        no_answer: Object.fromEntries(SYSTEMS.map((s) => [s, abstention(ok(noAnswer, s).map((r) => r[s].refs.length))])) as Record<System, Abstention>,
      },
      results_dir: dir,
    };
    const { results_dir: _dir, ...stored } = summary;
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
    printSummary(summary);
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
    console.error(`retrieval: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "own" && corpus !== "all") fail(`--corpus must be public, private, own or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  if (values.label !== undefined && !/^[A-Za-z0-9._-]+$/.test(values.label)) fail("--label may use letters, digits, dot, dash and underscore");
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];

  const sets = corpora.flatMap((c) => collectionsFor(c).map((s) => ({ corpus: c, ...s })));
  for (const { corpus: c, folders: f } of sets) {
    if (c === "public" || [f.library, join(f.assets, "queries.jsonl"), join(f.assets, "qrels.jsonl")].every(existsSync)) continue;
    fail(c === "own" ? `private/${NAME}/own/ does not hold a set in the eval's format.\n${OWN_HELP}` : `the private assets are missing (${relative(ROOT, f.assets)}/). Make them with: ./generate-assets --only ${NAME}`);
  }
  const summaries: Summary[] = [];
  for (const s of sets) summaries.push(await runCollection(s.corpus, s.name, { label: values.label, limit }, s.folders));
  if (summaries.length > 1) printSideBySide([...new Set(summaries.map((s) => s.collection))].flatMap((name) => summaries.filter((s) => s.collection === name)));
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`retrieval: ${e.message}`);
    process.exit(e.code);
  }
}
