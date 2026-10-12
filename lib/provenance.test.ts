import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { engineConfig } from "./akm/akm.ts";
import { canonical, credentialField, endpointDisplay, endpointHost, endpointId, endpointIdentity, endpointRecord, engineSettings, harnessSha256, redactConfig, sha256File, sha256Files, sha256Json, sha256Text, withoutEngineSettings } from "./provenance.ts";

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
  test("replaces the value under apiKey, api_key, token and secret, in any case, at any depth, and leaves the rest", () => {
    const config = { engines: { m: { apiKey: "sk-1", API_KEY: "sk-2", Token: "t", model: "x", timeoutMs: 5 } }, list: [{ api_key: "k", secret: { inner: "s" }, name: "n" }], token: 7 };
    expect(redactConfig(config)).toEqual({
      engines: { m: { apiKey: "<redacted>", API_KEY: "<redacted>", Token: "<redacted>", model: "x", timeoutMs: 5 } },
      list: [{ api_key: "<redacted>", secret: "<redacted>", name: "n" }],
      token: "<redacted>",
    });
  });

  test("keeps a $VARIABLE reference, which holds no secret, and redacts a value that only looks like one", () => {
    expect(redactConfig({ apiKey: "$MODEL_API_KEY", token: "sk-$ABC", secret: "$ not-a-name", other: "$X" })).toEqual({ apiKey: "$MODEL_API_KEY", token: "<redacted>", secret: "<redacted>", other: "$X" });
  });

  test("does not match a key that only contains the name, and does not change the config it is given", () => {
    const config = { maxTokens: 5, tokenizer: "t", engines: { m: { apiKey: "sk-1" } } };
    const copy = JSON.stringify(config);
    const redacted = redactConfig(config);
    expect(redacted.maxTokens).toBe(5);
    expect(redacted.tokenizer).toBe("t");
    expect(JSON.stringify(config)).toBe(copy);
    expect(redacted.engines).not.toBe(config.engines);
  });
});

