// The collector of the agent-ab eval: copies the tasks and the libraries the run selected, writes the Harbor job that runs each task with
// opencode alone and with opencode plus the akm plugin, runs Harbor, and reads the trials it left. It is the COLLECTOR part of the eval's
// measurement (see measurement.ts and lib/manifest.ts): the job it writes, the akm arm in lib/harbor, and what is kept of each trial.
// The scoring is lib/harbor/score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { cpSync, readdirSync, writeFileSync } from "node:fs";
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

export const NAME = "agent-ab";

/** Attempts per task and arm in a full run. A run with --limit makes one, to check a setup. */
export const ATTEMPTS = 3;
export const attemptsFor = (limit?: number): number => (limit === undefined ? ATTEMPTS : 1);

/** The Harbor job: the two arms on the same tasks. See lib/harbor/harbor.ts. The akm arm seeds the library each task names. */
export function jobConfig(o: { name: string; model: string; tasksDir: string; tasks: string[]; librariesDir: string; attempts: number; jobsDir: string; arm?: AkmArm; packagesDir?: string | null; akmEnv?: Record<string, string> }): Record<string, unknown> {
  return harborJob({ name: o.name, model: o.model, jobsDir: o.jobsDir, attempts: o.attempts, librariesDir: o.librariesDir, datasets: [{ path: o.tasksDir, task_names: o.tasks }], arm: o.arm, packagesDir: o.packagesDir, akmEnv: o.akmEnv });
}

/** What a run of Harbor left, with the digests of the run's own copy of the tasks and the libraries, made before Harbor started. */
export interface Collected {
  cfg: Record<string, unknown>;
  staged: ReturnType<typeof stagePackages>;
  exit: number;
  jobDir: string;
  trials: ReturnType<typeof loadRunTrials>["trials"];
  observed: ReturnType<typeof loadRunTrials>["observed"];
  /** A digest of every file of the libraries folder. */
  librariesSha: string;
  /** A digest of the folder of each library, by name. */
  libraryDigests: Record<string, string>;
  /** A digest of the folder of each selected task, by name. */
  taskDigests: Record<string, string>;
}

/**
 * Runs the selected `tasks` of `assets` (a folder that holds tasks/ and libraries/) in Harbor, into the results folder `dir`. Harbor reads
 * the run's own copy of the tasks and the libraries, which is digested before it starts: an edit to the live folders while the run goes is
 * neither what the trials used nor what the summary records. `of` is how many tasks the corpus has, for the line it prints.
 */
export async function collect(o: { corpus: string; assets: string; tasks: string[]; of: number; attempts: number; dir: string; model: string; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }): Promise<Collected> {
  const tasksDir = join(o.dir, "tasks");
  const librariesDir = join(o.dir, "libraries");
  for (const t of o.tasks) cpSync(join(o.assets, "tasks", t), join(tasksDir, t), { recursive: true });
  cpSync(join(o.assets, "libraries"), librariesDir, { recursive: true });
  const taskDigests = Object.fromEntries(o.tasks.map((t) => [t, sha256Dir(join(tasksDir, t))]));
  const libraryDigests = Object.fromEntries(readdirSync(librariesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => [e.name, sha256Dir(join(librariesDir, e.name))]));
  const librariesSha = sha256Dir(librariesDir);
  const jobsDir = join(o.dir, "jobs");
  const jobName = `${NAME}-${o.corpus}`;
  const staged = stagePackages(o.arm, o.dir); // the tarballs of a checkout, kept with the run
  const cfg = jobConfig({ name: jobName, model: o.model, tasksDir, tasks: o.tasks, librariesDir, attempts: o.attempts, jobsDir, arm: o.arm, packagesDir: staged?.dir, akmEnv: o.akmEnv });
  const configFile = join(o.dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`${NAME} (${o.corpus}): ${o.tasks.length} of ${o.of} tasks x 2 arms x ${o.attempts} = ${o.tasks.length * 2 * o.attempts} trials, ${CONCURRENT_TRIALS} at a time`);

  const exit = await runHarbor(configFile, join(o.dir, "harbor.log"), o.env);
  const jobDir = join(jobsDir, jobName);
  const { trials, observed } = loadRunTrials(jobDir); // none when Harbor made no job: every cell is then missing, and the run is aborted
  return { cfg, staged, exit, jobDir, trials, observed, librariesSha, libraryDigests, taskDigests };
}
