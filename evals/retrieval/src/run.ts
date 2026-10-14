#!/usr/bin/env bun
// retrieval: indexes the library in two sandboxes, for keyword search and for semantic search, runs `akm search`
// and `akm curate` on both for every query, and scores them against the graded assets. The semantic search is akm's
// built-in embedder, a small model that runs in the akm process. A run with --limit, and an own corpus, leave it out
// unless --semantic on asks for it. See ../README.md.
//
//   evals/retrieval/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND] [--semantic on|off|auto]

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, SEMANTIC_MODEL, type Sandbox, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, resolveCorpora } from "../../../lib/corpus.ts";
import { type BuiltBy, type CachedIndex } from "../../../lib/akm/index-cache.ts";
import { type RunManifest, buildManifest, caseDigests, completionOf, corpusFolderOf } from "../../../lib/manifest.ts";
import { type EngineSettings, engineSettings, harnessSha256, sha256Text } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import * as akm from "./akm.ts";
import { type IndexInput, INDEX_STATE, NAME, collectQuery, openIndexes, systemsFor } from "./collect.ts";
import { type AssetsDigests, assetsDigests, assetsSha256 } from "./inputs.ts";
import { type Qrel, type Query, casesOf, fixed, isTask, mixedJudgesWarning, parseQrels, parseQueries, pct, selectQueries } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Abstention, type Columns, DEPTH, RELEVANT, type Row, type System, type SystemMetrics, SYSTEMS, at, semanticFailure, summarizeRows } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
export { SYSTEMS };
const labelOf = (sys: System): string => `${sys.startsWith("semantic_") ? "semantic " : ""}${sys.endsWith("curate") ? "curate" : "search"}`;
/** What --semantic says: score the semantic search (on), never (off), or only in a full run of the public and rewrite corpora (auto). */
const SEMANTIC_FLAGS = ["on", "off", "auto"] as const;
export type SemanticFlag = (typeof SEMANTIC_FLAGS)[number];

const OWN_HELP = `Your own set is a folder with queries.jsonl and qrels.jsonl in the format that evals/${NAME}/assets/README.md describes, and library/, the folder akm should index (a link to it works). A library of several bundles needs bundles.json too. Run it with: evals/${NAME}/run --cases DIR`;

const USAGE = `Usage: evals/retrieval/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND] [--semantic on|off|auto]

For each collection of queries, indexes its library in two sandboxes, for keyword search and for semantic search, asks
akm search and akm curate of both for the first ${DEPTH} results of every query, and scores them against the collection's
qrels. Each collection is scored on its own. The semantic search is akm's built-in embedder, ${SEMANTIC_MODEL}, which runs
in the akm process and is downloaded once into .cache/ (133 MB). The semantic index is kept in .cache/akm-index/ and reused
by the next run, unless a file of the library changed or akm is not the same. A corpus of your own and a run with --limit are
scored with keyword search only, unless --semantic on says otherwise. Needs akm on PATH, or in AKM_BIN.

  --corpus  public (default) runs the collections in assets/: the library in corpus/library and the books.
            custom runs a corpus of your own (--cases DIR), else the default one: the rewrite of the public collections in
            private/retrieval/assets/, made by ./generate-assets --only retrieval.
            all runs public and the default custom corpus.
  --cases   the folder of a custom corpus of your own: queries.jsonl, qrels.jsonl and library/, and bundles.json for a library
            of bundles. It is --corpus custom. See "Run your own set" in evals/retrieval/README.md.
  -y, --yes  accepted and not needed: this eval sends your set to no model.
  --limit   run N queries of each collection, in the task and non-task proportion of the whole set. Keyword search only,
            unless --semantic on.
  --semantic  on scores the semantic search too, auto (default) only in a full run of the public and rewrite corpora (not with
            --limit, not for a corpus of your own), off never. On a large own library it embeds every asset: tens of minutes.
  --repeat  run each collection N times, into <label>-r1-<collection> to <label>-rN-<collection>, and write the min, max and mean of each metric to
            <UTC date>-<label>-<collection>-repeat-summary.json beside them
${akmUsage}
  --label   names the results folders: <UTC date>-<label>-<collection>. Default label: akm-<version>.`;


