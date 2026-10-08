import { describe, expect, test } from "bun:test";
import { PINS, jobConfig, modelName, modelSettings, slug } from "./harbor.ts";

describe("modelName", () => {
  test("keeps a name that has a provider and reads one without as an openai model", () => {
    expect(modelName("openai/gpt-6-luna")).toBe("openai/gpt-6-luna");
    expect(modelName("gpt-6-luna")).toBe("openai/gpt-6-luna");
    expect(modelName("anthropic/claude-sonnet-4-5")).toBe("anthropic/claude-sonnet-4-5");
  });
});

describe("modelSettings", () => {
  test("reads an openai model, its key and its endpoint", () => {
    const r = modelSettings({ MODEL_NAME: "gpt-6-luna", MODEL_API_KEY: "k1", MODEL_BASE_URL: "http://192.0.2.5:8080/v1", PATH: "/bin" });
    expect(r.model).toBe("openai/gpt-6-luna");
    expect(r.env).toMatchObject({ OPENAI_API_KEY: "k1", OPENAI_BASE_URL: "http://192.0.2.5:8080/v1", PATH: "/bin" });
  });

  test("lets OPENAI_API_KEY win over MODEL_API_KEY, and needs no endpoint", () => {
    const r = modelSettings({ MODEL_NAME: "openai/x", OPENAI_API_KEY: "a", MODEL_API_KEY: "b" });
    expect(r.env.OPENAI_API_KEY).toBe("a");
    expect(r.env.OPENAI_BASE_URL).toBeUndefined();
  });

  test("stops without a model name, without a key, or with an endpoint a container cannot reach", () => {
    expect(() => modelSettings({ MODEL_API_KEY: "k" })).toThrow("MODEL_NAME");
    expect(() => modelSettings({ MODEL_NAME: "x", MODEL_API_KEY: " " })).toThrow("no model key");
    expect(() => modelSettings({ MODEL_NAME: "x", MODEL_API_KEY: "k", MODEL_BASE_URL: "http://localhost:8080/v1" })).toThrow("container");
    expect(() => modelSettings({ MODEL_NAME: "x", MODEL_API_KEY: "k", MODEL_BASE_URL: "http://127.0.0.1:1/v1" })).toThrow("container");
  });

  test("leaves another provider's key to Harbor", () => {
    const r = modelSettings({ MODEL_NAME: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "a" });
    expect(r.model).toBe("anthropic/claude-sonnet-4-5");
    expect(r.env.ANTHROPIC_API_KEY).toBe("a");
    expect(r.env.OPENAI_API_KEY).toBeUndefined();
  });
});

describe("jobConfig", () => {
  const base = { name: "x-public", model: "openai/gpt-6-luna", jobsDir: "/j", attempts: 1, librariesDir: "/l", datasets: [{ name: "org/data", ref: "sha256:abc" }] };
  const [control, akm] = (jobConfig(base) as any).agents;

  test("names the two arms and gives them one model, one opencode and one config", () => {
    expect(control.name).toBe("opencode");
    expect(akm.import_path).toBe("akm_opencode:AkmOpenCode");
    expect(akm.model_name).toBe(control.model_name);
    expect(akm.kwargs.version).toBe(PINS.opencode);
    expect(akm.kwargs.opencode_config).toEqual(control.kwargs.opencode_config);
    expect(akm.override_setup_timeout_sec).toBe(control.override_setup_timeout_sec);
  });

  test("passes the datasets on as they are, and starts four trials at a time", () => {
    const cfg = jobConfig(base) as any;
    expect(cfg.datasets).toEqual(base.datasets);
    expect(cfg.n_concurrent_trials).toBe(4);
    expect(cfg.n_attempts).toBe(1);
    expect(cfg.environment).toEqual({ type: "docker", delete: true });
  });

  test("adds what an eval asks of the akm arm to that arm and no other", () => {
    const cfg = jobConfig({ ...base, akm: { env: { AKM_TASK_STASH: "library" }, kwargs: { library_assets: 259 } } }) as any;
    expect(cfg.agents[1].env).toEqual({ AKM_TASK_STASH: "library" });
    expect(cfg.agents[1].kwargs).toMatchObject({ library_assets: 259, akm_cli_version: PINS.akm_cli, libraries_dir: "/l" });
    expect(cfg.agents[0]).toEqual(control);
    expect(akm.env).toBeUndefined();
  });
});

describe("slug", () => {
  test("slug keeps letters and digits", () => {
    expect(slug("openai/gpt-6-luna")).toBe("openai-gpt-6-luna");
  });
});
