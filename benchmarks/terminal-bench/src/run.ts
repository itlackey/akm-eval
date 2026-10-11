#!/usr/bin/env bun
// terminal-bench: runs the tasks of Terminal-Bench 2.1 with opencode alone and with opencode plus the akm plugin, in
// Harbor, and reports how often each passes and whether the agent called akm. See ../README.md.
//
//   benchmarks/terminal-bench/run [--corpus public|private|all] [--limit N] [--attempts N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson } from "../../../lib/akm/akm.ts";
import {
  AKM_ARM_OPTIONS,
  CONCURRENT_TRIALS,
  Fatal,
  type AkmArm,
  type Pins,
  akmArm,
  akmArmUsage,
  akmSummary,
  erroredOf,
  fail,
  gitCommit,
  jobConfig as harborJob,
  jobRecord,
  loadRunTrials,
  metricsOf,
  parseAkm,
  parseAkmEnv,
  pinsOf,
  positive,
  preflight,
  releaseArm,
  runHarbor,
  sha256Dir,
  slug,
  stagePackages,
  timeoutsOf,
} from "../../../lib/harbor/harbor.ts";
import { type Report, type Trial, buildReport, formatReport, sideBySide as sideBySideOf } from "../../../lib/harbor/report.ts";
import { MODEL_OPTIONS } from "../../../lib/models.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";

const NAME = "terminal-bench";
const BENCH_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(BENCH_DIR, "..", "..");

const DEFAULT_ATTEMPTS = 1; // per task and arm
const LIBRARY = "library"; // the library's folder in what the akm arm uploads, and so its AKM_TASK_STASH

const USAGE = `Usage: benchmarks/terminal-bench/run [--corpus public|private|all] [--limit N] [--attempts N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs the tasks of Terminal-Bench 2.1 with opencode alone and with opencode plus the akm plugin, in Harbor, on the model
in MODEL_NAME. Settings come from .env at the repository root. Harbor fetches the tasks at run time.

  --corpus    which library the akm arm gets. public (default): corpus/library. private: its private copy, made by
              ./generate-assets --only retrieval. The tasks are the same. all runs both and prints the two results
              side by side.
  --model     the model: a line of models.json, or a model as the gateway names it, as opencode takes it (openai/gpt-6-luna;
              a name without a provider is an openai model). Default: MODEL_NAME in .env.
  --label     names the results folder: <UTC date>-<label>. Default: the model name.
  --limit     run the first N tasks of an order that starts with Harbor's terminal-bench-sample (ten tasks) and goes on
              by name. Without it every task of the dataset runs.
  --attempts  run each task N times per arm (default ${DEFAULT_ATTEMPTS}). The pass rate of a task is then the share of its attempts passed.
  --repeat    run the whole benchmark N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
              <UTC date>-<label>-repeat-summary.json beside them
${akmArmUsage}

Needs Docker, uv and bun. MODEL_NAME is the model as opencode names it, such as openai/gpt-6-luna. A name without a
provider is read as an openai model. The key goes in MODEL_API_KEY (or OPENAI_API_KEY), and MODEL_BASE_URL sets another
endpoint, which a container must be able to reach. Only the variables Harbor needs and the model's reach it.`;

type Corpus = "public" | "private";

/** assets/ASSETS.lock: the dataset Harbor fetches, by digest, and the tasks in it. */
export interface Lock {
  dataset: string;
  source: string;
  registry: string;
  ref: string;
  licence: string;
  /** The ten tasks of Harbor's terminal-bench-sample. */
  sample: string[];
  /** Each task of the dataset and its digest. */
  tasks: Record<string, string>;
}

