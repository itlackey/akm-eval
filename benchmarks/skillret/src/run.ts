#!/usr/bin/env bun
// skillret: given a request, does akm rank the right skills first from a large skill library? Writes the skills of
// SkillRet into two sandboxes as akm assets, indexes them for keyword search and for semantic search, runs `akm search`
// on both for every query, and scores it with the benchmark's metrics. `akm curate` is run on a sample of the queries,
// to check that it returns search's ranking. The semantic search is akm's built-in embedder, a small model that runs in
// the akm process, and a run with --limit leaves it out. See ../README.md.
//
//   benchmarks/skillret/run [--corpus public|custom|all] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND]

import { appendFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, SEMANTIC_MODEL, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit } from "../../../lib/cli.ts";
import { type ResolvedCorpus, CORPUS_OPTIONS, corpusRecord, resolveCorpora } from "../../../lib/corpus.ts";
import { type CachedIndex } from "../../../lib/akm/index-cache.ts";
import { buildManifest, caseDigests, completionOf, lockedParts, type RunManifest } from "../../../lib/manifest.ts";
import { harnessSha256, redactConfig, sha256Json } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import * as akm from "./akm.ts";
import { type CollectContext, INDEX_STATE, NAME, collect, withSemantic } from "./collect.ts";
import { type Corpus, SEED, assetsDigest, loadCorpus, readLock } from "./dataset.ts";
import { MEASUREMENT } from "./measurement.ts";
import { PUBLISHED } from "./published.ts";
import { CURATE_CHECK } from "./sample.ts";
import { type CurateAgreement, type CurateCheck, KS, type Lines, METRICS, type Scores, SYSTEMS, type System, callsFailure, failedCalls, modeOf, MODES, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
const labelOf = (sys: System): string => (modeOf(sys) === "semantic" ? "akm search, semantic" : "akm search");

/** The label of a run without --label. */
const defaultLabel = (version: string): string => `akm-${version.replace(/[^A-Za-z0-9._-]+/g, "-")}`;

const USAGE = `Usage: benchmarks/skillret/run [--corpus public|custom|all] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND]

Writes the skills of SkillRet into two sandboxes as akm assets, indexes them for keyword search and for semantic search,
asks akm search of both for the first ${akm.DEPTH} skills of every query, and scores it with the benchmark's metrics: NDCG, Recall,
Completeness and MAP at 5, 10 and 15. akm curate is asked of ${CURATE_CHECK} of the queries, to check that it returns search's
ranking. The semantic search is akm's built-in embedder, ${SEMANTIC_MODEL}, which runs in the akm process and is
downloaded once into .cache/ (133 MB). The semantic index is kept in .cache/akm-index/ and reused by the next run, unless
a skill changed or akm is not the same. Needs akm on PATH, or in AKM_BIN.

  --corpus  public (default) is the test split: 6,006 skills and 4,392 queries, fetched into assets/ at the pinned
            revision. custom is a library of the same size drawn from the train split, with train queries in the
            test split's mix of one, two and three skills. It is a split of the dataset and has no folder, so it takes
            no --cases. all runs both. --corpus private works for one more release, as --corpus custom.
  --limit   run N queries, drawn at random in proportion to how many skills a query needs. Never the first N. Keyword
            search only: a run of a few queries is for checking a setup, and a semantic index takes a quarter of an hour to build.
  --repeat  run each corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default label: akm-<version>.`;

interface Summary {
  eval: string;
  /** `public` for the test split, `custom` for the train split drawn as the private library. */
  corpus: string;
  /** `public`, or `split`: a custom corpus drawn from the dataset, with no folder. */
  corpus_kind: string;
  corpus_private: boolean;
  /** Always null: a split has no folder, and the data files are digested in assets_sha256. */
  corpus_folder: null;
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
  /** What akm said it searched with, for each index. The run stops at a call that says anything else. */
  search_mode: { keyword: string; semantic?: string };
  /** The embedder of the semantic index. Absent from a run without one. */
  semantic_model?: string;
  /** Whether the semantic index was built for this run, or kept from an earlier one: cold, warm, or rebuilt after the kept one failed. */
  semantic_index?: CachedIndex["state"];
  /** The akm that built the semantic index, kept or new: its version, command and build, and when it says it built the index. Absent from a run without one. */
  semantic_index_built_by?: CachedIndex["builtBy"];
  /** The akm config each index ran with, as the sandbox's config file has it and with any secret redacted. It holds semanticSearchMode and embedding.queryTimeoutMs. No LLM engine runs here, so there is no engine entry. */
  config: { keyword: unknown; semantic?: unknown };
  dataset: Record<string, unknown>;
  /** One sha256 over the data files the corpus read (skills, queries and qrels), named by their place in assets/. */
  assets_sha256: string;
  /** The seed that drew the custom library and its queries, as text: SEED, which is in the code. Null for public, whose library is the fixed test split; a --limit draw is in `sample`. */
  seed: string | null;
  sample: Record<string, unknown>;
  /** "aborted" when an akm call failed, so that its query is left out of the numbers or of the curate check: the run then exits with 1. Then aborted_reason says why. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  depth: number;
  workers: number;
  n_skills: number;
  n_queries: number;
  /** Calls that failed, and are left out of that line's numbers. */
  errored: Lines<number>;
  /** Of the failed calls, those that failed because akm did not answer within the call's time limit. */
  timeouts: Lines<number>;
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
  /** What the run was made of: the parts that decide whether it compares with another run (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
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
    if (at(s.errored, sys) > 0) console.log(`  errored calls: ${labelOf(sys)} ${at(s.errored, sys)} (left out of its numbers${at(s.timeouts, sys) > 0 ? `; ${at(s.timeouts, sys)} of them timed out` : ""})`);
  }
  printCurateCheck(s.curate_check);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** One line when akm curate returned search's ranking for every checked query, and a loud one when it did not. */
function printCurateCheck(check: CurateCheck): void {
  const checked = MODES.flatMap((mode) => (check[mode] ? [{ mode, ...(check[mode] as CurateAgreement) }] : []));
  for (const c of checked) {
    if (c.errored > 0) console.log(`  curate check: ${c.errored} curate calls on the ${c.mode} index failed${c.timeouts > 0 ? ` (${c.timeouts} of them timed out)` : ""}, and their queries were not compared`);
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

/** The public and custom corpus as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const systems = linesOf(a).filter((sys) => b.metrics[sys] !== undefined);
  const rows: string[][] = [["", a.corpus, b.corpus], ["queries", String(a.n_queries), String(b.n_queries)], ["skills", String(a.n_skills), String(b.n_skills)]];
  for (const sys of systems) for (const m of METRICS) rows.push([`${labelOf(sys).slice(4)} ${m}@10`, percent(at(a.metrics, sys)[`${m}@10`]), percent(at(b.metrics, sys)[`${m}@10`])]);
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padStart(w[1])}  ${r[2].padStart(w[2])}`);
}

export interface Folders {
  /** The data files and ASSETS.lock. */
  assets: string;
  /** Where the results folder goes. */
  results: string;
}

/** The corpus of a dataset corpus as lib/corpus.ts names it: the test split is public, and the train split is a custom corpus of kind "split", which has no folder and holds nothing private. */
const resolvedOf = (data: Corpus): ResolvedCorpus =>
  data.corpus === "public"
    ? { name: "public", folder: "", config: { kind: "public", private: false }, configFile: null, flag: "--corpus public" }
    : { name: "custom", folder: "", config: { kind: "split", private: false }, configFile: null, flag: "--corpus custom" };

/** What the run fails with once its summaries are written: undefined unless one of them is aborted. The message counts the failed calls of all of them. */
export function failureOf(summaries: Pick<Summary, "status" | "errored" | "timeouts" | "curate_check">[]): string | undefined {
  if (!summaries.some((s) => s.status === "aborted")) return undefined;
  return callsFailure(summaries.map(failedCalls).reduce((all, one) => ({ errored: all.errored + one.errored, timedOut: all.timedOut + one.timedOut }), { errored: 0, timedOut: 0 }));
}

/**
 * Runs one corpus: the collector (collect.ts) indexes its skills for keyword search and, unless `ctx.semantic` is false, for semantic search too, asks
 * akm search for every query and akm curate for a sample of them, and builds the rows; this scores the rows, writes the results and the manifest.
 * The semantic index is the one of lib/akm's index cache, which keeps it from run to run: `cache` says where, and which akm, for tests.
 */
export async function runCorpus(corpus: Corpus, ctx: CollectContext & { label?: string; limit?: number }, folders: Folders): Promise<Summary> {
  const parts = lockedParts(MEASUREMENT); // stops the run, before it collects anything, when MEASUREMENT.lock has no entry for the eval
  const { skills, queries } = corpus;
  const resolved = resolvedOf(corpus);
  const library = sha256Json(akm.skillFiles(skills)); // what every query is asked of
  const started = {} as { label: string; dir: string; samples: string; assetsSha256: string };
  const { rows, ...collected } = await collect(
    corpus,
    ctx,
    (version) => {
      started.label = ctx.label ?? defaultLabel(version);
      started.dir = makeResultsDir(folders.results, started.label);
      started.samples = join(started.dir, "samples.jsonl");
      writeFileSync(started.samples, "");
      // Digested before the calls, since it says what the run read.
      started.assetsSha256 = assetsDigest(folders.assets, corpus.corpus);
    },
    (row) => appendFileSync(started.samples, `${JSON.stringify(row)}\n`),
  );
  writeFileSync(started.samples, rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const counts = summarize(rows);
  const lock = readLock(folders.assets);
  const build = akmBuild();
  const seed = corpus.corpus === "private" ? String(SEED) : null;
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts,
    corpus: resolved.name,
    // every query is asked of the same library: a skill that changed, or another akm layout of it, is another input for all of them
    cases: caseDigests(MEASUREMENT, queries, () => library),
    akm: { version: collected.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config: collected.configs,
    engines: {}, // no model service is called
    settings: { strategy: null, config_patch_sha256: null, timeout_ms: ctx.callTimeoutMs ?? null, seed },
    completion: completionOf(MEASUREMENT, queries.map((q) => q.id), rows),
  });
  const summary: Summary = {
    eval: NAME,
    ...corpusRecord(resolved),
    corpus_folder: null,
    label: started.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    akm_version: collected.version,
    ...build,
    search_mode: { keyword: [...collected.seen.keyword].sort().join(", ") || "unknown", ...(ctx.semantic ? { semantic: [...collected.seen.semantic].sort().join(", ") || "unknown" } : {}) },
    ...(ctx.semantic ? { semantic_model: SEMANTIC_MODEL, semantic_index: collected.semanticIndex, semantic_index_built_by: collected.builtBy } : {}),
    config: { keyword: redactConfig(collected.configs.keyword), ...(ctx.semantic ? { semantic: redactConfig(collected.configs.semantic) } : {}) },
    dataset: { name: lock.dataset, source: lock.source, revision: lock.revision, licence: lock.licence, sha256: Object.fromEntries(Object.entries(lock.files).map(([name, f]) => [name, f.sha256])) },
    assets_sha256: started.assetsSha256,
    seed,
    sample: corpus.sample,
    status: counts.status,
    aborted_reason: counts.aborted_reason,
    depth: akm.DEPTH,
    workers: collected.workers,
    n_skills: skills.length,
    n_queries: counts.n_queries,
    errored: counts.errored,
    timeouts: counts.timeouts,
    no_results: counts.no_results,
    metrics: counts.metrics,
    by_size: counts.by_size,
    curate_check: counts.curate_check,
    index_seconds: { keyword: Number(collected.indexSeconds.keyword.toFixed(1)), ...(ctx.semantic ? { semantic: Number(collected.indexSeconds.semantic.toFixed(1)) } : {}) },
    query_seconds: Number(collected.querySeconds.toFixed(1)),
    call_seconds: counts.call_seconds,
    manifest,
    results_dir: started.dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(started.dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary, corpus.corpus === "public" && ctx.limit === undefined);
  return summary;
}

async function main(): Promise<void> {
  let values: { akm?: string; corpus?: string; limit?: string; repeat?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: CORPUS_OPTIONS.corpus, limit: { type: "string" }, repeat: { type: "string" }, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`skillret: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  useAkm(values, fail);
  const assets = join(EVAL_DIR, "assets");
  // The custom corpus is a split of the dataset: it has no folder, so there is nothing to give it and no notes in it to keep from a model. --corpus private is its old name.
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: assets, default: "split", aliases: { private: { folder: "", kind: "split" } }, fail });
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  if (values.label !== undefined && !/^[A-Za-z0-9._-]+$/.test(values.label)) fail("--label may use letters, digits, dot, dash and underscore");

  // The runs of a repeat are named <label>-r1 to <label>-rN, so the label of a run without --label is known before the first of them: it is the one a single run takes.
  let label = values.label;
  if (repeat !== undefined && label === undefined) {
    const probe = createSandbox(NAME);
    try {
      label = defaultLabel(await akmVersion(probe).catch((e: Error) => fail(e.message)));
    } finally {
      removeSandbox(probe);
    }
  }
  const summaries: Summary[] = [];
  for (const c of corpora) {
    const data = await loadCorpus(c.name === "public" ? "public" : "private", assets, limit);
    const results = c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results");
    const run = (runLabel: string | undefined) => runCorpus(data, { label: runLabel, limit, semantic: withSemantic(limit) }, { assets, results });
    if (repeat === undefined) summaries.push(await run(label));
    else {
      // The repeat summary spreads n_errored. This summary counts the calls that failed for each line, and the repeat summary takes their sum.
      const runs = await repeatRuns(repeat, label as string, async (runLabel) => {
        const summary = await run(runLabel);
        return { ...summary, n_errored: failedCalls(summary).errored };
      });
      summaries.push(...runs);
    }
  }
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
  // The summaries are written, and say so, before the run fails.
  const failure = failureOf(summaries);
  if (failure !== undefined) fail(failure, 1);
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
