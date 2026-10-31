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
//
// What akm runs as: AKM_BIN and --akm are a command line, read by parseCommand. Words are separated by whitespace. A single-quoted
// part is taken as it is, a double-quoted part keeps its whitespace and takes \" \\ \$ and \` as the character after the backslash,
// and outside quotes a backslash makes the next character part of the word. Nothing is evaluated: no $VARIABLE, no `command`, no
// glob. A word that starts with ~/ starts at your home folder, quoted or not, unless a backslash comes before its ~. So
// bun "/tmp/checkout with spaces/cli.ts" is two words, and so is bun ~/code/akm/src/cli.ts. akm runs in the sandbox's folder, so a
// relative path is made absolute against the folder the eval was started in (see absoluteWords): bun ./src/cli.ts works from a checkout.
//
// What akm runs with: its own folders, and from the environment of the caller only what a process needs to start and to reach the
// network: PATH, HOME, the locale, the proxy and certificate settings, the author for a commit, and the like (see ALLOWED_ENV).
// Everything else stays behind, a credential or not, whatever its name (MYSQL_PWD, GH_PAT, DATABASE_URL, SESSION_COOKIE), so a secret
// that no name pattern thought of never reaches akm. The exceptions are the variables that the akm config of the sandbox names as
// $NAME (or ${NAME}): writeConfig reads the config it writes and gives akm those and no others, so a config with two engines gets the
// key of each, and a key that the config does not name never reaches akm. { keepModelKey: true } gives akm MODEL_API_KEY whatever the
// config says.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tallyCalls } from "./usage.ts";
import { type SemanticState, verifySemantic } from "./semantic.ts";

export interface Sandbox {
  dir: string; // the temp folder, and the working folder of every akm run
  cmd: string[]; // the akm command: the words of AKM_BIN, or `akm`
  env: Record<string, string>; // the environment akm runs in
  semantic?: SemanticState; // verification cursor, enabled by writeConfig for the native semantic model
  keep?: string[]; // the variables the caller gave akm whatever the config says: MODEL_API_KEY for keepModelKey
  referenced?: string[]; // the variables the config in this sandbox names as $NAME that ALLOWED_ENV does not list, which env holds. writeConfig sets it
}

export interface AkmResult {
  stdout: string;
  stderr: string;
  code: number;
  ms: number; // how long the command ran
  timedOut: boolean; // the timeout killed it. Its exit code is 137, and runAkm ends its stderr with "akm timed out after <N>s", so a caller that only prints stderr says why
}

type RunOptions = { stdin?: string; timeoutMs?: number };

const FOLDERS = ["bundle", "config", "data", "cache", "state", "xdg-config", "xdg-data", "xdg-state"];
/** How long runAkm lets a command run when the caller sets no timeout: a command that calls a model can take minutes. */
export const DEFAULT_TIMEOUT_MS = 15 * 60_000;

// Keyword search only and no registries: akm needs no model download and never goes to the network.
// `configVersion` here and the provider kind of the engine in engineConfig (openai unless the model's line or MODEL_PROVIDER names another)
// are pinned on purpose, not taken from the akm under test: a pinned config is what lets a run on one akm release compare with a run on
// another (#52). A --config-patch can set another.
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
 * The variables of the caller that akm may read, by name: what a process needs to start (PATH, HOME, the locale, the temp folder, the
 * version managers whose shims find node or bun), to reach the network (the proxy and certificate settings, a Hugging Face mirror) and
 * to commit (the author). It lists what akm needs, not what to hide, so a kind of secret nobody has named yet is kept out as well.
 */
