#!/usr/bin/env bun
// agent-ab: runs the same tasks with opencode alone and with opencode plus the akm plugin, in Harbor, and reports
// how often each passes and whether the agent called akm. See ../README.md.
//
//   evals/agent-ab/run [--corpus public|private|all] [--limit N] [--label NAME]

import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Report, type Trial, buildReport, formatReport, loadTrials } from "./report.ts";

const NAME = "agent-ab";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");

/** What a run is made of. Change one at a time: a difference between two runs that moved two of them has no single cause. */
export const PINS = { akm_cli: "0.9.26", akm_plugin: "0.9.26202610051302", opencode: "1.18.34", harbor: "0.24.0" } as const;

const ATTEMPTS = 3; // per task and arm in a full run. A run with --limit makes one, to check a setup.
const CONCURRENT_TRIALS = 4;
const SETUP_TIMEOUT_SEC = 2700; // the akm arm installs akm and the plugin first. Both arms get the same.

const USAGE = `Usage: evals/agent-ab/run [--corpus public|private|all] [--limit N] [--label NAME]

Runs each task with opencode alone and with opencode plus the akm plugin, in Harbor, on the model in MODEL_NAME.
Settings come from .env at the repository root.

  --corpus  public (default) reads tasks/ and libraries/. private reads private/agent-ab/assets/, made by
            ./generate-assets. all runs both and prints the two results side by side.
  --limit   run N tasks, once per arm, spread over the task families. Without it every task runs ${ATTEMPTS} times per arm.
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs Docker, uv and bun. MODEL_NAME is the model as opencode names it, such as openai/gpt-6-luna. A name without a
provider is read as an openai model. The key goes in MODEL_API_KEY or OPENAI_API_KEY, and MODEL_BASE_URL sets another
endpoint, which a container must be able to reach.`;

type Corpus = "public" | "private";

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  pins: typeof PINS;
  limit: number | null;
  n_tasks: number;
  attempts: number;
  harbor_exit: number;
  report: Report;
  results_dir: string;
}

class Fatal extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

function fail(message: string, code = 2): never {
  throw new Fatal(message, code);
}

