import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { SEMANTIC_MODEL, type Sandbox, agentDetailArgs, agentDetailFrom, akmBuild, akmVersion, createSandbox, engineConfig, removeSandbox, runAkm, runAkmJson, sandboxIn, useAkm, writeConfig } from "./akm.ts";

const sandboxes: Sandbox[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const s of sandboxes.splice(0)) removeSandbox(s);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake akm: it answers a few commands and reports what it was given. */
const FAKE_AKM = `
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") console.log("akm 0.9.99-test");
else if (cmd === "echo") console.log(JSON.stringify({ args: rest, stdin: await Bun.stdin.text(), cwd: process.cwd(), config: process.env.AKM_CONFIG_DIR, modelKey: process.env.MODEL_API_KEY ?? null }));
else if (cmd === "fail") { console.error("it broke"); process.exit(3); }
else if (cmd === "hang") { process.on("SIGTERM", () => {}); await Bun.sleep(60_000); }
else { console.error("unknown command " + cmd); process.exit(1); }
`;

/** A sandbox whose akm is this script, run by bun. */
function fakeSandbox(opts?: { keepModelKey?: boolean }, script = FAKE_AKM): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
  dirs.push(dir);
  writeFileSync(join(dir, "fake-akm.ts"), script);
  const sandbox = { ...createSandbox("lib-akm-test", opts), cmd: ["bun", join(dir, "fake-akm.ts")] };
  sandboxes.push(sandbox);
  return sandbox;
}

/** Runs f with these variables set in process.env (undefined removes one), then puts them back. */
function withEnv<T>(vars: Record<string, string | undefined>, f: () => T): T {
  const apply = (v: Record<string, string | undefined>) => {
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) delete process.env[k];
      else process.env[k] = x;
    }
  };
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  apply(vars);
  try {
    return f();
  } finally {
    apply(saved);
  }
}

