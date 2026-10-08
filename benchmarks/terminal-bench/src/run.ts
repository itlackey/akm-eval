#!/usr/bin/env bun
// terminal-bench: runs the tasks of Terminal-Bench 2.1 with opencode alone and with opencode plus the akm plugin, in
// Harbor, and reports how often each passes and whether the agent called akm. See ../README.md.
//
//   benchmarks/terminal-bench/run [--corpus public|private|all] [--limit N] [--label NAME]

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CONCURRENT_TRIALS, Fatal, PINS, fail, gitCommit, jobConfig as harborJob, preflight, runHarbor, slug } from "../../../lib/harbor/harbor.ts";
import { type Report, type Trial, buildReport, formatReport, loadTrials, sideBySide as sideBySideOf } from "../../../lib/harbor/report.ts";
import { makeResultsDir } from "../../../lib/results.ts";

const NAME = "terminal-bench";
const BENCH_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(BENCH_DIR, "..", "..");

const ATTEMPTS = 1; // per task and arm
const LIBRARY = "library"; // the library's folder in what the akm arm uploads, and so its AKM_TASK_STASH
export const LIBRARY_ASSETS = 259; // what akm 0.9.26 indexes in corpus/library (317 files) and in its private copy

const USAGE = `Usage: benchmarks/terminal-bench/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs the tasks of Terminal-Bench 2.1 once with opencode alone and once with opencode plus the akm plugin, in Harbor,
on the model in MODEL_NAME. Settings come from .env at the repository root. Harbor fetches the tasks at run time.

  --corpus  which library the akm arm gets. public (default): corpus/library. private: its private copy, made by
            ./generate-assets --only retrieval. The tasks are the same. all runs both and prints the two results
            side by side.
  --label   names the results folder: <UTC date>-<label>. Default: the model name.
  --limit   run the first N tasks of an order that starts with Harbor's terminal-bench-sample (ten tasks) and goes on
            by name. Without it every task of the dataset runs.

Needs Docker, uv and bun. MODEL_NAME is the model as opencode names it, such as openai/gpt-6-luna. A name without a
provider is read as an openai model. The key goes in MODEL_API_KEY or OPENAI_API_KEY, and MODEL_BASE_URL sets another
endpoint, which a container must be able to reach.`;

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

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  pins: typeof PINS;
  dataset: { name: string; ref: string; source: string; licence: string; tasks_in_dataset: number; tasks_run_with_another_digest: string[] };
  library: { path: string; assets: number };
  limit: number | null;
  n_tasks: number;
  attempts: number;
  harbor_exit: number;
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
 * The Harbor job: the two arms on these tasks of the pinned dataset, one attempt each. The tasks are Harbor's and none
 * of them names a library, so the job names the one the akm arm seeds, for every task.
 */
export function jobConfig(o: { name: string; model: string; lock: Lock; tasks: string[]; librariesDir: string; jobsDir: string }): Record<string, unknown> {
  const org = o.lock.registry.split("/")[0];
  return harborJob({
    name: o.name,
    model: o.model,
    jobsDir: o.jobsDir,
    attempts: ATTEMPTS,
    librariesDir: o.librariesDir,
    datasets: [{ name: o.lock.registry, ref: o.lock.ref, task_names: o.tasks.map((t) => `${org}/${t}`) }],
    akm: { env: { AKM_TASK_STASH: LIBRARY }, kwargs: { library_assets: LIBRARY_ASSETS } },
  });
}

/** The tasks some trial ran with a digest other than the lock's: the dataset was not the pinned one. */
export function otherDigests(trials: Trial[], lock: Pick<Lock, "tasks">): string[] {
  return [...new Set(trials.filter((t) => t.digest != null && t.digest !== lock.tasks[t.task]).map((t) => t.task))].sort();
}

