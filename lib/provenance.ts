// What ties a run to its inputs, for the summary.json every eval writes: digests of the files it read, the config it ran
// with (secrets redacted), the model it called and the host of its endpoint, and the code it ran. Pure helpers: they read the files they are given, nothing else.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export const sha256Text = (text: string): string => sha256(text);

export const sha256File = (path: string): string => sha256(readFileSync(path));

/** The digest of a list of files: a line for each [name, content digest], in the order of the names. */
export const manifestDigest = (entries: [string, string][]): string =>
  sha256([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, digest]) => `${name}\0${digest}\n`).join(""));

/**
 * One digest over the files, in the order of their paths. It covers each path as given and each file's content, so a file
 * renamed, added, dropped or changed gives another digest. Pass paths relative to a fixed folder for a digest that holds on another machine.
 */
export function sha256Files(paths: string[]): string {
  return manifestDigest(paths.map((path) => [path, sha256File(path)]));
}

const isRecord = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);

/** JSON with the keys of every object in order, so the same value always gives the same text. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (isRecord(x)) return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`;
  return JSON.stringify(x) ?? "null";
}

/** The digest of any JSON value: sha256 of its canonical text. */
export const sha256Json = (x: unknown): string => sha256(canonical(x));

/** The repository root, one folder above lib/. */
const REPO_ROOT = resolve(import.meta.dir, "..");

/** A file that tests the code and is not the code: `*.test.ts`, `test_*.py`, and `fakes.ts` and `golden.ts`, the test doubles and the golden-file check that only tests import. */
const testFile = (name: string): boolean => /\.test\.ts$/.test(name) || /^test_.*\.py$/.test(name) || name === "fakes.ts" || name === "golden.ts";

/** The files in `dir` and the folders below it whose name ends in one of `extensions`, without tests, fixtures, dependencies and caches. */
function codeFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith(".") || ["node_modules", "__pycache__", "fixtures"].includes(entry.name) ? [] : codeFiles(path, extensions);
    return entry.isFile() && !testFile(entry.name) && extensions.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
  });
}

/**
 * The digest of the code a run was made with, for the `harness_sha256` of a summary.json: one sha256 over a manifest of the eval's own
 * source files (every `.ts` and `.py` in `evalSrcDir`, at any depth) and of the shared code it runs on (every `.ts` and `.py` file under
 * lib/, such as the akm arm of the Harbor evals in lib/harbor/akm_opencode.py, and lib/env.sh). The manifest has the path of each file from the repository root, with the digest of its content, in the order of the
 * paths. It leaves out the tests (`*.test.ts`, `test_*.py`, `fakes.ts`), the fixtures, the dependencies and the READMEs, since none of
 * them changes what a run measures. The digest does not depend on where the checkout is, and it covers edits that are not committed,
 * which `git_commit` does not.
 *
 * `also` names the src folders of other evals whose code this one imports (nightly scores with the checks of consolidate, distill and
 * reflect), counted the same way. `root` is the checkout the code is in: this one, but for tests.
 */
export function harnessSha256(evalSrcDir: string, options: { also?: string[]; root?: string } = {}): string {
  const base = resolve(options.root ?? REPO_ROOT);
  const folders = [evalSrcDir, ...(options.also ?? [])].map((dir) => resolve(dir));
  for (const dir of folders) {
    const inside = relative(base, dir);
    if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error(`${dir} is not inside the repository at ${base}`);
  }
  const env = join(base, "lib", "env.sh");
  const paths = new Set([...folders.flatMap((dir) => codeFiles(dir, [".ts", ".py"])), ...codeFiles(join(base, "lib"), [".ts", ".py"]), ...(existsSync(env) ? [env] : [])]);
  return manifestDigest([...paths].map((path) => [relative(base, path).split(sep).join("/"), sha256File(path)]));
}

const REDACTED = "<redacted>";

/** A `$NAME` or `${NAME}` reference to an environment variable, such as the "$MODEL_API_KEY" of an akm config. It holds no secret. */
const VARIABLE = /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})$/;

/**
 * Does a name hold a credential, the one rule of redaction: it ends in key, secret, password, passwd, pwd, passphrase, credential, token,
 * authorization or cookie, in any case (apiKey, x-api-key, access_token, MYSQL_PWD), or its last word is auth, bearer, pat or pass (GH_PAT,
 * dbPass). maxTokens, keyword, tokenizer, author, path and bypass do not.
 */
export const credentialField = (name: string): boolean => {
  const spelled = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(); // apiKey is api_key, ghPat is gh_pat
  return /(?:key|secret|password|passwd|pwd|passphrase|credential)s?$|(?:token|authorization|cookie)$|(?:^|[^a-z0-9])(?:auth|bearer|pat|pass)$/.test(spelled);
};

/** A deep copy for summary.json: credential fields are redacted, and URL userinfo and credential query values are removed at any depth. `$NAME` references stay. */
export function redactConfig(config: any): any {
  if (Array.isArray(config)) return config.map(redactConfig);
  if (typeof config === "string") return redactUrl(config);
  if (typeof config !== "object" || config === null) return config;
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, credentialField(key) && !(typeof value === "string" && VARIABLE.test(value)) ? REDACTED : redactConfig(value)]));
}