/** The assets akm indexes in the library, as the host's akm counted them at the start of the run. */
export interface LibraryCount {
  /** Null when no akm on this machine could count them. The akm arm's setup then only checks that its index is not empty. */
  assets: number | null;
  /** The akm that counted. Null when none did. */
  measured_with: { akm_version: string; akm_bin: string; akm_build: string | null } | null;
}

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  akm_version: string;
  /** What `--akm` named, with the home folder as ~: akm-cli@x.y.z or the checkout's folder. akm_build is the checkout's git describe, null for a release. */
  akm_bin: string;
  akm_build: string | null;
  akm_env: Record<string, string>;
  akm_install: ReturnType<typeof akmSummary>["akm_install"];
  pins: Pins;
  dataset: { name: string; ref: string; source: string; licence: string; tasks_in_dataset: number; tasks_run_with_another_digest: string[] };
  library: LibraryCount & { path: string; sha256: string | null };
  limit: number | null;
  n_tasks: number;
  attempts: number;
  harbor_exit: number;
  /** Trials that hit a time limit, by arm. They are counted among the errors too when they got no reward. */
  timeouts: { control: number; akm: number };
  n_errored: number;
  /** The report's main numbers, as numbers, for --repeat's spread. */
  metrics: ReturnType<typeof metricsOf>;
  /** The Harbor job that ran: attempts, concurrency, setup time, the agents with their options and the datasets. */
  job: Record<string, unknown>;
  report: Report;
  results_dir: string;
}

export function readLock(): Lock {
  return JSON.parse(readFileSync(join(BENCH_DIR, "assets", "ASSETS.lock"), "utf8"));
}

/**
 * The tasks a run uses. Without a limit, all of them. With one, the first N of an order that starts with the ten tasks
 * of Harbor's sample, so `--limit 10` is that sample, and goes on with the others by name.
 */
export function selectTasks(lock: Pick<Lock, "sample" | "tasks">, limit?: number): string[] {
  const rest = Object.keys(lock.tasks).filter((t) => !lock.sample.includes(t)).sort();
  return [...lock.sample, ...rest].slice(0, limit);
}

/** The library the akm arm gets: the public one, or its private copy, which evals/retrieval makes. */
export function libraryOf(corpus: Corpus): string {
  return corpus === "public" ? join(ROOT, "corpus", "library") : join(ROOT, "private", "retrieval", "assets", "library");
}

/**
 * The assets akm indexes in `library`, counted with the akm on this machine (AKM_BIN, else akm on PATH) as the akm arm seeds it: the
 * type folders copied into a new bundle in a sandbox, a full index, and `akm info`. Facts are the scaffold's, not the library's.
 * Count them here and not by files: a file is not an asset (317 files, 259 assets in the public library on akm 0.9.26), and the number
 * changes with every library edit and with akm's rules. The akm arm's own akm may count otherwise; its setup stops when it indexes fewer.
 * When no akm can count, the number is null and `reason` says why.
 */
export async function measureLibrary(library: string): Promise<LibraryCount & { reason?: string }> {
  const sandbox = createSandbox(`${NAME}-count`);
  try {
    const version = await akmVersion(sandbox);
    const bundle = join(sandbox.dir, "bundle");
    const run = async (args: string[]) => {
      const done = await runAkm(sandbox, args, { timeoutMs: 10 * 60_000 });
      if (done.code !== 0) throw new Error(`akm ${args[0]} failed (exit ${done.code}): ${done.stderr.trim().slice(-300)}`);
    };
    await run(["bundle", "create", "--dir", bundle, "--set-default"]);
    for (const e of readdirSync(library, { withFileTypes: true })) if (e.isDirectory()) cpSync(join(library, e.name), join(bundle, e.name), { recursive: true });
    await run(["index", "--full"]);
    const info = await runAkmJson<{ indexStats: { byType: Record<string, number> } }>(sandbox, ["info", "-q"], { timeoutMs: 60_000 });
    const assets = Object.entries(info.indexStats.byType).reduce((n, [type, count]) => n + (type === "fact" ? 0 : count), 0);
    return { assets, measured_with: { akm_version: version, ...akmBuild() } };
  } catch (e) {
    return { assets: null, measured_with: null, reason: (e as Error).message };
  } finally {
    removeSandbox(sandbox);
  }
}

/**
 * The Harbor job: the two arms on these tasks of the pinned dataset, `attempts` each. The tasks are Harbor's and none
 * of them names a library, so the job names the one the akm arm seeds, for every task, and how many assets akm must index in
 * it (`libraryAssets`, as measureLibrary counted them: when it could not, at least one).
 */
