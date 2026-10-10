import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODEL_OPTIONS, type ModelEntry, loadModels, resolveModel, useJudge, useModel } from "./models.ts";

const GATEWAY = "https://gateway.example/v1";
const ENV = { MODEL_BASE_URL: GATEWAY, MODEL_API_KEY: "gw-key", MODEL_NAME: "chat/qwen3.8-27b" };
const NONE: Record<string, ModelEntry> = {};
const TERRA: Record<string, ModelEntry> = { "gpt-5.6-terra": { base_url: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY" } };
const stop = (message: string): never => {
  throw new Error(message);
};

describe("resolveModel", () => {
  test("the id is the flag, else MODEL_NAME, and goes to the gateway of .env with its key", () => {
    expect(resolveModel("model", "freellm/gpt-oss:120b", ENV, NONE)).toEqual({ name: "freellm/gpt-oss:120b", baseUrl: GATEWAY, apiKey: "gw-key", gatewayId: "freellm/gpt-oss:120b" });
    expect(resolveModel("model", undefined, ENV, NONE).name).toBe("chat/qwen3.8-27b");
    expect(resolveModel("model", " fast/qwen3.6-35b-a3b ", ENV, NONE).name).toBe("fast/qwen3.6-35b-a3b");
  });

  test("a gateway that needs no key gives an empty one", () => {
    expect(resolveModel("model", "chat/x", { MODEL_BASE_URL: GATEWAY }, NONE).apiKey).toBe("");
  });

  test("a line of models.json goes to its own URL with the key its api_key_env names, and has no gateway id", () => {
    const m = resolveModel("model", "gpt-5.6-terra", { ...ENV, OPENAI_API_KEY: "oa-key" }, TERRA);
    expect(m).toEqual({ name: "gpt-5.6-terra", baseUrl: "https://api.openai.com/v1", apiKey: "oa-key", gatewayId: undefined });
    expect(resolveModel("model", "local", {}, { local: { model: "Org/Model-1", base_url: "http://192.168.0.203:8102/v1" } })).toEqual({ name: "Org/Model-1", baseUrl: "http://192.168.0.203:8102/v1", apiKey: "", gatewayId: undefined });
  });

  test("says what to set when the id, the endpoint or an entry's key is missing, and never prints a key", () => {
    expect(() => resolveModel("model", undefined, { MODEL_BASE_URL: GATEWAY }, NONE)).toThrow("pass --model ID, or set MODEL_NAME");
    expect(() => resolveModel("model", "  ", ENV, NONE)).toThrow("--model needs a model id");
    expect(() => resolveModel("model", "chat/x", {}, NONE)).toThrow("set MODEL_BASE_URL in .env");
    expect(() => resolveModel("model", "gpt-5.6-terra", ENV, TERRA)).toThrow('takes its key from OPENAI_API_KEY, which is not set');
    try {
      resolveModel("model", "gpt-5.6-terra", ENV, TERRA);
    } catch (e) {
      expect((e as Error).message).not.toContain("gw-key");
    }
  });

  test("an id such as constructor is not a line of models.json", () => {
    expect(resolveModel("model", "constructor", ENV, NONE).gatewayId).toBe("constructor");
  });

  test("the judge uses its own endpoint and key when set, and otherwise the model's", () => {
    expect(resolveModel("judge", "chat/j", { ...ENV, JUDGE_BASE_URL: "http://judge/v1", JUDGE_API_KEY: "jk" }, NONE)).toEqual({ name: "chat/j", baseUrl: "http://judge/v1", apiKey: "jk", gatewayId: "chat/j" });
    expect(resolveModel("judge", "chat/j", ENV, NONE)).toEqual({ name: "chat/j", baseUrl: GATEWAY, apiKey: "gw-key", gatewayId: "chat/j" });
    expect(resolveModel("judge", undefined, { ...ENV, JUDGE_MODEL: "fast/j" }, NONE).name).toBe("fast/j");
    expect(() => resolveModel("judge", undefined, ENV, NONE)).toThrow("pass --judge-model ID, or set JUDGE_MODEL");
  });
});

describe("useModel", () => {
  test("writes the resolved model to MODEL_*, where the akm sandbox and the harbor evals read it, and says whether there is a key", () => {
    const env: Record<string, string | undefined> = { ...ENV, OPENAI_API_KEY: "oa-key" };
    const m = useModel({ model: "gpt-5.6-terra" }, stop, env, TERRA);
    expect(m).toMatchObject({ baseUrl: "https://api.openai.com/v1", name: "gpt-5.6-terra", hasKey: true });
    expect([env.MODEL_BASE_URL, env.MODEL_NAME, env.MODEL_API_KEY]).toEqual(["https://api.openai.com/v1", "gpt-5.6-terra", "oa-key"]);
    const keyless = useModel({ model: "chat/x" }, stop, { MODEL_BASE_URL: GATEWAY }, NONE);
    expect(keyless.hasKey).toBe(false);
  });

  test("without the flag it is the environment's model, as before", () => {
    const env: Record<string, string | undefined> = { ...ENV };
    expect(useModel({}, stop, env, NONE)).toMatchObject({ baseUrl: GATEWAY, name: "chat/qwen3.8-27b", hasKey: true });
  });

  test("fails through the caller's fail, and useJudge writes nothing", () => {
    expect(() => useModel({}, stop, {}, NONE)).toThrow("pass --model ID");
    const env: Record<string, string | undefined> = { ...ENV };
    expect(useJudge({ "judge-model": "fast/j" }, stop, env, NONE).name).toBe("fast/j");
    expect(env.MODEL_NAME).toBe("chat/qwen3.8-27b");
  });
});

describe("loadModels", () => {
  const write = (text: string) => {
    const file = join(mkdtempSync(join(tmpdir(), "models-test-")), "models.json");
    writeFileSync(file, text);
    return file;
  };

  test("is empty when there is no file, and reads the lines of one", () => {
    expect(loadModels(join(tmpdir(), "no-such-dir-for-models", "models.json"))).toEqual({});
    expect(loadModels(write(JSON.stringify(TERRA)))).toEqual(TERRA);
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
    expect(parseArgs({ args: ["--model", "fast/x", "--model=chat/y"], options: MODEL_OPTIONS, strict: true }).values.model).toBe("chat/y");
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
      if (/createSandbox\(/.test(r.source) && !/useAkm\(/.test(r.source)) missing.push(`${r.name}: no --akm`);
      if (r.name === "benchmarks/longmemeval" && !/useJudge\(/.test(r.source)) missing.push(`${r.name}: no --judge-model`);
    }
    expect(missing).toEqual([]);
  });
});
