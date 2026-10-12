#!/usr/bin/env bun
// agent-ab: runs the same tasks with opencode alone and with opencode plus the akm plugin, in Harbor, and reports
// how often each passes and whether the agent called akm. See ../README.md.
//
//   evals/agent-ab/run [--corpus public|private|all] [--limit N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Fatal, fail, gitCommit, slug } from "../../../lib/cli.ts";
import {
  AKM_ARM_OPTIONS,
  CONCURRENT_TRIALS,
  type AkmArm,
  type Completion,
  type Pins,
  akmArm,
  akmArmUsage,
  akmSummary,
  assetsSha256,
  completionOf,
  endpointOf,
  erroredOf,
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
  stagePackages,
  statusOf,
  timeoutsOf,
} from "../../../lib/harbor/harbor.ts";
import { type Report, buildReport, formatReport, sideBySide as sideBySideOf } from "../../../lib/harbor/report.ts";
import { MODEL_OPTIONS } from "../../../lib/models.ts";
import { harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { privateAssetsProblem, taskNames } from "./inputs.ts";

export { taskNames };

const NAME = "agent-ab";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);

const ATTEMPTS = 3; // per task and arm in a full run. A run with --limit makes one, to check a setup.

const USAGE = `Usage: evals/agent-ab/run [--corpus public|private|all] [--limit N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs each task with opencode alone and with opencode plus the akm plugin, in Harbor, on the model in MODEL_NAME.
Settings come from .env at the repository root.

  --corpus  public (default) reads tasks/ and libraries/. private reads private/agent-ab/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run N tasks, once per arm, spread over the task families. Without it every task runs ${ATTEMPTS} times per arm.
  --repeat  run the eval N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
  --model   the model: a line of models.json, or a model as the gateway names it, as opencode takes it (openai/gpt-6-luna;
            a name without a provider is an openai model). Default: MODEL_NAME in .env.
  --label   names the results folder: <UTC date>-<label>. Default: the model name.
${akmArmUsage}

Needs Docker, uv and bun. MODEL_NAME is the model as opencode names it, such as openai/gpt-6-luna. A name without a
provider is read as an openai model. The key goes in MODEL_API_KEY (or OPENAI_API_KEY), and MODEL_BASE_URL sets another
endpoint, which a container must be able to reach. Only the variables Harbor needs and the model's reach it.`;

type Corpus = "public" | "private";

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string;
  akm_version: string;
  /** What `--akm` named, with the home folder as ~: akm-cli@x.y.z or the checkout's folder. akm_build is the checkout's git describe, null for a release. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  akm_env: Record<string, string>;
  akm_install: ReturnType<typeof akmSummary>["akm_install"];
  pins: Pins;
  limit: number | null;
  n_tasks: number;
  attempts: number;
  harbor_exit: number;
  /** `complete` when Harbor exited 0 and every cell of the grid has a trial, `aborted` otherwise (see aborted_reason). An aborted run keeps all its artifacts, and its numbers cover the trials that finished. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  /** The grid the job asked for, tasks x arms x attempts, and what became of each cell: overall and per arm. */
  completion: Completion;
  /** A digest of every file of the libraries folder the akm arm seeds from: the run's copy of it, digested before Harbor started. */
  libraries_sha256: string;
  /** A digest of the folder of each task the run used: the run's copy of it, digested before Harbor started. */
  tasks_sha256: Record<string, string>;
  /** One digest over the libraries digest, the digest of each selected task and the attempts: the cases the run scored. */
  assets_sha256: string;
  /** The model and the identity of the endpoint it was sent to: scheme, host, port and path (null for the provider's own). Never a key. */
  engine: { model: string; endpoint: string | null };
  /** The Harbor job as `job` has it, with every apiKey, api_key, token and secret redacted. */
  config: Record<string, unknown>;
  /** Trials that hit a time limit, by arm. They are counted among the errors too when they got no reward. */
  timeouts: { control: number; akm: number };
  n_errored: number;
  /** The report's main numbers, as numbers, for --repeat's spread. */
  metrics: ReturnType<typeof metricsOf>;
  /** The Harbor job that ran: the tasks it ran (datasets), attempts, concurrency, setup time and the agents with their options. */
  job: Record<string, unknown>;
  report: Report;
  results_dir: string;
}