export function jobConfig(o: {
  name: string;
  model: string;
  lock: Lock;
  tasks: string[];
  librariesDir: string;
  jobsDir: string;
  attempts?: number;
  libraryAssets?: number | null;
  arm?: AkmArm;
  packagesDir?: string | null;
  akmEnv?: Record<string, string>;
}): Record<string, unknown> {
  const org = o.lock.registry.split("/")[0];
  return harborJob({
    name: o.name,
    model: o.model,
    jobsDir: o.jobsDir,
    attempts: o.attempts ?? DEFAULT_ATTEMPTS,
    librariesDir: o.librariesDir,
    datasets: [{ name: o.lock.registry, ref: o.lock.ref, task_names: o.tasks.map((t) => `${org}/${t}`) }],
    arm: o.arm,
    packagesDir: o.packagesDir,
    akmEnv: o.akmEnv,
    akm: { env: { AKM_TASK_STASH: LIBRARY }, kwargs: { library_assets: o.libraryAssets ?? 1 } },
  });
}

/** The tasks some trial ran with a digest other than the lock's: the dataset was not the pinned one. */
export function otherDigests(trials: Trial[], lock: Pick<Lock, "tasks">): string[] {
  return [...new Set(trials.filter((t) => t.digest != null && t.digest !== lock.tasks[t.task]).map((t) => t.task))].sort();
}

