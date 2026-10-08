#!/usr/bin/env bun
// judge-gate: runs akm's reflect quality judge, with the model under test as the judge, on labelled
// proposals. See ../README.md.
//
//   evals/judge-gate/run [--corpus public|private|all] [--limit N] [--label NAME]

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { type Case, type Row, atLeast, errorRow, failureMessage, judgeConfig, metrics, orderFeedback, parseCases, pct, rowFromVerdict, selectCases } from "./lib.ts";

const NAME = "judge-gate";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const CONCURRENCY = 2;
const JUDGE_TIMEOUT_MS = 15 * 60_000; // one case, on a slow local model
const MIN_AKM = "0.9.25-alpha.2"; // the first release with `akm improve judge`
const GIVE_UP_AFTER = 5; // consecutive cases with no verdict, before any verdict at all

const USAGE = `Usage: evals/judge-gate/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs akm's reflect quality judge, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled proposals. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/. private reads private/judge-gate/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run N cases, in the good/bad proportion of the whole set
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm 0.9.25-alpha.2 or later on PATH, or in AKM_BIN.`;

type Corpus = "public" | "private";

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  limit: number | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  metrics: ReturnType<typeof metrics>;
  results_dir: string;
}

/** A failure that ends the run with a message. It is thrown, so the sandbox is cleaned up on the way out. */
class Fatal extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

function fail(message: string, code = 2): never {
  throw new Fatal(message, code);
}

function gitCommit(): string {
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", ROOT, ...args], { stderr: "ignore" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.exitCode !== 0) return "unknown";
  const dirty = run(["status", "--porcelain", "--untracked-files=no"]).stdout.toString().trim() !== "";
  return head.stdout.toString().trim() + (dirty ? "-dirty" : "");
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function makeResultsDir(parent: string, label: string): string {
  const base = join(parent, `${new Date().toISOString().slice(0, 10)}-${label}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  good passed  ${m.good.passed}/${m.good.n}  ${pct(m.good.rate)}`);
  console.log(`  bad passed   ${m.bad.passed}/${m.bad.n}  ${pct(m.bad.rate)}`);
  console.log(`  precision    ${m.precision.passed_good}/${m.precision.passed}  ${pct(m.precision.value)}`);
  console.log(`  errored      ${s.n_errored}`);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["good passed", cell(a.metrics.good.passed, a.metrics.good.n, a.metrics.good.rate), cell(b.metrics.good.passed, b.metrics.good.n, b.metrics.good.rate)],
    ["bad passed", cell(a.metrics.bad.passed, a.metrics.bad.n, a.metrics.bad.rate), cell(b.metrics.bad.passed, b.metrics.bad.n, b.metrics.bad.rate)],
    ["precision", cell(a.metrics.precision.passed_good, a.metrics.precision.passed, a.metrics.precision.value), cell(b.metrics.precision.passed_good, b.metrics.precision.passed, b.metrics.precision.value)],
    ["errored", String(a.n_errored), String(b.n_errored)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

export async function runCorpus(
  corpus: Corpus,
  ctx: { sandbox: Sandbox; version: string; model: string; label: string; limit?: number },
  folders = {
    assets: corpus === "public" ? join(EVAL_DIR, "assets") : join(ROOT, "private", NAME, "assets"),
    results: corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"),
  },
): Promise<Summary> {
  const { assets, results: resultsParent } = folders;
  const all = parseCases(readFileSync(join(assets, "cases.jsonl"), "utf8"), join(assets, "cases.jsonl"));
  const cases = selectCases(all, ctx.limit);
  const dir = makeResultsDir(resultsParent, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} cases, ${CONCURRENCY} at a time`);

  const rows: Row[] = [];
  let next = 0;
  let consecutiveErrors = 0;
  let anyVerdict = false;
  let aborted: string | undefined;

  const judge = async (c: Case): Promise<Row> => {
    const input = JSON.stringify({ source: c.source, candidate: c.candidate, feedback: orderFeedback(c.feedback) });
    const { stdout, stderr, code, ms } = await runAkm(ctx.sandbox, ["improve", "judge", "--format", "json"], { stdin: input, timeoutMs: JUDGE_TIMEOUT_MS });
    const seconds = Number((ms / 1000).toFixed(1));
    let verdict: unknown;
    try {
      verdict = JSON.parse(stdout);
    } catch {
      return errorRow(c, failureMessage(code, stderr, stdout), seconds);
    }
    return rowFromVerdict(c, verdict, seconds);
  };

  const worker = async () => {
    while (next < cases.length && !aborted) {
      const index = next++;
      const c = cases[index];
      const row = await judge(c);
      rows.push(row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.label.padEnd(4)} ${row.outcome.padEnd(6)} ${row.seconds}s  ${c.id.slice(0, 8)}${row.error ? `  ${row.error.slice(0, 120)}` : ""}`);
      if (row.outcome === "error") {
        consecutiveErrors++;
        if (!anyVerdict && consecutiveErrors >= GIVE_UP_AFTER) aborted = row.error;
      } else {
        anyVerdict = true;
        consecutiveErrors = 0;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

  const errored = rows.filter((r) => r.outcome === "error").length;
  const summary: Summary = {
    eval: NAME,
    corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(),
    model: ctx.model,
    akm_version: ctx.version,
    ...akmBuild(),
    limit: ctx.limit ?? null,
    n_cases: all.length,
    n_run: rows.length,
    n_scored: rows.length - errored,
    n_errored: errored,
    metrics: metrics(rows),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (aborted) fail(`the first ${GIVE_UP_AFTER} cases got no verdict, so the run stopped. Last error: ${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`judge-gate: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "all") fail(`--corpus must be public, private or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];

  for (const c of corpora) {
    if (c === "private" && !existsSync(join(ROOT, "private", NAME, "assets", "cases.jsonl"))) {
      fail(`the private assets are missing (private/${NAME}/assets/cases.jsonl). Make them with: ./generate-assets --only ${NAME}`);
    }
  }
  const baseUrl = process.env.MODEL_BASE_URL?.trim();
  const model = process.env.MODEL_NAME?.trim();
  if (!baseUrl || !model) fail("set MODEL_BASE_URL and MODEL_NAME in .env (and MODEL_API_KEY if the endpoint needs one). See .env.example.");
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  try {
    writeConfig(sandbox, judgeConfig(baseUrl, model, !!process.env.MODEL_API_KEY?.trim()));

    const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
    if (!atLeast(version, MIN_AKM)) fail(`akm ${version} has no \`improve judge\` command. This eval needs akm ${MIN_AKM} or later.`);

    const summaries: Summary[] = [];
    for (const c of corpora) summaries.push(await runCorpus(c, { sandbox, version, model, label, limit }));
    if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
  } finally {
    removeSandbox(sandbox);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`judge-gate: ${e.message}`);
    process.exit(e.code);
  }
}
