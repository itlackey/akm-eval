#!/usr/bin/env bun
// extract: runs akm's extract on each session, with the model under test as akm's engine, and scores the memories it
// saves. See ../README.md.
//
//   evals/extract/run [--corpus public|private|all] [--limit N] [--repeat N] [--label NAME]

import { appendFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type LoadedCase, type Metrics, type Row, STRATEGY, errorRow, extractConfig, failureMessage, loadCases, metrics, pct, savedMemories, scoreCase, selectCases } from "./lib.ts";

const NAME = "extract";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const EXTRACT_TIMEOUT_MS = 15 * 60_000; // one session, on a slow local model: one call, and one more if the reply cannot be read
const GIVE_UP_AFTER = 5; // consecutive cases that errored: the endpoint is down or rate limiting, and more cases would only hit it again

const USAGE = `Usage: evals/extract/run [--corpus public|private|all] [--limit N] [--repeat N] [--label NAME]

Runs akm's extract on each session, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
akm's engine, and scores the memories it saves. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/. private reads private/extract/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run N sessions, taken from each class in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
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
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  limit: number | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  metrics: Metrics;
  results_dir: string;
}

/** A failure that ends the run with a message. */
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

const cell = (c: { n: number; correct: number; rate: number | null }): string => `${c.correct}/${c.n}  ${pct(c.rate)}`;

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} sessions`);
  console.log(`  insights  ${cell(m.insights)}   of the sessions that hold an insight or a preference: a memory that states every fact`);
  console.log(`  routine   ${cell(m.routine)}   of the routine sessions: left empty`);
  console.log(`  planted   ${cell(m.planted)}   of the sessions with a planted instruction: ${m.planted.saved_instruction} saved it`);
  for (const [klass, c] of Object.entries(m.classes)) {
    const failed = Object.entries(c.failed).filter(([, n]) => n > 0).map(([name, n]) => `${name} ${n}`).join(", ");
    console.log(`    ${klass.padEnd(11)} ${`${c.correct}/${c.n}`.padEnd(5)} saved ${c.outcomes.saved}, empty ${c.outcomes.empty}, unusable ${c.outcomes.unusable}; ${c.memories} memories${failed ? `; failed: ${failed}` : ""}`);
  }
  console.log(`  errored   ${s.n_errored}`);
  console.log(`  results   ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["insights", cell(a.metrics.insights), cell(b.metrics.insights)],
    ["routine", cell(a.metrics.routine), cell(b.metrics.routine)],
    ["planted", cell(a.metrics.planted), cell(b.metrics.planted)],
    ["planted instruction saved", String(a.metrics.planted.saved_instruction), String(b.metrics.planted.saved_instruction)],
    ["errored", String(a.n_errored), String(b.n_errored)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/**
 * One case: a new sandbox with the session where akm reads Claude Code sessions, extract run on that session alone,
 * and the queue read back.
 */
export async function runCase(c: LoadedCase, ctx: { config: Record<string, unknown>; baseUrl: string }): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const hide = (text: string): string => text.split(ctx.baseUrl.replace(/\/+$/, "")).join("<MODEL_BASE_URL>"); // akm's errors name the endpoint it called, and results get shared
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  try {
    writeConfig(sandbox, ctx.config);
    // Claude Code keeps a session at <projects>/<project>/<id>.jsonl. akm looks in AKM_CLAUDE_PROJECTS_DIR, so it
    // finds this one and never reads the caller's own sessions.
    const projects = join(sandbox.dir, "projects");
    mkdirSync(join(projects, c.project), { recursive: true });
    cpSync(c.file, join(projects, c.project, `${c.id}.jsonl`));
    sandbox.env.AKM_CLAUDE_PROJECTS_DIR = projects;
    const args = ["proposal", "extract", "--type", "claude", "--location", projects, "--session-id", c.id, "--strategy", STRATEGY, "--format", "json"];
    const { stdout, stderr, code } = await runAkm(sandbox, args, { timeoutMs: EXTRACT_TIMEOUT_MS });
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      return errorRow(c, hide(failureMessage(code, stderr, stdout)), seconds());
    }
    const listed = (result.proposals ?? []).length > 0 ? await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"]) : {};
    return scoreCase(c, { result, saved: savedMemories(listed), seconds: seconds() });
  } catch (e) {
    return errorRow(c, hide((e as Error).message), seconds());
  } finally {
    removeSandbox(sandbox);
  }
}

export async function runCorpus(
  corpus: Corpus,
  ctx: { config: Record<string, unknown>; baseUrl: string; version: string; model: string; label: string; limit?: number },
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
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} sessions, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let aborted: string | undefined;

  for (const c of cases) {
    const row = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const checks = [row.missing.length > 0 && `missing ${row.missing.join(", ")}`, row.forbidden.length > 0 && `asserts ${row.forbidden.join(", ")}`].filter(Boolean).join("; ");
    const shown = row.outcome === "error" ? `error  ${row.error?.slice(0, 120)}` : `${row.correct ? "ok  " : "FAIL"}   ${row.outcome}${row.saved.length > 0 ? ` ${row.saved.length}` : ""}${checks ? ` (${checks.slice(0, 80)})` : ""}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(13)} ${row.seconds}s  ${shown}`);
    consecutiveErrors = row.outcome === "error" ? consecutiveErrors + 1 : 0;
    if (consecutiveErrors >= GIVE_UP_AFTER) {
      aborted = row.error;
      break;
    }
  }

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
  if (aborted) fail(`${GIVE_UP_AFTER} sessions in a row errored, so the run stopped after ${rows.length} of ${cases.length}. Last error: ${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and whether the endpoint is rate limiting you.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; repeat?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, repeat: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`extract: ${(e as Error).message}\n\n${USAGE}`);
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
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
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
  const config = extractConfig(baseUrl, model, !!process.env.MODEL_API_KEY?.trim());
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { config, baseUrl, version, model, label: runLabel, limit }))));
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`extract: ${e.message}`);
    process.exit(e.code);
  }
}
