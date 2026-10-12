// What ties a run to its inputs, for the summary.json every eval writes: digests of the files it read, the config it ran
// with (secrets redacted), the settings of the model it called, and the code it ran. Pure helpers: they read the files they are given, nothing else.

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

/** A `$NAME` reference to an environment variable, such as the "$MODEL_API_KEY" of an akm config. It holds no secret. */
const VARIABLE = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const REDACTED = "<redacted>";

/** Does a field of a config, or a header, hold a credential, going by its name: authorization, x-api-key, api-key, access_token, client_secret, password, apiKey, or any other name ending in key, token, secret or password, in any case. maxTokens and tokenizer do not. */
const credentialField = (name: string): boolean => /(?:key|secret|password|passwd|credential)s?$|(?:token|authorization)$|^(?:set-)?cookie$/.test(name.toLowerCase());

/** Is this text, which is a value, the name of a credential header or field: a single word that credentialField says holds a credential. */
const credentialName = (text: unknown): boolean => typeof text === "string" && /^[A-Za-z0-9_.-]+$/.test(text) && credentialField(text);

/** Does a query parameter of a URL carry a credential: a field name as above, or auth, sig or signature (such as X-Amz-Signature) in any case. */
const credentialParameter = (name: string): boolean => credentialField(name) || /(?:auth|sig|signature)$/.test(name.toLowerCase());

const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** The query of a URL with the value of each credential parameter written as <redacted>, except a `$NAME` reference. */
const cleanQuery = (query: string): string =>
  query
    .split("&")
    .map((pair) => {
      const at = pair.indexOf("=");
      return at < 0 || !credentialParameter(decoded(pair.slice(0, at))) || VARIABLE.test(pair.slice(at + 1)) ? pair : `${pair.slice(0, at + 1)}${REDACTED}`;
    })
    .join("&");