const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** The query of a URL with the value of each credential parameter written as <redacted>. */
const cleanQuery = (query: string): string =>
  query
    .split("&")
    .map((pair) => {
      const at = pair.indexOf("=");
      return at < 0 || !credentialField(decoded(pair.slice(0, at))) ? pair : `${pair.slice(0, at + 1)}${REDACTED}`;
    })
    .join("&");

/** Preserve a config URL's path and noncredential parameters without recording its login or credential query values. */
function redactUrl(value: string): string {
  try {
    if (!new URL(value).host) return value;
  } catch {
    return value;
  }
  const safe = value.replace(/^(\s*[a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, "$1");
  const at = safe.indexOf("?");
  const hash = safe.indexOf("#");
  if (at < 0 || (hash >= 0 && hash < at)) return safe;
  const end = hash < 0 ? safe.length : hash;
  return `${safe.slice(0, at + 1)}${cleanQuery(safe.slice(at + 1, end))}${safe.slice(end)}`;
}

/**
 * The whole endpoint, for the resume fingerprint of scripts/matrix, which is never written into a result: the scheme, host, port and path of
 * the URL, in lower case for the scheme and host, without a trailing slash, with no user name, password or fragment, and with the query's
 * parameters in order and the value of each credential parameter replaced by "<redacted>". Null for a value that is missing or is not a URL.
 */
export function endpointIdentity(url: unknown): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (!u.host) return null;
  const path = u.pathname.replace(/\/+$/, "");
  const query = u.search.length > 1 ? `?${cleanQuery(u.search.slice(1).split("&").sort().join("&"))}` : "";
  return `${u.protocol}//${u.host}${path}${query}`;
}

/** What a summary records of an endpoint: the scheme, host and port, in lower case, and nothing after them. Null for what is no URL. */
export function endpointHost(url: unknown): string | null {
  const id = endpointIdentity(url);
  return id === null ? null : new URL(id).origin;
}

/** The settings of an engine that are the model's, not the akm config's: a summary's `engine` records them, and the config digest of scripts/compare leaves them out. */
export const ENGINE_KEYS = ["model", "endpoint", "temperature", "enableThinking", "timeoutMs"] as const;

/**
 * An akm config without the settings of its engines that are the model's (ENGINE_KEYS): what the config axis of a comparison digests, and
 * what the manifest keeps as `config.redacted`. The model's settings are the model axis.
 */
export function withoutEngineSettings(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(withoutEngineSettings);
  if (!isRecord(x)) return x;
  return Object.fromEntries(
    Object.entries(x).map(([key, value]) => {
      if (key === "engines" && isRecord(value)) return [key, Object.fromEntries(Object.entries(value).map(([name, e]) => [name, isRecord(e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !(ENGINE_KEYS as readonly string[]).includes(k))) : e]))];
      return [key, withoutEngineSettings(value)];
    }),
  );
}

export interface EngineSetting {
  model: string | null;
  /** The endpoint's host: scheme, host and port, with no path, no query and no credentials. */
  endpoint: string | null;
  temperature: number | null;
  enableThinking: boolean | null;
  timeoutMs: number | null;
}

export interface EngineSettings extends EngineSetting {
  /** The name of the engine `defaults.llmEngine` names, whose settings are the fields above. */
  engine: string | null;
  /** The settings of every engine the config uses, by name: the default one and each one a strategy, a process or a gate is routed to. */
  engines: Record<string, EngineSetting>;
}

const settingsOf = (e: any): EngineSetting => ({ model: e?.model ?? null, endpoint: endpointHost(e?.endpoint), temperature: e?.temperature ?? null, enableThinking: e?.enableThinking ?? null, timeoutMs: e?.timeoutMs ?? null });

/** The names under a key that ends in "engine" (llmEngine, engine, judgeEngine) anywhere in the config but its `engines` table. */
function engineNames(x: any, key = "", out = new Set<string>()): Set<string> {
  if (typeof x === "string") {
    if (/engine$/i.test(key)) out.add(x);
  } else if (Array.isArray(x)) {
    for (const v of x) engineNames(v, key, out);
  } else if (typeof x === "object" && x !== null) {
    for (const [k, v] of Object.entries(x)) if (!(key === "" && k === "engines")) engineNames(v, k, out);
  }
  return out;
}

/**
 * The settings of the LLM engine that `defaults.llmEngine` names in an akm config, and in `engines` those of every engine the config uses
 * (that `defaults.llmEngine`, `defaults.engine`, or an `engine` of a strategy, a process or a gate names). Anything the config does not set is null.
 */
export function engineSettings(config: any): EngineSettings {
  const engine: string | null = config?.defaults?.llmEngine ?? null;
  const table = config?.engines ?? {};
  const used = [...engineNames(config)].filter((name) => Object.hasOwn(table, name)).sort();
  const engines = Object.fromEntries(used.map((name) => [name, settingsOf(table[name])]));
  return { engine, ...settingsOf(engine !== null && Object.hasOwn(table, engine) ? table[engine] : undefined), engines };
}