function printSummary(s: Summary): void {
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm-cli ${s.pins.akm_cli}, plugin ${s.pins.akm_plugin}, opencode ${s.pins.opencode}, harbor ${s.pins.harbor}`);
  console.log(`  ${s.dataset.name} ${s.dataset.ref.slice(0, 19)}, ${s.n_tasks} of ${s.dataset.tasks_in_dataset} tasks, ${s.attempts} ${s.attempts === 1 ? "attempt" : "attempts"} per arm, akm arm library: ${s.library.path}`);
  if (s.dataset.tasks_run_with_another_digest.length) console.log(`  WARNING: these tasks ran with a digest other than the lock's: ${s.dataset.tasks_run_with_another_digest.join(", ")}`);
  for (const line of formatReport(s.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
export const sideBySide = (a: Pick<Summary, "corpus" | "report">, b: Pick<Summary, "corpus" | "report">): string[] => sideBySideOf(NAME, a, b);

const jobName = (corpus: Corpus): string => `${NAME}-${corpus}`;

/** What a run says about itself, from the trials Harbor left in `dir`. Writes summary.json and samples.jsonl there. */
export function summarize(o: { corpus: Corpus; label: string; model: string; limit?: number; lock: Lock; tasks: string[]; dir: string; exit: number }): Summary {
  const trials: Trial[] = loadTrials(join(o.dir, "jobs", jobName(o.corpus)));
  const summary: Summary = {
    eval: NAME,
    corpus: o.corpus,
    label: o.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    model: o.model,
    pins: PINS,
    dataset: { name: o.lock.registry, ref: o.lock.ref, source: o.lock.source, licence: o.lock.licence, tasks_in_dataset: Object.keys(o.lock.tasks).length, tasks_run_with_another_digest: otherDigests(trials, o.lock) },
    library: { path: relative(ROOT, libraryOf(o.corpus)), assets: LIBRARY_ASSETS },
    limit: o.limit ?? null,
    n_tasks: o.tasks.length,
    attempts: ATTEMPTS,
    harbor_exit: o.exit,
    report: buildReport(trials),
    results_dir: o.dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(o.dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(join(o.dir, "samples.jsonl"), trials.map((t) => `${JSON.stringify(t)}\n`).join(""));
  return summary;
}

/** Where a corpus's runs go: results/ here, or private/terminal-bench/results/. */
const resultsOf = (corpus: Corpus): string => (corpus === "public" ? join(BENCH_DIR, "results") : join(ROOT, "private", NAME, "results"));

export async function runCorpus(corpus: Corpus, ctx: { model: string; label: string; limit?: number; env: Record<string, string> }, results = resultsOf(corpus)): Promise<Summary> {
  const lock = readLock();
  const tasks = selectTasks(lock, ctx.limit);
  const dir = makeResultsDir(results, ctx.label);
  const librariesDir = join(dir, "libraries");
  cpSync(libraryOf(corpus), join(librariesDir, LIBRARY), { recursive: true }); // what the akm arm seeds, kept with the run
  const configFile = join(dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(jobConfig({ name: jobName(corpus), model: ctx.model, lock, tasks, librariesDir, jobsDir: join(dir, "jobs") }), null, 2)}\n`);
  console.log(`${NAME} (${corpus}): ${tasks.length} of ${Object.keys(lock.tasks).length} tasks x 2 arms x ${ATTEMPTS} = ${tasks.length * 2 * ATTEMPTS} trials, ${CONCURRENT_TRIALS} at a time`);

  const exit = await runHarbor(configFile, join(dir, "harbor.log"), ctx.env);
  if (!existsSync(join(dir, "jobs", jobName(corpus)))) fail(`Harbor wrote no job (exit ${exit}). See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  const summary = summarize({ corpus, label: ctx.label, model: ctx.model, limit: ctx.limit, lock, tasks, dir, exit });
  printSummary(summary);
  if (exit !== 0) fail(`Harbor exited ${exit}. The results above cover the trials that finished.`, 1);
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
    if (!existsSync(libraryOf(c))) fail(`the ${c} library is missing (${relative(ROOT, libraryOf(c))}).${c === "private" ? " Make it with: ./generate-assets --only retrieval" : ""}`);
  }
  const { model, env } = preflight();
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(await runCorpus(c, { model, label, limit, env }));
  if (summaries.length === 2) for (const line of ["", ...sideBySide(summaries[0], summaries[1])]) console.log(line);
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
