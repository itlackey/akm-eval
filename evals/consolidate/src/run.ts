#!/usr/bin/env bun
// consolidate: runs akm's consolidate on pairs of notes whose right outcome is known, with the model under test as
// its engine, and counts the notes it proposes to retire that held a claim the other lacked. See ../README.md.
//
//   evals/consolidate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//   evals/consolidate/run --pool [--repeat N] [--strategy NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is consolidate's: the spec of the run on pairs, and
// the spec of `--pool`, which is a run of its own: one sandbox with the whole pool of notes and a single `akm improve`, scored a cluster at a time.
// `--pool` is not a flag of either spec: it picks the spec, and is taken out of the flags before they are read.
//
// What a run says of how akm embedded the notes goes to its manifest as a treatment hint, which scripts/compare shows. The pool run keeps its own marks:
// the manifest's mode is "pool", its folder is named <model>-pool without --label, and akm's result of the one improve run is written to improve.json
// beside samples.jsonl and summary.json.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hideEndpoint, slug } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { type Case, INPUT_FILES, RELATIONS, parseCases, selectCases } from "./cases.ts";
import { type CollectContext, IMPROVE_TIMEOUT_MS, NAME, POOL_DEFAULT_BUDGET_MS, POOL_STRATEGY, STRATEGY, collectPool, effectiveConfig, runCase } from "./collect.ts";
import { assetsDigest } from "./inputs.ts";
import { pct } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Pool, loadPool, poolCases, poolFiles } from "./pool.ts";
import { type PoolCase, type PoolRaw, type PoolRow, makePoolRow, poolErrored, poolSummarize } from "./pool-score.ts";
import { type Embedder, sandboxMaker } from "./sandbox.ts";
import { type Row, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** What both runs add to the context of a case: how to make a sandbox, how akm embeds the notes, and for a test how long to wait after a rate limit. */
type Extra = Pick<CollectContext, "newSandbox" | "embedder" | "rateLimitWaitMs">;

/** What the pool run adds: the pool itself, read once for the run, and for a test the time after which akm is killed (see PoolContext). */
type PoolExtra = Extra & { pool?: Pool; improveTimeoutMs?: number };

/** The fields of a summary that are neither the common ones nor from `summarize`: how akm embedded the notes to find pairs. */
type Embedding = { embedder: Embedder };
type Own = ReturnType<typeof summarize> & Embedding;
type PoolOwn = ReturnType<typeof poolSummarize> & Embedding & { mode: "pool"; n_notes: number; n_clusters: number };

/**
 * How akm embeds the notes: its deterministic word-hash embedder (no model, the same pairs on every run), or with --semantic its built-in model, as a
 * real bundle runs it. The sandbox has to match: the config names the model key as $MODEL_API_KEY, and the real embedder's model is kept in .cache/.
 */
function embedding(values: Record<string, any>): Pick<Extra, "newSandbox" | "embedder"> {
  const embedder: Embedder = values.semantic ? "real" : "deterministic";
  return { embedder, newSandbox: sandboxMaker(NAME, embedder) };
}

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;

/** The shape of a table of rows of strings, printed with its first column to the left. */
function printTable(rows: string[][]): void {
  const w = (rows[0] as string[]).map((_, i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  for (const r of rows) console.log(`  ${r.map((x, i) => (i === 0 ? x.padEnd(w[i] as number) : x.padStart(w[i] as number))).join("  ")}`);
}

// --- The run on pairs --------------------------------------------------------------------------------------------

function printSummary(s: Summary & Own): void {
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
  printTable(rows);
  console.log(`  results             ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  const unsafe = (s: Summary) => `${s.metrics.unsafe.n} of ${s.metrics.unsafe.of} cases (${s.metrics.unsafe.staged} staged)`;
  const precision = (s: Summary) => cell(s.metrics.precision.safe, s.metrics.precision.retired, s.metrics.precision.value);
  const recall = (s: Summary) => cell(s.metrics.recall.retired_safe, s.metrics.recall.of, s.metrics.recall.value);
  return [
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
}

/** Why akm paired none of the notes, in the words of the embedder that was asked to find the pairs. */
const NONE_PAIRED: Record<Embedder, string> = {
  deterministic: "Consolidate needs semantic search, which this eval gets from akm's deterministic embedder (AKM_EMBED_DETERMINISTIC). Does this akm still have it?",
  real: "Consolidate pairs notes by the cosine of their embeddings, and the real embedder may put these below akm's floor, or akm could not load its model. Try again without --semantic.",
};

const SPEC: EvalSpec<Case, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  defaultTimeoutMs: IMPROVE_TIMEOUT_MS,
  loadCases: (folder) => {
    const file = join(folder, "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256: (folder) => assetsDigest(folder, INPUT_FILES),
  configFor: effectiveConfig,
  runCase,
  progress: (c, row) => {
    const result = row.outcome === "retire" ? `retired ${row.retired} (${row.safe ? "safe" : "UNSAFE"})` : row.outcome;
    return `${c.relation.padEnd(10)} ${result.padEnd(20)} ${row.paired ? "paired" : "unpaired"} ${row.seconds}s  ${c.id}${row.retried ? `  after ${row.retried} rate limited ${row.retried === 1 ? "try" : "tries"}` : ""}${row.error ? `  ${row.error.slice(0, 120)}` : ""}`;
  },
  prepare: (values) => {
    const own = embedding(values);
    return () => own;
  },
  // A run in which akm judged no pair is not a result: its summary is written and says so, and the run fails.
  abortReason: (rows, ctx) => {
    const counts = summarize(rows);
    return counts.n_scored > 0 && counts.n_paired === 0 ? `akm paired none of the notes, so its judge never ran. ${NONE_PAIRED[ctx.embedder ?? "deterministic"]}` : null;
  },
  summaryExtras: (_cases, _rows, ctx) => ({ embedder: ctx.embedder ?? "deterministic" }),
  manifestExtras: (ctx) => ({ treatment_hints: { embedder: ctx.embedder ?? "deterministic" } }),
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's consolidate on pairs of notes, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its
engine, and counts the retirements that lose a claim. Settings come from .env at the repository root. Written for akm 0.9.26.

akm finds the pairs it judges by the cosine of the notes' embeddings. Without --semantic that is akm's deterministic word-hash embedder:
no model, and the same pairs on every run, which the cases were made for. --semantic uses akm's built-in model, as a real bundle runs it
(downloaded once into .cache/); it can pair other notes, so its runs are not comparable with the default's.`,
    corpus: "            The default custom corpus is private/consolidate/assets, made by ./generate-assets; the run stops if it is missing.",
    limit: "run N cases, taking the first of each relation in turn",
    flags: "[--pool]",
    extra: `  --pool    one sandbox with the whole pool in assets/pool (80 memories) and a single improve run, as a real night
            consolidates, instead of a sandbox per pair. Public pool only; not with --corpus custom, --corpus all, --cases or --limit.
            With it --timeout-ms is akm's own wall-clock budget for the run: see \`run --pool --help\`.`,
  },
};

export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput<Extra>, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx, resultsParent) as Promise<Summary & Own>;

// --- The run on the whole pool ----------------------------------------------------------------------------------

function printPool(s: Summary & PoolOwn): void {
  console.log(`\n${NAME} --pool | model ${s.model} | akm ${s.akm_version} | ${s.n_notes} notes in ${s.n_clusters} clusters | strategy ${s.strategy}${s.config_patch ? ` + ${s.config_patch.path}` : ""}${s.timeout_ms === POOL_DEFAULT_BUDGET_MS ? "" : ` | --timeout-ms ${s.timeout_ms}`}`);
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
  console.log(`  pairs               ${m.pairs.judged} judged of ${m.pairs.considered} considered, ${m.pairs.failed} failed; labels ${Object.entries(m.pairs.labels).filter(([, n]) => (n as number) > 0).map(([l, n]) => `${l} ${n}`).join(", ") || "none"}`);
  console.log(`  model calls         ${m.calls.calls}, ${m.calls.failures} failed, ${m.calls.prompt_tokens + m.calls.completion_tokens} tokens`);
  console.log(`  promote pass        ${m.chunks.total} chunks (${m.chunks.failed} failed), ${m.chunks.deferred_memories} memories deferred, ${m.chunks.promote_ops} promote ops (not scored)`);
  console.log(`  anti-collapse       ${m.anti_collapse_injected === null ? "no warning" : `injected ${m.anti_collapse_injected}`}`);
  console.log(`  cold-start budget   ${m.cold_start_budget ? `pool cut from ${m.cold_start_budget.from} to ${m.cold_start_budget.to} (${m.cold_start_budget.safe_chunks} safe chunks)` : "no warning"}`);
  console.log(`  seconds             ${s.seconds}`);
  const rows: string[][] = [["kind", "clusters", "hit", "retired safe", "retired unsafe", "wrong successor", "untouched"]];
  for (const [kind, k] of Object.entries(m.classes) as [string, any][]) if (k.clusters > 0) rows.push([kind, String(k.clusters), `${k.hit}/${k.with_safe_retirement}`, String(k.retired_safe), String(k.retired_unsafe), String(k.wrong_successor), String(k.untouched)]);
  printTable(rows);
  console.log(`  results             ${relative(ROOT, s.results_dir)}/`);
}

/** What the pool run says to a custom corpus and to --limit. */
const POOL_ONLY = "--pool runs the public pool: leave out --corpus custom, --corpus all, --cases and --limit";

const POOL_SPEC: EvalSpec<PoolCase, PoolRow, PoolExtra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: POOL_STRATEGY,
  defaultTimeoutMs: POOL_DEFAULT_BUDGET_MS,
  // The pool is assets/pool of the public corpus: its clusters are the cases, each with the notes it holds. The folder of a custom corpus has none, and the driver reads it before `prepare` can say so.
  loadCases: (folder) => {
    if (!existsSync(join(folder, "pool", "labels.json"))) throw new Error(POOL_ONLY);
    return poolCases(loadPool(join(folder, "pool")));
  },
  selectCases: (all) => all,
  assetsSha256: (folder) => assetsDigest(join(folder, "pool"), poolFiles(join(folder, "pool"))),
  configFor: effectiveConfig,
  progress: (c, row) => `${c.kind.padEnd(10)} ${c.id.padEnd(14)} ${row.outcome}`,
  // A pool run is named apart from a run on pairs of the same model.
  defaultLabel: (model) => `${slug(model)}-pool`,
  prepare: (values, corpora) => {
    if (corpora.length !== 1 || corpora[0]?.name !== "public" || values.limit !== undefined) throw new Error(POOL_ONLY);
    const own = embedding(values);
    return () => own;
  },
  // The notes are written to the sandbox in the order the pool was read, so the pool is read once more here, whole, and not rebuilt from the clusters.
  openRun: async (_ctx, corpus) => ({ pool: loadPool(join(corpus.folder, "pool")) }),
  collectAll: async (cases, ctx, record) => {
    const collected = await collectPool(ctx.pool as Pool, ctx);
    // akm's result of the improve run as it printed it, with the endpoint hidden, beside the rows that were scored from it. A run that failed before akm printed one has none.
    if (collected.improve) writeFileSync(join(ctx.resultsDir as string, "improve.json"), `${hideEndpoint(JSON.stringify(collected.improve, null, 2), ctx.baseUrl)}\n`);
    const rows = cases.map((c) => makePoolRow(c, collected.raw.get(c.id) as PoolRaw));
    for (const row of rows) record(row);
    const failed = rows.find(poolErrored);
    return { rows, aborted: failed ? `the pool run failed: ${failed.error}` : undefined };
  },
  summaryExtras: (cases, _rows, ctx) => ({ mode: "pool", embedder: ctx.embedder ?? "deterministic", n_notes: cases.reduce((n, c) => n + c.notes.length, 0), n_clusters: cases.length, n_cases: 1 }), // the one pool run is the one case
  manifestExtras: (ctx) => ({ mode: "pool", treatment_hints: { embedder: ctx.embedder ?? "deterministic" } }),
  printSummary: printPool,
  usage: {
    timeout: "akm improve's own wall-clock budget, which akm is given as its --timeout-ms; the eval stops akm 10 minutes after it",
    about: `Runs akm's consolidate on the whole public pool, as a real night does: the 80 memories of assets/pool in one sandbox and a single
\`akm improve\`, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its engine, scored a cluster at a time against the labels.
Settings come from .env at the repository root. Written for akm 0.9.26. It reads the public pool only, so leave out --corpus custom, --corpus all,
--cases and --limit. Without --semantic akm embeds the notes with its deterministic word-hash embedder, with it with its built-in model.`,
    limit: "not used with --pool",
    flags: "--pool",
    extra: `  --pool    selects this run. --timeout-ms is akm's own wall-clock budget for the improve run (akm's default is 2 hours): a short one makes
            akm cut the pool to what the budget covers (its "cold-start budget" warning). The eval kills akm 10 minutes after the budget.
            Without --label the results folder is named <UTC date>-<model name>-pool.`,
  },
};

export const runPool = (ctx: CtxInput<PoolExtra>, resultsParent?: string): Promise<Summary & PoolOwn> =>
  runIn(POOL_SPEC, { name: "public", folder: join(EVAL_DIR, "assets"), rewrite: false, seed: null, flag: "--corpus public" }, ctx, resultsParent) as Promise<Summary & PoolOwn>;

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  if (argv.includes("--pool")) await runEval(POOL_SPEC, argv.filter((a) => a !== "--pool"));
  else await runEval(SPEC, argv);
}
