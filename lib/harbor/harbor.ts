// What the evals that run an agent in Harbor share: the versions a run is made of, the model, the two arms and
// Harbor itself. evals/agent-ab and benchmarks/terminal-bench both run opencode alone and with the akm plugin on the
// same tasks, and both import this. The akm arm is akm_opencode.py beside it, and report.ts reads what the run leaves.

import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { type ModelEntry, type ModelSettings, loadModels, resolveModel } from "../models.ts";
import { sha256File, sha256Text } from "../provenance.ts";
import { type ArmSummary, type Arm, type Report, type Trial, loadTrials } from "./report.ts";

/** What a run is made of. Change one at a time: a difference between two runs that moved two of them has no single cause. */
export const PINS = { akm_cli: "0.9.26", akm_plugin: "0.9.26202610051302", opencode: "1.18.34", harbor: "0.24.0" } as const;

/** The pins of one run, as it was made: the akm under test replaces the pinned akm-cli, and a checkout that holds the plugin replaces the plugin. */
export type Pins = Record<keyof typeof PINS, string>;

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

/** A positive integer flag, or undefined when the flag is not given. */
export function positive(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!(Number.isInteger(n) && n > 0)) fail(`${flag} must be a positive integer`);
  return n;
}

// ---- the model ------------------------------------------------------------------------------------------------------------

/** A model name as opencode names it. One without a provider is an openai model. */
export function modelName(name: string): string {
  return name.includes("/") ? name : `openai/${name}`;
}

type Env = Record<string, string | undefined>;

/**
 * What Harbor, uv and Docker read from the environment they start in. Nothing else of the host's goes along: not the judge's key, not
 * the keys of the other evals, not AKM_BIN. The model's own variables are added by modelSettings.
 */
const HOST_VARS = [
  /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|TERM|COLORTERM|NO_COLOR|FORCE_COLOR|COLUMNS|LINES|CI|TZ|TMPDIR)$/,
  /^(LC|XDG|DOCKER|COMPOSE|BUILDKIT|UV)_/,
  /^(SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|NODE_EXTRA_CA_CERTS)$/,
  /^(https?|all|no)_proxy$/i,
];

/** The variables of `host` that Harbor and the tools it starts need. */
export function hostEnv(host: Env): Record<string, string> {
  return Object.fromEntries(Object.entries(host).filter((e): e is [string, string] => e[1] !== undefined && HOST_VARS.some((re) => re.test(e[0]))));
}

/** The variables a provider other than openai is read from, by Harbor, under the provider's own names. Most are PROVIDER_*. */
const PROVIDER_VARS: Record<string, RegExp> = {
  google: /^(GOOGLE|GEMINI)_/,
  vertex_ai: /^(VERTEXAI|GOOGLE)_/,
  "amazon-bedrock": /^AWS_/,
  sagemaker: /^AWS_/,
  "github-copilot": /^GITHUB_TOKEN$/,
  huggingface: /^(HF_TOKEN|HUGGINGFACE_)/,
};

const providerVars = (provider: string): RegExp => PROVIDER_VARS[provider] ?? new RegExp(`^${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_`);

const endpointHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The model of a run and the environment Harbor runs in, from the flag, `host` (the process environment) and models.json. This is the
 * rule of every eval: `flag` or MODEL_NAME names the model, and a name that is a line of models.json goes to that line's endpoint
 * with the key in its api_key_env, any other name to the gateway in MODEL_BASE_URL with MODEL_API_KEY. Here the result is mapped to
 * what opencode's openai provider reads, OPENAI_BASE_URL and OPENAI_API_KEY. So an endpoint can only serve an openai model (a name
 * without a provider is one), and a base URL given for another provider's model is refused, since it would be dropped.
 * OPENAI_BASE_URL and OPENAI_API_KEY, which this took before models.json, still stand in for an empty MODEL_BASE_URL and an empty
 * MODEL_API_KEY, in any combination of the two.
 *
 * With no line and no MODEL_BASE_URL (or OPENAI_BASE_URL), an openai model goes to openai with the key
 * in OPENAI_API_KEY or MODEL_API_KEY, and another provider's model is left to Harbor, which reads its key under the provider's own name.
 * Only what Harbor needs goes into the environment (hostEnv), and the model's variables.
 */
