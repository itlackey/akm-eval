// What the evals that run an agent in Harbor share: the versions a run is made of, the model, the two arms and
// Harbor itself. evals/agent-ab and benchmarks/terminal-bench both run opencode alone and with the akm plugin on the
// same tasks, and both import this. The akm arm is akm_opencode.py beside it, trials.ts reads what the run leaves, and report.ts and
// score.ts score it.

import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { dirtyFingerprint } from "../akm/akm.ts";
import { fail } from "../cli.ts";
import { type ModelEntry, type ModelLimits, type ModelSettings, loadModels, resolveModel } from "../models.ts";
import { credentialField, sha256File, sha256Text } from "../provenance.ts";
import type { Arm, Trial } from "./report.ts";
import type { RunTrial } from "./score.ts";
import { TIMEOUT_ERRORS, loadTrials } from "./trials.ts";

/** What a run is made of. Change one at a time: a difference between two runs that moved two of them has no single cause. */
export const PINS = { akm_cli: "0.10.261003-beta", akm_plugin: "0.10.261002-beta", opencode: "1.18.34", harbor: "0.24.0" } as const;

/** The pins of one run, as it was made: the akm under test replaces the pinned akm-cli, and a checkout that holds the plugin replaces the plugin. */
export type Pins = Record<keyof typeof PINS, string>;

/** Compatible published plugins: each depends on the CLI release named here. Other releases retain the default plugin. */
export const RELEASE_PLUGINS: Record<string, string> = { [PINS.akm_cli]: PINS.akm_plugin, "0.9.26": "0.9.26202610051302" };

export const CONCURRENT_TRIALS = 4;
const SETUP_TIMEOUT_SEC = 2700; // the akm arm installs akm and the plugin first. Both arms get the same.
const WIDE_RUN = 8; // more trials at once than this get the warning of dockerNetworkWarning

/**
 * The warning for a run of `concurrency` simultaneous trials, or undefined when it needs none. Every Harbor trial creates a Docker network,
 * and the daemon's default address pools hold about thirty in all: a run of sixteen reached that limit. `name` is the eval's, as its messages start.
 */
export function dockerNetworkWarning(name: string, concurrency: number): string | undefined {
  if (concurrency <= WIDE_RUN) return undefined;
  return `${name}: ${concurrency} concurrent trials each need a Docker network; the daemon's default address pools allow about 30 in all. Raise default-address-pools in /etc/docker/daemon.json for more (see evals/agent-ab/README.md).`;
}

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

const hostnameOf = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/**
 * The model of a run and the environment Harbor runs in, from the flag, `host` (the process environment) and models.json. This is the
 * rule of every eval: `flag` or MODEL_NAME names the model, and a name that is a line of models.json goes to that line's endpoint
 * with the key in its api_key_env, any other name to the gateway in MODEL_BASE_URL with MODEL_API_KEY. Here the result is mapped to
 * what opencode's openai provider reads, OPENAI_BASE_URL and OPENAI_API_KEY. So an endpoint serves an openai model: opencode is given
 * `openai/<id>`, with the id as the endpoint names it, a "/" in it included (`Qwen/Qwen2.5-7B`), unless the id already starts with
 * `openai/`. A `--model openai/<line>` finds the models.json line `<line>`.
 * OPENAI_BASE_URL and OPENAI_API_KEY, which this took before models.json, still stand in for an empty MODEL_BASE_URL and an empty
 * MODEL_API_KEY. The key stands in only for the URL it goes with (OPENAI_BASE_URL) or for api.openai.com: it is OpenAI's key, and
 * a gateway of another host is sent none. A gateway left with no key, by that rule or by a models.json line with no api_key_env, is
 * sent the placeholder `unused` and a line on stderr says so: a server that needs no key ignores it.
 *
 * With no line and no MODEL_BASE_URL (or OPENAI_BASE_URL), an openai model goes to openai with the key
 * in OPENAI_API_KEY or MODEL_API_KEY, and another provider's model is left to Harbor, which reads its key under the provider's own name.
 * Only what Harbor needs goes into the environment (hostEnv), and the model's variables.
 */
