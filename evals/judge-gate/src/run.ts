#!/usr/bin/env bun
// judge-gate: runs akm's reflect quality judge, with the model under test as the judge, on labelled
// proposals. See ../README.md.
//
//   evals/judge-gate/run [--corpus public|private|all] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, writeConfig, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { type EngineSettings, engineSettings, redactConfig } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { CASES, casesSha256, privateAssetsProblem, privateSeed } from "./inputs.ts";
import { type Case, type Rate, type Row, STRATEGY, atLeast, configFor, errorRow, failureMessage, hasVerdict, hideEndpoints, hideInRow, metrics, orderFeedback, parseCases, pct, rowFromVerdict, selectCases } from "./lib.ts";

const NAME = "judge-gate";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const CONCURRENCY = 2;
const JUDGE_TIMEOUT_MS = 15 * 60_000; // one case, on a slow local model
const MIN_AKM = "0.9.25-alpha.2"; // the first release with `akm improve judge`
const GIVE_UP_AFTER = 5; // consecutive cases with no verdict, at any point of the run

const USAGE = `Usage: evals/judge-gate/run [--corpus public|private|all] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs akm's reflect quality judge, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled proposals. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/. private reads private/judge-gate/assets/, made by
            ./generate-assets: a light rewrite of the same cases, not held-out data. It stops when they were
            made from public cases that have changed since: make them again. all runs both and prints the two
            results side by side.
  --limit   run N cases, in the good/bad proportion of the whole set
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
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
  /** The improve strategy the config makes the default, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  /** `complete` when the run went through its cases, `aborted` when it stopped early (see aborted_reason), and then the numbers cover the n_run cases that ran. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** The cases where akm ran into its time limit and was killed. They are errored too: a slower akm shows here, not as unexplained errors. */
  timeouts: number;
  /** The akm config the eval wrote, with any secret redacted and the endpoint written as <MODEL_BASE_URL>, and the settings of its LLM engine: the model, the endpoint's host, temperature, thinking and the time limit. */
  config: unknown;
  engine: EngineSettings;
  /** The digest of the cases file the run read. It changes when a case or a label does. */
  assets_sha256: string;
  /** The seed that made the private cases (generated.json, else private/seed), null for the public corpus or when none is recorded. */
  seed: string | null;
  metrics: ReturnType<typeof metrics>;
  results_dir: string;
}

interface Ctx {
  sandbox: Sandbox;
  version: string;
  model: string;
  /** The model endpoint, masked in the rows. */
  baseUrl: string;
  label: string;
  limit?: number;
  overrides?: Overrides;
  seed?: string | null;
  /** The time limit of one case. Tests shorten it. */
  timeoutMs?: number;
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

const cell = (r: Rate): string => `${r.passed}/${r.n}  ${pct(r.rate)}`;
const erroredText = (s: Summary): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;

function printSummary(s: Summary): void {
  const m = s.metrics;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(12)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  line("good passed", cell(m.good));
  line("bad passed", cell(m.bad));
  line("  harmful", cell(m.bad_harmful));
  line("  churn", cell(m.bad_churn));
  line("precision", `${m.precision.passed_good}/${m.precision.passed}  ${pct(m.precision.value)}`);
  line("errored", erroredText(s));
  if (s.status === "aborted") line("status", `aborted: ${s.aborted_reason}`);
  line("results", `${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["good passed", cell(a.metrics.good), cell(b.metrics.good)],
    ["bad passed", cell(a.metrics.bad), cell(b.metrics.bad)],
    ["  harmful", cell(a.metrics.bad_harmful), cell(b.metrics.bad_harmful)],
    ["  churn", cell(a.metrics.bad_churn), cell(b.metrics.bad_churn)],
    ["precision", `${a.metrics.precision.passed_good}/${a.metrics.precision.passed}  ${pct(a.metrics.precision.value)}`, `${b.metrics.precision.passed_good}/${b.metrics.precision.passed}  ${pct(b.metrics.precision.value)}`],
    ["errored", erroredText(a), erroredText(b)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
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
  const all = parseCases(readFileSync(join(assets, CASES), "utf8"), join(assets, CASES));
  const cases = selectCases(all, ctx.limit);
  const dir = makeResultsDir(resultsParent, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} cases, ${CONCURRENCY} at a time`);

  const rows: Row[] = [];
  let next = 0;
  let consecutiveFailures = 0;
  let aborted: string | undefined;

  const judge = async (c: Case): Promise<Row> => {
    const input = JSON.stringify({ source: c.source, candidate: c.candidate, feedback: orderFeedback(c.feedback) });
    let run: Awaited<ReturnType<typeof runAkm>>;
    try {
      run = await runAkm(ctx.sandbox, ["improve", "judge", "--format", "json"], { stdin: input, timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS });
    } catch (e) {
      return hideInRow(errorRow(c, (e as Error).message, 0), ctx.baseUrl);
    }
    const { stdout, stderr, code, ms, timedOut } = run;
    const seconds = Number((ms / 1000).toFixed(1));
    if (timedOut) return hideInRow(errorRow(c, failureMessage(code, stderr, stdout), seconds, true), ctx.baseUrl);
    let verdict: unknown;
    try {
      verdict = JSON.parse(stdout);
    } catch {
      return hideInRow(errorRow(c, failureMessage(code, stderr, stdout), seconds), ctx.baseUrl);
    }
    return hideInRow(rowFromVerdict(c, verdict, seconds), ctx.baseUrl);
  };

  const worker = async () => {
    while (next < cases.length && !aborted) {
      const index = next++;
      const c = cases[index];
      const row = await judge(c);
      rows.push(row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      const note = row.error ?? (hasVerdict(row) ? "" : row.reason);
      console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.label.padEnd(4)} ${row.outcome.padEnd(6)} ${row.seconds}s  ${c.id.slice(0, 8)}${note ? `  ${note.slice(0, 120)}` : ""}`);
      if (hasVerdict(row)) consecutiveFailures = 0;
      else if (++consecutiveFailures >= GIVE_UP_AFTER) aborted ??= note || "no verdict";
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

  const errored = rows.filter((r) => r.outcome === "error").length;
  const written = redactConfig(JSON.parse(readFileSync(join(ctx.sandbox.dir, "config", "config.json"), "utf8"))); // the endpoint is whole here, for the engine's host
  const config = hideEndpoints(written);
  const abortedReason = aborted === undefined ? null : `${GIVE_UP_AFTER} cases in a row got no verdict, so the run stopped after ${rows.length} of ${cases.length}. Last: ${aborted}`;
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
    ...overrideSummary(ctx.overrides ?? defaultOverrides(STRATEGY)),
    status: abortedReason === null ? "complete" : "aborted",
    aborted_reason: abortedReason,
    n_cases: all.length,
    n_run: rows.length,
    n_scored: rows.length - errored,
    n_errored: errored,
    timeouts: rows.filter((r) => r.timed_out).length,
    config,
    engine: engineSettings(written),
    assets_sha256: casesSha256(assets),
    seed: ctx.seed ?? null,
    metrics: metrics(rows),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (abortedReason !== null) fail(`${abortedReason}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and whether the model answers in the JSON akm asks for.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; limit?: string; repeat?: string; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, repeat: { type: "string" }, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
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
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const overrides = parseOverrides(values, STRATEGY, fail);
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];

  const privateAssets = join(ROOT, "private", NAME, "assets");
  if (corpora.includes("private")) {
    const problem = privateAssetsProblem(privateAssets, join(EVAL_DIR, "assets"), `private/${NAME}/assets`);
    if (problem) fail(problem);
  }
  useAkm(values, fail);
  const { baseUrl, name: model, hasKey } = useModel(values, fail);
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  try {
    writeConfig(sandbox, configFor(baseUrl, model, hasKey, overrides));

    const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
    if (!atLeast(version, MIN_AKM)) fail(`akm ${version} has no \`improve judge\` command. This eval needs akm ${MIN_AKM} or later.`);

    const summaries: Summary[] = [];
    for (const c of corpora) {
      const seed = c === "private" ? privateSeed(privateAssets, ROOT) : null;
      summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { sandbox, version, model, baseUrl, label: runLabel, limit, overrides, seed }))));
    }
    if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
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
