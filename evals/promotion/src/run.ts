#!/usr/bin/env bun
// promotion: plants labelled promotion proposals in akm's queue, runs akm's drain with its judgment tier, with the model
// under test as the judge, and counts which proposals it accepts. See ../README.md.
//
//   evals/promotion/run [--corpus public|own|all] [--limit N] [--label NAME]

import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { isLocalJudge } from "../../retrieval/src/label.ts"; // the rule that keeps private notes on this machine or the local network
import { BAD, type Case, type Drained, type Metrics, type Row, STRATEGY, dispatchFailures, hideEndpoint, metrics, parseCases, pct, promotionConfig, proposalRow, rowsFromDrain, selectCases } from "./lib.ts";

const NAME = "promotion";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const DRAIN_TIMEOUT_MS = 2 * 60 * 60_000; // one call per proposal, one at a time, on a slow local model
const STEP_TIMEOUT_MS = 30 * 60_000;

const USAGE = `Usage: evals/promotion/run [--corpus public|own|all] [--limit N] [--label NAME]

Plants labelled promotion proposals in akm's queue, runs \`akm proposal drain --judgment\` with the model in MODEL_BASE_URL,
MODEL_API_KEY and MODEL_NAME as the judge, and counts which proposals it accepts. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/ and corpus/library. own reads private/promotion/own/, and runs only against a
            model on this machine or the local network. all runs both and prints the two results side by side.
  --limit   run N proposals, one of each category in turn
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm on PATH, or in AKM_BIN.`;

type Corpus = "public" | "own";

interface Folders {
  cases: string; // cases.jsonl
  library: string; // a folder with knowledge/ in it: the notes already in the bundle
  results: string;
}

export const foldersFor = (corpus: Corpus): Folders =>
  corpus === "public"
    ? { cases: join(EVAL_DIR, "assets", "cases.jsonl"), library: join(ROOT, "corpus", "library"), results: join(EVAL_DIR, "results") }
    : { cases: join(ROOT, "private", NAME, "own", "cases.jsonl"), library: join(ROOT, "private", NAME, "own", "library"), results: join(ROOT, "private", NAME, "results") };

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
  n_errored: number;
  seconds: number;
  calls: { n: number; failures: number; served: Record<string, number> } | null;
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

/** What akm said when a command failed: the last lines of stderr, which is a JSON error object for most failures. */
function failureMessage(what: string, code: number, stderr: string): string {
  try {
    const e = JSON.parse(stderr.trim()) as { error?: unknown };
    if (typeof e.error === "string") return `${what} failed (exit ${code}): ${e.error}`.slice(0, 400);
  } catch {
    // not JSON: fall through to the last lines
  }
  return `${what} failed (exit ${code}): ${stderr.trim().split("\n").slice(-3).join(" | ")}`.slice(0, 400);
}

/**
 * Makes the bundle the proposals are judged against and queues them. The bundle is the library's knowledge/ folder without the
 * notes the cases would write: a proposal creates its note, and the notes already there are what it may duplicate. Each case
 * is queued as a pending promotion of consolidate, in akm's own table, since no command queues a proposal without a model.
 */