export function modelSettings(flag: string | undefined, host: Env, entries?: Record<string, ModelEntry>): { model: string; env: Record<string, string>; modelLimits?: ModelLimits; modelReasoningEffort?: string } {
  const id = (flag ?? host.MODEL_NAME)?.trim();
  if (flag !== undefined && !id) fail("--model needs a model name");
  if (!id) fail("name the model: pass --model NAME, or set MODEL_NAME in .env, as opencode names it, such as openai/gpt-6-luna. See .env.example.");
  let lines: Record<string, ModelEntry>;
  try {
    lines = entries ?? loadModels();
  } catch (e) {
    return fail((e as Error).message);
  }
  // The gateway, when either URL names one: the older name of each setting fills in for the MODEL_* one that is empty. The older key
  // goes only with its own URL or to api.openai.com, never to another host.
  const openaiUrl = host.OPENAI_BASE_URL?.trim();
  const gateway = host.MODEL_BASE_URL?.trim() || openaiUrl;
  const openaiKeyFits = gateway !== undefined && (gateway === openaiUrl || hostnameOf(gateway) === "api.openai.com");
  const named = gateway ? { ...host, MODEL_BASE_URL: gateway, MODEL_API_KEY: host.MODEL_API_KEY?.trim() || (openaiKeyFits ? host.OPENAI_API_KEY : undefined) } : host;
  const env = hostEnv(host);

  // A line of models.json, by the id as given or, for `openai/<line>`, by <line>.
  const line = [id, id.startsWith("openai/") ? id.slice("openai/".length) : id].find((name) => Object.hasOwn(lines, name));
  if (line !== undefined || named.MODEL_BASE_URL?.trim()) {
    let m: ModelSettings;
    try {
      m = resolveModel("model", line ?? id, named, lines);
    } catch (e) {
      return fail((e as Error).message);
    }
    const model = m.name.startsWith("openai/") ? m.name : `openai/${m.name}`; // the endpoint's own id, as opencode's openai provider takes it
    if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(m.baseUrl)) fail(`the endpoint of ${model}, ${m.baseUrl}, would be the container itself, not the model server. Use the address a container reaches it at.`);
    if (!m.apiKey) console.warn(`model key is empty: sending "unused" to ${hostnameOf(m.baseUrl) || "the endpoint"} (a server that needs a key will fail every trial after its setup)`);
    // No limits is a documented choice (a cloud model needs none), so this warns and does not refuse. But the usual cause is a
    // checkout or worktree without models.json (it is gitignored), and then the run is quietly not comparable with one that had them.
    if (!m.limits) console.warn(`WARNING: no context and output limits for ${model}: models.json has no "limits" for it (the file is gitignored, so a new checkout or worktree has none). OpenCode runs without provider.openai.models.<model>.limit in both arms, and the results are not comparable with runs that had limits. Add "limits": { "context": N, "output": N } to its line in models.json to set them.`);
    return { model, env: { ...env, OPENAI_API_KEY: m.apiKey || "unused", OPENAI_BASE_URL: m.baseUrl }, ...(m.limits ? { modelLimits: m.limits } : {}), ...(m.chat?.reasoning_effort !== undefined ? { modelReasoningEffort: m.chat.reasoning_effort } : {}) };
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
export function preflight(values: { model?: string } = {}): ReturnType<typeof modelSettings> {
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
  /** The sha256 of the checkout's uncommitted changes (dirtyFingerprint of lib/akm/akm.ts): null for a clean checkout and for a release, and for an arm made by hand. */
  build_fingerprint?: string | null;
  cli: { version: string; tarball: string | null };
  plugin: { version: string; tarball: string | null };
  /** The folder the tarballs are in. Null when there are none. */
  packages: string | null;
}

/** The arm of a run with no `--akm`, or with an npm spec: the compatible plugin when recorded in RELEASE_PLUGINS, otherwise the pinned plugin, and akm-cli at `version`. */
export function releaseArm(version: string = PINS.akm_cli): AkmArm {
  return { bin: `akm-cli@${version}`, build: null, cli: { version, tarball: null }, plugin: { version: RELEASE_PLUGINS[version] ?? PINS.akm_plugin, tarball: null }, packages: null };
}

export const pinsOf = (arm: AkmArm): Pins => ({ ...PINS, akm_cli: arm.cli.version, akm_plugin: arm.plugin.version });

/** The lockfiles committed for the releases of akm-cli and the plugin, one folder per release, named <package>-<version>. akm_opencode.py installs from them with `npm ci`. evals/agent-ab/README.md ("Dependencies") says how one is made. */
export const LOCKS_DIR = join(import.meta.dir, "locks");

/** The folder of the lockfile committed for this release of `pkg`, or null when there is none. */
export const lockFolder = (pkg: "akm-cli" | "akm-opencode", version: string): string | null => {
  const folder = join(LOCKS_DIR, `${pkg}-${version}`);
  return existsSync(join(folder, "package-lock.json")) ? folder : null;
};

/** What to say of a run whose akm-cli has no lockfile: a checkout, or a release other than the pinned one. */
const UNLOCKED = "Its dependencies are not locked: the first preparation for each runtime resolves them, and akm_install records the tree each trial uses. A run whose containers got different trees is aborted.";

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
  const arm: AkmArm = { bin: withHome(resolve(checkout)), build: checkoutBuild(checkout), build_fingerprint: dirtyFingerprint(checkout), cli: { version: pkg.version, tarball: cli }, plugin, packages: into };
  const noPlugin = `the checkout holds no plugin (no package.json named akm-opencode), so the akm arm keeps the pinned plugin ${PINS.akm_plugin}. It carries its own akm-cli ${PINS.akm_cli}: only the akm it shells out to is the one under test.`;
  return { arm, note: pluginDir ? `the akm arm installs the checkout from its tarballs. ${UNLOCKED}` : `${noPlugin} ${UNLOCKED}` };
}

