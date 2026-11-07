#!/usr/bin/env bun
// project-intent: runs the same tasks with one akm arm per entry of projects.json (no project, a bare project, an explicit project), in
// Harbor, and reports each arm's pass rate, the paired differences, tokens per correct outcome and how often an answer took the other
// project's convention. See ../README.md.
//
//   evals/project-intent/run [--corpus public|custom] [--cases DIR] [--limit N] [--concurrency N] [--label NAME] [--model NAME] [--semantic] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

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
  akmArm,
  akmArmUsage,
  akmSummary,
  assetsSha256,
  completionOf,
  jobRecord,
  parseAkm,
  parseAkmEnv,
  pinsOf,
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
import { ARMS_FILE, ATTEMPTS, NAME, attemptsFor, collect } from "./collect.ts";
import { MEASUREMENT, casesIn } from "./measurement.ts";
import { type ProjectTrial, formatReport, makeRow, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** The akm of a run without --akm: the first release with projects, and the first plugin release that runs akm in the session's directory (it depends on exactly this CLI). */
export const DEFAULT_ARM: AkmArm = releaseArm("0.10.261111-beta");

const USAGE = `Usage: evals/project-intent/run [--corpus public|custom] [--cases DIR] [--limit N] [--concurrency N] [--label NAME] [--model NAME] [--semantic] [--akm akm-cli@x.y.z|CHECKOUT] [--akm-env KEY=VALUE]

Runs each task with opencode and the akm plugin once per arm of projects.json (the arms differ only in the akm config \`projects\`), in
Harbor, on the model in MODEL_NAME. Settings come from .env at the repository root.

${corpusUsage}
            custom is --cases DIR only: a folder with tasks/, libraries/ and projects.json, laid out as the public one.
  --limit   run N tasks, once per arm, spread over the task families. Without it every task runs ${ATTEMPTS} times per arm.
  --concurrency  simultaneous trials (default 4); use 1 to run one at a time.
  --model   the model: a line of models.json, or a model as the gateway names it, as opencode takes it. Default: MODEL_NAME in .env.
  --label   names the results folder: <UTC date>-<label>. Default: the model name.
${akmArmUsage.replace(`Default: akm-cli@${releaseArm().cli.version}.`, `Default: akm-cli@${DEFAULT_ARM.cli.version} with plugin ${DEFAULT_ARM.plugin.version}.`)}

Needs Docker, uv and bun. Tested with akm 0.10.261111-beta or later: projects arrived in it.`;

/** The trial grid of one arm, as lib/harbor counts it for its akm arm. */
const cellsOf = (trials: ProjectTrial[], arm: string, tasks: string[], attempts: number): Cells => completionOf(trials.filter((t) => t.project_arm === arm), tasks, attempts).akm;

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

export async function runCorpus(c: ResolvedCorpus, ctx: { model: string; modelLimits?: ModelLimits; modelReasoningEffort?: string; concurrency?: number; label: string; limit?: number; env: Record<string, string>; arm: AkmArm; akmEnv: Record<string, string> }, results = c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results")) {
  const all = taskNames(join(c.folder, "tasks"));
  const tasks = selectTasks(all, ctx.limit);
  const attempts = attemptsFor(ctx.limit);
  const dir = makeResultsDir(results, ctx.label);
  const got = await collect({ corpus: c.name, assets: c.folder, tasks, of: all.length, attempts, dir, model: ctx.model, modelLimits: ctx.modelLimits, modelReasoningEffort: ctx.modelReasoningEffort, concurrency: ctx.concurrency, env: ctx.env, arm: ctx.arm, akmEnv: ctx.akmEnv });
  const arms = Object.keys(got.arms);
  const completion = Object.fromEntries(arms.map((a) => [a, cellsOf(got.trials, a, tasks, attempts)]));
  const outside = got.trials.filter((t) => !arms.includes(t.project_arm)).length;
  const { status, aborted_reason } = statusOf({ exit: got.exit, jobWritten: existsSync(got.jobDir), trees: got.observed.dependency_trees?.length ?? 0, completion, outside });
  const job = jobRecord(got.cfg, dir, ROOT);

  const cases = casesIn(dir, tasks); // the run's own copy, as Harbor read it
  const kinds = new Map(cases.map((k) => [k.id, k.kind]));
  const rows = tasks.map((id) => makeRow({ id, kind: kinds.get(id) ?? "conflict" }, { arms, trials: got.trials.filter((t) => t.task === id) }));
  const scored = summarize(rows);
  const akmFields = akmSummary(ctx.arm, ctx.akmEnv, got.staged?.files ?? [], got.observed);
  const { datasets: _datasets, n_attempts: _attempts, ...jobSettings } = job;
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: c.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: ctx.arm.cli.version, bin: ctx.arm.bin, build: ctx.arm.build, build_fingerprint: akmFields.akm_build_fingerprint },
    config: jobSettings,
    engines: { opencode: { model: ctx.model, endpoint: endpointHost(ctx.env.OPENAI_BASE_URL), temperature: null, enableThinking: null, timeoutMs: null } },
    settings: { seed: null },
    eval_settings: { attempts },
    completion: casesCompletion(MEASUREMENT, tasks, rows),
  });
  const summary = {
    eval: NAME,
    corpus: c.name,
    corpus_folder: c.name === "custom" ? corpusFolderOf(c.folder) : null,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    model: ctx.model,
    ...akmFields,
    pins: pinsOf(ctx.arm),
    limit: ctx.limit ?? null,
    n_tasks: tasks.length,
    attempts,
    /** The arms: each label with the akm config `projects` it ran with. */
    arms: got.arms,
    harbor_exit: got.exit,
    status,
    aborted_reason,
    completion,
    libraries_sha256: got.librariesSha,
    tasks_sha256: got.taskDigests,
    arms_sha256: got.armsSha,
    assets_sha256: assetsSha256({ library: got.librariesSha, dataset: { tasks: got.taskDigests, arms: got.armsSha }, attempts }),
    engine: { model: ctx.model, endpoint: endpointHost(ctx.env.OPENAI_BASE_URL) },
    config: redactConfig(job),
    n_errored: scored.n_errored,
    metrics: scored.metrics,
    job,
    report: scored.report,
    manifest,
  };
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  console.log(`\n${NAME} (${c.name}) | model ${ctx.model} | akm-cli ${summary.pins.akm_cli}, plugin ${summary.pins.akm_plugin}, opencode ${summary.pins.opencode}, harbor ${summary.pins.harbor}`);
  console.log(`  ${tasks.length} tasks, ${attempts} ${attempts === 1 ? "attempt" : "attempts"} per arm; arms ${arms.join(", ")}`);
  if (status === "aborted") console.log(`  ABORTED      ${aborted_reason}`);
  for (const line of formatReport(scored.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, dir)}/`);
  if (status === "aborted") fail(`${aborted_reason}. The results above cover the trials that finished. See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  return summary;
}

