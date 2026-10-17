#!/usr/bin/env bun
// extract: runs akm's extract on each session, with the model under test as akm's engine, and scores the memories it
// saves. See ../README.md.
//
//   evals/extract/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is extract's: the spec that says what a case is
// and how it is shown.

import { relative, resolve } from "node:path";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { EXTRACT_TIMEOUT_MS, NAME, STRATEGY, configFor, runCase } from "./collect.ts";
import { type LoadedCase, type Metrics, type Row, assetsDigest, loadCases, pct, selectCases, summarize } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
export const MIN_AKM = "0.9.26"; // the release this eval was built on: its `proposal extract` flags, its result and its queue are the ones the README describes

/** The fields of an extract summary that come from its rows, besides those every eval has: the counts, `timeouts` and `metrics`. */
type Own = ReturnType<typeof summarize>;

const cell = (c: { n: number; correct: number; rate: number | null }): string => `${c.correct}/${c.n}  ${pct(c.rate)}`;

function printSummary(s: Summary & Own): void {
  const m: Metrics = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} sessions`);
  console.log(`  insights  ${cell(m.insights)}   of the sessions that hold an insight or a preference: a memory that states every fact`);
  console.log(`  routine   ${cell(m.routine)}   of the routine sessions: left empty`);
  console.log(`  planted   ${cell(m.planted)}   of the sessions with a planted instruction: ${m.planted.saved_instruction} saved it${m.planted.ambiguous > 0 ? `, ${m.planted.ambiguous} to read (a negation over a verb the rule does not list)` : ""}`);
  for (const [klass, c] of Object.entries(m.classes)) {
    const failed = Object.entries(c.failed).filter(([, n]) => n > 0).map(([name, n]) => `${name} ${n}`).join(", ");
    console.log(`    ${klass.padEnd(11)} ${`${c.correct}/${c.n}`.padEnd(5)} saved ${c.outcomes.saved}, empty ${c.outcomes.empty}, unusable ${c.outcomes.unusable}; ${c.memories} memories${failed ? `; failed: ${failed}` : ""}`);
  }
  console.log(`  errored   ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  console.log(`  results   ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  return [
    ["insights", cell(a.metrics.insights), cell(b.metrics.insights)],
    ["routine", cell(a.metrics.routine), cell(b.metrics.routine)],
    ["planted", cell(a.metrics.planted), cell(b.metrics.planted)],
    ["planted instruction saved", String(a.metrics.planted.saved_instruction), String(b.metrics.planted.saved_instruction)],
    ["planted instruction to read", String(a.metrics.planted.ambiguous), String(b.metrics.planted.ambiguous)],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ["timed out", String(a.timeouts), String(b.timeouts)],
  ];
}

const SPEC: EvalSpec<LoadedCase, Row> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  minAkm: MIN_AKM,
  defaultTimeoutMs: EXTRACT_TIMEOUT_MS,
  casesFile: "cases.json",
  loadCases,
  selectCases,
  assetsSha256: assetsDigest,
  configFor,
  runCase,
  progress: (c, row) => {
    const checks = [row.missing.length > 0 && `missing ${row.missing.join(", ")}`, row.forbidden.length > 0 && `asserts ${row.forbidden.join(", ")}`, row.ambiguous.length > 0 && `read ${row.ambiguous.join(", ")}`].filter(Boolean).join("; ");
    const shown = row.outcome === "error" ? `error  ${row.error?.slice(0, 120)}` : `${row.correct ? "ok  " : "FAIL"}   ${row.outcome}${row.saved.length > 0 ? ` ${row.saved.length}` : ""}${checks ? ` (${checks.slice(0, 80)})` : ""}`;
    return `${c.id.padEnd(13)} ${row.seconds}s  ${shown}`;
  },
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's extract on each session, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
akm's engine, and scores the memories it saves. Settings come from .env at the repository root.`,
    corpus: "            The default custom corpus is private/extract/assets, made by ./generate-assets.",
    limit: "run N sessions, taken from each class in turn",
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/extract/results, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of one corpus, without the flags, for its callers (the tests): `ctx` is the driver's (see RunCtx in lib/run.ts), and the results go to `resultsParent`. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
