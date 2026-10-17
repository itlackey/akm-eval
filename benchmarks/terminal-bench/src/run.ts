#!/usr/bin/env bun
// terminal-bench: runs the tasks of Terminal-Bench 2.1 with opencode alone and with opencode plus the akm plugin, in
// Harbor, and reports how often each passes and whether the agent called akm. See ../README.md.
//
//   benchmarks/terminal-bench/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--attempts N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Fatal, fail, gitCommit, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import {
  AKM_ARM_OPTIONS,
  type AkmArm,
  type Completion,
  type Pins,
  akmArm,
  akmArmUsage,
  akmSummary,
  assetsSha256,
  completionOf,
  jobRecord,
  loadRunTrials,
  parseAkm,
  parseAkmEnv,
  pinsOf,
  positive,
  preflight,
  releaseArm,
  runHarbor,
  sha256Dir,
  buildFingerprint,
  statusOf,
} from "../../../lib/harbor/harbor.ts";
import { type Report, type Trial, formatReport, sideBySide as sideBySideOf } from "../../../lib/harbor/report.ts";
import { type RunTrial, makeRow, summarize as scoreRows } from "../../../lib/harbor/score.ts";
import { type RunManifest, buildManifest, caseDigests, completionOf as casesCompletion, corpusFolderOf } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, type ModelLimits } from "../../../lib/models.ts";
import { canonical, endpointHost, redactConfig, sha256File } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir, markRunning, clearRunning } from "../../../lib/results.ts";
import { DEFAULT_ATTEMPTS, type LibraryCount, type Lock, NAME, type Collected, collect, jobConfig, jobName, readLock } from "./collect.ts";
import { MEASUREMENT, caseOf } from "./measurement.ts";

const BENCH_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(BENCH_DIR, "..", "..");

const USAGE = `Usage: benchmarks/terminal-bench/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--attempts N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs the tasks of Terminal-Bench 2.1 with opencode alone and with opencode plus the akm plugin, in Harbor, on the model
in MODEL_NAME. Settings come from .env at the repository root. Harbor fetches the tasks at run time.

${corpusUsage}
              Only the library the akm arm gets differs, and the tasks are the same. public is corpus/library. custom is the
              library/ of private/retrieval/assets (the private copy of it, made by ./generate-assets --only retrieval), or of
              --cases DIR, a folder in the format evals/retrieval reads.
  --model     the model: a line of models.json, or a model as the gateway names it, as opencode takes it (openai/gpt-6-luna;
              a name without a provider is an openai model). Default: MODEL_NAME in .env.
  --label     names the results folder: <UTC date>-<label>. Default: the model name.
  --limit     run the first N tasks of an order that starts with Harbor's terminal-bench-sample (ten tasks) and goes on
              by name. Without it every task of the dataset runs.
  --concurrency N  simultaneous trials (default 4), recorded in the job
  --resume DIR     continue an interrupted run with the same inputs and settings
  --attempts  run each task N times per arm (default ${DEFAULT_ATTEMPTS}). The pass rate of a task is then the share of its attempts passed.
  --repeat    run the whole benchmark N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
              <UTC date>-<label>-repeat-summary.json beside them
${akmArmUsage}

Needs Docker, uv and bun. MODEL_NAME is the model as opencode names it, such as openai/gpt-6-luna. A name without a
provider is read as an openai model. The key goes in MODEL_API_KEY (or OPENAI_API_KEY), and MODEL_BASE_URL sets another
endpoint, which a container must be able to reach. Only the variables Harbor needs and the model's reach it.`;

