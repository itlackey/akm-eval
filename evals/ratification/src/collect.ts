// The collector of the ratification suite: copies the tasks and libraries the run selected, writes the Harbor job (one agent per arm: minimal,
// guided and plugin call a model; reference and noop do not), runs Harbor and reads the trials it left, with the verifier's checks and the
// metrics of the agent's session (metrics.ts). The job and the agents are lib/harbor's (akm_ratify.py for the guided arm, akm_cli.py, akm_opencode.py).

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AkmArm, jobConfig as harborJob, loadRunTrials, runHarbor, sha256Dir, stagePackages } from "../../../lib/harbor/harbor.ts";
import type { RunTrial } from "../../../lib/harbor/score.ts";
import { singleService } from "../../../lib/harbor/network.ts";
import type { ModelLimits } from "../../../lib/models.ts";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { type Metrics, type Spec, metricsOf, parseCalls } from "./metrics.ts";

export const NAME = "ratification";
export const PROMPT = "prompts/minimal.md";
/** Attempts per task and arm in a full run; a run with --limit or --tasks makes one unless --attempts says otherwise. */
export const ATTEMPTS = 3;

/** The arms that call a model, in the order the report shows them, and the two that do not (they check the tasks and the verifiers). */
export const MODEL_ARMS = ["minimal", "guided", "plugin"] as const;
export const CHECK_ARMS = ["reference", "noop"] as const;
export type Arm = (typeof MODEL_ARMS)[number] | (typeof CHECK_ARMS)[number];

