#!/usr/bin/env bun
// consolidate: runs akm's consolidate on pairs of notes whose right outcome is known, with the model under test as
// its engine, and counts the notes it proposes to retire that held a claim the other lacked. See ../README.md.
//
//   evals/consolidate/run [--corpus public|private|all] [--limit N] [--label NAME]

import { appendFileSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type Case, EMBEDDER_ENV, RELATIONS, type Row, consolidateConfig, errorRow, metrics, noteAges, parseCases, pct, rowFromRun, selectCases } from "./lib.ts";

const NAME = "consolidate";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const INDEX_TIMEOUT_MS = 2 * 60_000;
const IMPROVE_TIMEOUT_MS = 30 * 60_000; // up to three model calls on a slow local model
const GIVE_UP_AFTER = 5; // consecutive cases with no verdict, before any verdict at all
const RATE_LIMIT_TRIES = 4; // times a case is tried again when the endpoint rate limits it
const RATE_LIMIT_WAIT_MS = 10_000; // the wait before the first new try, doubled before each one after it

const USAGE = `Usage: evals/consolidate/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs akm's consolidate on pairs of notes, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its
engine, and counts the retirements that lose a claim. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/. private reads private/consolidate/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run N cases, taking the first of each relation in turn
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Written for akm 0.9.26. akm is on PATH, or in AKM_BIN.`;

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
  n_paired: number;
  served_models: Record<string, number>; // the model names the endpoint reported, with the calls each answered
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

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  unsafe retirements  ${m.unsafe.n} of ${m.unsafe.of} cases, ${m.unsafe.staged} of them staged for unattended retirement`);
  console.log(`  retire precision    ${cell(m.precision.safe, m.precision.retired, m.precision.value)}`);
  console.log(`  retire recall       ${cell(m.recall.retired_safe, m.recall.of, m.recall.value)}  of the cases with a safe side`);
  console.log(`  errored             ${s.n_errored}`);
  const served = Object.entries(s.served_models).map(([name, calls]) => `${name} (${calls} calls)`);
  if (served.length > 0) console.log(`  served as           ${served.join(", ")}`);
  const rows: string[][] = [["relation", "cases", "paired", "retired safe", "retired unsafe", "kept"]];
  for (const r of RELATIONS) {
    const k = m.classes[r];
    if (k.n > 0) rows.push([r, String(k.n - k.error), String(k.paired), String(k.retired_safe), String(k.retired_unsafe), String(k.kept)]);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(`  ${r.map((x, i) => (i === 0 ? x.padEnd(w[i]) : x.padStart(w[i]))).join("  ")}`);
  console.log(`  results             ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const unsafe = (s: Summary) => `${s.metrics.unsafe.n} of ${s.metrics.unsafe.of} cases (${s.metrics.unsafe.staged} staged)`;
  const precision = (s: Summary) => cell(s.metrics.precision.safe, s.metrics.precision.retired, s.metrics.precision.value);
  const recall = (s: Summary) => cell(s.metrics.recall.retired_safe, s.metrics.recall.of, s.metrics.recall.value);
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["unsafe retirements", unsafe(a), unsafe(b)],
    ["retire precision", precision(a), precision(b)],
    ["retire recall", recall(a), recall(b)],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ...RELATIONS.map((r): [string, string, string] => {
      const per = (s: Summary) => {
        const k = s.metrics.classes[r];
        return `${k.retired_safe}/${k.retired_unsafe}/${k.kept}`;
      };
      return [`${r} (safe/unsafe/kept)`, per(a), per(b)];
    }),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/** Puts the case's two notes in the sandbox's bundle as memories, with the file times akm reads as their dates. */
export function writeNotes(sandbox: Sandbox, c: Case): void {
  const dir = join(sandbox.dir, "bundle", "memories");
  mkdirSync(dir, { recursive: true });
  const ages = noteAges(c.older);
  const now = Date.now();
  for (const side of ["a", "b"] as const) {
    const file = join(dir, `${c[side].name}.md`);
    writeFileSync(file, c[side].text);
    const when = new Date(now - ages[side] * 86_400_000);
    utimesSync(file, when, when);
  }
}

/** The first line akm printed that looks like a failure, to say why its judge gave no verdict. */
export function failureHint(stderr: string): string {
  const line = stderr.split("\n").find((l) => /^[A-Za-z]/.test(l) && /error|fail|refus|unauthori|unable|invalid|timed out|not found|rate.?limit/i.test(l));
  return line ? ` (akm said: ${line.trim().slice(0, 150)})` : "";
}

type Context = { newSandbox: () => Sandbox; baseUrl: string; model: string; hasKey: boolean; version: string; label: string; limit?: number; rateLimitWaitMs?: number };

/** akm's errors name the URL it called, and results get shared, so the endpoint is written as <MODEL_BASE_URL>. */
export function hideEndpoint(text: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base ? text.split(base).join("<MODEL_BASE_URL>") : text;
}

/** akm says so when the endpoint turns a call away for sending too many. */
const isRateLimited = (text: string): boolean => /rate.?limit|\(429\)/i.test(text);

