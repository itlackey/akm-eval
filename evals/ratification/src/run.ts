#!/usr/bin/env bun
// ratification: does a fresh agent complete everyday akm jobs, recover from what goes wrong, and avoid needless calls, with the akm CLI alone
// (minimal), with the guide akm ships for agents (guided) and with the akm plugin (plugin)? Every task is checked by a verifier over the state the
// agent leaves. `--check` runs the reference solutions and a no-op instead, with no model, to prove the tasks. See ../README.md.
//
//   evals/ratification/run [--check] [--corpus public|custom] [--cases DIR] [--model NAME] [--limit N | --tasks a,b] [--attempts N] [--arms minimal,guided,plugin] [--concurrency N] [--label NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Fatal, fail, gitCommit, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, announceCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { AKM_ARM_OPTIONS, type AkmArm, type Cells, PINS, akmArm, akmArmUsage, akmSummary, assetsSha256, completionOf, hostEnv, jobRecord, parseAkm, parseAkmEnv, positive, preflight, releaseArm } from "../../../lib/harbor/harbor.ts";
import { MODEL_OPTIONS, type ModelLimits } from "../../../lib/models.ts";
import { endpointHost, redactConfig } from "../../../lib/provenance.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { taskNames } from "../../agent-ab/src/inputs.ts";
import { selectTasks } from "../../agent-ab/src/run.ts";
import { ATTEMPTS, type Arm, CHECK_ARMS, MODEL_ARMS, NAME, type RatTrial, collect } from "./collect.ts";
import { formatReport, reportOf } from "./report.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** The akm of a run without --akm: the current stable. The plugin that depends on it comes from RELEASE_PLUGINS in lib/harbor/harbor.ts. */
export const DEFAULT_ARM: AkmArm = releaseArm("0.10.261120");

const USAGE = `Usage: evals/ratification/run [--check] [--corpus public|custom] [--cases DIR] [--model NAME] [--limit N | --tasks a,b] [--attempts N] [--arms minimal,guided,plugin] [--concurrency N] [--label NAME] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs each task with a fresh agent in three conditions, in Harbor: minimal (the instruction and one line that akm is installed), guided (and the
guide akm ships, \`akm hints\`, as /work/AGENTS.md) and plugin (and the akm-opencode plugin). Same akm-cli, same seeded bundle in all three.

  --check       run the reference solutions and a no-op instead: no model is called. The reference must pass every task and the no-op must fail
                every one, or the run exits 1. Do this before a model run; it is not a result.
  --model       the model, as opencode names it (opencode/qwen3.8-flash) or a models.json line. Pass it explicitly. Default: MODEL_NAME.
  --limit N     the first N tasks, once per arm. --tasks a,b names them. --attempts N sets the attempts (default ${ATTEMPTS}; 1 with --limit or --tasks).
  --arms        a subset of the model arms (default all three).
  --concurrency simultaneous trials (default 4).
  --label       names the results folder: <UTC date>-<label>. Default: the model name, or check.
${corpusUsage}
${akmArmUsage.replace(/Default: akm-cli@[^\s.]+\.[^\s.]+\.[^\s.]+(-[\w.]+)?\./, `Default: akm-cli@${DEFAULT_ARM.cli.version}.`)}
Needs Docker, uv and bun.`;

const cellsOf = (trials: RatTrial[], arm: string, tasks: string[], attempts: number): Cells => completionOf(trials.filter((t) => t.ratification_arm === arm), tasks, attempts).akm;