describe("createSandbox", () => {
  test("makes a temp folder named for the eval, with akm's folders and a plain config, and removeSandbox deletes it", () => {
    const sandbox = createSandbox("lib-akm-test");
    sandboxes.push(sandbox);
    expect(basename(sandbox.dir)).toStartWith("akm-eval-lib-akm-test-");
    for (const folder of ["bundle", "config", "data", "cache", "state", "xdg-config", "xdg-data", "xdg-state"]) expect(existsSync(join(sandbox.dir, folder))).toBe(true);
    expect(JSON.parse(readFileSync(join(sandbox.dir, "config", "config.json"), "utf8"))).toEqual({ configVersion: "0.9.0", semanticSearchMode: "off", registries: [] });
    removeSandbox(sandbox);
    expect(existsSync(sandbox.dir)).toBe(false);
  });

  test("gives akm its own folders and drops the caller's AKM_ settings and both keys", () => {
    const sandbox = withEnv({ AKM_BUNDLE_DIR: "/live/bundle", AKM_DEBUG: "1", AKM_BIN: "akm", JUDGE_API_KEY: "judge-secret", MODEL_API_KEY: "model-secret" }, () => createSandbox("lib-akm-test"));
    sandboxes.push(sandbox);
    const { dir, env } = sandbox;
    expect(env.AKM_BUNDLE_DIR).toBe(join(dir, "bundle"));
    for (const k of ["AKM_CONFIG_DIR", "AKM_DATA_DIR", "AKM_CACHE_DIR", "AKM_STATE_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]) expect(env[k]).toStartWith(`${dir}/`);
    expect(Object.keys(env).filter((k) => k.startsWith("AKM_")).sort()).toEqual(["AKM_BUNDLE_DIR", "AKM_CACHE_DIR", "AKM_CONFIG_DIR", "AKM_DATA_DIR", "AKM_STATE_DIR"]);
    expect(env.JUDGE_API_KEY).toBeUndefined();
    expect(env.MODEL_API_KEY).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH as string);
  });

  test("keeps the model key when akm's config names it, and still drops the judge key", () => {
    const sandbox = withEnv({ JUDGE_API_KEY: "judge-secret", MODEL_API_KEY: "model-secret" }, () => createSandbox("lib-akm-test", { keepModelKey: true }));
    sandboxes.push(sandbox);
    expect(sandbox.env.MODEL_API_KEY).toBe("model-secret");
    expect(sandbox.env.JUDGE_API_KEY).toBeUndefined();
  });

  test("with semantic, starts with keyword search fused with the built-in embedder's vectors, and keeps the model in the repository's .cache", () => {
    const cache = join(import.meta.dir, "..", "..", ".cache", "models");
    const sandbox = withEnv({ HF_HOME: "/elsewhere" }, () => createSandbox("lib-akm-test", { semantic: true }));
    sandboxes.push(sandbox);
    expect(JSON.parse(readFileSync(join(sandbox.dir, "config", "config.json"), "utf8"))).toEqual({
      configVersion: "0.9.0",
      semanticSearchMode: "auto",
      registries: [],
      embedding: { localModel: "Xenova/bge-small-en-v1.5", queryTimeoutMs: 600_000 },
    });
    expect(SEMANTIC_MODEL).toBe("Xenova/bge-small-en-v1.5");
    expect(sandbox.env.HF_HOME).toBe(cache);
    expect(sandbox.env.AKM_BUNDLE_DIR).toBe(join(sandbox.dir, "bundle"));
    expect(existsSync(cache)).toBe(true);
    // the model is not in the sandbox, so it outlives it and the next sandbox finds it
    removeSandbox(sandbox);
    expect(existsSync(cache)).toBe(true);
  });

  test("a plain sandbox does not touch HF_HOME", () => {
    const sandbox = withEnv({ HF_HOME: "/elsewhere" }, () => createSandbox("lib-akm-test"));
    sandboxes.push(sandbox);
    expect(sandbox.env.HF_HOME).toBe("/elsewhere");
  });

  test("runs akm, or the words of AKM_BIN", () => {
    const cmdFor = (bin: string | undefined) => {
      const sandbox = withEnv({ AKM_BIN: bin }, () => createSandbox("lib-akm-test"));
      sandboxes.push(sandbox);
      return sandbox.cmd;
    };
    expect(cmdFor(undefined)).toEqual(["akm"]);
    expect(cmdFor("  ")).toEqual(["akm"]);
    expect(cmdFor("bun /path/to/akm/src/cli.ts")).toEqual(["bun", "/path/to/akm/src/cli.ts"]);
    expect(cmdFor(" bun   cli.ts ")).toEqual(["bun", "cli.ts"]);
  });
});

describe("sandboxIn", () => {
  test("makes the sandbox in the folder it is given, which may not exist yet, and leaves the config of a folder that has one", () => {
    const parent = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
    dirs.push(parent);
    const dir = join(parent, "kept");
    const sandbox = sandboxIn(dir, { semantic: true });
    expect(sandbox.dir).toBe(dir);
    expect(sandbox.env.AKM_BUNDLE_DIR).toBe(join(dir, "bundle"));
    expect(JSON.parse(readFileSync(join(dir, "config", "config.json"), "utf8"))).toMatchObject({ semanticSearchMode: "auto" });
    writeConfig(sandbox, { semanticSearchMode: "auto", bundles: { notes: { path: "/somewhere" } } });
    const again = sandboxIn(dir, { semantic: true });
    expect(again.env).toEqual(sandbox.env);
    expect(JSON.parse(readFileSync(join(dir, "config", "config.json"), "utf8")).bundles).toEqual({ notes: { path: "/somewhere" } });
  });
});

describe("writeConfig", () => {
  test("replaces the config file with the object, as JSON", () => {
    const sandbox = fakeSandbox();
    writeConfig(sandbox, { configVersion: "0.9.0", extra: { a: 1 } });
    expect(readFileSync(join(sandbox.dir, "config", "config.json"), "utf8")).toBe('{\n  "configVersion": "0.9.0",\n  "extra": {\n    "a": 1\n  }\n}\n');
  });
});

describe("engineConfig", () => {
  test("is one LLM engine, used as the default engine, with keyword search only", () => {
    expect(engineConfig("http://localhost:8080/v1", "qwen", false)).toEqual({
      configVersion: "0.9.0",
      semanticSearchMode: "off",
      registries: [],
      engines: { model: { kind: "llm", provider: "openai", endpoint: "http://localhost:8080/v1/chat/completions", model: "qwen", timeoutMs: 600_000 } },
      defaults: { llmEngine: "model" },
    });
  });

  test("takes a base URL or a full chat-completions URL, with or without a trailing slash", () => {
    expect(engineConfig("http://h/v1/", "m", false).engines.model.endpoint).toBe("http://h/v1/chat/completions");
    expect(engineConfig("https://api.example.com/v1/chat/completions", "m", false).engines.model.endpoint).toBe("https://api.example.com/v1/chat/completions");
    expect(engineConfig("https://api.example.com/v1/chat/completions/", "m", false).engines.model.endpoint).toBe("https://api.example.com/v1/chat/completions");
  });

  test("names the key by environment variable, only when there is one, and never holds it", () => {
    const keyed = withEnv({ MODEL_API_KEY: "model-secret" }, () => engineConfig("http://h/v1", "m", true));
    expect(keyed.engines.model.apiKey).toBe("$MODEL_API_KEY");
    expect(JSON.stringify(keyed)).not.toContain("model-secret");
    expect("apiKey" in engineConfig("http://h/v1", "m", false).engines.model).toBe(false);
  });

  test("names the engine as asked, and a caller adds per-process routing to the object it gets", () => {
    const c = engineConfig("http://h/v1", "m", false, "judge");
    expect(Object.keys(c.engines)).toEqual(["judge"]);
    expect(c.defaults.llmEngine).toBe("judge");
    c.improve = { strategies: { default: { processes: { reflect: { qualityGate: { engine: "judge" } } } } } };
    expect(Object.keys(c)).toEqual(["configVersion", "semanticSearchMode", "registries", "engines", "defaults", "improve"]);
    expect(engineConfig("http://h/v1", "m", false).improve).toBeUndefined();
  });
});

describe("runAkm", () => {
  test("runs akm in the sandbox with the arguments and the input, and returns what it printed", async () => {
    const sandbox = fakeSandbox();
    const r = await runAkm(sandbox, ["echo", "one", "--two"], { stdin: "some input" });
    expect(r).toMatchObject({ stderr: "", code: 0 });
    expect(r.ms).toBeGreaterThan(0);
    const seen = JSON.parse(r.stdout);
    expect(seen.args).toEqual(["one", "--two"]);
    expect(seen.stdin).toBe("some input");
    expect(basename(seen.cwd)).toBe(basename(sandbox.dir));
    expect(seen.config).toBe(join(sandbox.dir, "config"));
  });

  test("with no input akm reads an empty stdin, and the model key reaches it only when asked", async () => {
    const [plain, keyed] = withEnv({ MODEL_API_KEY: "model-secret" }, () => [fakeSandbox(), fakeSandbox({ keepModelKey: true })]);
    expect(JSON.parse((await runAkm(plain, ["echo"])).stdout)).toMatchObject({ stdin: "", modelKey: null });
    expect(JSON.parse((await runAkm(keyed, ["echo"])).stdout).modelKey).toBe("model-secret");
  });

  test("returns a failing exit code and its stderr, and does not throw", async () => {
    expect(await runAkm(fakeSandbox(), ["fail"])).toMatchObject({ stdout: "", stderr: "it broke\n", code: 3 });
  });

  test("kills a command that runs past the timeout, even one that ignores SIGTERM", async () => {
    const r = await runAkm(fakeSandbox(), ["hang"], { timeoutMs: 300 });
    expect(r.code).not.toBe(0);
    expect(r.ms).toBeGreaterThanOrEqual(250);
    expect(r.ms).toBeLessThan(4000);
  });
});

describe("runAkmJson", () => {
  test("adds --format json after the arguments, or before a -- so a query stays a query", async () => {
    const sandbox = fakeSandbox();
    expect((await runAkmJson<{ args: string[] }>(sandbox, ["echo", "--full"])).args).toEqual(["--full", "--format", "json"]);
    expect((await runAkmJson<{ args: string[] }>(sandbox, ["echo", "--limit", "5", "--", "a query"])).args).toEqual(["--limit", "5", "--format", "json", "--", "a query"]);
  });

  test("passes the options on", async () => {
    expect((await runAkmJson<{ stdin: string }>(fakeSandbox(), ["echo"], { stdin: "in" })).stdin).toBe("in");
  });

  test("throws with the command, the exit code and the end of stderr when akm fails", async () => {
    await expect(runAkmJson(fakeSandbox(), ["fail"])).rejects.toThrow("akm fail failed (exit 3): it broke");
  });

  test("throws when akm prints something that is not JSON", async () => {
    await expect(runAkmJson(fakeSandbox(), ["--version"])).rejects.toThrow();
  });
});

describe("akmVersion", () => {
  test("reads the version akm prints", async () => {
    expect(await akmVersion(fakeSandbox())).toBe("0.9.99-test");
  });

  test("says how to fix it when akm cannot be run, fails, or prints no version", async () => {
    const missing = { ...fakeSandbox(), cmd: ["no-such-akm-binary-here"] };
    await expect(akmVersion(missing)).rejects.toThrow("could not run `no-such-akm-binary-here --version`. Install akm or set AKM_BIN.");
    await expect(akmVersion(fakeSandbox({}, 'console.error("bad"); process.exit(1);'))).rejects.toThrow("Install akm or set AKM_BIN. bad");
    await expect(akmVersion(fakeSandbox({}, 'console.log("no number here");'))).rejects.toThrow("Install akm or set AKM_BIN.");
  });
});

describe("agentDetailFrom", () => {
  test("0.9.x help lists --shape, 0.10 help lists --detail agent only, anything else is unknown", () => {
    expect(agentDetailFrom("--detail=<detail>  Detail level: brief|normal|full\n--shape=<shape>  Output projection: human|agent")).toEqual(["--shape", "agent"]);
    expect(agentDetailFrom("--detail=<detail>  Detail level: brief|normal|full, or agent")).toEqual(["--detail", "agent"]);
    expect(agentDetailFrom("usage: akm search")).toBeNull();
  });
});

describe("agentDetailArgs", () => {
  const withHelp = (help: string) => fakeSandbox({}, `console.log(${JSON.stringify(help)});`);

  test("asks the akm under test once and remembers", async () => {
    const old = withHelp("--shape=<shape> Output projection");
    expect(await agentDetailArgs(old)).toEqual(["--shape", "agent"]);
    writeFileSync(old.cmd[1], 'console.log("--detail=<detail> Detail level, or agent");');
    expect(await agentDetailArgs(old)).toEqual(["--shape", "agent"]);
    expect(await agentDetailArgs(withHelp("--detail=<detail> Detail level, or agent"))).toEqual(["--detail", "agent"]);
  });

  test("uses the 0.10 spelling, and says so on stderr, when the help names neither", async () => {
    const written: string[] = [];
    const real = console.error;
    console.error = (m: string) => void written.push(m);
    try {
      expect(await agentDetailArgs(withHelp("nothing useful"))).toEqual(["--detail", "agent"]);
    } finally {
      console.error = real;
    }
    expect(written).toHaveLength(1);
  });
});

describe("akmBuild", () => {
  const git = (dir: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { stdout: "pipe", stderr: "pipe" });

  test("names the git build of the checkout AKM_BIN runs from, and marks a changed one dirty", () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-akm-build-"));
    dirs.push(dir);
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "cli.ts"), "");
    git(dir, "init", "-q");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "x");
    const sha = git(dir, "rev-parse", "--short", "HEAD").stdout.toString().trim();
    const bin = `bun ${join(dir, "src", "cli.ts")}`;
    expect(withEnv({ AKM_BIN: bin }, akmBuild)).toEqual({ akm_bin: bin, akm_build: sha });
    writeFileSync(join(dir, "src", "cli.ts"), "// changed");
    expect(withEnv({ AKM_BIN: bin }, akmBuild).akm_build).toBe(`${sha}-dirty`);
  });

  test("reports the checkout of the script, not of the runtime before it", () => {
    const repo = (name: string, file: string) => {
      const dir = mkdtempSync(join(tmpdir(), `lib-akm-build-${name}-`));
      dirs.push(dir);
      writeFileSync(join(dir, file), "");
      git(dir, "init", "-q");
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", name);
      return { path: join(dir, file), sha: git(dir, "rev-parse", "--short", "HEAD").stdout.toString().trim() };
    };
    const runtime = repo("runtime", "bun");
    const script = repo("script", "cli.ts");
    const bin = `${runtime.path} ${script.path}`;
    expect(runtime.sha).not.toBe(script.sha);
    expect(withEnv({ AKM_BIN: bin }, akmBuild)).toEqual({ akm_bin: bin, akm_build: script.sha });
  });

  test("has no build for a command outside a git checkout, and writes the home folder as ~", () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-akm-build-"));
    dirs.push(dir);
    writeFileSync(join(dir, "akm"), "");
    expect(withEnv({ AKM_BIN: join(dir, "akm") }, akmBuild).akm_build).toBeNull();
    expect(withEnv({ AKM_BIN: `bun ${homedir()}/no/such/akm` }, akmBuild)).toEqual({ akm_bin: "bun ~/no/such/akm", akm_build: null });
    expect(withEnv({ AKM_BIN: undefined }, akmBuild).akm_bin).toBe("akm");
  });
});

