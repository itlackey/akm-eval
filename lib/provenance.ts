// What ties a run to its inputs, for the summary.json every eval writes: digests of the files it read, the config it ran
// with (secrets redacted) and the settings of the model it called. Pure helpers: they read the files they are given, nothing else.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export const sha256Text = (text: string): string => sha256(text);

export const sha256File = (path: string): string => sha256(readFileSync(path));

/**
 * One digest over the files, in the order of their paths. It covers each path as given and each file's content, so a file
 * renamed, added, dropped or changed gives another digest. Pass paths relative to a fixed folder for a digest that holds on another machine.
 */
export function sha256Files(paths: string[]): string {
  const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256(sorted.map((path) => `${path}\0${sha256File(path)}\n`).join(""));
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

export interface EngineSettings {
  engine: string | null;
  model: string | null;
  /** The host (and port) of the engine's endpoint, with no path, query or credentials. */
  endpoint: string | null;
  temperature: number | null;
  enableThinking: boolean | null;
  timeoutMs: number | null;
}

/** The settings of the LLM engine that `defaults.llmEngine` names in an akm config. Anything the config does not set is null. */
export function engineSettings(config: any): EngineSettings {
  const engine: string | null = config?.defaults?.llmEngine ?? null;
  const e = engine !== null && Object.hasOwn(config?.engines ?? {}, engine) ? config.engines[engine] : undefined;
  let endpoint: string | null = null;
  try {
    endpoint = new URL(e?.endpoint).host || null;
  } catch {} // an endpoint that is missing or is not a URL is not recorded
  return { engine, model: e?.model ?? null, endpoint, temperature: e?.temperature ?? null, enableThinking: e?.enableThinking ?? null, timeoutMs: e?.timeoutMs ?? null };
}
