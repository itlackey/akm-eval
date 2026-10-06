#!/usr/bin/env bun
// nightly: runs one night of akm improve on a library that holds planted items whose right outcome is known: index, the day's
// feedback, `akm improve` with the default strategy, then `akm proposal drain`, as the lab's nightly does. It checks every
// item, what changed outside the items, the lessons accepted and the model calls that failed. See ../README.md.
//
//   evals/nightly/run [--corpus public|private|all] [--limit N] [--label NAME]

import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { atLeast } from "../../reflect/src/lib.ts";
import { type CallRow, EMBEDDER_ENV, type Feedback, type Item, KINDS, type Metrics, type Night, type Row, callStats, loadNight, metrics, nightlyConfig, noteAges, outsideChanges, parseProposals, pct, readLibrary, scoreItem, selectItems } from "./lib.ts";

const NAME = "nightly";
export const MIN_AKM = "0.9.26"; // the first release with the pair judge's claim lists, exact fixes and lessons that wait for review
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const STEP_TIMEOUT_MS = 5 * 60_000; // an akm command that calls no model
const IMPROVE_BUDGET_MS = 45 * 60_000; // akm's own wall-clock budget for the improve run: it skips what it has not reached
const IMPROVE_TIMEOUT_MS = IMPROVE_BUDGET_MS + 10 * 60_000; // and this ends akm if it does not stop
const STATES = ["pending", "accepted", "rejected", "reverted"]; // the states a proposal can be in
const DAY_MS = 86_400_000;

const USAGE = `Usage: evals/nightly/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs one night of akm improve, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its engine, on a library
of planted items, then drains the proposals as the nightly does, and checks the result. Settings come from .env at the
repository root.

  --corpus  public (default) reads assets/. private reads private/nightly/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   plant only N items, taking the first of each kind in turn
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm ${MIN_AKM} or later, on PATH or in AKM_BIN.`;

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
  n_items: number;
  n_planted: number;
  /** Wall-clock seconds of each step of the night. */
  seconds: { index: number; feedback: number; improve: number; drain: number; total: number };
  /** What akm says of the improve run: false when it did not run to its end. */
  improve_ok: boolean;
  /** Processes akm skipped because their engine could not be used. */
  skipped_processes: string[];
  /** What the drain did: proposals promoted, rejected, left for review and failed. */
  drain: { promoted: number; rejected: number; deferred: number; failed: number };
  /** Paths no item owns that changed, appeared or vanished. */
  outside_changed: string[];
  /** The pair pass of consolidate: pairs judged, judgments that failed and the labels given. */
  pair_pass: { pairs_judged: number; failed_judgments: number; labels: Record<string, number> } | null;
  /** The improve run's model calls by process and the model name the endpoint reported. A gateway may serve one name from several providers. */
  calls_by: CallRow[];
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

/** akm's errors name the URL it called, and results get shared, so the endpoint is written as <MODEL_BASE_URL>. */
export function hideEndpoint(text: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base ? text.split(base).join("<MODEL_BASE_URL>") : text;
}

/** What akm said when a command failed. It prints its error as a JSON object on stderr. */
function failureMessage(args: string[], code: number, stderr: string): string {
  const text = stderr.trim();
  try {
    const e = JSON.parse(text) as { error?: unknown };
    if (typeof e.error === "string") return `akm ${args[0]} failed (exit ${code}): ${e.error}`.slice(0, 400);
  } catch {
    // not JSON: the last lines
  }
  return `akm ${args[0]} failed (exit ${code}): ${text.split("\n").slice(-3).join(" | ")}`.slice(0, 400);
}

/** Puts the items' files in the sandbox's bundle. The notes of a pair carry the file times akm reads as their dates. */
export function plant(sandbox: Sandbox, items: Item[], files: Map<string, string>): void {
  const now = Date.now();
  for (const item of items) {
    for (const path of item.files) {
      const file = join(sandbox.dir, "bundle", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, files.get(path) as string);
      if (item.kind === "pair") {
        const when = new Date(now - noteAges(item.older)[path === item.a ? "a" : "b"] * DAY_MS);
        utimesSync(file, when, when);
      }
    }
  }
}

/** The arguments of `akm feedback`. A fix carries its exact edits and its source. */
export function feedbackArgs(f: Feedback): string[] {
  const args = ["feedback", f.ref, `--${f.signal}`, "--reason", f.reason];
  if (f.fix) {
    const fix = f.fix;
    fix.replace.forEach((old, i) => args.push(`--replace=${old}`, `--with=${fix.with[i]}`));
    args.push(`--source=${fix.source}`);
  }
  return args;
}

type Context = { newSandbox: () => Sandbox; baseUrl: string; model: string; hasKey: boolean; version: string; label: string; limit?: number };

const seconds = (ms: number): number => Number((ms / 1000).toFixed(1));