function gitCommit(): string {
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", ROOT, ...args], { stderr: "ignore" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.exitCode !== 0) return "unknown";
  const dirty = run(["status", "--porcelain", "--untracked-files=no"]).stdout.toString().trim() !== "";
  return head.stdout.toString().trim() + (dirty ? "-dirty" : "");
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function makeResultsDir(parent: string, label: string): string {
  const base = join(parent, `${new Date().toISOString().slice(0, 10)}-${label}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The task folders under `dir`: the ones with a task.toml, by name. */
export function taskNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "task.toml")))
    .map((e) => e.name)
    .sort();
}

/**
 * The tasks a run uses. Without a limit, all of them. With one, N tasks taken from the families in turn (a task's
 * family is the name before `--`), each family in name order, so a short run holds as many families as it can.
 */
export function selectTasks(names: string[], limit?: number): string[] {
  if (limit === undefined || limit >= names.length) return names;
  const families = new Map<string, string[]>();
  for (const n of names) families.set(n.split("--")[0], [...(families.get(n.split("--")[0]) ?? []), n]);
  const picked: string[] = [];
  for (let round = 0; picked.length < limit; round++) {
    for (const list of families.values()) if (list[round] !== undefined && picked.length < limit) picked.push(list[round]);
  }
  return picked;
}

/** A model name as opencode takes it. One without a provider is an openai model. */
export function modelName(name: string): string {
  return name.includes("/") ? name : `openai/${name}`;
}

/**
 * The Harbor job: the two arms on the same tasks. They get the same model, the same opencode, the same config and
 * the same setup time. The only config the arms differ in is the plugin, which the akm arm's agent adds, and the akm
 * arm installs akm and seeds the library the task names (see agent/akm_opencode.py).
 */
export function jobConfig(o: { name: string; model: string; tasksDir: string; tasks: string[]; librariesDir: string; attempts: number; jobsDir: string }): Record<string, unknown> {
  // The same model does opencode's side jobs, such as titling a session, so the run calls one model only.
  const opencodeConfig = { $schema: "https://opencode.ai/config.json", autoupdate: false, small_model: o.model };
  const both = { model_name: o.model, override_setup_timeout_sec: SETUP_TIMEOUT_SEC };
  return {
    job_name: o.name,
    jobs_dir: o.jobsDir,
    n_attempts: o.attempts,
    n_concurrent_trials: CONCURRENT_TRIALS,
    environment: { type: "docker", delete: true },
    agents: [
      { name: "opencode", ...both, kwargs: { version: PINS.opencode, opencode_config: opencodeConfig } },
      {
        import_path: "akm_opencode:AkmOpenCode",
        ...both,
        kwargs: { version: PINS.opencode, opencode_config: opencodeConfig, akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin, libraries_dir: o.librariesDir },
      },
    ],
    datasets: [{ path: o.tasksDir, task_names: o.tasks }],
  };
}

/** Runs Harbor in a Python environment that has exactly the pinned release, and copies what it prints to the log. */
async function runHarbor(configFile: string, logFile: string, env: Record<string, string>): Promise<number> {
  const log = createWriteStream(logFile);
  const proc = Bun.spawn(["uv", "run", "--no-project", "--python", "3.12", "--with", `harbor==${PINS.harbor}`, "harbor", "run", "-c", configFile, "--yes"], {
    env: { ...env, PYTHONPATH: join(EVAL_DIR, "agent") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const tee = async (stream: ReadableStream<Uint8Array>, to: NodeJS.WriteStream) => {
    for await (const chunk of stream) {
      to.write(chunk);
      log.write(chunk);
    }
  };
  await Promise.all([tee(proc.stdout, process.stdout), tee(proc.stderr, process.stderr)]);
  const code = await proc.exited;
  await new Promise((done) => log.end(done));
  return code;
}

function printSummary(s: Summary): void {
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm-cli ${s.pins.akm_cli}, plugin ${s.pins.akm_plugin}, opencode ${s.pins.opencode}, harbor ${s.pins.harbor}`);
  console.log(`  ${s.n_tasks} tasks, ${s.attempts} ${s.attempts === 1 ? "attempt" : "attempts"} per arm`);
  for (const line of formatReport(s.report)) console.log(line);
  console.log(`  results      ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
export function sideBySide(a: Pick<Summary, "corpus" | "report">, b: Pick<Summary, "corpus" | "report">): string[] {
  const rate = (r: Report["control"]) => (r.pass_rate ? `${r.pass_rate.value.toFixed(3)} [${r.pass_rate.lo.toFixed(3)}, ${r.pass_rate.hi.toFixed(3)}] over ${r.pass_rate.n} tasks` : "n/a");
  const diff = (r: Report) => (r.delta ? `${r.delta.value >= 0 ? "+" : ""}${r.delta.value.toFixed(3)} [${r.delta.lo.toFixed(3)}, ${r.delta.hi.toFixed(3)}] over ${r.delta.n} tasks` : "n/a");
  const called = (r: Report) => `${r.engagement.called} of ${r.engagement.trials} akm trials`;
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["control pass rate", rate(a.report.control), rate(b.report.control)],
    ["akm pass rate", rate(a.report.akm), rate(b.report.akm)],
    ["difference", diff(a.report), diff(b.report)],
    ["akm called in", called(a.report), called(b.report)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  return [`${NAME}: public and private side by side (not pooled)`, ...rows.map((r) => `  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`)];
}

export async function runCorpus(corpus: Corpus, ctx: { model: string; label: string; limit?: number; env: Record<string, string> }): Promise<Summary> {
  const assets = corpus === "public" ? EVAL_DIR : join(ROOT, "private", NAME, "assets");
  const tasksDir = join(assets, "tasks");
  const librariesDir = join(assets, "libraries");
  const all = taskNames(tasksDir);
  const tasks = selectTasks(all, ctx.limit);
  const attempts = ctx.limit === undefined ? ATTEMPTS : 1;
  const dir = makeResultsDir(corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"), ctx.label);
  const jobsDir = join(dir, "jobs");
  const jobName = `${NAME}-${corpus}`;
  const configFile = join(dir, "job.json");
  writeFileSync(configFile, `${JSON.stringify(jobConfig({ name: jobName, model: ctx.model, tasksDir, tasks, librariesDir, attempts, jobsDir }), null, 2)}\n`);
  console.log(`${NAME} (${corpus}): ${tasks.length} of ${all.length} tasks x 2 arms x ${attempts} = ${tasks.length * 2 * attempts} trials, ${CONCURRENT_TRIALS} at a time`);

  const exit = await runHarbor(configFile, join(dir, "harbor.log"), ctx.env);
  const jobDir = join(jobsDir, jobName);
  if (!existsSync(jobDir)) fail(`Harbor wrote no job (exit ${exit}). See ${relative(ROOT, join(dir, "harbor.log"))}`, 1);
  const trials: Trial[] = loadTrials(jobDir);
  const summary: Summary = {
    eval: NAME,
    corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(),
    model: ctx.model,
    pins: PINS,
    limit: ctx.limit ?? null,
    n_tasks: tasks.length,
    attempts,
    harbor_exit: exit,
    report: buildReport(trials),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), trials.map((t) => `${JSON.stringify(t)}\n`).join(""));
  printSummary(summary);
  if (exit !== 0) fail(`Harbor exited ${exit}. The results above cover the trials that finished.`, 1);
  return summary;
}

/**
 * The model and the environment Harbor runs in, from the settings in `env`. An openai model needs a key, in
 * OPENAI_API_KEY or MODEL_API_KEY, and may name another endpoint in OPENAI_BASE_URL or MODEL_BASE_URL. Another
 * provider's key is read by Harbor under that provider's own name, so it needs nothing here.
 */
export function modelSettings(env: Record<string, string | undefined>): { model: string; env: Record<string, string> } {
  const name = env.MODEL_NAME?.trim();
  if (!name) fail("set MODEL_NAME in .env, as opencode names the model, such as openai/gpt-6-luna. See .env.example.");
  const model = modelName(name);
  const out: Record<string, string> = Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined));
  if (model.startsWith("openai/")) {
    const key = env.OPENAI_API_KEY?.trim() || env.MODEL_API_KEY?.trim();
    if (!key) fail("no model key: set MODEL_API_KEY (or OPENAI_API_KEY). Every trial would fail at the model call, after its setup.");
    out.OPENAI_API_KEY = key;
    const baseUrl = env.OPENAI_BASE_URL?.trim() || env.MODEL_BASE_URL?.trim();
    if (baseUrl && /^https?:\/\/(localhost|127\.|\[::1\])/.test(baseUrl)) fail(`MODEL_BASE_URL ${baseUrl} would be the container itself, not the model server. Use the address a container reaches it at.`);
    if (baseUrl) out.OPENAI_BASE_URL = baseUrl;
  }
  return { model, env: out };
}

/** What a run needs besides the model, checked before the first container starts. */
function preflight(): { model: string; env: Record<string, string> } {
  const settings = modelSettings(process.env);
  if (!Bun.which("uv")) fail("uv is needed. See https://docs.astral.sh/uv/");
  if (Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).exitCode !== 0) fail("Docker is not reachable: `docker info` failed. Every trial runs in a container.");
  return settings;
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`agent-ab: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "all") fail(`--corpus must be public, private or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];
  for (const c of corpora) {
    if (c === "private" && !existsSync(join(ROOT, "private", NAME, "assets", "tasks"))) fail(`the private assets are missing (private/${NAME}/assets/tasks). Make them with: ./generate-assets --only ${NAME}`);
  }
  const { model, env } = preflight();
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(await runCorpus(c, { model, label, limit, env }));
  if (summaries.length === 2) for (const line of ["", ...sideBySide(summaries[0], summaries[1])]) console.log(line);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`agent-ab: ${e.message}`);
    process.exit(e.code);
  }
}