export function modelSettings(flag: string | undefined, host: Env, entries?: Record<string, ModelEntry>): { model: string; env: Record<string, string> } {
  const id = (flag ?? host.MODEL_NAME)?.trim();
  if (flag !== undefined && !id) fail("--model needs a model name");
  if (!id) fail("name the model: pass --model NAME, or set MODEL_NAME in .env, as opencode names it, such as openai/gpt-6-luna. See .env.example.");
  let lines: Record<string, ModelEntry>;
  try {
    lines = entries ?? loadModels();
  } catch (e) {
    return fail((e as Error).message);
  }
  // The gateway, when either URL names one: the older name of each setting fills in for the MODEL_* one that is empty.
  const gateway = host.MODEL_BASE_URL?.trim() || host.OPENAI_BASE_URL?.trim();
  const named = gateway ? { ...host, MODEL_BASE_URL: gateway, MODEL_API_KEY: host.MODEL_API_KEY?.trim() || host.OPENAI_API_KEY } : host;
  const env = hostEnv(host);

  if (Object.hasOwn(lines, id) || named.MODEL_BASE_URL?.trim()) {
    let m: ModelSettings;
    try {
      m = resolveModel("model", id, named, lines);
    } catch (e) {
      return fail((e as Error).message);
    }
    const model = modelName(m.name);
    const provider = model.split("/")[0];
    if (provider !== "openai") fail(`${model} is sent to ${endpointHost(m.baseUrl)}, but Harbor passes a base URL on only to an openai model, as OPENAI_BASE_URL. Name an openai model (a name without a provider is one), or leave out MODEL_BASE_URL and the models.json line to use ${provider}'s own endpoint and key.`);
    if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(m.baseUrl)) fail(`the endpoint of ${model}, ${m.baseUrl}, would be the container itself, not the model server. Use the address a container reaches it at.`);
    if (!m.apiKey) fail(`no model key for ${model}: set MODEL_API_KEY (or the models.json line's api_key_env) in .env. Every trial would fail at the model call, after its setup.`);
    return { model, env: { ...env, OPENAI_API_KEY: m.apiKey, OPENAI_BASE_URL: m.baseUrl } };
  }

  const model = modelName(id);
  const provider = model.split("/")[0];
  if (provider === "openai") {
    const key = host.OPENAI_API_KEY?.trim() || host.MODEL_API_KEY?.trim();
    if (!key) fail("no model key: set MODEL_API_KEY (or OPENAI_API_KEY). Every trial would fail at the model call, after its setup.");
    return { model, env: { ...env, OPENAI_API_KEY: key } };
  }
  const own = providerVars(provider);
  for (const [k, v] of Object.entries(host)) if (v !== undefined && own.test(k)) env[k] = v;
  return { model, env };
}

/** What a run needs besides the model, checked before the first container starts. `values` are the parsed flags. */
export function preflight(values: { model?: string } = {}): { model: string; env: Record<string, string> } {
  const settings = modelSettings(values.model, process.env);
  if (!Bun.which("uv")) fail("uv is needed. See https://docs.astral.sh/uv/");
  if (Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).exitCode !== 0) fail("Docker is not reachable: `docker info` failed. Every trial runs in a container.");
  return settings;
}

// ---- the akm under test ---------------------------------------------------------------------------------------------------

