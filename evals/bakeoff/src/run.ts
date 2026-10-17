#!/usr/bin/env bun
// bakeoff: runs the akm commands that make the work no other eval measures (memory inference, remember --enrich, schema repair, the summary
// of a session, consolidate's promotions) with the model under test as akm's engine, and scores what akm wrote with checks that need no
// judge. See ../README.md.
//
//   evals/bakeoff/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--process NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is bakeoff's: the spec that says what a case is
// and how it is shown, and the --process flag. Bakeoff has no strategy: each process has its own, so it has no --strategy.

import { relative, resolve } from "node:path";
import { fail } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { CASES_FILE, type LoadedCase, NAME, PROCESSES, type Process, type Row, TIMEOUT_MS, assetsSha256, configFor, loadCases, pct, runCase, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
export const MIN_AKM = "0.9.26"; // the release the commands, the config and the output read here were checked against

/** What bakeoff adds to the context of a case: the one process the run is limited to. */
type Extra = { process?: Process };

/** The field of a bakeoff summary that is neither one every eval has nor from its rows. */
type Own = { process: Process | null };

const cell = (n: { n: number; passed: number } | undefined): string => (n ? `${n.passed}/${n.n}` : "-");

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  valid output    ${cell(m.valid_output)}  ${pct(m.valid_output.rate)}`);
  console.log(`  cases passed    ${cell(m.case_pass)}  ${pct(m.case_pass.rate)}`);
  console.log(`  checks held     ${pct(m.checks.rate)} (the mean share of a case's checks)`);
  console.log(`  median seconds  ${m.median_seconds ?? "n/a"}`);
  console.log(`  errored         ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  if (Object.keys(s.served).length > 0) console.log(`  served by       ${Object.entries(s.served).map(([name, n]) => `${name} ${n}`).join(", ")}`);
  for (const process of PROCESSES) {
    const k = m.by_process[process];
    if (!k) continue;
    const failed = Object.entries(k.failed).map(([name, n]) => `${name} ${n}`).join(", ");
    const other = (["unusable", "error"] as const).filter((o) => k.outcomes[o] > 0).map((o) => `${o} ${k.outcomes[o]}`).join(", ");
    console.log(`    ${process.padEnd(20)} ${`${k.passed}/${k.n}`.padEnd(5)} ${pct(k.checks).padEnd(7)} ${[failed && `failed: ${failed}`, other && `outcomes: ${other}`].filter(Boolean).join("; ")}`);
  }
  console.log(`  results         ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  const col = (s: Summary, process: Process): string => cell(s.metrics.by_process[process] ? { n: s.metrics.by_process[process].n, passed: s.metrics.by_process[process].passed } : undefined);
  return [
    ["valid output", `${cell(a.metrics.valid_output)}  ${pct(a.metrics.valid_output.rate)}`, `${cell(b.metrics.valid_output)}  ${pct(b.metrics.valid_output.rate)}`],
    ["cases passed", `${cell(a.metrics.case_pass)}  ${pct(a.metrics.case_pass.rate)}`, `${cell(b.metrics.case_pass)}  ${pct(b.metrics.case_pass.rate)}`],
    ["checks held", pct(a.metrics.checks.rate), pct(b.metrics.checks.rate)],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ...PROCESSES.filter((p) => a.metrics.by_process[p] || b.metrics.by_process[p]).map((p): [string, string, string] => [`  ${p}`, col(a, p), col(b, p)]),
  ];
}

const SPEC: EvalSpec<LoadedCase, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  minAkm: MIN_AKM,
  defaultTimeoutMs: TIMEOUT_MS,
  casesFile: CASES_FILE,
  loadCases,
  selectCases: (all, limit, ctx) => {
    const cases = selectCases(all, limit, ctx.process);
    if (cases.length === 0) fail(`no case to run: the corpus has none for ${ctx.process}`);
    return cases;
  },
  assetsSha256,
  configFor,
  runCase,
  progress: (c, row) => {
    const verdict = row.outcome === "error" ? `error  ${(row.error ?? "").slice(0, 120)}` : `${row.outcome.padEnd(8)} ${row.correct ? "ok" : `FAIL ${Object.entries(row.checks ?? {}).filter(([, ok]) => !ok).map(([name]) => name).join(", ") || "shape"}`}`;
    return `${c.id.padEnd(34)} ${c.process.padEnd(19)} ${verdict}  ${row.seconds}s`;
  },
  prepare: (values) => {
    if (values.process !== undefined && !(PROCESSES as readonly string[]).includes(values.process)) throw new Error(`--process must be one of ${PROCESSES.join(", ")}, not "${values.process}"`);
    return () => ({ process: values.process as Process | undefined });
  },
  summaryExtras: (_cases, _rows, ctx) => ({ process: ctx.process ?? null }),
  printSummary,
  sideBySide,
  options: { process: { type: "string" } },
  usage: {
    about: `Runs the akm command of each process on each case, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
its engine, and scores what akm wrote. Settings come from .env at the repository root.`,
    limit: "run N cases, the first of each process in turn, so a short run covers every process",
    flags: "[--process NAME]",
    extra: `  --process NAME  the process to run, one of ${PROCESSES.join(", ")}. Default: all of them.`,
  },
};

export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput<Extra>, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