interface Summary {
  eval: string;
  /** `public` or `custom`. */
  corpus: string;
  /** The folder of a custom corpus from the repository root (corpusFolderOf in lib/manifest.ts), which scripts/rescore reads the library from. Null for a public run, and for a folder outside the repository, whose path is not written down: rescore then takes --cases DIR. */
  corpus_folder: string | null;
  label: string;
  date: string;
  git_commit: string;
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
  dataset: { name: string; ref: string; source: string; licence: string; tasks_in_dataset: number; tasks_run_with_another_digest: string[] };
  library: LibraryCount & { path: string; sha256: string | null };
  limit: number | null;
  /** The seed of a rewritten library, null for the public one and for one of your own. */
  seed: string | null;
  n_tasks: number;
  attempts: number;
  harbor_exit: number;
  /** `complete` when Harbor exited 0 and every cell of the grid has a trial, `aborted` otherwise (see aborted_reason). An aborted run keeps all its artifacts, and its numbers cover the trials that finished. */
  status: "running" | "complete" | "aborted";
  harbor_config_sha256?: string | null;
  resumed?: boolean;
  aborted_reason: string | null;
  /** The grid the job asked for, tasks x arms x attempts, and what became of each cell: overall and per arm. */
  completion: Completion;
  /** One digest over the library's digest, the pinned dataset (its digest and the digest of each selected task) and the attempts: the cases the run scored. */
  assets_sha256: string;
  /** The model and the host of the endpoint it was sent to (scheme, host and port, null for the provider's own). Never the path, never a key. */
  engine: { model: string; endpoint: string | null };
  /** The Harbor job as `job` has it, with every apiKey, api_key, token and secret redacted. */
  config: Record<string, unknown>;
  /** Trials that hit a time limit, by arm. They are counted among the errors too when they got no reward. */
  timeouts: { control: number; akm: number };
  n_errored: number;
  /** The report's main numbers, as numbers, for --repeat's spread. */
  metrics: ReturnType<typeof scoreRows>["metrics"];
  /** The Harbor job that ran: attempts, concurrency, setup time, the agents with their options and the datasets. */
  job: Record<string, unknown>;
  report: Report;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

/**
 * The tasks a run uses. Without a limit, all of them. With one, the first N of an order that starts with the ten tasks
 * of Harbor's sample, so `--limit 10` is that sample, and goes on with the others by name.
 */
export function selectTasks(lock: Pick<Lock, "sample" | "tasks">, limit?: number): string[] {
  const rest = Object.keys(lock.tasks).filter((t) => !lock.sample.includes(t)).sort();
  return [...lock.sample, ...rest].slice(0, limit);
}

/** The library the akm arm gets: the public one, corpus/library, or the library/ of a custom corpus, which evals/retrieval makes or you do. */
export const libraryOf = (c: ResolvedCorpus): string => join(c.folder, "library");

/** The tasks some trial ran with a digest other than the lock's: the dataset was not the pinned one. */
export function otherDigests(trials: Trial[], lock: Pick<Lock, "tasks">): string[] {
  return [...new Set(trials.filter((t) => t.digest != null && t.digest !== lock.tasks[t.task]).map((t) => t.task))].sort();
}

function printSummary(s: Summary): void {
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm-cli ${s.pins.akm_cli}, plugin ${s.pins.akm_plugin}, opencode ${s.pins.opencode}, harbor ${s.pins.harbor}`);
  console.log(`  akm          ${s.akm_bin}${s.akm_build ? ` at ${s.akm_build}` : ""}${Object.keys(s.akm_env).length ? `, ${Object.entries(s.akm_env).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}`);
  console.log(`  ${s.dataset.name} ${s.dataset.ref.slice(0, 19)}, ${s.n_tasks} of ${s.dataset.tasks_in_dataset} tasks, ${s.attempts} ${s.attempts === 1 ? "attempt" : "attempts"} per arm, akm arm library: ${s.library.path} (${s.library.assets === null ? "assets not counted" : `${s.library.assets} assets`})`);
  const c = s.completion;
  console.log(`  trials       ${c.expected} expected: ${c.completed} completed, ${c.failed} failed, ${c.missing} missing${c.unexpected ? `, ${c.unexpected} outside the grid` : ""}`);
  if (s.status === "aborted") console.log(`  ABORTED      ${s.aborted_reason}`);
  if (s.dataset.tasks_run_with_another_digest.length) console.log(`  WARNING: these tasks ran with a digest other than the lock's: ${s.dataset.tasks_run_with_another_digest.join(", ")}`);
  for (const line of formatReport(s.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
export const sideBySide = (a: Pick<Summary, "corpus" | "report">, b: Pick<Summary, "corpus" | "report">): string[] => sideBySideOf(NAME, a, b);

/**
 * What a run says about itself, from the trials Harbor left in `dir`. Writes summary.json and samples.jsonl there. `arm`, `akmEnv`,
 * `packages`, `library` and `job` are what the run was made of, which the caller knows and the trials do not.
 */
export function summarize(o: {
  corpus: ResolvedCorpus;
  label: string;
  model: string;
  limit?: number;
  lock: Lock;
  tasks: string[];
  dir: string;
  exit: number;
  running?: boolean;
  resumed?: boolean;
  attempts?: number;
  arm?: AkmArm;
  akmEnv?: Record<string, string>;
  packages?: { file: string; sha256: string }[];
  library?: LibraryCount & { sha256: string | null };
  /** The host of the endpoint the model was sent to, null for the provider's own. */
  endpoint?: string | null;
  job?: Record<string, unknown>;
}): Summary {
  const jobDir = join(o.dir, "jobs", jobName(o.corpus.name));
  const { trials, observed } = loadRunTrials(jobDir); // none when Harbor made no job: every cell is then missing, and the run is aborted
  const arm = o.arm ?? releaseArm();
  const akmEnv = o.akmEnv ?? {};
  const attempts = o.attempts ?? DEFAULT_ATTEMPTS;
  const completion = completionOf(trials, o.tasks, attempts);
  const { status, aborted_reason } = statusOf(o.exit, completion, existsSync(jobDir), observed);
  const dataset = { registry: o.lock.registry, ref: o.lock.ref, tasks: Object.fromEntries(o.tasks.map((t) => [t, o.lock.tasks[t] ?? null])) };

  // One row per task, with its trials: the raw output a stored run is scored again from.
  const byTask = new Map<string, RunTrial[]>();
  for (const t of trials) byTask.set(t.task, [...(byTask.get(t.task) ?? []), t]);
  const rows = [...byTask].map(([id, ts]) => makeRow({ id }, { trials: ts }));
  const scored = scoreRows(rows);

  const akmFields = akmSummary(arm, akmEnv, o.packages ?? [], observed);
  const endpoint = o.endpoint ?? null;
  const { datasets: _datasets, n_attempts: _attempts, ...jobSettings } = o.job ?? {}; // the tasks and the attempts are the cases and the hint below
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: o.corpus.name,
    // what each task presented to the agent: the task as the pinned dataset has it, and the library the akm arm seeded
    cases: caseDigests(MEASUREMENT, o.tasks.map((id) => caseOf(id, o.lock.tasks[id], o.library?.sha256))),
    akm: { version: arm.cli.version, bin: arm.bin, build: arm.build, build_fingerprint: akmFields.akm_build_fingerprint },
    config: jobSettings,
    engines: { opencode: { model: o.model, endpoint, temperature: null, enableThinking: null, timeoutMs: null } },
    settings: { seed: o.corpus.seed },
    // attempts decide how much a task's pass rate says: a run of three is not compared with a run of one
    treatment_hints: { attempts },
    completion: casesCompletion(MEASUREMENT, o.tasks, rows),
  });
  const summary: Summary = {
    eval: NAME,
    corpus: o.corpus.name,
    corpus_folder: o.corpus.name === "custom" ? corpusFolderOf(o.corpus.folder) : null,
    label: o.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),

    model: o.model,
    ...akmFields,
    pins: pinsOf(arm),
    dataset: { name: o.lock.registry, ref: o.lock.ref, source: o.lock.source, licence: o.lock.licence, tasks_in_dataset: Object.keys(o.lock.tasks).length, tasks_run_with_another_digest: otherDigests(trials, o.lock) },
    library: { path: relative(ROOT, libraryOf(o.corpus)), assets: o.library?.assets ?? null, measured_with: o.library?.measured_with ?? null, sha256: o.library?.sha256 ?? null },
    limit: o.limit ?? null,
    seed: o.corpus.seed,
    n_tasks: o.tasks.length,
    attempts,
    harbor_exit: o.exit,
    status: o.running ? "running" : status,
    aborted_reason: o.running ? null : aborted_reason,
    ...(o.resumed ? { resumed: true } : {}),
    harbor_config_sha256: existsSync(join(jobDir, "config.json")) ? sha256File(join(jobDir, "config.json")) : null,
    completion,
    assets_sha256: assetsSha256({ library: o.library?.sha256 ?? null, dataset, attempts }),
    engine: { model: o.model, endpoint },
    config: redactConfig(o.job ?? {}),
    timeouts: scored.timeouts,
    n_errored: scored.n_errored,
    metrics: scored.metrics,
    job: o.job ?? {},
    report: scored.report,
    manifest,
    results_dir: o.dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(o.dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(join(o.dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return summary;
}

/** Where a corpus's runs go: results/ here, or private/terminal-bench/results/. */
const resultsOf = (c: ResolvedCorpus): string => (c.name === "public" ? join(BENCH_DIR, "results") : join(ROOT, "private", NAME, "results"));

export async function runCorpus(
  c: ResolvedCorpus,
  ctx: { model: string; modelLimits?: ModelLimits; concurrency?: number; resume?: string; label: string; limit?: number; env: Record<string, string>; attempts?: number; arm?: AkmArm; akmEnv?: Record<string, string> },
  results = resultsOf(c),
): Promise<Summary> {
  const lock = readLock();
  const prior: Summary | null = ctx.resume ? JSON.parse(readFileSync(join(resolve(ctx.resume), "summary.json"), "utf8")) : null;
  const tasks = selectTasks(lock, ctx.limit ?? prior?.limit ?? undefined);
  const attempts = ctx.attempts ?? prior?.attempts ?? DEFAULT_ATTEMPTS;
  const arm = ctx.arm ?? releaseArm();
  const akmEnv = ctx.akmEnv ?? {};
  const dir = ctx.resume ? resolve(ctx.resume) : makeResultsDir(results, ctx.label);
  const save = (got: Collected, running = false) => summarize({ corpus: c, label: prior?.label ?? ctx.label, model: ctx.model, limit: ctx.limit ?? prior?.limit ?? undefined, lock, tasks, dir, exit: got.exit, running, resumed: prior !== null, attempts, arm, akmEnv, packages: got.staged?.files ?? prior?.akm_install.packages, library: got.library, endpoint: endpointHost(ctx.env.OPENAI_BASE_URL), job: jobRecord(got.cfg, dir, ROOT) });
  let got: Collected;
  if (prior) {
    const cfg = JSON.parse(readFileSync(join(dir, "job.json"), "utf8"));
    const jobDir = join(dir, "jobs", jobName(c.name));
    const wanted = jobConfig({ name: jobName(c.name), model: ctx.model, modelLimits: ctx.modelLimits,
      concurrency: ctx.concurrency ?? cfg.n_concurrent_trials, lock, tasks, attempts, jobsDir: join(dir, "jobs"),
      librariesDir: join(dir, "libraries"), arm, akmEnv, libraryAssets: cfg.agents[1].kwargs.library_assets,
      packagesDir: arm.cli.tarball || arm.plugin.tarball ? join(dir, "akm-packages") : null });
    if (prior.corpus !== c.name || prior.model !== ctx.model ||
      prior.akm_bin !== arm.bin || prior.akm_build !== arm.build ||
      prior.akm_build_fingerprint !== buildFingerprint(arm.build_fingerprint ?? null, prior.akm_install.dependency_tree_sha256) ||
      canonical(prior.manifest.cases) !== canonical(caseDigests(MEASUREMENT, tasks.map(id => caseOf(id, lock.tasks[id], prior.library.sha256)))) ||
      prior.engine.endpoint !== endpointHost(ctx.env.OPENAI_BASE_URL) || canonical(cfg) !== canonical(wanted) ||
      prior.library.sha256 !== sha256Dir(libraryOf(c)) || !prior.harbor_config_sha256 ||
      prior.harbor_config_sha256 !== sha256File(join(jobDir, "config.json")))
      fail("--resume must use the original corpus, library, model, model limits, AKM settings and unmodified Harbor job; start a fresh run for changed settings");
    markRunning(dir);
    console.log(`${NAME}: resuming ${dir}; completed Harbor trials are reused`);
    got = { cfg, staged: null, library: { ...prior.library, sha256: prior.library.sha256! }, exit: 130 };
    save(got, true);
    got.exit = await runHarbor(join(dir, "job.json"), join(dir, "harbor.log"), ctx.env, { resume: jobDir });
  } else {
    got = await collect({ corpus: c.name, library: libraryOf(c), lock, tasks, attempts, dir, model: ctx.model, modelLimits: ctx.modelLimits, concurrency: ctx.concurrency, env: ctx.env, arm, akmEnv, onReady: prepared => { save(prepared, true); } });
  }
  const summary = save(got);
  clearRunning(dir);
  printSummary(summary);
  if (summary.status === "aborted") fail(`${summary.aborted_reason}. The results above cover the trials that finished. See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  return summary;
}

/** Why a corpus cannot be used, in a sentence that says what to do, or undefined when it can. */
function corpusProblem(c: ResolvedCorpus): string | undefined {
  const where = relative(ROOT, libraryOf(c));
  return existsSync(libraryOf(c)) ? undefined : `the ${c.name} library is missing (${where}).${c.rewrite ? " Make it with: ./generate-assets --only retrieval" : ""}`;
}

async function main(): Promise<void> {
  let values: { model?: string; corpus?: string; cases?: string; limit?: string; attempts?: string; repeat?: string; label?: string; akm?: string; "akm-env"?: string[]; semantic?: boolean; resume?: string; concurrency?: string; help?: boolean };
  try {
    values = parseArgs({
      args: Bun.argv.slice(2),
      options: { ...CORPUS_OPTIONS, limit: { type: "string" }, attempts: { type: "string" }, repeat: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, resume: { type: "string" }, concurrency: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } },
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
  // The custom library is the retrieval eval's, so it is resolved as retrieval's corpus is: private/retrieval/assets, or --cases DIR.
  const corpora = resolveCorpora({ eval: "retrieval", values, publicFolder: join(ROOT, "corpus"), fail });
  const limit = positive("--limit", values.limit);
  const attempts = positive("--attempts", values.attempts) ?? DEFAULT_ATTEMPTS;
  const repeat = positive("--repeat", values.repeat);
  const concurrency = positive("--concurrency", values.concurrency);
  if (values.resume && (corpora.length !== 1 || repeat !== undefined)) fail("--resume carries on one corpus and does not go with --repeat");
  const akmEnv = parseAkmEnv(values["akm-env"], values.semantic);
  parseAkm(values.akm); // a bad --akm stops the run now, before Docker is asked about and a checkout is packed
  for (const c of corpora) {
    const problem = corpusProblem(c);
    if (problem) fail(problem);
  }
  const { model, env, modelLimits } = preflight(values);
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, [{ role: "model", name: model, baseUrl: env.OPENAI_BASE_URL }]);

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-")); // where a checkout is packed. Each run keeps a copy of the tarballs
  try {
    const { arm, note } = akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    const ctx = { model, modelLimits, env, limit, attempts: values.attempts === undefined ? undefined : attempts, arm, akmEnv, concurrency, resume: values.resume };
    const summaries: Summary[] = [];
    for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel }))));
    if (summaries.length === 2 && repeat === undefined) for (const line of ["", ...sideBySide(summaries[0] as Summary, summaries[1] as Summary)]) console.log(line);
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