/** What the akm arm installs: akm-cli and the plugin, each from the npm registry (a version) or from a tarball packed from a checkout. */
export interface AkmArm {
  /** `--akm` as given, with the home folder as ~. The pinned release, written akm-cli@x.y.z, without the flag. */
  bin: string;
  /** `git describe --always --dirty` of the checkout, null for an npm release. */
  build: string | null;
  cli: { version: string; tarball: string | null };
  plugin: { version: string; tarball: string | null };
  /** The folder the tarballs are in. Null when there are none. */
  packages: string | null;
}

/** The arm of a run with no `--akm`, or with an npm spec: the pinned plugin, and akm-cli at `version`. */
export function releaseArm(version: string = PINS.akm_cli): AkmArm {
  return { bin: `akm-cli@${version}`, build: null, cli: { version, tarball: null }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: null };
}

export const pinsOf = (arm: AkmArm): Pins => ({ ...PINS, akm_cli: arm.cli.version, akm_plugin: arm.plugin.version });

/** The value of `--akm`: an npm release (akm-cli@x.y.z) or the folder of a checkout. */
export type AkmSource = { kind: "release"; version: string } | { kind: "checkout"; path: string };

const RELEASE = /^akm-cli@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export const withHome = (path: string): string => {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

/**
 * Reads `--akm` for the Harbor evals. Their akm runs in a container, so it is not a command as it is for the others: it is `akm-cli@x.y.z`,
 * an exact release from the npm registry, or the folder of an akm checkout, which packAkm packs. A moving spec such as akm-cli@latest
 * is refused: two runs of it are not the same akm.
 */
export function parseAkm(value: string | undefined): AkmSource {
  if (value === undefined) return { kind: "release", version: PINS.akm_cli };
  const v = value.trim();
  if (!v) fail("--akm needs akm-cli@x.y.z, or the folder of an akm checkout");
  const release = RELEASE.exec(v);
  if (release) return { kind: "release", version: release[1] };
  const path = resolve(v.replace(/^~(?=\/|$)/, homedir()));
  if (existsSync(path) && statSync(path).isDirectory()) return { kind: "checkout", path };
  if (/^akm-cli(@|$)/.test(v)) fail(`--akm ${v}: name an exact release, such as akm-cli@${PINS.akm_cli}. A tag or a range moves between runs.`);
  if (/\s/.test(v)) fail(`--akm ${JSON.stringify(v)} is a command, and the akm arm runs in a container. Give akm-cli@x.y.z, or the folder of an akm checkout to pack and install.`);
  return fail(`--akm ${v} is neither akm-cli@x.y.z nor a folder.`);
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** `git describe --always --dirty` of the repository `dir` is in, or null when it is in none. */
export function checkoutBuild(dir: string): string | null {
  const git = Bun.spawnSync(["git", "-C", dir, "describe", "--always", "--dirty"], { stdout: "pipe", stderr: "ignore" });
  return git.exitCode === 0 ? git.stdout.toString().trim() : null;
}

/** The folder under `root` (at most `depth` levels down, node_modules and hidden folders left out) whose package.json is the plugin's, or null. */
export function findPlugin(root: string, depth = 3): string | null {
  const walk = (dir: string, left: number): string | null => {
    if (readJson(join(dir, "package.json"))?.name === "akm-opencode") return dir;
    if (left === 0) return null;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".")) continue;
      const found = walk(join(dir, e.name), left - 1);
      if (found) return found;
    }
    return null;
  };
  return walk(root, depth);
}

/** Packs the package in `dir` into the folder `into` and returns the tarball's file name. */
export type Pack = (dir: string, into: string) => string;

