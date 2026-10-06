// The akm sandbox the evals share: a temp folder with akm's own folders and config, and the environment akm
// runs in, so an eval never reads or writes the caller's bundle. Make one, write its config, run akm in it,
// and remove it when done.
//
//   const sandbox = createSandbox("my-eval", { keepModelKey: true });
//   try {
//     writeConfig(sandbox, engineConfig(baseUrl, model, hasKey));
//     const { stdout } = await runAkm(sandbox, ["search", "--", "a query"]);
//   } finally {
//     removeSandbox(sandbox);
//   }

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Sandbox {
  dir: string; // the temp folder, and the working folder of every akm run
  cmd: string[]; // the akm command: the words of AKM_BIN, or `akm`
  env: Record<string, string>; // the environment akm runs in
}

export interface AkmResult {
  stdout: string;
  stderr: string;
  code: number;
  ms: number; // how long the command ran
}

type RunOptions = { stdin?: string; timeoutMs?: number };

const FOLDERS = ["bundle", "config", "data", "cache", "state", "xdg-config", "xdg-data", "xdg-state"];
const DEFAULT_TIMEOUT_MS = 15 * 60_000; // a command that calls a model can take minutes

// Keyword search only and no registries: akm needs no model download and never goes to the network.
const plainConfig = () => ({ configVersion: "0.9.0", semanticSearchMode: "off", registries: [] });

/**
 * The environment akm runs in: its own folders under `dir`, none of the caller's AKM_ settings, and no judge
 * key. The model key stays only with `keepModelKey`.
 */
function sandboxEnv(dir: string, keepModelKey: boolean): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("AKM_") && k !== "JUDGE_API_KEY" && (keepModelKey || k !== "MODEL_API_KEY")) env[k] = v;
  }
  return {
    ...env,
    AKM_BUNDLE_DIR: join(dir, "bundle"),
    AKM_CONFIG_DIR: join(dir, "config"),
    AKM_DATA_DIR: join(dir, "data"),
    AKM_CACHE_DIR: join(dir, "cache"),
    AKM_STATE_DIR: join(dir, "state"),
    XDG_CONFIG_HOME: join(dir, "xdg-config"),
    XDG_DATA_HOME: join(dir, "xdg-data"),
    XDG_STATE_HOME: join(dir, "xdg-state"),
  };
}

/**
 * Makes a sandbox in a new temp folder, akm-eval-<name>-<random>. akm is `AKM_BIN`, one or more words such as
 * `bun /path/to/akm/src/cli.ts`, or `akm`. akm gets no MODEL_API_KEY unless `keepModelKey` is set, which a config
 * needs when it names the key as $MODEL_API_KEY, as engineConfig does. The config starts plain: replace it with
 * writeConfig.
 */
export function createSandbox(name: string, opts: { keepModelKey?: boolean } = {}): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), `akm-eval-${name}-`));
  for (const folder of FOLDERS) mkdirSync(join(dir, folder));
  const sandbox = { dir, cmd: (process.env.AKM_BIN?.trim() || "akm").split(/\s+/), env: sandboxEnv(dir, opts.keepModelKey ?? false) };
  writeConfig(sandbox, plainConfig());
  return sandbox;
}

export function removeSandbox(sandbox: Sandbox): void {
  rmSync(sandbox.dir, { recursive: true, force: true });
}

/** Writes akm's config file in the sandbox, in place of the one there. */
export function writeConfig(sandbox: Sandbox, config: unknown): void {
  writeFileSync(join(sandbox.dir, "config", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

/** Runs akm with these arguments in the sandbox. A command still running after `timeoutMs` is killed with SIGKILL. */
export async function runAkm(sandbox: Sandbox, args: string[], opts: RunOptions = {}): Promise<AkmResult> {
  const t0 = performance.now();
  const proc = Bun.spawn([...sandbox.cmd, ...args], {
    env: sandbox.env,
    cwd: sandbox.dir,
    stdin: opts.stdin === undefined ? "ignore" : new Blob([opts.stdin]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code, ms: performance.now() - t0 };
}

/** Runs akm with `--format json` and parses what it prints. The flag goes before any `--`, so a query after it stays a query. */
export async function runAkmJson<T = unknown>(sandbox: Sandbox, args: string[], opts: RunOptions = {}): Promise<T> {
  const at = args.indexOf("--");
  const json = ["--format", "json"];
  const { stdout, stderr, code } = await runAkm(sandbox, at < 0 ? [...args, ...json] : [...args.slice(0, at), ...json, ...args.slice(at)], opts);
  if (code !== 0) throw new Error(`akm ${args[0]} failed (exit ${code}): ${stderr.trim().slice(-300)}`);
  return JSON.parse(stdout) as T;
}

/** The version akm prints, such as 0.9.26. Throws when akm cannot be run. */
export async function akmVersion(sandbox: Sandbox): Promise<string> {
  const { stdout, stderr, code } = await runAkm(sandbox, ["--version"], { timeoutMs: 60_000 }).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127 }));
  const version = stdout.trim().match(/\d+\.\d+\.\d+\S*/)?.[0];
  if (code !== 0 || !version) throw new Error(`could not run \`${sandbox.cmd.join(" ")} --version\`. Install akm or set AKM_BIN. ${stderr.trim().slice(0, 200)}`);
  return version;
}

/**
 * The akm config for an eval with a model: one LLM engine, the model under test, as the default engine, and
 * plain config otherwise. The key is named by variable and never held. To send one process to the engine, add
 * its routing to the returned object. `name` is the engine's name in the config, and what akm reports for it.
 */
export function engineConfig(baseUrl: string, model: string, hasKey: boolean, name = "model"): Record<string, any> {
  const base = baseUrl.replace(/\/+$/, "");
  const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  return {
    ...plainConfig(),
    engines: { [name]: { kind: "llm", provider: "openai", endpoint, model, ...(hasKey ? { apiKey: "$MODEL_API_KEY" } : {}), timeoutMs: 600_000 } },
    defaults: { llmEngine: name },
  };
}
