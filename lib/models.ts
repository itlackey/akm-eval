// Which model a run uses: one rule for every eval, set by a flag.
//
//   evals/consolidate/run --model my-model
//   benchmarks/longmemeval/run --model my-model --judge-model my-judge
//
// `--model ID` (and `--judge-model ID`, for the two that grade with a model) is sent to the one endpoint in .env, a gateway:
// ID is the gateway's model id, so a model needs no setting of its own. Without the flag the id is MODEL_NAME (JUDGE_MODEL), as before.
// A model that is not behind the gateway needs a line in `models.json`, beside .env (see models.example.json):
//
//   { "gpt-5.6-terra": { "base_url": "https://api.openai.com/v1", "api_key_env": "OPENAI_API_KEY" } }
//
// `--model gpt-5.6-terra` then goes to that URL with the key held in OPENAI_API_KEY (set it in .env), and the id names a line, not a gateway model.
// An eval calls useModel once, after it parses its flags. It writes the resolved settings back to MODEL_BASE_URL, MODEL_NAME and
// MODEL_API_KEY, which is where the akm sandbox reads the key ($MODEL_API_KEY in the config) and where the harbor evals read theirs.
// The provider kind akm gives the engine (`provider` in the config it writes) is the line's `provider`, else MODEL_PROVIDER, else openai.
//
// The judge takes the first of these that names an endpoint, and its key goes with it:
//   1. a models.json line named by the judge id;
//   2. JUDGE_BASE_URL and JUDGE_API_KEY;
//   3. the explicit fallback an eval passes to useJudge (the resolved model's endpoint and key, from useModel);
//   4. MODEL_BASE_URL and MODEL_API_KEY as they stand in the environment.
// An eval that runs useJudge before useModel passes no fallback, and then step 4 reads the .env gateway, not a --model line.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** The options, for parseArgs. */
export const MODEL_OPTIONS = { model: { type: "string" } } as const;
export const JUDGE_OPTIONS = { "judge-model": { type: "string" } } as const;

/** The lines of an eval's usage text. */
export const modelUsage = `  --model         the model, as the gateway names it, such as my-model. Default: MODEL_NAME in .env.`;
export const judgeUsage = `  --judge-model   the judge, as the gateway names it. Default: JUDGE_MODEL in .env.`;

/** Model limits OpenCode uses to compact context before a local server rejects a request. */
export interface ModelLimits {
  context: number;
  output: number;
}

/** Optional Chat Completions settings, explicitly selected for a reader or judge. */
export interface ChatSettings {
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: string;
  /** A finite number. A request that sets none keeps the temperature its caller chose. */
  temperature?: number;
}

/** One line of models.json: a model that is not behind the gateway. */
export interface ModelEntry {
  /** The name the endpoint expects, when it is not the line's name. */
  model?: string;
  base_url: string;
  /** The name of the environment variable that holds the key (set it in .env). Leave it out for a server that needs none. Never put a key in models.json. */
  api_key_env?: string;
  /** The provider kind akm gives the engine: openai (the default), anthropic, gemini, groq, ollama or lmstudio. The endpoint stays base_url + /chat/completions. */
  provider?: string;
  /** Optional OpenCode context and output limits, applied equally to both Harbor arms. */
  limits?: ModelLimits;
  chat?: ChatSettings;
}

/** Supported fields. Unknown metadata is reported; literal credentials need an explicit correction. */
const LINE_KEYS = ["model", "base_url", "api_key_env", "provider", "limits", "chat"];

export interface ModelSettings {
  /** The name sent to the endpoint. */
  name: string;
  baseUrl: string;
  apiKey: string;
  /** The provider kind of akm's engine: the line's `provider`, else MODEL_PROVIDER, else openai. */
  provider: string;
  limits?: ModelLimits;
  chat?: ChatSettings;
}

type Env = Record<string, string | undefined>;