/** `npm pack`. It runs the package's own prepack and prepare scripts, so a checkout that builds in them is built. */
export const npmPack: Pack = (dir, into) => {
  if (!Bun.which("npm")) fail("npm is needed to pack an akm checkout. See https://nodejs.org");
  const before = new Set(readdirSync(into));
  const done = Bun.spawnSync(["npm", "pack", "--pack-destination", into, "--silent"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0) fail(`npm pack failed in ${dir} (exit ${done.exitCode}): ${done.stderr.toString().trim().slice(-400)}`, 1);
  const made = readdirSync(into).filter((f) => f.endsWith(".tgz") && !before.has(f));
  if (made.length !== 1) fail(`npm pack in ${dir} made ${made.length} tarballs, not one`, 1);
  return made[0];
};

/** The files in a tarball, as `package/<path>`. */
function tarFiles(tarball: string): string[] {
  const done = Bun.spawnSync(["tar", "-tzf", tarball], { stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0) fail(`could not read the tarball ${tarball}: ${done.stderr.toString().trim().slice(-300)}`, 1);
  return done.stdout.toString().split("\n").filter(Boolean);
}

/**
 * Packs a checkout of akm for the akm arm: akm-cli, and the plugin when the checkout holds it (a folder whose package.json is named
 * akm-opencode, a few levels down). Otherwise the pinned plugin stays, which depends on its own akm-cli: only the akm the plugin shells
 * out to is the one under test, and `note` says so. The tarballs go into `into`. `npm pack` packs what is on disk, so a checkout that
 * has to be built first is refused when the tarball lacks the file its `bin` names.
 */
export function packAkm(checkout: string, into: string, pack: Pack = npmPack): { arm: AkmArm; note: string | null } {
  into = resolve(into); // npm pack runs in the checkout, so a relative folder would be read against another one
  const pkg = readJson(join(checkout, "package.json"));
  if (pkg?.name !== "akm-cli" || typeof pkg.version !== "string") fail(`${checkout} is not an akm checkout: its package.json is not akm-cli's.`);
  mkdirSync(into, { recursive: true });
  const cli = pack(checkout, into);
  const bins: string[] = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {}).filter((b): b is string => typeof b === "string");
  const files = tarFiles(join(into, cli));
  for (const bin of bins) if (!files.includes(`package/${bin.replace(/^\.\//, "")}`)) fail(`the tarball of ${checkout} lacks ${bin}, which its package.json names as a bin. Build the checkout first: npm pack packs what is on disk.`);
  const pluginDir = findPlugin(checkout);
  const plugin = pluginDir ? { version: String(readJson(join(pluginDir, "package.json")).version), tarball: pack(pluginDir, into) } : { version: PINS.akm_plugin, tarball: null };
  const arm: AkmArm = { bin: withHome(resolve(checkout)), build: checkoutBuild(checkout), cli: { version: pkg.version, tarball: cli }, plugin, packages: into };
  const note = pluginDir ? null : `the checkout holds no plugin (no package.json named akm-opencode), so the akm arm keeps the pinned plugin ${PINS.akm_plugin}. It carries its own akm-cli ${PINS.akm_cli}: only the akm it shells out to is the one under test.`;
  return { arm, note };
}

/** The arm for `--akm`: a release is a name, a checkout is packed into `into`. Returns the arm and a note to print when something about it needs saying. */
export function akmArm(value: string | undefined, into: string, pack?: Pack): { arm: AkmArm; note: string | null } {
  const source = parseAkm(value);
  if (source.kind === "checkout") return packAkm(source.path, into, pack);
  const arm = releaseArm(source.version);
  return { arm, note: source.version === PINS.akm_cli ? null : `the akm arm installs akm-cli ${source.version} from the npm registry, with the pinned plugin ${PINS.akm_plugin}. The plugin carries its own akm-cli ${PINS.akm_cli}: only the akm it shells out to is the one under test.` };
}

/** Copies the tarballs of `arm` into `<dir>/akm-packages`, kept with the run, and returns that folder, or null for a release. */
export function stagePackages(arm: AkmArm, dir: string): { dir: string; files: { file: string; sha256: string }[] } | null {
  if (!arm.packages) return null;
  const into = join(dir, "akm-packages");
  mkdirSync(into, { recursive: true });
  const files = [arm.cli.tarball, arm.plugin.tarball].filter((f): f is string => f !== null);
  for (const f of files) copyFileSync(join(arm.packages, f), join(into, f));
  return { dir: into, files: files.map((file) => ({ file, sha256: sha256File(join(into, file)) })) };
}

/** The AKM_* settings the arm fixes. Python's FIXED_AKM_ENV is the same list (a test compares them). */
export const FIXED_AKM_ENV = ["AKM_BUNDLE_DIR", "AKM_CONFIG_DIR", "AKM_DATA_DIR", "AKM_CACHE_DIR", "AKM_STATE_DIR", "AKM_OPENCODE_CLI"];

/** `--akm-env KEY=VALUE`, repeated: the extra AKM_* settings of the akm arm. */
export function parseAkmEnv(values: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of values ?? []) {
    const eq = v.indexOf("=");
    if (eq < 1) fail(`--akm-env takes KEY=VALUE, not ${JSON.stringify(v)}`);
    const key = v.slice(0, eq);
    if (!/^AKM_[A-Z0-9_]+$/.test(key)) fail(`--akm-env ${key}: only AKM_* settings go to akm`);
    if (FIXED_AKM_ENV.includes(key)) fail(`--akm-env ${key}: the arm fixes it. The five directories move together, and the plugin must run the akm installed in the container.`);
    if (/(API_?KEY|_KEY$|KEYRING|TOKEN|SECRET|PASSWORD|BEARER|CREDENTIAL|AUTH)/.test(key)) fail(`--akm-env ${key}: it looks like a credential, and the job and the summary record every setting.`);
    if (Object.hasOwn(out, key)) fail(`--akm-env ${key} is given twice`);
    out[key] = v.slice(eq + 1);
  }
  return out;
}