const ALLOWED_ENV = [
  /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|TERM|COLORTERM|NO_COLOR|FORCE_COLOR|CI|TZ|TMPDIR|TMP|TEMP)$/,
  /^(LC|XDG)_/,
  /^(SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|NODE_EXTRA_CA_CERTS)$/,
  /^(https?|all|no)_proxy$/i,
  /^GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL|DATE)$/,
  /^HF_(HOME|ENDPOINT|HUB_OFFLINE)$/,
  /^FAKE_/, // the settings of the fake akm that the tests run in its place
  /^(NODE_OPTIONS|NODE_PATH|BUN_INSTALL|NVM_DIR|VOLTA_HOME|ASDF_DATA_DIR|MISE_DATA_DIR|FNM_DIR)$/,
];

const allowed = (name: string): boolean => ALLOWED_ENV.some((re) => re.test(name));

/**
 * The environment akm runs in: its own folders under `dir`, the variables of the caller that ALLOWED_ENV lists (none of its AKM_
 * settings among them), and those in `keep`. The ones the config names are added by writeConfig. A semantic sandbox keeps the
 * embedder's model in MODEL_CACHE. git is not let climb out of `dir` (GIT_CEILING_DIRECTORIES): akm lists the files of a bundle that
 * is inside a git repository with `git ls-files`, which leaves out what the repository ignores, so a sandbox in an ignored folder, such
 * as a TMPDIR in a checkout's .cache/, would index no asset. git finds no repository there, and akm walks the bundle itself.
 */
function sandboxEnv(dir: string, keep: string[], semantic: boolean): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && (allowed(k) || keep.includes(k))) env[k] = v;
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
    GIT_CEILING_DIRECTORIES: dir,
    ...(semantic ? { HF_HOME: MODEL_CACHE } : {}),
  };
}

/**
 * The words of a command line such as AKM_BIN or `--akm`. Words are separated by whitespace. A single-quoted part is taken as it is.
 * A double-quoted part keeps its whitespace, and a backslash in it before ", \, $ or ` is dropped, so that character stays; any other
 * backslash stays. Outside quotes a backslash makes the next character part of the word. Quoted and unquoted parts next to each other
 * are one word. Nothing is evaluated: $VARIABLE, `command` and globs are text. A word that starts with ~/ starts at your home folder,
 * quoted or not, since bash leaves a ~ alone in a quoted value and in .env; `\~/` keeps the ~. Throws on a quote that is not closed.
 */
export function parseCommand(text: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false; // a quoted "" is a word too
  let literalTilde = false;
  const end = (): void => {
    if (started) words.push(word.startsWith("~/") && !literalTilde ? `${homedir()}/${word.slice(2)}` : word);
    word = "";
    started = false;
    literalTilde = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      end();
    } else if (c === "\\") {
      if (i + 1 >= text.length) throw new Error(`the command ends with a backslash: ${text}`);
      if (word === "" && text[i + 1] === "~") literalTilde = true;
      word += text[++i];
      started = true;
    } else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      if (close < 0) throw new Error(`the command has a ' that is not closed: ${text}`);
      word += text.slice(i + 1, close);
      i = close;
      started = true;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j++) {
        if (text[j] === "\\" && j + 1 < text.length && '"\\$`'.includes(text[j + 1])) j++;
        word += text[j];
      }
      if (j >= text.length) throw new Error(`the command has a " that is not closed: ${text}`);
      i = j;
      started = true;
    } else {
      word += c;
      started = true;
    }
  }
  end();
  return words;
}

