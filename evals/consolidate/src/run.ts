#!/usr/bin/env bun
// consolidate: runs akm's consolidate on pairs of notes whose right outcome is known, with the model under test as
// its engine, and counts the notes it proposes to retire that held a claim the other lacked. See ../README.md.
//
//   evals/consolidate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--embedder deterministic|real] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]
//   evals/consolidate/run --pool [--timeout-ms N] [--repeat N] [--embedder deterministic|real] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { ALIASES, CORPUS_OPTIONS, type ResolvedCorpus, corpusRecord, corpusUsage, privacyError, resolveCorpora } from "../../../lib/corpus.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, lockedParts, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { INPUT_FILES, RELATIONS, parseCases, selectCases } from "./cases.ts";
import { type CollectContext, NAME, POOL_STRATEGY, type PoolContext, RATE_LIMIT_TRIES, STRATEGY, collectPool, effectiveConfig, runCase } from "./collect.ts";
import { type RunInputs, privateAssetsProblem, runInputs } from "./inputs.ts";
import { MEASUREMENT } from "./measurement.ts";
import { loadPool, poolCases, poolFiles } from "./pool.ts";
import { type PoolMetrics, type PoolRaw, type PoolRow, makePoolRow, poolSummarize } from "./pool-score.ts";
import { EMBEDDER_OPTIONS, embedderUsage, parseEmbedder, pct } from "./lib.ts";
import { type Embedder, sandboxOptions } from "./sandbox.ts";
import { type Row, metrics, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
const GIVE_UP_AFTER = 5; // consecutive cases with no verdict, before any verdict at all

const POOL_DIR = join(EVAL_DIR, "assets", "pool");

const USAGE = `Usage: evals/consolidate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--embedder deterministic|real] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]
       evals/consolidate/run --pool [--timeout-ms N] [--repeat N] [--embedder deterministic|real] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs akm's consolidate on pairs of notes, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its
engine, and counts the retirements that lose a claim. Settings come from .env at the repository root.

${corpusUsage}
            The default custom corpus is private/consolidate/assets, made by ./generate-assets; the run stops if it is missing.
  --limit   run N cases, taking the first of each relation in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${embedderUsage}
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.
  --pool    one sandbox with the whole pool in assets/pool (80 memories) and a single improve run, as a real night
            consolidates, instead of a sandbox per pair. Public pool only; not with --corpus, --cases or --limit.
  --timeout-ms  with --pool: akm's wall-clock budget for the run, in milliseconds (akm's default is 2 hours). A short one
            makes akm cut the pool to what the budget covers (its "cold-start budget" warning).

Written for akm 0.9.26. akm is on PATH, or in AKM_BIN.`;

/** What the summary of a run records of its corpus: public or custom, the kind, whether it is private, and the folder of a custom corpus if that is inside the repository (null for the public one and for a folder outside it, for scripts/rescore: lib/manifest.ts corpusFolderOf). Never an absolute path. */
interface CorpusFields {
  corpus: "public" | "custom";
  corpus_kind: string;
  corpus_private: boolean;
  corpus_folder: string | null;
}

export const corpusFields = (c: ResolvedCorpus): CorpusFields => ({ ...corpusRecord(c), corpus_folder: c.name === "custom" ? corpusFolderOf(c.folder) : null }) as CorpusFields;

interface Summary extends RunInputs, CorpusFields {
  eval: string;
  label: string;
  date: string;
  /**
   * "aborted" when the run ended in a failure, with the reason: the endpoint kept rate limiting, no case got a verdict, or akm paired none
   * of the notes. The counts are then those of the cases that ran, and the summary is not a result.
   */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  /** How akm embedded the notes to find pairs: its deterministic word-hash embedder, or its built-in model. */
  embedder: Embedder;
  limit: number | null;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** Of the errored cases, the ones in which the eval killed akm for running past its time limit. */
  timeouts: number;
  n_paired: number;
  served_models: Record<string, number>; // the model names the endpoint reported, with the calls each answered
  metrics: ReturnType<typeof metrics>;
  /** What the run was made of: the parts that decide whether it compares with another run (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  unsafe retirements  ${m.unsafe.n} of ${m.unsafe.of} cases, ${m.unsafe.staged} of them staged for unattended retirement`);
  console.log(`  staged retirements  ${m.staged.safe} of ${m.staged.n} safe`);
  console.log(`  retire precision    ${cell(m.precision.safe, m.precision.retired, m.precision.value)}`);
  console.log(`  retire recall       ${cell(m.recall.retired_safe, m.recall.of, m.recall.value)}  of the cases with a safe side`);
  console.log(`  errored             ${s.n_errored}${s.timeouts > 0 ? `, ${s.timeouts} of them timeouts` : ""}`);
  const served = Object.entries(s.served_models).map(([name, calls]) => `${name} (${calls} calls)`);
  if (served.length > 0) console.log(`  served as           ${served.join(", ")}`);
  const rows: string[][] = [["relation", "cases", "paired", "retired safe", "retired unsafe", "kept"]];
  for (const r of RELATIONS) {
    const k = m.classes[r];
    if (k.n > 0) rows.push([r, String(k.n - k.error), String(k.paired), String(k.retired_safe), String(k.retired_unsafe), String(k.kept)]);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(`  ${r.map((x, i) => (i === 0 ? x.padEnd(w[i]) : x.padStart(w[i]))).join("  ")}`);
  console.log(`  results             ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const unsafe = (s: Summary) => `${s.metrics.unsafe.n} of ${s.metrics.unsafe.of} cases (${s.metrics.unsafe.staged} staged)`;
  const precision = (s: Summary) => cell(s.metrics.precision.safe, s.metrics.precision.retired, s.metrics.precision.value);
  const recall = (s: Summary) => cell(s.metrics.recall.retired_safe, s.metrics.recall.of, s.metrics.recall.value);
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["unsafe retirements", unsafe(a), unsafe(b)],
    ["retire precision", precision(a), precision(b)],
    ["retire recall", recall(a), recall(b)],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ["timeouts", String(a.timeouts), String(b.timeouts)],
    ...RELATIONS.map((r): [string, string, string] => {
      const per = (s: Summary) => {
        const k = s.metrics.classes[r];
        return `${k.retired_safe}/${k.retired_unsafe}/${k.kept}`;
      };
      return [`${r} (safe/unsafe/kept)`, per(a), per(b)];
    }),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/** What a run needs besides the collector's: the akm version, the label of its results folder and the limit of cases. */
type RunContext = CollectContext & { version: string; label: string; limit?: number };

export async function runCorpus(corpus: ResolvedCorpus, ctx: RunContext, resultsParent = corpus.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results")): Promise<Summary> {
  const parts = lockedParts(MEASUREMENT); // stops the run, before it collects anything, when MEASUREMENT.lock has no entry for the eval
  const assets = corpus.folder;
  const all = parseCases(readFileSync(join(assets, "cases.jsonl"), "utf8"), join(assets, "cases.jsonl"));
  const cases = selectCases(all, ctx.limit);
  const config = effectiveConfig(ctx);
  const dir = makeResultsDir(resultsParent, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} cases, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let anyVerdict = false;
  let aborted: string | undefined;
  let limited = false;
  for (const c of cases) {
    const { row, rateLimited } = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const result = row.outcome === "retire" ? `retired ${row.retired} (${row.safe ? "safe" : "UNSAFE"})` : row.outcome;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.relation.padEnd(10)} ${result.padEnd(20)} ${row.paired ? "paired" : "unpaired"} ${row.seconds}s  ${c.id}${row.retried ? `  after ${row.retried} rate limited ${row.retried === 1 ? "try" : "tries"}` : ""}${row.error ? `  ${row.error.slice(0, 120)}` : ""}`);
    if (rateLimited) {
      limited = true;
      aborted = row.error;
      break;
    }
    if (row.outcome === "error") {
      consecutiveErrors++;
      if (!anyVerdict && consecutiveErrors >= GIVE_UP_AFTER) {
        aborted = row.error;
        break;
      }
    } else {
      anyVerdict = true;
      consecutiveErrors = 0;
    }
  }

  const counts = summarize(rows);
  // Why the run ends in a failure, if it does. The summary says so before the run fails, so a cut-short run is not taken for a whole one.
  const stop = limited
    ? { reason: `the endpoint was still rate limiting after ${RATE_LIMIT_TRIES} new tries of a case, so the run stopped after ${rows.length} of ${cases.length} cases. Last error: ${aborted}`, hint: "Wait and run it again, or use an endpoint with room." }
    : aborted
      ? { reason: `the first ${GIVE_UP_AFTER} cases got no verdict, so the run stopped. Last error: ${aborted}`, hint: "Check MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and that akm is 0.9.26." }
      : counts.n_scored > 0 && counts.n_paired === 0
        ? { reason: "akm paired none of the notes, so its judge never ran.", hint: (ctx.embedder ?? "deterministic") === "real" ? "Consolidate pairs notes by the cosine of their embeddings, and the real embedder may put these below akm's floor, or akm could not load its model. Try --embedder deterministic." : "Consolidate needs semantic search, which this eval gets from akm's deterministic embedder (AKM_EMBED_DETERMINISTIC). Does this akm still have it?" }
        : null;
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const embedder = ctx.embedder ?? "deterministic";
  const seed = corpus.config.seed ?? null;
  const build = akmBuild();
  const summary: Summary = {
    eval: NAME,
    ...corpusFields(corpus),
    label: ctx.label,
    date: new Date().toISOString(),
    status: stop ? "aborted" : "complete",
    aborted_reason: stop?.reason ?? null,
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    embedder,
    limit: ctx.limit ?? null,
    ...overrideSummary(overrides),
    ...runInputs(config, (text) => hideEndpoint(text, ctx.baseUrl), { dir: assets, files: INPUT_FILES }, seed),
    n_cases: all.length,
    ...counts,
    manifest: buildManifest({
      measurement: MEASUREMENT,
      parts,
      corpus: corpus.name,
      cases: caseDigests(MEASUREMENT, cases),
      akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
      config,
      settings: { strategy: overrides.strategy, config_patch_sha256: overrides.configPatch?.sha256 ?? null, timeout_ms: null, seed },
      treatment_hints: { embedder },
      completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
    }),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (stop) fail(`${stop.reason}\n${stop.hint}`, 1);
  return summary;
}

type PoolRunContext = PoolContext & { version: string; label: string };

interface PoolSummary extends RunInputs {
  eval: string;
  mode: "pool";
  corpus: "public";
  corpus_kind: "public";
  corpus_private: false;
  /** The pool is the committed one, so there is no folder to record. */
  corpus_folder: null;
  label: string;
  date: string;
  /** "aborted" when the run failed (see `error`), "complete" otherwise. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string;
  akm_version: string;
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  embedder: Embedder;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  timeout_ms: number | null; // akm's --timeout-ms, null when akm's own default applied
  limit: null;
  n_notes: number;
  n_clusters: number;
  n_cases: number; // the one pool run
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** 1 when the errored run is one in which the eval killed akm for running past its time limit, else 0. */
  timeouts: number;
  n_paired: number; // pairs akm's judge looked at
  seconds: number; // wall time of the improve run
  served_models: Record<string, number>;
  metrics: PoolMetrics | null;
  error?: string;
  /** What the run was made of: the parts that decide whether it compares with another run (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

function printPool(s: PoolSummary): void {
  console.log(`\n${NAME} --pool | model ${s.model} | akm ${s.akm_version} | ${s.n_notes} notes in ${s.n_clusters} clusters | strategy ${s.strategy}${s.config_patch ? ` + ${s.config_patch.path}` : ""}${s.timeout_ms ? ` | --timeout-ms ${s.timeout_ms}` : ""}`);
  const m = s.metrics;
  if (!m) {
    console.log(`  errored             ${s.error}`);
    console.log(`  results             ${relative(ROOT, s.results_dir)}/`);
    return;
  }
  console.log(`  unsafe retirements  ${m.unsafe.n} of ${m.unsafe.of} proposed, ${m.unsafe.staged} of them staged for unattended retirement`);
  console.log(`  staged retirements  ${m.staged.safe} of ${m.staged.n} safe`);
  console.log(`  wrong successor     ${m.wrong_successor}`);
  console.log(`  retire precision    ${cell(m.precision.safe, m.precision.retired, m.precision.value)}`);
  console.log(`  retire recall       ${cell(m.recall.retired_safe, m.recall.of, m.recall.value)}  of the clusters with a note to retire`);
  console.log(`  pairs               ${m.pairs.judged} judged of ${m.pairs.considered} considered, ${m.pairs.failed} failed; labels ${Object.entries(m.pairs.labels).filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join(", ") || "none"}`);
  console.log(`  model calls         ${m.calls.calls}, ${m.calls.failures} failed, ${m.calls.prompt_tokens + m.calls.completion_tokens} tokens`);
  console.log(`  promote pass        ${m.chunks.total} chunks (${m.chunks.failed} failed), ${m.chunks.deferred_memories} memories deferred, ${m.chunks.promote_ops} promote ops (not scored)`);
  console.log(`  anti-collapse       ${m.anti_collapse_injected === null ? "no warning" : `injected ${m.anti_collapse_injected}`}`);
  console.log(`  cold-start budget   ${m.cold_start_budget ? `pool cut from ${m.cold_start_budget.from} to ${m.cold_start_budget.to} (${m.cold_start_budget.safe_chunks} safe chunks)` : "no warning"}`);
  console.log(`  seconds             ${s.seconds}`);
  const rows: string[][] = [["kind", "clusters", "hit", "retired safe", "retired unsafe", "wrong successor", "untouched"]];
  for (const [kind, k] of Object.entries(m.classes)) if (k.clusters > 0) rows.push([kind, String(k.clusters), `${k.hit}/${k.with_safe_retirement}`, String(k.retired_safe), String(k.retired_unsafe), String(k.wrong_successor), String(k.untouched)]);
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(`  ${r.map((x, i) => (i === 0 ? x.padEnd(w[i]) : x.padStart(w[i]))).join("  ")}`);
  console.log(`  results             ${relative(ROOT, s.results_dir)}/`);
}

/**
 * The run on the whole pool: one sandbox with every note of the pool as a memory, indexed, one `akm improve` with the strategy (consolidate unless --strategy says
 * another), the proposals read back and scored against the labels. Not tried again on a rate limit: the run is one long call
 * sequence, and the calls the endpoint turned away show in `calls.failures`.
 */
export async function runPool(ctx: PoolRunContext, pool = loadPool(POOL_DIR), resultsParent = join(EVAL_DIR, "results"), poolDir = POOL_DIR): Promise<PoolSummary> {
  const parts = lockedParts(MEASUREMENT);
  const config = effectiveConfig(ctx);
  const dir = makeResultsDir(resultsParent, ctx.label);
  console.log(`${NAME} --pool: ${Object.keys(pool.texts).length} notes in ${pool.clusters.length} clusters, one improve run (${ctx.overrides.strategy})`);
  const collected = await collectPool(pool, ctx);
  const cases = poolCases(pool);
  const rows: PoolRow[] = cases.map((c) => makePoolRow(c, collected.raw.get(c.id) as PoolRaw));
  const counts = poolSummarize(rows);
  const build = akmBuild();
  const embedder = ctx.embedder ?? "deterministic";
  const summary: PoolSummary = {
    eval: NAME,
    mode: "pool",
    corpus: "public",
    corpus_kind: "public",
    corpus_private: false,
    corpus_folder: null,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    embedder,
    ...overrideSummary(ctx.overrides),
    ...runInputs(config, (text) => hideEndpoint(text, ctx.baseUrl), { dir: poolDir, files: poolFiles(poolDir) }, null),
    timeout_ms: ctx.timeoutMs ?? null,
    limit: null,
    n_notes: Object.keys(pool.texts).length,
    n_clusters: pool.clusters.length,
    n_cases: 1,
    ...counts,
    manifest: buildManifest({
      measurement: MEASUREMENT,
      parts,
      corpus: "public",
      mode: "pool",
      cases: caseDigests(MEASUREMENT, cases),
      akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
      config,
      settings: { strategy: ctx.overrides.strategy, config_patch_sha256: ctx.overrides.configPatch?.sha256 ?? null, timeout_ms: ctx.timeoutMs ?? null, seed: null },
      treatment_hints: { embedder },
      completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
    }),
    results_dir: dir,
  };
  writeFileSync(join(dir, "samples.jsonl"), pool.clusters.length > 0 ? `${rows.map((r) => JSON.stringify(r)).join("\n")}\n` : "");
  if (collected.improve) writeFileSync(join(dir, "improve.json"), `${hideEndpoint(JSON.stringify(collected.improve, null, 2), ctx.baseUrl)}\n`);
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printPool(summary);
  if (summary.error) fail(`the pool run failed: ${summary.error}`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; limit?: string; repeat?: string; embedder?: string; strategy?: string; "config-patch"?: string; label?: string; pool?: boolean; "timeout-ms"?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...EMBEDDER_OPTIONS, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, pool: { type: "boolean" }, "timeout-ms": { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`${NAME}: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const publicAssets = join(EVAL_DIR, "assets");
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: publicAssets, default: "rewrite", aliases: { private: ALIASES.private }, fail });
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const embedder = parseEmbedder(values.embedder, fail);
  const overrides = parseOverrides(values, values.pool ? POOL_STRATEGY : STRATEGY, fail);
  const timeoutMs = values["timeout-ms"] === undefined ? undefined : Number(values["timeout-ms"]);
  if (timeoutMs !== undefined && !(Number.isInteger(timeoutMs) && timeoutMs > 0)) fail("--timeout-ms must be a positive integer");
  if (timeoutMs !== undefined && !values.pool) fail("--timeout-ms is for --pool");
  if (values.pool && (corpora.length !== 1 || corpora[0]?.name !== "public" || limit !== undefined)) fail("--pool runs the public pool: leave out --corpus custom, --corpus all, --cases and --limit");

  useAkm(values, fail);
  const settings = useModel(values, fail);
  const refusal = privacyError(corpora, { model: settings }, "memories");
  if (refusal) fail(refusal);
  const { baseUrl, name: model, hasKey } = settings;
  for (const c of corpora) {
    if (c.name === "public") continue;
    const problem = c.config.kind === "rewrite" ? privateAssetsProblem(NAME, dirname(c.folder), "cases.jsonl") : existsSync(join(c.folder, "cases.jsonl")) ? null : `${c.flag}: ${join(c.folder, "cases.jsonl")} is missing. A custom corpus of consolidate is a folder with a cases.jsonl, as assets/README.md describes`;
    if (problem) fail(problem);
  }
  const label = values.label ?? slug(model) + (values.pool ? "-pool" : "");
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const newSandbox = () => createSandbox(NAME, sandboxOptions(embedder)); // the config names the model key as $MODEL_API_KEY; the real embedder's model is kept in .cache/
  const probe = newSandbox();
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }

  const ctx = { newSandbox, baseUrl, model, hasKey, version, label, limit, overrides, embedder };
  if (values.pool) {
    await repeatRuns(repeat, label, (runLabel) => runPool({ ...ctx, label: runLabel, overrides, timeoutMs }));
    return;
  }
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel }))));
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`${NAME}: ${e.message}`);
    process.exit(e.code);
  }
}
