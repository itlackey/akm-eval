import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { engineConfig } from "./akm/akm.ts";
import { canonical, credentialField, endpointHost, endpointIdentity, engineSettings, harnessSha256, redactConfig, sha256File, sha256Files, sha256Json, sha256Text, withoutEngineSettings } from "./provenance.ts";

const dirs: string[] = [];
const files = (contents: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "provenance-test-"));
  dirs.push(dir);
  return Object.fromEntries(Object.entries(contents).map(([name, text]) => [name, (writeFileSync(join(dir, name), text), join(dir, name))]));
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("sha256Text and sha256File", () => {
  test("are the hex SHA-256 of the text, and of the file's bytes", () => {
    expect(sha256Text("abc")).toBe(ABC);
    expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256File(files({ "a.txt": "abc" })["a.txt"])).toBe(ABC);
  });

  test("a file that is not there throws", () => {
    expect(() => sha256File(join(tmpdir(), "no-such-file-for-provenance"))).toThrow();
  });
});

describe("sha256Files", () => {
  test("does not depend on the order of the paths", () => {
    const f = files({ "a.txt": "one", "b.txt": "two", "c.txt": "three" });
    expect(sha256Files([f["c.txt"], f["a.txt"], f["b.txt"]])).toBe(sha256Files([f["a.txt"], f["b.txt"], f["c.txt"]]));
  });

  test("changes with a file's content, with a path, and with a file added or dropped", () => {
    const f = files({ "a.txt": "one", "b.txt": "two", "c.txt": "one" });
    const both = sha256Files([f["a.txt"], f["b.txt"]]);
    expect(sha256Files([f["c.txt"], f["b.txt"]])).not.toBe(both); // same content, other path
    expect(sha256Files([f["a.txt"]])).not.toBe(both);
    writeFileSync(f["b.txt"], "other");
    expect(sha256Files([f["a.txt"], f["b.txt"]])).not.toBe(both);
  });

  test("tells where one file ends from where the next begins, and is a digest of nothing for no files", () => {
    const f = files({ "a.txt": "ab", "b.txt": "c", "c.txt": "a", "d.txt": "bc" });
    expect(sha256Files([f["a.txt"], f["b.txt"]])).not.toBe(sha256Files([f["c.txt"], f["d.txt"]]));
    expect(sha256Files([])).toBe(sha256Text(""));
  });
});

describe("redactConfig", () => {
  test("replaces the value of every key whose name contains key, token, secret, password, authorization or cookie, in any case, at any depth, and leaves the rest", () => {
    const config = {
      engines: { m: { apiKey: "sk-1", API_KEY: "sk-2", Token: "t", maxTokens: 5, model: "x", endpoint: "https://h.example/v1", timeoutMs: 5 } },
      list: [{ api_key: "k", secret: { inner: "s" }, name: "n" }, ["x-api-key", "kept"]],
      headers: { Authorization: "Bearer b", "Set-Cookie": "c", Accept: "*/*" },
      dbPassword: "p",
    };
    expect(redactConfig(config)).toEqual({
      engines: { m: { apiKey: "<redacted>", API_KEY: "<redacted>", Token: "<redacted>", maxTokens: "<redacted>", model: "x", endpoint: "https://h.example/v1", timeoutMs: 5 } },
      list: [{ api_key: "<redacted>", secret: "<redacted>", name: "n" }, ["x-api-key", "kept"]],
      headers: { Authorization: "<redacted>", "Set-Cookie": "<redacted>", Accept: "*/*" },
      dbPassword: "<redacted>",
    });
  });

  test("does not change the config it is given", () => {
    const config = { engines: { m: { apiKey: "sk-1" } } };
    const copy = JSON.stringify(config);
    const redacted = redactConfig(config);
    expect(JSON.stringify(config)).toBe(copy);
    expect(redacted.engines).not.toBe(config.engines);
  });

  test("credentialField is that rule", () => {
    for (const name of ["apiKey", "x-api-key", "--api-key", "accessToken", "client_secret", "password", "Authorization", "SESSION_COOKIE", "OPENAI_API_KEY", "HF_TOKEN", "keyboard"]) expect([name, credentialField(name)]).toEqual([name, true]);
    for (const name of ["auth", "author", "path", "model", "DATABASE_URL", "timeoutMs"]) expect([name, credentialField(name)]).toEqual([name, false]);
  });
});

