#!/usr/bin/env bun
// drain-judge: runs akm's proposal judgment (`akm judge proposal.judgment`), with the model under test as the judge, on frozen promotions. See ../README.md.
//
//   evals/drain-judge/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is drain-judge's: the spec that says what a case is and how it is shown.
// Every case of a run goes through one akm sandbox, two at a time unless --concurrency says otherwise.

import { readFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Sandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { fail } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { requireJudge } from "../../../lib/judge.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { JUDGE, JUDGE_TIMEOUT_MS, NAME, SCHEMA, configFor, judgeCase, openSandbox } from "./collect.ts";
import { CASES, casesSha256, rubricVersion } from "./inputs.ts";
import { type Case, type Metrics, type Row, type Share, hasVerdict, parseCases, pct, selectCases, summarize } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const MIN_AKM = "0.10.261105"; // `akm judge` is not in a release yet: akm main from #1416, which reports this version

/** What a run opens for its cases: the one sandbox, with the config written, that all of them go through. */
type Extra = { sandbox: Sandbox };

/** The fields of a drain-judge summary that come from its rows and from the rubric, besides those every eval has. */
type Own = ReturnType<typeof summarize> & {
  /** The version of the rubric the labels were adjudicated under (assets/README.md). Scores from other versions do not compare. */
  rubric_version: number;
};

const cell = (r: Share): string => `${r.count}/${r.n}  ${pct(r.rate)}`;
const precisionCell = (m: Metrics): string => `${m.precision.accepted_good}/${m.precision.accepted}  ${pct(m.precision.value)}`;
const erroredText = (s: Summary & Own): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;

function printSummary(s: Summary & Own): void {
  const m = s.metrics as Metrics;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(18)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | rubric ${s.rubric_version} | ${s.n_run} of ${s.n_cases} cases`);
  line("bad accepted", cell(m.bad_accepted));
  for (const [c, r] of Object.entries(m.by_category)) line(`  ${c}`, cell(r));
  line("good accepted", cell(m.good_accepted));
  line("good rejected", cell(m.good_rejected));
  line("precision", precisionCell(m));
  line("deferred, good", cell(m.defer_rate.good));
  line("deferred, bad", cell(m.defer_rate.bad));
  line("unparseable", cell(m.unparseable_rate));
  line("errored", erroredText(s));
  line("seconds a call", `${m.seconds.mean ?? "n/a"} (median ${m.seconds.median ?? "n/a"})`);
  if (s.status === "aborted") line("status", `aborted: ${s.aborted_reason}`);
  line("results", `${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
const sideBySide = (a: Summary & Own, b: Summary & Own): [string, string, string][] => [
  ["bad accepted", cell(a.metrics.bad_accepted), cell(b.metrics.bad_accepted)],
  ["good accepted", cell(a.metrics.good_accepted), cell(b.metrics.good_accepted)],
  ["good rejected", cell(a.metrics.good_rejected), cell(b.metrics.good_rejected)],
  ["precision", precisionCell(a.metrics), precisionCell(b.metrics)],
  ["deferred, good", cell(a.metrics.defer_rate.good), cell(b.metrics.defer_rate.good)],
  ["deferred, bad", cell(a.metrics.defer_rate.bad), cell(b.metrics.defer_rate.bad)],
  ["errored", erroredText(a), erroredText(b)],
];

const SPEC: EvalSpec<Case, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  minAkm: MIN_AKM,
  defaultTimeoutMs: JUDGE_TIMEOUT_MS,
  defaultConcurrency: 1,
  rewrite: false,
  loadCases: (folder) => {
    const file = join(folder, CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256: (folder) => casesSha256(folder),
  // The sandbox holds the config, so one is opened for the cases of a run and removed after them; that counts its model calls for the summary.
  openRun: async (ctx) => {
    const sandbox = openSandbox(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider);
    // A version number does not say that `akm judge` is there at the schema this eval reads, so ask akm.
    await requireJudge(sandbox, JUDGE, SCHEMA).catch((e: Error) => {
      removeSandbox(sandbox);
      if (ctx.resultsDir) rmSync(ctx.resultsDir, { recursive: true, force: true }); // the folder of a run that made no case
      fail(`${e.message}. drain-judge needs an akm build with \`akm judge proposal.judgment\` at that schemaVersion, such as akm main.`);
    });
    return { sandbox, close: () => removeSandbox(sandbox) };
  },
  configFor: (ctx) => configFor(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider),
  runCase: judgeCase,
  // A reply with no decision counts toward giving up, errored or not: with the endpoint down, or a model that answers nothing the judge can read, every case is left pending.
  giveUpOn: (row) => (hasVerdict(row) ? null : row.error || row.reason || "no verdict"),
  progress: (c, row) => {
    const note = row.error ?? (hasVerdict(row) ? "" : row.reason);
    return `${c.label.padEnd(4)} ${c.category.padEnd(9)} ${row.outcome.padEnd(11)} ${row.seconds}s  ${c.id}${note ? `  ${note.slice(0, 120)}` : ""}`;
  },
  summaryExtras: () => ({ rubric_version: rubricVersion(join(EVAL_DIR, "assets")) }),
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's proposal judgment (akm judge proposal.judgment), with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the judge,
on frozen consolidate promotions. Settings come from .env at the repository root.`,
    corpus: `            promotion has no rewrite: its custom corpus is --cases DIR only.`,
    limit: "run N cases, taken in turn from good, ephemeral, duplicate and stale",
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of a corpus. The sandbox is the run's own: `ctx` is what the flags give, and openRun adds the rest. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx as CtxInput<Extra>, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
