#!/usr/bin/env bun
// agent-ab: runs the same tasks with opencode alone and with opencode plus the akm plugin, in Harbor, and reports
// how often each passes and whether the agent called akm. See ../README.md.
//
//   evals/agent-ab/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  endpointOf,
  jobRecord,
  parseAkm,
  parseAkmEnv,
  pinsOf,
  positive,
  preflight,
  releaseArm,
  statusOf,
} from "../../../lib/harbor/harbor.ts";
import { type Report, buildReport, formatReport, sideBySide as sideBySideOf } from "../../../lib/harbor/report.ts";
import { type RunTrial, makeRow, summarize } from "../../../lib/harbor/score.ts";
import { type RunManifest, buildManifest, caseDigests, completionOf as casesCompletion, corpusFolderOf } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS } from "../../../lib/models.ts";
import { harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { NAME, attemptsFor, collect, jobConfig } from "./collect.ts";
import { libraryOf, privateAssetsProblem, taskNames } from "./inputs.ts";
import { type Case, MEASUREMENT } from "./measurement.ts";

export { jobConfig, taskNames };

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);

const USAGE = `Usage: evals/agent-ab/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME] [--model NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs each task with opencode alone and with opencode plus the akm plugin, in Harbor, on the model in MODEL_NAME.
Settings come from .env at the repository root.

${corpusUsage}
            public reads tasks/ and libraries/ of this folder. custom reads private/agent-ab/assets/, made by ./generate-assets (the six
            tasks with made-up tools, rewritten from a seed), or the tasks/ and libraries/ of --cases DIR.
  --limit   run N tasks, once per arm, spread over the task families. Without it every task runs 3 times per arm.
  --repeat  run the eval N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
  --model   the model: a line of models.json, or a model as the gateway names it, as opencode takes it (openai/gpt-6-luna;
            a name without a provider is an openai model). Default: MODEL_NAME in .env.
  --label   names the results folder: <UTC date>-<label>. Default: the model name.
${akmArmUsage}

Needs Docker, uv and bun. MODEL_NAME is the model as opencode names it, such as openai/gpt-6-luna. A name without a
provider is read as an openai model. The key goes in MODEL_API_KEY (or OPENAI_API_KEY), and MODEL_BASE_URL sets another
endpoint, which a container must be able to reach. Only the variables Harbor needs and the model's reach it.`;

