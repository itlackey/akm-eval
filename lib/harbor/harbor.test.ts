import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { credentialField, sha256Text } from "../provenance.ts";
import { spreadOf } from "../repeat.ts";
import {
  FIXED_AKM_ENV,
  LOCKS_DIR,
  PINS,
  type AkmArm,
  type Completion,
  type Pack,
  PLUGIN_ERROR,
  akmArm,
  type RunTrial,
  akmSummary,
  assetsSha256,
  buildFingerprint,
  checkoutBuild,
  completionOf,
  erroredOf,
  findPlugin,
  hostEnv,
  jobConfig,
  jobRecord,
  loadRunTrials,
  lockFolder,
  metricsOf,
  modelName,
  modelSettings,
  npmPack,
  packAkm,
  parseAkm,
  parseAkmEnv,
  pinsOf,
  positive,
  relativePaths,
  releaseArm,
  sha256Dir,
  slug,
  stagePackages,
  statusOf,
  timeoutsOf,
  withHome,
} from "./harbor.ts";
import { buildReport, formatReport, sideBySide } from "./report.ts";
import { loadTrials } from "./trials.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "harbor-test-"));
  dirs.push(d);
  return d;
};
const put = (file: string, text: string): void => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};

describe("modelName", () => {
  test("keeps a name that has a provider and reads one without as an openai model", () => {
    expect(modelName("openai/gpt-6-luna")).toBe("openai/gpt-6-luna");
    expect(modelName("gpt-6-luna")).toBe("openai/gpt-6-luna");
    expect(modelName("anthropic/claude-sonnet-4-5")).toBe("anthropic/claude-sonnet-4-5");
  });
});