/** A URI with no user name or password before the host, no fragment, and the value of each credential parameter of its query redacted. Its scheme, host, port and path stay, so two endpoints can still be compared. */
function cleanUri(uri: string): string {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(?:\?([^#]*))?/.exec(uri);
  if (!m) return uri;
  const [, scheme, authority, path, query] = m;
  return `${scheme}${authority.slice(authority.lastIndexOf("@") + 1)}${path}${query === undefined ? "" : `?${cleanQuery(query)}`}`;
}

/**
 * A string of a config with every URI in it cleaned (see cleanUri), and, when the whole string is a header line or an assignment
 * of a credential, such as "Authorization: Bearer abc" or "api_key=abc", its value redacted.
 */
function cleanText(text: string): string {
  const withUris = text.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>`]+/g, cleanUri);
  const line = /^(\s*([A-Za-z0-9_.-]+)\s*[:=]\s*)(\S[^]*)$/.exec(withUris);
  return line && credentialField(line[2]) && !VARIABLE.test(line[3].trim()) ? `${line[1]}${REDACTED}` : withUris;
}

/**
 * A deep copy of the config that is safe to write to a summary.json, for every engine and every field:
 *  - the value under a credential field is replaced by "<redacted>", at any depth, in objects and in arrays. A field is a credential
 *    by its name (see credentialField): apiKey, api_key, token, secret, password, authorization, x-api-key, client_secret, and the like.
 *    A header in a list is covered too, as a "Name: value" line, as a ["Name", "value"] pair or as {name, value}.
 *  - in every string that holds a URI, such as an engine's endpoint or a registry's URL, the user name and password before the host
 *    and the fragment are removed, and the value of each credential parameter of the query (api_key, key, token, access_token, auth,
 *    sig, signature, password, secret, in any case) is replaced by "<redacted>". The scheme, host, port and path stay.
 * A `$NAME` reference to an environment variable holds no secret, and stays wherever it is: as the value of apiKey or of ?api_key=.
 */
export function redactConfig(config: any): any {
  if (typeof config === "string") return cleanText(config);
  if (Array.isArray(config)) {
    const pair = config.length === 2 && credentialName(config[0]) && typeof config[1] === "string" && !VARIABLE.test(config[1]);
    return pair ? [cleanText(config[0]), REDACTED] : config.map(redactConfig);
  }
  if (typeof config !== "object" || config === null) return config;
  const named = ["name", "key", "header"].some((field) => credentialName(config[field])); // {name: "X-Api-Key", value: "..."}
  const entries = Object.entries(config).map(([key, value]) => {
    const secret = (credentialField(key) || (named && key === "value")) && !(typeof value === "string" && VARIABLE.test(value));
    return [key, secret ? REDACTED : redactConfig(value)];
  });
  return Object.fromEntries(entries);
}

/**
 * What identifies an endpoint: the scheme, host, port and path of the URL, in lower case for the scheme and host,
 * without a trailing slash, with no user name, password or fragment, and with the query's parameters in order and the value of each
 * credential parameter replaced by "<redacted>" (see cleanUri). Two deployments on one host, such as /deployment-A/v1 and /deployment-B/v1,
 * are two identities; a change of key alone is not. Null for a value that is missing or is not a URL.
 *
 * It is what is compared, and not what is written: the path can name a deployment or carry a key. A summary or a message records
 * `endpointId` of it (a digest) with `endpointHost`, never the identity itself.
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

/**
 * The host of an endpoint, for a reader: the scheme, host and port, in lower case, and nothing after them. The path and the query can name a
 * deployment, a project or a key, so a summary, a message and a report never carry them (see endpointId). Null for what endpointIdentity
 * says is no URL.
 */
export function endpointHost(url: unknown): string | null {
  const id = endpointIdentity(url);
  return id === null ? null : new URL(id).origin;
}

/**
 * A digest of the endpoint's identity (see endpointIdentity): what a summary records and a comparison compares in place of the path. Two
 * deployments on one host have two digests, and a change of key alone does not change it. Null for what is no URL.
 */
export function endpointId(url: unknown): string | null {
  const id = endpointIdentity(url);
  return id === null ? null : sha256(id);
}

/** What a summary records of an endpoint: its host to read, and the digest of its identity to compare. Never the path. */
export function endpointRecord(url: unknown): { endpoint: string | null; endpoint_id: string | null } {
  return { endpoint: endpointHost(url), endpoint_id: endpointId(url) };
}

/** How a message names an endpoint: its host, then the first 12 characters of the digest, such as "https://gateway.example (id 3af2c1d0e9b8)". */
export function endpointDisplay(e: { endpoint?: string | null; endpoint_id?: string | null }): string {
  const id = typeof e.endpoint_id === "string" ? e.endpoint_id.slice(0, 12) : null;
  return `${e.endpoint ?? "unknown host"}${id === null ? "" : ` (id ${id})`}`;
}

/** The settings of an engine that are the model's, not the akm config's: a summary's `engine` records them, and the config digest of scripts/compare leaves them out. */
export const ENGINE_KEYS = ["model", "endpoint", "endpoint_id", "temperature", "enableThinking", "timeoutMs"] as const;

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
  /** The endpoint's host: scheme, host and port, with no path, no query and no credentials. For a reader. */
  endpoint: string | null;
  /** The sha256 of the endpoint's identity (see endpointId). What a comparison compares. */
  endpoint_id: string | null;
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

/**
 * An engine as a summary recorded it, in the shape engineSettings writes today. A summary from before #65 holds the endpoint's identity,
 * path included, and no `endpoint_id`: it comes out as a host and the digest of that identity, so the old and the new compare equal for the
 * same deployment and the path is not carried on. An endpoint that is not a URL (`<MODEL_BASE_URL>`) is none.
 */
export function recordedEngine(e: any): EngineSetting {
  const url = isRecord(e) && typeof e.endpoint === "string" && e.endpoint.includes("://") ? e.endpoint : null;
  const hasId = isRecord(e) && typeof e.endpoint_id === "string" && /^[0-9a-f]{64}$/.test(e.endpoint_id);
  const record = hasId ? { endpoint: endpointHost(url), endpoint_id: e.endpoint_id as string } : endpointRecord(url);
  return { model: typeof e?.model === "string" ? e.model : null, ...record, temperature: e?.temperature ?? null, enableThinking: e?.enableThinking ?? null, timeoutMs: e?.timeoutMs ?? null };
}

const settingsOf = (e: any): EngineSetting => ({ model: e?.model ?? null, ...endpointRecord(e?.endpoint), temperature: e?.temperature ?? null, enableThinking: e?.enableThinking ?? null, timeoutMs: e?.timeoutMs ?? null });

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