/** An endpoint and key to use when nothing else names one. */
export interface Endpoint {
  baseUrl: string;
  apiKey: string;
}

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
    for (const key of Object.keys(e)) {
      if (LINE_KEYS.includes(key)) continue;
      const hint = key === "api_key" ? ": a key belongs in the environment. Set it in .env and name its variable in api_key_env" : "";
      const message = `models.json: "${id}" has an unknown key "${key}"${hint}. The keys of a line are ${LINE_KEYS.join(", ")}`;
      if (key === "api_key") throw new Error(message);
      console.warn(`${message}; ignored`);
    }
    if (e.chat !== undefined) {
      const chat = e.chat;
      if (!chat || typeof chat !== "object" || Array.isArray(chat))
        throw new Error(`models.json: "${id}": chat accepts max_tokens, max_completion_tokens, reasoning_effort and temperature`);
      if (Object.hasOwn(chat, "api_key")) throw new Error(`models.json: "${id}": put credentials in the environment and name the variable in api_key_env`);
      for (const key of Object.keys(chat))
        if (!["max_tokens", "max_completion_tokens", "reasoning_effort", "temperature"].includes(key)) console.warn(`models.json: "${id}" has an unknown chat key "${key}"; ignored`);
      if (chat.max_tokens !== undefined && chat.max_completion_tokens !== undefined)
        throw new Error(`models.json: "${id}": choose one chat token-limit field`);
      for (const limit of [chat.max_tokens, chat.max_completion_tokens])
        if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) throw new Error(`models.json: "${id}": chat token limits must be positive integers`);
      if (chat.reasoning_effort !== undefined && (typeof chat.reasoning_effort !== "string" || !chat.reasoning_effort.trim()))
        throw new Error(`models.json: "${id}": reasoning_effort must be a nonempty string supported by the model`);
      if (chat.temperature !== undefined && !(typeof chat.temperature === "number" && Number.isFinite(chat.temperature)))
        throw new Error(`models.json: "${id}": temperature must be a finite number`);
    }
    if (e.limits !== undefined) {
      const limits = e.limits;
      if (!limits || typeof limits !== "object" || Array.isArray(limits) ||
        !Number.isInteger(limits.context) || limits.context <= 0 ||
        !Number.isInteger(limits.output) || limits.output <= 0 || limits.output > limits.context)
        throw new Error(`models.json: "${id}": limits needs positive integer context and output, with output no larger than context`);
    }
    for (const key of Object.keys(e.limits ?? {}))
      if (key !== "context" && key !== "output") console.warn(`models.json: "${id}" has an unknown limits key "${key}"; ignored`);
    if (e.model !== undefined && typeof e.model !== "string") throw new Error(`models.json: "${id}": model must be a string`);
    if (e.provider !== undefined && (typeof e.provider !== "string" || !e.provider.trim())) throw new Error(`models.json: "${id}": provider must be a nonempty string, the provider kind akm gives the engine`);
    if (e.api_key_env !== undefined && (typeof e.api_key_env !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.api_key_env))) throw new Error(`models.json: "${id}": api_key_env must be the name of an environment variable, not a key`);
  }
  return json as Record<string, ModelEntry>;
}

/**
 * The model of a role from the flag, the environment and models.json. The id is the flag, else MODEL_NAME (JUDGE_MODEL). An id that is a
 * line of models.json goes to that line's URL, with the key in its api_key_env. Any other id goes to MODEL_BASE_URL with MODEL_API_KEY
 * (JUDGE_BASE_URL and JUDGE_API_KEY, else `fallback` when given, else the model's MODEL_* in `env`). `fallback` is for the judge alone and
 * ignored for the model. Throws an Error that says what to set.
 */