interface Summary {
  eval: string;
  /** `public` or `custom`: the corpus the run read. */
  corpus: string;
  /** The folder of a custom corpus from the repository root, or null when it is outside the repository and for the public corpus. Never an absolute path: it can name what is in it. scripts/rescore reads the cases from it. */
  corpus_folder: string | null;
  /** library or books, or own for a corpus of your own. */
  collection: string;
  label: string;
  date: string;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  /** What akm said it searched with, for each index. A call that says anything else is an error. */
  search_mode: { keyword: string; semantic?: string };
  /** The embedder of the semantic index. Absent from a run without one. */
  semantic_model?: string;
  /** Whether the semantic index was built for this run, or kept from an earlier one: cold, warm, or rebuilt after the kept one failed. */
  semantic_index?: CachedIndex["state"];
  /** Which akm built the semantic index (the version, `akm_bin`, `akm_build` and when akm says it built it). For a kept index it is this run's akm, since the cache keeps an index for one build. */
  semantic_index_built_by?: BuiltBy;
  /** What --semantic said: on, off, or auto, which scores the semantic search only in a full run of the public and rewrite corpora. */
  semantic_flag: SemanticFlag;
  depth: number;
  relevant_from_grade: number;
  limit: number | null;
  n_queries: number;
  n_assets: number;
  /** How long writing and indexing the library took, for each index. A new semantic index embeds every asset. */
  index_seconds: { keyword: number; semantic?: number };
  /** "aborted" when a semantic call failed, so that its query is left out of the semantic columns: the run then exits with 1. Then aborted_reason says why. Each collection's summary says it for itself. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
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
  /** The seed of the rewrite, for a rewrite corpus: the seed in its corpus config. Null for the public corpus and an own one, which are not made from a seed. */
  seed: string | null;
  metrics: Columns<SystemMetrics>;
  /** The share of inputs where akm returned nothing: for non-task inputs, and for task queries with no relevant asset. */
  abstention: { non_task: Columns<Abstention>; no_answer: Columns<Abstention> };
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

/** What the run fails with once its summaries are written: undefined unless one of them is aborted. The message counts the failed semantic calls of all of them. */
export function failureOf(summaries: Pick<Summary, "status" | "errored">[]): string | undefined {
  if (!summaries.some((s) => s.status === "aborted")) return undefined;
  return semanticFailure(summaries.reduce((n, s) => n + (s.errored.semantic_search ?? 0) + (s.errored.semantic_curate ?? 0), 0));
}

/** The label of a run without --label. */
const defaultLabel = (version: string): string => `akm-${version.replace(/[^A-Za-z0-9._-]+/g, "-")}`;

/** A corpus of your own: custom, and not the rewrite. */
const isOwn = (c: ResolvedCorpus): boolean => c.name === "custom" && !c.rewrite;

/** How a collection is named in the output: `public books`, or `custom own`. */
const where = (corpus: string, collection: string): string => `${corpus} ${collection}`;

/** The folder of the kept semantic index of a collection: `retrieval-public-library`, `retrieval-rewrite-books`. Each own folder has an index of its own, named by its place, so a second one does not replace the first. */
const indexName = (c: ResolvedCorpus, collection: string): string => `${NAME}-${isOwn(c) ? `own-${sha256Text(c.folder).slice(0, 8)}` : `${c.name === "public" ? "public" : "rewrite"}-${collection}`}`;

/** The width of a column of the table: the longest label, "semantic curate". */
const COLUMN = 15;

function printSummary(s: Summary): void {
  const systems = SYSTEMS.filter((sys) => s.metrics[sys] !== undefined);
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
  const systems = SYSTEMS.filter((sys) => columns.every((c) => c.metrics[sys] !== undefined));
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
  console.log(`\n${NAME}: ${one ? "the collections" : "the collections, public and custom"} side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r.map((cell, i) => cell.padEnd(w[i])).join("  ")}`.trimEnd());
}

/**
 * Whether a run scores the semantic search as well. With --semantic on it does, and with off it does not. With auto, the default, a run
 * with --limit is for checking a setup, and a corpus of your own may be a library of tens of thousands of assets: both are scored with keyword search alone.
 */
export const withSemantic = (own: boolean, limit?: number, flag: SemanticFlag = "auto"): boolean => (flag === "auto" ? limit === undefined && !own : flag === "on");

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
export function collectionsFor(c: ResolvedCorpus): { name: string; folders: Folders }[] {
  const results = c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results");
  if (isOwn(c)) return [{ name: "own", folders: { library: join(c.folder, "library"), assets: c.folder, results, bundles: join(c.folder, "bundles.json") } }];
  return [
    { name: "library", folders: { library: c.name === "public" ? join(ROOT, "corpus", "library") : join(c.folder, "library"), assets: c.folder, results } },
    { name: "books", folders: { library: join(c.folder, "books", "library"), assets: join(c.folder, "books"), results } },
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
  corpus: ResolvedCorpus,
  collection: string,
  ctx: { label?: string; limit?: number; semantic: boolean; semanticFlag?: SemanticFlag; callTimeoutMs?: number; newSandbox?: () => Sandbox; cache?: IndexInput["cache"] },
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
    fail(`${(e as Error).message}${isOwn(corpus) ? `\n${OWN_HELP}` : ""}`);
  }
  // What the run is made from, as it is now: label may append grades while the run is going. The library is read once, for the digest and for the semantic index kept between runs.
  const library = akm.libraryFiles(folders.library, folders.bundles);
  const assets = assetsDigests(library, queriesFile, qrelsFile);
  const mixed = mixedJudgesWarning(qrels, relative(ROOT, qrelsFile));
  if (mixed && !warnedQrels.has(qrelsFile)) {
    warnedQrels.add(qrelsFile);
    console.error(`${NAME}: warning: ${mixed}`);
  }
  const cases = casesOf(selectQueries(all, ctx.limit), qrels);
  for (const c of cases) {
    if (isTask(c) && Object.keys(c.grades).length === 0) fail(`${c.id} has no grades in qrels.jsonl.${corpus.name === "public" && collection === "library" ? " Run evals/retrieval/label first." : ""}`);
  }

  const systems = systemsFor(ctx.semantic);
  const indexes = await openIndexes({ title: where(corpus.name, collection), name: indexName(corpus, collection), library: folders.library, bundles: folders.bundles, contents: library, semantic: ctx.semantic, probe: cases[0].query, newSandbox: ctx.newSandbox, cache: ctx.cache });
  try {
    const { version, nAssets } = indexes;
    const label = ctx.label ?? defaultLabel(version);
    const dir = makeResultsDir(folders.results, `${label}-${collection}`);
    const samples = join(dir, "samples.jsonl");
    writeFileSync(samples, "");
    console.log(`${NAME} (${where(corpus.name, collection)}): akm ${version}, ${nAssets} assets, ${cases.length} of ${all.length} queries`);

    const rows: Row[] = [];
    const seen = { keyword: new Set<string>(), semantic: new Set<string>() };
    for (const c of cases) {
      const { row, modes } = await collectQuery(indexes.boxes, c, systems, ctx.callTimeoutMs);
      for (const [mode, said] of modes) seen[mode].add(said);
      rows.push(row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      const errors = systems.filter((s) => at(row, s).error);
      console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id} ${c.kind.padEnd(12)} ${systems.map((sys) => `${labelOf(sys)} ${at(row, sys).refs.length}`).join(" ")}${errors.length ? `  ERROR ${errors.map((s) => `${labelOf(s)}: ${at(row, s).error}`).join(" | ").slice(0, 150)}` : ""}`);
    }

    const build = akmBuild();
    const seed = corpus.seed;
    const manifest = buildManifest({
      measurement: MEASUREMENT,
      corpus: corpus.name,
      collection,
      // what each query presents to akm: its text, in the library the run indexed. A library with another file in it is another input for every query.
      cases: caseDigests(MEASUREMENT, cases, () => ({ library_sha256: assets.library_sha256, bundles_sha256: assets.bundles_sha256 })),
      akm: { version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
      config: indexes.config,
      settings: { timeout_ms: ctx.callTimeoutMs ?? akm.CALL_TIMEOUT_MS, seed },
      completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
    });
    const summary: Summary = {
      eval: NAME,
      corpus: corpus.name,
      corpus_folder: corpus.name === "public" ? null : corpusFolderOf(corpus.folder),
      collection,
      label,
      date: new Date().toISOString(),
      git_commit: gitCommit(ROOT),
      harness_sha256: HARNESS,
      akm_version: version,
      ...build,
      search_mode: { keyword: [...seen.keyword].sort().join(", ") || "unknown", ...(ctx.semantic ? { semantic: [...seen.semantic].sort().join(", ") || "unknown" } : {}) },
      ...(ctx.semantic ? { semantic_model: SEMANTIC_MODEL, semantic_index: indexes.semanticIndex, semantic_index_built_by: indexes.builtBy } : {}),
      semantic_flag: ctx.semanticFlag ?? "auto",
      depth: DEPTH,
      relevant_from_grade: RELEVANT,
      limit: ctx.limit ?? null,
      n_assets: nAssets,
      index_seconds: indexes.indexSeconds,
      ...summarizeRows(rows),
      config: indexes.config,
      engine: engineSettings(indexes.config.keyword),
      assets_sha256: assetsSha256(assets),
      assets,
      seed,
      manifest,
      results_dir: dir,
    };
    const { results_dir: _dir, ...stored } = summary;
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
    printSummary(summary);
    return summary;
  } finally {
    indexes.close();
  }
}

async function main(): Promise<void> {
  let values: { akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; label?: string; semantic?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...AKM_OPTIONS, label: { type: "string" }, semantic: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`retrieval: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  try {
  } catch (e) {
    fail((e as Error).message);
  }
  useAkm(values, fail);
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: join(EVAL_DIR, "assets"), fail });
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  if (values.label !== undefined && !/^[A-Za-z0-9._-]+$/.test(values.label)) fail("--label may use letters, digits, dot, dash and underscore");
  const flag = values.semantic ?? "auto";
  if (!(SEMANTIC_FLAGS as readonly string[]).includes(flag)) fail(`--semantic must be on, off or auto, not "${flag}"`);

  const sets = corpora.flatMap((c) => collectionsFor(c).map((s) => ({ corpus: c, ...s })));
  for (const { corpus: c, folders: f } of sets) {
    if (c.name === "public" || [f.library, join(f.assets, "queries.jsonl"), join(f.assets, "qrels.jsonl")].every(existsSync)) continue;
    fail(isOwn(c) ? `${c.flag} does not hold a set in the eval's format.\n${OWN_HELP}` : `the private assets are missing (${relative(ROOT, f.assets)}/). Make them with: ./generate-assets --only ${NAME}`);
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
    const run = (runLabel: string | undefined) => runCollection(s.corpus, s.name, { label: runLabel, limit, semantic: withSemantic(isOwn(s.corpus), limit, flag as SemanticFlag), semanticFlag: flag as SemanticFlag }, s.folders);
    // A run's folder is <label>-rN-<collection>, so the repeat summary is named <label>-<collection>, and the collections' do not collide.
    if (repeat === undefined) summaries.push(...await repeatRuns(undefined, label ?? "", () => run(label)));
    else summaries.push(...(await repeatRuns(repeat, `${label}-${s.name}`, (runLabel) => run(`${label}-r${runLabel.slice(runLabel.lastIndexOf("-r") + 2)}`))));
  }
  if (summaries.length > 1 && repeat === undefined) printSideBySide([...new Set(summaries.map((s) => s.collection))].flatMap((name) => summaries.filter((s) => s.collection === name)));
  // The summaries are written, and say so, before the run fails.
  const failure = failureOf(summaries);
  if (failure !== undefined) fail(failure, 1);
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