/** `complete` when Harbor exited 0, every cell of every arm has a trial, no arm errored in every trial and every container installed the same akm-cli tree. */
export function statusOf(o: { exit: number; jobWritten: boolean; trees: number; completion: Record<string, Cells>; outside: number }): { status: "complete" | "aborted"; aborted_reason: string | null } {
  const reasons: string[] = [];
  if (o.exit !== 0) reasons.push(`Harbor exited ${o.exit}`);
  if (!o.jobWritten) reasons.push("Harbor wrote no job");
  if (o.trees > 1) reasons.push(`the containers installed ${o.trees} different akm-cli dependency trees, so the trials did not all run the same code`);
  for (const [arm, c] of Object.entries(o.completion)) {
    if (c.missing > 0) reasons.push(`${c.missing} of ${c.expected} expected trials of the ${arm} arm have no result`);
    if (c.unexpected > 0) reasons.push(`${c.unexpected} trials of the ${arm} arm fall outside the grid`);
    if (c.expected > 0 && c.failed === c.expected) reasons.push(`the ${arm} arm completed none of its ${c.expected} trials: every one errored`);
  }
  if (o.outside > 0) reasons.push(`${o.outside} trials belong to no arm of the run`);
  return reasons.length ? { status: "aborted", aborted_reason: reasons.join("; ") } : { status: "complete", aborted_reason: null };
}