describe("redactConfig and the credentials of an export", () => {
  const LEAKS = ["DUMMY_QUERY_SECRET", "DUMMY_USER_PASSWORD", "DUMMY_HEADER_SECRET", "DUMMY_FRAGMENT_SECRET", "DUMMY_PAIR_SECRET", "DUMMY_NAMED_SECRET", "DUMMY_LINE_SECRET", "DUMMY_OAUTH_SECRET"];
  const noLeaks = (value: unknown) => {
    const text = JSON.stringify(value);
    for (const leak of LEAKS) expect(text).not.toContain(leak);
  };

  test("an endpoint loses its user name and password, and the value of every authentication parameter of its query, and keeps scheme, host, port, path and the rest of the query", () => {
    const endpoint = "https://user:DUMMY_USER_PASSWORD@gateway.example:8443/v1/chat/completions?api_key=DUMMY_QUERY_SECRET&model=m&ok=1#DUMMY_FRAGMENT_SECRET";
    const redacted = redactConfig({ engines: { model: { endpoint, model: "m" } } });
    expect(redacted.engines.model.endpoint).toBe("https://gateway.example:8443/v1/chat/completions?api_key=<redacted>&model=m&ok=1");
    noLeaks(redacted);
    expect(redactConfig("https://gateway.example/v1/chat/completions?api_key=DUMMY_QUERY_SECRET")).toBe("https://gateway.example/v1/chat/completions?api_key=<redacted>");
    expect(redactConfig("https://u:DUMMY_USER_PASSWORD@host.example/")).toBe("https://host.example/");
    expect(redactConfig("https://DUMMY_USER_PASSWORD@host.example/")).toBe("https://host.example/");
    expect(redactConfig("http://localhost:8080/v1/chat/completions")).toBe("http://localhost:8080/v1/chat/completions");
  });

  test("masks api_key, apikey, key, token, access_token, auth, sig, signature, password and secret in a query, in any case, and nothing else", () => {
    const names = ["api_key", "apikey", "key", "token", "access_token", "auth", "sig", "signature", "password", "secret", "API_KEY", "ApiKey", "Access_Token", "SIGNATURE", "X-Amz-Signature", "client_secret"];
    for (const name of names) expect(redactConfig(`https://h.example/p?a=1&${name}=DUMMY_QUERY_SECRET&b=2`)).toBe(`https://h.example/p?a=1&${name}=<redacted>&b=2`);
    expect(redactConfig("https://h.example/p?api%5Fkey=DUMMY_QUERY_SECRET")).toBe("https://h.example/p?api%5Fkey=<redacted>");
    expect(redactConfig("https://h.example/p?model=m&maxTokens=5&tokenizer=t&author=a&design=d")).toBe("https://h.example/p?model=m&maxTokens=5&tokenizer=t&author=a&design=d");
  });

  test("a $NAME reference stays, as the value of a field and of a query parameter", () => {
    expect(redactConfig({ endpoint: "https://h.example/v1?api_key=$MODEL_API_KEY&token=$OTHER_TOKEN", apiKey: "$MODEL_API_KEY", headers: { "X-Api-Key": "$OTHER_KEY", Authorization: "Bearer sk-1" } })).toEqual({
      endpoint: "https://h.example/v1?api_key=$MODEL_API_KEY&token=$OTHER_TOKEN",
      apiKey: "$MODEL_API_KEY",
      headers: { "X-Api-Key": "$OTHER_KEY", Authorization: "<redacted>" },
    });
  });

  test("redacts every engine, not only the default one, and a URL in an array", () => {
    const redacted = redactConfig({
      engines: {
        one: { endpoint: "https://a:DUMMY_USER_PASSWORD@one.example/v1?key=DUMMY_QUERY_SECRET", apiKey: "$ONE_KEY", model: "m1" },
        two: { endpoint: "https://two.example/v1?token=DUMMY_QUERY_SECRET", apiKey: "DUMMY_HEADER_SECRET", model: "m2" },
        three: { nested: [{ deeper: { url: "wss://x:DUMMY_USER_PASSWORD@three.example:9/ws?sig=DUMMY_QUERY_SECRET", password: "DUMMY_HEADER_SECRET" } }] },
      },
      defaults: { llmEngine: "one" },
      registries: ["https://DUMMY_USER_PASSWORD@registry.example/index.json?access_token=DUMMY_QUERY_SECRET", "https://plain.example/index.json"],
    });
    noLeaks(redacted);
    expect(redacted.engines.one).toEqual({ endpoint: "https://one.example/v1?key=<redacted>", apiKey: "$ONE_KEY", model: "m1" });
    expect(redacted.engines.two).toEqual({ endpoint: "https://two.example/v1?token=<redacted>", apiKey: "<redacted>", model: "m2" });
    expect(redacted.engines.three.nested[0].deeper).toEqual({ url: "wss://three.example:9/ws?sig=<redacted>", password: "<redacted>" });
    expect(redacted.registries).toEqual(["https://registry.example/index.json?access_token=<redacted>", "https://plain.example/index.json"]);
    expect(redacted.defaults).toEqual({ llmEngine: "one" });
  });

  test("redacts a credential header however it is written: a field of an object, a line, a pair or a name and value", () => {
    const redacted = redactConfig({
      headers: { Authorization: "Bearer DUMMY_HEADER_SECRET", "X-Api-Key": "DUMMY_HEADER_SECRET", "api-key": "DUMMY_HEADER_SECRET", "Proxy-Authorization": "Basic DUMMY_HEADER_SECRET", Cookie: "s=DUMMY_HEADER_SECRET", "Content-Type": "application/json", Accept: "*/*" },
      extraHeaders: ["Authorization: Bearer DUMMY_LINE_SECRET", "x-api-key=DUMMY_LINE_SECRET", "Accept: */*", ["Authorization", "Bearer DUMMY_PAIR_SECRET"], ["Accept", "text/plain"], { name: "X-Api-Key", value: "DUMMY_NAMED_SECRET" }, { name: "Accept", value: "text/plain" }],
    });
    noLeaks(redacted);
    expect(redacted.headers).toEqual({ Authorization: "<redacted>", "X-Api-Key": "<redacted>", "api-key": "<redacted>", "Proxy-Authorization": "<redacted>", Cookie: "<redacted>", "Content-Type": "application/json", Accept: "*/*" });
    expect(redacted.extraHeaders).toEqual(["Authorization: <redacted>", "x-api-key=<redacted>", "Accept: */*", ["Authorization", "<redacted>"], ["Accept", "text/plain"], { name: "X-Api-Key", value: "<redacted>" }, { name: "Accept", value: "text/plain" }]);
  });

  test("redacts a field whose name ends in key, token, secret or password, in any case, at any depth, and keeps the fields that only contain one", () => {
    const redacted = redactConfig({
      access_token: "DUMMY_OAUTH_SECRET",
      oauth: { clientSecret: "DUMMY_OAUTH_SECRET", client_secret: "DUMMY_OAUTH_SECRET", refreshToken: "DUMMY_OAUTH_SECRET", dbPassword: "DUMMY_OAUTH_SECRET", "X-API-KEY": "DUMMY_OAUTH_SECRET", scope: "read", tokenizer: "t", maxTokens: 5, max_tokens: 6, keyboard: "us", password_hint: "pet" },
      list: [{ apiKey: "DUMMY_OAUTH_SECRET" }, [{ secret: { inner: "DUMMY_OAUTH_SECRET" } }]],
    });
    noLeaks(redacted);
    expect(redacted.access_token).toBe("<redacted>");
    expect(redacted.oauth).toEqual({ clientSecret: "<redacted>", client_secret: "<redacted>", refreshToken: "<redacted>", dbPassword: "<redacted>", "X-API-KEY": "<redacted>", scope: "read", tokenizer: "t", maxTokens: 5, max_tokens: 6, keyboard: "us", password_hint: "pet" });
    expect(redacted.list).toEqual([{ apiKey: "<redacted>" }, [{ secret: "<redacted>" }]]);
  });

  test("a config written to a file holds none of the dummy secrets after it is redacted, and the config it was given is unchanged", () => {
    const config = { engines: { m: { endpoint: "https://u:DUMMY_USER_PASSWORD@h.example/v1?api_key=DUMMY_QUERY_SECRET", headers: { Authorization: "Bearer DUMMY_HEADER_SECRET" } } } };
    const before = JSON.stringify(config);
    noLeaks(redactConfig(config));
    expect(JSON.stringify(config)).toBe(before);
    expect(before).toContain("DUMMY_QUERY_SECRET");
  });
});

