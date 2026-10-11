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

const SECRET_KEYS = new Set(["apikey", "api_key", "token", "secret"]);
/** A `$NAME` reference to an environment variable, such as the "$MODEL_API_KEY" of an akm config. It holds no secret. */
const VARIABLE = /^\$[A-Za-z_][A-Za-z0-9_]*$/;

/** A deep copy of the config with every value under apiKey, api_key, token or secret (in any case) replaced by "<redacted>", except a `$NAME` reference. */
export function redactConfig(config: any): any {
  if (Array.isArray(config)) return config.map(redactConfig);
  if (typeof config !== "object" || config === null) return config;
  const entries = Object.entries(config).map(([key, value]) => {
    const secret = SECRET_KEYS.has(key.toLowerCase()) && !(typeof value === "string" && VARIABLE.test(value));
    return [key, secret ? "<redacted>" : redactConfig(value)];
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
