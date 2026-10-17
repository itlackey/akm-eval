import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Endpoint, MODEL_OPTIONS, type ModelEntry, loadModels, resolveModel, useJudge, useModel } from "./models.ts";

const GATEWAY = "https://gateway.example/v1";
const ENV = { MODEL_BASE_URL: GATEWAY, MODEL_API_KEY: "gw-key", MODEL_NAME: "my-model" };
const NONE: Record<string, ModelEntry> = {};
const TERRA: Record<string, ModelEntry> = { "gpt-5.6-terra": { base_url: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY" } };
const stop = (message: string): never => {
  throw new Error(message);
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("resolveModel", () => {
  test("the id is the flag, else MODEL_NAME, and goes to the gateway of .env with its key", () => {
    expect(resolveModel("model", "cloud/some-model", ENV, NONE)).toEqual({ name: "cloud/some-model", baseUrl: GATEWAY, apiKey: "gw-key", provider: "openai" });
    expect(resolveModel("model", undefined, ENV, NONE).name).toBe("my-model");
    expect(resolveModel("model", " my-small-model ", ENV, NONE).name).toBe("my-small-model");
  });

  test("a gateway that needs no key gives an empty one", () => {
    expect(resolveModel("model", "my-x", { MODEL_BASE_URL: GATEWAY }, NONE).apiKey).toBe("");
  });

  test("a line of models.json goes to its own URL with the key its api_key_env names, and has no gateway id", () => {
    const m = resolveModel("model", "gpt-5.6-terra", { ...ENV, OPENAI_API_KEY: "oa-key" }, TERRA);
    expect(m).toEqual({ name: "gpt-5.6-terra", baseUrl: "https://api.openai.com/v1", apiKey: "oa-key", provider: "openai" });
    expect(resolveModel("model", "local", {}, { local: { model: "Org/Model-1", base_url: "http://192.168.0.203:8102/v1" } })).toEqual({ name: "Org/Model-1", baseUrl: "http://192.168.0.203:8102/v1", apiKey: "", provider: "openai" });
  });

  test("says what to set when the id, the endpoint or an entry's key is missing, and never prints a key", () => {
    expect(() => resolveModel("model", undefined, { MODEL_BASE_URL: GATEWAY }, NONE)).toThrow("pass --model ID, or set MODEL_NAME");
    expect(() => resolveModel("model", "  ", ENV, NONE)).toThrow("--model needs a model id");
    expect(() => resolveModel("model", "my-x", {}, NONE)).toThrow("set MODEL_BASE_URL in .env");
    expect(() => resolveModel("model", "gpt-5.6-terra", ENV, TERRA)).toThrow('takes its key from OPENAI_API_KEY, which is not set');
    try {
      resolveModel("model", "gpt-5.6-terra", ENV, TERRA);
    } catch (e) {
      expect((e as Error).message).not.toContain("gw-key");
    }
  });

  test("the judge uses its own endpoint and key when set, and otherwise the model's", () => {
    expect(resolveModel("judge", "my-j", { ...ENV, JUDGE_BASE_URL: "http://judge/v1", JUDGE_API_KEY: "jk" }, NONE)).toEqual({ name: "my-j", baseUrl: "http://judge/v1", apiKey: "jk", provider: "openai" });
    expect(resolveModel("judge", "my-j", ENV, NONE)).toEqual({ name: "my-j", baseUrl: GATEWAY, apiKey: "gw-key", provider: "openai" });
    expect(resolveModel("judge", undefined, { ...ENV, JUDGE_MODEL: "my-j2" }, NONE).name).toBe("my-j2");
    expect(() => resolveModel("judge", undefined, ENV, NONE)).toThrow("pass --judge-model ID, or set JUDGE_MODEL");
  });
});

describe("the provider kind of akm's engine", () => {
  const LINES: Record<string, ModelEntry> = { claude: { base_url: "https://proxy.example/v1", provider: "anthropic" }, plain: { base_url: "https://proxy.example/v1" } };

  test("is the line's provider, else MODEL_PROVIDER, else openai, and a line wins over the environment", () => {
    expect(resolveModel("model", "my-x", ENV, NONE).provider).toBe("openai");
    expect(resolveModel("model", "my-x", { ...ENV, MODEL_PROVIDER: "groq" }, NONE).provider).toBe("groq");
    expect(resolveModel("model", "my-x", { ...ENV, MODEL_PROVIDER: "  " }, NONE).provider).toBe("openai"); // `MODEL_PROVIDER=` in .env is not a provider
    expect(resolveModel("model", "claude", ENV, LINES).provider).toBe("anthropic");
    expect(resolveModel("model", "claude", { ...ENV, MODEL_PROVIDER: "groq" }, LINES).provider).toBe("anthropic");
    expect(resolveModel("model", "plain", { ...ENV, MODEL_PROVIDER: "groq" }, LINES).provider).toBe("groq"); // a line with none takes the environment's
  });

  test("the judge reads it the same way, wherever its endpoint comes from", () => {
    expect(resolveModel("judge", "my-j", { ...ENV, MODEL_PROVIDER: "gemini" }, NONE).provider).toBe("gemini");
    expect(resolveModel("judge", "my-j", ENV, NONE, { baseUrl: "http://m/v1", apiKey: "k" }).provider).toBe("openai");
    expect(resolveModel("judge", "claude", ENV, LINES).provider).toBe("anthropic");
  });

  test("useModel writes it to MODEL_PROVIDER with the rest of the model's settings", () => {
    const env: Record<string, string | undefined> = { ...ENV };
    expect(useModel({ model: "claude" }, stop, env, LINES)).toMatchObject({ name: "claude", provider: "anthropic" });
    expect(env.MODEL_PROVIDER).toBe("anthropic");
    const plain: Record<string, string | undefined> = { ...ENV };
    expect(useModel({}, stop, plain, NONE).provider).toBe("openai");
    expect(plain.MODEL_PROVIDER).toBe("openai");
  });
});

describe("the judge's fallback endpoint", () => {
  const MODEL: Endpoint = { baseUrl: "https://api.openai.com/v1", apiKey: "oa-key" };

  test("a judge with no endpoint of its own goes to the fallback, and not to the gateway of .env", () => {
    expect(resolveModel("judge", "my-j", ENV, NONE, MODEL)).toEqual({ name: "my-j", baseUrl: MODEL.baseUrl, apiKey: "oa-key", provider: "openai" });
    expect(resolveModel("judge", "my-j", { ...ENV, JUDGE_API_KEY: "jk" }, NONE, MODEL).apiKey).toBe("oa-key"); // the key goes with the endpoint
    expect(resolveModel("judge", "my-j", {}, NONE, MODEL).baseUrl).toBe(MODEL.baseUrl); // no MODEL_* needed
  });

  test("the judge's own endpoint, or its models.json line, wins over the fallback", () => {
    expect(resolveModel("judge", "my-j", { ...ENV, JUDGE_BASE_URL: "http://judge/v1", JUDGE_API_KEY: "jk" }, NONE, MODEL)).toMatchObject({ baseUrl: "http://judge/v1", apiKey: "jk" });
    expect(resolveModel("judge", "gpt-5.6-terra", { ...ENV, OPENAI_API_KEY: "oa-key2" }, TERRA, { baseUrl: "http://other/v1", apiKey: "x" })).toMatchObject({ baseUrl: "https://api.openai.com/v1", apiKey: "oa-key2" });
  });

  test("without a fallback it is as before: JUDGE_*, else the MODEL_* of the environment", () => {
    expect(resolveModel("judge", "my-j", ENV, NONE, undefined)).toEqual(resolveModel("judge", "my-j", ENV, NONE));
    expect(resolveModel("judge", "my-j", ENV, NONE).baseUrl).toBe(GATEWAY);
    expect(() => resolveModel("judge", "my-j", {}, NONE)).toThrow("set MODEL_BASE_URL in .env");
  });

  test("the model ignores a fallback", () => {
    expect(resolveModel("model", "my-x", ENV, NONE, MODEL)).toEqual(resolveModel("model", "my-x", ENV, NONE));
  });

  test("useJudge passes it on: with --model a models.json line and no JUDGE_BASE_URL the judge goes to that line's endpoint", () => {
    const env: Record<string, string | undefined> = { ...ENV, OPENAI_API_KEY: "oa-key" };
    const judgeFirst = useJudge({ "judge-model": "my-j" }, stop, env, TERRA); // longmemeval's order: the judge before useModel
    expect(judgeFirst.baseUrl).toBe(GATEWAY);
    const model = useModel({ model: "gpt-5.6-terra" }, stop, env, TERRA);
    expect(useJudge({ "judge-model": "my-j" }, stop, env, TERRA, model)).toMatchObject({ name: "my-j", baseUrl: "https://api.openai.com/v1", apiKey: "oa-key" });
  });
});

describe("useModel", () => {
  test("writes the resolved model to MODEL_*, where the akm sandbox and the harbor evals read it, and says whether there is a key", () => {
    const env: Record<string, string | undefined> = { ...ENV, OPENAI_API_KEY: "oa-key" };
    const m = useModel({ model: "gpt-5.6-terra" }, stop, env, TERRA);
    expect(m).toMatchObject({ baseUrl: "https://api.openai.com/v1", name: "gpt-5.6-terra", hasKey: true });
    expect([env.MODEL_BASE_URL, env.MODEL_NAME, env.MODEL_API_KEY]).toEqual(["https://api.openai.com/v1", "gpt-5.6-terra", "oa-key"]);
    const keyless = useModel({ model: "my-x" }, stop, { MODEL_BASE_URL: GATEWAY }, NONE);
    expect(keyless.hasKey).toBe(false);
  });

  test("without the flag it is the environment's model, as before", () => {
    const env: Record<string, string | undefined> = { ...ENV };
    expect(useModel({}, stop, env, NONE)).toMatchObject({ baseUrl: GATEWAY, name: "my-model", hasKey: true });
  });

  test("fails through the caller's fail, and useJudge writes nothing", () => {
    expect(() => useModel({}, stop, {}, NONE)).toThrow("pass --model ID");
    const env: Record<string, string | undefined> = { ...ENV };
    expect(useJudge({ "judge-model": "my-j2" }, stop, env, NONE).name).toBe("my-j2");
    expect(env.MODEL_NAME).toBe("my-model");
  });
});

describe("loadModels", () => {
  const write = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), "models-test-"));
    dirs.push(dir);
    const file = join(dir, "models.json");
    writeFileSync(file, text);
    return file;
  };

  test("is empty when there is no file, and reads the lines of one", () => {
    expect(loadModels(join(tmpdir(), "no-such-dir-for-models", "models.json"))).toEqual({});
    expect(loadModels(write(JSON.stringify(TERRA)))).toEqual(TERRA);
  });

  test("warns on unknown metadata and still requires literal credentials in the environment", () => {
    const line = (extra: string) => `{"a":{"base_url":"http://h/v1"${extra}}}`;
    expect(() => loadModels(write(line(',"api_key":"sk-SYNTH-secret"')))).toThrow('models.json: "a" has an unknown key "api_key": a key belongs in the environment. Set it in .env and name its variable in api_key_env.');
    expect(loadModels(write(line(',"privat":true'))).a.base_url).toBe("http://h/v1");
    expect(loadModels(write('{"ok":{"base_url":"http://h/v1"},"b":{"base_url":"http://h/v1","baseUrl":"x"}}')).b.base_url).toBe("http://h/v1");
    try {
      loadModels(write(line(',"api_key":"sk-SYNTH-secret"')));
    } catch (e) {
      expect((e as Error).message).not.toContain("SYNTH"); // the message names the key, never its value
    }
    // every key a line may have still passes
    expect(loadModels(write('{"a":{"base_url":"http://h/v1","model":"m","api_key_env":"A_KEY"}}'))).toEqual({ a: { base_url: "http://h/v1", model: "m", api_key_env: "A_KEY" } });
  });

  test("takes a provider that is a nonempty string, without a warning, and refuses any other", () => {
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (line: string) => void warned.push(line);
    try {
      expect(loadModels(write('{"a":{"base_url":"http://h/v1","provider":"ollama"}}')).a.provider).toBe("ollama");
    } finally {
      console.warn = warn;
    }
    expect(warned).toEqual([]);
    for (const bad of ['""', '"  "', "3", "null", "true"]) expect(() => loadModels(write(`{"a":{"base_url":"http://h/v1","provider":${bad}}}`))).toThrow('"a": provider must be a nonempty string');
  });

  test("takes a chat temperature that is a finite number, and refuses any other", () => {
    const entries = loadModels(write('{"cold":{"base_url":"http://h/v1","chat":{"temperature":0}},"warm":{"base_url":"http://h/v1","chat":{"temperature":0.7,"reasoning_effort":"low"}}}'));
    expect(resolveModel("model", "cold", {}, entries).chat).toEqual({ temperature: 0 }); // zero is a temperature
    expect(resolveModel("model", "warm", {}, entries).chat).toEqual({ reasoning_effort: "low", temperature: 0.7 });
    for (const bad of ['"hot"', "null", "true", "[]", "{}"]) expect(() => loadModels(write(`{"a":{"base_url":"http://h/v1","chat":{"temperature":${bad}}}}`))).toThrow('"a": temperature must be a finite number');
    expect(() => loadModels(write('{"a":{"base_url":"http://h/v1","chat":{"temperature":1e999}}}'))).toThrow("temperature must be a finite number"); // JSON that reads as Infinity
  });

  test("reads explicit model limits and rejects malformed budgets before collection", () => {
    const limits = { context: 32768, output: 4096 };
    const entries = loadModels(write(JSON.stringify({ local: { base_url: "http://192.0.2.5/v1", limits } })));
    expect(resolveModel("model", "local", {}, entries).limits).toEqual(limits);
    const extra = loadModels(write(JSON.stringify({ local: { base_url: "http://192.0.2.5/v1", limits: { ...limits, future: 1 }, chat: { reasoning_effort: "low", future: true } } })));
    expect(resolveModel("model", "local", {}, extra).limits).toEqual(limits);
    expect(resolveModel("model", "local", {}, extra).chat).toEqual({ reasoning_effort: "low" });
    for (const bad of [null, {}, [], { context: 0, output: 1 }, { context: 10, output: 11 }, { context: "10", output: 1 }, { context: 10, output: 1.5 }]) {
      expect(() => loadModels(write(JSON.stringify({ local: { base_url: "http://192.0.2.5/v1", limits: bad } })))).toThrow("limits needs positive integer");
    }
  });

  test('obsolete "private" metadata does not prevent selecting a model', () => {
    for (const value of [true, false]) {
      const entries = loadModels(write(JSON.stringify({ mine: { base_url: "http://localhost:8080/v1", private: value } })));
      expect(resolveModel("model", "mine", {}, entries)).toEqual({ name: "mine", baseUrl: "http://localhost:8080/v1", apiKey: "", provider: "openai" });
    }
  });

  test("refuses a line without a URL, a key where the name of one belongs, and a file that is not an object", () => {
    expect(() => loadModels(write("{"))).toThrow("is not JSON");
    expect(() => loadModels(write("[]"))).toThrow("must hold an object");
    expect(() => loadModels(write('{"a":{}}'))).toThrow('"a" needs a base_url');
    expect(() => loadModels(write('{"a":{"base_url":"http://h/v1","api_key_env":"sk-abc123-def"}}'))).toThrow("api_key_env must be the name of an environment variable, not a key");
    expect(() => loadModels(write('{"a":{"base_url":"http://h/v1","model":3}}'))).toThrow("model must be a string");
  });
});