/** The arm for `--akm`: a release is a name, a checkout is packed into `into`. Returns the arm and a note to print when something about it needs saying. */
export function akmArm(value: string | undefined, into: string, pack?: Pack): { arm: AkmArm; note: string | null } {
  const source = parseAkm(value);
  if (source.kind === "checkout") return packAkm(source.path, into, pack);
  const arm = releaseArm(source.version);
  if (source.version === PINS.akm_cli) return { arm, note: null };
  const other = `the akm arm installs akm-cli ${source.version} from the npm registry, with plugin ${arm.plugin.version}. ${RELEASE_PLUGINS[source.version] ? "The plugin depends on this CLI release." : `The plugin carries its own akm-cli ${PINS.akm_cli}: only the akm it shells out to is the one under test.`}`;
  return { arm, note: lockFolder("akm-cli", source.version) ? other : `${other} ${UNLOCKED}` };
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
export function parseAkmEnv(values: string[] | undefined, semantic = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of values ?? []) {
    const eq = v.indexOf("=");
    if (eq < 1) fail(`--akm-env takes KEY=VALUE, not ${JSON.stringify(v)}`);
    const key = v.slice(0, eq);
    if (!/^AKM_[A-Z0-9_]+$/.test(key)) fail(`--akm-env ${key}: only AKM_* settings go to akm`);
    if (FIXED_AKM_ENV.includes(key)) fail(`--akm-env ${key}: the arm fixes it. The five directories move together, and the plugin must run the akm installed in the container.`);
    if (credentialField(key)) fail(`--akm-env ${key}: it looks like a credential, and the job and the summary record every setting.`);
    if (Object.hasOwn(out, key)) fail(`--akm-env ${key} is given twice`);
    out[key] = v.slice(eq + 1);
  }
  if (semantic) out.AKM_EVAL_SEMANTIC_SEARCH = "1";
  return out;
}