/** The options of the Harbor evals for the akm under test, for parseArgs, and their lines of an eval's usage text. */
export const AKM_ARM_OPTIONS = { akm: { type: "string" }, "akm-env": { type: "string", multiple: true } } as const;
export const akmArmUsage = `  --akm           the akm of the akm arm, which runs in a container: akm-cli@x.y.z (an exact npm release), or the folder of an
                  akm checkout, which is packed with npm pack and installed from the tarball. A checkout that holds the plugin
                  (a folder whose package.json is named akm-opencode) gets it packed too. Default: akm-cli@${PINS.akm_cli}.
                  AKM_BIN is not read: it is a command on this machine.
  --akm-env       KEY=VALUE, repeatable: an extra AKM_* setting for every command of the akm arm, such as AKM_CURATE_TIMEOUT=30.
                  It is how a config or a strategy is swept. The directories and AKM_OPENCODE_CLI cannot be set.`;

// ---- the job --------------------------------------------------------------------------------------------------------------

/**
 * The Harbor job: the two arms on the same datasets. They get the same model, the same opencode, the same config and
 * the same setup time. The only config the arms differ in is the plugin, which the akm arm's agent adds, and the akm
 * arm installs akm and seeds a library (see akm_opencode.py): the one the task names in `AKM_TASK_STASH`, or the one
 * `akm.env` names for a task that is not ours. `akm.kwargs` are more options of that agent. `arm` is the akm and the plugin
 * to install (the pinned release without it), from the tarballs in `packagesDir` when it has any, and `akmEnv` are extra
 * AKM_* settings for its commands.
 */
