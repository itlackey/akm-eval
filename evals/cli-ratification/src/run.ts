#!/usr/bin/env bun
// cli-ratification: does a fresh agent, with the real akm CLI and almost no instruction, finish a task whose result an independent
// verifier checks in the state it left? One run of the pilot: every card once per arm (CLI-minimal, CLI short guidance), in Harbor.
// `--check` runs the informed reference and the no-op instead, with no model, to prove the cards and verifiers before any model runs.
// See ../README.md.
//
//   evals/cli-ratification/run [--check] [--corpus public|custom] [--cases DIR] [--limit N] [--concurrency N] [--label NAME] [--model NAME] [--semantic] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Fatal, fail, gitCommit, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, announceCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import {
  AKM_ARM_OPTIONS,
  type AkmArm,
  type Cells,
  PINS,
  akmArm,
  akmArmUsage,
  akmSummary,
  assetsSha256,
  completionOf,
  hostEnv,
  jobRecord,
  parseAkm,
  parseAkmEnv,
  positive,
  preflight,
  releaseArm,
} from "../../../lib/harbor/harbor.ts";
import { buildManifest, caseDigests, completionOf as casesCompletion, corpusFolderOf } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, type ModelLimits } from "../../../lib/models.ts";
import { endpointHost, redactConfig } from "../../../lib/provenance.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { taskNames } from "../../agent-ab/src/inputs.ts";
import { selectTasks } from "../../agent-ab/src/run.ts";
import { ARMS_FILE, ATTEMPTS, NAME, PILOT_CONCURRENCY, collect } from "./collect.ts";
import { MEASUREMENT, casesIn } from "./measurement.ts";
import { type CliTrial, formatReport, makeRow, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** The akm of a run without --akm: the release the pilot was designed against. The CLI arm installs no plugin, so the plugin the release maps to is never used. */
export const DEFAULT_ARM: AkmArm = releaseArm("0.10.261111-beta");

const USAGE = `Usage: evals/cli-ratification/run [--check] [--corpus public|custom] [--cases DIR] [--limit N] [--concurrency N] [--label NAME] [--model NAME] [--semantic] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs each card once per arm in Harbor: opencode with the real akm CLI, no plugin, on the model in MODEL_NAME, with the fixed wrapper prompt
(CLI-minimal) and with the wrapper plus a short guidance card (CLI short guidance). Settings come from .env at the repository root.

  --check   run the informed reference and the no-op instead: no model is called and none is needed. The reference must pass every card and
            the no-op must fail every one, or the run exits 1. Do this before a model run; it is not a result.
${corpusUsage}
            custom is --cases DIR only: a folder with tasks/, libraries/, prompts/ and ${ARMS_FILE}, laid out as the public one.
  --limit   run N cards, once per arm, spread over the families.
  --concurrency  simultaneous trials (default ${PILOT_CONCURRENCY}); use 1 to run one at a time.
  --model   the model: a line of models.json, or a model as the gateway names it, as opencode takes it. Default: MODEL_NAME in .env.
  --label   names the results folder: <UTC date>-<label>. Default: the model name, or check.
${akmArmUsage.replace(`Default: akm-cli@${releaseArm().cli.version}.`, `Default: akm-cli@${DEFAULT_ARM.cli.version}.`)}

Needs Docker, uv and bun. One attempt per card and arm: a repeat is a decision of the owner's.`;

/** The trial grid of one arm, as lib/harbor counts it for its akm arm. */
const cellsOf = (trials: CliTrial[], arm: string, tasks: string[], attempts: number): Cells => completionOf(trials.filter((t) => t.cli_arm === arm), tasks, attempts).akm;

/** `complete` when Harbor exited 0, every cell of every arm has a trial, no trial is outside the grid, no arm errored in every trial and every container installed the same dependency tree. */
export function statusOf(o: { exit: number; jobWritten: boolean; trees: number; completion: Record<string, Cells>; outside: number }): { status: "complete" | "aborted"; aborted_reason: string | null } {
  const reasons: string[] = [];
  if (o.exit !== 0) reasons.push(`Harbor exited ${o.exit}`);
  if (!o.jobWritten) reasons.push("Harbor wrote no job");
  if (o.trees > 1) reasons.push(`the arms' containers installed ${o.trees} different dependency trees, so the trials did not all run the same code`);
  for (const [arm, c] of Object.entries(o.completion)) {
    if (c.missing > 0) reasons.push(`${c.missing} of ${c.expected} expected trials of the ${arm} arm have no result`);
    if (c.unexpected > 0) reasons.push(`${c.unexpected} trials of the ${arm} arm fall outside the grid`);
    if (c.expected > 0 && c.failed === c.expected) reasons.push(`the ${arm} arm completed none of its ${c.expected} trials: every one errored`);
  }
  if (o.outside > 0) reasons.push(`${o.outside} trials belong to no arm of ${ARMS_FILE}`);
  return reasons.length ? { status: "aborted", aborted_reason: reasons.join("; ") } : { status: "complete", aborted_reason: null };
}

/**
 * The verdict of a `--check` run: the reference passed every card it ran and the no-op failed every one, with every trial scored. A card
 * the reference fails is a bad fixture, recipe or verifier; a card the no-op passes is a verifier that checks nothing.
 */
export function checkVerdict(trials: CliTrial[], tasks: string[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const task of tasks) {
    for (const [arm, want] of [["reference", 1], ["noop", 0]] as const) {
      const t = trials.find((x) => x.task === task && x.cli_arm === arm);
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

export async function runCorpus(c: ResolvedCorpus, ctx: { check: boolean; model: string | null; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; label: string; limit?: number; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }, results = c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results")) {
  const all = taskNames(join(c.folder, "tasks"));
  const tasks = selectTasks(all, ctx.limit);
  const dir = makeResultsDir(results, ctx.label);
  const got = await collect({ corpus: c.name, assets: c.folder, tasks, of: all.length, attempts: ATTEMPTS, dir, check: ctx.check, model: ctx.model, modelLimits: ctx.modelLimits, modelReasoningEffort: ctx.modelReasoningEffort, concurrency: ctx.concurrency, env: ctx.env, arm: ctx.arm, akmEnv: ctx.akmEnv });
  const arms = Object.keys(got.arms);
  const completion = Object.fromEntries(arms.map((a) => [a, cellsOf(got.trials, a, tasks, ATTEMPTS)]));
  const outside = got.trials.filter((t) => !arms.includes(t.cli_arm)).length;
  const run = statusOf({ exit: got.exit, jobWritten: existsSync(got.jobDir), trees: got.observed.dependency_trees?.length ?? 0, completion, outside });
  const verdict = ctx.check ? checkVerdict(got.trials, tasks) : null;
  const status = run.status === "complete" && verdict && !verdict.ok ? "aborted" : run.status;
  const aborted_reason = run.aborted_reason ?? (verdict && !verdict.ok ? `the check failed: ${verdict.problems.join("; ")}` : null);
  const job = jobRecord(got.cfg, dir, ROOT);

  const cases = casesIn(dir, tasks); // the run's own copy, as Harbor read it
  const families = new Map(cases.map((k) => [k.id, k.family]));
  const rows = tasks.map((id) => makeRow({ id, family: families.get(id) ?? "apply" }, { arms, trials: got.trials.filter((t) => t.task === id) }));
  const scored = summarize(rows);
  const akmFields = akmSummary(ctx.arm, ctx.akmEnv, got.staged?.files ?? [], got.observed);
  const { datasets: _datasets, n_attempts: _attempts, ...jobSettings } = job;
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: c.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: ctx.arm.cli.version, bin: ctx.arm.bin, build: ctx.arm.build, build_fingerprint: akmFields.akm_build_fingerprint },
    config: jobSettings,
    engines: ctx.model === null ? {} : { opencode: { model: ctx.model, endpoint: endpointHost(ctx.env.OPENAI_BASE_URL), temperature: null, enableThinking: null, timeoutMs: null } },
    settings: { seed: null },
    eval_settings: { attempts: ATTEMPTS },
    completion: casesCompletion(MEASUREMENT, tasks, rows),
  });
  const pins = { akm_cli: ctx.arm.cli.version, akm_plugin: null, opencode: PINS.opencode, harbor: PINS.harbor };
  const summary = {
    eval: NAME,
    mode: ctx.check ? "check" : "pilot",
    corpus: c.name,
    corpus_folder: c.name === "custom" ? corpusFolderOf(c.folder) : null,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    model: ctx.model,
    ...akmFields,
    pins,
    limit: ctx.limit ?? null,
    n_tasks: tasks.length,
    attempts: ATTEMPTS,
    arms: Object.fromEntries(arms.map((a) => [a, got.arms[a]])),
    harbor_exit: got.exit,
    status,
    aborted_reason,
    check: verdict,
    completion,
    libraries_sha256: got.librariesSha,
    tasks_sha256: got.taskDigests,
    arms_sha256: got.armsSha,
    assets_sha256: assetsSha256({ library: got.librariesSha, dataset: { tasks: got.taskDigests, arms: got.armsSha }, attempts: ATTEMPTS }),
    engine: ctx.model === null ? null : { model: ctx.model, endpoint: endpointHost(ctx.env.OPENAI_BASE_URL) },
    config: redactConfig(job),
    n_errored: scored.n_errored,
    metrics: scored.metrics,
    job,
    report: scored.report,
    manifest,
  };
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  console.log(`\n${NAME} (${c.name}, ${summary.mode}) | model ${ctx.model ?? "none"} | akm-cli ${pins.akm_cli}, no plugin, opencode ${pins.opencode}, harbor ${pins.harbor}`);
  console.log(`  ${tasks.length} tasks, ${ATTEMPTS} attempt per arm; arms ${arms.join(", ")}`);
  if (status === "aborted") console.log(`  ABORTED      ${aborted_reason}`);
  if (verdict?.ok) console.log(`  CHECK OK     the reference passed every card and the no-op failed every one`);
  for (const line of formatReport(scored.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, dir)}/`);
  if (status === "aborted") fail(`${aborted_reason}. The results above cover the trials that finished. See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  return summary;
}

function corpusProblem(c: ResolvedCorpus): string | undefined {
  const where = corpusFolderOf(c.folder) ?? "the folder of --cases";
  for (const part of ["tasks", "libraries", "prompts", ARMS_FILE]) if (!existsSync(join(c.folder, part))) return `${where} must hold tasks/, libraries/, prompts/ and ${ARMS_FILE}, laid out as the public ones are`;
  return undefined;
}

async function main(): Promise<void> {
  let values: { check?: boolean; model?: string; corpus?: string; cases?: string; limit?: string; concurrency?: string; label?: string; akm?: string; "akm-env"?: string[]; semantic?: boolean; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, check: { type: "boolean" }, limit: { type: "string" }, concurrency: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`${NAME}: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: EVAL_DIR, rewrite: false, fail });
  const limit = positive("--limit", values.limit);
  const concurrency = positive("--concurrency", values.concurrency);
  const akmEnv = parseAkmEnv(values["akm-env"], values.semantic);
  if (values.akm !== undefined) parseAkm(values.akm);
  for (const c of corpora) {
    const problem = corpusProblem(c);
    if (problem) fail(problem);
  }
  const check = values.check === true;
  let settings: { model: string | null; env: Record<string, string>; modelLimits?: ModelLimits; modelReasoningEffort?: string };
  if (check) {
    if (values.model !== undefined) fail("--check calls no model; leave out --model");
    toolsOk();
    settings = { model: null, env: hostEnv(process.env) };
  } else {
    settings = preflight(values);
  }
  const label = values.label ?? (check ? "check" : slug(settings.model as string));
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  if (!check) await announceCases(values, [{ role: "model", name: settings.model as string, baseUrl: settings.env.OPENAI_BASE_URL }]);

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-"));
  try {
    const { arm, note } = values.akm === undefined ? { arm: DEFAULT_ARM, note: null } : akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    for (const c of corpora) await runCorpus(c, { check, ...settings, concurrency, label, limit, arm, akmEnv });
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