describe("modelSettings", () => {
  const none = {}; // no models.json

  test("sends an openai model to the gateway in MODEL_BASE_URL, with MODEL_API_KEY, as opencode's openai provider reads them", () => {
    const r = modelSettings(undefined, { MODEL_NAME: "gpt-6-luna", MODEL_API_KEY: "k1", MODEL_BASE_URL: "http://192.0.2.5:8080/v1", PATH: "/bin" }, none);
    expect(r.model).toBe("openai/gpt-6-luna");
    expect(r.env).toEqual({ OPENAI_API_KEY: "k1", OPENAI_BASE_URL: "http://192.0.2.5:8080/v1", PATH: "/bin" });
  });

  test("takes the model from --model over MODEL_NAME, as the id the gateway knows", () => {
    const host = { MODEL_NAME: "from-env", MODEL_API_KEY: "k", MODEL_BASE_URL: "http://192.0.2.5/v1" };
    expect(modelSettings("from-flag", host, none).model).toBe("openai/from-flag");
    expect(modelSettings(undefined, host, none).model).toBe("openai/from-env");
    expect(() => modelSettings("  ", host, none)).toThrow("--model needs a model name");
  });

  test("sends a model that has a line in models.json to that line's endpoint, with that line's key, and not to the gateway", () => {
    const lines = { "my-cloud-model": { model: "gpt-5.6-terra", base_url: "https://api.example.com/v1", api_key_env: "CLOUD_KEY" } };
    const host = { MODEL_BASE_URL: "http://192.0.2.5/v1", MODEL_API_KEY: "gateway-key", MODEL_NAME: "other", CLOUD_KEY: "cloud-secret", JUDGE_API_KEY: "judge" };
    const r = modelSettings("my-cloud-model", host, lines);
    expect(r.model).toBe("openai/gpt-5.6-terra");
    expect(r.env).toEqual({ OPENAI_API_KEY: "cloud-secret", OPENAI_BASE_URL: "https://api.example.com/v1" });
    expect(Object.values(r.env)).not.toContain("gateway-key");
    expect(() => modelSettings("my-cloud-model", { MODEL_BASE_URL: "http://192.0.2.5/v1" }, lines)).toThrow('takes its key from CLOUD_KEY');
    // A line needs no gateway: the run takes its endpoint from the line alone.
    expect(modelSettings("my-cloud-model", { CLOUD_KEY: "c" }, lines).env.OPENAI_BASE_URL).toBe("https://api.example.com/v1");
  });

  test("passes on only what Harbor, uv and Docker need, and never the judge's key or the keys of other providers", () => {
    const host = {
      MODEL_NAME: "openai/x",
      MODEL_API_KEY: "k",
      MODEL_BASE_URL: "http://192.0.2.5/v1",
      JUDGE_API_KEY: "judge-secret",
      JUDGE_BASE_URL: "http://judge/v1",
      AKM_BIN: "bun ~/akm/src/cli.ts",
      ANTHROPIC_API_KEY: "a",
      GITHUB_TOKEN: "g",
      PATH: "/bin",
      HOME: "/home/me",
      DOCKER_HOST: "unix:///run/docker.sock",
      UV_CACHE_DIR: "/c",
      HTTPS_PROXY: "http://proxy:3128",
      no_proxy: "localhost",
      XDG_RUNTIME_DIR: "/run/user/1000",
    };
    const r = modelSettings(undefined, host, none);
    expect(Object.keys(r.env).sort()).toEqual(["DOCKER_HOST", "HOME", "HTTPS_PROXY", "OPENAI_API_KEY", "OPENAI_BASE_URL", "PATH", "UV_CACHE_DIR", "XDG_RUNTIME_DIR", "no_proxy"]);
    expect(JSON.stringify(r.env)).not.toContain("judge-secret");
    expect(hostEnv({ PATH: "/bin", MODEL_API_KEY: "k", JUDGE_API_KEY: "j", DOCKER_CONFIG: "/d", LC_ALL: "C" })).toEqual({ PATH: "/bin", DOCKER_CONFIG: "/d", LC_ALL: "C" });
  });

  test("reads OPENAI_BASE_URL and OPENAI_API_KEY as the older names of the gateway, and lets MODEL_* win when both are set", () => {
    const r = modelSettings(undefined, { MODEL_NAME: "x", OPENAI_API_KEY: "a", OPENAI_BASE_URL: "http://192.0.2.5/v1" }, none);
    expect(r.env).toMatchObject({ OPENAI_API_KEY: "a", OPENAI_BASE_URL: "http://192.0.2.5/v1" });
    const both = modelSettings(undefined, { MODEL_NAME: "x", MODEL_API_KEY: "m", MODEL_BASE_URL: "http://m/v1", OPENAI_API_KEY: "a", OPENAI_BASE_URL: "http://o/v1" }, none);
    expect(both.env).toMatchObject({ OPENAI_API_KEY: "m", OPENAI_BASE_URL: "http://m/v1" });
  });

  test("lets each of the older names stand in for its empty MODEL_* one, the key only for the URL it goes with", () => {
    // OPENAI_BASE_URL with only MODEL_API_KEY: the new key for the older URL.
    expect(modelSettings("gpt-6", { OPENAI_BASE_URL: "http://192.0.2.5/v1", MODEL_API_KEY: "m" }, none).env).toEqual({ OPENAI_API_KEY: "m", OPENAI_BASE_URL: "http://192.0.2.5/v1" });
    // OPENAI_BASE_URL with OPENAI_API_KEY, and an empty MODEL_API_KEY that does not hide it: the pair from before models.json.
    expect(modelSettings("gpt-6", { OPENAI_BASE_URL: "http://192.0.2.5/v1", MODEL_API_KEY: "  ", OPENAI_API_KEY: "a" }, none).env).toEqual({ OPENAI_API_KEY: "a", OPENAI_BASE_URL: "http://192.0.2.5/v1" });
    // MODEL_BASE_URL set to OpenAI's own endpoint, or to the same URL as OPENAI_BASE_URL, takes OPENAI_API_KEY too.
    expect(modelSettings("gpt-6", { MODEL_BASE_URL: "https://api.openai.com/v1", OPENAI_API_KEY: "a" }, none).env).toEqual({ OPENAI_API_KEY: "a", OPENAI_BASE_URL: "https://api.openai.com/v1" });
    expect(modelSettings("gpt-6", { MODEL_BASE_URL: "http://192.0.2.5/v1", OPENAI_BASE_URL: "http://192.0.2.5/v1", OPENAI_API_KEY: "a" }, none).env.OPENAI_API_KEY).toBe("a");
    // A model with a line in models.json still takes the key of the line, and never the older name of the gateway's.
    const lines = { cloud: { base_url: "https://api.example.com/v1", api_key_env: "CLOUD_KEY" } };
    expect(() => modelSettings("cloud", { MODEL_BASE_URL: "http://192.0.2.5/v1", OPENAI_API_KEY: "a" }, lines)).toThrow("takes its key from CLOUD_KEY");
    // And with no key under either name the run still stops.
    expect(() => modelSettings("gpt-6", { MODEL_BASE_URL: "http://192.0.2.5/v1", OPENAI_BASE_URL: "http://o/v1" }, none)).toThrow("no model key");
  });

  test("never sends OPENAI_API_KEY to a gateway that is not OpenAI's and not the one OPENAI_BASE_URL names (#72)", () => {
    const key = "sk-real-openai-key";
    // The probe: MODEL_API_KEY is empty, and MODEL_BASE_URL is another host. The run stops, as the other evals' do, and says nothing of the key.
    for (const host of [
      { MODEL_BASE_URL: "https://gw.example.net/v1", OPENAI_API_KEY: key },
      { MODEL_BASE_URL: "https://gw.example.net/v1", MODEL_API_KEY: "  ", OPENAI_API_KEY: key },
      { MODEL_BASE_URL: "https://gw.example.net/v1", OPENAI_BASE_URL: "https://other.example.net/v1", OPENAI_API_KEY: key },
      { MODEL_BASE_URL: "https://api.openai.com.evil.example/v1", OPENAI_API_KEY: key },
    ]) {
      let said = "";
      try {
        modelSettings("gpt-6", host, none);
      } catch (e) {
        said = (e as Error).message;
      }
      expect(said).toContain("no model key for openai/gpt-6");
      expect(said).not.toContain(key);
    }
    // With a key of its own, the gateway gets that key and never OpenAI's.
    const own = modelSettings("gpt-6", { MODEL_BASE_URL: "https://gw.example.net/v1", MODEL_API_KEY: "gateway-key", OPENAI_API_KEY: key }, none);
    expect(own.env).toEqual({ OPENAI_API_KEY: "gateway-key", OPENAI_BASE_URL: "https://gw.example.net/v1" });
    // OpenAI's key still goes to OpenAI, and to the URL it was set beside.
    expect(modelSettings("gpt-6", { MODEL_BASE_URL: "https://api.openai.com/v1", OPENAI_API_KEY: key }, none).env.OPENAI_API_KEY).toBe(key);
    expect(modelSettings("gpt-6", { OPENAI_BASE_URL: "https://gw.example.net/v1", OPENAI_API_KEY: key }, none).env).toEqual({ OPENAI_API_KEY: key, OPENAI_BASE_URL: "https://gw.example.net/v1" });
  });

  test("with no gateway and no line, an openai model goes to openai with OPENAI_API_KEY, or MODEL_API_KEY", () => {
    const r = modelSettings(undefined, { MODEL_NAME: "openai/x", OPENAI_API_KEY: "a", MODEL_API_KEY: "b" }, none);
    expect(r.env.OPENAI_API_KEY).toBe("a");
    expect(r.env.OPENAI_BASE_URL).toBeUndefined();
    expect(modelSettings(undefined, { MODEL_NAME: "x", MODEL_API_KEY: "b" }, none).env.OPENAI_API_KEY).toBe("b");
  });

  test("gives opencode a gateway's model id as the openai provider's, with a slash in it or not (#73)", () => {
    const gateway = { MODEL_API_KEY: "k", MODEL_BASE_URL: "https://gateway.example.com/v1" };
    // The id is the gateway's, as in the other evals: a slash is part of the id and not a provider.
    for (const [id, want] of [
      ["Qwen/Qwen2.5-7B", "openai/Qwen/Qwen2.5-7B"],
      ["meta-llama/Llama-3.1-8B-Instruct", "openai/meta-llama/Llama-3.1-8B-Instruct"],
      ["anthropic/claude-sonnet-4-5", "openai/anthropic/claude-sonnet-4-5"],
      ["gpt-6-luna", "openai/gpt-6-luna"],
      ["openai/gpt-6-luna", "openai/gpt-6-luna"],
    ]) {
      const r = modelSettings(id, gateway, none);
      expect(r.model, id).toBe(want);
      expect(r.env, id).toEqual({ OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://gateway.example.com/v1" });
    }
    expect(modelSettings(undefined, { ...gateway, MODEL_NAME: "Qwen/Qwen2.5-7B" }, none).model).toBe("openai/Qwen/Qwen2.5-7B");
    // The model of a models.json line, which may have a slash in the name the endpoint expects, goes to opencode the same way.
    const lines = { alias: { model: "groq/llama-4", base_url: "https://api.example.com/v1", api_key_env: "K" }, plain: { base_url: "https://api.example.com/v1", api_key_env: "K" } };
    expect(modelSettings("alias", { K: "k" }, lines)).toEqual({ model: "openai/groq/llama-4", env: { OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://api.example.com/v1" } });
    expect(modelSettings("plain", { K: "k" }, lines).model).toBe("openai/plain");
  });

  test("finds the models.json line for --model openai/<line>, as for <line> (#73)", () => {
    const lines = { "my-cloud-model": { model: "gpt-5.6-terra", base_url: "https://api.example.com/v1", api_key_env: "CLOUD_KEY" } };
    const host = { MODEL_BASE_URL: "http://192.0.2.5/v1", MODEL_API_KEY: "gateway-key", CLOUD_KEY: "cloud-secret" };
    const want = { model: "openai/gpt-5.6-terra", env: { OPENAI_API_KEY: "cloud-secret", OPENAI_BASE_URL: "https://api.example.com/v1" } };
    expect(modelSettings("my-cloud-model", host, lines)).toEqual(want);
    expect(modelSettings("openai/my-cloud-model", host, lines)).toEqual(want);
    expect(modelSettings(undefined, { ...host, MODEL_NAME: "openai/my-cloud-model" }, lines)).toEqual(want);
    // A line named with the prefix is found by that name first, and an openai model that has no line still goes to the gateway.
    const prefixed = { "openai/my-cloud-model": { base_url: "https://api.example.org/v1", api_key_env: "CLOUD_KEY" } };
    expect(modelSettings("openai/my-cloud-model", host, prefixed).env.OPENAI_BASE_URL).toBe("https://api.example.org/v1");
    expect(modelSettings("openai/other", host, lines).env.OPENAI_BASE_URL).toBe("http://192.0.2.5/v1");
  });

  test("leaves another provider's key to Harbor, and passes on that provider's variables only", () => {
    const r = modelSettings(undefined, { MODEL_NAME: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "a", ANTHROPIC_BASE_URL: "https://x", OPENAI_API_KEY: "o", MODEL_API_KEY: "m", PATH: "/bin" }, none);
    expect(r.model).toBe("anthropic/claude-sonnet-4-5");
    expect(r.env).toEqual({ ANTHROPIC_API_KEY: "a", ANTHROPIC_BASE_URL: "https://x", PATH: "/bin" });
    expect(modelSettings(undefined, { MODEL_NAME: "google/gemini-2.5-pro", GEMINI_API_KEY: "g", GOOGLE_CLOUD_PROJECT: "p" }, none).env).toEqual({ GEMINI_API_KEY: "g", GOOGLE_CLOUD_PROJECT: "p" });
    expect(modelSettings(undefined, { MODEL_NAME: "amazon-bedrock/x", AWS_REGION: "r" }, none).env).toEqual({ AWS_REGION: "r" });
  });

  test("stops without a model name, without a key, or with an endpoint a container cannot reach", () => {
    expect(() => modelSettings(undefined, { MODEL_API_KEY: "k" }, none)).toThrow("name the model");
    expect(() => modelSettings(undefined, { MODEL_NAME: "x" }, none)).toThrow("no model key");
    expect(() => modelSettings(undefined, { MODEL_NAME: "x", MODEL_BASE_URL: "http://192.0.2.5/v1" }, none)).toThrow("no model key");
    expect(() => modelSettings(undefined, { MODEL_NAME: "x", MODEL_API_KEY: "k", MODEL_BASE_URL: "http://localhost:8080/v1" }, none)).toThrow("container");
    expect(() => modelSettings(undefined, { MODEL_NAME: "x", MODEL_API_KEY: "k", MODEL_BASE_URL: "http://127.0.0.1:1/v1" }, none)).toThrow("container");
  });

  test("a keyless local server is run as the READMEs say: any non-empty MODEL_API_KEY, and an address a container can reach", () => {
    const server = { MODEL_NAME: "my-local-model", MODEL_BASE_URL: "http://192.168.1.20:8080/v1" };
    expect(modelSettings(undefined, { ...server, MODEL_API_KEY: "unused" }, none)).toEqual({ model: "openai/my-local-model", env: { OPENAI_API_KEY: "unused", OPENAI_BASE_URL: "http://192.168.1.20:8080/v1" } });
    expect(() => modelSettings(undefined, server, none)).toThrow("no model key"); // the rule is not relaxed for a server that wants none
    expect(() => modelSettings(undefined, { ...server, MODEL_API_KEY: "" }, none)).toThrow("no model key");
    expect(() => modelSettings(undefined, { ...server, MODEL_API_KEY: "unused", MODEL_BASE_URL: "http://localhost:8080/v1" }, none)).toThrow("the container itself");
  });
});

describe("positive", () => {
  test("reads a positive integer, leaves a flag that is not given, and names the flag it refuses", () => {
    expect(positive("--repeat", undefined)).toBeUndefined();
    expect(positive("--repeat", "3")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "x", ""]) expect(() => positive("--attempts", bad)).toThrow("--attempts must be a positive integer");
  });
});

// ---- the akm under test -----------------------------------------------------------------------------------------------------

describe("parseAkm", () => {
  test("is the pinned release without the flag, and any exact release by name", () => {
    expect(parseAkm(undefined)).toEqual({ kind: "release", version: PINS.akm_cli });
    expect(parseAkm("akm-cli@0.9.27")).toEqual({ kind: "release", version: "0.9.27" });
    expect(parseAkm(" akm-cli@0.10.0-alpha.2 ")).toEqual({ kind: "release", version: "0.10.0-alpha.2" });
  });

  test("is the folder of a checkout, with ~ for your home folder", () => {
    const dir = tmp();
    expect(parseAkm(dir)).toEqual({ kind: "checkout", path: dir });
    expect(parseAkm("~")).toEqual({ kind: "checkout", path: homedir() });
  });

  test("refuses a spec that moves, a command, a folder that is not there and nothing", () => {
    for (const moving of ["akm-cli@latest", "akm-cli", "akm-cli@^0.9.0", "akm-cli@0.9"]) expect(() => parseAkm(moving)).toThrow("exact release");
    expect(() => parseAkm("bun ~/code/akm/src/cli.ts")).toThrow("is a command, and the akm arm runs in a container");
    expect(() => parseAkm("/no/such/akm-checkout")).toThrow("neither akm-cli@x.y.z nor a folder");
    expect(() => parseAkm("  ")).toThrow("--akm needs");
  });
});

describe("withHome", () => {
  test("writes the home folder as ~", () => {
    expect(withHome(`${homedir()}/code/akm`)).toBe("~/code/akm");
    expect(withHome(homedir())).toBe("~");
    expect(withHome("/opt/akm")).toBe("/opt/akm");
  });
});

/** A checkout with the file its bin names, and optionally the plugin a few levels down. */
function checkout(opts: { bin?: boolean; plugin?: boolean; name?: string } = {}): string {
  const dir = tmp();
  put(join(dir, "package.json"), JSON.stringify({ name: opts.name ?? "akm-cli", version: "0.9.27", bin: { akm: "./dist/cli.js" } }));
  put(join(dir, "src", "cli.ts"), "export {};\n");
  if (opts.bin !== false) put(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\n");
  if (opts.plugin) {
    put(join(dir, "packages", "opencode", "package.json"), JSON.stringify({ name: "akm-opencode", version: "0.9.27-plugin" }));
    put(join(dir, "packages", "opencode", "index.js"), "export {};\n");
    put(join(dir, "node_modules", "akm-opencode", "package.json"), JSON.stringify({ name: "akm-opencode", version: "0.0.1" })); // never read
  }
  return dir;
}

/** npm pack without npm: the folder, under package/, in a tarball named as npm names it. */
const fakePack: Pack = (dir, into) => {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const stage = tmp();
  cpSync(dir, join(stage, "package"), { recursive: true });
  rmSync(join(stage, "package", "node_modules"), { recursive: true, force: true });
  const file = `${pkg.name}-${pkg.version}.tgz`;
  const done = Bun.spawnSync(["tar", "-czf", join(into, file), "-C", stage, "package"]);
  if (done.exitCode !== 0) throw new Error(done.stderr.toString());
  return file;
};

describe("packAkm", () => {
  test("packs a checkout into a tarball of akm-cli, keeps the pinned plugin and says so", () => {
    const into = join(tmp(), "pack");
    const { arm, note } = packAkm(checkout(), into, fakePack);
    expect(arm.cli).toEqual({ version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" });
    expect(arm.plugin).toEqual({ version: PINS.akm_plugin, tarball: null });
    expect(arm.packages).toBe(into);
    expect(arm.build).toBeNull(); // not a git checkout
    expect(existsSync(join(into, "akm-cli-0.9.27.tgz"))).toBe(true);
    expect(note).toContain(`keeps the pinned plugin ${PINS.akm_plugin}`);
    expect(note).toContain(`carries its own akm-cli ${PINS.akm_cli}`);
    expect(note).toContain("Its dependencies are not locked");
  });

  test("packs the plugin too when the checkout holds it, a few folders down and not in node_modules", () => {
    const dir = checkout({ plugin: true });
    expect(findPlugin(dir)).toBe(join(dir, "packages", "opencode"));
    const { arm, note } = packAkm(dir, join(tmp(), "pack"), fakePack);
    expect(arm.plugin).toEqual({ version: "0.9.27-plugin", tarball: "akm-opencode-0.9.27-plugin.tgz" });
    expect(note).toContain("Its dependencies are not locked"); // a checkout has no lockfile, and the run says so
    expect(note).not.toContain("holds no plugin");
    expect(findPlugin(checkout())).toBeNull();
  });

  test("names the checkout by its folder with ~ for home and its git build, dirty when it has changes", () => {
    const dir = checkout();
    const git = (...args: string[]) => Bun.spawnSync(["git", "-C", dir, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { stdout: "pipe", stderr: "pipe" });
    expect(git("init", "-q").exitCode).toBe(0);
    git("add", "-A");
    expect(git("commit", "-q", "-m", "one").exitCode).toBe(0);
    const sha = git("rev-parse", "--short", "HEAD").stdout.toString().trim();
    expect(checkoutBuild(dir)).toBe(sha);
    expect(packAkm(dir, join(tmp(), "pack"), fakePack).arm.build).toBe(sha);
    expect(packAkm(dir, join(tmp(), "pack"), fakePack).arm.build_fingerprint).toBeNull(); // a clean checkout has no changes to fingerprint
    writeFileSync(join(dir, "src", "cli.ts"), "export const changed = 1;\n");
    expect(checkoutBuild(dir)).toBe(`${sha}-dirty`);
    const edited = packAkm(dir, join(tmp(), "pack"), fakePack).arm;
    expect(edited.bin).toBe(withHome(dir)); // ~ when the temporary folder is under your home folder, and the path as it is when not
    expect(edited.build_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // The same commit with another edit has the same build and another fingerprint.
    writeFileSync(join(dir, "src", "cli.ts"), "export const changed = 2;\n");
    const again = packAkm(dir, join(tmp(), "pack"), fakePack).arm;
    expect(again.build).toBe(edited.build);
    expect(again.build_fingerprint).not.toBe(edited.build_fingerprint);
  });

  test("packs into a relative folder as into the absolute one, since npm pack runs in the checkout and would read it from there", () => {
    const seen: string[] = [];
    const pack: Pack = (dir, into) => {
      seen.push(into);
      return fakePack(dir, into);
    };
    const into = join(tmp(), "pack");
    const { arm } = packAkm(checkout({ plugin: true }), relative(process.cwd(), into), pack);
    expect(seen).toEqual([into, into]);
    expect(arm.packages).toBe(into);
    expect(existsSync(join(into, "akm-opencode-0.9.27-plugin.tgz"))).toBe(true);
  });

  test("refuses a folder that is not akm-cli's, and a checkout that has not been built", () => {
    expect(() => packAkm(checkout({ name: "something-else" }), join(tmp(), "p"), fakePack)).toThrow("is not an akm checkout");
    expect(() => packAkm(tmp(), join(tmp(), "p"), fakePack)).toThrow("is not an akm checkout");
    expect(() => packAkm(checkout({ bin: false }), join(tmp(), "p"), fakePack)).toThrow("lacks ./dist/cli.js, which its package.json names as a bin. Build the checkout first");
  });

  test.skipIf(!Bun.which("npm"))("with the real npm pack, makes the tarball npm names and puts the files in it", () => {
    const dir = checkout();
    const into = tmp();
    const file = npmPack(dir, into);
    expect(file).toBe("akm-cli-0.9.27.tgz");
    const listed = Bun.spawnSync(["tar", "-tzf", join(into, file)]).stdout.toString();
    expect(listed).toContain("package/dist/cli.js");
    expect(packAkm(dir, join(tmp(), "pack")).arm.cli.tarball).toBe("akm-cli-0.9.27.tgz");
    expect(packAkm(dir, relative(process.cwd(), join(tmp(), "pack"))).arm.cli.tarball).toBe("akm-cli-0.9.27.tgz"); // a relative folder too
  });
});

describe("akmArm", () => {
  test("is the pinned release without the flag, and says nothing", () => {
    const { arm, note } = akmArm(undefined, join(tmp(), "p"), fakePack);
    expect(arm).toEqual(releaseArm());
    expect(arm.bin).toBe(`akm-cli@${PINS.akm_cli}`);
    expect(note).toBeNull();
  });

  test("is another release with the pinned plugin, and says the plugin carries its own akm-cli", () => {
    const { arm, note } = akmArm("akm-cli@0.9.27", join(tmp(), "p"), fakePack);
    expect(arm.cli).toEqual({ version: "0.9.27", tarball: null });
    expect(arm.bin).toBe("akm-cli@0.9.27");
    expect(arm.build).toBeNull();
    expect(arm.packages).toBeNull();
    expect(note).toContain("only the akm it shells out to is the one under test");
    expect(note).toContain("Its dependencies are not locked"); // no lockfile is committed for 0.9.27
  });

  test("packs a checkout", () => {
    const { arm } = akmArm(checkout(), join(tmp(), "p"), fakePack);
    expect(arm.cli.tarball).toBe("akm-cli-0.9.27.tgz");
  });
});

describe("stagePackages", () => {
  test("copies the tarballs into the run's folder and digests them, and does nothing for a release", () => {
    const { arm } = packAkm(checkout({ plugin: true }), join(tmp(), "pack"), fakePack);
    const run = tmp();
    const staged = stagePackages(arm, run);
    expect(staged?.dir).toBe(join(run, "akm-packages"));
    expect(staged?.files.map((f) => f.file)).toEqual(["akm-cli-0.9.27.tgz", "akm-opencode-0.9.27-plugin.tgz"]);
    for (const f of staged?.files ?? []) {
      expect(existsSync(join(run, "akm-packages", f.file))).toBe(true);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(stagePackages(releaseArm(), tmp())).toBeNull();
  });
});

describe("parseAkmEnv", () => {
  test("reads KEY=VALUE pairs, keeps an = inside a value and allows an empty value", () => {
    expect(parseAkmEnv(undefined)).toEqual({});
    expect(parseAkmEnv(["AKM_CURATE_TIMEOUT=30", "AKM_X=a=b", "AKM_EMPTY="])).toEqual({ AKM_CURATE_TIMEOUT: "30", AKM_X: "a=b", AKM_EMPTY: "" });
  });

  test("refuses what is not an AKM_* pair, what the arm fixes, a credential and a repeat", () => {
    expect(() => parseAkmEnv(["AKM_X"])).toThrow("takes KEY=VALUE");
    expect(() => parseAkmEnv(["=1"])).toThrow("takes KEY=VALUE");
    expect(() => parseAkmEnv(["OPENAI_API_KEY=x"])).toThrow("only AKM_* settings");
    expect(() => parseAkmEnv(["akm_x=1"])).toThrow("only AKM_* settings");
    for (const key of FIXED_AKM_ENV) expect(() => parseAkmEnv([`${key}=/x`])).toThrow("the arm fixes it");
    for (const key of ["AKM_LLM_API_KEY", "AKM_TOKEN", "AKM_CLIENT_SECRET", "AKM_DB_PASSWORD", "AKM_SIGNING_KEY", "AKM_SESSION_COOKIE"]) expect(() => parseAkmEnv([`${key}=s`])).toThrow("looks like a credential");
    expect(() => parseAkmEnv(["AKM_X=1", "AKM_X=2"])).toThrow("given twice");
  });

  test("decides what is a credential with the rule every eval shares (credentialField in lib/provenance.ts)", () => {
    for (const key of ["AKM_CURATE_TIMEOUT", "AKM_AUTHOR", "AKM_BYPASS", "AKM_PATH_LIMIT"]) {
      expect(credentialField(key), key).toBe(false);
      expect(parseAkmEnv([`${key}=1`])).toEqual({ [key]: "1" });
    }
    for (const key of ["AKM_LLM_API_KEY", "AKM_ACCESS_TOKEN", "AKM_MAX_TOKENS"]) {
      expect(credentialField(key), key).toBe(true);
      expect(() => parseAkmEnv([`${key}=s`])).toThrow("looks like a credential");
    }
  });

  test("fixes the same settings as the arm does", () => {
    const py = readFileSync(join(import.meta.dir, "akm_opencode.py"), "utf8");
    const start = py.indexOf("AKM_ENV = {");
    const table = py.slice(start, py.indexOf("\n}\n", start));
    const keys = [...table.matchAll(/"(AKM_[A-Z_]+)":/g)].map((m) => m[1]);
    const fixed = [...keys.filter((k) => k.endsWith("_DIR")), "AKM_OPENCODE_CLI"];
    expect([...FIXED_AKM_ENV].sort()).toEqual(fixed.sort());
  });
});

// ---- the job ----------------------------------------------------------------------------------------------------------------

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

  test("a run with no arm installs the pinned release, with no tarball and no extra setting", () => {
    expect(akm.kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin });
    for (const key of ["packages_dir", "akm_package", "plugin_package", "akm_env"]) expect(akm.kwargs[key]).toBeUndefined();
  });

  test("gives the akm arm the release, or the tarballs, and the extra settings, and the control arm none of it", () => {
    const release = jobConfig({ ...base, arm: releaseArm("0.9.27") }) as any;
    expect(release.agents[1].kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_plugin_version: PINS.akm_plugin });
    expect(release.agents[1].kwargs.akm_package).toBeUndefined();
    const arm: AkmArm = { bin: "~/akm", build: "abc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: "0.9.27", tarball: "akm-opencode-0.9.27.tgz" }, packages: "/pack" };
    const cfg = jobConfig({ ...base, arm, packagesDir: "/run/akm-packages", akmEnv: { AKM_CURATE_TIMEOUT: "30" } }) as any;
    expect(cfg.agents[1].kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_plugin_version: "0.9.27", packages_dir: "/run/akm-packages", akm_package: "akm-cli-0.9.27.tgz", plugin_package: "akm-opencode-0.9.27.tgz", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(cfg.agents[0]).toEqual(control);
    expect(JSON.stringify(cfg.agents[0])).not.toContain("akm");
    expect(() => jobConfig({ ...base, arm })).toThrow("names no folder");
  });

  test("the pins of a run are the pins with the akm and the plugin it installed", () => {
    expect(pinsOf(releaseArm())).toEqual(PINS);
    expect(pinsOf({ ...releaseArm("0.9.27"), plugin: { version: "0.9.27", tarball: "x.tgz" } })).toEqual({ ...PINS, akm_cli: "0.9.27", akm_plugin: "0.9.27" });
  });
});

describe("relativePaths and jobRecord", () => {
  test("write a path under a root relative to it, the first root that holds it, and leave the rest", () => {
    expect(relativePaths({ a: "/run/libraries", b: ["/run/akm-packages", "/repo/evals/x/tasks", "/elsewhere", "not/a/path"], c: { d: "/run" }, e: 3 }, ["/run", "/repo"])).toEqual({
      a: "libraries",
      b: ["akm-packages", "evals/x/tasks", "/elsewhere", "not/a/path"],
      c: { d: "." },
      e: 3,
    });
    expect(relativePaths("/runner/x", ["/run"])).toBe("/runner/x"); // a folder of another name that starts the same is not under the root
  });

  test("keep the datasets, the agents with their options, the attempts and the concurrency, and no folder of this machine", () => {
    const cfg = jobConfig({ name: "n", model: "openai/m", jobsDir: "/run/jobs", attempts: 3, librariesDir: "/run/libraries", datasets: [{ path: "/repo/evals/agent-ab/tasks", task_names: ["a", "b"] }], akmEnv: { AKM_X: "1" } });
    const record = jobRecord(cfg, "/run", "/repo") as any;
    expect(record.job_name).toBeUndefined();
    expect(record.jobs_dir).toBeUndefined();
    expect(record).toMatchObject({ n_attempts: 3, n_concurrent_trials: 4, datasets: [{ path: "evals/agent-ab/tasks", task_names: ["a", "b"] }] });
    expect(record.agents[1].kwargs).toMatchObject({ libraries_dir: "libraries", akm_env: { AKM_X: "1" }, opencode_config: { autoupdate: false } });
    expect(record.agents[1].override_setup_timeout_sec).toBe(2700);
  });

  test("leave out the host's count of the library, which the host's akm would otherwise write into the config that runs are compared by (#73)", () => {
    const job = (assets: number) => jobConfig({ name: "n", model: "openai/m", jobsDir: "/run/jobs", attempts: 1, librariesDir: "/run/libraries", datasets: [], akm: { env: { AKM_TASK_STASH: "library" }, kwargs: { library_assets: assets } } });
    expect((job(259) as any).agents[1].kwargs.library_assets).toBe(259); // Harbor is given it
    const [a, b] = [jobRecord(job(259), "/run", "/repo") as any, jobRecord(job(1), "/run", "/repo") as any];
    expect(a.agents[1].kwargs).not.toHaveProperty("library_assets");
    expect(a).toEqual(b); // what the summary keeps does not depend on the akm that counted
    expect(a.agents[1].env).toEqual({ AKM_TASK_STASH: "library" });
    expect(a.agents[1].kwargs).toMatchObject({ libraries_dir: "libraries", akm_cli_version: PINS.akm_cli });
    expect((job(259) as any).agents[1].kwargs.library_assets).toBe(259); // and the job it was made from is not changed
  });
});

describe("sha256Dir", () => {
  test("leaves out the files it is told to, wherever the rest is the same", () => {
    const a = tmp();
    const b = tmp();
    for (const d of [a, b]) put(join(d, "tasks", "t.md"), "task");
    put(join(b, "generated.json"), "{}");
    expect(sha256Dir(b)).not.toBe(sha256Dir(a));
    expect(sha256Dir(b, ["generated.json"])).toBe(sha256Dir(a));
    put(join(b, "tasks", "generated.json"), "{}"); // only the path it names: a file of that name deeper down counts
    expect(sha256Dir(b, ["generated.json"])).not.toBe(sha256Dir(a));
  });

  test("is the same for the same files wherever they are, and changes with a name or a content", () => {
    const a = tmp();
    const b = tmp();
    for (const d of [a, b]) {
      put(join(d, "x", "one.md"), "one");
      put(join(d, "two.md"), "two");
    }
    expect(sha256Dir(a)).toBe(sha256Dir(b));
    expect(sha256Dir(a)).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(join(b, "two.md"), "changed");
    expect(sha256Dir(b)).not.toBe(sha256Dir(a));
    writeFileSync(join(b, "two.md"), "two");
    put(join(b, "x", "extra.md"), "");
    expect(sha256Dir(b)).not.toBe(sha256Dir(a));
  });

  test("tells a moved file from a changed one", () => {
    const a = tmp();
    const b = tmp();
    put(join(a, "p", "f.md"), "same");
    put(join(b, "q", "f.md"), "same");
    expect(sha256Dir(a)).not.toBe(sha256Dir(b));
  });
});

describe("slug", () => {
  test("slug keeps letters and digits", () => {
    expect(slug("openai/gpt-6-luna")).toBe("openai-gpt-6-luna");
  });
});

// ---- what the run left ------------------------------------------------------------------------------------------------------

/** A Harbor trial folder, with the extra files the akm arm leaves in its agent folder. */
function trialDir(job: string, name: string, agent: "opencode" | "akm-opencode", over: Record<string, unknown> = {}, files: Record<string, unknown> = {}): void {
  put(
    join(job, name, "result.json"),
    JSON.stringify({
      task_name: `org/${name.split("__")[0]}`,
      agent_info: { name: agent },
      verifier_result: { rewards: { reward: 1 } },
      exception_info: null,
      started_at: "2026-10-06T04:00:00Z",
      finished_at: "2026-10-06T04:10:00Z",
      ...over,
    }),
  );
  for (const [file, data] of Object.entries(files)) put(join(job, name, "agent", file), JSON.stringify(data));
}

describe("loadRunTrials", () => {
  const timeout = { exception_info: { exception_type: "AgentTimeoutError" } };

  test("marks a trial that ran out of time, whatever else it has, and counts them apart by arm", () => {
    const job = tmp();
    trialDir(job, "t1__a", "opencode", timeout); // timed out and was still verified
    trialDir(job, "t2__a", "opencode");
    trialDir(job, "t1__b", "akm-opencode", { exception_info: { exception_type: "AgentSetupTimeoutError" }, verifier_result: null }); // the akm install was slow
    trialDir(job, "t2__b", "akm-opencode", { exception_info: { exception_type: "RuntimeError" }, verifier_result: null });
    const { trials } = loadRunTrials(job);
    expect(trials.map((t) => [t.trial, t.timed_out, t.error])).toEqual([
      ["t1__a", true, "AgentTimeoutError"],
      ["t1__b", true, "AgentSetupTimeoutError"],
      ["t2__a", false, null],
      ["t2__b", false, "RuntimeError"],
    ]);
    expect(trials.find((t) => t.trial === "t1__a")?.reward).toBe(1); // a timeout keeps its reward
    expect(timeoutsOf(trials)).toEqual({ control: 1, akm: 1 });
  });

  test("shows a plugin failure that an earlier exception would hide: its exception, no reward, and why", () => {
    const job = tmp();
    // Harbor kept the AgentTimeoutError, the first exception, and lost the one the agent raised after it.
    trialDir(job, "t1__b", "akm-opencode", { ...timeout, verifier_result: null }, { "akm_plugin_status.json": { live: false, problem: "the plugin never logged 'AKM user feedback recorded'" } });
    trialDir(job, "t2__b", "akm-opencode", { exception_info: { exception_type: PLUGIN_ERROR }, verifier_result: null }, { "akm_plugin_status.json": { live: false, problem: "there is no opencode log" } });
    trialDir(job, "t3__b", "akm-opencode", {}, { "akm_plugin_status.json": { live: true, problem: null } });
    trialDir(job, "t4__b", "akm-opencode"); // no verdict written: the trial stopped before the run
    trialDir(job, "t1__a", "opencode", {}, { "akm_plugin_status.json": { live: false, problem: "a control has no plugin" } }); // never read for the control
    const { trials } = loadRunTrials(job);
    const by = (name: string) => trials.find((t) => t.trial === name);
    expect(by("t1__b")).toMatchObject({ error: PLUGIN_ERROR, reward: null, timed_out: true, plugin_problem: "the plugin never logged 'AKM user feedback recorded'" });
    expect(by("t2__b")).toMatchObject({ error: PLUGIN_ERROR, reward: null, timed_out: false });
    expect(by("t3__b")).toMatchObject({ error: null, reward: 1, timed_out: false });
    expect(by("t3__b")?.plugin_problem).toBeUndefined();
    expect(by("t4__b")?.error).toBeNull();
    expect(by("t1__a")).toMatchObject({ error: null, reward: 1 });
    const report = buildReport(trials);
    expect(report.akm.exceptions).toEqual({ [PLUGIN_ERROR]: 2 }); // the failure shows in the report's exceptions
    expect(report.akm.errored).toBe(2);
    expect(timeoutsOf(trials).akm).toBe(1); // and the timeout is still counted
    expect(report.akm.timeouts).toBe(1); // in the report's table too, which reads it from the same place
  });

  test("counts the time-outs once: the report, the summary's count, its metrics and the printed line agree, for a setup time-out and a relabelled one too (#73)", () => {
    const job = tmp();
    trialDir(job, "t1__a", "opencode", timeout);
    trialDir(job, "t1__b", "akm-opencode", { exception_info: { exception_type: "AgentSetupTimeoutError" }, verifier_result: null }); // the install ran out of time
    trialDir(job, "t2__b", "akm-opencode", { ...timeout, verifier_result: null }, { "akm_plugin_status.json": { live: false, problem: "there is no opencode log" } }); // relabelled
    trialDir(job, "t3__b", "akm-opencode", { exception_info: { exception_type: "RuntimeError" }, verifier_result: null });
    trialDir(job, "t4__b", "akm-opencode");
    const { trials } = loadRunTrials(job);
    const report = buildReport(trials);
    const by = timeoutsOf(trials);
    expect(by).toEqual({ control: 1, akm: 2 });
    expect([report.control.timeouts, report.akm.timeouts]).toEqual([by.control, by.akm]);
    expect([metricsOf(report, trials).control.timeouts, metricsOf(report, trials).akm.timeouts]).toEqual([by.control, by.akm]);
    const lines = formatReport(report);
    expect(lines.find((l) => l.startsWith("  control"))).toContain(", 1 timed out");
    expect(lines.find((l) => l.startsWith("  akm"))).toContain(", 2 timed out");
    expect(lines.find((l) => l.startsWith("  akm"))).not.toContain("AgentSetupTimeoutError"); // a time-out is not also listed among the other exceptions
    expect(sideBySide("t", { corpus: "public", report }, { corpus: "custom", report }).find((l) => l.includes("timed out"))).toContain("1 control trials, 2 akm trials");
    // Trials read straight from a Harbor folder carry no timed_out, and say it by their exceptions: the same two.
    const raw = loadTrials(job);
    expect(buildReport(raw).akm.timeouts).toBe(2);
  });

  test("takes the reward away from a trial whose plugin was not live, even when the verifier scored it", () => {
    const job = tmp();
    // Harbor 0.24.0 skips the verifier when the agent raises after its run, so a reward and a dead plugin do not meet there.
    // A Harbor that verified anyway would count the pass of an akm arm that had no akm.
    trialDir(job, "t1__b", "akm-opencode", {}, { "akm_plugin_status.json": { live: false, problem: "there is no opencode log" } });
    trialDir(job, "t2__b", "akm-opencode", timeout, { "akm_plugin_status.json": { live: false, problem: "the plugin never logged" } });
    const { trials } = loadRunTrials(job);
    expect(trials.map((t) => [t.trial, t.error, t.reward])).toEqual([
      ["t1__b", PLUGIN_ERROR, null],
      ["t2__b", PLUGIN_ERROR, null],
    ]);
    expect(buildReport(trials).akm).toMatchObject({ errored: 2, scored: 0, passed: 0 });
  });

  test("collects what the akm arm's containers reported of themselves, without repeats", () => {
    const job = tmp();
    const locks = { akm_cli: "1".repeat(64), plugin: "2".repeat(64) };
    const record = (v: string, assets: number, tree = "a".repeat(64)) => ({ "akm_install.json": { akm_version: v, plugin_akm_cli: "0.9.26", assets_indexed: assets, env: { AKM_CURATE_TIMEOUT: "30" }, lockfiles: locks, dependency_tree_sha256: tree } });
    trialDir(job, "a__b", "akm-opencode", {}, record("0.9.27", 259));
    trialDir(job, "b__b", "akm-opencode", {}, record("0.9.27", 259));
    trialDir(job, "c__b", "akm-opencode", {}, record("0.9.27-dev", 260, "b".repeat(64)));
    trialDir(job, "d__b", "akm-opencode");
    expect(loadRunTrials(job).observed).toEqual({
      akm_version: ["0.9.27", "0.9.27-dev"],
      plugin_akm_cli: ["0.9.26"],
      assets_indexed: [259, 260],
      env: { AKM_CURATE_TIMEOUT: "30" },
      dependency_trees: ["a".repeat(64), "b".repeat(64)],
      lockfiles: locks,
    });
    expect(loadRunTrials(tmp()).observed).toEqual({ akm_version: [], plugin_akm_cli: [], assets_indexed: [], env: null, dependency_trees: [], lockfiles: null });
  });

  test("copes with a record or a verdict that is not JSON", () => {
    const job = tmp();
    trialDir(job, "a__b", "akm-opencode");
    put(join(job, "a__b", "agent", "akm_plugin_status.json"), "not json");
    put(join(job, "a__b", "agent", "akm_install.json"), "{");
    const { trials, observed } = loadRunTrials(job);
    expect(trials[0].error).toBeNull();
    expect(observed.akm_version).toEqual([]);
  });
});

describe("metricsOf", () => {
  const trial = (task: string, arm: "control" | "akm", reward: number | null, extra: Record<string, unknown> = {}) => ({ task, arm, trial: `${task}-${arm}`, reward, error: null, akm: arm === "akm" ? { akm_show: 1 } : null, tools: 2, tokens: null, costUsd: null, seconds: 60, timed_out: false, ...extra });

  const run = (akmRewards: number[]) => {
    const trials = [
      ...akmRewards.map((r, i) => trial(`t${i}`, "akm", r)),
      ...akmRewards.map((_, i) => trial(`t${i}`, "control", i === 0 ? 1 : 0, i === 1 ? { timed_out: true, error: "AgentTimeoutError" } : {})),
    ];
    return { trials, report: buildReport(trials) };
  };

  test("holds the report's main numbers as numbers, one object per arm, so a spread over repeats can be taken", () => {
    const { trials, report } = run([1, 1, 0]);
    const m = metricsOf(report, trials);
    expect(m.control).toMatchObject({ pass_rate: report.control.pass_rate?.value, scored: 3, errored: 0, timeouts: 1 });
    expect(m.akm).toMatchObject({ pass_rate: report.akm.pass_rate?.value, scored: 3, timeouts: 0 });
    expect(m.delta).toEqual({ value: report.delta?.value ?? null, lo: report.delta?.lo ?? null, hi: report.delta?.hi ?? null, n: 3 });
    expect(m.engagement).toMatchObject({ rate: 1, called: 3, trials: 3, control_calls: 0 });
    const leaves = (x: unknown): unknown[] => (typeof x === "object" && x !== null ? Object.values(x).flatMap(leaves) : [x]);
    for (const leaf of leaves(m)) expect(typeof leaf === "number" || leaf === null).toBe(true);
  });

  test("gives a spread over runs, with the akm minus control difference as the main number", () => {
    const a = run([1, 1, 0]);
    const b = run([0, 1, 0]);
    const spread = spreadOf([metricsOf(a.report, a.trials), metricsOf(b.report, b.trials)]) as any;
    expect(spread.delta.value).toEqual({ min: b.report.delta?.value, max: a.report.delta?.value, mean: Number((((a.report.delta?.value ?? 0) + (b.report.delta?.value ?? 0)) / 2).toFixed(4)) });
    expect(spread.control.timeouts).toEqual({ min: 1, max: 1, mean: 1 });
    expect(spread.engagement.control_calls.max).toBe(0);
  });

  test("is all null for a run that scored nothing, and counts the errored trials of both arms", () => {
    const trials = [trial("a", "control", null, { error: "RuntimeError" }), trial("a", "akm", null, { error: "RuntimeError" }), trial("b", "akm", null, { error: "RuntimeError" })];
    const report = buildReport(trials);
    const m = metricsOf(report, trials);
    expect(m.delta).toEqual({ value: null, lo: null, hi: null, n: null });
    expect(m.akm.pass_rate).toBeNull();
    expect(erroredOf(report)).toBe(3);
    expect(spreadOf([m, m]) as any).toMatchObject({ delta: { value: null } });
  });
});

describe("akmSummary", () => {
  test("names the akm as the other evals do, and what was installed", () => {
    const observed = { akm_version: ["0.9.27"], plugin_akm_cli: ["0.9.26"], assets_indexed: [259], env: null };
    expect(akmSummary(releaseArm(), {}, [], observed)).toEqual({
      akm_version: PINS.akm_cli,
      akm_bin: `akm-cli@${PINS.akm_cli}`,
      akm_build: null,
      akm_build_fingerprint: null,
      akm_env: {},
      akm_install: { from: "release", plugin_from: "release", plugin_version: PINS.akm_plugin, packages: [], dependency_tree_sha256: null, locked: false, observed },
    });
    const arm: AkmArm = { bin: "~/akm", build: "v0.9.27-3-gabc-dirty", build_fingerprint: "f".repeat(64), cli: { version: "0.9.27", tarball: "a.tgz" }, plugin: { version: "0.9.27", tarball: null }, packages: "/p" };
    expect(akmSummary(arm, { AKM_X: "1" }, [{ file: "a.tgz", sha256: "0".repeat(64) }], observed)).toMatchObject({
      akm_version: "0.9.27",
      akm_bin: "~/akm",
      akm_build: "v0.9.27-3-gabc-dirty",
      akm_build_fingerprint: "f".repeat(64),
      akm_env: { AKM_X: "1" },
      akm_install: { from: "checkout", plugin_from: "release", packages: [{ file: "a.tgz" }] },
    });
  });

  test("records the digest of the dependency tree the containers installed, in akm_install and in the build identity, and says whether it came from lockfiles (#68)", () => {
    const tree = "c".repeat(64);
    const locked = { akm_version: ["0.9.26"], plugin_akm_cli: ["0.9.26"], assets_indexed: [259], env: null, dependency_trees: [tree], lockfiles: { akm_cli: "1".repeat(64), plugin: "2".repeat(64) } };
    const release = akmSummary(releaseArm(), {}, [], locked);
    expect(release.akm_install).toMatchObject({ dependency_tree_sha256: tree, locked: true });
    expect(release.akm_build_fingerprint).toBe(buildFingerprint(null, tree));
    expect(release.akm_build_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Another tree is another build identity, and the same tree is the same one.
    const other = akmSummary(releaseArm(), {}, [], { ...locked, dependency_trees: ["d".repeat(64)] });
    expect(other.akm_build_fingerprint).not.toBe(release.akm_build_fingerprint);
    expect(akmSummary(releaseArm(), {}, [], { ...locked }).akm_build_fingerprint).toBe(release.akm_build_fingerprint);
    // A checkout's uncommitted changes and its tree both count, and an install with no lockfile says so.
    const arm: AkmArm = { bin: "~/akm", build: "v0.9.27-dirty", build_fingerprint: "f".repeat(64), cli: { version: "0.9.27", tarball: "a.tgz" }, plugin: { version: "0.9.27", tarball: "b.tgz" }, packages: "/p" };
    const unlocked = akmSummary(arm, {}, [], { ...locked, lockfiles: { akm_cli: null, plugin: null } });
    expect(unlocked.akm_install).toMatchObject({ dependency_tree_sha256: tree, locked: false });
    expect(unlocked.akm_build_fingerprint).toBe(buildFingerprint("f".repeat(64), tree));
    expect(unlocked.akm_build_fingerprint).not.toBe("f".repeat(64));
    expect(akmSummary(arm, {}, [], { ...locked, lockfiles: { akm_cli: "1".repeat(64), plugin: null } }).akm_install.locked).toBe(false); // half locked is not locked
    // Containers that did not install one tree give none: the build identity falls back to the changes alone, and statusOf aborts the run.
    const split = akmSummary(arm, {}, [], { ...locked, dependency_trees: [tree, "d".repeat(64)] });
    expect(split.akm_install.dependency_tree_sha256).toBeNull();
    expect(split.akm_build_fingerprint).toBe("f".repeat(64));
  });
});

// ---- whether the run did what it set out to do -------------------------------------------------------------------------------
describe("statusOf and the dependency trees", () => {
  const full: Completion = { expected: 2, completed: 2, failed: 0, missing: 0, unexpected: 0, control: { expected: 1, completed: 1, failed: 0, missing: 0, unexpected: 0 }, akm: { expected: 1, completed: 1, failed: 0, missing: 0, unexpected: 0 } };

  test("aborts a run whose containers installed different dependency trees, and not one whose containers agree or recorded none (#68)", () => {
    expect(statusOf(0, full, true, { dependency_trees: ["a".repeat(64)] })).toEqual({ status: "complete", aborted_reason: null });
    expect(statusOf(0, full, true, { dependency_trees: [] })).toEqual({ status: "complete", aborted_reason: null });
    expect(statusOf(0, full)).toEqual({ status: "complete", aborted_reason: null });
    const split = statusOf(0, full, true, { dependency_trees: ["a".repeat(64), "b".repeat(64)] });
    expect(split.status).toBe("aborted");
    expect(split.aborted_reason).toBe("the akm arm's containers installed 2 different dependency trees (akm_install.observed.dependency_trees), so its trials did not all run the same code");
  });
});

describe("the committed lockfiles of the pinned releases (#68)", () => {
  const read = (folder: string, name: string) => JSON.parse(readFileSync(join(folder, name), "utf8"));
  const cases = [
    { pkg: "akm-cli", version: PINS.akm_cli },
    { pkg: "akm-opencode", version: PINS.akm_plugin },
  ] as const;

  test("exist for the pinned akm-cli and the pinned plugin, in the folder akm_opencode.py looks in, and for no other release", () => {
    for (const { pkg, version } of cases) expect(lockFolder(pkg, version), pkg).toBe(join(LOCKS_DIR, `${pkg}-${version}`));
    expect(lockFolder("akm-cli", "0.0.1")).toBeNull();
    expect(lockFolder("akm-opencode", "0.0.1")).toBeNull();
  });

  test("lock the release the pin names and every package under it to a version and a digest, from the npm registry", () => {
    for (const { pkg, version } of cases) {
      const folder = lockFolder(pkg, version) as string;
      const [manifest, lock] = [read(folder, "package.json"), read(folder, "package-lock.json")];
      // npm ci stops when the two disagree, so a pin moved without a new lockfile stops the install rather than installing the old release.
      expect(manifest.dependencies).toEqual({ [pkg]: version });
      expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
      expect(lock.packages[""].dependencies).toEqual(manifest.dependencies);
      expect(lock.packages[`node_modules/${pkg}`].version).toBe(version);
      const installed = Object.entries(lock.packages as Record<string, { version?: string; resolved?: string; integrity?: string }>).filter(([path]) => path !== "");
      expect(installed.length).toBeGreaterThan(10); // the dependencies are in it, not only the package
      for (const [path, entry] of installed) {
        expect(entry.version, path).toMatch(/^\d+\.\d+\.\d+/);
        expect(entry.resolved, path).toMatch(/^https:\/\/registry\.npmjs\.org\//);
        expect(entry.integrity, path).toMatch(/^sha512-/);
      }
    }
  });

  test("the plugin's lockfile holds the akm-cli the plugin is pinned to", () => {
    const lock = read(lockFolder("akm-opencode", PINS.akm_plugin) as string, "package-lock.json");
    expect(lock.packages["node_modules/akm-cli"].version).toBe(PINS.akm_cli);
  });
});

describe("completionOf and statusOf", () => {
  const trial = (task: string, arm: "control" | "akm", over: Partial<RunTrial> = {}): RunTrial => ({ task, arm, trial: `${task}__${arm}${Math.random()}`, reward: 1, error: null, akm: null, tools: 1, tokens: null, costUsd: null, seconds: 1, timed_out: false, ...over });
  const grid = (tasks: string[], attempts: number): RunTrial[] => tasks.flatMap((t) => (["control", "akm"] as const).flatMap((arm) => Array.from({ length: attempts }, () => trial(t, arm))));

  test("expects every task in both arms once per attempt, and counts a full grid as completed", () => {
    const c = completionOf(grid(["a", "b", "c"], 2), ["a", "b", "c"], 2);
    expect(c).toEqual({
      expected: 12,
      completed: 12,
      failed: 0,
      missing: 0,
      unexpected: 0,
      control: { expected: 6, completed: 6, failed: 0, missing: 0, unexpected: 0 },
      akm: { expected: 6, completed: 6, failed: 0, missing: 0, unexpected: 0 },
    });
    expect(statusOf(0, c)).toEqual({ status: "complete", aborted_reason: null });
  });

  test("a cell with no trial is missing, per arm and in all, and the run is aborted for it even when Harbor exited 0", () => {
    const trials = grid(["a", "b"], 2).filter((t) => !(t.task === "b" && t.arm === "akm"));
    trials.pop(); // and one control attempt of b
    const c = completionOf(trials, ["a", "b"], 2);
    expect(c).toMatchObject({ expected: 8, completed: 5, failed: 0, missing: 3, unexpected: 0 });
    expect(c.control).toMatchObject({ expected: 4, completed: 3, missing: 1 });
    expect(c.akm).toMatchObject({ expected: 4, completed: 2, missing: 2 });
    expect(c.completed + c.failed + c.missing).toBe(c.expected);
    expect(statusOf(0, c)).toEqual({ status: "aborted", aborted_reason: "3 of 8 expected trials have no result (control 1, akm 2)" });
  });

  test("a trial with an exception or no reward is failed, not missing: the run is still complete when Harbor exited 0", () => {
    const trials = grid(["a", "b"], 1);
    trials[0] = trial("a", "control", { error: "AgentTimeoutError", timed_out: true }); // verified all the same, but it raised
    trials[3] = trial("b", "akm", { reward: null, error: "RuntimeError" });
    trials[2] = trial("b", "control", { reward: null }); // no exception recorded, and no reward
    const c = completionOf(trials, ["a", "b"], 1);
    expect(c).toMatchObject({ expected: 4, completed: 1, failed: 3, missing: 0 });
    expect(c.control).toMatchObject({ completed: 0, failed: 2 });
    expect(c.akm).toMatchObject({ completed: 1, failed: 1 });
    expect(statusOf(0, c)).toEqual({ status: "complete", aborted_reason: null });
  });

  test("a nonzero exit aborts the run even when every cell has a trial, and the reason says both when both hold", () => {
    const full = completionOf(grid(["a"], 1), ["a"], 1);
    expect(statusOf(3, full)).toEqual({ status: "aborted", aborted_reason: "Harbor exited 3" });
    const part = completionOf(grid(["a"], 1).slice(0, 1), ["a"], 1);
    expect(statusOf(1, part)).toEqual({ status: "aborted", aborted_reason: "Harbor exited 1; 1 of 2 expected trials have no result (control 0, akm 1)" });
  });

  test("a job folder Harbor never made is every cell missing, and says so", () => {
    const c = completionOf([], ["a", "b"], 3);
    expect(c).toMatchObject({ expected: 12, completed: 0, failed: 0, missing: 12 });
    expect(statusOf(0, c, false).aborted_reason).toBe("Harbor wrote no job; 12 of 12 expected trials have no result (control 6, akm 6)");
  });

  test("trials outside the grid fill no cell: one of a task not asked for, and one beyond the attempts, and either aborts the run", () => {
    const trials = [...grid(["a"], 1), trial("stray", "control"), trial("a", "akm")]; // a second attempt of a in the akm arm that the job did not ask for
    const c = completionOf(trials, ["a"], 1);
    expect(c).toMatchObject({ expected: 2, completed: 2, failed: 0, missing: 0, unexpected: 2 });
    expect(c.control.unexpected).toBe(1);
    expect(c.akm.unexpected).toBe(1);
    expect(statusOf(0, c)).toEqual({ status: "aborted", aborted_reason: "2 trials fall outside the grid of tasks, arms and attempts the job asked for" });
  });

  test("a missing job folder gives no trials rather than an error", () => {
    expect(loadRunTrials(join(tmp(), "no-such-job")).trials).toEqual([]);
  });
});

describe("assetsSha256", () => {
  const base = { library: "a".repeat(64), dataset: { tasks: { x: "1", y: "2" } }, attempts: 3 };

  test("is one digest that moves with the library, the dataset or the attempts, and with nothing else", () => {
    const same = assetsSha256(base);
    expect(same).toMatch(/^[0-9a-f]{64}$/);
    expect(assetsSha256({ ...base, dataset: { tasks: { y: "2", x: "1" } } })).toBe(same); // the order of the keys is not content
    expect(assetsSha256({ ...base, library: "b".repeat(64) })).not.toBe(same);
    expect(assetsSha256({ ...base, library: null })).not.toBe(same);
    expect(assetsSha256({ ...base, dataset: { tasks: { x: "1", y: "3" } } })).not.toBe(same);
    expect(assetsSha256({ ...base, dataset: { tasks: { x: "1" } } })).not.toBe(same);
    expect(assetsSha256({ ...base, attempts: 4 })).not.toBe(same);
  });
});
