#!/usr/bin/env bun
// matrix: runs a matrix file (a baseline and configurations of the evals under evals/) in two stages: every row once (screen), then
// the rows that differ from their baseline, several times (confirm). Each stage writes decision.md and decision.json. See ../../../README.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Job, type Matrix, type RunRecord, type Stage, type State, buildDecision, confirmJobs, emptyState, findResults, parseMatrix, renderMarkdown, schedule, screenJobs, selectForConfirm } from "./lib.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const USAGE = `Usage: scripts/matrix/run MATRIX.json --stage screen|confirm|report [--parallel N] [--out DIR] [--prefix NAME] [--only A,B] [--min-delta X] [--force] [--dry-run]

Runs the evals of a matrix file with the model in .env (or the environment), or the file's "model" and "akm". Stages:

  --stage screen   runs the baseline and every config once, with the label <prefix>-<name>-s, and the --limit of the file's
                   "screen.limit" for its eval
  --stage confirm  runs --repeat N (the file's "repeats", default 3) for the baseline and for every config whose screen result differs from
                   its baseline's, with the label <prefix>-<name>-c
  --stage report   writes decision.md and decision.json from the results so far (every stage also writes them)

  --parallel N     runs of different evals at the same time (default 1); two runs of one eval never overlap
  --out DIR        the results folder: state.json, logs/, decision.md and decision.json (default: <MATRIX>-results next to the file)
  --prefix NAME    the label prefix (default: the file's "prefix", else the file's name)
  --only A,B       confirm: these configs, whatever their screen result
  --min-delta X    confirm: a config differs when a main or harm metric of the screen moved by more than X (default 0: any change)
  --force          run rows again that a stage already ran with the same arguments
  --dry-run        print what a stage would run`;

class Fatal extends Error {}
const fail = (m: string): never => {
  throw new Fatal(m);
};

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
    const { selected, skipped } = selectForConfirm(ROOT, matrix, state, { only, minDelta });
    for (const s of selected) console.log(`confirm  ${s.config.name}: ${s.reason}`);
    for (const s of skipped) console.log(`skip     ${s.config.name}: ${s.reason}`);
    jobs = confirmJobs(matrix, selected);
  }
  if (values["dry-run"]) {
    for (const j of jobs) console.log(`evals/${j.row.eval}/run ${j.args.join(" ")}`);
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
    const prior = slot[job.row.name];
    if (!values.force && prior && prior.exit_code === 0 && prior.results.length > 0 && prior.label === job.label && JSON.stringify(prior.args) === JSON.stringify(job.args)) {
      console.log(`${stage}  ${job.row.name}: already ran, skipped (--force runs it again)`);
      return;
    }
    const log = join(out, "logs", `${job.label}.log`);
    const started = Date.now();
    console.log(`${stage}  ${job.row.name}: evals/${job.row.eval}/run ${job.args.join(" ")}`);
    const proc = Bun.spawn(["bash", "-c", 'exec "$@" >> "$0" 2>&1', log, join(ROOT, "evals", job.row.eval, "run"), ...job.args], { cwd: ROOT, env: process.env, stdin: "ignore" });
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
    };
    slot[job.row.name] = record;
    save();
    if (record.results.length === 0) failed++;
    console.log(`${stage}  ${job.row.name}: exit ${code} after ${record.wall_seconds}s, ${record.results.length} result${record.results.length === 1 ? "" : "s"}${record.results.length === 0 ? `, see ${record.log}` : ""}`);
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
