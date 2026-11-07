// The collector of the project-intent eval: copies the tasks, the libraries and projects.json, writes the Harbor job that runs every task
// with one akm arm per entry of projects.json, runs Harbor and reads the trials it left. The arms are the akm arm of lib/harbor
// (akm_opencode.py) with the same akm, plugin, model and opencode, and differ only in the `projects` the seed writes into akm's config.
// There is no arm without akm. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONCURRENT_TRIALS,
  type AkmArm,
  jobConfig as harborJob,
  loadRunTrials,
  runHarbor,
  sha256Dir,
  stagePackages,
} from "../../../lib/harbor/harbor.ts";
import type { ModelLimits } from "../../../lib/models.ts";
import { sha256File } from "../../../lib/provenance.ts";
import type { ProjectTrial } from "./score.ts";

export const NAME = "project-intent";

/** The file of a corpus that names the arms: each arm's label and the akm config `projects` it runs with, null for none. */
export const ARMS_FILE = "projects.json";

/** Attempts per task and arm in a full run. A run with --limit makes one, to check a setup. */
export const ATTEMPTS = 4;
export const attemptsFor = (limit?: number): number => (limit === undefined ? ATTEMPTS : 1);

export type Arms = Record<string, Record<string, unknown> | null>;

/** The arms of a corpus, in the order its projects.json lists them. The first is the baseline the others are compared with. */
export function readArms(assets: string): Arms {
  const arms = JSON.parse(readFileSync(join(assets, ARMS_FILE), "utf8")) as unknown;
  if (typeof arms !== "object" || arms === null || Array.isArray(arms)) throw new Error(`${ARMS_FILE} must be an object of arm labels`);
  const labels = Object.keys(arms);
  if (labels.length < 2) throw new Error(`${ARMS_FILE} names ${labels.length} arm; a comparison needs two or more`);
  for (const [label, projects] of Object.entries(arms)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) throw new Error(`${ARMS_FILE}: the arm label ${JSON.stringify(label)} is not lower-case letters, digits and dashes`);
    if (projects !== null && (typeof projects !== "object" || Array.isArray(projects))) throw new Error(`${ARMS_FILE}: the arm ${label} must be null or an akm \`projects\` object`);
  }
  return arms as Arms;
}

/**
 * The Harbor job: lib/harbor's job with its akm agent once per arm, labelled, and no opencode-alone control. The arms share everything
 * the shared job sets (model, opencode, config, setup time, akm and plugin); each adds its `arm` label and its `projects`.
 */
export function jobConfig(o: { name: string; model: string; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; tasksDir: string; tasks: string[]; librariesDir: string; attempts: number; jobsDir: string; arms: Arms; arm?: AkmArm; packagesDir?: string | null; akmEnv?: Record<string, string> }): Record<string, unknown> {
  const job = harborJob({ name: o.name, model: o.model, modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency, jobsDir: o.jobsDir, attempts: o.attempts, librariesDir: o.librariesDir, datasets: [{ path: o.tasksDir, task_names: o.tasks }], arm: o.arm, packagesDir: o.packagesDir, akmEnv: o.akmEnv });
  const akm = (job.agents as { import_path: string; kwargs: Record<string, unknown> }[]).find((a) => a.import_path === "akm_opencode:AkmOpenCode");
  if (!akm) throw new Error("the shared Harbor job has no akm agent");
  const agents = Object.entries(o.arms).map(([label, projects]) => ({ ...akm, kwargs: { ...akm.kwargs, arm: label, ...(projects ? { projects } : {}) } }));
  return { ...job, agents };
}

/** The arm label of an agent name as Harbor records it, `akm-opencode-<label>`, or null for another agent. */
export const armOf = (agent: unknown): string | null => (typeof agent === "string" ? (/^akm-opencode-([a-z0-9][a-z0-9-]*)$/.exec(agent)?.[1] ?? null) : null);

/**
 * The trials of a job folder: lib/harbor's (reward, exception, akm calls, tokens, times, the plugin check), with the arm label and
 * `other_project`, the verifier's second reward, read from each trial's result.json.
 */
export function loadProjectTrials(jobDir: string): { trials: ProjectTrial[]; observed: ReturnType<typeof loadRunTrials>["observed"] } {
  const { trials, observed } = loadRunTrials(jobDir);
  return {
    observed,
    trials: trials.map((t) => {
      const r = JSON.parse(readFileSync(join(jobDir, t.trial, "result.json"), "utf8"));
      const other = r.verifier_result?.rewards?.other_project;
      return { ...t, project_arm: armOf(r.agent_info?.name) ?? String(r.agent_info?.name), other_project: typeof other === "number" ? other : null };
    }),
  };
}

/** What a run of Harbor left, with the digests of the run's own copy of the tasks, the libraries and the arms, made before Harbor started. */
export interface Collected {
  cfg: Record<string, unknown>;
  staged: ReturnType<typeof stagePackages>;
  exit: number;
  jobDir: string;
  trials: ProjectTrial[];
  observed: ReturnType<typeof loadRunTrials>["observed"];
  arms: Arms;
  librariesSha: string;
  libraryDigests: Record<string, string>;
  taskDigests: Record<string, string>;
  armsSha: string;
}

/** Runs the selected `tasks` of `assets` (a folder with tasks/, libraries/ and projects.json) in Harbor, into the results folder `dir`. */
export async function collect(o: { corpus: string; assets: string; tasks: string[]; of: number; attempts: number; dir: string; model: string; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }): Promise<Collected> {
  const tasksDir = join(o.dir, "tasks");
  const librariesDir = join(o.dir, "libraries");
  for (const t of o.tasks) cpSync(join(o.assets, "tasks", t), join(tasksDir, t), { recursive: true });
  cpSync(join(o.assets, "libraries"), librariesDir, { recursive: true });
  cpSync(join(o.assets, ARMS_FILE), join(o.dir, ARMS_FILE));
  const arms = readArms(o.dir);
  const taskDigests = Object.fromEntries(o.tasks.map((t) => [t, sha256Dir(join(tasksDir, t))]));
  const libraryDigests = Object.fromEntries(readdirSync(librariesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => [e.name, sha256Dir(join(librariesDir, e.name))]));
  const librariesSha = sha256Dir(librariesDir);
  const armsSha = sha256File(join(o.dir, ARMS_FILE));
  const jobsDir = join(o.dir, "jobs");
  const jobName = `${NAME}-${o.corpus}`;
  const staged = stagePackages(o.arm, o.dir);
  const cfg = jobConfig({ name: jobName, model: o.model, modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency, tasksDir, tasks: o.tasks, librariesDir, attempts: o.attempts, jobsDir, arms, arm: o.arm, packagesDir: staged?.dir, akmEnv: o.akmEnv });
  const configFile = join(o.dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  const n = Object.keys(arms).length;
  console.log(`${NAME} (${o.corpus}): ${o.tasks.length} of ${o.of} tasks x ${n} arms (${Object.keys(arms).join(", ")}) x ${o.attempts} = ${o.tasks.length * n * o.attempts} trials, ${o.concurrency ?? CONCURRENT_TRIALS} at a time`);

  const exit = await runHarbor(configFile, join(o.dir, "harbor.log"), o.env);
  const jobDir = join(jobsDir, jobName);
  const { trials, observed } = existsSync(jobDir) ? loadProjectTrials(jobDir) : { trials: [], observed: loadRunTrials(jobDir).observed }; // no job: every cell is missing
  return { cfg, staged, exit, jobDir, trials, observed, arms, librariesSha, libraryDigests, taskDigests, armsSha };
}
