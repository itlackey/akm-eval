#!/usr/bin/env bun
// retrieval: indexes the library in two sandboxes, for keyword search and for semantic search, runs `akm search`
// and `akm curate` on both for every query, and scores them against the graded assets. The semantic search is akm's
// built-in embedder, a small model that runs in the akm process. A run with --limit, and the own corpus, leave it out
// unless --semantic on asks for it. See ../README.md.
//
//   evals/retrieval/run [--corpus public|private|own|all] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND] [--semantic on|off|auto]

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, SEMANTIC_MODEL, type Sandbox, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit } from "../../../lib/cli.ts";
import { type BuiltBy, type CachedIndex, type IndexSpec, cachedIndex } from "../../../lib/akm/index-cache.ts";
import { type EngineSettings, engineSettings, redactConfig } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import * as akm from "./akm.ts";
import { type AssetsDigests, assetsDigests, assetsSha256, readGenerated, readSeed, staleAssets } from "./inputs.ts";
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
  mixedJudgesWarning,
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
/** The columns of a run: akm's two commands, each asked of the keyword index and, in a run that has it, of the semantic one. */
export const SYSTEMS = ["search", "curate", "semantic_search", "semantic_curate"] as const;
type System = (typeof SYSTEMS)[number];
type Mode = "keyword" | "semantic";
const modeOf = (sys: System): Mode => (sys.startsWith("semantic_") ? "semantic" : "keyword");
/** What a run has for each of its columns: the semantic ones are there only when the run has the semantic index. */
type Columns<T> = { search: T; curate: T; semantic_search?: T; semantic_curate?: T };
const at = <T>(columns: Columns<T>, sys: System): T => columns[sys] as T;
const commandOf = (sys: System): "search" | "curate" => (sys.endsWith("curate") ? "curate" : "search");
const labelOf = (sys: System): string => `${modeOf(sys) === "semantic" ? "semantic " : ""}${commandOf(sys)}`;
type Corpus = "public" | "private" | "own";
/** What --semantic says: score the semantic search (on), never (off), or only in a full run of the public and private corpora (auto). */
const SEMANTIC_FLAGS = ["on", "off", "auto"] as const;
export type SemanticFlag = (typeof SEMANTIC_FLAGS)[number];

const OWN_HELP = `Your own set goes in private/${NAME}/own/: queries.jsonl and qrels.jsonl in the format that evals/${NAME}/assets/README.md describes, and library/, the folder akm should index (a link to it works). A library of several bundles needs bundles.json too.`;

const USAGE = `Usage: evals/retrieval/run [--corpus public|private|own|all] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND] [--semantic on|off|auto]

For each collection of queries, indexes its library in two sandboxes, for keyword search and for semantic search, asks
akm search and akm curate of both for the first ${DEPTH} results of every query, and scores them against the collection's
qrels. Each collection is scored on its own. The semantic search is akm's built-in embedder, ${SEMANTIC_MODEL}, which runs
in the akm process and is downloaded once into .cache/ (133 MB). The semantic index is kept in .cache/akm-index/ and reused
by the next run, unless a file of the library changed or akm is not the same. The own corpus and a run with --limit are
scored with keyword search only, unless --semantic on says otherwise. Needs akm on PATH, or in AKM_BIN.

  --corpus  public (default) runs the collections in assets/: the library in corpus/library and the books.
            private runs their private copies in private/retrieval/assets/, made by ./generate-assets --only retrieval. It stops
            when they were made from public files that have changed since: make them again.
            own runs your own labelled set in private/retrieval/own/. all runs public and private.
  --limit   run N queries of each collection, in the task and non-task proportion of the whole set. Keyword search only,
            unless --semantic on.
  --semantic  on scores the semantic search too, auto (default) only in a full run of the public and private corpora (not with
            --limit, not for own), off never. On a large own library it embeds every asset: tens of minutes.
  --repeat  run each collection N times, into <label>-r1-<collection> to <label>-rN-<collection>, and write the min, max and mean of each metric to
            <UTC date>-<label>-<collection>-repeat-summary.json beside them
${akmUsage}
  --label   names the results folders: <UTC date>-<label>-<collection>. Default label: akm-<version>.`;

interface SystemRow {
  /** The assets akm returned, best first. */
  refs: string[];
  /** The grade each one has for this query, or null when nobody judged that pair. */
  grades: (number | null)[];
  seconds: number;
  error?: string;
  /** The call was killed at its time limit. It is an error as well: akm was slow, not wrong. */
  timed_out?: true;
  scores?: Scored;
}