describe("useAkm", () => {
  const stop = (message: string): never => {
    throw new Error(message);
  };

  test("--akm sets AKM_BIN for the sandboxes, and wins over the one already there", () => {
    const env: Record<string, string | undefined> = { AKM_BIN: "akm" };
    useAkm({ akm: " bun /work/akm/src/cli.ts " }, stop, env);
    expect(env.AKM_BIN).toBe("bun /work/akm/src/cli.ts");
    const sandbox = withEnv({ AKM_BIN: env.AKM_BIN }, () => createSandbox("lib-akm-test"));
    sandboxes.push(sandbox);
    expect(sandbox.cmd).toEqual(["bun", "/work/akm/src/cli.ts"]);
  });

  test("writes your home folder for a leading ~/ in a word, and nothing for a flag that is not given", () => {
    const env: Record<string, string | undefined> = { AKM_BIN: "akm" };
    useAkm({ akm: "bun ~/code/akm/src/cli.ts" }, stop, env);
    expect(env.AKM_BIN).toBe(`bun ${homedir()}/code/akm/src/cli.ts`);
    const kept: Record<string, string | undefined> = { AKM_BIN: "akm-from-env" };
    useAkm({}, stop, kept);
    expect(kept.AKM_BIN).toBe("akm-from-env");
  });

  test("refuses an empty command", () => {
    expect(() => useAkm({ akm: "  " }, stop, {})).toThrow("--akm needs the command that runs akm");
  });
});
