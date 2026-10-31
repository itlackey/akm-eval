import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { SEMANTIC_MODEL, type Sandbox, agentDetailArgs, agentDetailFrom, akmBuild, akmVersion, atLeast, commandLine, createSandbox, engineConfig, parseCommand, removeSandbox, runAkm, runAkmJson, sandboxIn, semanticConfig, useAkm, writeConfig } from "./akm.ts";

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
else if (cmd === "exit137") process.exit(137);
else if (cmd === "selfkill") process.kill(process.pid, "SIGKILL");
else if (cmd === "hang") { process.on("SIGTERM", () => {}); await Bun.sleep(60_000); }
else if (cmd === "chatter") { console.error("working on it"); process.on("SIGTERM", () => {}); await Bun.sleep(60_000); }
else { console.error("unknown command " + cmd); process.exit(1); }
`;

/** A fake akm that prints the value of each variable it is asked about, or null for one that is not set. */
const ENV_AKM = `
const [cmd, ...names] = process.argv.slice(2);
if (cmd === "env") console.log(JSON.stringify(Object.fromEntries(names.map((name) => [name, process.env[name] ?? null]))));
else if (cmd === "args") console.log(JSON.stringify(names));
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

/**
 * A path as a summary writes it: ~ for your home folder. A temporary folder is under the home folder only when TMPDIR is, so a test
 * that expects a fixture's path in akm_bin computes the form from where the fixture is.
 */
