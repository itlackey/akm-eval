// The collector of the cli-ratification eval: copies the tasks, the libraries, the prompts and arms.json into the run's folder, writes the
// Harbor job that runs every task once per arm with the CLI agent of lib/harbor/akm_cli.py (opencode with the real akm and no plugin),
// runs Harbor and reads the trials it left: lib/harbor's, plus the verifier's checks and the trace of the agent's calls. The scoring is
// score.ts.
//
// A change to what this file asks akm, to what it records of the trace, or to the tasks, is a new version of the eval: change `version`
// in measurement.ts by hand.

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AkmArm,
  jobConfig as harborJob,
  loadRunTrials,
  runHarbor,
  sha256Dir,
  stagePackages,
} from "../../../lib/harbor/harbor.ts";
import { singleService } from "../../../lib/harbor/network.ts";
import type { ModelLimits } from "../../../lib/models.ts";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import type { CliTrial, Family } from "./score.ts";
import { type Spec, mediated, parseCalls, traceOf } from "./trace.ts";

export const NAME = "cli-ratification";
export const ARMS_FILE = "arms.json";

/** One attempt per task and arm: the owner's rule is one run per eval. */
export const ATTEMPTS = 1;
/** The pilot's width: two trials at a time (the design's pilot limit). */
export const PILOT_CONCURRENCY = 2;

/**
 * The akm config `projects` every arm runs with: the two projects the cards are about, bare (paths only), so a working directory selects
 * its project the way a user's config would. It is the same in every arm; arms differ only in the prompt.
 */
export const PROJECTS = { orchid: { paths: ["/work/orchid"] }, quill: { paths: ["/work/quill"] } };

/** An arm: a model arm has the prompt template it wraps the card in; a check arm has the script it runs instead of a model. */
export type ArmSpec = { prompt: string; script?: undefined } | { script: "reference" | "noop"; prompt?: undefined };
export type Arms = Record<string, ArmSpec>;

/** The arms of arms.json, in the order it lists them. */
export function readArms(assets: string): Arms {
  const arms = JSON.parse(readFileSync(join(assets, ARMS_FILE), "utf8")) as unknown;
  if (typeof arms !== "object" || arms === null || Array.isArray(arms)) throw new Error(`${ARMS_FILE} must be an object of arm labels`);
  for (const [label, spec] of Object.entries(arms as Record<string, any>)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) throw new Error(`${ARMS_FILE}: the arm label ${JSON.stringify(label)} is not lower-case letters, digits and dashes`);
    const prompt = typeof spec?.prompt === "string", script = spec?.script === "reference" || spec?.script === "noop";
    if (prompt === script) throw new Error(`${ARMS_FILE}: the arm ${label} needs a prompt (it calls a model) or a script of reference or noop (it does not), not both and not neither`);
  }
  return arms as Arms;
}

/** The arms of a run: the model arms, or with `check` the script arms, which call no model. */
export const armsOf = (arms: Arms, check: boolean): Arms => Object.fromEntries(Object.entries(arms).filter(([, a]) => (a.script !== undefined) === check));

