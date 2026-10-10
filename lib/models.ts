// Which model a run uses: one rule for every eval, set by a flag.
//
//   evals/consolidate/run --model freellm/gpt-oss:120b
//   benchmarks/longmemeval/run --model chat/qwen3.8-27b --judge-model fast/qwen3.6-35b-a3b
//
// `--model ID` (and `--judge-model ID`, for the two that grade with a model) is sent to the one endpoint in .env, the lab gateway:
// ID is the gateway's model id, so a model needs no setting of its own. Without the flag the id is MODEL_NAME (JUDGE_MODEL), as before.
// Only a model that is not behind the gateway needs a line in `models.json`, beside .env (see models.example.json):
//
//   { "gpt-5.6-terra": { "base_url": "https://api.openai.com/v1", "api_key_env": "OPENAI_API_KEY" } }
//
// `--model gpt-5.6-terra` then goes to that URL with the key held in OPENAI_API_KEY (set it in .env), and the id names a line, not a gateway model.
// An eval calls useModel once, after it parses its flags. It writes the resolved settings back to MODEL_BASE_URL, MODEL_NAME and
// MODEL_API_KEY, which is where the akm sandbox reads the key ($MODEL_API_KEY in the config) and where the harbor evals read theirs.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** The options, for parseArgs. */
export const MODEL_OPTIONS = { model: { type: "string" } } as const;
export const JUDGE_OPTIONS = { "judge-model": { type: "string" } } as const;

/** The lines of an eval's usage text. */
export const modelUsage = `  --model         the model, as the gateway names it, such as chat/qwen3.8-27b. Default: MODEL_NAME in .env.`;
export const judgeUsage = `  --judge-model   the judge, as the gateway names it. Default: JUDGE_MODEL in .env.`;

/** One line of models.json: a model that is not behind the gateway. */
export interface ModelEntry {
  /** The name the endpoint expects, when it is not the line's name. */
  model?: string;
  base_url: string;
  /** The name of the environment variable that holds the key (set it in .env). Leave it out for a server that needs none. Never put a key in models.json. */
  api_key_env?: string;
}

export interface ModelSettings {
  /** The name sent to the endpoint. */
  name: string;
  baseUrl: string;
  apiKey: string;
  /** The gateway id the name was sent as, or undefined for a line of models.json, whose URL is the whole story. This is what the privacy guard reads. */
  gatewayId: string | undefined;
}

type Env = Record<string, string | undefined>;

/** The lines of models.json, or none when there is no file. Throws an Error that says what is wrong. */
export function loadModels(file = join(ROOT, "models.json")): Record<string, ModelEntry> {
  if (!existsSync(file)) return {};
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not JSON (${(e as Error).message})`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error(`${file} must hold an object of model lines`);
  for (const [id, entry] of Object.entries(json)) {
    const e = entry as Partial<ModelEntry> | null;
    if (typeof e !== "object" || e === null || typeof e.base_url !== "string" || !e.base_url.trim()) throw new Error(`models.json: "${id}" needs a base_url`);
    if (e.model !== undefined && typeof e.model !== "string") throw new Error(`models.json: "${id}": model must be a string`);
    if (e.api_key_env !== undefined && (typeof e.api_key_env !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.api_key_env))) throw new Error(`models.json: "${id}": api_key_env must be the name of an environment variable, not a key`);
  }
  return json as Record<string, ModelEntry>;
}

/**
 * The model of a role from the flag, the environment and models.json. The id is the flag, else MODEL_NAME (JUDGE_MODEL). An id that is a
 * line of models.json goes to that line's URL, with the key in its api_key_env. Any other id goes to MODEL_BASE_URL with MODEL_API_KEY
 * (JUDGE_BASE_URL and JUDGE_API_KEY, else the model's). Throws an Error that says what to set.
 */
export function resolveModel(role: "model" | "judge", flag: string | undefined, env: Env, entries: Record<string, ModelEntry>): ModelSettings {
  const [idVar, urlVar, keyVar, flagName] = role === "model" ? (["MODEL_NAME", "MODEL_BASE_URL", "MODEL_API_KEY", "--model"] as const) : (["JUDGE_MODEL", "JUDGE_BASE_URL", "JUDGE_API_KEY", "--judge-model"] as const);
  const id = (flag ?? env[idVar])?.trim();
  if (flag !== undefined && !id) throw new Error(`${flagName} needs a model id`);
  if (!id) throw new Error(`name the ${role}: pass ${flagName} ID, or set ${idVar} in .env. See .env.example.`);
  const entry = Object.hasOwn(entries, id) ? entries[id] : undefined;
  if (entry) {
    const key = entry.api_key_env ? env[entry.api_key_env]?.trim() : "";
    if (entry.api_key_env && !key) throw new Error(`models.json: "${id}" takes its key from ${entry.api_key_env}, which is not set. Set it in .env.`);
    return { name: entry.model ?? id, baseUrl: entry.base_url.trim(), apiKey: key ?? "", gatewayId: undefined };
  }
  // The judge falls back to the model's endpoint and key when it names none of its own.
  const [urlName, keyName] = role === "judge" && !env.JUDGE_BASE_URL?.trim() ? (["MODEL_BASE_URL", "MODEL_API_KEY"] as const) : ([urlVar, keyVar] as const);
  const baseUrl = env[urlName]?.trim();
  if (!baseUrl) throw new Error(`${id} is sent to the gateway: set ${urlName} in .env (and ${keyName} if it needs a key). See .env.example.`);
  return { name: id, baseUrl, apiKey: (env[keyName] ?? "").trim(), gatewayId: id };
}

/**
 * The model under test for this run, from the parsed flags. It writes the settings to MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in `env`
 * (process.env), so the akm sandbox and the harbor evals read the same ones, and returns them. `fail` ends the run with a message.
 */
export function useModel(values: { model?: string }, fail: (message: string) => never, env: Env = process.env, entries?: Record<string, ModelEntry>): ModelSettings & { hasKey: boolean } {
  let m: ModelSettings;
  try {
    m = resolveModel("model", values.model, env, entries ?? loadModels());
  } catch (e) {
    return fail((e as Error).message);
  }
  env.MODEL_BASE_URL = m.baseUrl;
  env.MODEL_NAME = m.name;
  env.MODEL_API_KEY = m.apiKey;
  return { ...m, hasKey: m.apiKey !== "" };
}

/** The judge for this run, from the parsed flags. It writes nothing to `env`. */
export function useJudge(values: { "judge-model"?: string }, fail: (message: string) => never, env: Env = process.env, entries?: Record<string, ModelEntry>): ModelSettings {
  try {
    return resolveModel("judge", values["judge-model"], env, entries ?? loadModels());
  } catch (e) {
    return fail((e as Error).message);
  }
}
