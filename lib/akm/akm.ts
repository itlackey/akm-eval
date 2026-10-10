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
//
// A sandbox made with { semantic: true } searches with akm's built-in embedder as well as with keywords. Embedding a library
// takes minutes to an hour, so index-cache.ts keeps the semantic index of a collection between runs.

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

/** The model of akm's built-in embedder, bge-small-en-v1.5, which runs in the akm process: no model service. It is akm 0.9.26's default. */
export const SEMANTIC_MODEL = "Xenova/bge-small-en-v1.5";

/** What the repository keeps between runs, in its gitignored .cache/: akm's embedding model, and the semantic indexes of index-cache.ts. */
const CACHE = join(import.meta.dir, "..", "..", ".cache");

/**
 * Where every sandbox finds the embedding model. akm downloads it (133 MB, from the Hugging Face Hub) the first time an
 * index is built with embeddings, and reads it from here after that.
 */
const MODEL_CACHE = join(CACHE, "models");

/** The folder of the semantic indexes that are kept between runs. */
export const INDEX_CACHE = join(CACHE, "akm-index");

// Keyword search fused with the nearest vectors of the embedder. Each akm process loads the model to embed its query, which
// takes a second alone and several with eight at once. akm answers with keyword search alone when the query is not embedded
// within embedding.queryTimeoutMs, 3 seconds unless set: 2 calls of 96 did at eight at once on a busy machine. So the wait is long.
export const semanticConfig = () => ({ ...plainConfig(), semanticSearchMode: "auto", embedding: { localModel: SEMANTIC_MODEL, queryTimeoutMs: 10 * 60_000 } });

/**
 * The environment akm runs in: its own folders under `dir`, none of the caller's AKM_ settings, and no judge
 * key. The model key stays only with `keepModelKey`. A semantic sandbox keeps the embedder's model in MODEL_CACHE.
 */
function sandboxEnv(dir: string, keepModelKey: boolean, semantic: boolean): Record<string, string> {
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
    ...(semantic ? { HF_HOME: MODEL_CACHE } : {}),
  };
}

/** The akm command: the words of AKM_BIN, or `akm`. */
const akmCommand = (): string[] => (process.env.AKM_BIN?.trim() || "akm").split(/\s+/);

/** `--akm`, for parseArgs, and its line of an eval's usage text. */
export const AKM_OPTIONS = { akm: { type: "string" } } as const;
export const akmUsage = `  --akm           the command that runs akm, such as "bun ~/code/akm/src/cli.ts". Default: AKM_BIN in .env, else akm on PATH.`;

/** Runs this process's akm as `--akm` says, which wins over AKM_BIN. A leading ~/ in a word is your home folder. `fail` ends the run with a message. */
export function useAkm(values: { akm?: string }, fail: (message: string) => never, env: Record<string, string | undefined> = process.env): void {
  if (values.akm === undefined) return;
  if (!values.akm.trim()) fail("--akm needs the command that runs akm");
  env.AKM_BIN = values.akm.trim().replace(/(^|\s)~\//g, `$1${homedir()}/`);
}

/**
 * Makes a sandbox in the folder `dir`, which it makes if need be: akm's own folders and config in it, unless the folder has a config already. akm is `AKM_BIN`, one or more
 * words such as `bun /path/to/akm/src/cli.ts`, or `akm`. akm gets no MODEL_API_KEY unless `keepModelKey` is set, which a
 * config needs when it names the key as $MODEL_API_KEY, as engineConfig does. The config starts plain, keyword search
 * only: replace it with writeConfig. With `semantic`, it starts as keyword search fused with the vectors of akm's built-in
 * embedder, whose model is kept in the repository's .cache/ and downloaded once. akm answers such a query with
 * searchMode "semantic", and an eval that scores it has to check that.
 */
export function sandboxIn(dir: string, opts: { keepModelKey?: boolean; semantic?: boolean } = {}): Sandbox {
  for (const folder of FOLDERS) mkdirSync(join(dir, folder), { recursive: true });
  const semantic = opts.semantic ?? false;
  if (semantic) mkdirSync(MODEL_CACHE, { recursive: true });
  const sandbox = { dir, cmd: akmCommand(), env: sandboxEnv(dir, opts.keepModelKey ?? false, semantic) };
  if (!existsSync(join(dir, "config", "config.json"))) writeConfig(sandbox, semantic ? semanticConfig() : plainConfig());
  return sandbox;
}

/** A sandbox in a new temp folder, akm-eval-<name>-<random>, for removeSandbox to remove. See sandboxIn. */
export function createSandbox(name: string, opts: { keepModelKey?: boolean; semantic?: boolean } = {}): Sandbox {
  return sandboxIn(mkdtempSync(join(tmpdir(), `akm-eval-${name}-`)), opts);
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

/** The flag words that ask search for its agent projection, from the text of `akm search --help`: 0.9.x has `--shape agent`, 0.10 folds it into `--detail agent`. Null when the text names neither. */
export function agentDetailFrom(help: string): string[] | null {
  if (/--shape[= ]/.test(help)) return ["--shape", "agent"];
  return /--detail[= ]/.test(help) ? ["--detail", "agent"] : null;
}

const agentDetailCache = new Map<string, Promise<string[]>>();

/**
 * The flag words that ask `akm search` for the agent projection, in the spelling of the akm under test, asked once per akm
 * command. They come from the help, not from `--version`, because a pre-release 0.10 build still prints a 0.9.x version.
 * Later breaking spellings go here too. When the help cannot be read, it answers with the 0.10 spelling and says so on stderr, once.
 */
export function agentDetailArgs(sandbox: Sandbox): Promise<string[]> {
  const key = sandbox.cmd.join(" ");
  let known = agentDetailCache.get(key);
  if (!known) {
    known = runAkm(sandbox, ["search", "--help"], { timeoutMs: 60_000 })
      .then(({ stdout, stderr }) => agentDetailFrom(stdout + stderr))
      .catch(() => null)
      .then((found) => {
        if (found) return found;
        console.error(`could not tell how \`${key}\` spells the agent projection of search; using --detail agent`);
        return ["--detail", "agent"];
      });
    agentDetailCache.set(key, known);
  }
  return known;
}

/**
 * Which akm ran, for summary.json, next to akm_version: `akm_bin` is the AKM_BIN command (or `akm`) with the home folder
 * written as `~`, and `akm_build` is `git describe --always --dirty` of the git checkout that command runs from, or null
 * when it does not run from one (an installed release). The words are tried from the last: the script identifies the build, and the
 * runtime before it (`bun`) must never be the one reported, even when it sits inside a repository. Two builds of one version, such as a PR branch and the release it
 * branched from, differ here and not in akm_version. Spread it into the summary: `...akmBuild()`.
 */
export function akmBuild(): { akm_bin: string; akm_build: string | null } {
  const cmd = akmCommand();
  const home = homedir();
  const akm_bin = cmd.map((w) => (w === home || w.startsWith(`${home}/`) ? `~${w.slice(home.length)}` : w)).join(" ");
  for (const word of [...cmd].reverse()) {
    const path = word.includes("/") ? word : Bun.which(word);
    if (!path || !existsSync(path)) continue;
    const real = realpathSync(path);
    const dir = statSync(real).isDirectory() ? real : dirname(real);
    const git = Bun.spawnSync(["git", "-C", dir, "describe", "--always", "--dirty"], { stdout: "pipe", stderr: "ignore" });
    if (git.exitCode === 0) return { akm_bin, akm_build: git.stdout.toString().trim() };
  }
  return { akm_bin, akm_build: null };
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