function printSummary(s: Summary): void {
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm-cli ${s.pins.akm_cli}, plugin ${s.pins.akm_plugin}, opencode ${s.pins.opencode}, harbor ${s.pins.harbor}`);
  console.log(`  akm          ${s.akm_bin}${s.akm_build ? ` at ${s.akm_build}` : ""}${Object.keys(s.akm_env).length ? `, ${Object.entries(s.akm_env).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}`);
  console.log(`  ${s.dataset.name} ${s.dataset.ref.slice(0, 19)}, ${s.n_tasks} of ${s.dataset.tasks_in_dataset} tasks, ${s.attempts} ${s.attempts === 1 ? "attempt" : "attempts"} per arm, akm arm library: ${s.library.path} (${s.library.assets === null ? "assets not counted" : `${s.library.assets} assets`})`);
  if (s.dataset.tasks_run_with_another_digest.length) console.log(`  WARNING: these tasks ran with a digest other than the lock's: ${s.dataset.tasks_run_with_another_digest.join(", ")}`);
  for (const line of formatReport(s.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
export const sideBySide = (a: Pick<Summary, "corpus" | "report">, b: Pick<Summary, "corpus" | "report">): string[] => sideBySideOf(NAME, a, b);

const jobName = (corpus: Corpus): string => `${NAME}-${corpus}`;

/**
 * What a run says about itself, from the trials Harbor left in `dir`. Writes summary.json and samples.jsonl there. `arm`, `akmEnv`,
 * `packages`, `library` and `job` are what the run was made of, which the caller knows and the trials do not.
 */
export function summarize(o: {
  corpus: Corpus;
  label: string;
  model: string;
  limit?: number;
  lock: Lock;
  tasks: string[];
  dir: string;
  exit: number;
  attempts?: number;
  arm?: AkmArm;
  akmEnv?: Record<string, string>;
  packages?: { file: string; sha256: string }[];
  library?: LibraryCount & { sha256: string | null };
  job?: Record<string, unknown>;
}): Summary {
  const { trials, observed } = loadRunTrials(join(o.dir, "jobs", jobName(o.corpus)));
  const arm = o.arm ?? releaseArm();
  const akmEnv = o.akmEnv ?? {};
  const report = buildReport(trials);
  const summary: Summary = {
    eval: NAME,
    corpus: o.corpus,
    label: o.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    model: o.model,
    ...akmSummary(arm, akmEnv, o.packages ?? [], observed),
    pins: pinsOf(arm),
    dataset: { name: o.lock.registry, ref: o.lock.ref, source: o.lock.source, licence: o.lock.licence, tasks_in_dataset: Object.keys(o.lock.tasks).length, tasks_run_with_another_digest: otherDigests(trials, o.lock) },
    library: { path: relative(ROOT, libraryOf(o.corpus)), assets: o.library?.assets ?? null, measured_with: o.library?.measured_with ?? null, sha256: o.library?.sha256 ?? null },
    limit: o.limit ?? null,
    n_tasks: o.tasks.length,
    attempts: o.attempts ?? DEFAULT_ATTEMPTS,
    harbor_exit: o.exit,
    timeouts: timeoutsOf(trials),
    n_errored: erroredOf(report),
    metrics: metricsOf(report, trials),
    job: o.job ?? {},
    report,
    results_dir: o.dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(o.dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(join(o.dir, "samples.jsonl"), trials.map((t) => `${JSON.stringify(t)}\n`).join(""));
  return summary;
}

/** Where a corpus's runs go: results/ here, or private/terminal-bench/results/. */
const resultsOf = (corpus: Corpus): string => (corpus === "public" ? join(BENCH_DIR, "results") : join(ROOT, "private", NAME, "results"));

export async function runCorpus(
  corpus: Corpus,
  ctx: { model: string; label: string; limit?: number; env: Record<string, string>; attempts?: number; arm?: AkmArm; akmEnv?: Record<string, string> },
  results = resultsOf(corpus),
): Promise<Summary> {
  const lock = readLock();
  const tasks = selectTasks(lock, ctx.limit);
  const attempts = ctx.attempts ?? DEFAULT_ATTEMPTS;
  const arm = ctx.arm ?? releaseArm();
  const akmEnv = ctx.akmEnv ?? {};
  const dir = makeResultsDir(results, ctx.label);
  const librariesDir = join(dir, "libraries");
  cpSync(libraryOf(corpus), join(librariesDir, LIBRARY), { recursive: true }); // what the akm arm seeds, kept with the run
  const counted = await measureLibrary(libraryOf(corpus));
  const { reason, ...count } = counted;
  if (reason !== undefined) console.warn(`${NAME}: the assets of the library were not counted (${reason}). The akm arm's setup will only check that its index is not empty.`);
  const library = { ...count, sha256: sha256Dir(join(librariesDir, LIBRARY)) };
  const staged = stagePackages(arm, dir); // the tarballs of a checkout, kept with the run
  const cfg = jobConfig({ name: jobName(corpus), model: ctx.model, lock, tasks, librariesDir, jobsDir: join(dir, "jobs"), attempts, libraryAssets: library.assets, arm, packagesDir: staged?.dir, akmEnv });
  const configFile = join(dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`${NAME} (${corpus}): ${tasks.length} of ${Object.keys(lock.tasks).length} tasks x 2 arms x ${attempts} = ${tasks.length * 2 * attempts} trials, ${CONCURRENT_TRIALS} at a time`);

  const exit = await runHarbor(configFile, join(dir, "harbor.log"), ctx.env);
  if (!existsSync(join(dir, "jobs", jobName(corpus)))) fail(`Harbor wrote no job (exit ${exit}). See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  const summary = summarize({ corpus, label: ctx.label, model: ctx.model, limit: ctx.limit, lock, tasks, dir, exit, attempts, arm, akmEnv, packages: staged?.files, library, job: jobRecord(cfg, dir, ROOT) });
  printSummary(summary);
  if (exit !== 0) fail(`Harbor exited ${exit}. The results above cover the trials that finished.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; corpus?: string; limit?: string; attempts?: string; repeat?: string; label?: string; akm?: string; "akm-env"?: string[]; help?: boolean };
  try {
    values = parseArgs({
      args: Bun.argv.slice(2),
      options: { corpus: { type: "string" }, limit: { type: "string" }, attempts: { type: "string" }, repeat: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } },
      strict: true,
    }).values;
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
  const limit = positive("--limit", values.limit);
  const attempts = positive("--attempts", values.attempts) ?? DEFAULT_ATTEMPTS;
  const repeat = positive("--repeat", values.repeat);
  const akmEnv = parseAkmEnv(values["akm-env"]);
  parseAkm(values.akm); // a bad --akm stops the run now, before Docker is asked about and a checkout is packed
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];
  for (const c of corpora) {
    if (!existsSync(libraryOf(c))) fail(`the ${c} library is missing (${relative(ROOT, libraryOf(c))}).${c === "private" ? " Make it with: ./generate-assets --only retrieval" : ""}`);
  }
  const { model, env } = preflight(values);
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-")); // where a checkout is packed. Each run keeps a copy of the tarballs
  try {
    const { arm, note } = akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    const ctx = { model, env, limit, attempts, arm, akmEnv };
    const summaries: Summary[] = [];
    for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel }))));
    if (summaries.length === 2 && repeat === undefined) for (const line of ["", ...sideBySide(summaries[0], summaries[1])]) console.log(line);
  } finally {
    rmSync(packs, { recursive: true, force: true });
  }
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
