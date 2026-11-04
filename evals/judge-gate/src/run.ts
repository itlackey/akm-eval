#!/usr/bin/env bun
// judge-gate: runs akm's reflect quality judge, with the model under test as the judge, on labelled
// proposals. See ../README.md.
//
//   evals/judge-gate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--harness opencode] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is judge-gate's: the spec that says what a case
// is and how it is shown. Every case of a run goes through one akm sandbox, two at a time unless --concurrency says otherwise.

import { readFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Sandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { fail } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { requireJudge } from "../../../lib/judge.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { CASES, casesSha256, rubricVersion } from "./inputs.ts";
import { HARNESSES, JUDGE, JUDGE_TIMEOUT_MS, SCHEMA, NAME, STRATEGY, configFor, judgeCase, openSandbox } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Case, type Rate, type Row, type Share, hasVerdict, parseCases, pct, selectCases, summarize } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const MIN_AKM = "0.10.261105"; // `akm judge` is not in a release yet: akm main from #1416, which reports this version

/** What the run records of the harness the judge ran on: its name, the version it printed in the run's own sandbox, and that its HOME was the sandbox's. */
type HarnessRecord = { name: string; version: string; isolated_home: true };

/** What a run opens for its cases: the one sandbox, with the config written, that all of them go through. `harness` is --harness. */
type Extra = { sandbox: Sandbox; harness?: string; harnessRecord?: HarnessRecord };

/** The version a harness prints, run as the judge runs it: in the sandbox's environment. It also makes the harness's database before the cases need it. */
function harnessVersion(sandbox: Sandbox, name: string): string {
  const run = Bun.spawnSync([name, "--version"], { env: sandbox.env, cwd: sandbox.dir, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  const version = run.stdout.toString().trim().match(/\d+\.\d+\.\d+\S*/)?.[0];
  if (run.exitCode !== 0 || !version) throw new Error(`could not run \`${name} --version\`: is ${name} installed and on PATH?`);
  // opencode makes its database on its first command, and two first commands at once fail with "database is locked". The cases run two at a time.
  Bun.spawnSync([name, "session", "list"], { env: sandbox.env, cwd: sandbox.dir, stdout: "ignore", stderr: "ignore", timeout: 60_000 });
  return version;
}

/** The fields of a judge-gate summary that come from its rows and from the rubric, besides those every eval has. */
type Own = ReturnType<typeof summarize> & {
  /** The version of the rubric the labels were adjudicated under (assets/README.md). Scores from other versions do not compare. */
  rubric_version: number;
};

const cell = (r: Rate | Share): string => `${"count" in r ? r.count : r.passed}/${r.n}  ${pct(r.rate)}`;
const precisionCell = (s: Summary & Own): string => `${s.metrics.precision.passed_good}/${s.metrics.precision.passed}  ${pct(s.metrics.precision.value)}`;
const erroredText = (s: Summary & Own): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(16)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | rubric ${s.rubric_version} | ${s.n_run} of ${s.n_cases} cases`);
  line("harmful accepted", cell(m.harmful_auto_accepted));
  line("good passed", cell(m.good));
  line("good rejected", cell(m.good_rejected));
  line("review share", cell(m.review_share));
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
  ["harmful accepted", cell(a.metrics.harmful_auto_accepted), cell(b.metrics.harmful_auto_accepted)],
  ["good rejected", cell(a.metrics.good_rejected), cell(b.metrics.good_rejected)],
  ["review share", cell(a.metrics.review_share), cell(b.metrics.review_share)],
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
    const sandbox = openSandbox(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider, ctx.harness);
    let harnessRecord: HarnessRecord | undefined;
    try {
      if (ctx.harness) harnessRecord = { name: ctx.harness, version: harnessVersion(sandbox, ctx.harness), isolated_home: true };
    } catch (e) {
      removeSandbox(sandbox);
      if (ctx.resultsDir) rmSync(ctx.resultsDir, { recursive: true, force: true });
      fail((e as Error).message);
    }
    // A version number does not say that `akm judge` is there at the schema this eval reads, so ask akm.
    await requireJudge(sandbox, JUDGE, SCHEMA).catch((e: Error) => {
      removeSandbox(sandbox);
      if (ctx.resultsDir) rmSync(ctx.resultsDir, { recursive: true, force: true }); // the folder of a run that made no case
      fail(`${e.message}. judge-gate needs an akm build with akm#1419 (reflect's review floor in the verdict), such as akm main.`);
    });
    return { sandbox, harnessRecord, close: () => removeSandbox(sandbox) };
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
  summaryExtras: (_cases, _rows, ctx) => ({ rubric_version: rubricVersion(join(EVAL_DIR, "assets")), ...(ctx.harnessRecord ? { harness: ctx.harnessRecord } : {}) }),
  manifestExtras: (ctx) => (ctx.harnessRecord ? { eval_settings: { harness: ctx.harnessRecord.name, harness_version: ctx.harnessRecord.version, isolated_home: true } } : {}),
  options: { harness: { type: "string" } },
  prepare: (values) => {
    if (values.harness !== undefined && !(HARNESSES as readonly string[]).includes(values.harness)) throw new Error(`--harness must be one of ${HARNESSES.join(", ")}, not "${values.harness}"`);
    return () => ({ harness: values.harness as string | undefined });
  },
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's reflect quality judge (akm judge reflect.quality), with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled proposals. Settings come from .env at the repository root.`,
    corpus: `            The default custom corpus is private/judge-gate/assets, made by ./generate-assets: a light rewrite of the same
            cases, not held-out data.`,
    limit: "run N cases, in the good/bad proportion of the whole set, with at least one of each from 2 cases on",
    flags: "[--harness opencode]",
    extra: `  --harness opencode  put the judge on the opencode harness (\`akm judge --harness\`) in place of the default connection, with the model under test.
            It runs in an empty HOME with an opencode config of its own, so it reads nothing of your setup. The summary records the harness and its version.`,
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of a corpus. The sandbox is the run's own: `ctx` is what the flags give, and openRun adds the rest. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx as CtxInput<Extra>, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