/** The night: a sandbox with the planted library, indexed, the feedback recorded, improve run, the proposals drained and read back. */
async function haveNight(items: Item[], files: Map<string, string>, ctx: Context) {
  const sandbox = ctx.newSandbox();
  try {
    return await runNight(sandbox, items, files, ctx);
  } catch (e) {
    if (e instanceof Fatal) throw e;
    return fail(hideEndpoint((e as Error).message, ctx.baseUrl), 1); // a failed akm command: its message, not a stack
  } finally {
    removeSandbox(sandbox);
  }
}

async function runNight(sandbox: Sandbox, items: Item[], files: Map<string, string>, ctx: Context) {
  writeConfig(sandbox, nightlyConfig(ctx.baseUrl, ctx.model, ctx.hasKey));
  Object.assign(sandbox.env, EMBEDDER_ENV);
  plant(sandbox, items, files);
  const bundle = join(sandbox.dir, "bundle");
  const before = readLibrary(bundle);
  const step = async <T>(name: string, f: () => Promise<T>): Promise<[T, number]> => {
    const t0 = performance.now();
    const value = await f();
    console.log(`  ${name} ${seconds(performance.now() - t0)}s`);
    return [value, seconds(performance.now() - t0)];
  };

  const [, index] = await step("index", () => runAkmJson(sandbox, ["index", "--full"], { timeoutMs: STEP_TIMEOUT_MS }));
  const [, feedback] = await step("feedback", async () => {
    for (const item of items) for (const f of item.feedback) await runAkmJson(sandbox, feedbackArgs(f), { timeoutMs: STEP_TIMEOUT_MS });
  });
  const improveArgs = ["improve", "--strategy", "default", "--require-engines", "--no-sync", "--timeout-ms", String(IMPROVE_BUDGET_MS), "--json-to-stdout", "--format", "json"];
  const [improved, improveSeconds] = await step("improve", () => runAkm(sandbox, improveArgs, { timeoutMs: IMPROVE_TIMEOUT_MS }));
  if (improved.code !== 0) fail(hideEndpoint(failureMessage(improveArgs, improved.code, improved.stderr), ctx.baseUrl), 1);
  let improve: unknown;
  try {
    improve = JSON.parse(improved.stdout);
  } catch {
    fail("akm improve printed no JSON result", 1);
  }
  type Drained = { promoted?: unknown[]; rejected?: unknown[]; deferred?: unknown[]; failed?: unknown[] };
  const [drained, drain] = await step("drain", () => runAkmJson<Drained>(sandbox, ["proposal", "drain", "--promote", "--strategy", "default", "--yes"], { timeoutMs: STEP_TIMEOUT_MS }));
  const listed = [];
  for (const status of STATES) listed.push({ status, ...(await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", status, "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS })) });
  const count = (x: unknown[] | undefined) => (Array.isArray(x) ? x.length : 0);
  return {
    before,
    after: readLibrary(bundle),
    improve,
    proposals: parseProposals(listed),
    drain: { promoted: count(drained.promoted), rejected: count(drained.rejected), deferred: count(drained.deferred), failed: count(drained.failed) },
    seconds: { index, feedback, improve: improveSeconds, drain },
  };
}

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
const minutes = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`);

function printSummary(s: Summary, rows: Row[]): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_planted} of ${s.n_items} items`);
  console.log(`  items right        ${cell(m.items.ok, m.items.n, m.items.rate)}`);
  console.log(`  harm               ${m.harm.items} items, ${m.harm.outside_changed} paths changed outside the items, ${m.harm.lessons_accepted} lessons accepted`);
  console.log(`  model calls        ${m.calls.n}, ${m.calls.failures} failed`);
  console.log(`  night              ${minutes(s.seconds.total)} (index ${minutes(s.seconds.index)}, feedback ${minutes(s.seconds.feedback)}, improve ${minutes(s.seconds.improve)}, drain ${minutes(s.seconds.drain)})`);
  console.log(`  drain              ${s.drain.promoted} promoted, ${s.drain.rejected} rejected, ${s.drain.deferred} left for review, ${s.drain.failed} failed`);
  if (!s.improve_ok) console.log("  akm reported the improve run as not ok");
  if (s.skipped_processes.length > 0) console.log(`  skipped            ${s.skipped_processes.join(", ")}`);
  if (s.pair_pass) console.log(`  pair judge         ${s.pair_pass.pairs_judged} pairs judged as ${Object.entries(s.pair_pass.labels).map(([l, n]) => `${l} ${n}`).join(", ") || "nothing"}, ${s.pair_pass.failed_judgments} judgments failed`);
  for (const r of s.calls_by.filter((r) => r.failures > 0)) console.log(`  failed calls       ${r.process} on ${r.model}: ${r.failures} of ${r.calls}`);
  for (const k of KINDS) {
    const c = m.by_kind[k];
    if (c) console.log(`    ${k.padEnd(10)} ${c.ok}/${c.n}`);
  }
  for (const r of rows.filter((r) => !r.ok)) console.log(`  ${r.harm ? "HARM" : "miss"}  ${r.id.padEnd(24)} ${Object.entries(r.checks).filter(([, pass]) => !pass).map(([name]) => name).join(", ")} | ${r.state}${r.error ? ` | ${r.error}` : ""}`);
  for (const p of s.outside_changed) console.log(`  HARM  changed outside the items: ${p}`);
  console.log(`  results            ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const col = (s: Summary) => ({
    right: cell(s.metrics.items.ok, s.metrics.items.n, s.metrics.items.rate),
    harm: `${s.metrics.harm.items} items, ${s.metrics.harm.outside_changed} outside, ${s.metrics.harm.lessons_accepted} lessons`,
    calls: `${s.metrics.calls.n} calls, ${s.metrics.calls.failures} failed`,
    night: minutes(s.seconds.total),
  });
  const [x, y] = [col(a), col(b)];
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["items right", x.right, y.right],
    ["harm", x.harm, y.harm],
    ["model calls", x.calls, y.calls],
    ["night", x.night, y.night],
    ...KINDS.filter((k) => a.metrics.by_kind[k] || b.metrics.by_kind[k]).map((k): [string, string, string] => {
      const c = (s: Summary) => (s.metrics.by_kind[k] ? `${s.metrics.by_kind[k]?.ok}/${s.metrics.by_kind[k]?.n}` : "-");
      return [`  ${k}`, c(a), c(b)];
    }),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0] as number)}  ${r[1].padEnd(w[1] as number)}  ${r[2].padEnd(w[2] as number)}`);
}