describe("the flags", () => {
  test("--model is a string option that parseArgs takes", async () => {
    const { parseArgs } = await import("node:util");
    expect(parseArgs({ args: ["--model", "my-x2", "--model=my-y"], options: MODEL_OPTIONS, strict: true }).values.model).toBe("my-y");
    expect(() => parseArgs({ args: ["--model"], options: MODEL_OPTIONS, strict: true })).toThrow();
  });
});

describe("every eval and benchmark takes its model and akm the same way", () => {
  const ROOT = join(import.meta.dir, "..");
  const runs = ["evals", "benchmarks"].flatMap((group) =>
    readdirSync(join(ROOT, group))
      .map((name) => ({ name: `${group}/${name}`, file: join(ROOT, group, name, "src", "run.ts") }))
      .filter((r) => existsSync(r.file))
      .map((r) => ({ ...r, source: readFileSync(r.file, "utf8") })),
  );

  test("the scan finds the runs, so it cannot pass by finding none", () => {
    expect(runs.length).toBeGreaterThanOrEqual(10);
  });

  test("none reads MODEL_BASE_URL, MODEL_NAME or MODEL_API_KEY itself: useModel does", () => {
    const own = runs.filter((r) => /process\.env\.(MODEL_BASE_URL|MODEL_NAME|MODEL_API_KEY|JUDGE_\w+)(?!\w|\s*=[^=])/.test(r.source));
    expect(own.map((r) => r.name)).toEqual([]);
  });

  test("each that runs a model has --model, each that grades with one --judge-model, and each that runs akm --akm", () => {
    const missing: string[] = [];
    for (const r of runs) {
      const model = /useModel\(|MODEL_OPTIONS/.test(r.source);
      const runsModel = /createSandbox\(|preflight\(/.test(r.source) && !/^(evals\/retrieval|benchmarks\/skillret)$/.test(r.name);
      if (runsModel && !model) missing.push(`${r.name}: no --model`);
      // The Harbor evals (preflight) run their akm in a container: their --akm is an npm release or a checkout (AKM_ARM_OPTIONS in lib/harbor/harbor.ts), not a command for useAkm.
      const harbor = /preflight\(/.test(r.source);
      if ((harbor || /createSandbox\(/.test(r.source)) && !(harbor ? /AKM_ARM_OPTIONS/ : /useAkm\(/).test(r.source)) missing.push(`${r.name}: no --akm`);
      if (r.name === "benchmarks/longmemeval" && !/useJudge\(/.test(r.source)) missing.push(`${r.name}: no --judge-model`);
    }
    expect(missing).toEqual([]);
  });
});


test("chat settings are validated separately from OpenCode context limits", () => {
  const dir = mkdtempSync(join(tmpdir(), "model-chat-")); dirs.push(dir);
  const file = join(dir, "models.json");
  for (const chat of [{ max_tokens: 0 }, { max_tokens: 10, max_completion_tokens: 20 }, { reasoning_effort: "" }, { api_key: "secret" }]) {
    writeFileSync(file, JSON.stringify({ reader: { base_url: GATEWAY, chat } }));
    expect(() => loadModels(file)).toThrow("models.json");
  }
  writeFileSync(file, JSON.stringify({ reader: { base_url: GATEWAY, chat: { max_completion_tokens: 2048, reasoning_effort: "none" } } }));
  expect(resolveModel("model", "reader", ENV, loadModels(file)).chat).toEqual({ max_completion_tokens: 2048, reasoning_effort: "none" });
});