export function jobConfig(o: { name: string; model: string | null; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; tasksDir: string; tasks: string[]; librariesDir: string; promptsDir: string; attempts: number; jobsDir: string; arms: Arm[]; arm?: AkmArm; packagesDir?: string | null; akmEnv?: Record<string, string> }): Record<string, unknown> {
  const job = harborJob({ name: o.name, model: o.model ?? "openai/not-called", modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency, jobsDir: o.jobsDir, attempts: o.attempts, datasets: [{ path: o.tasksDir, task_names: o.tasks }], librariesDir: o.librariesDir, arm: o.arm, packagesDir: o.packagesDir, akmEnv: o.akmEnv, sharedNetwork: singleService(o.tasksDir) });
  const akm = (job.agents as { import_path: string; model_name?: string; kwargs: Record<string, unknown> }[]).find((a) => a.import_path === "akm_opencode:AkmOpenCode");
  if (!akm) throw new Error("the shared Harbor job has no akm agent");
  const { akm_plugin_version: _version, plugin_package: _package, ...cli } = akm.kwargs;
  const prompt = { disable_web_search: true, prompt_template_path: join(o.promptsDir, PROMPT.replace(/^prompts\//, "")) };
  const agents = o.arms.map((label) => {
    if (label === "reference" || label === "noop") {
      const { opencode_config: _config, ...bare } = cli;
      const { model_name: _model, ...agent } = akm;
      return { ...agent, import_path: "akm_cli:AkmCli", kwargs: { ...bare, arm: label, script: label } };
    }
    if (label === "plugin") return { ...akm, import_path: "akm_opencode:AkmOpenCode", kwargs: { ...akm.kwargs, arm: label, ...prompt } };
    return { ...akm, import_path: "akm_ratify:AkmRatifyCli", kwargs: { ...cli, arm: label, guide: label === "guided", ...prompt } };
  });
  return { ...job, agents };
}

/** The arm label of an agent name as Harbor records it (`akm-cli-minimal`, `akm-opencode-plugin`). */
export const armOf = (agent: unknown): string | null => (typeof agent === "string" ? (/^akm-(?:cli|opencode)-([a-z0-9-]+)$/.exec(agent)?.[1] ?? null) : null);

/** The task.toml fields the metrics need. */
export function specOf(taskDir: string): Spec & { family: string } {
  const m = (Bun.TOML.parse(readFileSync(join(taskDir, "task.toml"), "utf8")) as { metadata?: Record<string, any> }).metadata ?? {};
  return { family: String(m.family), ref_akm: Number(m.ref_akm), old: String(m.old ?? ""), replacement: String(m.replacement ?? "") };
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** A trial of the suite: lib/harbor's, with its arm's label, the verifier's failed checks and the metrics of the session. */
export interface RatTrial extends RunTrial {
  ratification_arm: string;
  family: string;
  failed_checks: string[] | null;
  metrics: Metrics | null;
}

export function loadRatTrials(jobDir: string, specs: Map<string, Spec & { family: string }>): { trials: RatTrial[]; observed: ReturnType<typeof loadRunTrials>["observed"] } {
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
      return {
        ...t,
        ratification_arm: armOf(r?.agent_info?.name) ?? String(r?.agent_info?.name),
        family: spec.family,
        failed_checks: checks ? Object.entries(checks).filter(([, c]) => !c.ok).map(([name]) => name) : null,
        metrics: stream === null ? null : metricsOf(parseCalls(stream), spec, t.reward === null ? null : t.reward === 1),
      };
    }),
  };
}

export interface Collected {
  cfg: Record<string, unknown>;
  staged: ReturnType<typeof stagePackages>;
  exit: number;
  jobDir: string;
  trials: RatTrial[];
  observed: ReturnType<typeof loadRunTrials>["observed"];
  arms: Arm[];
  librariesSha: string;
  taskDigests: Record<string, string>;
  promptSha: string;
}

/** Runs the selected `tasks` of `assets` (a folder with tasks/, libraries/ and prompts/) in Harbor, into the results folder `dir`. */
export async function collect(o: { assets: string; tasks: string[]; arms: Arm[]; attempts: number; dir: string; model: string | null; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }): Promise<Collected> {
  const tasksDir = join(o.dir, "tasks");
  const librariesDir = join(o.dir, "libraries");
  const promptsDir = join(o.dir, "prompts");
  for (const t of o.tasks) cpSync(join(o.assets, "tasks", t), join(tasksDir, t), { recursive: true });
  cpSync(join(o.assets, "libraries"), librariesDir, { recursive: true });
  cpSync(join(o.assets, "prompts"), promptsDir, { recursive: true });
  const taskDigests = Object.fromEntries(o.tasks.map((t) => [t, sha256Dir(join(tasksDir, t))]));
  const librariesSha = sha256Dir(librariesDir);
  const promptSha = sha256Text(sha256File(join(promptsDir, "minimal.md")));
  const jobsDir = join(o.dir, "jobs");
  const jobName = NAME;
  const staged = stagePackages(o.arm, o.dir);
  const cfg = jobConfig({ name: jobName, model: o.model, modelLimits: o.modelLimits, modelReasoningEffort: o.modelReasoningEffort, concurrency: o.concurrency, tasksDir, tasks: o.tasks, librariesDir, promptsDir, attempts: o.attempts, jobsDir, arms: o.arms, arm: o.arm, packagesDir: staged?.dir, akmEnv: o.akmEnv });
  const configFile = join(o.dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`${NAME}: ${o.tasks.length} tasks x ${o.arms.length} arms (${o.arms.join(", ")}) x ${o.attempts} = ${o.tasks.length * o.arms.length * o.attempts} trials, ${o.concurrency ?? 4} at a time`);
  const exit = await runHarbor(configFile, join(o.dir, "harbor.log"), o.env);
  const jobDir = join(jobsDir, jobName);
  const specs = new Map(o.tasks.map((t) => [t, specOf(join(tasksDir, t))]));
  const { trials, observed } = existsSync(jobDir) ? loadRatTrials(jobDir, specs) : { trials: [], observed: loadRunTrials(jobDir).observed };
  return { cfg, staged, exit, jobDir, trials, observed, arms: o.arms, librariesSha, taskDigests, promptSha };
}