describe("redactConfig and the credentials a --config-patch can bring in", () => {
  test("redacts the fields auth, bearer, pat and pass, in any spelling, and keeps the fields that only look like them", () => {
    const redacted = redactConfig({
      engines: { m: { auth: "Bearer SYNTH_AUTH", bearer: "SYNTH_BEARER", pat: "SYNTH_PAT", pass: "SYNTH_PASS", Auth: "SYNTH_AUTH", ghPat: "SYNTH_PAT", db_pass: "SYNTH_PASS", "x-auth": "SYNTH_AUTH", bearerToken: "SYNTH_BEARER", MYSQL_PWD: "SYNTH_PWD", passphrase: "SYNTH_PHRASE", "Set-Cookie": "SYNTH_COOKIE", SESSION_COOKIE: "SYNTH_COOKIE" } },
      kept: { author: "a", path: "/p", bypass: true, compat: 1, passes: 3, oauth: "o", patterns: ["x"], authors: "b" },
    });
    expect(JSON.stringify(redacted)).not.toContain("SYNTH_");
    expect(Object.values(redacted.engines.m)).toEqual(Array(13).fill("<redacted>"));
    expect(redacted.kept).toEqual({ author: "a", path: "/p", bypass: true, compat: 1, passes: 3, oauth: "o", patterns: ["x"], authors: "b" });
  });

  test("redacts the word after a credential flag wherever the flag stands in a list of arguments", () => {
    const redacted = redactConfig({
      args: ["serve", "--api-key", "SYNTH_ONE", "--port", "80", "--token", "SYNTH_TWO", "--password", "SYNTH_THREE", "--model", "m"],
      short: ["--api-key", "SYNTH_PAIR"],
      equals: ["serve", "--api-key=SYNTH_EQUALS", "--secret=SYNTH_SECRET"],
      kept: ["--api-key", "$MODEL_API_KEY", "--token", "${OTHER_TOKEN}", "--api-key", "--verbose", "--port", "80", "--keyboard", "us"],
      last: ["serve", "--token"],
      nested: [{ command: ["run", "--bearer", "SYNTH_BEARER", "--pat", "SYNTH_PAT", "--auth", "SYNTH_AUTH", "--pass", "SYNTH_PASS"] }],
    });
    expect(JSON.stringify(redacted)).not.toContain("SYNTH_");
    expect(redacted.args).toEqual(["serve", "--api-key", "<redacted>", "--port", "80", "--token", "<redacted>", "--password", "<redacted>", "--model", "m"]);
    expect(redacted.short).toEqual(["--api-key", "<redacted>"]);
    expect(redacted.equals).toEqual(["serve", "--api-key=<redacted>", "--secret=<redacted>"]);
    expect(redacted.kept).toEqual(["--api-key", "$MODEL_API_KEY", "--token", "${OTHER_TOKEN}", "--api-key", "--verbose", "--port", "80", "--keyboard", "us"]);
    expect(redacted.last).toEqual(["serve", "--token"]);
    expect(redacted.nested[0].command).toEqual(["run", "--bearer", "<redacted>", "--pat", "<redacted>", "--auth", "<redacted>", "--pass", "<redacted>"]);
  });

  test("${NAME} is kept like $NAME, as the value of a field, of a query parameter and of a flag, and a value that only looks like one is redacted", () => {
    expect(redactConfig({ apiKey: "${MODEL_API_KEY}", auth: "${AUTH_VALUE}", headers: { Authorization: "${OTHER_AUTH}" }, endpoint: "https://h.example/v1?api_key=${MODEL_API_KEY}&token=$OTHER" })).toEqual({
      apiKey: "${MODEL_API_KEY}",
      auth: "${AUTH_VALUE}",
      headers: { Authorization: "${OTHER_AUTH}" },
      endpoint: "https://h.example/v1?api_key=${MODEL_API_KEY}&token=$OTHER",
    });
    const odd = redactConfig({ apiKey: "${}", token: "${A-B}", secret: "${NAME", pat: "${NAME}x", pass: "$ {NAME}" });
    expect(odd).toEqual({ apiKey: "<redacted>", token: "<redacted>", secret: "<redacted>", pat: "<redacted>", pass: "<redacted>" });
  });

  test("a config patch with all of these leaves none of its synthetic secrets in what a summary records", () => {
    const patch = { engines: { gw: { endpoint: "https://u:SYNTH_USER@gw.example/v1?pat=SYNTH_QUERY", auth: "Bearer SYNTH_AUTH", bearer: "SYNTH_BEARER", pat: "SYNTH_PAT", pass: "SYNTH_PASS", args: ["--model", "m", "--api-key", "SYNTH_FLAG", "--port", "80"], env: ["PASS=SYNTH_ENV", "OK=1"] } } };
    const text = JSON.stringify(redactConfig(patch));
    expect(text).not.toContain("SYNTH_");
    expect(text).toContain("gw.example/v1?pat=<redacted>");
    expect(text).toContain('"OK=1"');
  });

  test("credentialField is the one rule for a name: config fields, flags and environment variables", () => {
    for (const name of ["apiKey", "api_key", "x-api-key", "--api-key", "accessToken", "client_secret", "password", "MYSQL_PWD", "GPG_PASSPHRASE", "GH_PAT", "SESSION_COOKIE", "Authorization", "auth", "AUTH", "bearer", "pass", "dbPass", "OPENAI_API_KEY", "HF_TOKEN"]) expect([name, credentialField(name)]).toEqual([name, true]);
    for (const name of ["maxTokens", "tokenizer", "author", "path", "bypass", "compat", "passes", "oauth", "model", "DATABASE_URL", "PATH", "HOME", "keyboard", "timeoutMs"]) expect([name, credentialField(name)]).toEqual([name, false]);
  });
});

