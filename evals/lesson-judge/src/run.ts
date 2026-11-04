#!/usr/bin/env bun
// lesson-judge: runs akm's lesson judge (`akm judge distill.lesson`), with the model under test as the judge, on labelled lessons. See ../README.md.
//
//   evals/lesson-judge/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is lesson-judge's: the spec that says what a case is and how it
// is shown. Every case of a run goes through one akm sandbox, two at a time unless --concurrency says otherwise.

import { readFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Sandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { fail } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { requireJudge } from "../../../lib/judge.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { JUDGE, JUDGE_TIMEOUT_MS, NAME, SCHEMA, STRATEGY, configFor, judgeCase, openSandbox } from "./collect.ts";
import { CASES, casesSha256, parseCases, pct, rubricVersion, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Case, type Mode, type Rate, type Row, type Share, hasVerdict, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const MIN_AKM = "0.10.261105"; // `akm judge` is not in a release yet: akm main from #1416, which reports this version

/** What a run opens for its cases: the one sandbox, with the config written, that all of them go through. */
type Extra = { sandbox: Sandbox };

/** The fields of a lesson-judge summary that come from its rows and from the rubric, besides those every eval has. */
type Own = ReturnType<typeof summarize> & {
  /** The version of the rubric the labels were adjudicated under (assets/README.md). Scores from other versions do not compare. */
  rubric_version: number;
};

const cell = (r: Rate | Share): string => `${"count" in r ? r.count : r.passed}/${r.n}  ${pct(r.rate)}`;
const erroredText = (s: Summary & Own): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;
const MODES: Mode[] = ["new", "update"];

function printSummary(s: Summary & Own): void {
  const m = s.metrics as ReturnType<typeof summarize>["metrics"];
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(24)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | rubric ${s.rubric_version} | ${s.n_run} of ${s.n_cases} cases`);
  for (const mode of MODES) {
    line(`${mode}: bad passed`, cell(m.bad[mode]));
    for (const [k, r] of Object.entries(m.bad_by_kind).filter(([k]) => k.startsWith(`${mode}/`))) line(`  ${k.slice(mode.length + 1)}`, cell(r));
    line(`${mode}: good passed`, cell(m.good[mode]));
    for (const origin of ["real", "hand-written"] as const) line(`  ${origin} bad/good`, `${cell(m.by_origin[origin].bad[mode])}, ${cell(m.by_origin[origin].good[mode])}`);
    line(`${mode}: good rejected`, cell(m.good_rejected[mode]));
  }
  line("review share (new)", cell(m.review_share));
  line("no verdict", `error ${cell(m.no_verdict.error)}, unparseable ${cell(m.no_verdict.unparseable)}`);
  line("seconds per call", `mean ${m.seconds.mean ?? "n/a"}, median ${m.seconds.median ?? "n/a"}, max ${m.seconds.max ?? "n/a"}`);
  line("errored", erroredText(s));
  if (s.status === "aborted") line("status", `aborted: ${s.aborted_reason}`);
  line("results", `${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
const sideBySide = (a: Summary & Own, b: Summary & Own): [string, string, string][] =>
  MODES.flatMap((mode): [string, string, string][] => [
    [`${mode}: bad passed`, cell(a.metrics.bad[mode]), cell(b.metrics.bad[mode])],
    [`${mode}: good passed`, cell(a.metrics.good[mode]), cell(b.metrics.good[mode])],
  ]);

const SPEC: EvalSpec<Case, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  minAkm: MIN_AKM,
  defaultTimeoutMs: JUDGE_TIMEOUT_MS,
  defaultConcurrency: 2,
  // The cases are real distill output; a rewrite would change what akm's pipeline produced. A custom corpus is --cases DIR only.
  rewrite: false,
  loadCases: (folder) => {
    const file = join(folder, CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256: (folder) => casesSha256(folder),
  openRun: async (ctx) => {
    const sandbox = openSandbox(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider);
    // A version number does not say that `akm judge` is there at the schema this eval reads, so ask akm.
    await requireJudge(sandbox, JUDGE, SCHEMA).catch((e: Error) => {
      removeSandbox(sandbox);
      if (ctx.resultsDir) rmSync(ctx.resultsDir, { recursive: true, force: true }); // the folder of a run that made no case
      fail(`${e.message}. lesson-judge needs an akm build with \`akm judge distill.lesson\` at schemaVersion ${SCHEMA}, such as akm main.`);
    });
    return { sandbox, close: () => removeSandbox(sandbox) };
  },
  configFor: (ctx) => configFor(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider),
  runCase: judgeCase,
  // A reply with no verdict counts toward giving up, errored or not: with the endpoint down akm answers `error` on every case, and those rows are not errored.
  giveUpOn: (row) => (hasVerdict(row) ? null : row.error || row.reason || "no verdict"),
  progress: (c, row) => {
    const note = row.error ?? (hasVerdict(row) ? "" : row.reason);
    return `${c.mode.padEnd(6)} ${c.label.padEnd(4)} ${row.outcome.padEnd(6)} ${row.seconds}s  ${c.id}${note ? `  ${note.slice(0, 120)}` : ""}`;
  },
  summaryExtras: () => ({ rubric_version: rubricVersion(join(EVAL_DIR, "assets")) }),
  printSummary,
  sideBySide,
  usage: {
    about: `Runs akm's lesson judge (akm judge distill.lesson), with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled lessons. Settings come from .env at the repository root.`,
    corpus: `            There is no rewrite: the cases are the input akm's distill built on real runs. The held-out cases are
            --cases evals/lesson-judge/assets/held-out.`,
    limit: "run N cases, in the good/bad proportion of the whole set, with at least one of each from 2 cases on",
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of a corpus. The sandbox is the run's own: `ctx` is what the flags give, and openRun adds the rest. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx as CtxInput<Extra>, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