export function resolveModel(role: "model" | "judge", flag: string | undefined, env: Env, entries: Record<string, ModelEntry>, fallback?: Endpoint): ModelSettings {
  const [idVar, urlVar, keyVar, flagName] = role === "model" ? (["MODEL_NAME", "MODEL_BASE_URL", "MODEL_API_KEY", "--model"] as const) : (["JUDGE_MODEL", "JUDGE_BASE_URL", "JUDGE_API_KEY", "--judge-model"] as const);
  const id = (flag ?? env[idVar])?.trim();
  if (flag !== undefined && !id) throw new Error(`${flagName} needs a model id`);
  if (!id) throw new Error(`name the ${role}: pass ${flagName} ID, or set ${idVar} in .env. See .env.example.`);
  const entry = Object.hasOwn(entries, id) ? entries[id] : undefined;
  const provider = (line?: ModelEntry): string => line?.provider?.trim() || env.MODEL_PROVIDER?.trim() || "openai";
  if (entry) {
    const key = entry.api_key_env ? env[entry.api_key_env]?.trim() : "";
    if (entry.api_key_env && !key) throw new Error(`models.json: "${id}" takes its key from ${entry.api_key_env}, which is not set. Set it in .env.`);
    const limits = entry.limits ? { context: entry.limits.context, output: entry.limits.output } : undefined;
    const chat: ChatSettings | undefined = entry.chat ? {
      ...(entry.chat.max_tokens !== undefined ? { max_tokens: entry.chat.max_tokens } : {}),
      ...(entry.chat.max_completion_tokens !== undefined ? { max_completion_tokens: entry.chat.max_completion_tokens } : {}),
      ...(entry.chat.reasoning_effort !== undefined ? { reasoning_effort: entry.chat.reasoning_effort } : {}),
      ...(entry.chat.temperature !== undefined ? { temperature: entry.chat.temperature } : {}),
    } : undefined;
    return { name: entry.model ?? id, baseUrl: entry.base_url.trim(), apiKey: key ?? "", provider: provider(entry), ...(limits ? { limits } : {}), ...(chat ? { chat } : {}) };
  }
  // The judge falls back to the model's endpoint and key when it names none of its own: the explicit fallback, else MODEL_* in env.
  const judgeOwnsNone = role === "judge" && !env.JUDGE_BASE_URL?.trim();
  const fallbackUrl = fallback?.baseUrl.trim();
  if (judgeOwnsNone && fallback && fallbackUrl) return { name: id, baseUrl: fallbackUrl, apiKey: fallback.apiKey.trim(), provider: provider() };
  const [urlName, keyName] = judgeOwnsNone ? (["MODEL_BASE_URL", "MODEL_API_KEY"] as const) : ([urlVar, keyVar] as const);
  const baseUrl = env[urlName]?.trim();
  if (!baseUrl) throw new Error(`${id} is sent to the gateway: set ${urlName} in .env (and ${keyName} if it needs a key). See .env.example.`);
  return { name: id, baseUrl, apiKey: (env[keyName] ?? "").trim(), provider: provider() };
}

/**
 * The model under test for this run, from the parsed flags. It writes the settings to MODEL_BASE_URL, MODEL_NAME, MODEL_API_KEY and
 * MODEL_PROVIDER in `env` (process.env), so the akm sandbox and the harbor evals read the same ones, and returns them. `fail` ends the run with a message.
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
  env.MODEL_PROVIDER = m.provider;
  return { ...m, hasKey: m.apiKey !== "" };
}

/**
 * The judge for this run, from the parsed flags. It writes nothing to `env`. Pass the model useModel returned as `fallback` and a judge with
 * no endpoint of its own goes to the model's. Without it, such a judge reads MODEL_* from `env` as it is at the call.
 */
export function useJudge(values: { "judge-model"?: string }, fail: (message: string) => never, env: Env = process.env, entries?: Record<string, ModelEntry>, fallback?: Endpoint): ModelSettings {
  try {
    return resolveModel("judge", values["judge-model"], env, entries ?? loadModels(), fallback);
  } catch (e) {
    return fail((e as Error).message);
  }
}
