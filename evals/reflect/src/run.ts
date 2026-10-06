#!/usr/bin/env bun
// reflect: runs akm's reflect on one asset at a time, with the model under test as its engine, and scores what it
// proposes with checks that need no judge. See ../README.md.
//
//   evals/reflect/run [--corpus public|private|all] [--limit N] [--label NAME]

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { type Case, type Metrics, type Row, CLASSES, STRATEGY, atLeast, makeRow, metrics, parseCases, pct, reflectConfig, reflectOutcome, refOf, selectCases, servedModel } from "./lib.ts";

const NAME = "reflect";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
export const MIN_AKM = "0.9.25-alpha.3"; // the first release where reflect changes only the frontmatter
const GIVE_UP_AFTER = 5; // consecutive cases that error, before any case gets an outcome

const USAGE = `Usage: evals/reflect/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs akm's reflect on each case's note, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
its engine, and scores the proposal. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/. private reads private/reflect/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run the first N cases. The first ten hold each class once.
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm ${MIN_AKM} or later on PATH, or in AKM_BIN.`;

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
  /** The model names that answered, as the responses give them, with how many cases each answered. */
  served: Record<string, number>;
  metrics: Metrics;
  results_dir: string;
}

interface Ctx {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  version: string;
  label: string;
  limit?: number;
}

/** A failure that ends the run with a message. It is thrown, so what the run holds is cleaned up on the way out. */
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

/**
 * One case in a bundle of its own: the note, the negative feedback recorded, reflect run on that asset alone, and the
 * proposal read back from the queue. akm exits 0 whatever reflect did, so what reflect did comes from the result.
 */
export async function runCase(c: Case, ctx: Pick<Ctx, "baseUrl" | "model" | "hasKey">): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  const hide = (text: string): string => text.split(ctx.baseUrl.replace(/\/+$/, "")).join("<MODEL_BASE_URL>"); // akm's errors name the endpoint it called, and results get shared
  try {
    writeConfig(sandbox, reflectConfig(ctx.baseUrl, ctx.model, ctx.hasKey));
    const file = join(sandbox.dir, "bundle", c.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, c.source);
    const ref = refOf(c.path);
    await runAkmJson(sandbox, ["index"]);
    await runAkmJson(sandbox, ["feedback", ref, "--negative", "--reason", c.feedback]);
    const improve = await runAkmJson(sandbox, ["improve", ref, "--strategy", STRATEGY, "--json-to-stdout"]);
    const { outcome, reason } = reflectOutcome(improve);
    const served = servedModel(improve);
    if (outcome !== "proposal") return makeRow(c, { outcome, reason: hide(reason), served, seconds: seconds() });
    const { proposals } = await runAkmJson<{ proposals: { id: string; source: string }[] }>(sandbox, ["proposal", "list"]);
    const mine = proposals.filter((p) => p.source === "reflect");
    if (mine.length !== 1) throw new Error(`reflect made a proposal but the queue holds ${mine.length}`);
    const shown = await runAkmJson<{ proposal: { payload?: { content?: unknown } } }>(sandbox, ["proposal", "show", mine[0]?.id ?? "", "--detail", "full"]);
    const content = shown.proposal.payload?.content;
    if (typeof content !== "string") throw new Error("the proposal has no content");
    return makeRow(c, { outcome: "proposal", proposal: content, served, seconds: seconds() });
  } catch (e) {
    return makeRow(c, { outcome: "error", reason: hide((e as Error).message).slice(0, 300), seconds: seconds() });
  } finally {
    removeSandbox(sandbox);
  }
}