describe("engineSettings", () => {
  const nulls = { model: null, endpoint: null, endpoint_id: null, temperature: null, enableThinking: null, timeoutMs: null };

  test("reads the engine that defaults.llmEngine names, with its endpoint's host and the digest of its identity: no path, no credentials (#65)", () => {
    const url = "https://user:pw@gateway.example:8443/k-DUMMYSECRET0123/v1/chat/completions?key=abc";
    const config = { engines: { other: { model: "no" }, m: { kind: "llm", model: "the-model", endpoint: url, temperature: 0, enableThinking: false, timeoutMs: 600000 } }, defaults: { llmEngine: "m" } };
    const settings = { model: "the-model", endpoint: "https://gateway.example:8443", endpoint_id: sha256Text("https://gateway.example:8443/k-DUMMYSECRET0123/v1/chat/completions?key=<redacted>"), temperature: 0, enableThinking: false, timeoutMs: 600000 };
    expect(engineSettings(config)).toEqual({ engine: "m", ...settings, engines: { m: settings } });
    expect(JSON.stringify(engineSettings(config))).not.toMatch(/pw|abc|DUMMYSECRET|k-DUMMY|\/v1/);
  });

  test("reads what engineConfig writes", () => {
    const settings = { model: "the-model", endpoint: "http://localhost:8080", endpoint_id: sha256Text("http://localhost:8080/v1/chat/completions"), temperature: null, enableThinking: null, timeoutMs: 600000 };
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
    expect(s.engines.worker).toEqual({ model: "w", endpoint: "https://worker.example", endpoint_id: sha256Text("https://worker.example/deployment-A/v1"), temperature: 0.2, enableThinking: null, timeoutMs: null });
    // another deployment path of the routed engine is another identity, on the same host
    const moved = engineSettings({ ...config, engines: { ...config.engines, worker: { ...config.engines.worker, endpoint: "https://worker.example/deployment-B/v1" } } });
    expect(moved.engines.worker).not.toEqual(s.engines.worker);
    expect(moved.engines.worker?.endpoint).toBe(s.engines.worker?.endpoint);
    expect(moved.engines.worker?.endpoint_id).not.toBe(s.engines.worker?.endpoint_id);
    // the same engines in another order of keys are the same settings
    expect(JSON.stringify(engineSettings({ engines: Object.fromEntries(Object.entries(config.engines).reverse()), improve: config.improve, defaults: config.defaults }))).toBe(JSON.stringify(s));
  });

  test("is null for what the config does not set, or that is not a URL", () => {
    const none = { engine: null, ...nulls, engines: {} };
    expect(engineSettings({})).toEqual(none);
    expect(engineSettings(null)).toEqual(none);
    expect(engineSettings({ defaults: {}, engines: { m: { model: "x" } } })).toEqual(none);
    expect(engineSettings({ defaults: { llmEngine: "gone" }, engines: {} })).toEqual({ ...none, engine: "gone" });
    expect(engineSettings({ defaults: { llmEngine: "m" }, engines: { m: { endpoint: "not a url" } } })).toMatchObject({ endpoint: null, endpoint_id: null });
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

  test("makes the manifest that bakeoff's harness_sha256 makes: path from the root, content digest, sorted (the same digest as in test_bakeoff.py)", () => {
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

describe("endpointIdentity", () => {
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

describe("endpointHost, endpointId and endpointRecord (#65)", () => {
  test("the host has the scheme and port and never a path, a query or credentials", () => {
    expect(endpointHost("https://user:pw@Gateway.Example:8443/k-DUMMYSECRET0123/v1?api_key=abc#f")).toBe("https://gateway.example:8443");
    expect(endpointHost("http://localhost:8080/v1/")).toBe("http://localhost:8080");
    for (const v of [undefined, null, "", "not a url", 7]) expect([endpointHost(v), endpointId(v)]).toEqual([null, null]);
  });

  test("the id is the sha256 of the identity: another deployment path is another id, a change of key alone is not", () => {
    const a = endpointId("https://gateway.example/deployment-A/v1");
    expect(a).toBe(sha256Text("https://gateway.example/deployment-A/v1"));
    expect(a).not.toBe(endpointId("https://gateway.example/deployment-B/v1"));
    expect(endpointId("https://gateway.example/v1?api_key=one")).toBe(endpointId("https://u:p@gateway.example/v1/?api_key=two"));
    expect(endpointRecord("https://gateway.example/deployment-A/v1")).toEqual({ endpoint: "https://gateway.example", endpoint_id: a });
  });

  test("a message names an endpoint by its host and the start of its id, not its path", () => {
    const shown = endpointDisplay(endpointRecord("https://gateway.example/k-DUMMYSECRET0123/v1"));
    expect(shown).toBe(`https://gateway.example (id ${endpointId("https://gateway.example/k-DUMMYSECRET0123/v1")?.slice(0, 12)})`);
    expect(shown).not.toContain("DUMMY");
    expect(endpointDisplay({ endpoint: null, endpoint_id: null })).toBe("unknown host");
  });
});

describe("canonical and withoutEngineSettings", () => {
  test("the same value gives the same text whatever the order of its keys, and the digest follows", () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(sha256Json({ b: 1, a: 2 })).toBe(sha256Json({ a: 2, b: 1 }));
    expect(canonical(undefined)).toBe("null");
  });

  test("leaves out the settings of the model from every engine, and nothing else", () => {
    const config = { semanticSearchMode: "off", engines: { m: { kind: "llm", provider: "openai", model: "x", endpoint: "https://h.example/v1", endpoint_id: "abc", temperature: 0, enableThinking: false, timeoutMs: 5, apiKey: "$K" } } };
    expect(withoutEngineSettings(config)).toEqual({ semanticSearchMode: "off", engines: { m: { kind: "llm", provider: "openai", apiKey: "$K" } } });
  });
});
