// The collector of the terminal-bench benchmark: counts the assets of the library the akm arm seeds, copies the library, writes the Harbor
// job that runs each task of the pinned dataset with opencode alone and with opencode plus the akm plugin, and runs Harbor. It is the
// COLLECTOR part of the benchmark's measurement (see measurement.ts and lib/manifest.ts): the job it writes, the library it seeds, the
// akm arm in lib/harbor, and the akm that counts the library's assets. The scoring is lib/harbor/score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { ModelLimits } from "../../../lib/models.ts";
import { join, resolve } from "node:path";
import { akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson } from "../../../lib/akm/akm.ts";
import { CONCURRENT_TRIALS, type AkmArm, jobConfig as harborJob, runHarbor, sha256Dir, stagePackages } from "../../../lib/harbor/harbor.ts";

export const NAME = "terminal-bench";
const BENCH_DIR = resolve(import.meta.dir, "..");

export const DEFAULT_ATTEMPTS = 1; // per task and arm
export const LIBRARY = "library"; // the library's folder in what the akm arm uploads, and so its AKM_TASK_STASH

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

export function readLock(): Lock {
  return JSON.parse(readFileSync(join(BENCH_DIR, "assets", "ASSETS.lock"), "utf8"));
}

/** The assets akm indexes in the library, as the host's akm counted them at the start of the run. */
export interface LibraryCount {
  /** Null when no akm on this machine could count them. The akm arm's setup then only checks that its index is not empty. */
  assets: number | null;
  /** The akm that counted. Null when none did. */
  measured_with: { akm_version: string; akm_bin: string; akm_build: string | null } | null;
}

/**
 * The assets akm indexes in `library`, counted with the akm on this machine (AKM_BIN, else akm on PATH) as the akm arm seeds it: the
 * type folders copied into a new bundle in a sandbox, a full index, and `akm info`. Facts are the scaffold's, not the library's.
 * Count them here and not by files: a file is not an asset (317 files, 259 assets in the public library on akm 0.9.26), and the number
 * changes with every library edit and with akm's rules. The akm arm's own akm may count otherwise, so collect holds that akm to this
 * number only when it is the same version (enforcedAssets). When no akm can count, the number is null and `reason` says why.
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
 * The number of assets the akm arm's setup must find indexed: what the host's akm counted when the akm arm installs the same version,
 * else null, which is one (an index that is not empty). Two versions can index a different number of assets from one library, and a
 * floor the container's akm cannot reach stops every akm trial after its setup while the control arm runs on alone. The count stays
 * in the summary either way, and the setup records what the container's akm indexed.
 */
export function enforcedAssets(count: LibraryCount, arm: Pick<AkmArm, "cli">): number | null {
  return count.assets !== null && count.measured_with?.akm_version === arm.cli.version ? count.assets : null;
}

/**
 * The Harbor job: the two arms on these tasks of the pinned dataset, `attempts` each. The tasks are Harbor's and none
 * of them names a library, so the job names the one the akm arm seeds, for every task, and how many assets akm must index in
 * it (`libraryAssets`, see enforcedAssets: when none, at least one).
 */
export function jobConfig(o: {
  name: string;
  model: string;
  modelLimits?: ModelLimits; modelReasoningEffort?: string;
  concurrency?: number;
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
    model: o.model, modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency,
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

/** The name of the Harbor job of a corpus, and so the folder of its trials under jobs/. */
export const jobName = (corpus: string): string => `${NAME}-${corpus}`;

/** What a run of Harbor left besides the trials, which `summarize` of run.ts reads from the job folder. */
export interface Collected {
  cfg: Record<string, unknown>;
  staged: ReturnType<typeof stagePackages>;
  exit: number;
  library: LibraryCount & { sha256: string };
}

/**
 * Seeds the library for the akm arm, counts its assets, and runs the selected `tasks` of the dataset in Harbor, into the results folder
 * `dir`. `library` is the folder the akm arm seeds from. Harbor reads the run's own copy of it, which is digested before Harbor starts.
 */
export async function collect(o: { corpus: string; library: string; lock: Lock; tasks: string[]; attempts: number; dir: string; model: string; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; onReady?: (prepared: Collected) => void; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }): Promise<Collected> {
  const librariesDir = join(o.dir, "libraries");
  cpSync(o.library, join(librariesDir, LIBRARY), { recursive: true }); // what the akm arm seeds, kept with the run
  const counted = await measureLibrary(o.library);
  const { reason, ...count } = counted;
  if (reason !== undefined) console.warn(`${NAME}: the assets of the library were not counted (${reason}). The akm arm's setup will only check that its index is not empty.`);
  const library = { ...count, sha256: sha256Dir(join(librariesDir, LIBRARY)) };
  const libraryAssets = enforcedAssets(library, o.arm);
  if (library.assets !== null && libraryAssets === null) console.warn(`${NAME}: the ${library.assets} assets of the library were counted with akm ${library.measured_with?.akm_version}, and the akm arm installs akm ${o.arm.cli.version}. The setup will only check that its index is not empty. What it indexed is in akm_install.observed.assets_indexed.`);
  const staged = stagePackages(o.arm, o.dir); // the tarballs of a checkout, kept with the run
  const cfg = jobConfig({ name: jobName(o.corpus), model: o.model, modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency, lock: o.lock, tasks: o.tasks, librariesDir, jobsDir: join(o.dir, "jobs"), attempts: o.attempts, libraryAssets, arm: o.arm, packagesDir: staged?.dir, akmEnv: o.akmEnv });
  const configFile = join(o.dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`${NAME} (${o.corpus}): ${o.tasks.length} of ${Object.keys(o.lock.tasks).length} tasks x 2 arms x ${o.attempts} = ${o.tasks.length * 2 * o.attempts} trials, ${o.concurrency ?? CONCURRENT_TRIALS} at a time`);
  o.onReady?.({ cfg, staged, exit: 130, library });
  const exit = await runHarbor(configFile, join(o.dir, "harbor.log"), o.env);
  return { cfg, staged, exit, library };
}