export async function plant(sandbox: Sandbox, cases: Case[], libraryDir: string): Promise<void> {
  const bundle = join(sandbox.dir, "bundle");
  cpSync(join(libraryDir, "knowledge"), join(bundle, "knowledge"), { recursive: true });
  for (const c of cases) rmSync(join(bundle, `${c.ref}.md`), { force: true });
  await runAkmJson(sandbox, ["index", "--full"], { timeoutMs: STEP_TIMEOUT_MS }); // makes state.db and indexes the notes
  const stash = realpathSync(bundle);
  const now = new Date().toISOString();
  const db = new Database(join(sandbox.env.AKM_DATA_DIR, "state.db"));
  try {
    const insert = db.prepare("INSERT INTO proposals (id, stash_dir, ref, status, source, created_at, updated_at, content, frontmatter_json, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const c of cases) insert.run(...proposalRow(c, stash, now));
  } finally {
    db.close();
  }
  const queued = await runAkmJson<{ totalCount?: number }>(sandbox, ["proposal", "list", "--status", "pending"], { timeoutMs: STEP_TIMEOUT_MS });
  if (queued.totalCount !== cases.length) fail(`akm lists ${queued.totalCount ?? "no"} pending proposals, and ${cases.length} were queued. This akm may keep its proposals another way.`, 1);
}

/** The model calls the drain made, from akm's usage events: how many, how many failed, and the model names the endpoint reported. */
export function callStats(sandbox: Sandbox): Summary["calls"] {
  try {
    const db = new Database(join(sandbox.env.AKM_DATA_DIR, "state.db"), { readonly: true });
    try {
      const rows = db.query("SELECT metadata_json FROM events WHERE event_type = 'llm_usage'").all() as { metadata_json: string }[];
      const served: Record<string, number> = {};
      let failures = 0;
      for (const r of rows) {
        const m = JSON.parse(r.metadata_json) as { outcome?: string; model?: string };
        if (m.outcome !== "success") failures++;
        if (m.model) served[m.model] = (served[m.model] ?? 0) + 1;
      }
      return { n: rows.length, failures, served };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function printSummary(s: Summary): void {
  const m = s.metrics;
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} proposals, ${(s.seconds / 60).toFixed(1)} min`);
  console.log(`  good in the set   ${cell(m.proposals.good, m.proposals.n, m.proposals.share_good)}`);
  console.log(`  accepted          ${m.accepted.n}: ${m.accepted.good} good, ${m.accepted.n - m.accepted.good} bad`);
  console.log(`  recall            ${cell(m.recall.accepted, m.recall.of, m.recall.value)}   good proposals accepted`);
  console.log(`  precision         ${cell(m.precision.good, m.precision.of, m.precision.value)}   accepted proposals that are good`);
  console.log(`  bad accepted      ${cell(m.bad_accepted.accepted, m.bad_accepted.of, m.bad_accepted.value)}`);
  for (const c of BAD) console.log(`    ${c.padEnd(10)}      ${cell(m.by_category[c].accepted, m.by_category[c].n, m.by_category[c].rate)}`);
  console.log(`  errored           ${s.n_errored}${s.calls ? `   (${s.calls.n} model calls, ${s.calls.failures} failed)` : ""}`);
  console.log(`  results           ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  const one = (s: Summary) => [
    cell(s.metrics.proposals.good, s.metrics.proposals.n, s.metrics.proposals.share_good),
    cell(s.metrics.recall.accepted, s.metrics.recall.of, s.metrics.recall.value),
    cell(s.metrics.precision.good, s.metrics.precision.of, s.metrics.precision.value),
    cell(s.metrics.bad_accepted.accepted, s.metrics.bad_accepted.of, s.metrics.bad_accepted.value),
    ...BAD.map((c) => cell(s.metrics.by_category[c].accepted, s.metrics.by_category[c].n, s.metrics.by_category[c].rate)),
    String(s.n_errored),
  ];
  const labels = ["", "good in the set", "recall", "precision", "bad accepted", ...BAD.map((c) => `  ${c}`), "errored"];
  const [x, y] = [[a.corpus, ...one(a)], [b.corpus, ...one(b)]];
  const w = [Math.max(...labels.map((l) => l.length)), Math.max(...x.map((v) => v.length)), Math.max(...y.map((v) => v.length))];
  console.log(`\n${NAME}: public and own side by side (not pooled)`);
  labels.forEach((l, i) => console.log(`  ${l.padEnd(w[0])}  ${x[i].padEnd(w[1])}  ${y[i].padEnd(w[2])}`));
}

export async function runCorpus(
  corpus: Corpus,
  ctx: { sandbox: Sandbox; version: string; model: string; baseUrl: string; label: string; limit?: number },
  folders: Folders = foldersFor(corpus),
): Promise<Summary> {
  const all = parseCases(readFileSync(folders.cases, "utf8"), folders.cases);
  const cases = selectCases(all, ctx.limit);
  const dir = makeResultsDir(folders.results, ctx.label);
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} proposals`);

  const t0 = performance.now();
  await plant(ctx.sandbox, cases, folders.library);
  console.log("  planted; the judge reads them one at a time");
  const args = ["proposal", "drain", "--judgment", "--strategy", STRATEGY, "--yes"];
  const drain = await runAkm(ctx.sandbox, [...args, "--format", "json"], { timeoutMs: DRAIN_TIMEOUT_MS });
  if (drain.code !== 0) fail(hideEndpoint(failureMessage("akm proposal drain", drain.code, drain.stderr), ctx.baseUrl), 1);
  let drained: Drained;
  try {
    drained = JSON.parse(drain.stdout) as Drained;
  } catch {
    return fail("akm proposal drain printed no JSON result", 1);
  }
  const rejected = await runAkmJson<{ proposals?: { id: string; review?: { reason?: string } }[] }>(ctx.sandbox, ["proposal", "list", "--status", "rejected", "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS });
  const reasons = new Map((rejected.proposals ?? []).map((p) => [p.id, p.review?.reason ?? ""]));
  const seconds = Number(((performance.now() - t0) / 1000).toFixed(1));

  // akm names the endpoint in some of its errors, and rows get shared, so no row carries it.
  const rows = JSON.parse(hideEndpoint(JSON.stringify(rowsFromDrain(cases, drained, reasons, dispatchFailures(drain.stderr))), ctx.baseUrl)) as Row[];
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const errored = rows.filter((r) => r.outcome === "error").length;
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
    n_errored: errored,
    seconds,
    calls: callStats(ctx.sandbox),
    metrics: metrics(rows),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (errored === rows.length) fail(`no proposal got a verdict. First error: ${rows[0]?.error}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`promotion: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "own" && corpus !== "all") fail(`--corpus must be public, own or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const corpora: Corpus[] = corpus === "all" ? ["public", "own"] : [corpus];

  const baseUrl = process.env.MODEL_BASE_URL?.trim();
  const model = process.env.MODEL_NAME?.trim();
  if (!baseUrl || !model) fail("set MODEL_BASE_URL and MODEL_NAME in .env (and MODEL_API_KEY if the endpoint needs one). See .env.example.");
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  if (corpora.includes("own")) {
    const f = foldersFor("own");
    if (!existsSync(f.cases) || !existsSync(join(f.library, "knowledge"))) fail(`the own set is missing (${relative(ROOT, f.cases)} and ${relative(ROOT, f.library)}/knowledge/). See "Run your own set" in evals/promotion/README.md.`);
    if (!(await isLocalJudge(baseUrl))) fail("--corpus own sends your notes to the model, so MODEL_BASE_URL must be localhost, a private-network address (10.*, 172.16.* to 172.31.*, 192.168.*) or a name that resolves only to such addresses. It is not.");
  }

  const summaries: Summary[] = [];
  for (const c of corpora) {
    const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
    try {
      writeConfig(sandbox, promotionConfig(baseUrl, model, !!process.env.MODEL_API_KEY?.trim()));
      const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
      summaries.push(await runCorpus(c, { sandbox, version, model, baseUrl, label, limit }));
    } catch (e) {
      if (e instanceof Fatal) throw e;
      return fail(hideEndpoint((e as Error).message, baseUrl), 1); // a failed akm command: its message, not a stack
    } finally {
      removeSandbox(sandbox);
    }
  }
  if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`promotion: ${e.message}`);
    process.exit(e.code);
  }
}