export function jobConfig(o: {
  name: string;
  model: string;
  jobsDir: string;
  attempts: number;
  librariesDir: string;
  datasets: Record<string, unknown>[];
  arm?: AkmArm;
  packagesDir?: string | null;
  akmEnv?: Record<string, string>;
  akm?: { env?: Record<string, string>; kwargs?: Record<string, unknown> };
}): Record<string, unknown> {
  const arm = o.arm ?? releaseArm();
  // The same model does opencode's side jobs, such as titling a session, so the run calls one model only.
  const opencodeConfig = { $schema: "https://opencode.ai/config.json", autoupdate: false, small_model: o.model };
  const both = { model_name: o.model, override_setup_timeout_sec: SETUP_TIMEOUT_SEC };
  const tarballs = arm.cli.tarball !== null || arm.plugin.tarball !== null;
  if (tarballs && !o.packagesDir) throw new Error("the akm arm has tarballs, and the job names no folder for them");
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
        kwargs: {
          version: PINS.opencode,
          opencode_config: opencodeConfig,
          akm_cli_version: arm.cli.version,
          akm_plugin_version: arm.plugin.version,
          libraries_dir: o.librariesDir,
          ...(tarballs ? { packages_dir: o.packagesDir } : {}),
          ...(arm.cli.tarball ? { akm_package: arm.cli.tarball } : {}),
          ...(arm.plugin.tarball ? { plugin_package: arm.plugin.tarball } : {}),
          ...(o.akmEnv && Object.keys(o.akmEnv).length ? { akm_env: o.akmEnv } : {}),
          ...o.akm?.kwargs,
        },
      },
    ],
    datasets: o.datasets,
  };
}

/** `value` with every path under one of `roots` written relative to it (the first that holds it), so a summary names no folder of this machine. */
export function relativePaths(value: unknown, roots: string[]): unknown {
  if (typeof value === "string") {
    const root = roots.find((r) => value === r || value.startsWith(`${r}/`));
    return root === undefined ? value : relative(root, value) || ".";
  }
  if (Array.isArray(value)) return value.map((v) => relativePaths(v, roots));
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, relativePaths(v, roots)]));
  return value;
}

/** What a summary keeps of the job: the datasets and the agents with their options, the attempts and the concurrency, with paths relative to the run's folder or the repository's. */
export function jobRecord(cfg: Record<string, unknown>, dir: string, root: string): Record<string, unknown> {
  const { job_name: _name, jobs_dir: _dir, ...rest } = cfg;
  return relativePaths(rest, [dir, root]) as Record<string, unknown>;
}

/** One digest over every file under `dir`, by relative path and content, so another machine gets the same one. */
export function sha256Dir(dir: string): string {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.isFile()) files.push(relative(dir, join(d, e.name)));
    }
  };
  walk(dir);
  return sha256Text([...files].sort().map((rel) => `${rel}\0${sha256File(join(dir, rel))}\n`).join(""));
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

// ---- what the run left ----------------------------------------------------------------------------------------------------

/** A trial as the run writes it to samples.jsonl: report.ts's, with whether it hit a time limit, and why the plugin was not live when it was not. */
export interface RunTrial extends Trial {
  /** The agent or its setup ran out of time (AgentTimeoutError, AgentSetupTimeoutError). Counted apart from the other errors, so a slower akm shows as one. */
  timed_out: boolean;
  /** The plugin was not shown to be live in this trial, and why. Left out otherwise. */
  plugin_problem?: string;
}

const TIMEOUTS = new Set(["AgentTimeoutError", "AgentSetupTimeoutError"]);

/** The exception of a trial whose plugin was not live. akm_opencode.py raises it. */
export const PLUGIN_ERROR = "AkmPluginNotLoadedError";

/** What the akm arm's containers reported of themselves (akm_install.json in each akm trial's agent folder), without repeats. */
export interface Observed {
  /** `akm --version` as it printed in the container. */
  akm_version: string[];
  /** The akm-cli the plugin carries, which is not always the one installed. */
  plugin_akm_cli: string[];
  /** The assets akm indexed in the seeded library. */
  assets_indexed: number[];
  /** The AKM_* settings the arm ran with (the arm's, then the job's), from the first akm trial that recorded them. */
  env: Record<string, string> | null;
}

const distinct = <T>(xs: T[]): T[] => [...new Set(xs)].sort();

