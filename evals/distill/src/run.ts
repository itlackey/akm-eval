#!/usr/bin/env bun
// distill: runs akm's distill on the memory of each case, with the model under test as akm's engine, and scores
// the lessons it queues. See ../README.md.
//
//   evals/distill/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is distill's: the spec that says what a case is
// and how it is shown.

import { relative, resolve } from "node:path";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { IMPROVE_TIMEOUT_MS, NAME, STRATEGY, configFor, runCase } from "./collect.ts";
import { assetsSha256, loadCases, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type LoadedCase, type Metrics, type Row, pct, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** The fields of a distill summary that come from its rows, besides those every eval has: the counts, `timeouts`, `served_models` and `metrics`. */
type Own = ReturnType<typeof summarize>;

function printSummary(s: Summary & Own): void {
  const m: Metrics = s.metrics;
  const served = s.served_models.length > 0 && s.served_models.join() !== s.model ? ` (served as ${s.served_models.join(", ")})` : "";
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model}${served} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  good lessons   ${m.good_lessons.good}/${m.good_lessons.n}  ${pct(m.good_lessons.rate)}   of the cases that expect a lesson`);
  console.log(`  wrong lessons  ${m.wrong_lessons.wrong}/${m.wrong_lessons.n}  ${pct(m.wrong_lessons.rate)}   of the cases that expect none`);
  if (m.lesson_updates.n > 0) console.log(`  lesson updates ${m.lesson_updates.right}/${m.lesson_updates.n}  ${pct(m.lesson_updates.rate)}   of the cases that expect an update to a lesson the library holds`);
  const toRead = m.good_lessons.ambiguous + m.lesson_updates.ambiguous;
  if (toRead > 0) console.log(`  to read        ${toRead}  lessons that hold a phrase only behind a negation the rule cannot read (ambiguous in samples.jsonl)`);
  for (const [klass, c] of Object.entries(m.by_class)) console.log(`    ${klass.padEnd(16)} ${c.good !== undefined ? `${c.good}/${c.n} good` : c.right !== undefined ? `${c.right}/${c.n} right` : `${c.wrong}/${c.n} wrong`}`);
  console.log(`  errored        ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  console.log(`  results        ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  return [
    ["good lessons", cell(a.metrics.good_lessons.good, a.metrics.good_lessons.n, a.metrics.good_lessons.rate), cell(b.metrics.good_lessons.good, b.metrics.good_lessons.n, b.metrics.good_lessons.rate)],
    ["wrong lessons", cell(a.metrics.wrong_lessons.wrong, a.metrics.wrong_lessons.n, a.metrics.wrong_lessons.rate), cell(b.metrics.wrong_lessons.wrong, b.metrics.wrong_lessons.n, b.metrics.wrong_lessons.rate)],
    ["lesson updates", cell(a.metrics.lesson_updates.right, a.metrics.lesson_updates.n, a.metrics.lesson_updates.rate), cell(b.metrics.lesson_updates.right, b.metrics.lesson_updates.n, b.metrics.lesson_updates.rate)],
    ["lessons to read", String(a.metrics.good_lessons.ambiguous + a.metrics.lesson_updates.ambiguous), String(b.metrics.good_lessons.ambiguous + b.metrics.lesson_updates.ambiguous)],
    ["errored", String(a.n_errored), String(b.n_errored)],
  ];
}

const SPEC: EvalSpec<LoadedCase, Row> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  defaultTimeoutMs: IMPROVE_TIMEOUT_MS,
  casesFile: "cases.json",
  loadCases,
  selectCases,
  assetsSha256,
  configFor,
  runCase,
  progress: (c, row) => {
    const shown = row.verdict === "error" ? `error  ${row.error?.slice(0, 120)}` : `${row.verdict.padEnd(6)} ${row.outcome}${row.detail ? ` (${row.detail.slice(0, 60)})` : ""}`;
    return `${c.id.padEnd(10)} ${row.seconds}s  ${shown}`;
  },
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's distill on the memory of each case, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME
as akm's engine, and scores the lessons it queues. Settings come from .env at the repository root.`,
    corpus: "            Your own labelled memories are a custom corpus too: --cases DIR, with the feedback recorded about them in the cases that carry it.",
    limit: "run N cases, taken from each class in turn",
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/distill/results, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of one corpus, without the flags, for its callers (the tests, and lib/provenance.e2e.test.ts): `ctx` is the driver's (see RunCtx in lib/run.ts), and the results go to `resultsParent`. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