type Row = {
  id: string;
  kind: string;
  query: string;
  /** How many assets have grade 2 or 3 for this query. Zero for a non-task input. */
  n_relevant: number;
} & Columns<SystemRow>;

interface Summary {
  eval: string;
  corpus: Corpus;
  /** library or books, or own for the own corpus. */
  collection: string;
  label: string;
  date: string;
  git_commit: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** What akm said it searched with, for each index. A call that says anything else is an error. */
  search_mode: { keyword: string; semantic?: string };
  /** The embedder of the semantic index. Absent from a run without one. */
  semantic_model?: string;
  /** Whether the semantic index was built for this run, or kept from an earlier one: cold, warm, or rebuilt after the kept one failed. */
  semantic_index?: CachedIndex["state"];
  /** Which akm built the semantic index (the version, `akm_bin`, `akm_build` and when akm says it built it). For a kept index it is this run's akm, since the cache keeps an index for one build. */
  semantic_index_built_by?: BuiltBy;
  /** What --semantic said: on, off, or auto, which scores the semantic search only in a full run of the public and private corpora. */
  semantic_flag: SemanticFlag;
  depth: number;
  relevant_from_grade: number;
  limit: number | null;
  n_queries: number;
  n_assets: number;
  /** How long writing and indexing the library took, for each index. A new semantic index embeds every asset. */
  index_seconds: { keyword: number; semantic?: number };
  /** Task queries with at least one relevant asset. Only these have ranking metrics. */
  n_scored: number;
  /** Queries with at least one errored call, in any column. */
  n_errored: number;
  errored: Columns<number>;
  /** The calls, in any column, that akm did not answer within the time limit and that were killed. They are errored calls too, counted here so that a slower akm shows as slower. */
  timeouts: number;
  /** The akm config the eval wrote for each index, secrets redacted. An index with no semantic search has no `semantic`. */
  config: { keyword: unknown; semantic?: unknown };
  /** The LLM engine of that config. Retrieval calls no model, so every field is null. */
  engine: EngineSettings;
  /** One digest over what the run was made from: the files of the library akm indexed, the bundle mappings of bundles.json, and the queries and qrels. It changes when an asset is edited, added, removed or renamed, and when a grade is added. */
  assets_sha256: string;
  /** The digests that assets_sha256 is made of, to tell which input two runs differ in. */
  assets: AssetsDigests;
  /** The seed of the rewrite, for the private corpus only: the seed generate used for the private assets, else the one in private/seed, else null. Absent for the public and own corpora, which are not made from a seed. */
  seed?: string | null;
  metrics: Columns<SystemMetrics>;
  /** The share of inputs where akm returned nothing: for non-task inputs, and for task queries with no relevant asset. */
  abstention: { non_task: Columns<Abstention>; no_answer: Columns<Abstention> };
  results_dir: string;
}

/** The label of a run without --label. */
const defaultLabel = (version: string): string => `akm-${version.replace(/[^A-Za-z0-9._-]+/g, "-")}`;

/** How a collection is named in the output: `public books`, or `own`. */
const where = (corpus: Corpus, collection: string): string => (corpus === collection ? corpus : `${corpus} ${collection}`);

/** The width of a column of the table: the longest label, "semantic curate". */
const COLUMN = 15;

/** How a semantic index came to be, in words. */
const INDEX_STATE = { cold: "a new index", warm: "kept from an earlier run", rebuilt: "a new index, because the kept one was not what it was built as" } as const;

/** The columns a summary has: the keyword ones, and the semantic ones when the run had the semantic index. */
const columnsOf = (s: { metrics: Columns<SystemMetrics> }): System[] => SYSTEMS.filter((sys) => s.metrics[sys] !== undefined);

