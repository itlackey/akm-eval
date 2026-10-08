// What the evals that run an agent in Harbor share: the versions a run is made of, the model, the two arms and
// Harbor itself. evals/agent-ab and benchmarks/terminal-bench both run opencode alone and with the akm plugin on the
// same tasks, and both import this. The akm arm is akm_opencode.py beside it, and report.ts reads what the run leaves.

import { createWriteStream } from "node:fs";
import { join, resolve } from "node:path";

/** What a run is made of. Change one at a time: a difference between two runs that moved two of them has no single cause. */
export const PINS = { akm_cli: "0.9.26", akm_plugin: "0.9.26202610051302", opencode: "1.18.34", harbor: "0.24.0" } as const;

export const CONCURRENT_TRIALS = 4;
const SETUP_TIMEOUT_SEC = 2700; // the akm arm installs akm and the plugin first. Both arms get the same.

export class Fatal extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

export function fail(message: string, code = 2): never {
  throw new Fatal(message, code);
}

export function gitCommit(root: string): string {
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", root, ...args], { stderr: "ignore" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.exitCode !== 0) return "unknown";
  const dirty = run(["status", "--porcelain", "--untracked-files=no"]).stdout.toString().trim() !== "";
  return head.stdout.toString().trim() + (dirty ? "-dirty" : "");
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A model name as opencode takes it. One without a provider is an openai model. */
export function modelName(name: string): string {
  return name.includes("/") ? name : `openai/${name}`;
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
export function preflight(): { model: string; env: Record<string, string> } {
  const settings = modelSettings(process.env);
  if (!Bun.which("uv")) fail("uv is needed. See https://docs.astral.sh/uv/");
  if (Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).exitCode !== 0) fail("Docker is not reachable: `docker info` failed. Every trial runs in a container.");
  return settings;
}

/**
 * The Harbor job: the two arms on the same datasets. They get the same model, the same opencode, the same config and
 * the same setup time. The only config the arms differ in is the plugin, which the akm arm's agent adds, and the akm
 * arm installs akm and seeds a library (see akm_opencode.py): the one the task names in `AKM_TASK_STASH`, or the one
 * `akm.env` names for a task that is not ours. `akm.kwargs` are more options of that agent.
 */
export function jobConfig(o: {
  name: string;
  model: string;
  jobsDir: string;
  attempts: number;
  librariesDir: string;
  datasets: Record<string, unknown>[];
  akm?: { env?: Record<string, string>; kwargs?: Record<string, unknown> };
}): Record<string, unknown> {
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
        ...(o.akm?.env ? { env: o.akm.env } : {}),
        kwargs: { version: PINS.opencode, opencode_config: opencodeConfig, akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin, libraries_dir: o.librariesDir, ...o.akm?.kwargs },
      },
    ],
    datasets: o.datasets,
  };
}

/** Runs Harbor in a Python environment that has exactly the pinned release, and copies what it prints to the log. */
export async function runHarbor(configFile: string, logFile: string, env: Record<string, string>): Promise<number> {
  const log = createWriteStream(logFile);
  const proc = Bun.spawn(["uv", "run", "--no-project", "--python", "3.12", "--with", `harbor==${PINS.harbor}`, "harbor", "run", "-c", configFile, "--yes"], {
    env: { ...env, PYTHONPATH: resolve(import.meta.dir) }, // where akm_opencode.py is
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