/** The Harbor job: lib/harbor's job with its akm agent replaced by one CLI agent per arm of the run. */
export function jobConfig(o: { name: string; model: string | null; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; tasksDir: string; tasks: string[]; librariesDir: string; promptsDir: string; attempts: number; jobsDir: string; arms: Arms; arm?: AkmArm; packagesDir?: string | null; akmEnv?: Record<string, string> }): Record<string, unknown> {
  const job = harborJob({ name: o.name, model: o.model ?? "openai/not-called", modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency ?? PILOT_CONCURRENCY, jobsDir: o.jobsDir, attempts: o.attempts, librariesDir: o.librariesDir, datasets: [{ path: o.tasksDir, task_names: o.tasks }], arm: o.arm, packagesDir: o.packagesDir, akmEnv: o.akmEnv, sharedNetwork: singleService(o.tasksDir) });
  const akm = (job.agents as { import_path: string; model_name?: string; kwargs: Record<string, unknown> }[]).find((a) => a.import_path === "akm_opencode:AkmOpenCode");
  if (!akm) throw new Error("the shared Harbor job has no akm agent");
  const { akm_plugin_version: _version, plugin_package: _package, ...kwargs } = akm.kwargs;
  const agents = Object.entries(o.arms).map(([label, spec]) => {
    if (spec.script !== undefined) {
      const { opencode_config: _config, ...bare } = kwargs;
      const { model_name: _model, ...agent } = akm;
      return { ...agent, import_path: "akm_cli:AkmCli", kwargs: { ...bare, arm: label, projects: PROJECTS, script: spec.script } };
    }
    return { ...akm, import_path: "akm_cli:AkmCli", kwargs: { ...kwargs, arm: label, projects: PROJECTS, disable_web_search: true, prompt_template_path: join(o.promptsDir, spec.prompt.replace(/^prompts\//, "")) } };
  });
  return { ...job, agents };
}

/** The arm label of an agent name as Harbor records it, `akm-cli-<label>`, or null for another agent. */
export const armOf = (agent: unknown): string | null => (typeof agent === "string" ? (/^akm-cli-([a-z0-9][a-z0-9-]*)$/.exec(agent)?.[1] ?? null) : null);

/** What a task's metadata says: its family and what the trace must show (task.toml). */
export interface TaskSpec extends Spec {
  family: Family;
}

export function specOf(taskDir: string): TaskSpec {
  const m = (Bun.TOML.parse(readFileSync(join(taskDir, "task.toml"), "utf8")) as { metadata?: Record<string, any> }).metadata ?? {};
  const strings = (x: unknown): string[] => (Array.isArray(x) && x.every((v) => typeof v === "string") ? x : []);
  if (!["apply", "persist", "repair", "resume", "regression"].includes(m.family)) throw new Error(`${taskDir}/task.toml: metadata.family is ${JSON.stringify(m.family)}`);
  return { family: m.family, evidence: strings(m.evidence), commands: strings(m.commands) };
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/**
 * The trials of a job folder: lib/harbor's (reward, exception, tokens, times), with the arm label, the checks of the verifier that
 * failed, and the trace of the agent's calls from opencode's stream. A script arm has no stream, so no trace.
 */
export function loadCliTrials(jobDir: string, specs: Map<string, TaskSpec>): { trials: CliTrial[]; observed: ReturnType<typeof loadRunTrials>["observed"] } {
  const { trials, observed } = loadRunTrials(jobDir);
  return {
    observed,
    trials: trials.map((t) => {
      const r = readJson(join(jobDir, t.trial, "result.json"));
      const spec = specs.get(t.task);
      if (!spec) throw new Error(`${jobDir}/${t.trial} is a trial of ${t.task}, which is not among the tasks of the run`);
      const checks = readJson(join(jobDir, t.trial, "verifier", "checks.json"))?.checks as Record<string, { ok: boolean }> | undefined;
      const streamFile = join(jobDir, t.trial, "agent", "opencode.txt");
      const stream = existsSync(streamFile) ? readFileSync(streamFile, "utf8") : null;
      const parsed = stream === null ? null : parseCalls(stream);
      return {
        ...t,
        cli_arm: armOf(r?.agent_info?.name) ?? String(r?.agent_info?.name),
        family: spec.family,
        failed_checks: checks ? Object.entries(checks).filter(([, c]) => !c.ok).map(([name]) => name) : null,
        mediated: parsed === null ? null : mediated(parsed.calls, spec),
        trace: parsed === null ? null : traceOf(parsed.calls, parsed.first, spec),
      };
    }),
  };
}

/** What a run of Harbor left, with the digests of the run's own copy of the tasks, the libraries and the arms, made before Harbor started. */
export interface Collected {
  cfg: Record<string, unknown>;
  staged: ReturnType<typeof stagePackages>;
  exit: number;
  jobDir: string;
  trials: CliTrial[];
  observed: ReturnType<typeof loadRunTrials>["observed"];
  arms: Arms;
  librariesSha: string;
  taskDigests: Record<string, string>;
  armsSha: string;
}

/** Runs the selected `tasks` of `assets` (a folder with tasks/, libraries/, prompts/ and arms.json) in Harbor, into the results folder `dir`. */
export async function collect(o: { corpus: string; assets: string; tasks: string[]; of: number; attempts: number; dir: string; check: boolean; model: string | null; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }): Promise<Collected> {
  const tasksDir = join(o.dir, "tasks");
  const librariesDir = join(o.dir, "libraries");
  const promptsDir = join(o.dir, "prompts");
  for (const t of o.tasks) cpSync(join(o.assets, "tasks", t), join(tasksDir, t), { recursive: true });
  cpSync(join(o.assets, "libraries"), librariesDir, { recursive: true });
  cpSync(join(o.assets, "prompts"), promptsDir, { recursive: true });
  cpSync(join(o.assets, ARMS_FILE), join(o.dir, ARMS_FILE));
  const arms = armsOf(readArms(o.dir), o.check);
  const taskDigests = Object.fromEntries(o.tasks.map((t) => [t, sha256Dir(join(tasksDir, t))]));
  const librariesSha = sha256Dir(librariesDir);
  const armsSha = armsDigestOf(o.dir);
  const jobsDir = join(o.dir, "jobs");
  const jobName = `${NAME}-${o.corpus}`;
  const staged = stagePackages(o.arm, o.dir);
  const cfg = jobConfig({ name: jobName, model: o.model, modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency, tasksDir, tasks: o.tasks, librariesDir, promptsDir, attempts: o.attempts, jobsDir, arms, arm: o.arm, packagesDir: staged?.dir, akmEnv: o.akmEnv });
  const configFile = join(o.dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  const n = Object.keys(arms).length;
  console.log(`${NAME} (${o.corpus}${o.check ? ", check: no model" : ""}): ${o.tasks.length} of ${o.of} tasks x ${n} arms (${Object.keys(arms).join(", ")}) x ${o.attempts} = ${o.tasks.length * n * o.attempts} trials, ${o.concurrency ?? PILOT_CONCURRENCY} at a time`);

  const exit = await runHarbor(configFile, join(o.dir, "harbor.log"), o.env);
  const jobDir = join(jobsDir, jobName);
  const specs = new Map(o.tasks.map((t) => [t, specOf(join(tasksDir, t))]));
  const { trials, observed } = existsSync(jobDir) ? loadCliTrials(jobDir, specs) : { trials: [], observed: loadRunTrials(jobDir).observed }; // no job: every cell is missing
  return { cfg, staged, exit, jobDir, trials, observed, arms, librariesSha, taskDigests, armsSha };
}

/** The digest of the arms a run presents: arms.json and the prompts, as copied into the run's folder. */
export function armsDigestOf(dir: string): string {
  return sha256Text(`${sha256File(join(dir, ARMS_FILE))}\n${sha256Dir(join(dir, "prompts"))}\n`);
}