/** The verdict of a `--check` run: the reference passed every task and the no-op failed every one, with every trial scored. */
export function checkVerdict(trials: RatTrial[], tasks: string[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const task of tasks) {
    for (const [arm, want] of [["reference", 1], ["noop", 0]] as const) {
      const t = trials.find((x) => x.task === task && x.ratification_arm === arm);
      if (!t) problems.push(`${task}: the ${arm} has no trial`);
      else if (t.reward === null) problems.push(`${task}: the ${arm} was not scored${t.error ? ` (${t.error})` : ""}`);
      else if (t.reward !== want) problems.push(`${task}: the ${arm} ${want === 1 ? "failed" : "passed"}${t.failed_checks?.length ? ` (${t.failed_checks.join(", ")})` : ""}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

function toolsOk(): void {
  if (!Bun.which("uv")) fail("uv is needed. See https://docs.astral.sh/uv/");
  if (Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).exitCode !== 0) fail("Docker is not reachable: `docker info` failed. Every trial runs in a container.");
}

async function main(): Promise<void> {
  let values: { check?: boolean; model?: string; corpus?: string; cases?: string; limit?: string; tasks?: string; attempts?: string; arms?: string; concurrency?: string; label?: string; akm?: string; "akm-env"?: string[]; semantic?: boolean; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, check: { type: "boolean" }, limit: { type: "string" }, tasks: { type: "string" }, attempts: { type: "string" }, arms: { type: "string" }, concurrency: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`${NAME}: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) return void console.log(USAGE);
  const check = values.check === true;
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: EVAL_DIR, rewrite: false, fail });
  for (const c of corpora) for (const part of ["tasks", "libraries", "prompts"]) if (!existsSync(join(c.folder, part))) fail(`${c.flag}: ${relative(ROOT, c.folder)} must hold tasks/, libraries/ and prompts/, laid out as the public ones are`);
  const limit = positive("--limit", values.limit);
  const named = values.tasks?.split(",").map((s) => s.trim()).filter(Boolean);
  const attempts = positive("--attempts", values.attempts) ?? (check || limit !== undefined || named !== undefined ? 1 : ATTEMPTS);
  const chosen = values.arms?.split(",").map((s) => s.trim()) ?? [...MODEL_ARMS];
  for (const a of chosen) if (!(MODEL_ARMS as readonly string[]).includes(a)) fail(`--arms: ${a} is not one of ${MODEL_ARMS.join(", ")}`);
  const arms = (check ? [...CHECK_ARMS] : chosen) as Arm[];
  const concurrency = positive("--concurrency", values.concurrency);
  const akmEnv = parseAkmEnv(values["akm-env"], values.semantic);
  if (values.akm !== undefined) parseAkm(values.akm);

  let settings: { model: string | null; env: Record<string, string>; modelLimits?: ModelLimits; modelReasoningEffort?: string };
  if (check) {
    if (values.model !== undefined) fail("--check calls no model; leave out --model");
    toolsOk();
    settings = { model: null, env: hostEnv(process.env) };
  } else {
    if (values.model === undefined) fail("pass --model explicitly (a .env MODEL_NAME beats the environment, so the summary's model is the one to check)");
    settings = preflight(values);
  }
  const label = values.label ?? (check ? "check" : slug(settings.model as string));
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  if (!check) await announceCases(values, [{ role: "model", name: settings.model as string, baseUrl: settings.env.OPENAI_BASE_URL }]);

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-"));
  try {
    const { arm, note } = values.akm === undefined ? { arm: DEFAULT_ARM, note: null } : akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    for (const c of corpora) {
      const all = taskNames(join(c.folder, "tasks"));
      for (const t of named ?? []) if (!all.includes(t)) fail(`--tasks: no task named ${t}. Tasks: ${all.join(", ")}`);
      const tasks = named ?? selectTasks(all, limit);
      const dir = makeResultsDir(c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"), label);
      const got = await collect({ assets: c.folder, tasks, arms, attempts, dir, model: settings.model, modelLimits: settings.modelLimits, modelReasoningEffort: settings.modelReasoningEffort, concurrency, env: settings.env, arm, akmEnv });
      const completion = Object.fromEntries(arms.map((a) => [a, cellsOf(got.trials, a, tasks, attempts)]));
      const outside = got.trials.filter((t) => !arms.includes(t.ratification_arm as Arm)).length;
      const run = statusOf({ exit: got.exit, jobWritten: existsSync(got.jobDir), trees: got.observed.dependency_trees?.length ?? 0, completion, outside });
      const verdict = check ? checkVerdict(got.trials, tasks) : null;
      const status = run.status === "complete" && verdict && !verdict.ok ? "aborted" : run.status;
      const aborted_reason = run.aborted_reason ?? (verdict && !verdict.ok ? `the check failed: ${verdict.problems.join("; ")}` : null);
      const job = jobRecord(got.cfg, dir, ROOT);
      const akmFields = akmSummary(arm, akmEnv, got.staged?.files ?? [], got.observed);
      const report = reportOf(got.trials, arms, tasks);
      const summary = {
        eval: NAME,
        corpus: c.name,
        mode: check ? "check" : "run",
        label,
        date: new Date().toISOString(),
        git_commit: gitCommit(ROOT),
        model: settings.model,
        engine: settings.model === null ? null : { model: settings.model, endpoint: endpointHost(settings.env.OPENAI_BASE_URL) },
        ...akmFields,
        pins: { akm_cli: arm.cli.version, akm_plugin: arm.plugin.version, opencode: PINS.opencode, harbor: PINS.harbor },
        tasks,
        attempts,
        arms,
        harbor_exit: got.exit,
        status,
        aborted_reason,
        check: verdict,
        completion,
        libraries_sha256: got.librariesSha,
        tasks_sha256: got.taskDigests,
        prompt_sha256: got.promptSha,
        assets_sha256: assetsSha256({ library: got.librariesSha, dataset: { tasks: got.taskDigests, prompt: got.promptSha }, attempts }),
        config: redactConfig(job),
        report,
      };
      writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
      // One line per trial: the verdict, the failed checks, the metrics and the akm commands in order.
      writeFileSync(join(dir, "samples.jsonl"), got.trials.map((t) => `${JSON.stringify({ task: t.task, arm: t.ratification_arm, trial: t.trial, reward: t.reward, error: t.error, failed_checks: t.failed_checks, tokens: t.tokens, seconds: t.seconds, metrics: t.metrics })}\n`).join(""));
      console.log(`\n${NAME} (${summary.mode}) | model ${settings.model ?? "none"} | akm-cli ${arm.cli.version}, plugin ${arm.plugin.version}, opencode ${PINS.opencode}, harbor ${PINS.harbor}`);
      console.log(`  ${tasks.length} tasks, ${attempts} ${attempts === 1 ? "attempt" : "attempts"} per arm; arms ${arms.join(", ")}`);
      if (status === "aborted") console.log(`  ABORTED      ${aborted_reason}`);
      if (verdict?.ok) console.log("  CHECK OK     the reference passed every task and the no-op failed every one");
      for (const line of formatReport(report)) console.log(line);
      console.log(`  results      ${relative(ROOT, dir)}/`);
      if (status === "aborted") fail(`${aborted_reason}. The results above cover the trials that finished. See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
    }
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
