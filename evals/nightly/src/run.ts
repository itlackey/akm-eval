#!/usr/bin/env bun
// nightly: runs one night of akm improve on a library that holds planted items whose right outcome is known: index, the day's
// feedback, `akm improve` with the default strategy, then `akm proposal drain`, as the lab's nightly does. It checks every
// item, what changed outside the items, the lessons accepted and the model calls that failed. See ../README.md.
//
//   evals/nightly/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--timeout-ms N]
//
// The flags, the setup and the summary are lib/run.ts. This file is what is nightly's: the spec that says what a case is and how it is shown, and
// the night, which is the one unit of work: the items are planted together, so the spec runs them itself (`collectAll`) and not one after another.

import { join, relative, resolve } from "node:path";
import { Fatal, hideEndpoint } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { assetsDigest } from "../../consolidate/src/inputs.ts";
import { type Embedder, sandboxMaker } from "../../consolidate/src/sandbox.ts";
import { type CallRow, type Collected, type CollectContext, IMPROVE_BUDGET_MS, NAME, STRATEGY, callStats, effectiveConfig, haveNight, rawOfNight } from "./collect.ts";
import { KINDS } from "./items.ts";
import { pct } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Planted, loadNight, nightFiles, planted, selectItems } from "./night.ts";
import { type Raw, type Row, makeRow, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** What the night leaves for the summary, which the spec reads after the night: what akm and the library showed, and how long it all took. */
interface NightRun {
  /** How many items the night holds, of which the run plants those it selects. */
  items: number;
  collected?: Collected;
  /** Wall-clock seconds of the night, whether it ended or failed. */
  total?: number;
}

/** What nightly adds to the context of a run: how to make the sandbox of the night and how akm embeds the notes (see `embedding`), the night's own record, and for a test the time after which the improve run is ended. */
type Extra = Pick<CollectContext, "newSandbox" | "embedder" | "improveTimeoutMs"> & { night?: NightRun };

/** The fields of a nightly summary that are neither the common ones nor from `summarize`. */
type Own = ReturnType<typeof summarize> & {
  /** How akm embedded the notes to find pairs: its deterministic word-hash embedder, or its built-in model. */
  embedder: Embedder;
  n_items: number;
  n_planted: number;
  /** Wall-clock seconds of each step of the night. */
  seconds: { index: number; feedback: number; improve: number; drain: number; total: number };
  /** What akm says of the improve run: false when it did not run to its end. */
  improve_ok: boolean;
  /** Processes akm skipped because their engine could not be used. */
  skipped_processes: string[];
  /** What the drain did: proposals promoted, rejected, left for review and failed. */
  drain: { promoted: number; rejected: number; deferred: number; failed: number };
  /** The pair pass of consolidate: pairs judged, judgments that failed and the labels given. */
  pair_pass: { pairs_judged: number; failed_judgments: number; labels: Record<string, number> } | null;
  /** The improve run's model calls by process and the model name the endpoint reported. A gateway may serve one name from several providers. */
  calls_by: CallRow[];
};

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
const minutes = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`);
const wall = (since: number): number => Number(((performance.now() - since) / 1000).toFixed(1));

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_planted} of ${s.n_items} items`);
  console.log(`  items right        ${cell(m.items.ok, m.items.n, m.items.rate)}`);
  console.log(`  harm               ${m.harm.items} items, ${m.harm.outside_changed} paths changed outside the items, ${m.harm.lessons_accepted} lessons accepted`);
  console.log(`  model calls        ${m.calls.n}, ${m.calls.failures} failed`);
  if (m.proactive) console.log(`  proactive lane     picked ${m.proactive.selected} of ${m.proactive.due} due, ${m.proactive.on_silent} proposals on silent defects, ${m.proactive.on_others} on other notes`);
  console.log(`  night              ${minutes(s.seconds.total)} (index ${minutes(s.seconds.index)}, feedback ${minutes(s.seconds.feedback)}, improve ${minutes(s.seconds.improve)}, drain ${minutes(s.seconds.drain)})`);
  console.log(`  drain              ${s.drain.promoted} promoted, ${s.drain.rejected} rejected, ${s.drain.deferred} left for review, ${s.drain.failed} failed`);
  if (!s.improve_ok) console.log("  akm reported the improve run as not ok");
  if (s.skipped_processes.length > 0) console.log(`  skipped            ${s.skipped_processes.join(", ")}`);
  if (s.pair_pass) console.log(`  pair judge         ${s.pair_pass.pairs_judged} pairs judged as ${Object.entries(s.pair_pass.labels).map(([l, n]) => `${l} ${n}`).join(", ") || "nothing"}, ${s.pair_pass.failed_judgments} judgments failed`);
  for (const r of s.calls_by.filter((r) => r.failures > 0)) console.log(`  failed calls       ${r.process} on ${r.model}: ${r.failures} of ${r.calls}`);
  for (const k of KINDS) {
    const c = m.by_kind[k];
    if (c) console.log(`    ${k.padEnd(10)} ${c.ok}/${c.n}`);
  }
  for (const p of s.outside_changed) console.log(`  HARM  changed outside the items: ${p}`);
  console.log(`  results            ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  const col = (s: Summary & Own) => ({
    right: cell(s.metrics.items.ok, s.metrics.items.n, s.metrics.items.rate),
    harm: `${s.metrics.harm.items} items, ${s.metrics.harm.outside_changed} outside, ${s.metrics.harm.lessons_accepted} lessons`,
    calls: `${s.metrics.calls.n} calls, ${s.metrics.calls.failures} failed`,
    night: minutes(s.seconds.total),
  });
  const [x, y] = [col(a), col(b)];
  return [
    ["items right", x.right, y.right],
    ["harm", x.harm, y.harm],
    ["model calls", x.calls, y.calls],
    ["night", x.night, y.night],
    ...KINDS.filter((k) => a.metrics.by_kind[k] || b.metrics.by_kind[k]).map((k): [string, string, string] => {
      const c = (s: Summary) => (s.metrics.by_kind[k] ? `${s.metrics.by_kind[k]?.ok}/${s.metrics.by_kind[k]?.n}` : "-");
      return [`  ${k}`, c(a), c(b)];
    }),
  ];
}

const SPEC: EvalSpec<Planted, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  minAkm: "0.9.26", // the first release with the pair judge's claim lists, exact fixes and lessons that wait for review
  defaultTimeoutMs: IMPROVE_BUDGET_MS,
  casesFile: "items.jsonl",
  loadCases: (folder) => {
    const night = loadNight(folder);
    return planted(night.items, night.files);
  },
  selectCases: selectItems,
  assetsSha256: (folder) => assetsDigest(folder, nightFiles(folder)),
  configFor: effectiveConfig,
  runCase: async () => {
    throw new Error("a night is one run of every item, and collectAll makes it");
  },
  progress: (c, row) => {
    if (row.ok) return `${c.id.padEnd(28)} ok    ${row.state}`;
    const failed = Object.entries(row.checks).filter(([, pass]) => !pass).map(([name]) => name).join(", ");
    return `${c.id.padEnd(28)} ${row.harm ? "HARM" : "miss"}  ${failed} | ${row.state}${row.error ? ` | ${row.error}` : ""}`;
  },
  // Whether akm embeds the notes with its deterministic word-hash embedder (no model, the same pairs on every run) or with --semantic its built-in model, as a
  // real bundle runs it. The sandbox has to match: the config names the model key as $MODEL_API_KEY, and the real embedder's model is kept in .cache/.
  prepare: (values) => {
    const embedder: Embedder = values.semantic ? "real" : "deterministic";
    const own = { embedder, newSandbox: sandboxMaker(NAME, embedder) };
    return () => own;
  },
  openRun: async (_ctx, corpus) => ({ night: { items: loadNight(corpus.folder).items.length } }),
  // The night is one run of the planted items. A night that fails (a command that fails or is ended, a result that is no JSON) leaves nothing to score:
  // the summary is written for it all the same, with no rows, and says why.
  collectAll: async (cases, ctx, record) => {
    const run = ctx.night as NightRun;
    const t0 = performance.now();
    try {
      run.collected = await haveNight(cases, new Map(cases.flatMap((c) => Object.entries(c.texts))), ctx);
    } catch (e) {
      if (!(e instanceof Fatal)) throw e;
      run.total = wall(t0);
      return { rows: [], aborted: e.message };
    }
    run.total = wall(t0);
    // akm names the endpoint in some of its errors, and rows get shared, so no row carries it (rawOfNight writes <MODEL_BASE_URL> in its place).
    const raws = rawOfNight(cases, run.collected, ctx.baseUrl);
    const rows = cases.map((item, i) => makeRow(item, raws[i] as Raw));
    for (const row of rows) record(row);
    return { rows };
  },
  summaryExtras: (cases, _rows, ctx) => {
    const run = ctx.night as NightRun;
    const done = run.collected;
    const result = (done?.improve ?? {}) as { ok?: boolean; skippedProcesses?: { process?: string }[]; consolidation?: { pairPass?: { pairsJudged?: number; failedJudgments?: number; labelCounts?: Record<string, number> } } };
    const pairPass = result.consolidation?.pairPass;
    return {
      embedder: ctx.embedder ?? "deterministic",
      n_items: run.items,
      n_planted: cases.length,
      seconds: { ...(done?.seconds ?? { index: 0, feedback: 0, improve: 0, drain: 0 }), total: run.total ?? 0 },
      improve_ok: done !== undefined && result.ok !== false,
      skipped_processes: (result.skippedProcesses ?? []).map((p) => String(p.process)),
      drain: done?.drain ?? { promoted: 0, rejected: 0, deferred: 0, failed: 0 },
      pair_pass: pairPass ? { pairs_judged: Number(pairPass.pairsJudged ?? 0), failed_judgments: Number(pairPass.failedJudgments ?? 0), labels: Object.fromEntries(Object.entries(pairPass.labelCounts ?? {}).filter(([, n]) => n > 0)) } : null,
      calls_by: callStats(done?.improve).by.map((r) => ({ ...r, model: hideEndpoint(r.model, ctx.baseUrl) })),
    };
  },
  printSummary,
  sideBySide,
  usage: {
    about: `Runs one night of akm improve, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its engine, on a library
of planted items, then drains the proposals as the nightly does, and checks the result. Settings come from .env at the
repository root.

--timeout-ms is akm's own wall-clock budget for the improve run: refs it has not reached show \`not reached\`. The eval ends akm 10 minutes
after it, and the night then fails with a summary that says so. The steps that call no model have limits of their own.

akm finds the pairs it judges by the cosine of the notes' embeddings. Without --semantic that is akm's deterministic word-hash embedder:
no model, and the same pairs on every run, which the night's pairs were made for. --semantic uses akm's built-in model, as a real bundle runs
it (downloaded once into .cache/); it can pair other notes, so its runs are not comparable with the default's.`,
    corpus: "            The default custom corpus is private/nightly/assets, made by ./generate-assets; the run stops if it is missing.",
    limit: "plant only N items, taking the first of each kind in turn",
  },
};

export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput<Extra>, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
