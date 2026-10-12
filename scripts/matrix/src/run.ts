#!/usr/bin/env bun
// matrix: runs a matrix file (a baseline and configurations of the evals under evals/) in two stages: every row once (screen), then
// the rows that differ from their baseline, several times (confirm). Each stage writes decision.md and decision.json, and exits non-zero
// when a job exited non-zero, wrote no summary or did not complete. See ../../../README.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Fatal, fail } from "../../../lib/cli.ts";
import { buildDecision, noiseFloors, noiseLine, renderMarkdown } from "./decision.ts";
import { fingerprintOf, resumable } from "./fingerprint.ts";
import { type Job, type Matrix, type RunRecord, type Stage, type State, confirmJobs, emptyState, findResults, parseMatrix, runnerFolder, runnerPath, schedule, screenJobs, selectForConfirm, unusableReason } from "./lib.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const USAGE = `Usage: scripts/matrix/run MATRIX.json --stage screen|confirm|report [--parallel N] [--out DIR] [--prefix NAME] [--only A,B] [--min-delta X] [--force] [--dry-run]

Runs the evals and benchmarks of a matrix file (a row's "eval" is an eval of evals/ or terminal-bench of benchmarks/) with the model in
.env (or the environment), or the file's "model" and "akm". The Harbor evals (agent-ab, terminal-bench) are not given the file's "akm":
their --akm is a release or a checkout's folder, so a row names its own. A config row whose --akm differs from its baseline's, or with
"treatment": "build", compares two akm builds; "treatment" may name any of build, config, model, inputs and harness (or a list), and
every axis it does not name must be the same in the baseline and the config. Stages:

  --stage screen   runs the baseline and every config once, with the label <prefix>-<name>-s, and the --limit of the file's
                   "screen.limit" for its eval
  --stage confirm  runs --repeat N (the file's "repeats", default 3, at least 3) for the baseline and for every config whose screen result differs from
                   its baseline's, with the label <prefix>-<name>-c. First it prints, for each baseline already confirmed, the per-case
                   noise floor of its repeats (scripts/compare), which is where to start --min-delta. The decision then has a paired
                   column: scripts/compare on all the repeats of each side, pooled by case
  --stage report   writes decision.md and decision.json from the results so far (every stage also writes them)

A job whose process exits non-zero is a failure: its artifacts and log are kept, the stage exits 1, and its result is not used to select
a config or to reach a verdict. A summary is a result only when it says status "complete" (and no result is missing from its completion).

  --parallel N     runs of different evals at the same time (default 1); two runs of one eval never overlap
  --out DIR        the results folder: state.json, logs/, decision.md and decision.json (default: <MATRIX>-results next to the file)
  --prefix NAME    the label prefix (default: the file's "prefix", else the file's name)
  --only A,B       confirm: these configs, whatever their screen result
  --min-delta X    confirm: a config differs when a main or harm metric of the screen moved by more than X (default 0: any change, which
                   filters almost nothing. Read X from the noise floor that confirm prints)
  --force          run rows again that a stage already ran, though nothing they were made from has changed. A stage skips a row only when it
                   exited 0, its results are still there, and its arguments, the bytes of its --config-patch and --cases, the corpus it
                   reads, the model settings (MODEL_NAME, MODEL_BASE_URL and JUDGE_BASE_URL each whole with its path, JUDGE_MODEL,
                   models.json, and OPENAI_BASE_URL for a Harbor eval), its akm (the command, its build and uncommitted changes, and the
                   version it prints) and this repository's code (git HEAD and the diff of tracked changes) are the same as when it ran
  --dry-run        print what a stage would run`;

function loadState(file: string, m: Matrix): State {
  if (!existsSync(file)) return emptyState(m);
  return JSON.parse(readFileSync(file, "utf8")) as State;
}

async function main(): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true, options: { stage: { type: "string" }, parallel: { type: "string" }, out: { type: "string" }, prefix: { type: "string" }, only: { type: "string" }, "min-delta": { type: "string" }, force: { type: "boolean" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  } catch (e) {
    console.error(`matrix: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed as { values: Record<string, string | boolean | undefined>; positionals: string[] };
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length !== 1) fail(`give the matrix file\n\n${USAGE}`);
  const stage = values.stage;
  if (stage !== "screen" && stage !== "confirm" && stage !== "report") fail("--stage must be screen, confirm or report");
  const parallel = values.parallel === undefined ? 1 : Number(values.parallel);
  if (!Number.isInteger(parallel) || parallel < 1) fail("--parallel must be a positive integer");
  const minDelta = values["min-delta"] === undefined ? 0 : Number(values["min-delta"]);
  if (!Number.isFinite(minDelta) || minDelta < 0) fail("--min-delta must be a number of 0 or more");

  const file = resolve(positionals[0]);
  let matrix: Matrix;
  try {
    matrix = parseMatrix(JSON.parse(readFileSync(file, "utf8")), file, values.prefix as string | undefined);
  } catch (e) {
    return fail(`${basename(file)}: ${(e as Error).message}`);
  }
  const out = resolve((values.out as string | undefined) ?? join(dirname(file), `${basename(file, extname(file))}-results`));
  const stateFile = join(out, "state.json");
  const state = loadState(stateFile, matrix);
  const save = () => writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const report = () => {
    const d = buildDecision(ROOT, matrix, state, minDelta);
    writeFileSync(join(out, "decision.json"), `${JSON.stringify(d, null, 2)}\n`);
    writeFileSync(join(out, "decision.md"), renderMarkdown(d));
    console.log(`matrix: decision in ${join(out, "decision.md")}`);
  };

  let jobs: Job[] = [];
  if (stage === "screen") jobs = screenJobs(matrix);
  if (stage === "confirm") {
    const only = values.only === undefined ? undefined : String(values.only).split(",").map((s) => s.trim()).filter(Boolean);
    const { floors, notes } = noiseFloors(ROOT, matrix, state);
    for (const f of floors) console.log(`noise    ${noiseLine(f)}`);
    for (const n of notes) console.log(`noise    ${n}: not measured`);
    if (floors.length === 0 && notes.length === 0) console.log("noise    none yet: no baseline has been confirmed, so there are no repeats to measure. Once one has, this stage prints its flip rate. By hand: scripts/compare/run --repeats <a results folder up to the label>");
    const { selected, skipped } = selectForConfirm(ROOT, matrix, state, { only, minDelta });
    for (const s of selected) console.log(`confirm  ${s.config.name}: ${s.reason}`);
    for (const s of skipped) console.log(`skip     ${s.config.name}: ${s.reason}`);
    jobs = confirmJobs(matrix, selected);
  }
  if (values["dry-run"]) {
    for (const j of jobs) console.log(`${runnerFolder(j.row.eval)}/${j.row.eval}/run ${j.args.join(" ")}`);
    return 0;
  }
  mkdirSync(join(out, "logs"), { recursive: true });
  if (stage === "report") {
    report();
    return 0;
  }

  const slot = state[stage as Stage];
  const children = new Set<ReturnType<typeof Bun.spawn>>();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      for (const c of children) c.kill(sig);
      save();
      process.exit(130);
    });
  }
  let failed = 0;
  const runJob = async (job: Job): Promise<void> => {
    // What the job is made from, taken now: the files its arguments name, the model settings, the akm and this repository's code.
    const fingerprint = fingerprintOf(ROOT, job);
    const prior = slot[job.row.name];
    const resume = resumable(ROOT, prior, job, fingerprint);
    if (!values.force && resume.skip) {
      console.log(`${stage}  ${job.row.name}: already ran with the same inputs, skipped (--force runs it again)`);
      return;
    }
    if (!values.force && resume.why) console.log(`${stage}  ${job.row.name}: running again, ${resume.why}`);
    const log = join(out, "logs", `${job.label}.log`);
    const started = Date.now();
    console.log(`${stage}  ${job.row.name}: ${runnerFolder(job.row.eval)}/${job.row.eval}/run ${job.args.join(" ")}`);
    const proc = Bun.spawn(["bash", "-c", 'exec "$@" >> "$0" 2>&1', log, runnerPath(ROOT, job.row.eval), ...job.args], { cwd: ROOT, env: process.env, stdin: "ignore" });
    children.add(proc);
    const code = await proc.exited;
    children.delete(proc);
    const record: RunRecord = {
      stage: stage as Stage,
      name: job.row.name,
      eval: job.row.eval,
      label: job.label,
      args: job.args,
      repeat: job.repeat,
      started: new Date(started).toISOString(),
      wall_seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      exit_code: code,
      log: log.startsWith(`${ROOT}/`) ? log.slice(ROOT.length + 1) : log,
      results: findResults(ROOT, job, started - 1000),
      fingerprint: fingerprint.sha256,
      fingerprint_parts: fingerprint.parts,
    };
    slot[job.row.name] = record;
    save();
    // A run that exited non-zero, or gave up, or did not say it finished, wrote its summary and its artifacts first. They are found and kept,
    // and they are no result: the stage fails and the decision does not use them.
    const unusable = unusableReason(ROOT, record);
    if (unusable) failed++;
    console.log(`${stage}  ${job.row.name}: exit ${code} after ${record.wall_seconds}s, ${record.results.length} result${record.results.length === 1 ? "" : "s"}${unusable ? `, the run ${unusable}, see ${record.log}` : ""}`);
  };
  await schedule(jobs, parallel, (j) => j.row.eval, runJob);
  report();
  return failed > 0 ? 1 : 0;
}

try {
  process.exit(await main());
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error(`matrix: ${e.message}`);
  process.exit(2);
}