function printSummary(s: Summary): void {
  const systems = columnsOf(s);
  console.log(`\n${NAME} (${where(s.corpus, s.collection)}) | akm ${s.akm_version}, ${s.semantic_model ? `keyword and semantic (${s.semantic_model})` : "keyword"} search | ${s.n_queries} queries, ${s.n_assets} assets`);
  console.log(`  index ${s.index_seconds.keyword} s for keyword search${s.index_seconds.semantic === undefined ? "" : `, ${s.index_seconds.semantic} s for semantic (${s.semantic_index ? INDEX_STATE[s.semantic_index] : "unknown"})`}`);
  console.log(`  ranking metrics over the ${s.n_scored} task queries that have a relevant asset (grade ${s.relevant_from_grade}+), first ${s.depth} results`);
  console.log(`  ${"".padEnd(16)}  ${systems.map((sys) => labelOf(sys).padEnd(COLUMN)).join("  ")}`.trimEnd());
  const m = s.metrics;
  const row = (label: string, f: (x: SystemMetrics) => string) => console.log(`  ${label.padEnd(16)}  ${systems.map((sys) => f(at(m, sys)).padEnd(COLUMN)).join("  ")}`.trimEnd());
  row("nDCG@10", (x) => fixed(x.ndcg_10));
  row("nDCG@10 judged", (x) => fixed(x.ndcg_10_condensed));
  row("P@5", (x) => fixed(x.p_5));
  row("Success@5", (x) => pct(x.success_5));
  row("MRR", (x) => fixed(x.mrr));
  row("Recall@10", (x) => fixed(x.recall_10));
  row("judged@10", (x) => pct(x.judged_10));
  if (systems.some((sys) => at(m, sys).banned_above !== null)) {
    row("banned above", (x) => pct(x.banned_above));
    row("banned > first", (x) => pct(x.banned_above_first));
  }
  const a = s.abstention;
  const ab = (g: Columns<Abstention>) => systems.map((sys) => `${at(g, sys).abstained}/${at(g, sys).n} ${pct(at(g, sys).rate)}`.padEnd(COLUMN)).join("  ").trimEnd();
  if (a.non_task.search.n > 0) console.log(`  returned nothing, non-task inputs        ${ab(a.non_task)}`);
  if (a.no_answer.search.n > 0) console.log(`  returned nothing, task without answer    ${ab(a.no_answer)}`);
  if (systems.some((sys) => at(s.errored, sys) > 0)) console.log(`  errored calls: ${systems.map((sys) => `${labelOf(sys)} ${at(s.errored, sys)}`).join(", ")} (left out of the numbers)${s.timeouts > 0 ? `, ${s.timeouts} of the calls timed out` : ""}`);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The summaries as columns, never one pooled number. The collections of one corpus, or each collection's corpora side by side. */
function printSideBySide(columns: Summary[]): void {
  const systems = columnsOf(columns[0]).filter((sys) => columns.every((c) => c.metrics[sys] !== undefined));
  const one = columns.every((c) => c.corpus === columns[0].corpus);
  const metrics: [string, (x: SystemMetrics) => string][] = [
    ["nDCG@10", (x) => fixed(x.ndcg_10)],
    ["nDCG@10 judged", (x) => fixed(x.ndcg_10_condensed)],
    ["P@5", (x) => fixed(x.p_5)],
    ["Success@5", (x) => pct(x.success_5)],
    ["MRR", (x) => fixed(x.mrr)],
    ["Recall@10", (x) => fixed(x.recall_10)],
  ];
  const rows: string[][] = [["", ...columns.map((c) => (one ? c.collection : where(c.corpus, c.collection)))], ["queries (scored)", ...columns.map((c) => `${c.n_queries} (${c.n_scored})`)]];
  for (const sys of systems) {
    for (const [label, f] of metrics) rows.push([`${labelOf(sys)} ${label}`, ...columns.map((c) => f(at(c.metrics, sys)))]);
    if (columns.some((c) => at(c.metrics, sys).banned_above !== null)) {
      rows.push([`${labelOf(sys)} banned above`, ...columns.map((c) => pct(at(c.metrics, sys).banned_above))]);
      rows.push([`${labelOf(sys)} banned above first`, ...columns.map((c) => pct(at(c.metrics, sys).banned_above_first))]);
    }
  }
  for (const sys of systems) rows.push([`${labelOf(sys)} abstained, non-task`, ...columns.map((c) => pct(at(c.abstention.non_task, sys).rate))]);
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: ${one ? "the collections" : "the collections, public and private"} side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r.map((cell, i) => cell.padEnd(w[i])).join("  ")}`.trimEnd());
}

/**
 * Whether a run scores the semantic search as well. With --semantic on it does, and with off it does not. With auto, the default, a run
 * with --limit is for checking a setup, and the own set is a library of tens of thousands of assets: both are scored with keyword search alone.
 */
export const withSemantic = (corpus: Corpus, limit?: number, flag: SemanticFlag = "auto"): boolean => (flag === "auto" ? limit === undefined && corpus !== "own" : flag === "on");

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

/** The folder of the private assets, the one with generated.json: it holds the library's, and the books' below them. */
const PRIVATE_ASSETS = join(ROOT, "private", NAME, "assets");

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

/** The qrels files this process has warned about, so that a run of several collections or repeats warns once. */
const warnedQrels = new Set<string>();

/**
 * Scores one collection: its queries and qrels in `folders.assets`, over its library, indexed for keyword search and,
 * unless `ctx.semantic` is false, for semantic search too. The keyword index is made for the run, in the sandbox that
 * `newSandbox` makes. The semantic index is the one of lib/akm's index cache, which keeps it from run to run: `cache` says
 * where, and which akm, for tests.
 */
export async function runCollection(
  corpus: Corpus,
  collection: string,
  ctx: { label?: string; limit?: number; semantic: boolean; semanticFlag?: SemanticFlag; seed?: string | null; callTimeoutMs?: number; newSandbox?: () => Sandbox; cache?: Pick<IndexSpec, "root" | "cmd"> },
  folders: Folders,
): Promise<Summary> {
  let all: Query[];
  let qrels: Qrel[];
  const queriesFile = join(folders.assets, "queries.jsonl");
  const qrelsFile = join(folders.assets, "qrels.jsonl");
  try {
    all = parseQueries(readFileSync(queriesFile, "utf8"), queriesFile);
    qrels = parseQrels(readFileSync(qrelsFile, "utf8"), qrelsFile);
  } catch (e) {
    fail(`${(e as Error).message}${corpus === "own" ? `\n${OWN_HELP}` : ""}`);
  }
  // What the run is made from, as it is now: label may append grades while the run is going. The library is read once, for the digest and for the semantic index kept between runs.
  const library = akm.libraryFiles(folders.library, folders.bundles);
  const assets = assetsDigests(library, queriesFile, qrelsFile);
  const mixed = mixedJudgesWarning(qrels, relative(ROOT, qrelsFile));
  if (mixed && !warnedQrels.has(qrelsFile)) {
    warnedQrels.add(qrelsFile);
    console.error(`${NAME}: warning: ${mixed}`);
  }
  const grades = gradesByQuery(qrels);
  const banned = bannedByQuery(qrels);
  const queries = selectQueries(all, ctx.limit);
  for (const q of queries) {
    if (isTask(q) && !grades.has(q.id)) fail(`${q.id} has no grades in qrels.jsonl.${corpus === "public" && collection === "library" ? " Run evals/retrieval/label first." : ""}`);
  }

  const systems: readonly System[] = ctx.semantic ? SYSTEMS : ["search", "curate"];
  /** What a summary has for each column the run has. */
  const columns = <T>(f: (sys: System) => T): Columns<T> => ({ search: f("search"), curate: f("curate"), ...(ctx.semantic ? { semantic_search: f("semantic_search"), semantic_curate: f("semantic_curate") } : {}) });
  const made: Sandbox[] = [];
  let release = (): void => {};
  try {
    const boxes = { keyword: (ctx.newSandbox ?? (() => createSandbox(NAME)))() } as Record<Mode, Sandbox>;
    made.push(boxes.keyword);
    const version = await akmVersion(boxes.keyword);
    const indexSeconds = { keyword: 0, semantic: 0 };
    const seconds = (t0: number): number => Number(((performance.now() - t0) / 1000).toFixed(1));
    console.log(`${NAME} (${where(corpus, collection)}): indexing for keyword search`);
    const t0 = performance.now();
    const nAssets = await akm.load(boxes.keyword, folders.library, folders.bundles);
    indexSeconds.keyword = seconds(t0);
    console.log(`  ${nAssets} assets indexed in ${indexSeconds.keyword} s`);
    let semanticIndex: CachedIndex["state"] | undefined;
    let builtBy: BuiltBy | undefined;
    if (ctx.semantic) {
      console.log(`${NAME} (${where(corpus, collection)}): indexing for semantic search`);
      const t1 = performance.now();
      const index = await cachedIndex({ name: `${NAME}-${where(corpus, collection).replace(/ /g, "-")}`, version, files: library.files, extra: library.extra, ...ctx.cache }, (sb) => akm.load(sb, folders.library, folders.bundles, true));
      release = index.release;
      boxes.semantic = index.sandbox;
      semanticIndex = index.state;
      builtBy = index.builtBy;
      if (index.entries !== nAssets) fail(`akm indexed ${nAssets} assets for keyword search and ${index.entries} for semantic search.`, 1);
      indexSeconds.semantic = seconds(t1);
      console.log(`  ${nAssets} assets indexed in ${indexSeconds.semantic} s: ${INDEX_STATE[index.state]}`);
      const probe = await akm.ask(boxes.semantic, "search", queries[0].query, DEPTH, "semantic");
      // A probe that does not say it searched with embeddings could be keyword rankings under a semantic name: ask() makes it an error, and this is the same check on the answer.
      if (probe.error || probe.mode !== "semantic") fail(`akm cannot search with its embedder: ${probe.error ?? `its answer says searchMode ${probe.mode ?? "nothing"}, not semantic`}`, 1);
    }
    const configOf = (sb: Sandbox) => redactConfig(JSON.parse(readFileSync(join(sb.dir, "config", "config.json"), "utf8")));
    const config = { keyword: configOf(boxes.keyword), ...(ctx.semantic ? { semantic: configOf(boxes.semantic) } : {}) };
    const label = ctx.label ?? defaultLabel(version);
    const dir = makeResultsDir(folders.results, `${label}-${collection}`);
    const samples = join(dir, "samples.jsonl");
    writeFileSync(samples, "");
    console.log(`${NAME} (${where(corpus, collection)}): akm ${version}, ${nAssets} assets, ${queries.length} of ${all.length} queries`);

    const rows: Row[] = [];
    const seen: Record<Mode, Set<string>> = { keyword: new Set(), semantic: new Set() };
    for (const q of queries) {
      const g = grades.get(q.id) ?? {};
      const nRelevant = Object.values(g).filter((x) => x >= RELEVANT).length;
      const answers = {} as Columns<SystemRow>;
      for (const sys of systems) {
        const a = await akm.ask(boxes[modeOf(sys)], commandOf(sys), q.query, DEPTH, modeOf(sys), ctx.callTimeoutMs);
        if (a.mode) seen[modeOf(sys)].add(a.mode);
        answers[sys] = {
          refs: a.refs,
          grades: a.refs.map((r) => (Object.hasOwn(g, r) ? g[r] : null)),
          seconds: a.seconds,
          ...(a.error ? { error: a.error } : {}),
          ...(a.timedOut ? { timed_out: true as const } : {}),
          ...(isTask(q) && nRelevant > 0 && !a.error ? { scores: scoreQuery(g, a.refs, banned.get(q.id)) } : {}),
        };
      }
      const row: Row = { id: q.id, kind: q.kind, query: q.query, n_relevant: nRelevant, ...answers };
      rows.push(row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      const errors = systems.filter((s) => at(row, s).error);
      console.log(`  [${String(rows.length).padStart(String(queries.length).length)}/${queries.length}] ${q.id} ${q.kind.padEnd(12)} ${systems.map((sys) => `${labelOf(sys)} ${at(row, sys).refs.length}`).join(" ")}${errors.length ? `  ERROR ${errors.map((s) => `${labelOf(s)}: ${at(row, s).error}`).join(" | ").slice(0, 150)}` : ""}`);
    }

    const scored = rows.filter((r) => isTask(r) && r.n_relevant > 0);
    const noAnswer = rows.filter((r) => isTask(r) && r.n_relevant === 0);
    const nonTask = rows.filter((r) => !isTask(r));
    const ok = (rs: Row[], s: System) => rs.filter((r) => !at(r, s).error);
    const summary: Summary = {
      eval: NAME,
      corpus,
      collection,
      label,
      date: new Date().toISOString(),
      git_commit: gitCommit(ROOT),
      akm_version: version,
      ...akmBuild(),
      search_mode: { keyword: [...seen.keyword].sort().join(", ") || "unknown", ...(ctx.semantic ? { semantic: [...seen.semantic].sort().join(", ") || "unknown" } : {}) },
      ...(ctx.semantic ? { semantic_model: SEMANTIC_MODEL, semantic_index: semanticIndex, semantic_index_built_by: builtBy } : {}),
      semantic_flag: ctx.semanticFlag ?? "auto",
      depth: DEPTH,
      relevant_from_grade: RELEVANT,
      limit: ctx.limit ?? null,
      n_queries: rows.length,
      n_assets: nAssets,
      index_seconds: { keyword: indexSeconds.keyword, ...(ctx.semantic ? { semantic: indexSeconds.semantic } : {}) },
      n_scored: scored.length,
      n_errored: rows.filter((r) => systems.some((s) => at(r, s).error)).length,
      errored: columns((s) => rows.filter((r) => at(r, s).error).length),
      timeouts: rows.reduce((n, r) => n + systems.filter((s) => at(r, s).timed_out).length, 0),
      config,
      engine: engineSettings(config.keyword),
      assets_sha256: assetsSha256(assets),
      assets,
      ...(corpus === "private" ? { seed: ctx.seed ?? null } : {}),
      metrics: columns((s) => summarize(ok(scored, s).map((r) => at(r, s).scores as Scored))),
      abstention: {
        non_task: columns((s) => abstention(ok(nonTask, s).map((r) => at(r, s).refs.length))),
        no_answer: columns((s) => abstention(ok(noAnswer, s).map((r) => at(r, s).refs.length))),
      },
      results_dir: dir,
    };
    const { results_dir: _dir, ...stored } = summary;
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
    printSummary(summary);
    return summary;
  } finally {
    release();
    for (const sb of made) removeSandbox(sb);
  }
}

async function main(): Promise<void> {
  let values: { akm?: string; corpus?: string; limit?: string; repeat?: string; label?: string; semantic?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, repeat: { type: "string" }, ...AKM_OPTIONS, label: { type: "string" }, semantic: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`retrieval: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  useAkm(values, fail);
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "own" && corpus !== "all") fail(`--corpus must be public, private, own or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  if (values.label !== undefined && !/^[A-Za-z0-9._-]+$/.test(values.label)) fail("--label may use letters, digits, dot, dash and underscore");
  const flag = values.semantic ?? "auto";
  if (!(SEMANTIC_FLAGS as readonly string[]).includes(flag)) fail(`--semantic must be on, off or auto, not "${flag}"`);
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];

  const sets = corpora.flatMap((c) => collectionsFor(c).map((s) => ({ corpus: c, ...s })));
  for (const { corpus: c, folders: f } of sets) {
    if (c === "public" || [f.library, join(f.assets, "queries.jsonl"), join(f.assets, "qrels.jsonl")].every(existsSync)) continue;
    fail(c === "own" ? `private/${NAME}/own/ does not hold a set in the eval's format.\n${OWN_HELP}` : `the private assets are missing (${relative(ROOT, f.assets)}/). Make them with: ./generate-assets --only ${NAME}`);
  }
  // The private assets are the rewrite of public files: if those changed since (label appended grades, the library moved), they are another set.
  if (corpora.includes("private")) {
    const stale = staleAssets(PRIVATE_ASSETS, ROOT, relative(ROOT, PRIVATE_ASSETS));
    if (stale) fail(stale);
  }
  const summaries: Summary[] = [];
  let label = values.label;
  if (repeat !== undefined && label === undefined) {
    const probe = createSandbox(NAME);
    try {
      label = defaultLabel(await akmVersion(probe).catch((e: Error) => fail(e.message)));
    } finally {
      removeSandbox(probe);
    }
  }
  for (const s of sets) {
    const seed = s.corpus === "private" ? (readGenerated(PRIVATE_ASSETS)?.seed ?? readSeed(ROOT)) : null;
    const run = (runLabel: string | undefined) => runCollection(s.corpus, s.name, { label: runLabel, limit, semantic: withSemantic(s.corpus, limit, flag as SemanticFlag), semanticFlag: flag as SemanticFlag, seed }, s.folders);
    // A run's folder is <label>-rN-<collection>, so the repeat summary is named <label>-<collection>, and the collections' do not collide.
    if (repeat === undefined) summaries.push(await run(label));
    else summaries.push(...(await repeatRuns(repeat, `${label}-${s.name}`, (runLabel) => run(`${label}-r${runLabel.slice(runLabel.lastIndexOf("-r") + 2)}`))));
  }
  if (summaries.length > 1 && repeat === undefined) printSideBySide([...new Set(summaries.map((s) => s.collection))].flatMap((name) => summaries.filter((s) => s.collection === name)));
  const semanticErrors = summaries.reduce((n, s) => n + (s.errored.semantic_search ?? 0) + (s.errored.semantic_curate ?? 0), 0);
  if (semanticErrors > 0) fail(`${semanticErrors} semantic calls failed, or answered with keyword search. Their queries are left out of the semantic columns: see the errors in samples.jsonl.`, 1);
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