/**
 * The tasks a run uses. Without a limit, all of them. With one, N tasks taken from the families in turn (a task's
 * family is the name before `--`), each family in name order, so a short run holds as many families as it can.
 */
export function selectTasks(names: string[], limit?: number): string[] {
  if (limit === undefined || limit >= names.length) return names;
  const families = new Map<string, string[]>();
  for (const n of names) families.set(n.split("--")[0], [...(families.get(n.split("--")[0]) ?? []), n]);
  const picked: string[] = [];
  for (let round = 0; picked.length < limit; round++) {
    for (const list of families.values()) if (list[round] !== undefined && picked.length < limit) picked.push(list[round]);
  }
  return picked;
}

/** The Harbor job: the two arms on the same tasks. See lib/harbor/harbor.ts. The akm arm seeds the library each task names. */
export function jobConfig(o: { name: string; model: string; tasksDir: string; tasks: string[]; librariesDir: string; attempts: number; jobsDir: string; arm?: AkmArm; packagesDir?: string | null; akmEnv?: Record<string, string> }): Record<string, unknown> {
  return harborJob({ name: o.name, model: o.model, jobsDir: o.jobsDir, attempts: o.attempts, librariesDir: o.librariesDir, datasets: [{ path: o.tasksDir, task_names: o.tasks }], arm: o.arm, packagesDir: o.packagesDir, akmEnv: o.akmEnv });
}

