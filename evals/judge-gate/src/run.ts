#!/usr/bin/env bun
// judge-gate: runs akm's reflect quality judge, with the model under test as the judge, on labelled
// proposals. See ../README.md.
//
//   evals/judge-gate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is judge-gate's: the spec that says what a case
// is and how it is shown. Every case of a run goes through one akm sandbox, two at a time.

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Sandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { CASES, casesSha256, rubricVersion } from "./inputs.ts";
import { JUDGE_TIMEOUT_MS, NAME, STRATEGY, configFor, judgeCase, openSandbox } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Case, type Rate, type Row, hasVerdict, parseCases, pct, selectCases, summarize } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const MIN_AKM = "0.9.25-alpha.2"; // the first release with `akm improve judge`

/** What a run opens for its cases: the one sandbox, with the config written, that all of them go through. */
type Extra = { sandbox: Sandbox };

/** The fields of a judge-gate summary that come from its rows and from the rubric, besides those every eval has. */
type Own = ReturnType<typeof summarize> & {
  /** The version of the rubric the labels were adjudicated under (assets/README.md). Scores from other versions do not compare. */
  rubric_version: number;
};

const cell = (r: Rate): string => `${r.passed}/${r.n}  ${pct(r.rate)}`;
const precisionCell = (s: Summary & Own): string => `${s.metrics.precision.passed_good}/${s.metrics.precision.passed}  ${pct(s.metrics.precision.value)}`;
const erroredText = (s: Summary & Own): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(12)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | rubric ${s.rubric_version} | ${s.n_run} of ${s.n_cases} cases`);
  line("good passed", cell(m.good));
  line("bad passed", cell(m.bad));
  line("  harmful", cell(m.bad_harmful));
  line("  churn", cell(m.bad_churn));
  line("precision", precisionCell(s));
  line("errored", erroredText(s));
  if (s.status === "aborted") line("status", `aborted: ${s.aborted_reason}`);
  line("results", `${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
const sideBySide = (a: Summary & Own, b: Summary & Own): [string, string, string][] => [
  ["good passed", cell(a.metrics.good), cell(b.metrics.good)],
  ["bad passed", cell(a.metrics.bad), cell(b.metrics.bad)],
  ["  harmful", cell(a.metrics.bad_harmful), cell(b.metrics.bad_harmful)],
  ["  churn", cell(a.metrics.bad_churn), cell(b.metrics.bad_churn)],
  ["precision", precisionCell(a), precisionCell(b)],
  ["errored", erroredText(a), erroredText(b)],
];

const SPEC: EvalSpec<Case, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  minAkm: MIN_AKM,
  defaultTimeoutMs: JUDGE_TIMEOUT_MS,
  defaultConcurrency: 2,
  loadCases: (folder) => {
    const file = join(folder, CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256: (folder) => casesSha256(folder),
  // The sandbox holds the config, so one is opened for the cases of a run and removed after them; that counts its model calls for the summary.
  openRun: async (ctx) => {
    const sandbox = openSandbox(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider);
    return { sandbox, close: () => removeSandbox(sandbox) };
  },
  configFor: (ctx) => configFor(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider),
  runCase: judgeCase,
  // A reply with no verdict counts toward giving up, errored or not: with the endpoint down, or a model that answers nothing the judge can read,
  // akm routes every case to review with a score of -1, and those rows are not errored. The reason is the error, else akm's own.
  giveUpOn: (row) => (hasVerdict(row) ? null : row.error || row.reason || "no verdict"),
  progress: (c, row) => {
    const note = row.error ?? (hasVerdict(row) ? "" : row.reason);
    return `${c.label.padEnd(4)} ${row.outcome.padEnd(6)} ${row.seconds}s  ${c.id.slice(0, 8)}${note ? `  ${note.slice(0, 120)}` : ""}`;
  },
  // The private cases are a rewrite of the public ones, so their labels follow the public rubric.
  summaryExtras: () => ({ rubric_version: rubricVersion(join(EVAL_DIR, "assets")) }),
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's reflect quality judge, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled proposals. Settings come from .env at the repository root.`,
    corpus: `            The default custom corpus is private/judge-gate/assets, made by ./generate-assets: a light rewrite of the same
            cases, not held-out data.`,
    limit: "run N cases, in the good/bad proportion of the whole set, with at least one of each from 2 cases on",
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of a corpus. The sandbox is the run's own: `ctx` is what the flags give, and openRun adds the rest. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx as CtxInput<Extra>, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