/**
 * The trials of a Harbor job folder, as report.ts reads them, with two things report.ts cannot see.
 * A trial gets `timed_out` from its exception before anything else is done to it.
 * Harbor keeps the first exception of a trial only, so after an AgentTimeoutError the error that akm_opencode.py raises when the plugin
 * was not live is lost. The akm arm leaves akm_plugin_status.json for that: a trial whose file says the plugin was not live gets
 * AkmPluginNotLoadedError as its exception and no reward, whatever else it hit first, as one whose exception that was already does.
 */
export function loadRunTrials(jobDir: string): { trials: RunTrial[]; observed: Observed } {
  const observed: Observed = { akm_version: [], plugin_akm_cli: [], assets_indexed: [], env: null };
  const trials = loadTrials(jobDir).map((t): RunTrial => {
    const row: RunTrial = { ...t, timed_out: t.error !== null && TIMEOUTS.has(t.error) };
    if (t.arm !== "akm") return row;
    const agent = join(jobDir, t.trial, "agent");
    const status = readJson(join(agent, "akm_plugin_status.json"));
    if (status?.live === false) {
      row.error = PLUGIN_ERROR;
      row.reward = null;
      row.plugin_problem = typeof status.problem === "string" ? status.problem : "the plugin was not live";
    }
    const install = readJson(join(agent, "akm_install.json"));
    if (install) {
      if (typeof install.akm_version === "string") observed.akm_version.push(install.akm_version);
      if (typeof install.plugin_akm_cli === "string") observed.plugin_akm_cli.push(install.plugin_akm_cli);
      if (typeof install.assets_indexed === "number") observed.assets_indexed.push(install.assets_indexed);
      if (observed.env === null && typeof install.env === "object" && install.env !== null) observed.env = install.env;
    }
    return row;
  });
  return { trials, observed: { ...observed, akm_version: distinct(observed.akm_version), plugin_akm_cli: distinct(observed.plugin_akm_cli), assets_indexed: distinct(observed.assets_indexed) } };
}

/** Trials that hit a time limit, by arm. */
export function timeoutsOf(trials: RunTrial[]): { control: number; akm: number } {
  const count = (arm: Arm) => trials.filter((t) => t.arm === arm && t.timed_out).length;
  return { control: count("control"), akm: count("akm") };
}

/** The numbers of the report that `--repeat` takes the spread of, and that a matrix reads: all numbers or null, none text. */
export function metricsOf(report: Report, trials: RunTrial[]) {
  const timeouts = timeoutsOf(trials);
  const arm = (a: ArmSummary, name: Arm) => ({
    pass_rate: a.pass_rate?.value ?? null,
    passed: a.passed,
    scored: a.scored,
    errored: a.errored,
    timeouts: timeouts[name],
    minutes: a.per_trial.minutes,
    agent_minutes: a.per_trial.agent_minutes,
    cost_usd: a.per_trial.cost_usd,
  });
  const d = report.delta;
  const e = report.engagement;
  return {
    control: arm(report.control, "control"),
    akm: arm(report.akm, "akm"),
    delta: { value: d?.value ?? null, lo: d?.lo ?? null, hi: d?.hi ?? null, n: d?.n ?? null },
    better: { ...report.better },
    engagement: { rate: e.rate, called: e.called, trials: e.trials, curated_read: e.curated_read, control_calls: e.control_calls },
  };
}

/** The errored trials of both arms, for the summary's n_errored. */
export const erroredOf = (report: Report): number => report.control.errored + report.akm.errored;

/** The summary keys about the akm under test, which both evals write: akm_version, akm_bin and akm_build as in the other evals, and what was installed. */
export function akmSummary(arm: AkmArm, akmEnv: Record<string, string>, packages: { file: string; sha256: string }[], observed: Observed) {
  return {
    akm_version: arm.cli.version,
    akm_bin: arm.bin,
    akm_build: arm.build,
    akm_env: akmEnv,
    akm_install: {
      from: arm.cli.tarball ? "checkout" : "release",
      plugin_from: arm.plugin.tarball ? "checkout" : "release",
      plugin_version: arm.plugin.version,
      packages,
      observed,
    },
  };
}