function printSummary(s: Summary): void {
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm-cli ${s.pins.akm_cli}, plugin ${s.pins.akm_plugin}, opencode ${s.pins.opencode}, harbor ${s.pins.harbor}`);
  console.log(`  akm          ${s.akm_bin}${s.akm_build ? ` at ${s.akm_build}` : ""}${Object.keys(s.akm_env).length ? `, ${Object.entries(s.akm_env).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}`);
  console.log(`  ${s.n_tasks} tasks, ${s.attempts} ${s.attempts === 1 ? "attempt" : "attempts"} per arm`);
  const c = s.completion;
  console.log(`  trials       ${c.expected} expected: ${c.completed} completed, ${c.failed} failed, ${c.missing} missing${c.unexpected ? `, ${c.unexpected} outside the grid` : ""}`);
  if (s.status === "aborted") console.log(`  ABORTED      ${s.aborted_reason}`);
  for (const line of formatReport(s.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
export const sideBySide = (a: Pick<Summary, "corpus" | "report">, b: Pick<Summary, "corpus" | "report">): string[] => sideBySideOf(NAME, a, b);

/** Where a corpus's runs go: results/ here, or private/agent-ab/results/. */
const resultsOf = (corpus: Corpus): string => (corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"));

export async function runCorpus(
  corpus: Corpus,
  ctx: { model: string; label: string; limit?: number; env: Record<string, string>; arm?: AkmArm; akmEnv?: Record<string, string> },
  results = resultsOf(corpus),
): Promise<Summary> {
  const assets = corpus === "public" ? EVAL_DIR : join(ROOT, "private", NAME, "assets");
  const all = taskNames(join(assets, "tasks"));
  const tasks = selectTasks(all, ctx.limit);
  const attempts = ctx.limit === undefined ? ATTEMPTS : 1;
  const dir = makeResultsDir(results, ctx.label);
  // Harbor reads the run's own copy of the tasks and the libraries, which is digested before it starts: an edit to the live folders while
  // the run goes is neither what the trials used nor what the summary records.
  const tasksDir = join(dir, "tasks");
  const librariesDir = join(dir, "libraries");
  for (const t of tasks) cpSync(join(assets, "tasks", t), join(tasksDir, t), { recursive: true });
  cpSync(join(assets, "libraries"), librariesDir, { recursive: true });
  const taskDigests = Object.fromEntries(tasks.map((t) => [t, sha256Dir(join(tasksDir, t))]));
  const librariesSha = sha256Dir(librariesDir);
  const jobsDir = join(dir, "jobs");
  const jobName = `${NAME}-${corpus}`;
  const arm = ctx.arm ?? releaseArm();
  const akmEnv = ctx.akmEnv ?? {};
  const staged = stagePackages(arm, dir); // the tarballs of a checkout, kept with the run
  const cfg = jobConfig({ name: jobName, model: ctx.model, tasksDir, tasks, librariesDir, attempts, jobsDir, arm, packagesDir: staged?.dir, akmEnv });
  const configFile = join(dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`${NAME} (${corpus}): ${tasks.length} of ${all.length} tasks x 2 arms x ${attempts} = ${tasks.length * 2 * attempts} trials, ${CONCURRENT_TRIALS} at a time`);

  const exit = await runHarbor(configFile, join(dir, "harbor.log"), ctx.env);
  const jobDir = join(jobsDir, jobName);
  const { trials, observed } = loadRunTrials(jobDir); // none when Harbor made no job: every cell is then missing, and the run is aborted
  const report = buildReport(trials);
  const completion = completionOf(trials, tasks, attempts);
  const { status, aborted_reason } = statusOf(exit, completion, existsSync(jobDir), observed);
  const job = jobRecord(cfg, dir, ROOT);
  const summary: Summary = {
    eval: NAME,
    corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    ...akmSummary(arm, akmEnv, staged?.files ?? [], observed),
    pins: pinsOf(arm),
    limit: ctx.limit ?? null,
    n_tasks: tasks.length,
    attempts,
    harbor_exit: exit,
    status,
    aborted_reason,
    completion,
    libraries_sha256: librariesSha,
    tasks_sha256: taskDigests,
    assets_sha256: assetsSha256({ library: librariesSha, dataset: { tasks: taskDigests }, attempts }),
    engine: { model: ctx.model, endpoint: endpointOf(ctx.env) },
    config: redactConfig(job),
    timeouts: timeoutsOf(trials),
    n_errored: erroredOf(report),
    metrics: metricsOf(report, trials),
    job,
    report,
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), trials.map((t) => `${JSON.stringify(t)}\n`).join(""));
  printSummary(summary);
  if (status === "aborted") fail(`${aborted_reason}. The results above cover the trials that finished. See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; corpus?: string; limit?: string; repeat?: string; label?: string; akm?: string; "akm-env"?: string[]; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, repeat: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`agent-ab: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "all") fail(`--corpus must be public, private or all, not "${corpus}"`);
  const limit = positive("--limit", values.limit);
  const repeat = positive("--repeat", values.repeat);
  const akmEnv = parseAkmEnv(values["akm-env"]);
  parseAkm(values.akm); // a bad --akm stops the run now, before Docker is asked about and a checkout is packed
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];
  for (const c of corpora) {
    // The private tasks are used only when their generated.json says they are the rewrite of the public ones as they are now, unchanged since.
    const problem = c === "private" ? privateAssetsProblem(join(ROOT, "private", NAME, "assets"), EVAL_DIR, `private/${NAME}/assets`) : undefined;
    if (problem) fail(problem);
  }
  const { model, env } = preflight(values);
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-")); // where a checkout is packed. Each run keeps a copy of the tarballs
  try {
    const { arm, note } = akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    const summaries: Summary[] = [];
    for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { model, label: runLabel, limit, env, arm, akmEnv }))));
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
    console.error(`agent-ab: ${e.message}`);
    process.exit(e.code);
  }
}