/** The options of the Harbor evals for the akm under test, for parseArgs, and their lines of an eval's usage text. */
export const AKM_ARM_OPTIONS = { semantic: { type: "boolean" }, akm: { type: "string" }, "akm-env": { type: "string", multiple: true } } as const;
export const akmArmUsage = `  --semantic      enable AKM hybrid semantic search with bge-small-en-v1.5; setup verifies embeddings and a semantic query.
  --akm           the akm of the akm arm, which runs in a container: akm-cli@x.y.z (an exact npm release), or the folder of an
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
  modelLimits?: ModelLimits;
  modelReasoningEffort?: string;
  concurrency?: number;
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
  const opencodeConfig: Record<string, unknown> = { $schema: "https://opencode.ai/config.json", autoupdate: false, small_model: o.model };
  if (o.modelLimits || o.modelReasoningEffort !== undefined) {
    const slash = o.model.indexOf("/");
    const provider = o.model.slice(0, slash), id = o.model.slice(slash + 1);
    opencodeConfig.provider = { [provider]: { models: { [id]: { ...(o.modelLimits ? { limit: o.modelLimits } : {}), ...(o.modelReasoningEffort !== undefined ? { options: { reasoningEffort: o.modelReasoningEffort } } : {}) } } } };
  }
  const both = { model_name: o.model, override_setup_timeout_sec: SETUP_TIMEOUT_SEC };
  const tarballs = arm.cli.tarball !== null || arm.plugin.tarball !== null;
  if (tarballs && !o.packagesDir) throw new Error("the akm arm has tarballs, and the job names no folder for them");
  return {
    job_name: o.name,
    jobs_dir: o.jobsDir,
    n_attempts: o.attempts,
    n_concurrent_trials: o.concurrency ?? CONCURRENT_TRIALS,
    environment: { type: "docker", delete: true },
    agents: [
      { import_path: "eval_opencode:EvalOpenCode", ...both, kwargs: { version: PINS.opencode, opencode_config: opencodeConfig, setup_cache_dir: resolve(import.meta.dir, "../../.cache/harbor-setup") } },
      {
        import_path: "akm_opencode:AkmOpenCode",
        ...both,
        ...(o.akm?.env ? { env: o.akm.env } : {}),
        kwargs: {
          version: PINS.opencode,
          opencode_config: opencodeConfig,
          setup_cache_dir: resolve(import.meta.dir, "../../.cache/harbor-setup"),
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

/**
 * What a summary keeps of the job: the datasets and the agents with their options, the attempts and the concurrency, with paths relative to
 * the run's folder or the repository's. The akm arm's `library_assets` is left out: it is the count the akm on this machine made of the
 * library (or 1, when that akm is not the one the arm installs), so the host's akm would change the config that runs are compared by.
 * job.json keeps it, as Harbor was given it, and the summary keeps the count as `library.assets`.
 */
export function jobRecord(cfg: Record<string, unknown>, dir: string, root: string): Record<string, unknown> {
  const { job_name: _name, jobs_dir: _dir, ...rest } = cfg;
  const job = relativePaths(rest, [dir, root]) as { agents?: { kwargs?: Record<string, unknown> }[] } & Record<string, unknown>;
  if (Array.isArray(job.agents)) {
    job.agents = job.agents.map((agent) => {
      if (!agent.kwargs) return agent;
      const { library_assets: _assets, ...kwargs } = agent.kwargs;
      return { ...agent, kwargs };
    });
  }
  return job;
}

/** One digest over every file under `dir`, by relative path and content, so another machine gets the same one. `except` names files, by path from `dir`, that the digest leaves out. */
export function sha256Dir(dir: string, except: string[] = []): string {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.isFile() && !except.includes(relative(dir, join(d, e.name)))) files.push(relative(dir, join(d, e.name)));
    }
  };
  walk(dir);
  return sha256Text([...files].sort().map((rel) => `${rel}\0${sha256File(join(dir, rel))}\n`).join(""));
}

/** Runs Harbor in a Python environment that has exactly the pinned release, and copies what it prints to the log. */
export async function runHarbor(configFile: string, logFile: string, env: Record<string, string>, options: { resume?: string } = {}): Promise<number> {
  const log = createWriteStream(logFile, { flags: options.resume ? "a" : "w" });
  const command = options.resume ? ["jobs", "resume", "--job-path", options.resume] : ["run", "-c", configFile, "--yes"];
  const proc = Bun.spawn(["uv", "run", "--no-project", "--python", "3.12", "--with", `harbor==${PINS.harbor}`, "harbor", ...command], {
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
  let interrupted = false;
  const stop = () => { interrupted = true; proc.kill("SIGINT"); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    await Promise.all([tee(proc.stdout, process.stdout), tee(proc.stderr, process.stderr)]);
    const code = await proc.exited;
    return interrupted ? 130 : code;
  } finally {
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
    await new Promise((done) => log.end(done));
  }
}

// ---- what the run left ----------------------------------------------------------------------------------------------------

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
  /** Query modes and embedding counts explicitly verified during semantic setup; absent in older records. */
  search_mode?: string[];
  embeddings_indexed?: number[];
  /** The AKM_* settings the arm ran with (the arm's, then the job's), from the first akm trial that recorded them. */
  env: Record<string, string> | null;
  /** The digest of the dependency tree each akm trial installed (`dependency_tree_sha256` of akm_install.json: akm-cli's and the plugin's `npm ls --all --json`), without repeats. More than one means the containers did not install the same code. */
  dependency_trees?: string[];
  /** The sha256 of the lockfile each install came from, or null for an install that came from none (a checkout, or a release with no lockfile), from the first akm trial that recorded them. */
  lockfiles?: { akm_cli: string | null; plugin: string | null } | null;
}

const distinct = <T>(xs: T[]): T[] => [...new Set(xs)].sort();

/**
 * The trials of a Harbor job folder, as trials.ts reads them, with two things trials.ts cannot see.
 * A trial gets `timed_out` from its exception before anything else is done to it.
 * Harbor keeps the first exception of a trial only, so after an AgentTimeoutError the error that akm_opencode.py raises when the plugin
 * was not live is lost. The akm arm leaves akm_plugin_status.json for that: a trial whose file says the plugin was not live gets
 * AkmPluginNotLoadedError as its exception and no reward, whatever else it hit first, as one whose exception that was already does.
 */
export function loadRunTrials(jobDir: string): { trials: RunTrial[]; observed: Observed } {
  const observed: Observed & { dependency_trees: string[] } = { akm_version: [], plugin_akm_cli: [], assets_indexed: [], env: null, dependency_trees: [], lockfiles: null };
  if (!existsSync(jobDir)) return { trials: [], observed }; // Harbor never made the job: every cell of the grid is missing
  const trials = loadTrials(jobDir).map((t): RunTrial => {
    const row: RunTrial = { ...t, timed_out: t.error !== null && TIMEOUT_ERRORS.has(t.error) };
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
      if (typeof install.search_mode === "string") (observed.search_mode ??= []).push(install.search_mode);
      if (typeof install.embeddings_indexed === "number") (observed.embeddings_indexed ??= []).push(install.embeddings_indexed);
      if (observed.env === null && typeof install.env === "object" && install.env !== null) observed.env = install.env;
      if (typeof install.dependency_tree_sha256 === "string") observed.dependency_trees.push(install.dependency_tree_sha256);
      const locks = install.lockfiles;
      if (observed.lockfiles === null && typeof locks === "object" && locks !== null) observed.lockfiles = { akm_cli: locks.akm_cli ?? null, plugin: locks.plugin ?? null };
    }
    return row;
  });
  return { trials, observed: { ...observed, akm_version: distinct(observed.akm_version), plugin_akm_cli: distinct(observed.plugin_akm_cli), assets_indexed: distinct(observed.assets_indexed), dependency_trees: distinct(observed.dependency_trees), ...(observed.search_mode ? { search_mode: distinct(observed.search_mode) } : {}), ...(observed.embeddings_indexed ? { embeddings_indexed: distinct(observed.embeddings_indexed) } : {}) } };
}

// ---- whether the run did what it set out to do ----------------------------------------------------------------------------

/**
 * The trial grid of a run: every selected task, in each arm, once per attempt. `expected` = completed + failed + missing, and it is
 * tasks x attempts for an arm, and tasks x 2 arms x attempts for the run.
 */
export interface Cells {
  expected: number;
  /** Cells whose trial got a reward and raised no exception. */
  completed: number;
  /** Cells whose trial raised an exception or got no reward. A trial whose agent ran out of time and was verified anyway is one of them. */
  failed: number;
  /** Cells with no trial: Harbor never started them, or was stopped before they wrote a result. */
  missing: number;
  /** Trials outside the grid: of a task the run did not ask for, or beyond the attempts it asked for. They fill no cell. */
  unexpected: number;
}

/** The grid of the run and of each arm. */
export interface Completion extends Cells {
  control: Cells;
  akm: Cells;
}

/** Which cells of the grid have a trial, from the trials Harbor left and the tasks and attempts the job asked for. */
export function completionOf(trials: Trial[], tasks: string[], attempts: number): Completion {
  const cells = (arm: Arm): Cells => {
    const mine = trials.filter((t) => t.arm === arm);
    const cell: Cells = { expected: tasks.length * attempts, completed: 0, failed: 0, missing: 0, unexpected: 0 };
    let used = 0;
    for (const task of tasks) {
      const ran = mine.filter((t) => t.task === task).slice(0, attempts);
      used += ran.length;
      for (const t of ran) {
        if (t.error === null && t.reward !== null) cell.completed++;
        else cell.failed++;
      }
      cell.missing += attempts - ran.length;
    }
    cell.unexpected = mine.length - used;
    return cell;
  };
  const [control, akm] = [cells("control"), cells("akm")];
  const total = (key: keyof Cells): number => control[key] + akm[key];
  return { expected: total("expected"), completed: total("completed"), failed: total("failed"), missing: total("missing"), unexpected: total("unexpected"), control, akm };
}

/**
 * Whether the run finished: `complete` only when Harbor exited 0 and every cell of the grid has a trial, a trial that errored or timed
 * out included (those are counted, not missing), no arm's trials all errored (it measured nothing), and the akm arm's containers all
 * installed the same dependency tree. Anything else is `aborted`, and the reason says what was not done. `jobWritten` is false when
 * Harbor left no job folder at all.
 */
export function statusOf(exit: number, completion: Completion, jobWritten = true, observed?: Pick<Observed, "dependency_trees">): { status: "complete" | "aborted"; aborted_reason: string | null } {
  const reasons: string[] = [];
  if (exit !== 0) reasons.push(`Harbor exited ${exit}`);
  if (!jobWritten) reasons.push("Harbor wrote no job");
  const trees = observed?.dependency_trees?.length ?? 0;
  if (trees > 1) reasons.push(`the akm arm's containers installed ${trees} different dependency trees (akm_install.observed.dependency_trees), so its trials did not all run the same code`);
  if (completion.missing > 0) reasons.push(`${completion.missing} of ${completion.expected} expected trials have no result (control ${completion.control.missing}, akm ${completion.akm.missing})`);
  if (completion.unexpected > 0) reasons.push(`${completion.unexpected} trials fall outside the grid of tasks, arms and attempts the job asked for`);
  for (const arm of ["control", "akm"] as const) {
    const { expected, failed } = completion[arm];
    if (expected > 0 && failed === expected) reasons.push(`the ${arm} arm completed none of its ${expected} trials: every one errored`);
  }
  return reasons.length === 0 ? { status: "complete", aborted_reason: null } : { status: "aborted", aborted_reason: reasons.join("; ") };
}