const cell = (n: { correct: number; n: number } | undefined): string => (n ? `${n.correct}/${n.n}` : "-");

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  defects fixed   ${cell(m.defects)}  ${pct(m.defects.rate)}`);
  console.log(`  controls right  ${cell(m.controls)}  ${pct(m.controls.rate)}`);
  console.log(`  proposals       ${m.proposals.n}, ${m.proposals.touched_body} touched the body`);
  console.log(`  errored         ${s.n_errored}`);
  if (Object.keys(s.served).length > 0) console.log(`  served by       ${Object.entries(s.served).map(([name, n]) => `${name} ${n}`).join(", ")}`);
  for (const cls of CLASSES) {
    const k = m.classes[cls];
    if (!k) continue;
    const failed = Object.entries(k.failed).map(([name, n]) => `${name} ${n}`).join(", ");
    const other = (["none", "refused", "unusable", "error"] as const).filter((o) => k.outcomes[o] > 0 && (o !== "none" || k.correct < k.n)).map((o) => `${o} ${k.outcomes[o]}`).join(", ");
    console.log(`    ${cls.padEnd(22)} ${cell(k).padEnd(5)} ${[failed && `failed: ${failed}`, other && `outcomes: ${other}`].filter(Boolean).join("; ")}`);
  }
  console.log(`  results         ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["defects fixed", `${cell(a.metrics.defects)}  ${pct(a.metrics.defects.rate)}`, `${cell(b.metrics.defects)}  ${pct(b.metrics.defects.rate)}`],
    ["controls right", `${cell(a.metrics.controls)}  ${pct(a.metrics.controls.rate)}`, `${cell(b.metrics.controls)}  ${pct(b.metrics.controls.rate)}`],
    ["touched the body", `${a.metrics.proposals.touched_body} of ${a.metrics.proposals.n}`, `${b.metrics.proposals.touched_body} of ${b.metrics.proposals.n}`],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ...CLASSES.filter((cls) => a.metrics.classes[cls] || b.metrics.classes[cls]).map((cls): [string, string, string] => [`  ${cls}`, cell(a.metrics.classes[cls]), cell(b.metrics.classes[cls])]),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0] as number)}  ${r[1].padEnd(w[1] as number)}  ${r[2].padEnd(w[2] as number)}`);
}

export async function runCorpus(
  corpus: Corpus,
  ctx: Ctx,
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
  let anyOutcome = false;
  let aborted: string | undefined;
  for (const c of cases) {
    const row = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const verdict = row.outcome === "error" ? `error  ${(row.error ?? "").slice(0, 120)}` : `${row.outcome.padEnd(8)} ${row.correct ? "ok" : `FAIL ${Object.entries(row.checks ?? {}).filter(([, ok]) => !ok).map(([name]) => name).join(",")}`}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(26)} ${verdict}  ${row.seconds}s`);
    if (row.outcome === "error") {
      consecutiveErrors++;
      if (!anyOutcome && consecutiveErrors >= GIVE_UP_AFTER) {
        aborted = row.error;
        break;
      }
    } else {
      anyOutcome = true;
      consecutiveErrors = 0;
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
    limit: ctx.limit ?? null,
    n_cases: all.length,
    n_run: rows.length,
    n_scored: rows.length - errored,
    n_errored: errored,
    served: rows.reduce<Record<string, number>>((n, r) => (r.served ? { ...n, [r.served]: (n[r.served] ?? 0) + 1 } : n), {}),
    metrics: metrics(rows),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (aborted) fail(`the first ${GIVE_UP_AFTER} cases got no outcome, so the run stopped. Last error: ${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`reflect: ${(e as Error).message}\n\n${USAGE}`);
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

  const probe = createSandbox(NAME);
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }
  if (!atLeast(version, MIN_AKM)) fail(`akm ${version} still rewrites the body. This eval needs akm ${MIN_AKM} or later.`);

  const ctx: Ctx = { baseUrl, model, hasKey: !!process.env.MODEL_API_KEY?.trim(), version, label, limit };
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(await runCorpus(c, ctx));
  if (summaries.length === 2) printSideBySide(summaries[0] as Summary, summaries[1] as Summary);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`reflect: ${e.message}`);
    process.exit(e.code);
  }
}
