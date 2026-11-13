#!/usr/bin/env bun
// pair-judge: runs akm's consolidate pair judge, with the model under test as the judge, on labelled pairs of notes. See ../README.md.
//
//   evals/pair-judge/run [--corpus public] [--cases DIR] [--limit N] [--repeat N] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is pair-judge's: the spec that says what a case is and how it
// is shown. Every case of a run goes through one akm sandbox, two at a time unless --concurrency says otherwise.

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Sandbox } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type HarnessRecord, harnessSpec, startJudgeRun } from "../../../lib/judge.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { CASES, casesSha256 } from "./inputs.ts";
import { JUDGE, JUDGE_TIMEOUT_MS, NAME, SCHEMA, configFor, judgeCase, openSandbox } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Case, type Row, type Share, parseCases, pct, selectCases, summarize } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const MIN_AKM = "0.10.261105"; // `akm judge` first reports this version (akm main from #1416); stable 0.10.261120 ships it, Deprecated there (replacement: `akm doctor judge`)

/** What a run opens for its cases: the one sandbox, with the config written, that all of them go through. */
type Extra = { sandbox: Sandbox; harness?: string; harnessRecord?: HarnessRecord };

type Own = ReturnType<typeof summarize>;

const cell = (r: Share): string => `${r.count}/${r.n}  ${pct(r.rate)}`;
const erroredText = (s: Summary & Own): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(18)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  line("unsafe retired", cell(m.unsafe));
  line("safe found", cell(m.found));
  line("precision", `${m.precision.safe}/${m.precision.retired}  ${pct(m.precision.value)}`);
  line("relation right", cell(m.relation));
  line("claims found", `${m.claims.found}/${m.claims.labelled}  ${pct(m.claims.found_rate)}  (${m.claims.unlabelled} unlabelled of ${m.claims.listed} listed)`);
  line("no verdict", cell(m.failed));
  line("errored", erroredText(s));
  line("baseline: older", `unsafe ${cell(m.baselines.always_retire_older.unsafe)}, found ${cell(m.baselines.always_retire_older.found)}`);
  if (s.status === "aborted") line("status", `aborted: ${s.aborted_reason}`);
  line("results", `${relative(ROOT, s.results_dir)}/`);
}

const SPEC: EvalSpec<Case, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  minAkm: MIN_AKM,
  defaultTimeoutMs: JUDGE_TIMEOUT_MS,
  defaultConcurrency: 2,
  rewrite: false,
  loadCases: (folder) => {
    const file = join(folder, CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256: (folder) => casesSha256(folder),
  // The sandbox holds the config, so one is opened for the cases of a run and removed after them; that counts its model calls for the summary.
  openRun: (ctx) =>
    startJudgeRun(openSandbox(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider, ctx.harness), ctx, JUDGE, SCHEMA, `pair-judge needs an akm build with \`akm judge consolidate.pair\` at that schema, such as akm main.`),
  configFor: (ctx) => configFor(ctx.baseUrl, ctx.model, ctx.hasKey, ctx.overrides, ctx.provider),
  runCase: judgeCase,
  // A judge that gives no verdict counts toward giving up, as an error does: with the endpoint down, akm prints `error` for every case, and those rows are not errored.
  giveUpOn: (row) => (row.outcome === "error" ? row.error || "no message" : row.outcome === "failed" ? row.no_verdict?.reason || row.no_verdict?.outcome || "no verdict" : null),
  progress: (c, row) => {
    const note = row.error ?? (row.outcome === "failed" ? row.no_verdict?.reason : "");
    const what = row.outcome === "retire" ? `retire ${row.retired}${row.retired_safe ? "" : " UNSAFE"}` : row.outcome;
    return `${c.kind.padEnd(10)} ${what.padEnd(14)} ${row.seconds}s  ${c.id}${note ? `  ${note.slice(0, 120)}` : ""}`;
  },
  summaryExtras: (_cases, _rows, ctx) => harnessSpec.summary(ctx),
  manifestExtras: harnessSpec.manifestExtras,
  options: harnessSpec.options,
  prepare: harnessSpec.prepare,
  printSummary,
  usage: {
    about: `Runs akm's consolidate pair judge (akm judge consolidate.pair), with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled pairs of notes. Settings come from .env at the repository root.`,
    corpus: `            There is no rewrite of this eval's cases. The held-out cases are a corpus of their own:
            --cases evals/pair-judge/assets/heldout.`,
    limit: "run N cases, each kind in turn (duplicate, subsumed, supersedes, contradicts, overlap, lookalike), in file order",
    flags: harnessSpec.flags,
    extra: harnessSpec.extra,
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of a corpus. The sandbox is the run's own: `ctx` is what the flags give, and openRun adds the rest. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx as CtxInput<Extra>, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
