#!/usr/bin/env bun
// bakeoff: runs the akm commands that make the work no other eval measures (memory inference, remember --enrich, schema repair, the summary
// of a session, consolidate's promotions) with the model under test as akm's engine, and scores what akm wrote with checks that need no
// judge. See ../README.md.
//
//   evals/bakeoff/run [--corpus public|custom|all] [--cases DIR] [--process NAME] [--limit N] [--repeat N] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { type ModelCalls, takeModelCalls } from "../../../lib/akm/usage.ts";
import { OVERRIDE_OPTIONS, parseOverrides } from "../../../lib/akm/overrides.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { type EngineSettings, engineSettings, harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { atLeast } from "../../reflect/src/lib.ts";
import { type CaseContext, NAME, PROCESSES, type Process, type Row, type Metrics, assetsSha256, configFor, loadCases, pct, runCase, selectCases, summarize } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

export { runCase };
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
export const MIN_AKM = "0.9.26"; // the release the commands, the config and the output read here were checked against
const GIVE_UP_AFTER = 5; // consecutive cases that error, before any case gets an outcome

const USAGE = `Usage: evals/bakeoff/run [--corpus public|custom|all] [--cases DIR] [--process NAME] [--limit N] [--repeat N] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs the akm command of each process on each case, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
its engine, and scores what akm wrote. Settings come from .env at the repository root.

${corpusUsage}
  --process N the process to run, one of ${PROCESSES.join(", ")}. Default: all of them.
  --limit   run N cases, the first of each process in turn, so a short run covers every process
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
  --config-patch FILE  a JSON file deep-merged into the akm config the eval writes, after it. A relative FILE is from the repository root.
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm ${MIN_AKM} or later on PATH, or in AKM_BIN.`;

interface Summary {
  eval: string;
  corpus: string;
  /** The folder of a custom corpus from the repository root, so scripts/rescore can read its cases. Null for the public corpus and for a folder outside the repository (then rescore takes --cases DIR). Never an absolute path. */
  corpus_folder: string | null;
  label: string;
  date: string;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  limit: number | null;
  /** The one process the run was limited to, null for all. */
  process: Process | null;
  /** The config patch (path and SHA-256) merged into the config, if any. */
  config_patch: { path: string; sha256: string } | null;
  /** The akm config the eval wrote, with secrets redacted, and the settings of its engine: temperature, thinking, endpoint host. */
  config: Record<string, unknown>;
  engine: EngineSettings;
  /** The digest of the corpus folder: cases.json and the files the cases name, by path relative to it. */
  assets_sha256: string;
  /** The seed of the corpus, when it is a rewrite of the public cases. Null for the public corpus and for your own. */
  seed: string | null;
  /** "aborted" when the run gave up (the endpoint down or rate limiting) and so may have run fewer cases than it selected. Then aborted_reason says why. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** Of the errored cases, how many ended because an akm command ran past its timeout. */
  timeouts: number;
  /** The model names that answered, as the responses give them, with how many cases each answered. */
  served: Record<string, number>;
  metrics: Metrics;
  /** What the run was made of (see lib/manifest.ts). */
  /** The run's model calls, from akm's own record of them (lib/akm/usage.ts). */
  model_calls: ModelCalls | null;
  manifest: RunManifest;
  results_dir: string;
}

interface Ctx extends CaseContext {
  version: string;
  label: string;
  limit?: number;
  process?: Process;
}