/**
 * assets_sha256 of a Harbor eval's summary: one digest over what the run was set to run on. `library` is the digest of the library the
 * akm arm seeds from, `dataset` identifies the tasks (the digests of the selected ones), and `attempts` is how many times each ran. It
 * moves when any of them does, so two summaries with another library, other tasks or another attempt count are other cases. The
 * components stay in the summary as well, to say which one moved.
 */
export function assetsSha256(o: { library: string | null; dataset: Record<string, unknown>; attempts: number }): string {
  const sorted = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(sorted) : typeof x === "object" && x !== null ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sorted(v)])) : x;
  return sha256Text(JSON.stringify(sorted({ library: o.library, dataset: o.dataset, attempts: o.attempts })));
}

/**
 * akm_build_fingerprint of a Harbor eval: what the akm under test holds beyond its version, as the other evals record it. That is the digest
 * of the checkout's uncommitted changes (null for a clean checkout and a release), and here also the digest of the dependency tree the
 * containers installed (when one is known), since two runs of one version with other dependencies ran other code.
 */
export function buildFingerprint(changes: string | null, tree: string | null): string | null {
  return tree === null ? changes : sha256Text(JSON.stringify({ changes, dependency_tree_sha256: tree }));
}

/**
 * The summary keys about the akm under test, which both evals write: akm_version, akm_bin, akm_build and akm_build_fingerprint as in the other
 * evals, and what was installed. `akm_install.dependency_tree_sha256` is the one tree every akm container installed (null when none recorded
 * one, or they differ, which statusOf aborts the run for), and `locked` says whether both installs came from a committed lockfile. When it is
 * false the dependencies were resolved when the containers installed, and only the digest tells two runs apart.
 */
export function akmSummary(arm: AkmArm, akmEnv: Record<string, string>, packages: { file: string; sha256: string }[], observed: Observed) {
  const trees = observed.dependency_trees ?? [];
  const tree = trees.length === 1 ? trees[0] : null;
  const lockfiles = observed.lockfiles ?? null;
  return {
    akm_version: arm.cli.version,
    akm_bin: arm.bin,
    akm_build: arm.build,
    akm_build_fingerprint: buildFingerprint(arm.build_fingerprint ?? null, tree),
    akm_env: akmEnv,
    akm_install: {
      from: arm.cli.tarball ? "checkout" : "release",
      plugin_from: arm.plugin.tarball ? "checkout" : "release",
      plugin_version: arm.plugin.version,
      packages,
      dependency_tree_sha256: tree,
      locked: lockfiles !== null && lockfiles.akm_cli !== null && lockfiles.plugin !== null,
      observed,
    },
  };
}