interface Summary {
  eval: string;
  /** `public` or `custom`. */
  corpus: string;
  /** For a custom corpus, `rewrite` (the public tasks rewritten from a seed) or `own`; `public` for the public one. */
  /** The folder of a custom corpus from the repository root (corpusFolderOf in lib/manifest.ts), which scripts/rescore reads the cases from. Null for a public run, and for a folder outside the repository, whose path is not written down: rescore then takes --cases DIR. */
  corpus_folder: string | null;
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
  /** The seed of a rewritten corpus, null for the public tasks and for a corpus of your own. */
  seed: string | null;
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
  /** The model and the endpoint it was sent to: its host (scheme, host and port, null for the provider's own) and `endpoint_id`, a digest of its identity. Never the path, never a key. */
  engine: { model: string; endpoint: string | null; endpoint_id: string | null };
  /** The Harbor job as `job` has it, with every apiKey, api_key, token and secret redacted. */
  config: Record<string, unknown>;
  /** Trials that hit a time limit, by arm. They are counted among the errors too when they got no reward. */
  timeouts: { control: number; akm: number };
  n_errored: number;
  /** The report's main numbers, as numbers, for --repeat's spread. */
  metrics: ReturnType<typeof summarize>["metrics"];
  /** The Harbor job that ran: the tasks it ran (datasets), attempts, concurrency, setup time and the agents with their options. */
  job: Record<string, unknown>;
  report: Report;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
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
const resultsOf = (c: ResolvedCorpus): string => (c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"));

export async function runCorpus(
  c: ResolvedCorpus,
  ctx: { model: string; label: string; limit?: number; env: Record<string, string>; arm?: AkmArm; akmEnv?: Record<string, string> },
  results = resultsOf(c),
): Promise<Summary> {
  const all = taskNames(join(c.folder, "tasks"));
  const tasks = selectTasks(all, ctx.limit);
  const attempts = attemptsFor(ctx.limit);
  const dir = makeResultsDir(results, ctx.label);
  const arm = ctx.arm ?? releaseArm();
  const akmEnv = ctx.akmEnv ?? {};
  const got = await collect({ corpus: c.name, assets: c.folder, tasks, of: all.length, attempts, dir, model: ctx.model, env: ctx.env, arm, akmEnv });
  const { trials, observed } = got; // none when Harbor made no job: every cell is then missing, and the run is aborted
  const completion = completionOf(trials, tasks, attempts);
  const { status, aborted_reason } = statusOf(got.exit, completion, existsSync(got.jobDir), observed);
  const job = jobRecord(got.cfg, dir, ROOT);

  // One row per task, with its trials: the raw output a stored run is scored again from.
  const byTask = new Map<string, RunTrial[]>();
  for (const t of trials) byTask.set(t.task, [...(byTask.get(t.task) ?? []), t]);
  const rows = [...byTask].map(([id, ts]) => makeRow({ id }, { trials: ts }));
  const scored = summarize(rows);

  // What each task presented to the agent: its folder and the library it seeds, as the run's own copy had them before Harbor started.
  const cases: Case[] = tasks.map((id) => {
    const library = libraryOf(join(dir, "tasks", id)) ?? null;
    return { id, library, task_sha256: got.taskDigests[id] as string, library_sha256: library === null ? null : got.libraryDigests[library] ?? null };
  });
  const akmFields = akmSummary(arm, akmEnv, got.staged?.files ?? [], observed);
  const { datasets: _datasets, n_attempts: _attempts, ...jobSettings } = job; // the tasks and the attempts are the cases and the hint below
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: c.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: arm.cli.version, bin: arm.bin, build: arm.build, build_fingerprint: akmFields.akm_build_fingerprint },
    config: jobSettings,
    engines: { opencode: { model: ctx.model, ...endpointOf(ctx.env), temperature: null, enableThinking: null, timeoutMs: null } },
    settings: { seed: c.seed },
    // attempts decide how much a task's pass rate says: a run of three is not compared with a run of one
    treatment_hints: { attempts },
    completion: casesCompletion(MEASUREMENT, tasks, rows),
  });
  const summary: Summary = {
    eval: NAME,
    corpus: c.name,
    corpus_folder: c.name === "custom" ? corpusFolderOf(c.folder) : null,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    ...akmFields,
    pins: pinsOf(arm),
    limit: ctx.limit ?? null,
    seed: c.seed,
    n_tasks: tasks.length,
    attempts,
    harbor_exit: got.exit,
    status,
    aborted_reason,
    completion,
    libraries_sha256: got.librariesSha,
    tasks_sha256: got.taskDigests,
    assets_sha256: assetsSha256({ library: got.librariesSha, dataset: { tasks: got.taskDigests }, attempts }),
    engine: { model: ctx.model, ...endpointOf(ctx.env) },
    config: redactConfig(job),
    timeouts: scored.timeouts,
    n_errored: scored.n_errored,
    metrics: scored.metrics,
    job,
    report: scored.report,
    manifest,
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  printSummary(summary);
  if (status === "aborted") fail(`${aborted_reason}. The results above cover the trials that finished. See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  return summary;
}

/** Why a corpus cannot be used, in a sentence that says what to do, or undefined when it can. */
function corpusProblem(c: ResolvedCorpus): string | undefined {
  const where = corpusFolderOf(c.folder) ?? "the folder of --cases";
  if (c.rewrite) return privateAssetsProblem(c.folder, where);
  if (c.name === "custom" && !(existsSync(join(c.folder, "tasks")) && existsSync(join(c.folder, "libraries")))) return `${where} must hold tasks/ and libraries/, laid out as the public ones are (see "Run your own set" in the README)`;
  return undefined;
}

async function main(): Promise<void> {
  let values: { model?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; label?: string; akm?: string; "akm-env"?: string[]; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`agent-ab: ${(e as Error).message}\n\n${USAGE}`);
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
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: EVAL_DIR, fail });
  const limit = positive("--limit", values.limit);
  const repeat = positive("--repeat", values.repeat);
  const akmEnv = parseAkmEnv(values["akm-env"]);
  parseAkm(values.akm); // a bad --akm stops the run now, before Docker is asked about and a checkout is packed
  for (const c of corpora) {
    const problem = corpusProblem(c);
    if (problem) fail(problem);
  }
  const { model, env } = preflight(values);
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, [{ role: "model", name: model, baseUrl: env.OPENAI_BASE_URL }]);

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-")); // where a checkout is packed. Each run keeps a copy of the tarballs
  try {
    const { arm, note } = akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    const summaries: Summary[] = [];
    for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { model, label: runLabel, limit, env, arm, akmEnv }))));
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
    console.error(`agent-ab: ${e.message}`);
    process.exit(e.code);
  }
}