function corpusProblem(c: ResolvedCorpus): string | undefined {
  const where = corpusFolderOf(c.folder) ?? "the folder of --cases";
  for (const part of ["tasks", "libraries", ARMS_FILE]) if (!existsSync(join(c.folder, part))) return `${where} must hold tasks/, libraries/ and ${ARMS_FILE}, laid out as the public ones are`;
  return undefined;
}

async function main(): Promise<void> {
  let values: { model?: string; corpus?: string; cases?: string; limit?: string; concurrency?: string; label?: string; akm?: string; "akm-env"?: string[]; semantic?: boolean; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, concurrency: { type: "string" }, ...MODEL_OPTIONS, ...AKM_ARM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
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
  const { model, env, modelLimits, modelReasoningEffort } = preflight(values);
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await announceCases(values, [{ role: "model", name: model, baseUrl: env.OPENAI_BASE_URL }]);

  const packs = mkdtempSync(join(tmpdir(), "akm-eval-akm-pack-"));
  try {
    const { arm, note } = values.akm === undefined ? { arm: DEFAULT_ARM, note: null } : akmArm(values.akm, packs);
    if (note) console.log(`${NAME}: ${note}`);
    for (const c of corpora) await runCorpus(c, { model, modelLimits, modelReasoningEffort, concurrency, label, limit, env, arm, akmEnv });
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