/** A word as parseCommand reads it back: as it is when it holds only safe characters, else in single quotes. */
const quoteWord = (word: string): string => (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`);

/** The words of a command as one line that parseCommand reads back to the same words: AKM_BIN for a script at a path with a space in it. */
export const commandLine = (words: string[]): string => words.map(quoteWord).join(" ");

/**
 * The words with each relative path made absolute against the caller's folder, since akm runs in the sandbox's folder, where a relative
 * path no longer resolves. A first word with a / in it is a path, as a shell reads it. A later word is one only if it has a / and a file
 * or folder of that name is in the caller's folder, so `npx @scope/akm-cli` and `bun run` stay as they are. A word that starts with - is a flag.
 */
function absoluteWords(words: string[]): string[] {
  return words.map((word, i) => {
    if (!word.includes("/") || word.startsWith("-") || isAbsolute(word)) return word;
    const path = resolve(word);
    return i === 0 || existsSync(path) ? path : word;
  });
}

/** The akm command: the words of AKM_BIN (see parseCommand, and absoluteWords for a relative path), or `akm`. */
function akmCommand(): string[] {
  const bin = process.env.AKM_BIN?.trim();
  if (!bin) return ["akm"];
  try {
    const words = absoluteWords(parseCommand(bin));
    return words.length > 0 ? words : ["akm"];
  } catch (e) {
    throw new Error(`AKM_BIN is not a command: ${(e as Error).message}`);
  }
}

/** `--akm`, for parseArgs, and its line of an eval's usage text. */
export const AKM_OPTIONS = { akm: { type: "string" } } as const;
export const akmUsage = `  --akm           the command that runs akm, such as "bun ~/code/akm/src/cli.ts". Quote a word with spaces in it. Default: AKM_BIN in .env, else akm on PATH.`;

/**
 * Runs this process's akm as `--akm` says, which wins over AKM_BIN. It is read as AKM_BIN is (see parseCommand): a path with spaces
 * is quoted, a leading ~/ in a word is your home folder, and a relative path is taken from the folder you are in (see absoluteWords).
 * AKM_BIN is set to the command as it was read, with the home folder and the paths written out and each word quoted if it needs it.
 * `fail` ends the run with a message.
 */
export function useAkm(values: { akm?: string }, fail: (message: string) => never, env: Record<string, string | undefined> = process.env): void {
  if (values.akm === undefined) return;
  if (!values.akm.trim()) fail("--akm needs the command that runs akm");
  let words: string[] = [];
  try {
    words = parseCommand(values.akm);
  } catch (e) {
    fail(`--akm is not a command: ${(e as Error).message}`);
  }
  if (words.length === 0) fail("--akm needs the command that runs akm");
  env.AKM_BIN = commandLine(absoluteWords(words));
}

/**
 * Makes a sandbox in the folder `dir`, which it makes if need be: akm's own folders and config in it, unless the folder has a config already. akm is `AKM_BIN`, a command
 * line such as `bun /path/to/akm/src/cli.ts` (see parseCommand), or `akm`. akm gets only the variables the top of this file lists, and
 * MODEL_API_KEY only if the config names it as $MODEL_API_KEY, as engineConfig does, or `keepModelKey` is set. The config starts plain, keyword search
 * only: replace it with writeConfig. With `semantic`, it starts as keyword search fused with the vectors of akm's built-in
 * embedder, whose model is kept in the repository's .cache/ and downloaded once. akm answers such a query with
 * searchMode "semantic", and an eval that scores it has to check that.
 */
export function sandboxIn(dir: string, opts: { keepModelKey?: boolean; semantic?: boolean } = {}): Sandbox {
  for (const folder of FOLDERS) mkdirSync(join(dir, folder), { recursive: true });
  const semantic = opts.semantic ?? false;
  if (semantic) mkdirSync(MODEL_CACHE, { recursive: true });
  const keep = opts.keepModelKey ? ["MODEL_API_KEY"] : [];
  const sandbox: Sandbox = { dir, cmd: akmCommand(), env: sandboxEnv(dir, keep, semantic), keep };
  const path = join(dir, "config", "config.json");
  if (!existsSync(path)) writeConfig(sandbox, semantic ? semanticConfig() : plainConfig());
  else {
    try {
      giveReferencedVariables(sandbox, JSON.parse(readFileSync(path, "utf8")));
    } catch {} // a config that is not JSON names nothing
  }
  return sandbox;
}

/** A sandbox in a new temp folder, akm-eval-<name>-<random>, for removeSandbox to remove. See sandboxIn. */
export function createSandbox(name: string, opts: { keepModelKey?: boolean; semantic?: boolean } = {}): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), `akm-eval-${name}-`));
  try {
    return sandboxIn(dir, opts);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // an AKM_BIN that is not a command ends here, and the folder would stay
    throw e;
  }
}

export function removeSandbox(sandbox: Sandbox): void {
  tallyCalls(sandbox.env.AKM_DATA_DIR); // its model calls, for the run's summary (see usage.ts)
  rmSync(sandbox.dir, { recursive: true, force: true });
}

/** The variables a config names as $NAME or ${NAME} in any string of it, at any depth, each once. */
function referencedVariables(config: unknown): string[] {
  const names = new Set<string>();
  const walk = (x: unknown): void => {
    if (typeof x === "string") for (const m of x.matchAll(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g)) names.add(m[1] ?? m[2]);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (typeof x === "object" && x !== null) Object.values(x).forEach(walk);
  };
  walk(config);
  return [...names];
}

/**
 * Gives akm the variables that this config names as $NAME, from this process's environment, and takes back those that an earlier
 * config named and this one does not (unless the caller asked to keep them). A variable that ALLOWED_ENV lists is in the environment
 * already, and a name akm sets itself (AKM_) is never the caller's.
 */
function giveReferencedVariables(sandbox: Sandbox, config: unknown): void {
  const named = referencedVariables(config).filter((name) => !allowed(name) && !name.startsWith("AKM_"));
  for (const name of sandbox.referenced ?? []) if (!named.includes(name) && !(sandbox.keep ?? []).includes(name)) delete sandbox.env[name];
  for (const name of named) {
    const value = process.env[name];
    if (value !== undefined) sandbox.env[name] = value;
  }
  sandbox.referenced = named;
}

/** Writes akm's config file in the sandbox, in place of the one there, and gives akm the variables that the config names as $NAME, and no others. */
export function writeConfig(sandbox: Sandbox, config: unknown): void {
  writeFileSync(join(sandbox.dir, "config", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  giveReferencedVariables(sandbox, config);
  const c = config as { semanticSearchMode?: unknown; embedding?: { localModel?: unknown }; engines?: Record<string, unknown> };
  sandbox.semantic = c?.semanticSearchMode === "auto" && c.embedding?.localModel === SEMANTIC_MODEL && Object.keys(c.engines ?? {}).length > 0 ? (sandbox.semantic ?? { lastEvent: 0 }) : undefined;
  // Config patches can enable the native embedder after the sandbox was created.
  if ((config as { embedding?: { localModel?: unknown } })?.embedding?.localModel === SEMANTIC_MODEL) {
    mkdirSync(MODEL_CACHE, { recursive: true });
    sandbox.env.HF_HOME = MODEL_CACHE;
  }
}

/** What a timeout is called in a message, such as `timed out after 900s`. */
const timedOutAfter = (timeoutMs: number): string => `timed out after ${+(timeoutMs / 1000).toFixed(1)}s`;

/**
 * Runs akm with these arguments in the sandbox. A command still running after `timeoutMs` is killed with SIGKILL, and the result
 * says `timedOut` and ends its stderr with "akm timed out after <N>s": a killed command prints nothing about it, so a caller that
 * reports "akm index failed (exit 137): <stderr>" would otherwise report an empty reason.
 */
export async function runAkm(sandbox: Sandbox, args: string[], opts: RunOptions = {}): Promise<AkmResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t0 = performance.now();
  const proc = Bun.spawn([...sandbox.cmd, ...args], {
    env: sandbox.env,
    cwd: sandbox.dir,
    stdin: opts.stdin === undefined ? "ignore" : new Blob([opts.stdin]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const stopOwnedChild = () => proc.kill("SIGKILL");
  process.once("exit", stopOwnedChild); // a collector saving a stop checkpoint must not leave akm running
  let stdout: string, stderr: string, code: number;
  try {
    [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  } finally {
    process.off("exit", stopOwnedChild);
  }
  const ms = performance.now() - t0;
  // A killed process exits 137. Bun's `killed` is true for any process that has exited, so the signal decides, and the exit code when Bun gives none.
  const killed = proc.signalCode !== null ? proc.signalCode === "SIGKILL" : code === 137;
  const timedOut = killed && ms >= timeoutMs;
  if (sandbox.semantic && code === 0) {
    let problem: string | null;
    try { problem = verifySemantic(sandbox.semantic, sandbox.env.AKM_DATA_DIR, args[0], stdout); }
    catch (e) { problem = `could not verify semantic execution: ${(e as Error).message}`; }
    if (problem) return { stdout, stderr: `${stderr}\nsemantic verification: ${problem}`, code: 1, ms, timedOut };
  }
  return { stdout, stderr: timedOut ? [stderr.trimEnd(), `akm ${timedOutAfter(timeoutMs)}`].filter(Boolean).join("\n") : stderr, code, ms, timedOut };
}

/** Runs akm with `--format json` and parses what it prints. The flag goes before any `--`, so a query after it stays a query. */
export async function runAkmJson<T = unknown>(sandbox: Sandbox, args: string[], opts: RunOptions = {}): Promise<T> {
  const at = args.indexOf("--");
  const json = ["--format", "json"];
  const { stdout, stderr, code, timedOut } = await runAkm(sandbox, at < 0 ? [...args, ...json] : [...args.slice(0, at), ...json, ...args.slice(at)], opts);
  if (timedOut) throw new Error(`akm ${args[0]} ${timedOutAfter(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)}`);
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

/** Is `version` at least `minimum`? Both are semver. A prerelease is below its release and ordered by its tag. */
export function atLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
    if (!m) throw new Error(`not a version: ${v}`);
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] };
  };
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return (a.nums[i] ?? 0) > (b.nums[i] ?? 0);
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === 0; // a release is above any of its prereleases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return ny; // a number is below a word
    return x > y;
  }
  return true;
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
 * when it does not run from one (an installed release). A repository counts only if it is akm's: its top folder holds the package
 * akm-cli, or git tracks the script (see inAkmCheckout). A release that npm installed under nvm, asdf or Homebrew sits inside that tool's
 * repository, and the tool's commit is not the build. The words are tried from the last: the script identifies the build, and the
 * runtime before it (`bun`) must never be the one reported, even when it sits inside a repository. Two builds of one version, such as a PR branch and the release it
 * branched from, differ here and not in akm_version. `akm_build_fingerprint` tells two edits of one commit apart, which `-dirty` does
 * not: it is a sha256 over the changes to the tracked files and the content of the files that are not tracked and not ignored (see
 * dirtyFingerprint), or null for a clean checkout or a release. Spread it into the summary: `...akmBuild()`.
 */
export interface AkmBuild {
  akm_bin: string;
  akm_build: string | null;
  akm_build_fingerprint: string | null;
}

/**
 * A sha256 over what a checkout holds beyond its commit: `git diff HEAD --binary`, which is every change to a tracked file, staged or
 * not, and each file that is not tracked and not ignored (`git ls-files --others --exclude-standard`) with its path and its content.
 * The same files give the same fingerprint, whichever way they were edited. Null for a checkout with none of those. `dir` is in the checkout.
 */
export function dirtyFingerprint(dir: string): string | null {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore" });
  const top = git(dir, "rev-parse", "--show-toplevel");
  if (top.exitCode !== 0) return null;
  const root = top.stdout.toString().trim();
  const diff = git(root, "diff", "HEAD", "--binary", "--no-ext-diff");
  const others = git(root, "ls-files", "-z", "--others", "--exclude-standard");
  if (diff.exitCode !== 0 || others.exitCode !== 0) return null;
  const untracked = others.stdout.toString().split("\0").filter(Boolean).sort();
  if (diff.stdout.length === 0 && untracked.length === 0) return null;
  const hash = createHash("sha256");
  hash.update(`diff ${diff.stdout.length}\0`);
  hash.update(diff.stdout);
  for (const path of untracked) {
    const file = join(root, path);
    let content: Uint8Array | string = "";
    try {
      const stat = lstatSync(file);
      content = stat.isSymbolicLink() ? `-> ${readlinkSync(file)}` : stat.isFile() ? readFileSync(file) : ""; // a folder here is a repository of its own
    } catch {} // a file that went between the listing and the read has no content
    hash.update(`\0untracked ${path}\0${createHash("sha256").update(content).digest("hex")}`);
  }
  return hash.digest("hex");
}

/**
 * Is `dir` in a checkout of akm, going by its git repository: the top folder holds the package akm-cli, or `file`, the script, is tracked
 * in it. A release installed with npm -g sits in a repository too when nvm or Homebrew keeps its folder in one, and it is neither.
 */
function inAkmCheckout(dir: string, file: string | null): boolean {
  const git = (...args: string[]) => Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "ignore" });
  const top = git("rev-parse", "--show-toplevel");
  if (top.exitCode !== 0) return false;
  try {
    if (JSON.parse(readFileSync(join(top.stdout.toString().trim(), "package.json"), "utf8")).name === "akm-cli") return true;
  } catch {} // no package.json, or one that is not JSON: not akm's
  return file !== null && git("ls-files", "--error-unmatch", "--", file).exitCode === 0;
}

/** The akm this process runs, as AkmBuild says: the fields to spread into a summary. */
export function akmBuild(): AkmBuild {
  const cmd = akmCommand();
  const home = homedir();
  const akm_bin = commandLine(cmd.map((w) => (w === home || w.startsWith(`${home}/`) ? `~${w.slice(home.length)}` : w)));
  for (const word of [...cmd].reverse()) {
    const path = word.includes("/") ? word : Bun.which(word);
    if (!path || !existsSync(path)) continue;
    const real = realpathSync(path);
    const folder = statSync(real).isDirectory();
    const dir = folder ? real : dirname(real);
    if (!inAkmCheckout(dir, folder ? null : real)) continue;
    const git = Bun.spawnSync(["git", "-C", dir, "describe", "--always", "--dirty"], { stdout: "pipe", stderr: "ignore" });
    if (git.exitCode === 0) return { akm_bin, akm_build: git.stdout.toString().trim(), akm_build_fingerprint: dirtyFingerprint(dir) };
  }
  return { akm_bin, akm_build: null, akm_build_fingerprint: null };
}

/** The chat-completions URL of a base URL: /chat/completions goes on the path, before any query or fragment, and is not added twice. */
export function completionsUrl(baseUrl: string): string {
  const [, path, rest] = /^([^?#]*)([^]*)$/.exec(baseUrl) as RegExpExecArray;
  const base = path.replace(/\/+$/, "");
  return `${base.endsWith("/chat/completions") ? base : `${base}/chat/completions`}${rest}`;
}

/**
 * The akm config for an eval with a model: one LLM engine, the model under test, as the default engine, and
 * plain config otherwise. The key is named by variable and never held. To send one process to the engine, add
 * its routing to the returned object. `name` is the engine's name in the config, and what akm reports for it.
 * `provider` is the engine's provider kind in akm (openai, anthropic, gemini, groq, ollama, lmstudio): the endpoint is the same whichever it is.
 */
export function engineConfig(baseUrl: string, model: string, hasKey: boolean, name = "model", provider = "openai"): Record<string, any> {
  const endpoint = completionsUrl(baseUrl);
  return {
    ...plainConfig(),
    engines: { [name]: { kind: "llm", provider, endpoint, model, ...(hasKey ? { apiKey: "$MODEL_API_KEY" } : {}), timeoutMs: 600_000 } },
    defaults: { llmEngine: name },
  };
}