/** One try at a case: a fresh sandbox with the pair as its bundle, indexed, consolidate run on it, and the proposals read back. */
async function tryCase(c: Case, ctx: Context): Promise<{ row: Row; rateLimited: boolean }> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const sandbox = ctx.newSandbox();
  try {
    writeConfig(sandbox, consolidateConfig(ctx.baseUrl, ctx.model, ctx.hasKey));
    Object.assign(sandbox.env, EMBEDDER_ENV);
    writeNotes(sandbox, c);
    await runAkmJson(sandbox, ["index", "--full"], { timeoutMs: INDEX_TIMEOUT_MS });
    const improve = await runAkm(sandbox, ["improve", "--strategy", "consolidate", "--no-sync", "--json-to-stdout", "--format", "json"], { timeoutMs: IMPROVE_TIMEOUT_MS });
    if (improve.code !== 0) throw new Error(`akm improve failed (exit ${improve.code}): ${improve.stderr.trim().slice(-300)}`);
    const proposals = await runAkmJson(sandbox, ["proposal", "list", "--detail", "full"], { timeoutMs: INDEX_TIMEOUT_MS });
    const row = rowFromRun(c, JSON.parse(improve.stdout), proposals, seconds());
    return { row: row.error ? { ...row, error: hideEndpoint(row.error + failureHint(improve.stderr), ctx.baseUrl) } : row, rateLimited: row.outcome === "error" && isRateLimited(improve.stderr) };
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    return { row: errorRow(c, hideEndpoint(message, ctx.baseUrl), seconds()), rateLimited: isRateLimited(message) };
  } finally {
    removeSandbox(sandbox);
  }
}

/** A case, tried again after a wait when the endpoint rate limits it. `rateLimited` is true when it still did on the last try. */
async function runCase(c: Case, ctx: Context): Promise<{ row: Row; rateLimited: boolean }> {
  for (let tries = 0; ; tries++) {
    const { row, rateLimited } = await tryCase(c, ctx);
    if (!rateLimited || tries === RATE_LIMIT_TRIES) return { row: tries > 0 ? { ...row, retried: tries } : row, rateLimited };
    const wait = (ctx.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS) * 2 ** tries;
    console.log(`  ${c.id}: the endpoint rate limited it, so it will be tried again in ${wait / 1000}s`);
    await Bun.sleep(wait);
  }
}

/** The model names the endpoint reported over the whole run, with the calls each answered. */
function servedModels(rows: Row[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const r of rows) for (const [name, calls] of Object.entries(r.served)) total[name] = (total[name] ?? 0) + calls;
  return total;
}

export async function runCorpus(
  corpus: Corpus,
  ctx: Context,
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
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} cases, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let anyVerdict = false;
  let aborted: string | undefined;
  let limited = false;
  for (const c of cases) {
    const { row, rateLimited } = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const result = row.outcome === "retire" ? `retired ${row.retired} (${row.safe ? "safe" : "UNSAFE"})` : row.outcome;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.relation.padEnd(10)} ${result.padEnd(20)} ${row.paired ? "paired" : "unpaired"} ${row.seconds}s  ${c.id}${row.retried ? `  after ${row.retried} rate limited ${row.retried === 1 ? "try" : "tries"}` : ""}${row.error ? `  ${row.error.slice(0, 120)}` : ""}`);
    if (rateLimited) {
      limited = true;
      aborted = row.error;
      break;
    }
    if (row.outcome === "error") {
      consecutiveErrors++;
      if (!anyVerdict && consecutiveErrors >= GIVE_UP_AFTER) {
        aborted = row.error;
        break;
      }
    } else {
      anyVerdict = true;
      consecutiveErrors = 0;
    }
  }

  const errored = rows.filter((r) => r.outcome === "error").length;
  const paired = rows.filter((r) => r.outcome !== "error" && r.paired).length;
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
    n_paired: paired,
    served_models: servedModels(rows),
    metrics: metrics(rows),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (limited) fail(`the endpoint was still rate limiting after ${RATE_LIMIT_TRIES} new tries of a case, so the run stopped after ${rows.length} of ${cases.length} cases. Last error: ${aborted}\nWait and run it again, or use an endpoint with room.`, 1);
  if (aborted) fail(`the first ${GIVE_UP_AFTER} cases got no verdict, so the run stopped. Last error: ${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and that akm is 0.9.26.`, 1);
  if (summary.n_scored > 0 && paired === 0) fail("akm paired none of the notes, so its judge never ran. Consolidate needs semantic search, which this eval gets from akm's deterministic embedder (AKM_EMBED_DETERMINISTIC). Does this akm still have it?", 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`${NAME}: ${(e as Error).message}\n\n${USAGE}`);
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

  const newSandbox = () => createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  const probe = newSandbox();
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }

  const ctx = { newSandbox, baseUrl, model, hasKey: !!process.env.MODEL_API_KEY?.trim(), version, label, limit };
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(await runCorpus(c, ctx));
  if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`${NAME}: ${e.message}`);
    process.exit(e.code);
  }
}
