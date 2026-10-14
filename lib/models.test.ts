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
    expect(resolveModel("model", "cloud/some-model", ENV, NONE)).toEqual({ name: "cloud/some-model", baseUrl: GATEWAY, apiKey: "gw-key" });
    expect(resolveModel("model", undefined, ENV, NONE).name).toBe("my-model");
    expect(resolveModel("model", " my-small-model ", ENV, NONE).name).toBe("my-small-model");
  });

  test("a gateway that needs no key gives an empty one", () => {
    expect(resolveModel("model", "my-x", { MODEL_BASE_URL: GATEWAY }, NONE).apiKey).toBe("");
  });

  test("a line of models.json goes to its own URL with the key its api_key_env names, and has no gateway id", () => {
    const m = resolveModel("model", "gpt-5.6-terra", { ...ENV, OPENAI_API_KEY: "oa-key" }, TERRA);
    expect(m).toEqual({ name: "gpt-5.6-terra", baseUrl: "https://api.openai.com/v1", apiKey: "oa-key" });
    expect(resolveModel("model", "local", {}, { local: { model: "Org/Model-1", base_url: "http://192.168.0.203:8102/v1" } })).toEqual({ name: "Org/Model-1", baseUrl: "http://192.168.0.203:8102/v1", apiKey: "" });
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
    expect(resolveModel("judge", "my-j", { ...ENV, JUDGE_BASE_URL: "http://judge/v1", JUDGE_API_KEY: "jk" }, NONE)).toEqual({ name: "my-j", baseUrl: "http://judge/v1", apiKey: "jk" });
    expect(resolveModel("judge", "my-j", ENV, NONE)).toEqual({ name: "my-j", baseUrl: GATEWAY, apiKey: "gw-key" });
    expect(resolveModel("judge", undefined, { ...ENV, JUDGE_MODEL: "my-j2" }, NONE).name).toBe("my-j2");
    expect(() => resolveModel("judge", undefined, ENV, NONE)).toThrow("pass --judge-model ID, or set JUDGE_MODEL");
  });
});

describe("the judge's fallback endpoint", () => {
  const MODEL: Endpoint = { baseUrl: "https://api.openai.com/v1", apiKey: "oa-key" };

  test("a judge with no endpoint of its own goes to the fallback, and not to the gateway of .env", () => {
    expect(resolveModel("judge", "my-j", ENV, NONE, MODEL)).toEqual({ name: "my-j", baseUrl: MODEL.baseUrl, apiKey: "oa-key" });
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

  test("refuses a key it does not know, and says that an api_key belongs in the environment", () => {
    const line = (extra: string) => `{"a":{"base_url":"http://h/v1"${extra}}}`;
    expect(() => loadModels(write(line(',"api_key":"sk-SYNTH-secret"')))).toThrow('models.json: "a" has an unknown key "api_key": a key belongs in the environment. Set it in .env and name its variable in api_key_env.');
    expect(() => loadModels(write(line(',"privat":true')))).toThrow('models.json: "a" has an unknown key "privat". The keys of a line are model, base_url, api_key_env');
    expect(() => loadModels(write('{"ok":{"base_url":"http://h/v1"},"b":{"base_url":"http://h/v1","baseUrl":"x"}}'))).toThrow('"b" has an unknown key "baseUrl"');
    try {
      loadModels(write(line(',"api_key":"sk-SYNTH-secret"')));
    } catch (e) {
      expect((e as Error).message).not.toContain("SYNTH"); // the message names the key, never its value
    }
    // every key a line may have still passes
    expect(loadModels(write('{"a":{"base_url":"http://h/v1","model":"m","api_key_env":"A_KEY"}}'))).toEqual({ a: { base_url: "http://h/v1", model: "m", api_key_env: "A_KEY" } });
  });

  test("reads explicit model limits and rejects malformed budgets before collection", () => {
    const limits = { context: 32768, output: 4096 };
    const entries = loadModels(write(JSON.stringify({ local: { base_url: "http://192.0.2.5/v1", limits } })));
    expect(resolveModel("model", "local", {}, entries).limits).toEqual(limits);
    for (const bad of [null, {}, [], { context: 0, output: 1 }, { context: 10, output: 11 }, { context: "10", output: 1 }, { context: 10, output: 1.5 }, { context: 10, output: 1, typo: 1 }]) {
      expect(() => loadModels(write(JSON.stringify({ local: { base_url: "http://192.0.2.5/v1", limits: bad } })))).toThrow("limits needs positive integer");
    }
  });

  test('refuses a line that still has "private", and says the prompt before a run with --cases replaces it', () => {
    const message = 'models.json: "mine" has "private", which a prompt replaces: a run with --cases asks before it sends your cases to a model. Delete the key.';
    expect(() => loadModels(write('{"mine":{"base_url":"http://localhost:8080/v1","private":true}}'))).toThrow(message);
    expect(() => loadModels(write('{"mine":{"base_url":"http://localhost:8080/v1","private":false}}'))).toThrow(message);
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