const cell = (n: { n: number; passed: number } | undefined): string => (n ? `${n.passed}/${n.n}` : "-");

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  valid output    ${cell(m.valid_output)}  ${pct(m.valid_output.rate)}`);
  console.log(`  cases passed    ${cell(m.case_pass)}  ${pct(m.case_pass.rate)}`);
  console.log(`  checks held     ${pct(m.checks.rate)} (the mean share of a case's checks)`);
  console.log(`  median seconds  ${m.median_seconds ?? "n/a"}`);
  console.log(`  errored         ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  if (Object.keys(s.served).length > 0) console.log(`  served by       ${Object.entries(s.served).map(([name, n]) => `${name} ${n}`).join(", ")}`);
  for (const process of PROCESSES) {
    const k = m.by_process[process];
    if (!k) continue;
    const failed = Object.entries(k.failed).map(([name, n]) => `${name} ${n}`).join(", ");
    const other = (["unusable", "error"] as const).filter((o) => k.outcomes[o] > 0).map((o) => `${o} ${k.outcomes[o]}`).join(", ");
    console.log(`    ${process.padEnd(20)} ${`${k.passed}/${k.n}`.padEnd(5)} ${pct(k.checks).padEnd(7)} ${[failed && `failed: ${failed}`, other && `outcomes: ${other}`].filter(Boolean).join("; ")}`);
  }
  console.log(`  results         ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const col = (s: Summary, process: Process): string => cell(s.metrics.by_process[process] ? { n: s.metrics.by_process[process].n, passed: s.metrics.by_process[process].passed } : undefined);
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["valid output", `${cell(a.metrics.valid_output)}  ${pct(a.metrics.valid_output.rate)}`, `${cell(b.metrics.valid_output)}  ${pct(b.metrics.valid_output.rate)}`],
    ["cases passed", `${cell(a.metrics.case_pass)}  ${pct(a.metrics.case_pass.rate)}`, `${cell(b.metrics.case_pass)}  ${pct(b.metrics.case_pass.rate)}`],
    ["checks held", pct(a.metrics.checks.rate), pct(b.metrics.checks.rate)],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ...PROCESSES.filter((p) => a.metrics.by_process[p] || b.metrics.by_process[p]).map((p): [string, string, string] => [`  ${p}`, col(a, p), col(b, p)]),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0] as number)}  ${r[1].padEnd(w[1] as number)}  ${r[2].padEnd(w[2] as number)}`);
}

/** The folder a corpus's results go to: the eval's results/ for the public corpus, private/bakeoff/results for a custom one. */
const resultsFolder = (corpus: ResolvedCorpus): string => (corpus.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"));

/** Why a corpus cannot be run, in a sentence that says what to do, or undefined when it can. A custom corpus needs its cases.json. */
export function corpusProblem(corpus: ResolvedCorpus): string | undefined {
  if (corpus.name === "public") return undefined;
  const where = corpusFolderOf(corpus.folder) ?? corpus.folder;
  const again = corpus.rewrite ? ". Make it with: ./generate-assets --only bakeoff" : "";
  return existsSync(join(corpus.folder, "cases.json")) ? undefined : `the ${corpus.flag} corpus has no cases.json in ${where}${again}`;
}

export async function runCorpus(corpus: ResolvedCorpus, ctx: Ctx, resultsParent: string = resultsFolder(corpus)): Promise<Summary> {
  const all = loadCases(corpus.folder);
  const cases = selectCases(all, ctx.limit, ctx.process);
  if (cases.length === 0) fail(`no case to run: the corpus has none for ${ctx.process}`);
  const dir = makeResultsDir(resultsParent, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} cases, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let anyOutcome = false;
  let aborted: string | undefined;
  for (const c of cases) {
    const row = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const verdict = row.outcome === "error" ? `error  ${(row.error ?? "").slice(0, 120)}` : `${row.outcome.padEnd(8)} ${row.correct ? "ok" : `FAIL ${Object.entries(row.checks ?? {}).filter(([, ok]) => !ok).map(([name]) => name).join(", ") || "shape"}`}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(34)} ${c.process.padEnd(19)} ${verdict}  ${row.seconds}s`);
    if (row.outcome === "error") {
      consecutiveErrors++;
      if (!anyOutcome && consecutiveErrors >= GIVE_UP_AFTER) {
        aborted = row.error || "no message";
        break;
      }
    } else {
      anyOutcome = true;
      consecutiveErrors = 0;
    }
  }

  const abortedReason = `the first ${GIVE_UP_AFTER} cases got no outcome, so the run stopped. Last error: ${aborted}`;
  const config = configFor(ctx);
  const build = akmBuild();
  const counts = summarize(rows);
  const seed = corpus.seed;
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: corpus.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config,
    settings: { strategy: null, config_patch_sha256: ctx.configPatch?.sha256 ?? null, timeout_ms: ctx.timeoutMs ?? null, seed },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
  });
  const summary: Summary = {
    eval: NAME,
    corpus: corpus.name,
    corpus_folder: corpus.name === "custom" ? corpusFolderOf(corpus.folder) : null,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    limit: ctx.limit ?? null,
    process: ctx.process ?? null,
    config_patch: ctx.configPatch ? { path: ctx.configPatch.path, sha256: ctx.configPatch.sha256 } : null,
    config: redactConfig(hideEndpoint(config, ctx.baseUrl)), // the endpoint is written as <MODEL_BASE_URL>; engine and manifest hold its host
    engine: engineSettings(config),
    assets_sha256: assetsSha256(corpus.folder),
    seed,
    status: aborted ? "aborted" : "complete",
    aborted_reason: aborted ? abortedReason : null,
    n_cases: all.length,
    n_run: counts.n_run,
    n_scored: counts.n_scored,
    n_errored: counts.n_errored,
    timeouts: counts.timeouts,
    served: counts.served,
    metrics: counts.metrics,
    model_calls: takeModelCalls(),
    manifest,
    results_dir: dir,
  };
  // The summary is written before the run fails, and says it was cut short: a reader of the folder must not take it for a whole run.
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (aborted) fail(`${abortedReason}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; process?: string; limit?: string; repeat?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, process: { type: "string" }, limit: { type: "string" }, repeat: { type: "string" }, "config-patch": OVERRIDE_OPTIONS["config-patch"], ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`bakeoff: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  try {
  } catch (e) {
    fail((e as Error).message);
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  if (values.process !== undefined && !(PROCESSES as readonly string[]).includes(values.process)) fail(`--process must be one of ${PROCESSES.join(", ")}, not "${values.process}"`);
  const configPatch = parseOverrides({ "config-patch": values["config-patch"] }, "", fail).configPatch;

  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: join(EVAL_DIR, "assets"), fail });
  useAkm(values, fail);
  const settings = useModel(values, fail);
  for (const c of corpora) {
    const problem = corpusProblem(c);
    if (problem) fail(problem);
  }
  const { baseUrl, name: model, hasKey } = settings;
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, [{ role: "model", name: model, baseUrl }]);

  const probe = createSandbox(NAME);
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }
  if (!atLeast(version, MIN_AKM)) fail(`akm ${version} is older than the ${MIN_AKM} this eval was checked against. It needs akm ${MIN_AKM} or later.`);

  const ctx: Ctx = { baseUrl, model, hasKey, version, label, limit, process: values.process as Process | undefined, configPatch };
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel }))));
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0] as Summary, summaries[1] as Summary);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`bakeoff: ${e.message}`);
    process.exit(e.code);
  }
}