describe("engineSettings", () => {
  const nulls = { model: null, endpoint: null, temperature: null, enableThinking: null, timeoutMs: null };

  test("reads the engine that defaults.llmEngine names, with its endpoint's host: no path, no credentials (#65)", () => {
    const url = "https://user:pw@gateway.example:8443/k-DUMMYSECRET0123/v1/chat/completions?key=abc";
    const config = { engines: { other: { model: "no" }, m: { kind: "llm", model: "the-model", endpoint: url, temperature: 0, enableThinking: false, timeoutMs: 600000 } }, defaults: { llmEngine: "m" } };
    const settings = { model: "the-model", endpoint: "https://gateway.example:8443", temperature: 0, enableThinking: false, timeoutMs: 600000 };
    expect(engineSettings(config)).toEqual({ engine: "m", ...settings, engines: { m: settings } });
    expect(JSON.stringify(engineSettings(config))).not.toMatch(/pw|abc|DUMMYSECRET|k-DUMMY|\/v1/);
  });

  test("reads what engineConfig writes", () => {
    const settings = { model: "the-model", endpoint: "http://localhost:8080", temperature: null, enableThinking: null, timeoutMs: 600000 };
    expect(engineSettings(engineConfig("http://localhost:8080/v1", "the-model", true))).toEqual({ engine: "model", ...settings, engines: { model: settings } });
  });

  test("records every engine the config uses, those a strategy, a process or a gate is routed to, and not one nothing names (R02)", () => {
    const config = {
      defaults: { llmEngine: "m", engine: "agent" },
      engines: {
        m: { model: "a", endpoint: "https://a.example/v1" },
        worker: { model: "w", endpoint: "https://worker.example/deployment-A/v1", temperature: 0.2 },
        judge: { model: "j", endpoint: "https://judge.example/v1", timeoutMs: 5 },
        agent: { model: "ag" },
        unused: { model: "u" },
      },
      improve: { strategies: { night: { engine: "judge", processes: { distill: { engine: "worker" }, reflect: { qualityGate: { engine: "judge" } } } } } },
    };
    const s = engineSettings(config);
    expect(s.engine).toBe("m");
    expect(Object.keys(s.engines)).toEqual(["agent", "judge", "m", "worker"]);
    expect(s.engines.worker).toEqual({ model: "w", endpoint: "https://worker.example", temperature: 0.2, enableThinking: null, timeoutMs: null });
    // another deployment path of the routed engine on the same host is the same engine: only the host is recorded
    const moved = engineSettings({ ...config, engines: { ...config.engines, worker: { ...config.engines.worker, endpoint: "https://worker.example/deployment-B/v1" } } });
    expect(moved.engines.worker).toEqual(s.engines.worker);
    // the same engines in another order of keys are the same settings
    expect(JSON.stringify(engineSettings({ engines: Object.fromEntries(Object.entries(config.engines).reverse()), improve: config.improve, defaults: config.defaults }))).toBe(JSON.stringify(s));
  });

  test("is null for what the config does not set, or that is not a URL", () => {
    const none = { engine: null, ...nulls, engines: {} };
    expect(engineSettings({})).toEqual(none);
    expect(engineSettings(null)).toEqual(none);
    expect(engineSettings({ defaults: {}, engines: { m: { model: "x" } } })).toEqual(none);
    expect(engineSettings({ defaults: { llmEngine: "gone" }, engines: {} })).toEqual({ ...none, engine: "gone" });
    expect(engineSettings({ defaults: { llmEngine: "m" }, engines: { m: { endpoint: "not a url" } } })).toMatchObject({ endpoint: null });
    expect(engineSettings({ defaults: { llmEngine: "constructor" }, engines: {} })).toEqual({ ...none, engine: "constructor" });
  });
});