export async function runCorpus(
  corpus: Corpus,
  ctx: Context,
  folders = {
    assets: corpus === "public" ? join(EVAL_DIR, "assets") : join(ROOT, "private", NAME, "assets"),
    results: corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"),
  },
): Promise<Summary> {
  const night: Night = loadNight(folders.assets);
  const items = selectItems(night.items, ctx.limit);
  console.log(`${NAME} (${corpus}): ${items.length} of ${night.items.length} items, one night, one model call at a time`);
  const t0 = performance.now();
  const done = await haveNight(items, night.files, ctx);
  const total = seconds(performance.now() - t0);

  const outcome = { before: done.before, after: done.after, proposals: done.proposals, improve: done.improve };
  // akm names the endpoint in some of its errors, and rows get shared, so no row carries it.
  const rows = items.map((item) => JSON.parse(hideEndpoint(JSON.stringify(scoreItem(item, outcome)), ctx.baseUrl)) as Row);
  const outside = outsideChanges(done.before, done.after, items);
  const calls = callStats(done.improve);
  const result = done.improve as { ok?: boolean; skippedProcesses?: { process?: string }[]; consolidation?: { pairPass?: { pairsJudged?: number; failedJudgments?: number; labelCounts?: Record<string, number> } } };
  const pairPass = result.consolidation?.pairPass;

  const dir = makeResultsDir(folders.results, ctx.label);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const summary: Summary = {
    eval: NAME,
    corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(),
    model: ctx.model,
    akm_version: ctx.version,
    limit: ctx.limit ?? null,
    n_items: night.items.length,
    n_planted: items.length,
    seconds: { ...done.seconds, total },
    improve_ok: result.ok !== false,
    skipped_processes: (result.skippedProcesses ?? []).map((p) => String(p.process)),
    drain: done.drain,
    outside_changed: outside,
    pair_pass: pairPass ? { pairs_judged: Number(pairPass.pairsJudged ?? 0), failed_judgments: Number(pairPass.failedJudgments ?? 0), labels: Object.fromEntries(Object.entries(pairPass.labelCounts ?? {}).filter(([, n]) => n > 0)) } : null,
    calls_by: calls.by.map((r) => ({ ...r, model: hideEndpoint(r.model, ctx.baseUrl) })),
    metrics: metrics(rows, outside, done.proposals, calls),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary, rows);
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
    if (c === "private" && !existsSync(join(ROOT, "private", NAME, "assets", "items.jsonl"))) {
      fail(`the private assets are missing (private/${NAME}/assets/items.jsonl). Make them with: ./generate-assets --only ${NAME}`);
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

  if (!atLeast(version, MIN_AKM)) fail(`akm ${version} is older than this eval is written for. It needs akm ${MIN_AKM} or later.`);

  const ctx = { newSandbox, baseUrl, model, hasKey: !!process.env.MODEL_API_KEY?.trim(), version, label, limit };
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(await runCorpus(c, ctx));
  if (summaries.length === 2) printSideBySide(summaries[0] as Summary, summaries[1] as Summary);
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
