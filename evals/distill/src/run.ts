#!/usr/bin/env bun
// distill: runs akm's distill on the memory of each case, with the model under test as akm's engine, and scores
// the lessons it queues. See ../README.md.
//
//   evals/distill/run [--corpus public|private|all] [--limit N] [--label NAME]

import { appendFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { type LoadedCase, type Metrics, type Row, STRATEGY, distillConfig, errorRow, failureMessage, lessonProposals, loadCases, memoryRef, metrics, pct, scoreCase, selectCases } from "./lib.ts";

const NAME = "distill";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const IMPROVE_TIMEOUT_MS = 15 * 60_000; // one case, on a slow local model: two model calls
const STATES = ["pending", "accepted", "rejected", "reverted"]; // the states a proposal can be in
const GIVE_UP_AFTER = 5; // consecutive cases that errored, before any case that did not

const USAGE = `Usage: evals/distill/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs akm's distill on the memory of each case, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME
as akm's engine, and scores the lessons it queues. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/. private reads private/distill/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run N cases, taken from each class in turn
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm on PATH, or in AKM_BIN.`;

type Corpus = "public" | "private";

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  akm_version: string;
  limit: number | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  metrics: Metrics;
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
  console.log(`  good lessons   ${m.good_lessons.good}/${m.good_lessons.n}  ${pct(m.good_lessons.rate)}   of the cases that expect a lesson`);
  console.log(`  wrong lessons  ${m.wrong_lessons.wrong}/${m.wrong_lessons.n}  ${pct(m.wrong_lessons.rate)}   of the cases that expect none`);
  for (const [klass, c] of Object.entries(m.by_class)) console.log(`    ${klass.padEnd(16)} ${c.good !== undefined ? `${c.good}/${c.n} good` : `${c.wrong}/${c.n} wrong`}`);
  console.log(`  errored        ${s.n_errored}`);
  console.log(`  results        ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["good lessons", cell(a.metrics.good_lessons.good, a.metrics.good_lessons.n, a.metrics.good_lessons.rate), cell(b.metrics.good_lessons.good, b.metrics.good_lessons.n, b.metrics.good_lessons.rate)],
    ["wrong lessons", cell(a.metrics.wrong_lessons.wrong, a.metrics.wrong_lessons.n, a.metrics.wrong_lessons.rate), cell(b.metrics.wrong_lessons.wrong, b.metrics.wrong_lessons.n, b.metrics.wrong_lessons.rate)],
    ["errored", String(a.n_errored), String(b.n_errored)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/** One case: a new sandbox with the case's bundle, distill run on its memory alone, and the queue read back. */
export async function runCase(c: LoadedCase, config: Record<string, unknown>): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  try {
    writeConfig(sandbox, config);
    cpSync(c.dir, join(sandbox.dir, "bundle"), { recursive: true });
    const args = ["improve", memoryRef(c), "--strategy", STRATEGY, "--no-sync", "--require-engines", "--json-to-stdout", "--format", "json"];
    const { stdout, stderr, code } = await runAkm(sandbox, args, { timeoutMs: IMPROVE_TIMEOUT_MS });
    let improve: unknown;
    try {
      improve = JSON.parse(stdout);
    } catch {
      return errorRow(c, failureMessage(code, stderr, stdout), seconds());
    }
    if (code !== 0) return errorRow(c, failureMessage(code, stderr, stdout), seconds());
    const listed = [];
    for (const status of STATES) listed.push({ status, ...(await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", status, "--detail", "full"])) });
    return scoreCase(c, { improve, proposals: lessonProposals(listed), seconds: seconds() });
  } catch (e) {
    return errorRow(c, (e as Error).message, seconds());
  } finally {
    removeSandbox(sandbox);
  }
}

export async function runCorpus(
  corpus: Corpus,
  ctx: { config: Record<string, unknown>; version: string; model: string; label: string; limit?: number },
  folders = {
    assets: corpus === "public" ? join(EVAL_DIR, "assets") : join(ROOT, "private", NAME, "assets"),
    results: corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"),
  },
): Promise<Summary> {
  const all = loadCases(folders.assets);
  const cases = selectCases(all, ctx.limit);
  const dir = makeResultsDir(folders.results, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} cases, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let anyScored = false;
  let aborted: string | undefined;

  for (const c of cases) {
    const row = await runCase(c, ctx.config);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const shown = row.verdict === "error" ? `error  ${row.error?.slice(0, 120)}` : `${row.verdict.padEnd(6)} ${row.outcome}${row.detail ? ` (${row.detail.slice(0, 60)})` : ""}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(10)} ${row.seconds}s  ${shown}`);
    if (row.verdict === "error") {
      consecutiveErrors++;
      if (!anyScored && consecutiveErrors >= GIVE_UP_AFTER) {
        aborted = row.error;
        break;
      }
    } else {
      anyScored = true;
      consecutiveErrors = 0;
    }
  }

  const errored = rows.filter((r) => r.verdict === "error").length;
  const summary: Summary = {
    eval: NAME,
    corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(),
    model: ctx.model,
    akm_version: ctx.version,
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
  if (aborted) fail(`the first ${GIVE_UP_AFTER} cases errored, so the run stopped. Last error: ${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`distill: ${(e as Error).message}\n\n${USAGE}`);
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
    if (c === "private" && !existsSync(join(ROOT, "private", NAME, "assets", "cases.json"))) {
      fail(`the private assets are missing (private/${NAME}/assets/cases.json). Make them with: ./generate-assets --only ${NAME}`);
    }
  }
  const baseUrl = process.env.MODEL_BASE_URL?.trim();
  const model = process.env.MODEL_NAME?.trim();
  if (!baseUrl || !model) fail("set MODEL_BASE_URL and MODEL_NAME in .env (and MODEL_API_KEY if the endpoint needs one). See .env.example.");
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const probe = createSandbox(NAME);
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }
  const config = distillConfig(baseUrl, model, !!process.env.MODEL_API_KEY?.trim());
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(await runCorpus(c, { config, version, model, label, limit }));
  if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`distill: ${e.message}`);
    process.exit(e.code);
  }
}