describe("harnessSha256", () => {
  const REPO = resolve(import.meta.dir, "..");
  /** A small repository: the shared lib/, two evals, and every kind of file the digest counts or leaves out. */
  const REPOSITORY: Record<string, string> = {
    "lib/a.ts": "export const a = 1;\n",
    "lib/sub/b.ts": "export const b = 2;\n",
    "lib/env.sh": "load_env() { :; }\n",
    "lib/harbor/arm.py": "ARM = 1\n",
    "lib/harbor/test_arm.py": "def test(): pass\n",
    "lib/a.test.ts": "test one\n",
    "lib/README.md": "the lib\n",
    "lib/golden.ts": "export const golden = 1;\n",
    "evals/x/src/run.ts": "export const run = 1;\n",
    "evals/x/src/lib.ts": "export const score = 1;\n",
    "evals/x/src/helper.py": "VALUE = 1\n",
    "evals/x/src/lib.test.ts": "test two\n",
    "evals/x/src/test_helper.py": "def test(): pass\n",
    "evals/x/src/fakes.ts": "export const fake = 1;\n",
    "evals/x/src/fixtures/case.ts": "export const fixture = 1;\n",
    "evals/x/src/node_modules/dep/index.ts": "export const dep = 1;\n",
    "evals/x/src/package.json": "{}\n",
    "evals/x/README.md": "the eval\n",
    "evals/y/src/run.ts": "export const other = 1;\n",
  };
  const roots: string[] = [];
  /** The repository above on disk, with `changes` applied: a file's new text. */
  const checkout = (changes: Record<string, string> = {}): string => {
    const root = mkdtempSync(join(tmpdir(), "harness-test-"));
    roots.push(root);
    for (const [path, text] of Object.entries({ ...REPOSITORY, ...changes })) {
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  };
  const digest = (root: string, also: string[] = []): string => harnessSha256(join(root, "evals", "x", "src"), { root, also: also.map((dir) => join(root, dir)) });
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  test("is one sha256 that does not depend on where the checkout is", () => {
    const [one, two] = [checkout(), checkout()];
    expect(digest(one)).toMatch(/^[0-9a-f]{64}$/);
    expect(digest(two)).toBe(digest(one));
  });

  test("is the same for the code of this repository in two checkout paths, and is the one the runners write", () => {
    const copy = (): string => {
      const root = mkdtempSync(join(tmpdir(), "harness-real-"));
      roots.push(root);
      for (const folder of ["lib", join("evals", "retrieval", "src")]) cpSync(join(REPO, folder), join(root, folder), { recursive: true, filter: (from) => !from.split(sep).includes("node_modules") });
      return root;
    };
    const [one, two] = [copy(), copy()];
    const at = (root: string) => harnessSha256(join(root, "evals", "retrieval", "src"), { root });
    expect(at(two)).toBe(at(one));
    expect(harnessSha256(join(REPO, "evals", "retrieval", "src"))).toBe(at(one));
    expect(harnessSha256(join(REPO, "evals", "distill", "src"))).not.toBe(at(one)); // another eval is another digest
  });

  test("changes with an edit to the eval's own code, to a .ts or .py file of lib/, to lib/env.sh, and with a file added, renamed or dropped", () => {
    const base = digest(checkout());
    const changes: Record<string, string>[] = [
      { "evals/x/src/lib.ts": "export const score = 2;\n" },
      { "evals/x/src/run.ts": "export const run = 2;\n" },
      { "evals/x/src/helper.py": "VALUE = 2\n" },
      { "evals/x/src/new.ts": "export const added = 1;\n" },
      { "lib/a.ts": "export const a = 2;\n" },
      { "lib/sub/b.ts": "export const b = 3;\n" },
      { "lib/env.sh": "load_env() { return 1; }\n" },
      { "lib/harbor/arm.py": "ARM = 2\n" },
      { "lib/added.ts": "export const added = 1;\n" },
    ];
    for (const change of changes) expect(digest(checkout(change))).not.toBe(base);
    const renamed = checkout();
    renameSync(join(renamed, "evals", "x", "src", "lib.ts"), join(renamed, "evals", "x", "src", "scoring.ts"));
    expect(digest(renamed)).not.toBe(base);
    const dropped = checkout();
    rmSync(join(dropped, "lib", "a.ts"));
    expect(digest(dropped)).not.toBe(base);
  });

  test("does not change with an edit to a test, a test double, the golden-file check, a fixture, a dependency, a README or a file that is not code", () => {
    const base = digest(checkout());
    const changes: Record<string, string>[] = [
      { "evals/x/src/lib.test.ts": "test edited\n" },
      { "evals/x/src/test_helper.py": "def test(): return 1\n" },
      { "evals/x/src/fakes.ts": "export const fake = 2;\n" },
      { "evals/x/src/fixtures/case.ts": "export const fixture = 2;\n" },
      { "evals/x/src/node_modules/dep/index.ts": "export const dep = 2;\n" },
      { "evals/x/src/package.json": '{"edited":true}\n' },
      { "evals/x/README.md": "the eval, edited\n" },
      { "lib/a.test.ts": "test edited\n" },
      { "lib/golden.ts": "export const golden = 2;\n" },
      { "lib/harbor/test_arm.py": "def test(): return 1\n" },
      { "lib/README.md": "the lib, edited\n" },
      { "evals/y/src/run.ts": "export const other = 2;\n" },
      { "evals/x/src/new.test.ts": "a test added\n", "lib/new.test.ts": "a test added\n", "evals/x/src/NOTES.md": "notes\n" },
    ];
    for (const change of changes) expect(digest(checkout(change))).toBe(base);
  });

  test("counts the src folders of the evals whose code an eval imports, when it names them", () => {
    const base = digest(checkout(), ["evals/y/src"]);
    expect(base).not.toBe(digest(checkout()));
    expect(digest(checkout({ "evals/y/src/run.ts": "export const other = 2;\n" }), ["evals/y/src"])).not.toBe(base);
    expect(digest(checkout({ "evals/y/src/run.ts": "export const other = 2;\n" }))).toBe(digest(checkout()));
  });

  test("refuses a folder that is not inside the repository", () => {
    const root = checkout();
    expect(() => harnessSha256(tmpdir(), { root })).toThrow("is not inside the repository");
    expect(() => harnessSha256(root, { root })).toThrow("is not inside the repository");
    expect(() => digest(root, ["../elsewhere"])).toThrow("is not inside the repository");
  });

  test("digests a folder of Python files as a manifest of path from the root and content digest, sorted, with test_*.py left out: a fixed digest, so a change to how it is made shows", () => {
    const root = mkdtempSync(join(tmpdir(), "harness-golden-"));
    roots.push(root);
    const src = join(root, "evals", "bakeoff", "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "helper.py"), "X = 1\n");
    writeFileSync(join(src, "bakeoff.py"), "print('a')\n");
    writeFileSync(join(src, "test_bakeoff.py"), "ignored\n");
    expect(harnessSha256(src, { root })).toBe("aa0d380a5736fa683bc2cb7aa9dec98f860df640d388f41e0a0eeed36a5a5129");
  });
});

describe("endpointIdentity, the whole endpoint of the matrix fingerprint", () => {
  test("keeps the scheme, host, port and path, so two deployments on one host differ", () => {
    expect(endpointIdentity("https://gateway.example/deployment-A/v1")).toBe("https://gateway.example/deployment-A/v1");
    expect(endpointIdentity("https://gateway.example/deployment-A/v1")).not.toBe(endpointIdentity("https://gateway.example/deployment-B/v1"));
    expect(endpointIdentity("http://localhost:8080/v1/")).toBe("http://localhost:8080/v1");
    expect(endpointIdentity("HTTPS://Gateway.Example/v1")).toBe("https://gateway.example/v1");
  });

  test("drops credentials and the fragment, redacts credential parameters, and orders the query", () => {
    const id = endpointIdentity("https://user:DUMMY_PASS@gateway.example/v1?api_key=DUMMY_QUERY_SECRET&api-version=2024-10#frag");
    expect(id).toBe("https://gateway.example/v1?api-version=2024-10&api_key=<redacted>");
    expect(id).not.toContain("DUMMY");
    expect(endpointIdentity("https://gateway.example/v1?api_key=OTHER&api-version=2024-10")).toBe(id); // a key change alone is the same endpoint
    expect(endpointIdentity("https://gateway.example/v1?api-version=2025-01&api_key=x")).not.toBe(id);
  });

  test("is null for a value that is not a URL", () => {
    for (const v of [undefined, null, "", "  ", "not a url", 42]) expect(endpointIdentity(v)).toBeNull();
  });
});

describe("endpointHost (#65)", () => {
  test("the host has the scheme and port and never a path, a query or credentials", () => {
    expect(endpointHost("https://user:pw@Gateway.Example:8443/k-DUMMYSECRET0123/v1?api_key=abc#f")).toBe("https://gateway.example:8443");
    expect(endpointHost("http://localhost:8080/v1/")).toBe("http://localhost:8080");
    for (const v of [undefined, null, "", "not a url", 7]) expect(endpointHost(v)).toBeNull();
  });
});

describe("canonical and withoutEngineSettings", () => {
  test("the same value gives the same text whatever the order of its keys, and the digest follows", () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(sha256Json({ b: 1, a: 2 })).toBe(sha256Json({ a: 2, b: 1 }));
    expect(canonical(undefined)).toBe("null");
  });

  test("leaves out the settings of the model from every engine, and nothing else", () => {
    const config = { semanticSearchMode: "off", engines: { m: { kind: "llm", provider: "openai", model: "x", endpoint: "https://h.example/v1", temperature: 0, enableThinking: false, timeoutMs: 5, apiKey: "$K" } } };
    expect(withoutEngineSettings(config)).toEqual({ semanticSearchMode: "off", engines: { m: { kind: "llm", provider: "openai", apiKey: "$K" } } });
  });
});
