#!/usr/bin/env bun
// promotion: plants labelled promotion proposals in akm's queue, runs akm's drain with its judgment tier, with the model
// under test as the judge, and counts which proposals it accepts. See ../README.md.
//
//   evals/promotion/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--timeout-ms N]
//
// The flags, the setup and the summary are lib/run.ts. This file is what is promotion's: the spec that says what a corpus is and how it is shown,
// and the batch: all the proposals of a run go into one sandbox and one drain, so there is no pool of workers and no --concurrency.

import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Sandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { Fatal, fail, hideEndpoint } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { corpusFolderOf } from "../../../lib/manifest.ts";
import { type CtxInput, type EvalSpec, type Summary, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { type Calls, DRAIN_TIMEOUT_MS, NAME, STRATEGY, callStats, collect, configFor, openSandbox } from "./collect.ts";
import { assetsSha256, bundleSha256, parseCases, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { BAD, type Case, type Row, errored, pct, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** The cases file and the library of a corpus folder: a folder of cases.jsonl and library/. */
const casesOf = (folder: string): string => join(folder, "cases.jsonl");
const libraryOf = (folder: string): string => join(folder, "library");

/** What a run opens for its proposals: the sandbox they are planted in, the library of notes they are planted among, and what the batch leaves for the summary. */
interface Opened {
  sandbox: Sandbox;
  library: string;
  /** collectAll fills it in: how long the batch took, and the digest of the notes the proposals were planted among (the input of every case). */
  batch: { seconds: number; bundle: string };
}

/** The fields of a promotion summary that come from its rows and its batch, besides those every eval has. */
type Own = ReturnType<typeof summarize> & {
  /** How long the batch took: planting, the drain and reading back what it did. */
  seconds: number;
  calls: Calls | null;
};

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} proposals, ${(s.seconds / 60).toFixed(1)} min`);
  console.log(`  good in the set   ${cell(m.proposals.good, m.proposals.n, m.proposals.share_good)}`);
  console.log(`  accepted          ${m.accepted.n}: ${m.accepted.good} good, ${m.accepted.n - m.accepted.good} bad`);
  console.log(`  recall            ${cell(m.recall.accepted, m.recall.of, m.recall.value)}   good proposals accepted`);
  console.log(`  precision         ${cell(m.precision.good, m.precision.of, m.precision.value)}   accepted proposals that are good`);
  console.log(`  bad accepted      ${cell(m.bad_accepted.accepted, m.bad_accepted.of, m.bad_accepted.value)}`);
  for (const c of BAD) console.log(`    ${c.padEnd(10)}      ${cell(m.by_category[c].accepted, m.by_category[c].n, m.by_category[c].rate)}`);
  console.log(`  errored           ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}${s.calls ? `   (${s.calls.n} model calls, ${s.calls.failures} failed)` : ""}`);
  console.log(`  results           ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  const column = (s: Summary & Own): string[] => [
    cell(s.metrics.proposals.good, s.metrics.proposals.n, s.metrics.proposals.share_good),
    cell(s.metrics.recall.accepted, s.metrics.recall.of, s.metrics.recall.value),
    cell(s.metrics.precision.good, s.metrics.precision.of, s.metrics.precision.value),
    cell(s.metrics.bad_accepted.accepted, s.metrics.bad_accepted.of, s.metrics.bad_accepted.value),
    ...BAD.map((c) => cell(s.metrics.by_category[c].accepted, s.metrics.by_category[c].n, s.metrics.by_category[c].rate)),
    String(s.n_errored),
  ];
  const labels = ["good in the set", "recall", "precision", "bad accepted", ...BAD.map((c) => `  ${c}`), "errored"];
  const [x, y] = [column(a), column(b)];
  return labels.map((label, i): [string, string, string] => [label, x[i] as string, y[i] as string]);
}

const SPEC: EvalSpec<Case, Row, Opened> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  // --timeout-ms is the limit of the drain, the one long command; the steps around it keep their own.
  defaultTimeoutMs: DRAIN_TIMEOUT_MS,
  rewrite: false,
  loadCases: (folder) => {
    if (!existsSync(join(libraryOf(folder), "knowledge"))) throw new Error(`${corpusFolderOf(folder) ?? folder}/library/knowledge/ does not exist. The folder of a custom corpus holds library/knowledge/ as well as cases.jsonl: see "Run your own set" in evals/promotion/README.md.`);
    const file = casesOf(folder);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256: (folder) => assetsSha256(casesOf(folder), libraryOf(folder)),
  // One sandbox for the run: the proposals are planted in it and judged in one drain. Removing it counts its model calls for the summary.
  openRun: async (ctx, corpus) => {
    const sandbox = openSandbox(ctx);
    return { sandbox, library: libraryOf(corpus.folder), batch: { seconds: 0, bundle: "" }, close: () => removeSandbox(sandbox) };
  },
  configFor,
  // The proposals are never run one at a time: collectAll takes them as one batch.
  runCase: () => {
    throw new Error("promotion runs its proposals as one batch (collectAll), not one case at a time");
  },
  collectAll: async (cases, ctx, record) => {
    try {
      const { rows, seconds } = await collect(ctx.sandbox, cases, ctx.library, ctx);
      ctx.batch.seconds = seconds;
      ctx.batch.bundle = bundleSha256(ctx.library, cases);
      for (const row of rows) record(row);
      // A run where no proposal got a verdict says nothing, so it is aborted; a run where only some did not is a result.
      return { rows, aborted: rows.every(errored) ? `no proposal got a verdict. First error: ${rows[0]?.error}` : undefined };
    } catch (e) {
      if (e instanceof Fatal) throw e;
      return fail(hideEndpoint((e as Error).message, ctx.baseUrl), 1); // a failed akm command: its message, not a stack
    }
  },
  progress: (c, row) => `${c.category.padEnd(9)} ${row.outcome.padEnd(6)} ${c.id}${row.error ? `  ${row.error.slice(0, 120)}` : ""}`,
  // what each case presented to akm includes the notes of the bundle it was planted among
  caseContext: (_c, ctx) => ctx.batch.bundle,
  summaryExtras: (_cases, _rows, ctx) => ({ seconds: ctx.batch.seconds, calls: callStats(ctx.sandbox) }),
  printSummary,
  sideBySide,
  usage: {
    about: `Plants labelled promotion proposals in akm's queue, runs \`akm proposal drain --judgment\` with the model in MODEL_BASE_URL,
MODEL_API_KEY and MODEL_NAME as the judge, and counts which proposals it accepts. Settings come from .env at the repository root.`,
    corpus: `            promotion has no rewrite: its custom corpus is --cases DIR only. The folder holds cases.jsonl and library/ (see "Run your own
            set" in evals/promotion/README.md). Results of a custom corpus go to private/promotion/results/.`,
    limit: "run N proposals, one of each category in turn",
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/promotion/results/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

/** One run of a corpus. The sandbox is the run's own: `ctx` is what the flags give, and openRun adds the rest. */
export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx as CtxInput<Opened>, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