function written(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
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

/** Runs f with exactly these variables in process.env and no others, then puts the caller's back. */
function withOnlyEnv<T>(vars: Record<string, string>, f: () => T): T {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return f();
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
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

  test("a semantic sandbox finds akm's ONNX Runtime in the repository's .cache through a link, which removing the sandbox leaves (#147)", () => {
    const shared = join(import.meta.dir, "..", "..", ".cache", "onnxruntime");
    const sandbox = createSandbox("lib-akm-test", { semantic: true });
    sandboxes.push(sandbox);
    const link = join(sandbox.dir, "cache", "onnxruntime");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(shared);
    expect(sandbox.env.AKM_CACHE_DIR).toBe(join(sandbox.dir, "cache")); // the rest of akm's cache is the sandbox's own
    // what akm fetches through the link outlives the sandbox, so the next sandbox finds it
    const fetched = `lib-akm-test-${process.pid}`;
    writeFileSync(join(link, fetched), "binding");
    try {
      removeSandbox(sandbox);
      expect(existsSync(sandbox.dir)).toBe(false);
      expect(readFileSync(join(shared, fetched), "utf8")).toBe("binding");
    } finally {
      rmSync(join(shared, fetched), { force: true });
    }
  });

  test("a plain sandbox has no link to ONNX Runtime, and gets one when a config turns on the built-in embedder (#147)", () => {
    const sandbox = createSandbox("lib-akm-test");
    sandboxes.push(sandbox);
    expect(readdirSync(join(sandbox.dir, "cache"))).toEqual([]);
    writeConfig(sandbox, semanticConfig());
    const link = join(sandbox.dir, "cache", "onnxruntime");
    expect(readlinkSync(link)).toBe(join(import.meta.dir, "..", "..", ".cache", "onnxruntime"));
    expect(sandbox.env.HF_HOME).toBe(join(import.meta.dir, "..", "..", ".cache", "models"));
    writeConfig(sandbox, semanticConfig()); // a second config leaves the link as it is
    expect(readlinkSync(link)).toBe(join(import.meta.dir, "..", "..", ".cache", "onnxruntime"));
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

  test("writes your home folder for a leading ~/ in a word of AKM_BIN, as --akm does, and leaves any other ~ alone", () => {
    const cmdFor = (bin: string) => {
      const sandbox = withEnv({ AKM_BIN: bin }, () => createSandbox("lib-akm-test"));
      sandboxes.push(sandbox);
      return sandbox.cmd;
    };
    const home = homedir();
    expect(cmdFor("bun ~/code/akm/src/cli.ts")).toEqual(["bun", `${home}/code/akm/src/cli.ts`]);
    expect(cmdFor("~/bin/akm")).toEqual([`${home}/bin/akm`]);
    expect(cmdFor("~/bin/bun ~/code/akm/src/cli.ts")).toEqual([`${home}/bin/bun`, `${home}/code/akm/src/cli.ts`]);
    expect(cmdFor("bun /work/~/cli.ts ~other/cli.ts ~ --root=~/x")).toEqual(["bun", "/work/~/cli.ts", "~other/cli.ts", "~", "--root=~/x"]);
  });

  test("gives akm only the variables it needs: no credential by any name, and nothing else of the caller's", () => {
    // Each of these once got through, or is a kind of secret no name pattern lists. None may reach akm, whatever its name.
    const secrets: Record<string, string> = {
      MYSQL_PWD: "SYNTH_MYSQL",
      GPG_PASSPHRASE: "SYNTH_GPG",
      GH_PAT: "SYNTH_PAT",
      SESSION_COOKIE: "SYNTH_COOKIE",
      DATABASE_URL: "postgres://user:SYNTH_DATABASE@db.example/app",
      SENTRY_DSN: "https://SYNTH_DSN@sentry.example/1",
      JUDGE_BASE_URL: "https://judge:SYNTH_JUDGE_PASSWORD@judge.example/v1",
      OPENAI_API_KEY: "SYNTH_OPENAI",
      GROQ_KEY: "SYNTH_GROQ",
      JUDGE_API_KEY: "SYNTH_JUDGE",
      MODEL_API_KEY_FILE: "/SYNTH/drop/this",
      API_KEY_HINT: "SYNTH_HINT",
      HF_TOKEN: "SYNTH_HF",
      SSH_AUTH_SOCK: "/SYNTH/agent.sock",
      openai_api_key: "SYNTH_LOWER",
      MY_SETTING: "SYNTH_SETTING",
      AKM_BUNDLE_DIR: "/SYNTH/live/bundle",
      AKM_BIN: "akm",
      HF_HUB_CACHE: "/SYNTH/hub",
    };
    const needed: Record<string, string> = {
      PATH: "/usr/local/bin:/usr/bin",
      HOME: "/home/someone",
      USER: "someone",
      LANG: "C.UTF-8",
      LC_ALL: "C",
      TZ: "UTC",
      TMPDIR: tmpdir(), // the sandbox is made there
      HTTPS_PROXY: "http://proxy.example:3128",
      no_proxy: "localhost",
      SSL_CERT_FILE: "/etc/ssl/ca.pem",
      GIT_AUTHOR_NAME: "A Person",
      GIT_AUTHOR_EMAIL: "a@example.com",
      HF_HOME: "/keep/this",
      NVM_DIR: "/home/someone/.nvm",
      FAKE_LOG: "/keep/this/calls.log", // the settings of the fake akm of a test
    };
    const plain = withOnlyEnv({ ...secrets, ...needed, MODEL_API_KEY: "SYNTH_MODEL" }, () => createSandbox("lib-akm-test"));
    const keyed = withOnlyEnv({ ...secrets, ...needed, MODEL_API_KEY: "SYNTH_MODEL" }, () => createSandbox("lib-akm-test", { keepModelKey: true }));
    sandboxes.push(plain, keyed);
    const own = (dir: string) => ({
      AKM_BUNDLE_DIR: join(dir, "bundle"),
      AKM_CONFIG_DIR: join(dir, "config"),
      AKM_DATA_DIR: join(dir, "data"),
      AKM_CACHE_DIR: join(dir, "cache"),
      AKM_STATE_DIR: join(dir, "state"),
      XDG_CONFIG_HOME: join(dir, "xdg-config"),
      XDG_DATA_HOME: join(dir, "xdg-data"),
      XDG_STATE_HOME: join(dir, "xdg-state"),
      GIT_CEILING_DIRECTORIES: dir,
    });
    expect(plain.env).toEqual({ ...needed, ...own(plain.dir) });
    expect(keyed.env).toEqual({ ...needed, ...own(keyed.dir), MODEL_API_KEY: "SYNTH_MODEL" });
  });

  test("a key that the config does not name as $NAME never reaches akm, and one it names does, whatever its name", async () => {
    const vars = { GROQ_KEY: "groq-secret", OPENAI_API_KEY: "openai-secret", SECOND_PROVIDER_TOKEN: "second-secret", HOME_TOKEN: "unnamed-secret" };
    const sandbox = withEnv(vars, () => {
      const sb = fakeSandbox({}, ENV_AKM);
      writeConfig(sb, { engines: { a: { kind: "llm", apiKey: "$GROQ_KEY" }, b: { kind: "llm", headers: { "X-Api-Key": "${SECOND_PROVIDER_TOKEN}" } } } });
      return sb;
    });
    const seen = JSON.parse((await runAkm(sandbox, ["env", ...Object.keys(vars), "HOME", "PATH"])).stdout);
    expect(seen).toEqual({ GROQ_KEY: "groq-secret", OPENAI_API_KEY: null, SECOND_PROVIDER_TOKEN: "second-secret", HOME_TOKEN: null, HOME: process.env.HOME, PATH: process.env.PATH });
  });

  test("a variable the config names reaches akm whatever its name, and a rewrite takes it back without touching one akm has anyway", async () => {
    const vars = { PRIVATE_GATEWAY: "https://gateway.example", DATABASE_URL: "postgres://user:SYNTH_DATABASE@db.example/app" };
    const sandbox = withEnv(vars, () => {
      const sb = fakeSandbox({}, ENV_AKM);
      writeConfig(sb, { engines: { a: { endpoint: "${PRIVATE_GATEWAY}/v1", cache: "$HOME/cache" } } });
      return sb;
    });
    const names = ["PRIVATE_GATEWAY", "DATABASE_URL", "HOME"];
    expect(JSON.parse((await runAkm(sandbox, ["env", ...names])).stdout)).toEqual({ PRIVATE_GATEWAY: "https://gateway.example", DATABASE_URL: null, HOME: process.env.HOME });
    withEnv(vars, () => writeConfig(sandbox, { engines: { a: { endpoint: "http://localhost/v1" } } }));
    expect(JSON.parse((await runAkm(sandbox, ["env", ...names])).stdout)).toEqual({ PRIVATE_GATEWAY: null, DATABASE_URL: null, HOME: process.env.HOME });
  });

  test("a sandbox that cannot be made leaves no folder behind", () => {
    const made = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
    dirs.push(made);
    expect(() => withEnv({ TMPDIR: made, AKM_BIN: 'bun "/tmp/a b/cli.ts' }, () => createSandbox("lib-akm-test"))).toThrow("AKM_BIN is not a command");
    expect(readdirSync(made)).toEqual([]);
  });

  test("two engines that each name their own key both reach akm, and an unreferenced GROQ_KEY or OPENAI_API_KEY does not", async () => {
    const vars = { GROQ_KEY: "groq-secret", OPENAI_API_KEY: "openai-secret", MODEL_API_KEY: "model-secret", ANTHROPIC_API_KEY: "anthropic-secret" };
    const make = (config: unknown) =>
      withEnv(vars, () => {
        const sb = fakeSandbox({}, ENV_AKM);
        writeConfig(sb, config);
        return sb;
      });
    const both = make({ engines: { one: { apiKey: "$GROQ_KEY" }, two: { apiKey: "$OPENAI_API_KEY" } } });
    expect(JSON.parse((await runAkm(both, ["env", "GROQ_KEY", "OPENAI_API_KEY", "MODEL_API_KEY", "ANTHROPIC_API_KEY"])).stdout)).toEqual({ GROQ_KEY: "groq-secret", OPENAI_API_KEY: "openai-secret", MODEL_API_KEY: null, ANTHROPIC_API_KEY: null });
    const none = make(engineConfig("http://h/v1", "m", false));
    expect(JSON.parse((await runAkm(none, ["env", "GROQ_KEY", "OPENAI_API_KEY", "MODEL_API_KEY"])).stdout)).toEqual({ GROQ_KEY: null, OPENAI_API_KEY: null, MODEL_API_KEY: null });
    const model = make(engineConfig("http://h/v1", "m", true));
    expect(JSON.parse((await runAkm(model, ["env", "GROQ_KEY", "MODEL_API_KEY"])).stdout)).toEqual({ GROQ_KEY: null, MODEL_API_KEY: "model-secret" });
  });

  test("a config written over another takes back the keys the new one does not name, but not the model key keepModelKey gave", () => {
    const sandbox = withEnv({ GROQ_KEY: "groq-secret", OPENAI_API_KEY: "openai-secret", MODEL_API_KEY: "model-secret" }, () => {
      const sb = createSandbox("lib-akm-test", { keepModelKey: true });
      sandboxes.push(sb);
      writeConfig(sb, { a: "$GROQ_KEY", b: "$OPENAI_API_KEY", c: "$NOT_SET_ANYWHERE_KEY" });
      expect(sb.env.GROQ_KEY).toBe("groq-secret");
      expect(sb.env.OPENAI_API_KEY).toBe("openai-secret");
      expect(sb.env.NOT_SET_ANYWHERE_KEY).toBeUndefined();
      writeConfig(sb, { a: "$GROQ_KEY" });
      return sb;
    });
    expect(sandbox.env.GROQ_KEY).toBe("groq-secret");
    expect(sandbox.env.OPENAI_API_KEY).toBeUndefined();
    expect(sandbox.env.MODEL_API_KEY).toBe("model-secret");
  });

  test("a folder that has a config already gives akm the keys that config names", () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
    dirs.push(dir);
    const sandbox = withEnv({ GROQ_KEY: "groq-secret", OPENAI_API_KEY: "openai-secret" }, () => {
      writeConfig(sandboxIn(dir), { engines: { a: { apiKey: "$GROQ_KEY" } } });
      return sandboxIn(dir);
    });
    expect(sandbox.env.GROQ_KEY).toBe("groq-secret");
    expect(sandbox.env.OPENAI_API_KEY).toBeUndefined();
  });
});

describe("parseCommand", () => {
  const home = homedir();

  test("splits on whitespace, and takes double and single quotes and backslash escapes, as a shell would for a command and nothing more", () => {
    expect(parseCommand("bun /path/to/akm/src/cli.ts")).toEqual(["bun", "/path/to/akm/src/cli.ts"]);
    expect(parseCommand("  bun \t  cli.ts \n")).toEqual(["bun", "cli.ts"]);
    expect(parseCommand('bun "/tmp/checkout with spaces/cli.ts"')).toEqual(["bun", "/tmp/checkout with spaces/cli.ts"]);
    expect(parseCommand("bun '/tmp/checkout with spaces/cli.ts'")).toEqual(["bun", "/tmp/checkout with spaces/cli.ts"]);
    expect(parseCommand(String.raw`bun /tmp/checkout\ with\ spaces/cli.ts`)).toEqual(["bun", "/tmp/checkout with spaces/cli.ts"]);
    expect(parseCommand(`bun /tmp/"a b"/'c d'/e`)).toEqual(["bun", "/tmp/a b/c d/e"]);
    expect(parseCommand(String.raw`bun "say \"hi\" \\ done" 'no \ escape here'`)).toEqual(["bun", String.raw`say "hi" \ done`, String.raw`no \ escape here`]);
    expect(parseCommand('a "" b')).toEqual(["a", "", "b"]);
    expect(parseCommand("")).toEqual([]);
  });

  test("evaluates nothing: a $VARIABLE, a `command`, a glob and a ; are text", () => {
    expect(parseCommand("bun $HOME/cli.ts `id` *.ts ; rm")).toEqual(["bun", "$HOME/cli.ts", "`id`", "*.ts", ";", "rm"]);
    expect(parseCommand('bun "$HOME/cli.ts \\$HOME \\`id\\`" \'$HOME\'')).toEqual(["bun", "$HOME/cli.ts $HOME `id`", "$HOME"]);
    expect(parseCommand(String.raw`bun "a\nb"`)).toEqual(["bun", String.raw`a\nb`]); // a backslash before any other character stays in double quotes
  });

  test("a word that starts with ~/ starts at your home folder, quoted or not, and any other ~ is a ~", () => {
    expect(parseCommand("bun ~/code/akm/src/cli.ts")).toEqual(["bun", `${home}/code/akm/src/cli.ts`]);
    expect(parseCommand('bun "~/my code/akm/cli.ts"')).toEqual(["bun", `${home}/my code/akm/cli.ts`]);
    expect(parseCommand('bun ~/"my code"/cli.ts')).toEqual(["bun", `${home}/my code/cli.ts`]);
    expect(parseCommand("~/bin/bun ~/code/cli.ts")).toEqual([`${home}/bin/bun`, `${home}/code/cli.ts`]);
    expect(parseCommand("bun /work/~/cli.ts ~other/cli.ts ~ --root=~/x")).toEqual(["bun", "/work/~/cli.ts", "~other/cli.ts", "~", "--root=~/x"]);
    expect(parseCommand(String.raw`bun \~/cli.ts`)).toEqual(["bun", "~/cli.ts"]);
  });

  test("throws on a quote that is not closed and on a backslash at the end, and says which", () => {
    expect(() => parseCommand('bun "/tmp/a b/cli.ts')).toThrow('has a " that is not closed');
    expect(() => parseCommand("bun '/tmp/a b/cli.ts")).toThrow("has a ' that is not closed");
    expect(() => parseCommand("bun cli.ts\\")).toThrow("ends with a backslash");
  });
});

describe("a command with spaces in it", () => {
  /** A fake akm in a folder with a space in its name, which prints the arguments it was given. */
  function spacedAkm(): { script: string; dir: string } {
    const root = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
    dirs.push(root);
    const dir = join(root, "checkout with spaces");
    mkdirSync(dir);
    const script = join(dir, "cli.ts");
    writeFileSync(script, ENV_AKM);
    return { script, dir };
  }

  test("AKM_BIN names a path with spaces in quotes, and akm runs", async () => {
    const { script } = spacedAkm();
    for (const bin of [`bun "${script}"`, `bun '${script}'`, `bun ${script.replaceAll(" ", "\\ ")}`]) {
      const sandbox = withEnv({ AKM_BIN: bin }, () => createSandbox("lib-akm-test"));
      sandboxes.push(sandbox);
      expect(sandbox.cmd).toEqual(["bun", script]);
      expect(JSON.parse((await runAkm(sandbox, ["args", "one", "two words"])).stdout)).toEqual(["one", "two words"]);
    }
  });

  test("--akm does the same, and AKM_BIN is left as the command it read, quoted as needed", async () => {
    const { script } = spacedAkm();
    const stop = (message: string): never => {
      throw new Error(message);
    };
    const env: Record<string, string | undefined> = {};
    useAkm({ akm: `bun "${script}"` }, stop, env);
    const sandbox = withEnv({ AKM_BIN: env.AKM_BIN }, () => createSandbox("lib-akm-test"));
    sandboxes.push(sandbox);
    expect(sandbox.cmd).toEqual(["bun", script]);
    expect(JSON.parse((await runAkm(sandbox, ["args", "x"])).stdout)).toEqual(["x"]);
    useAkm({ akm: `bun ~/"my code"/cli.ts` }, stop, env);
    expect(env.AKM_BIN).toBe(`bun '${homedir()}/my code/cli.ts'`);
  });

  test("akm_bin in a summary is the command as a line that reads back to the same words, with the home folder as ~", () => {
    const { script } = spacedAkm();
    const built = withEnv({ AKM_BIN: `bun "${script}"` }, akmBuild);
    expect(built.akm_bin).toBe(`bun '${written(script)}'`);
    expect(parseCommand(built.akm_bin)).toEqual(["bun", script]);
    expect(withEnv({ AKM_BIN: `bun "${homedir()}/my code/cli.ts"` }, akmBuild).akm_bin).toBe("bun '~/my code/cli.ts'");
    expect(withEnv({ AKM_BIN: "bun ~/code/akm/src/cli.ts" }, akmBuild).akm_bin).toBe("bun ~/code/akm/src/cli.ts");
  });

  test("a command with a quote that is not closed is refused, with the variable's name", () => {
    expect(() => withEnv({ AKM_BIN: 'bun "/tmp/a b/cli.ts' }, () => createSandbox("lib-akm-test"))).toThrow('AKM_BIN is not a command: the command has a " that is not closed');
    const refusals: string[] = [];
    const fail = (message: string): never => {
      refusals.push(message);
      throw new Error(message);
    };
    expect(() => useAkm({ akm: "bun 'x y" }, fail, {})).toThrow("--akm is not a command");
    expect(refusals).toHaveLength(1);
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

  test("links ONNX Runtime again in a folder whose cache was removed, as index-cache.ts removes a kept index's, and leaves a folder in its place (#147)", () => {
    const parent = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
    dirs.push(parent);
    const shared = join(import.meta.dir, "..", "..", ".cache", "onnxruntime");
    const dir = join(parent, "kept");
    const link = join(dir, "cache", "onnxruntime");
    sandboxIn(dir, { semantic: true });
    const fetched = `lib-akm-test-${process.pid}`;
    writeFileSync(join(link, fetched), "binding");
    try {
      rmSync(join(dir, "cache"), { recursive: true, force: true });
      expect(readFileSync(join(shared, fetched), "utf8")).toBe("binding"); // the link went, and the files it pointed to stayed
      sandboxIn(dir, { semantic: true }); // the folder has a config, so this is not writeConfig's link
      expect(readlinkSync(link)).toBe(shared);
      expect(readFileSync(join(link, fetched), "utf8")).toBe("binding");
    } finally {
      rmSync(join(shared, fetched), { force: true });
    }
    rmSync(link);
    mkdirSync(link);
    sandboxIn(dir, { semantic: true });
    expect(lstatSync(link).isDirectory()).toBe(true);
  });

  // akm lists the files of a bundle that is in a git repository with this command, in the bundle's folder, and walks the folder itself when it fails.
  test.skipIf(!Bun.which("git"))("does not let git climb out of the sandbox, so a repository above it that ignores its folder hides no asset from akm (#148)", () => {
    const repo = mkdtempSync(join(tmpdir(), "lib-akm-test-"));
    dirs.push(repo);
    expect(Bun.spawnSync(["git", "init", "-q"], { cwd: repo }).exitCode).toBe(0);
    writeFileSync(join(repo, ".gitignore"), "/tmp/\n"); // as a TMPDIR in a checkout's ignored folder
    const sandbox = sandboxIn(join(repo, "tmp", "sb"));
    expect(sandbox.env.GIT_CEILING_DIRECTORIES).toBe(sandbox.dir);
    mkdirSync(join(sandbox.dir, "bundle", "skills", "a"), { recursive: true });
    writeFileSync(join(sandbox.dir, "bundle", "skills", "a", "SKILL.md"), "a");
    // LC_ALL=C: git says why in English, whatever the caller's locale
    const list = (env: Record<string, string>) => Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], { cwd: join(sandbox.dir, "bundle"), env: { ...env, LC_ALL: "C" }, stdout: "pipe", stderr: "pipe" });
    const { GIT_CEILING_DIRECTORIES: _ceiling, ...without } = sandbox.env;
    const climbed = list(without);
    expect(climbed.exitCode).toBe(0);
    expect(climbed.stdout.toString()).toBe(""); // the repository ignores the sandbox: akm would index nothing
    const kept = list(sandbox.env);
    expect(kept.exitCode).not.toBe(0);
    expect(kept.stderr.toString()).toContain("not a git repository"); // so akm walks the bundle itself
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

  test("puts /chat/completions before the query and the fragment of an endpoint, as an Azure-style one has", () => {
    const endpoint = (base: string) => engineConfig(base, "m", false).engines.model.endpoint;
    expect(endpoint("https://r.openai.azure.com/openai/deployments/d?api-version=2024-10-21")).toBe("https://r.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-10-21");
    expect(endpoint("http://h/v1/?api-version=2024-10-21&x=1")).toBe("http://h/v1/chat/completions?api-version=2024-10-21&x=1");
    expect(endpoint("http://h/v1/chat/completions?api-version=2024-10-21")).toBe("http://h/v1/chat/completions?api-version=2024-10-21");
    expect(endpoint("http://h/v1#frag")).toBe("http://h/v1/chat/completions#frag");
    expect(endpoint("http://h?a=b")).toBe("http://h/chat/completions?a=b");
  });

  test("names the key by environment variable, only when there is one, and never holds it", () => {
    const keyed = withEnv({ MODEL_API_KEY: "model-secret" }, () => engineConfig("http://h/v1", "m", true));
    expect(keyed.engines.model.apiKey).toBe("$MODEL_API_KEY");
    expect(JSON.stringify(keyed)).not.toContain("model-secret");
    expect("apiKey" in engineConfig("http://h/v1", "m", false).engines.model).toBe(false);
  });

  test("takes the provider kind of the engine, openai unless told otherwise, and the endpoint is the same for every kind", () => {
    expect(engineConfig("http://h/v1", "m", false).engines.model.provider).toBe("openai");
    const kinds = ["anthropic", "gemini", "groq", "ollama", "lmstudio"].map((provider) => engineConfig("http://h/v1", "m", true, "judge", provider));
    expect(kinds.map((c) => c.engines.judge.provider)).toEqual(["anthropic", "gemini", "groq", "ollama", "lmstudio"]);
    for (const c of kinds) expect(c.engines.judge).toMatchObject({ kind: "llm", endpoint: "http://h/v1/chat/completions", model: "m", apiKey: "$MODEL_API_KEY", timeoutMs: 600_000 });
    // only the provider differs from the default config, in the same place, so a run that sets none compares with the runs before it
    const [plain, other] = [engineConfig("http://h/v1", "m", true), engineConfig("http://h/v1", "m", true, "model", "groq")];
    expect(Object.keys(other.engines.model)).toEqual(Object.keys(plain.engines.model));
    expect({ ...other, engines: { model: { ...other.engines.model, provider: "openai" } } }).toEqual(plain);
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

describe("atLeast", () => {
  const min = "0.9.25-alpha.2";
  test("puts a prerelease below its release and orders prereleases by their tag", () => {
    for (const v of ["0.9.25-alpha.2", "0.9.25-alpha.3", "0.9.25-alpha.10", "0.9.25-beta.1", "0.9.25-rc.1", "0.9.25", "0.9.26", "0.10.0", "1.0.0-alpha.1"]) expect(atLeast(v, min)).toBe(true);
    for (const v of ["0.9.25-alpha.1", "0.9.25-alpha", "0.9.24", "0.9.24-rc.1", "0.8.99"]) expect(atLeast(v, min)).toBe(false);
    expect(atLeast("0.9.25-alpha.2", "0.9.25")).toBe(false);
    expect(atLeast("0.9.25", "0.9.25")).toBe(true);
  });

  test("refuses a string that is not a version", () => {
    expect(() => atLeast("latest", min)).toThrow("not a version");
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

  test("says when the timeout killed the command, and only then", async () => {
    const sandbox = fakeSandbox();
    expect(await runAkm(sandbox, ["hang"], { timeoutMs: 300 })).toMatchObject({ code: 137, stderr: "akm timed out after 0.3s", timedOut: true });
    expect(await runAkm(sandbox, ["echo"])).toMatchObject({ code: 0, timedOut: false });
    expect(await runAkm(sandbox, ["fail"])).toMatchObject({ code: 3, timedOut: false });
  });

  test("ends the stderr of a command the timeout killed with why, after what it printed, so a caller that prints stderr says it", async () => {
    const sandbox = fakeSandbox();
    expect((await runAkm(sandbox, ["chatter"], { timeoutMs: 800 })).stderr).toBe("working on it\nakm timed out after 0.8s");
    const { stderr, code } = await runAkm(sandbox, ["hang"], { timeoutMs: 300 });
    expect(`akm index failed (exit ${code}): ${stderr.trim().slice(-300)}`).toBe("akm index failed (exit 137): akm timed out after 0.3s");
  });

  test("a command that dies of SIGKILL, or exits 137, before the timeout did not time out, and its stderr is its own", async () => {
    const sandbox = fakeSandbox();
    expect(await runAkm(sandbox, ["selfkill"], { timeoutMs: 60_000 })).toMatchObject({ code: 137, stderr: "", timedOut: false });
    expect(await runAkm(sandbox, ["exit137"], { timeoutMs: 60_000 })).toMatchObject({ code: 137, stderr: "", timedOut: false });
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

  test("throws that akm timed out, with the timeout in seconds, when the timeout killed it, not an exit code", async () => {
    const sandbox = fakeSandbox();
    await expect(runAkmJson(sandbox, ["hang"], { timeoutMs: 1000 })).rejects.toThrow("akm hang timed out after 1s");
    await expect(runAkmJson(sandbox, ["hang"], { timeoutMs: 300 })).rejects.toThrow("akm hang timed out after 0.3s");
    const e = await runAkmJson(sandbox, ["hang"], { timeoutMs: 300 }).catch((x: Error) => x);
    expect((e as Error).message).not.toContain("exit 137");
  });

  test("still calls an exit 137 that was not the timeout a failure", async () => {
    await expect(runAkmJson(fakeSandbox(), ["exit137"], { timeoutMs: 60_000 })).rejects.toThrow("akm exit137 failed (exit 137): ");
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
    const script = join(dir, "src", "cli.ts");
    const bin = commandLine(["bun", script]);
    expect(withEnv({ AKM_BIN: bin }, akmBuild)).toEqual({ akm_bin: commandLine(["bun", written(script)]), akm_build: sha, akm_build_fingerprint: null });
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
    const bin = commandLine([runtime.path, script.path]);
    expect(runtime.sha).not.toBe(script.sha);
    expect(withEnv({ AKM_BIN: bin }, akmBuild)).toEqual({ akm_bin: commandLine([written(runtime.path), written(script.path)]), akm_build: script.sha, akm_build_fingerprint: null });
  });

  test("has no build for a command outside a git checkout, and writes the home folder as ~", () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-akm-build-"));
    dirs.push(dir);
    writeFileSync(join(dir, "akm"), "");
    expect(withEnv({ AKM_BIN: commandLine([join(dir, "akm")]) }, akmBuild).akm_build).toBeNull();
    expect(withEnv({ AKM_BIN: `bun ${homedir()}/no/such/akm` }, akmBuild)).toEqual({ akm_bin: "bun ~/no/such/akm", akm_build: null, akm_build_fingerprint: null });
    expect(withEnv({ AKM_BIN: undefined }, akmBuild).akm_bin).toBe("akm");
  });

  test("writes a leading ~/ of AKM_BIN back as ~, the same whether or not it was expanded", () => {
    expect(withEnv({ AKM_BIN: "bun ~/no/such/akm" }, akmBuild)).toEqual({ akm_bin: "bun ~/no/such/akm", akm_build: null, akm_build_fingerprint: null });
  });

  describe("a release that npm installed is not the repository that holds its folder", () => {
    /** A repository of a tool that keeps installed software in its folder: the files it tracks, and what its .gitignore leaves out. One commit. */
    function toolRepo(name: string, tracked: Record<string, string>, ignored: string): { dir: string; sha: string } {
      const dir = mkdtempSync(join(tmpdir(), `lib-akm-${name}-`));
      dirs.push(dir);
      for (const [path, text] of Object.entries({ ...tracked, ".gitignore": ignored })) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      }
      for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", name]]) expect(git(dir, "-c", "commit.gpgsign=false", ...args).exitCode).toBe(0);
      return { dir, sha: git(dir, "rev-parse", "--short", "HEAD").stdout.toString().trim() };
    }

    /** An npm -g release of akm-cli under `prefix`, with bin/akm a link to its script. */
    function release(prefix: string): { script: string; link: string } {
      const pkg = join(prefix, "lib", "node_modules", "akm-cli");
      mkdirSync(join(pkg, "dist"), { recursive: true });
      mkdirSync(join(prefix, "bin"), { recursive: true });
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "akm-cli", version: "1.2.3" }));
      writeFileSync(join(pkg, "dist", "cli.js"), "");
      symlinkSync(join(pkg, "dist", "cli.js"), join(prefix, "bin", "akm"));
      return { script: join(pkg, "dist", "cli.js"), link: join(prefix, "bin", "akm") };
    }

    const build = (...words: string[]) => withEnv({ AKM_BIN: commandLine(words) }, akmBuild);

    test.skipIf(!Bun.which("git"))("under nvm: akm_build is null, for the link in bin and for node with the script", () => {
      const nvm = toolRepo("nvm", { "package.json": '{"name":"nvm"}', "nvm.sh": "" }, "versions/\n");
      const { script, link } = release(join(nvm.dir, "versions", "node", "v20.0.0"));
      expect(nvm.sha).toMatch(/^[0-9a-f]{7,}$/);
      for (const words of [[link], [join(nvm.dir, "versions", "node", "v20.0.0", "bin", "node"), script], ["bun", script]]) {
        expect(build(...words)).toEqual({ akm_bin: commandLine(words.map(written)), akm_build: null, akm_build_fingerprint: null });
      }
    });

    test.skipIf(!Bun.which("git"))("under Homebrew's repository, and in an ignored node_modules of a project: akm_build is null", () => {
      const brew = toolRepo("homebrew", { "bin/brew": "" }, "Cellar/\n");
      expect(build(release(join(brew.dir, "Cellar", "akm-cli", "1.2.3")).link).akm_build).toBeNull();
      const project = toolRepo("project", { "package.json": '{"name":"my-app"}', "src/index.ts": "" }, "node_modules/\n");
      const inModules = join(project.dir, "node_modules", "akm-cli", "dist");
      mkdirSync(inModules, { recursive: true });
      writeFileSync(join(inModules, "cli.js"), "");
      expect(build("node", join(inModules, "cli.js")).akm_build).toBeNull();
    });

    test.skipIf(!Bun.which("git"))("a runtime inside a repository is not the build when the script is outside any", () => {
      const nvm = toolRepo("nvm", { "package.json": '{"name":"nvm"}' }, "versions/\n");
      const node = join(nvm.dir, "versions", "node", "v20.0.0", "bin", "node");
      mkdirSync(dirname(node), { recursive: true });
      writeFileSync(node, "");
      const outside = mkdtempSync(join(tmpdir(), "lib-akm-outside-"));
      dirs.push(outside);
      writeFileSync(join(outside, "cli.js"), "");
      expect(build(node, join(outside, "cli.js")).akm_build).toBeNull();
    });

    test.skipIf(!Bun.which("git"))("a checkout of akm gives its describe, whether the script is tracked or is a build that git ignores", () => {
      const akm = toolRepo("akm", { "package.json": '{"name":"akm-cli"}', "src/cli.ts": "" }, "dist/\n");
      mkdirSync(join(akm.dir, "dist"));
      writeFileSync(join(akm.dir, "dist", "cli.js"), "");
      expect(build("bun", join(akm.dir, "src", "cli.ts")).akm_build).toBe(akm.sha); // tracked
      expect(build("node", join(akm.dir, "dist", "cli.js")).akm_build).toBe(akm.sha); // built, and the top folder holds the package akm-cli
      const monorepo = toolRepo("monorepo", { "package.json": '{"name":"tools"}', "packages/akm/cli.ts": "" }, "");
      expect(build("bun", join(monorepo.dir, "packages", "akm", "cli.ts")).akm_build).toBe(monorepo.sha); // another repository whose file git tracks
    });
  });

  describe("the fingerprint of a checkout with changes that are not committed", () => {
    /** A checkout of akm in a temporary repository: one commit with src/cli.ts and a .gitignore. */
    function checkout() {
      const dir = mkdtempSync(join(tmpdir(), "lib-akm-fingerprint-"));
      dirs.push(dir);
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "cli.ts"), "// the release\n");
      writeFileSync(join(dir, ".gitignore"), "ignored/\n*.log\n");
      for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "release"]]) expect(git(dir, "-c", "commit.gpgsign=false", ...args).exitCode).toBe(0);
      const script = join(dir, "src", "cli.ts");
      const bin = commandLine(["bun", script]);
      return {
        dir,
        bin,
        /** akm_bin as a summary writes it. */
        shown: commandLine(["bun", written(script)]),
        sha: git(dir, "rev-parse", "--short", "HEAD").stdout.toString().trim(),
        write: (path: string, content: string | Uint8Array) => {
          mkdirSync(dirname(join(dir, path)), { recursive: true });
          writeFileSync(join(dir, path), content);
        },
        build: () => withEnv({ AKM_BIN: bin }, akmBuild),
      };
    }

    test.skipIf(!Bun.which("git"))("a clean checkout and a command outside git have none, and the build says the commit", () => {
      const akm = checkout();
      expect(akm.build()).toEqual({ akm_bin: akm.shown, akm_build: akm.sha, akm_build_fingerprint: null });
      const outside = mkdtempSync(join(tmpdir(), "lib-akm-fingerprint-"));
      dirs.push(outside);
      writeFileSync(join(outside, "akm"), "");
      expect(withEnv({ AKM_BIN: commandLine([join(outside, "akm")]) }, akmBuild).akm_build_fingerprint).toBeNull();
    });

    test.skipIf(!Bun.which("git"))("two different edits at one commit have the same build and two fingerprints, and the same edit has the same one", () => {
      const akm = checkout();
      akm.write("src/cli.ts", "// edit one\n");
      const one = akm.build();
      expect(one.akm_build).toBe(`${akm.sha}-dirty`);
      expect(one.akm_build_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(akm.build()).toEqual(one); // asked again

      akm.write("src/cli.ts", "// edit two\n");
      const two = akm.build();
      expect(two.akm_build).toBe(one.akm_build); // `git describe` cannot tell them apart
      expect(two.akm_build_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(two.akm_build_fingerprint).not.toBe(one.akm_build_fingerprint);

      akm.write("src/cli.ts", "// edit one\n"); // back to the first edit
      expect(akm.build()).toEqual(one);
      expect(git(akm.dir, "add", "-A").exitCode).toBe(0); // staged, not only in the working tree: the same changes
      expect(akm.build()).toEqual(one);

      git(akm.dir, "checkout", "HEAD", "--", "src/cli.ts"); // reverted
      expect(akm.build()).toEqual({ akm_bin: akm.shown, akm_build: akm.sha, akm_build_fingerprint: null });
    });

    test.skipIf(!Bun.which("git"))("a file that is not tracked counts: its presence, its path and its content, though git calls the checkout clean", () => {
      const akm = checkout();
      akm.write("src/new.ts", "// new source\n");
      const added = akm.build();
      expect(added.akm_build).toBe(akm.sha); // `git describe --dirty` does not see an untracked file
      expect(added.akm_build_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      akm.write("src/new.ts", "// other new source\n");
      const edited = akm.build();
      expect(edited.akm_build_fingerprint).not.toBe(added.akm_build_fingerprint);
      rmSync(join(akm.dir, "src", "new.ts"));
      akm.write("src/renamed.ts", "// other new source\n");
      expect(akm.build().akm_build_fingerprint).not.toBe(edited.akm_build_fingerprint);
      rmSync(join(akm.dir, "src", "renamed.ts"));
      expect(akm.build().akm_build_fingerprint).toBeNull();
    });

    test.skipIf(!Bun.which("git"))("an ignored file does not count, and an edit with an untracked file differs from the edit alone", () => {
      const akm = checkout();
      akm.write("ignored/cache.bin", "whatever");
      akm.write("run.log", "lines");
      expect(akm.build().akm_build_fingerprint).toBeNull();
      akm.write("src/cli.ts", "// edit\n");
      const edit = akm.build().akm_build_fingerprint;
      akm.write("ignored/cache.bin", "something else");
      expect(akm.build().akm_build_fingerprint).toBe(edit);
      akm.write("extra.ts", "// beside it\n");
      expect(akm.build().akm_build_fingerprint).not.toBe(edit);
    });

    test.skipIf(!Bun.which("git"))("a change to a binary file counts", () => {
      const akm = checkout();
      akm.write("model.bin", new Uint8Array([0, 1, 2, 255]));
      expect(git(akm.dir, "add", "model.bin").exitCode).toBe(0);
      expect(git(akm.dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "binary").exitCode).toBe(0);
      expect(akm.build().akm_build_fingerprint).toBeNull();
      akm.write("model.bin", new Uint8Array([0, 1, 2, 254]));
      const one = akm.build().akm_build_fingerprint;
      akm.write("model.bin", new Uint8Array([0, 1, 2, 253]));
      expect(one).not.toBeNull();
      expect(akm.build().akm_build_fingerprint).not.toBe(one);
    });
  });
});

describe("a relative path in AKM_BIN or --akm", () => {
  /** A folder with a fake akm as src/cli.ts and as an executable akm.sh, and a file named run. f runs with it as the working folder. */
  async function inFolder(f: (here: string) => Promise<void> | void): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), "lib-akm-relative-"));
    dirs.push(dir);
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "cli.ts"), FAKE_AKM);
    writeFileSync(join(dir, "akm.sh"), "#!/bin/sh\necho akm 0.9.88-test\n");
    chmodSync(join(dir, "akm.sh"), 0o755);
    writeFileSync(join(dir, "run"), "");
    const before = process.cwd();
    process.chdir(dir);
    try {
      await f(process.cwd());
    } finally {
      process.chdir(before);
    }
  }

  const sandboxFor = (bin: string): Sandbox => {
    const sandbox = withEnv({ AKM_BIN: bin }, () => createSandbox("lib-akm-test"));
    sandboxes.push(sandbox);
    return sandbox;
  };

  test("AKM_BIN names a script by a relative path, and akm runs although it runs in the sandbox's folder", async () => {
    await inFolder(async (here) => {
      const script = sandboxFor("bun src/cli.ts");
      expect(script.cmd).toEqual(["bun", join(here, "src", "cli.ts")]);
      expect(await akmVersion(script)).toBe("0.9.99-test");
      const program = sandboxFor("./akm.sh");
      expect(program.cmd).toEqual([join(here, "akm.sh")]);
      expect(await akmVersion(program)).toBe("0.9.88-test");
      expect(withEnv({ AKM_BIN: "bun ./src/cli.ts" }, akmBuild).akm_bin).toBe(commandLine(["bun", written(join(here, "src", "cli.ts"))]));
    });
  });

  test("--akm does the same, and AKM_BIN is set to the absolute command", async () => {
    await inFolder(async (here) => {
      const stop = (message: string): never => {
        throw new Error(message);
      };
      const env: Record<string, string | undefined> = {};
      useAkm({ akm: "bun ./src/cli.ts" }, stop, env);
      expect(env.AKM_BIN).toBe(commandLine(["bun", join(here, "src", "cli.ts")]));
      expect(await akmVersion(sandboxFor(env.AKM_BIN as string))).toBe("0.9.99-test");
      useAkm({ akm: "bun ./src/cli.ts --flag=a/b" }, stop, env); // a flag is not a path
      expect(env.AKM_BIN).toBe(commandLine(["bun", join(here, "src", "cli.ts"), "--flag=a/b"]));
    });
  });

  test("a word that is not a path to a file of the folder stays as it is: a command, a subcommand, a package, a flag, a path that is not there", () => {
    return inFolder((here) => {
      expect(sandboxFor("akm").cmd).toEqual(["akm"]);
      expect(sandboxFor("bun run").cmd).toEqual(["bun", "run"]); // a file named run is in the folder
      expect(sandboxFor("npx @scope/akm-cli --root ../elsewhere/x").cmd).toEqual(["npx", "@scope/akm-cli", "--root", "../elsewhere/x"]);
      expect(sandboxFor("bun /abs/cli.ts").cmd).toEqual(["bun", "/abs/cli.ts"]);
      expect(sandboxFor("./not-there/akm").cmd).toEqual([join(here, "not-there", "akm")]); // a command with a / is a path, here or not
    });
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
